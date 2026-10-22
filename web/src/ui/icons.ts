const SVG = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';

export const ICONS = {
  color: `<svg ${SVG}><g stroke="none" opacity=".55">
<path d="M12 12 12 3 A9 9 0 0 1 19.8 7.5Z" fill="#ff7a7a"/><path d="M12 12 19.8 7.5 A9 9 0 0 1 19.8 16.5Z" fill="#ffc46b"/>
<path d="M12 12 19.8 16.5 A9 9 0 0 1 12 21Z" fill="#9be38a"/><path d="M12 12 12 21 A9 9 0 0 1 4.2 16.5Z" fill="#6fd6e8"/>
<path d="M12 12 4.2 16.5 A9 9 0 0 1 4.2 7.5Z" fill="#7f9bff"/><path d="M12 12 4.2 7.5 A9 9 0 0 1 12 3Z" fill="#c78bff"/></g>
<circle cx="12" cy="12" r="9"/><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><circle cx="12" cy="12" r="2.2" class="icon-hole"/></svg>`,
  grid: `<svg ${SVG}><rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9.17 3.5v17M14.83 3.5v17M3.5 9.17h17M3.5 14.83h17"/></svg>`,
  topo: `<svg ${SVG}><path d="M2.5 19C5.5 17.6 8.5 19.6 12 18.2S18 16.6 21.5 18.6"/><path d="M4 14.6C6.6 12.4 9.2 10.6 12 12.6S17 13.8 20 14.2"/><path d="M5.5 10.2C7.6 8.4 9.8 6 12 7.6S16 9.4 18.5 9.8"/><path d="M2.5 19 4 14.6 5.5 10.2M7.3 18.2 8.2 11.7 8.8 8.3M12 18.2V7.6M16.6 17.3 16.1 13.2 15.3 9.1M21.5 18.6 20 14.2 18.5 9.8"/></svg>`,
  info: `<svg ${SVG}><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.6" r=".6" fill="currentColor"/></svg>`,
  back: `<svg ${SVG}><path d="M15 18l-6-6 6-6"/></svg>`,
} as const;
