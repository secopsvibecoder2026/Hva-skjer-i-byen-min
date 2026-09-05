/**
 * scripts/cities.mjs
 *
 * Ett sted for by-metadata. Brukes av scrape.mjs (hvilke byer som hentes)
 * og generate-city-pages.mjs (by-sider, by-piller på forsiden, sitemap).
 *
 * Rekkefølgen her styrer rekkefølgen på by-pillene.
 *
 * Legg til ny by:
 *   1. Legg inn raden her (koordinater fra kart, region = fylke)
 *   2. Legg til kilder i scripts/sources/ticketmaster.js og/eller scrape.js
 *   3. Kjør: node scripts/scrape.mjs && node scripts/generate-city-pages.mjs
 *
 * Byer uten arrangementer skjules automatisk – de får ingen by-pille og
 * havner ikke i sitemap. De dukker opp igjen av seg selv når kildene
 * begynner å levere data.
 */

export const CITIES = [
  { id: "bergen",          name: "Bergen",          emoji: "🏔️",   region: "Vestland",          lat: 60.3913,   lon: 5.3221 },
  { id: "oslo",            name: "Oslo",            emoji: "🏛️",   region: "Oslo",              lat: 59.9139,   lon: 10.7522 },
  { id: "trondheim",       name: "Trondheim",       emoji: "⚓",     region: "Trøndelag",         lat: 63.4305,   lon: 10.3951 },
  { id: "stavanger",       name: "Stavanger",       emoji: "🛢️",   region: "Rogaland",          lat: 58.9700,   lon: 5.7331 },
  { id: "kristiansand",    name: "Kristiansand",    emoji: "🌊",    region: "Agder",             lat: 58.1599,   lon: 8.0182 },
  { id: "tromso",          name: "Tromsø",          emoji: "🦌",    region: "Troms",             lat: 69.6496,   lon: 18.9560 },
  { id: "bodo",            name: "Bodø",            emoji: "✈️",    region: "Nordland",          lat: 67.2827,   lon: 14.3751 },
  { id: "alesund",         name: "Ålesund",         emoji: "🐟",    region: "Møre og Romsdal",   lat: 62.4730,   lon: 6.1549 },
  { id: "molde",           name: "Molde",           emoji: "🌹",    region: "Møre og Romsdal",   lat: 62.7373,   lon: 7.1591 },
  { id: "hamar",           name: "Hamar",           emoji: "🏒",    region: "Innlandet",         lat: 60.7945,   lon: 11.0679 },
  { id: "fredrikstad",     name: "Fredrikstad",     emoji: "🏰",    region: "Viken",             lat: 59.2181,   lon: 10.9298 },
  { id: "drammen",         name: "Drammen",         emoji: "🌉",    region: "Viken",             lat: 59.7440,   lon: 10.2045 },
  { id: "lillestrom",      name: "Lillestrøm",      emoji: "🏙️",   region: "Akershus",          lat: 59.9528,   lon: 11.0514 },
  { id: "tonsberg",        name: "Tønsberg",        emoji: "⛵",     region: "Vestfold",          lat: 59.2673,   lon: 10.4080 },
  { id: "moss",            name: "Moss",            emoji: "🌿",    region: "Viken",             lat: 59.4355,   lon: 10.6580 },
  { id: "sandefjord",      name: "Sandefjord",      emoji: "🐋",    region: "Vestfold",          lat: 59.1291,   lon: 10.2167 },
  { id: "larvik",          name: "Larvik",          emoji: "⚓",     region: "Vestfold",          lat: 59.0561,   lon: 10.0272 },
  { id: "haugesund",       name: "Haugesund",       emoji: "🎸",    region: "Rogaland",          lat: 59.4138,   lon: 5.2676 },
  { id: "arendal",         name: "Arendal",         emoji: "⛵",     region: "Agder",             lat: 58.4615,   lon: 8.7717 },
  { id: "kongsberg",       name: "Kongsberg",       emoji: "⛏️",    region: "Numedal",           lat: 59.6697,   lon: 9.6503 },
  { id: "voss",            name: "Voss",            emoji: "🏔️",   region: "Vestland",          lat: 60.6277,   lon: 6.4168 },
  { id: "eidsvoll",        name: "Eidsvoll",        emoji: "🏘️",   region: "Akershus",          lat: 60.3281,   lon: 11.2530 },
  { id: "aurskog-holand",  name: "Aurskog-Høland",  emoji: "🌲",    region: "Akershus",          lat: 59.9208,   lon: 11.4097 },
];

/** Bare by-IDene, i samme rekkefølge */
export const CITY_IDS = CITIES.map((c) => c.id);
