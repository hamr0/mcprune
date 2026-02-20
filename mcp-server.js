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
const pruneMode = modeIdx !== -1 ? args[modeIdx + 1] : 'act';

// Track the latest search/navigation context for relevance pruning
let lastContext = '';

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

// Forward stdin (from LLM client) → Playwright MCP child, with interception
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  parentBuffer += chunk;
  processBuffer(parentBuffer, (line) => {
    parentBuffer = parentBuffer.slice(parentBuffer.indexOf(line) + line.length);
    // Remove any leading newlines
    parentBuffer = parentBuffer.replace(/^\n+/, '');

    try {
      const msg = JSON.parse(line);
      if (msg.method === 'tools/call') {
        // ALL tool responses can contain snapshots — intercept them all
        pendingSnapshots.add(msg.id);

        // Track context from user actions for relevance pruning
        const ctx = extractContext(msg);
        if (ctx) {
          lastContext = ctx;
          process.stderr.write(`[mcprune] Context updated: "${lastContext}"\n`);
        }
      }
      // Forward to child as-is
      child.stdin.write(line + '\n');
    } catch {
      // Not valid JSON yet, put it back
      parentBuffer = line + parentBuffer;
    }
  });
});

// Track which request IDs are browser_snapshot calls
const pendingSnapshots = new Set();

// Forward stdout from Playwright MCP child → LLM client, intercepting snapshot responses
child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  childBuffer += chunk;
  processLines(childBuffer, async (line, rest) => {
    childBuffer = rest;

    try {
      const msg = JSON.parse(line);

      // Check if this is a response to a tracked tool call
      if (msg.id !== undefined && pendingSnapshots.has(msg.id)) {
        pendingSnapshots.delete(msg.id);

        // Scan ALL text content for embedded snapshots (browser_type, browser_click, etc. all embed them)
        if (msg.result?.content) {
          for (const item of msg.result.content) {
            if (item.type === 'text' && item.text && looksLikeSnapshot(item.text)) {
              await loadPrune();
              const raw = item.text;
              item.text = processSnapshot(raw, { prune, summarize, mode: pruneMode, context: lastContext });

              process.stderr.write(`[mcprune] Snapshot pruned\n`);
            }
          }
        }
      }

      process.stdout.write(JSON.stringify(msg) + '\n');
    } catch {
      // Not valid JSON, buffer it
      childBuffer = line + (rest || '');
    }
  });
});

/**
 * Process complete newline-delimited lines from a buffer.
 */
function processBuffer(buffer, fn) {
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (line) fn(line);
  }
}

/**
 * Process lines async (for responses that need pruning).
 */
async function processLines(buffer, fn) {
  let idx;
  while ((idx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, idx).trim();
    const rest = buffer.slice(idx + 1);
    if (line) {
      await fn(line, rest);
      return; // After async processing, re-check buffer state
    }
    buffer = rest;
  }
  childBuffer = buffer;
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
