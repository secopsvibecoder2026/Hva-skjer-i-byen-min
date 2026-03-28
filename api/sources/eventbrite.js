/**
 * api/sources/eventbrite.js
 * Henter arrangementer fra Eventbrite Public API
 *
 * Gratis API – opprett konto og hent token på:
 * https://www.eventbrite.com/platform/api
 *
 * Legg til EB_TOKEN i Vercel Environment Variables.
 *
 * Dekker: community-events, kurs, meetups, gratis arrangementer, barne-events
 */

/** Eventbrite kategori-ID → våre interne kategorier */
const EB_CATEGORY_MAP = {
  "103": ["konsert"],           // Music
  "101": ["konsert"],           // Business (ikke ideelt, men inkludert)
  "110": ["familie"],           // Food & Drink
  "113": ["familie"],           // Community & Culture
  "115": ["familie", "barn"],   // Family & Education
  "116": ["gratis"],            // Fashion (skip/gratis)
  "117": ["familie"],           // Film & Media
  "118": ["familie"],           // Hobbies
  "119": ["konsert", "uteliv"], // Performing & Visual Arts
  "199": [],                    // Other
};

/**
 * Henter events fra Eventbrite for en gitt norsk by
 * @param {string} city
 * @returns {Promise<object[]>}
 */
export async function fetchEventbrite(city) {
  const token = process.env.EB_TOKEN;
  if (!token) {
    console.warn("EB_TOKEN ikke satt – hopper over Eventbrite");
    return [];
  }

  const cityName = city.charAt(0).toUpperCase() + city.slice(1);

  const params = new URLSearchParams({
    "location.address":    `${cityName}, Norway`,
    "location.within":     "30km",
    "start_date.range_start": new Date().toISOString().split(".")[0] + "Z",
    "expand":              "venue,ticket_classes,category",
    "sort_by":             "date",
    "page_size":           "50",
  });

  const url = `https://www.eventbriteapi.com/v3/events/search/?${params}`;
  const res  = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Eventbrite API svarte med ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const rawEvents = data?.events ?? [];

  return rawEvents.map(mapEventbriteEvent).filter(Boolean);
}

/**
 * Mapper ett Eventbrite-event til unified format
 */
function mapEventbriteEvent(ev) {
  try {
    // Dato og tid (UTC → lokal er OK siden vi kun viser dato-streng)
    const startIso = ev.start?.local || ev.start?.utc;
    if (!startIso) return null;

    const startDate = new Date(startIso);
    const date = startDate.toLocaleDateString("sv-SE"); // "YYYY-MM-DD"
    const time = startDate.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

    // Sluttid
    let endTime = null;
    if (ev.end?.local) {
      const endDate = new Date(ev.end.local);
      endTime = endDate.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
    }

    // Sted
    const venue    = ev.venue;
    const location = venue
      ? [venue.name, venue.address?.city || "Bergen"].filter(Boolean).join(", ")
      : "Bergen";

    // Kategorier
    const catId     = ev.category_id || "";
    const categories = buildEbCategories(catId, ev.ticket_classes || []);

    // Bilde
    const imageUrl = ev.logo?.url || ev.logo?.original?.url || null;

    // Er det gratis?
    const isFree = ev.is_free || ev.ticket_classes?.some((t) => t.free) || false;
    if (isFree && !categories.includes("gratis")) categories.push("gratis");

    // Affiliate-URL
    const baseUrl      = ev.url || null;
    const affiliateUrl = baseUrl
      ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}ref=hvaSkjerIByenMin`
      : null;

    // Tittel og beskrivelse (kan inneholde HTML – rens den)
    const title       = ev.name?.text || ev.name?.html || "Ukjent arrangement";
    const description = (ev.description?.text || ev.summary || `Arrangement på ${location}`)
      .substring(0, 300); // Maks 300 tegn

    return {
      id:          `eb-${ev.id}`,
      title,
      description,
      date,
      time,
      endTime,
      location,
      categories,
      ticketUrl:   baseUrl,
      affiliateUrl,
      imageUrl,
      imageEmoji:  isFree ? "🆓" : "🎪",
      sponsored:   false,
      featured:    false,
      source:      "eventbrite",
    };
  } catch (err) {
    console.error("Feil ved mapping av Eventbrite-event:", err, ev?.name?.text);
    return null;
  }
}

/** Bygg kategori-array fra Eventbrite kategori-ID og billettinfo */
function buildEbCategories(catId, ticketClasses) {
  const cats = new Set(EB_CATEGORY_MAP[catId] || []);
  if (cats.size === 0) cats.add("familie"); // Standard

  // Sjekk om det er barnerelatert (basert på tittelord ville vært bedre,
  // men vi gjør det enkelt her)
  return [...cats];
}
