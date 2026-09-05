/**
 * generate-city-pages.mjs
 *
 * Genererer SEO-optimaliserte statiske HTML-sider for hver by, by-pillene
 * på forsiden, og sitemap.xml.
 *
 * Kjøres etter scraping i GitHub Actions, og lokalt ved endringer.
 *
 * Byer uten arrangementer behandles annerledes:
 *   - ingen by-pille (ingen lenker til en side som er tom)
 *   - ikke i sitemap
 *   - siden genereres fortsatt, men med noindex, så gamle bokmerker og
 *     eksterne lenker ikke gir 404
 * Alt dette reverseres automatisk så snart byen får data igjen.
 *
 * Output:
 *   /bergen/index.html … (én per by)
 *   index.html (by-pillene mellom BY-PILLER-markørene)
 *   /sitemap.xml
 *   /robots.txt
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { CITIES } from "./cities.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** Antall kommende arrangementer for en by (0 hvis datafilen mangler) */
function eventCount(cityId) {
  try {
    const data = JSON.parse(readFileSync(join(ROOT, "data", `events-${cityId}.json`), "utf-8"));
    return Array.isArray(data.events) ? data.events.length : 0;
  } catch {
    return 0;
  }
}

const cities     = CITIES.map((c) => ({ ...c, count: eventCount(c.id) }));
const withEvents = cities.filter((c) => c.count > 0);
const empty      = cities.filter((c) => c.count === 0);

const BASE_URL = "https://ibyenmin.no";
const year = new Date().getFullYear();

/* ------------------------------------------------------------------ */
/* By-piller – kun byer som faktisk har arrangementer                  */
/* ------------------------------------------------------------------ */
const pillsHtml = withEvents
  .map(
    (c) =>
      `          <button class="city-pill" data-city="${c.id}" data-lat="${c.lat}" data-lon="${c.lon}" style="background-image:url('/img/cities/${c.id}.jpg')"><span class="city-pill__name">${c.name}</span></button>`
  )
  .join("\n");

const rawTemplate = readFileSync(join(ROOT, "index.html"), "utf-8");

const PILL_START = "<!-- BY-PILLER:START";
const PILL_END   = "<!-- BY-PILLER:SLUTT -->";
const startIdx = rawTemplate.indexOf(PILL_START);
const endIdx   = rawTemplate.indexOf(PILL_END);
if (startIdx === -1 || endIdx === -1) {
  throw new Error("Fant ikke BY-PILLER-markørene i index.html – kan ikke generere by-piller");
}

let template =
  rawTemplate.slice(0, startIdx) +
  `${PILL_START} – generert av scripts/generate-city-pages.mjs, ikke rediger for hånd -->
        <div class="city-picker-row" role="group" aria-label="Velg by">
${pillsHtml}
        </div>
        ` +
  rawTemplate.slice(endIdx);

// Startside-teksten skal ikke navngi byer vi ikke har data for
const countStart = template.indexOf("<!-- BY-ANTALL:START -->");
const countEnd   = template.indexOf("<!-- BY-ANTALL:SLUTT -->");
if (countStart !== -1 && countEnd !== -1) {
  const totalEvents = withEvents.reduce((sum, c) => sum + c.count, 0);
  template =
    template.slice(0, countStart) +
    `<!-- BY-ANTALL:START -->Akkurat nå har vi ${totalEvents} arrangementer i ` +
    `${withEvents.length} norske byer – konserter, familieaktiviteter, teater og uteliv.` +
    template.slice(countEnd);
}

// Forsiden får de samme pillene
writeFileSync(join(ROOT, "index.html"), template);
console.log(`✓ Oppdaterte by-piller på forsiden (${withEvents.length} byer med data)`);

