/**
 * api/sources/ticketmaster.js
 * Henter arrangementer fra Ticketmaster Discovery API v2
 *
 * Gratis API – registrer deg på: https://developer.ticketmaster.com/
 * Legg til TM_API_KEY i Vercel Environment Variables.
 *
 * API-dokumentasjon: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 *
 * Dekker: konserter, sport, teater, familieshow, festival
 */

/** Mapping fra Ticketmaster segmentNavn → våre interne kategorier */
const TM_SEGMENT_MAP = {
  "Music":           ["konsert"],
  "Sports":          [],
  "Arts & Theatre":  ["familie"],
  "Film":            [],
  "Miscellaneous":   [],
  "Family":          ["familie", "barn"],
};

/** Mapping fra Ticketmaster genre → våre kategorier (utfyller segment) */
const TM_GENRE_MAP = {
  "Classical":       ["konsert", "familie"],
  "Jazz":            ["konsert"],
  "Rock":            ["konsert", "uteliv"],
  "Pop":             ["konsert"],
  "Electronic":      ["konsert", "uteliv"],
  "Hip-Hop/Rap":     ["konsert", "uteliv"],
  "Country":         ["konsert"],
  "Theatre":         ["familie"],
  "Comedy":          ["familie"],
  "Children's Music":["barn", "familie"],
  "Family":          ["familie", "barn"],
};

/**
 * Henter events fra Ticketmaster for en gitt norsk by
 * @param {string} city – F.eks. "bergen", "oslo", "trondheim"
 * @returns {Promise<object[]>} – Unified event-format
 */
export async function fetchTicketmaster(city) {
  const apiKey = process.env.TM_API_KEY;
  if (!apiKey) {
    console.warn("TM_API_KEY ikke satt – hopper over Ticketmaster");
    return [];
  }

  const cityName = city.charAt(0).toUpperCase() + city.slice(1); // "bergen" → "Bergen"

  const params = new URLSearchParams({
    apikey:      apiKey,
    countryCode: "NO",
    city:        cityName,
    size:        "50",                  // Maks 50 per side (bruk pagination for flere)
    sort:        "date,asc",
    startDateTime: new Date().toISOString().split(".")[0] + "Z", // Fra nå
  });

  const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
  const res  = await fetch(url, { next: { revalidate: 3600 } }); // Vercel Next cache

  if (!res.ok) {
    throw new Error(`Ticketmaster API svarte med ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  // Ticketmaster returnerer events under _embedded.events
  const rawEvents = data?._embedded?.events ?? [];

  return rawEvents.map(mapTicketmasterEvent).filter(Boolean);
}

/**
 * Mapper ett Ticketmaster-event til unified format
 */
function mapTicketmasterEvent(ev) {
  try {
    // Dato og tid
    const dateObj = ev.dates?.start;
    const date    = dateObj?.localDate  || null;
    const time    = dateObj?.localTime?.slice(0, 5) || "00:00";

    if (!date) return null; // Hopp over events uten dato

    // Sted
    const venue   = ev._embedded?.venues?.[0];
    const location = venue
      ? [venue.name, venue.city?.name].filter(Boolean).join(", ")
      : "Bergen";

    // Bilde – velg det største tilgjengelige
    const images    = ev.images || [];
    const bestImage = images.find((img) => img.ratio === "16_9" && img.width > 500)
                   || images[0];

    // Kategorier basert på segment og genre
    const segment    = ev.classifications?.[0]?.segment?.name || "";
    const genre      = ev.classifications?.[0]?.genre?.name   || "";
    const categories = buildCategories(segment, genre);

    // Pris – sjekk om det finnes gratisbilletter
    const priceRanges = ev.priceRanges || [];
    const isFreeTM    = priceRanges.some((p) => p.min === 0);
    if (isFreeTM && !categories.includes("gratis")) categories.push("gratis");

    // Affiliate-URL med referral-parameter for inntjening
    const baseUrl      = ev.url || null;
    const affiliateUrl = baseUrl
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}ref=hvaSkjerIByenMin`
      : null;

    return {
      id:          `tm-${ev.id}`,
      title:       ev.name,
      description: ev.info || ev.pleaseNote || `Arrangement på ${location}`,
      date,
      time,
      endTime:     null, // Ticketmaster gir sjelden sluttid
      location,
      categories,
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

/** Bygg kategori-array fra Ticketmaster segment + genre */
function buildCategories(segment, genre) {
  const cats = new Set();
  for (const cat of TM_SEGMENT_MAP[segment] || []) cats.add(cat);
  for (const cat of TM_GENRE_MAP[genre]    || []) cats.add(cat);

  // Standardkategori om ingenting matcher
  if (cats.size === 0) cats.add("konsert");

  return [...cats];
}

/** Enkel emoji basert på segment */
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
