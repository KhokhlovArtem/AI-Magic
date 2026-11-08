const icons = {
  spark: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M5.6 18.4L18.4 5.6"/>',
  pen: '<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm9-9 4 4M4 16l4 4"/>',
  diamond: '<path d="m12 2 10 10-10 10L2 12 12 2Zm0 5 5 5-5 5-5-5 5-5Z"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
  shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  brain: '<path d="M12 5c-4-5-10 0-7 4-4 2-3 8 1 8 0 4 6 5 6 1V5Zm0 0c4-5 10 0 7 4 4 2 3 8-1 8 0 4-6 5-6 1M8 9l4 3 4-3M7 16l5-4 5 4"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  tools: '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h9v9M6 9v9h9M13 3l5 3-5 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 9-9M17 3h4v4"/>',
  list: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4"/>',
  steps: '<path d="M3 6h7v5h7v7h4M7 3l3 3-3 3M18 15l3 3-3 3"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