/* ------------------------------------------------------------------ */
/* Generer HTML for en enkelt by                                       */
/* ------------------------------------------------------------------ */
function generateCityHTML(city) {
  return template
    // ── SEO-blokk ──────────────────────────────────────────────────
    .replace(
      /<!-- SEO -->[\s\S]*?<!-- Open Graph -->/,
      `<!-- SEO -->
    <title>Hva skjer i ${city.name}? Arrangementer og konserter ${year} | ibyenmin.no</title>
    <meta name="description" content="Finn konserter, familieaktiviteter og gratis arrangementer i ${city.name} ${year}. Oppdatert daglig – din komplette guide til hva som skjer i ${city.name}, ${city.region}." />
    <meta name="keywords" content="${city.name} arrangementer, konserter ${city.name}, hva skjer i ${city.name}, familieaktiviteter ${city.name}, gratis events ${city.name}, ${city.region}" />${
      city.count === 0 ? '\n    <meta name="robots" content="noindex, follow" />' : ""
    }

    <!-- Open Graph -->`
    )
    // ── Open Graph ──────────────────────────────────────────────────
    .replace(
      '<meta property="og:title" content="Hva skjer i byen din?" />',
      `<meta property="og:title" content="Hva skjer i ${city.name}? Arrangementer ${year}" />`
    )
    .replace(
      '<meta property="og:description" content="Din lokale aktivitetsguide – finn arrangementer, konserter og familieaktiviteter i din by." />',
      `<meta property="og:description" content="Finn konserter, familieaktiviteter og gratis arrangementer i ${city.name}. Oppdatert daglig." />`
    )
    .replace(
      '<meta property="og:type" content="website" />',
      `<meta property="og:type" content="website" />\n    <meta property="og:url" content="${BASE_URL}/${city.id}/" />`
    )
    // ── Ressursstier: ./ → ../ ──────────────────────────────────────
    .replace(/href="css\//g, 'href="../css/')
    .replace(/src="js\//g, 'src="../js/')
    // ── Fjern overskrivende DATA_BASE fra body (satt av index.html) ──
    .replace('<script>window.DATA_BASE = "./";</script>', "")
    // ── Canonical: pek på by-siden, ikke forsiden ───────────────────
    //    (index.html har nøyaktig én canonical – den byttes ut her,
    //     slik at siden ikke ender med to konkurrerende canonicals)
    .replace(
      `<link rel="canonical" href="${BASE_URL}/" />`,
      `<link rel="canonical" href="${BASE_URL}/${city.id}/" />`
    )
    // ── JSON-LD + by-konfig ─────────────────────────────────────────
    .replace(
      "</head>",
      `  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Hva skjer i ${city.name}?",
      "description": "Arrangementer, konserter og aktiviteter i ${city.name}, ${city.region}",
      "url": "${BASE_URL}/${city.id}/",
      "breadcrumb": {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Hjem", "item": "${BASE_URL}/" },
          { "@type": "ListItem", "position": 2, "name": "${city.name}", "item": "${BASE_URL}/${city.id}/" }
        ]
      }
    }
    </script>
    <script>window.PRESELECTED_CITY="${city.id}";window.DATA_BASE="../";window.CITY_META=${JSON.stringify({ name: city.name, lat: city.lat, lon: city.lon })};</script>
  </head>`
    );
}

/* ------------------------------------------------------------------ */
/* Skriv by-sider                                                      */
/* ------------------------------------------------------------------ */
for (const city of cities) {
  const dir = join(ROOT, city.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), generateCityHTML(city));
}
console.log(`✓ Genererte ${cities.length} by-sider`);
if (empty.length > 0) {
  console.log(`  ⚠ ${empty.length} uten arrangementer (noindex, skjult fra by-velger og sitemap): ${empty.map((c) => c.id).join(", ")}`);
}

/* ------------------------------------------------------------------ */
/* Generer sitemap.xml                                                 */
/* ------------------------------------------------------------------ */
const today = new Date().toISOString().split("T")[0];

const cityUrls = withEvents.map(
  (city) => `
  <url>
    <loc>${BASE_URL}/${city.id}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
).join("");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${cityUrls}
</urlset>
`;

writeFileSync(join(ROOT, "sitemap.xml"), sitemap);
console.log(`✓ Genererte sitemap.xml (${withEvents.length + 1} URLer)`);

/* ------------------------------------------------------------------ */
/* Generer robots.txt                                                  */
/* ------------------------------------------------------------------ */
const robots = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
writeFileSync(join(ROOT, "robots.txt"), robots);
console.log("✓ Genererte robots.txt");
