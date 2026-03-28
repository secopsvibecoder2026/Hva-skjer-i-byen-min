/**
 * generate-city-pages.mjs
 *
 * Genererer SEO-optimaliserte statiske HTML-sider for hver by.
 * Kjøres etter scraping i GitHub Actions, og lokalt ved endringer.
 *
 * Output:
 *   /bergen/index.html
 *   /oslo/index.html
 *   ... (én per by)
 *   /sitemap.xml
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const CITIES = [
  { id: "bergen",         name: "Bergen",         emoji: "🏔️", region: "Vestland" },
  { id: "oslo",           name: "Oslo",            emoji: "🏛️", region: "Oslo" },
  { id: "trondheim",      name: "Trondheim",       emoji: "⚓",  region: "Trøndelag" },
  { id: "stavanger",      name: "Stavanger",       emoji: "🛢️", region: "Rogaland" },
  { id: "eidsvoll",       name: "Eidsvoll",        emoji: "🏘️", region: "Akershus" },
  { id: "lillestrom",     name: "Lillestrøm",      emoji: "🏙️", region: "Akershus" },
  { id: "aurskog-holand", name: "Aurskog-Høland",  emoji: "🌲", region: "Akershus" },
  { id: "kristiansand",   name: "Kristiansand",    emoji: "🌊", region: "Agder" },
  { id: "tromso",         name: "Tromsø",          emoji: "🦌", region: "Troms" },
  { id: "drammen",        name: "Drammen",         emoji: "🌉", region: "Viken" },
  { id: "fredrikstad",    name: "Fredrikstad",     emoji: "🏰", region: "Viken" },
  { id: "alesund",        name: "Ålesund",         emoji: "🐟", region: "Møre og Romsdal" },
  { id: "bodo",           name: "Bodø",            emoji: "✈️", region: "Nordland" },
  { id: "hamar",          name: "Hamar",           emoji: "🏒", region: "Innlandet" },
  { id: "tonsberg",       name: "Tønsberg",        emoji: "⛵", region: "Vestfold" },
  { id: "moss",           name: "Moss",            emoji: "🌿", region: "Viken" },
  { id: "haugesund",      name: "Haugesund",       emoji: "🎸", region: "Rogaland" },
  { id: "sandefjord",     name: "Sandefjord",      emoji: "🐋", region: "Vestfold" },
  { id: "arendal",        name: "Arendal",         emoji: "⛵", region: "Agder" },
  { id: "molde",          name: "Molde",           emoji: "🌹", region: "Møre og Romsdal" },
  { id: "voss",           name: "Voss",            emoji: "🏔️", region: "Vestland" },
  { id: "kongsberg",      name: "Kongsberg",       emoji: "⛏️", region: "Numedal" },
];

const BASE_URL = "https://ibyenmin.no";
const template = readFileSync(join(ROOT, "index.html"), "utf-8");
const year = new Date().getFullYear();

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
    <meta name="keywords" content="${city.name} arrangementer, konserter ${city.name}, hva skjer i ${city.name}, familieaktiviteter ${city.name}, gratis events ${city.name}, ${city.region}" />
    <link rel="canonical" href="${BASE_URL}/${city.id}/" />

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
    <script>window.PRESELECTED_CITY="${city.id}";window.DATA_BASE="../";</script>
  </head>`
    );
}

/* ------------------------------------------------------------------ */
/* Skriv by-sider                                                      */
/* ------------------------------------------------------------------ */
let generated = 0;
for (const city of CITIES) {
  const dir = join(ROOT, city.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), generateCityHTML(city));
  generated++;
}
console.log(`✓ Genererte ${generated} by-sider`);

/* ------------------------------------------------------------------ */
/* Generer sitemap.xml                                                 */
/* ------------------------------------------------------------------ */
const today = new Date().toISOString().split("T")[0];

const cityUrls = CITIES.map(
  (city) => `
  <url>
    <loc>${BASE_URL}/${city.id}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`
).join("");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE_URL}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>${cityUrls}
</urlset>
`;

writeFileSync(join(ROOT, "sitemap.xml"), sitemap);
console.log("✓ Genererte sitemap.xml");

/* ------------------------------------------------------------------ */
/* Generer robots.txt                                                  */
/* ------------------------------------------------------------------ */
const robots = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
writeFileSync(join(ROOT, "robots.txt"), robots);
console.log("✓ Genererte robots.txt");
