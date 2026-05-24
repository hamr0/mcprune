#!/usr/bin/env node
/**
 * mcprune MCP server — proxy for Playwright MCP with snapshot pruning.
 *
 * Spawns Playwright MCP as a subprocess, forwards all tool calls,
 * and intercepts snapshot responses to run prune() + summarize().
 *
 * Usage:
 *   node mcp-server.js [--headless] [--mode act|browse|navigate|full]
 *
 * MCP config:
 *   { "command": "node", "args": ["/path/to/mcprune/mcp-server.js"] }
 */

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { looksLikeSnapshot, extractContext, processSnapshot } from './src/proxy-utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const args = process.argv.slice(2);
const headless = args.includes('--headless');
const modeIdx = args.indexOf('--mode');
const pruneMode = modeIdx !== -1 ? args[modeIdx + 1] : 'auto';

// Track the latest search/navigation context for relevance pruning
let lastContext = '';
// Track the latest URL for auto mode detection
let lastUrl = '';

// --- Lazy-load prune (ESM) ---
let prune, summarize;
async function loadPrune() {
  if (!prune) {
    const mod = await import('./src/prune.js');
    prune = mod.prune;
    summarize = mod.summarize;
  }
}

// --- Spawn Playwright MCP as subprocess ---
const playwrightArgs = [
  resolve(__dirname, 'node_modules/@playwright/mcp/cli.js'),
  '--browser', 'chromium',
];
if (headless) playwrightArgs.push('--headless');

const child = spawn(process.execPath, playwrightArgs, {
  stdio: ['pipe', 'pipe', 'inherit'],
});

child.on('error', (err) => {
  process.stderr.write(`[mcprune] Failed to spawn Playwright MCP: ${err.message}\n`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.stderr.write(`[mcprune] Playwright MCP exited with code ${code}\n`);
  process.exit(code ?? 1);
});

// --- JSON-RPC message framing ---
// MCP uses newline-delimited JSON over stdio.

let childBuffer = '';
let parentBuffer = '';

// Track which request IDs may carry snapshots in their response.
const pendingSnapshots = new Set();

// Forward stdin (from LLM client) → Playwright MCP child, with interception.
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  parentBuffer += chunk;
  let idx;
  while ((idx = parentBuffer.indexOf('\n')) !== -1) {
    const line = parentBuffer.slice(0, idx).trim();
    parentBuffer = parentBuffer.slice(idx + 1);
    if (line) handleClientLine(line);
  }
});

/**
 * Handle one complete client message and forward it to the child. Interception
 * must never lose a message: a JSON parse failure forwards the line verbatim,
 * and any error in our own tracking logic is logged but the original request is
 * still forwarded.
 */
function handleClientLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    child.stdin.write(line + '\n'); // not JSON we understand — pass through
    return;
  }
  try {
    if (msg.method === 'tools/call') {
      const params = msg.params || {};
      // ALL tool responses can contain snapshots — intercept them all.
      pendingSnapshots.add(msg.id);

      // Track context from user actions for relevance pruning.
      const ctx = extractContext(msg);
      if (ctx) {
        lastContext = ctx;
        process.stderr.write(`[mcprune] Context updated: "${lastContext}"\n`);
      }

      // Track URL for auto mode detection.
      if (params.name === 'browser_navigate' && params.arguments?.url) {
        lastUrl = params.arguments.url;
      }
    }
  } catch (err) {
    process.stderr.write(`[mcprune] interception error (forwarding request anyway): ${err.message}\n`);
  }
  child.stdin.write(line + '\n');
}

// Forward stdout from child → LLM client, pruning snapshots. Pruning is async
// (lazy import), so serialize through a promise chain to preserve message order.
child.stdout.setEncoding('utf8');
let childChain = Promise.resolve();
child.stdout.on('data', (chunk) => {
  childBuffer += chunk;
  childChain = childChain.then(drainChildBuffer);
});

async function drainChildBuffer() {
  let idx;
  while ((idx = childBuffer.indexOf('\n')) !== -1) {
    const line = childBuffer.slice(0, idx).trim();
    childBuffer = childBuffer.slice(idx + 1);
    if (line) await handleChildLine(line);
  }
}

/**
 * Handle one response line from the child. A parse failure passes through
 * verbatim; a pruning failure forwards the ORIGINAL (unpruned) response rather
 * than dropping it, so a malformed or pathological snapshot can never wedge the
 * proxy.
 */
async function handleChildLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(line + '\n');
    return;
  }
  try {
    if (msg.id !== undefined && pendingSnapshots.has(msg.id)) {
      pendingSnapshots.delete(msg.id);
      // Scan ALL text content for embedded snapshots (browser_type, browser_click, etc.).
      if (msg.result?.content) {
        for (const item of msg.result.content) {
          if (item.type === 'text' && item.text && looksLikeSnapshot(item.text)) {
            await loadPrune();
            item.text = processSnapshot(item.text, { prune, summarize, mode: pruneMode, context: lastContext, url: lastUrl });
            process.stderr.write(`[mcprune] Snapshot pruned\n`);
          }
        }
      }
    }
  } catch (err) {
    process.stderr.write(`[mcprune] prune error (forwarding raw snapshot): ${err.message}\n`);
    process.stdout.write(line + '\n'); // forward the untouched original
    return;
  }
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// Clean shutdown
process.on('SIGINT', () => {
  child.kill('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => {
  child.kill('SIGTERM');
  process.exit(0);
});
