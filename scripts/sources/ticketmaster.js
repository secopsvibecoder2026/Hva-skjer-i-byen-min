/**
 * scripts/sources/ticketmaster.js
 * Henter arrangementer fra Ticketmaster Discovery API v2
 *
 * Gratis API – registrer deg på: https://developer.ticketmaster.com/
 * Legg til TM_API_KEY som GitHub Secret (Settings → Secrets → Actions).
 *
 * API-dokumentasjon: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 * Dekker: konserter, sport, teater, familieshow, festival
 */

const TM_SEGMENT_MAP = {
  "Music":           ["konsert"],
  "Sports":          [],
  "Arts & Theatre":  ["familie"],
  "Film":            [],
  "Miscellaneous":   [],
  "Family":          ["familie", "barn"],
};

const TM_GENRE_MAP = {
  "Classical":        ["konsert", "familie"],
  "Jazz":             ["konsert"],
  "Rock":             ["konsert", "uteliv"],
  "Pop":              ["konsert"],
  "Electronic":       ["konsert", "uteliv"],
  "Hip-Hop/Rap":      ["konsert", "uteliv"],
  "Country":          ["konsert"],
  "Theatre":          ["familie"],
  "Comedy":           ["familie"],
  "Children's Music": ["barn", "familie"],
  "Family":           ["familie", "barn"],
};

// Koordinater og radius per by.
// Radius settes lavt for byer nær Oslo/Bergen for å unngå overlappende events.
// Lillestrøm er ~20km fra Oslo – 10km radius hindrer at Oslo-venues dukker opp der.
const CITY_COORDS = {
  //                   latlong                radius (km)
  "bergen":         { ll: "60.3913,5.3221",   r: 20 },
  "oslo":           { ll: "59.9139,10.7522",  r: 20 },
  "trondheim":      { ll: "63.4305,10.3951",  r: 20 },
  "stavanger":      { ll: "58.9700,5.7331",   r: 20 },
  "eidsvoll":       { ll: "60.3268,11.2530",  r: 10 },
  "lillestrom":     { ll: "59.9565,11.0511",  r: 10 },
  "aurskog-holand": { ll: "59.9000,11.4500",  r: 10 },
  "kristiansand":   { ll: "58.1467,7.9956",   r: 20 },
  "tromso":         { ll: "69.6492,18.9553",  r: 20 },
  "drammen":        { ll: "59.7440,10.2045",  r: 15 },
  "fredrikstad":    { ll: "59.2181,10.9298",  r: 15 },
  "alesund":        { ll: "62.4722,6.1549",   r: 20 },
  "bodo":           { ll: "67.2827,14.3751",  r: 20 },
  "hamar":          { ll: "60.7945,11.0679",  r: 15 },
  "tonsberg":       { ll: "59.2672,10.4075",  r: 15 },
  "moss":           { ll: "59.4338,10.6579",  r: 15 },
  "haugesund":      { ll: "59.4134,5.2680",   r: 20 },
  "sandefjord":     { ll: "59.1313,10.2169",  r: 15 },
  "arendal":        { ll: "58.4615,8.7722",   r: 20 },
  "molde":          { ll: "62.7380,7.1591",   r: 20 },
  "voss":           { ll: "60.6282,6.4150",   r: 15 },
  "kongsberg":      { ll: "59.6677,9.6507",   r: 15 },
};

/**
 * Henter events fra Ticketmaster for en gitt norsk by
 * @param {string} city – f.eks. "bergen", "oslo", "trondheim"
 * @returns {Promise<object[]>}
 */
export async function fetchTicketmaster(city) {
  const apiKey = process.env.TM_API_KEY;
  if (!apiKey) {
    console.warn("TM_API_KEY ikke satt – hopper over Ticketmaster");
    return [];
  }

  const cityConf = CITY_COORDS[city];
  if (!cityConf) {
    console.warn(`Ingen koordinater for ${city} – hopper over Ticketmaster`);
    return [];
  }

  const params = new URLSearchParams({
    apikey:        apiKey,
    countryCode:   "NO",
    latlong:       cityConf.ll,
    radius:        String(cityConf.r),
    unit:          "km",
    size:          "50",
    sort:          "date,asc",
    startDateTime: new Date().toISOString().split(".")[0] + "Z",
  });

  const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Ticketmaster API svarte med ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const rawEvents = data?._embedded?.events ?? [];
  return rawEvents.map(mapTicketmasterEvent).filter(Boolean);
}

function mapTicketmasterEvent(ev) {
  try {
    const dateObj  = ev.dates?.start;
    const date     = dateObj?.localDate || null;
    const time     = dateObj?.localTime?.slice(0, 5) || "00:00";
    if (!date) return null;

    const venue    = ev._embedded?.venues?.[0];
    const location = venue
      ? [venue.name, venue.city?.name].filter(Boolean).join(", ")
      : "Bergen";

    const images    = ev.images || [];
    const bestImage = images.find((img) => img.ratio === "16_9" && img.width > 500) || images[0];

    const segment    = ev.classifications?.[0]?.segment?.name || "";
    const genre      = ev.classifications?.[0]?.genre?.name   || "";
    const categories = buildCategories(segment, genre);

    const priceRanges = ev.priceRanges || [];
    if (priceRanges.some((p) => p.min === 0) && !categories.includes("gratis")) {
      categories.push("gratis");
    }

    const baseUrl      = ev.url || null;
    const affiliateUrl = baseUrl
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}ref=hvaSkjerIByenMin`
      : null;

    return {
      id:          `tm-${ev.id}`,
      title:       ev.name,
      description: ev.info || ev.pleaseNote || `Arrangement på ${location}`,
      date, time,
      endTime:     null,
      location, categories,
      ticketUrl:   baseUrl,
      affiliateUrl,
      imageUrl:    bestImage?.url || null,
      imageEmoji:  segmentToEmoji(segment),
      sponsored:   false,
      featured:    false,
      source:      "ticketmaster",
    };
  } catch (err) {
    console.error("Feil ved mapping av Ticketmaster-event:", err, ev?.name);
    return null;
  }
}

function buildCategories(segment, genre) {
  const cats = new Set();
  for (const cat of TM_SEGMENT_MAP[segment] || []) cats.add(cat);
  for (const cat of TM_GENRE_MAP[genre]    || []) cats.add(cat);
  if (cats.size === 0) cats.add("konsert");
  return [...cats];
}

function segmentToEmoji(segment) {
  const map = {
    "Music":          "🎵",
    "Sports":         "⚽",
    "Arts & Theatre": "🎭",
    "Family":         "👨‍👩‍👧‍👦",
    "Film":           "🎬",
  };
  return map[segment] || "🎪";
}
