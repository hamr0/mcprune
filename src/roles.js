/**
 * ARIA role taxonomy — borrowed from screen reader navigation modes.
 * These sets drive pruning decisions with zero ML.
 */

/** ARIA landmark roles — define page regions (banner, main, footer, etc.) */
export const LANDMARKS = new Set([
  'banner',
  'main',
  'contentinfo',
  'navigation',
  'complementary',
  'search',
  'form',
  'region',
]);

/** Interactive roles — elements a user/agent can act on */
export const INTERACTIVE = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'checkbox',
  'radio',
  'combobox',
  'listbox',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'slider',
  'spinbutton',
  'switch',
  'tab',
  'treeitem',
]);

/** Group roles — containers that give meaning to interactive children */
export const GROUPS = new Set([
  'radiogroup',
  'tablist',
  'menu',
  'menubar',
  'toolbar',
  'listbox',
  'tree',
  'treegrid',
  'grid',
]);

/** Structural roles — wrappers with no semantic value for agents */
export const STRUCTURAL = new Set([
  'generic',
  'group',
  'list',
  'table',
  'row',
  'rowgroup',
  'cell',
  'directory',
  'document',
  'application',
  'presentation',
  'none',
  'separator',
]);

/** Which landmarks to keep per pruning mode */
export const MODE_REGIONS = {
  act:      new Set(['main']),
  browse:   new Set(['main']),
  navigate: new Set(['main', 'banner', 'navigation', 'search']),
  full:     new Set(['main', 'banner', 'navigation', 'contentinfo', 'complementary', 'search']),
};
