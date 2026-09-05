/**
 * icons.js
 * Inline SVG-ikoner – erstatter emoji i grensesnittet.
 *
 * Hvorfor ikke emoji: de rendres forskjellig i hvert operativsystem,
 * sitter feil på baselinjen, kan ikke ta farge fra teksten rundt, og
 * gir siden et prototyp-preg. Disse er strøk-baserte, arver farge via
 * currentColor og skalerer med font-størrelsen.
 *
 * Bruk:
 *   icon("calendar")            → <svg class="icon">…</svg>
 *   icon("pin", "icon--sm")     → med ekstra klasse
 *
 * Emoji beholdes ett sted: imageEmoji på arrangementer uten bilde.
 * Der er de innhold, ikke grensesnitt.
 */

const ICON_PATHS = {
  /* — Grensesnitt — */
  search:   '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pin:      '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  ticket:   '<path d="M3 9.5V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.5a2.5 2.5 0 0 0 0 5V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.5a2.5 2.5 0 0 0 0-5Z"/><path d="M14 5v14" stroke-dasharray="2 3"/>',
  close:    '<path d="M18 6 6 18M6 6l12 12"/>',
  arrowUp:  '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  star:     '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9Z"/>',
  sparkle:  '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M18.5 16.5 19 18l1.5.5L19 19l-.5 1.5L18 19l-1.5-.5L18 18Z"/>',
  map:      '<path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"/><path d="M9 4v13M15 6.5v13"/>',
  compass:  '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5.5-5.5 2 2-5.5Z"/>',
  clock:    '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/>',

  /* — Kategorier — */
  familie:  '<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9.5" r="2.3"/><path d="M15 20a4.5 4.5 0 0 1 5.5-4.4"/>',
  gratis:   '<path d="M20.5 12.6 12.9 20a2 2 0 0 1-2.8 0l-6.6-6.6a2 2 0 0 1-.5-1.9l1.4-5.4a2 2 0 0 1 1.9-1.5l5.5-.1a2 2 0 0 1 1.5.6l6.6 6.6a2 2 0 0 1 0 2.9Z"/><circle cx="8.6" cy="8.6" r="1.4"/>',
  konsert:  '<path d="M9 18V6.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  barn:     '<circle cx="12" cy="8" r="4"/><path d="M10.5 7.5h.01M13.5 7.5h.01M10.5 10a2.2 2.2 0 0 0 3 0"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>',
  uteliv:   '<path d="M4.5 4h15l-7.5 8.5L4.5 4Z"/><path d="M12 12.5V20M8 20h8"/>',
  teater:   '<path d="M4 5h16v6.5c0 4-3.6 7-8 7s-8-3-8-7Z"/><path d="M9 10h.01M15 10h.01M9.5 13.5a3.5 3.5 0 0 0 5 0"/>',
  sport:    '<circle cx="12" cy="12" r="9"/><path d="m12 7.5 3.8 2.8-1.5 4.5h-4.6L8.2 10.3Z"/><path d="M12 3v4.5M19.5 9.7l-3.7 2.6M17.2 19.5l-2.9-4.7M6.8 19.5l2.9-4.7M4.5 9.7l3.7 2.6"/>',
};

/** Kategori-id → ikonnavn (faller tilbake til et nøytralt merke) */
const CATEGORY_ICONS = {
  familie: "familie",
  gratis:  "gratis",
  konsert: "konsert",
  barn:    "barn",
  uteliv:  "uteliv",
  teater:  "teater",
  sport:   "sport",
};

/**
 * Returnerer SVG-markup for et ikon.
 * Dekorativt som standard (aria-hidden) – teksten ved siden av bærer meningen.
 */
function icon(name, extraClass = "") {
  const path = ICON_PATHS[name];
  if (!path) return "";
  const cls = extraClass ? `icon ${extraClass}` : "icon";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path}</svg>`;
}

/** Ikon for en kategori-id */
function categoryIcon(catId, extraClass = "") {
  return icon(CATEGORY_ICONS[catId] || "star", extraClass);
}
