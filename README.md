# 🏙️ Hva skjer i byen min?

En lokal aktivitetsguide for norske byer – konserter, familieaktiviteter, gratis events og mer, samlet på étt sted.

**Live demo:** [secopsvibecoder2026.github.io/hva-skjer-i-byen-min](https://secopsvibecoder2026.github.io/hva-skjer-i-byen-min/) · **Domene:** [ibyenmin.no](https://ibyenmin.no) *(under oppsett)*

---

## Innhold

- [Funksjoner](#funksjoner)
- [Arkitektur](#arkitektur)
- [SEO-strategi](#seo-strategi)
- [Prosjektstruktur](#prosjektstruktur)
- [Kom i gang lokalt](#kom-i-gang-lokalt)
- [Deploy til GitHub Pages](#deploy-til-github-pages)
- [Konfigurer scraping](#konfigurer-scraping)
- [Datahåndtering](#datahåndtering)
- [Legg til ny by](#legg-til-ny-by)
- [Inntjening](#inntjening)
- [Personvern og GDPR](#personvern-og-gdpr)
- [Teknologier](#teknologier)
- [Veikart](#veikart)

---

## Funksjoner

- **Oversiktlig forside** med kommende arrangementer gruppert etter dato
  - I dag · I morgen · Denne uken · Neste uke · Senere
- **Fremhevet arrangement** med stor bildebanner øverst
- **Filtrering** på kategori: Familievennlig, Gratis, Konsert/Uteliv, Barn
- **Live-søk** etter tittel, sted og kategori
- **Byer (22 stk):** Bergen, Oslo, Trondheim, Stavanger, Eidsvoll, Lillestrøm, Aurskog-Høland, Kristiansand, Tromsø, Drammen, Fredrikstad, Ålesund, Bodø, Hamar, Tønsberg, Moss, Haugesund, Sandefjord, Arendal, Molde, Voss, Kongsberg
- **SEO-optimaliserte undersider** per by – `ibyenmin.no/bergen/`, `ibyenmin.no/oslo/` osv.
- **sitemap.xml** og **robots.txt** for Google-indeksering
- **Geo-deteksjon:** «Finn meg»-knapp velger nærmeste by automatisk via GPS
- **Automatisk datahenting** via GitHub Actions – kjøres daglig kl. 06:00
- **Utløpte events slettes automatisk** ved hver kjøring
- **Mobilvennlig** og responsivt design
- **Inntjeningsklart**: Google AdSense-plassholde + affiliate-lenker
- **Ingen backend** nødvendig – alt kjører gratis på GitHub

---

## Arkitektur

```
GitHub Actions (cron daglig kl. 06:00 Oslo-tid)
  ├── Ticketmaster Discovery API (NO)   ← krever TM_API_KEY
  ├── Eventbrite Public API             ← krever EB_TOKEN
  └── Web-scraping (visitbergen.com, visitoslo.com …)
       │
       ├── data/events-bergen.json      ← oppdateres daglig
       ├── data/events-oslo.json
       ├── data/events-{by}.json  (22 stk)
       │
       └── scripts/generate-city-pages.mjs
                │
                ├── bergen/index.html   ← SEO-side per by
                ├── oslo/index.html
                ├── {by}/index.html  (22 stk)
                ├── sitemap.xml
                └── robots.txt
                         │
                         └── GitHub Pages (statisk hosting)
                                  ├── ibyenmin.no/          (forside)
                                  ├── ibyenmin.no/bergen/   (by-side)
                                  └── ibyenmin.no/{by}/  (22 stk)
```

**Uten API-nøkler** kjøres kun web-scraping. Hvis alle kilder returnerer 0 events
(f.eks. ved midlertidig nettverksfeil), beholdes eksisterende fil – men utløpte
events ryddes alltid.

---

## SEO-strategi

Alle 22 byer har egne statiske sider med unike meta-tags som Google kan indeksere:

| URL | Tittel (eksempel) |
|-----|-------------------|
| `ibyenmin.no/` | Hva skjer i byen din? |
| `ibyenmin.no/bergen/` | Hva skjer i Bergen? Arrangementer og konserter 2026 |
| `ibyenmin.no/oslo/` | Hva skjer i Oslo? Arrangementer og konserter 2026 |
| `ibyenmin.no/{by}/` | … (22 sider totalt) |

Hver by-side inneholder:
- `<title>` og `<meta description>` med by-navn og år
- `<link rel="canonical">` – forteller Google hvilken URL som er primær
- `<meta property="og:url">` – riktig URL i sosiale medier
- **JSON-LD strukturdata** (WebPage + BreadcrumbList) – gir Google rik kontekst
- **Breadcrumb**: Hjem → Bynavn

`sitemap.xml` med alle 23 sider sendes til Google Search Console.
By-sidene regenereres automatisk etter hver daglige datahenting.

### Send sitemap til Google

1. Gå til [Google Search Console](https://search.google.com/search-console)
2. Legg til domenet `ibyenmin.no`
3. Gå til **Sitemaps** og send inn `https://ibyenmin.no/sitemap.xml`

---

## Prosjektstruktur

```
hva-skjer-i-byen-min/
├── index.html                      # Forside (ingen by forhåndsvalgt)
├── {by}/                           # Genererte by-sider (22 stk)
│   └── index.html                  #   f.eks. bergen/index.html
├── sitemap.xml                     # Google-sitemap (genereres daglig)
├── robots.txt                      # Forteller søkemotorer om sitemap
├── css/
│   └── style.css                   # Design (CSS-variabler, responsivt)
├── js/
│   ├── app.js                      # Frontend-logikk (søk, filtre, geo, rendering)
│   └── events.js                   # Lokal eksempeldata (fallback)
├── data/                           # Oppdateres daglig av GitHub Actions
│   ├── events-bergen.json
│   ├── events-oslo.json
│   └── events-{by}.json  (22 stk)
├── scripts/
│   ├── scrape.mjs                  # Henter event-data (kjøres av GitHub Actions)
│   ├── generate-city-pages.mjs     # Genererer by-sider og sitemap (kjøres etter scraping)
│   └── sources/
│       ├── ticketmaster.js         # Ticketmaster Discovery API v2
│       ├── eventbrite.js           # Eventbrite Public API
│       └── scrape.js               # Web-scraping av lokale nettsider
├── .github/
│   └── workflows/
│       ├── deploy.yml              # Deploy frontend til GitHub Pages
│       └── scrape.yml              # Daglig datahenting + sidegenerering (cron 06:00)
├── package.json
├── package-lock.json
├── .env.example                    # Mal for lokale miljøvariabler
└── .gitignore
```

---

## Kom i gang lokalt

### Krav
- Node.js 20+
- Git

### Installasjon

```bash
git clone https://github.com/secopsvibecoder2026/hva-skjer-i-byen-min.git
cd hva-skjer-i-byen-min
npm install
```

### Kjør frontend

Åpne `index.html` direkte i nettleseren, eller bruk en lokal server:

```bash
npx serve .
# eller
python3 -m http.server 8080
```

Frontenden viser lokal eksempeldata automatisk når `data/events-{by}.json` ikke finnes.

### Kjør scraperen manuelt

```bash
cp .env.example .env.local
# Fyll inn TM_API_KEY og EB_TOKEN i .env.local

npm run scrape
# eller direkte:
node scripts/scrape.mjs
```

Uten API-nøkler kjøres kun web-scraping av offentlige nettsider.

---

## Deploy til GitHub Pages

1. Gå til **Settings → Pages** i GitHub-repoet
2. Under **Source**, velg **GitHub Actions**
3. Klikk **Save**

Siden deployes automatisk ved hvert push til `main`.

**Manuell trigger:** Actions → «Deploy til GitHub Pages» → Run workflow

---

## Konfigurer scraping

### GitHub Secrets

Gå til **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Beskrivelse | Henter her |
|--------|-------------|------------|
| `TM_API_KEY` | Ticketmaster Consumer Key | [developer.ticketmaster.com](https://developer.ticketmaster.com) → My Apps |
| `EB_TOKEN` | Eventbrite Private Token | [eventbrite.com](https://www.eventbrite.com/platform/api) → Account → Developer Links |

Begge API-er er gratis. Siden fungerer også uten nøkler – da brukes kun web-scraping.

**Manuell trigger av scraper:** Actions → «Scrape events» → Run workflow

Scraperen kjører automatisk daglig kl. 06:00 (Oslo-tid).

### Event-dataformat

Alle datakilder normaliseres til dette formatet:

```json
{
  "id": "tm-12345",
  "title": "Konsert i Bergen",
  "description": "Kort beskrivelse.",
  "date": "2026-04-10",
  "time": "19:00",
  "endTime": "23:00",
  "location": "Grieghallen, Bergen",
  "categories": ["konsert", "uteliv"],
  "ticketUrl": "https://www.ticketmaster.no/...",
  "affiliateUrl": "https://www.ticketmaster.no/...?ref=hvaSkjerIByenMin",
  "imageUrl": "https://...",
  "imageEmoji": "🎵",
  "sponsored": false,
  "featured": false,
  "source": "ticketmaster"
}
```

**Kategorier:**

| ID | Label | Ikon |
|----|-------|------|
| `familie` | Familievennlig | 👨‍👩‍👧‍👦 |
| `gratis` | Gratis | 🆓 |
| `konsert` | Konsert / Uteliv | 🎵 |
| `barn` | Barn | 🧒 |

---

## Datahåndtering

### Daglig oppdatering

GitHub Actions kjører `scripts/scrape.mjs` kl. 06:00 hver dag (UTC+1/+2).
Scraperen henter data fra Ticketmaster, Eventbrite og norske nettsider,
og overskriver `data/events-{by}.json` for alle fem byer.

### Utløpte events

Events med `date < i dag` filtreres **alltid** bort – enten ved full scraping
eller ved rydding av eksisterende fil. Ingenting vises etter at det har gått ut.

### Beskyttelse mot tom fil

Hvis alle datakilder returnerer 0 events (nettverksfeil, manglende API-nøkler),
**beholder scraperen eksisterende fil** og fjerner kun utløpte events fra den.
Dette forhindrer at brukere ser en tom side ved midlertidige feil.

### Seed-data

Alle 22 byer har forhåndslagrede seed-events i `data/`-mappen.
Disse vises til GitHub Actions-scraperen kjører for første gang og
erstatter dem med ekte data.

### Generering av by-sider

Etter scraping kjøres `scripts/generate-city-pages.mjs` automatisk.
Den leser `index.html` som mal og genererer `{by}/index.html` for alle 22 byer
med by-spesifikke SEO-tags, JSON-LD og konfigurasjonsvariabler.
Oppdatert `sitemap.xml` og `robots.txt` genereres samtidig.

For å generere by-sider manuelt:

```bash
node scripts/generate-city-pages.mjs
```

---

## Legg til ny by

**1.** `scripts/sources/scrape.js` – legg til i `CITY_SOURCES`:

```js
kristiansand: [
  {
    url:     "https://www.visitsorlandet.com/hva-skjer/",
    scraper: scrapeGeneric,
    label:   "visitsorlandet.com",
  },
],
```

**2.** `scripts/scrape.mjs` – legg til i `CITIES`:

```js
const CITIES = ["bergen", "oslo", "trondheim", "stavanger", "eidsvoll", "lillestrom", "aurskog-holand", "kristiansand"];
```

**3.** `index.html` – legg til by-pill med GPS-koordinater:

```html
<button class="city-pill" data-city="kristiansand" data-lat="58.1599" data-lon="8.0182">
  🏞️ Kristiansand
</button>
```

**4.** `scripts/generate-city-pages.mjs` – legg til i `CITIES`-listen:

```js
{ id: "kristiansand", name: "Kristiansand", emoji: "🌊", region: "Agder" },
```

**5.** Opprett `data/events-kristiansand.json` med seed-data (se eksisterende filer).

**6.** Generer by-sider lokalt og verifiser:

```bash
node scripts/generate-city-pages.mjs
# → kristiansand/index.html generert
```

**7.** Push til `main` – scraperen og sidegeneratoren kjører automatisk ved neste cron.

---

## Inntjening

### Google AdSense

To annonseplasser er klar i `index.html`:
- **Leaderboard** (728×90) – under hero
- **Rectangle** (300×250) – nederst på siden

1. Registrer deg på [adsense.google.com](https://adsense.google.com)
2. Hent publisher-ID (`ca-pub-XXXXXXXXXX`)
3. Fjern kommentarene i `index.html` og bytt ut placeholder-IDene

### Affiliate-lenker

Alle billettkjøp-lenker har `?ref=hvaSkjerIByenMin` og `rel="sponsored"`.
Bytt ut med ditt eget affiliate-ID hos:

- **Ticketmaster:** [ticketmaster.no/affiliate](https://www.ticketmaster.no/affiliate)
- **Eventbrite:** Kontakt Eventbrite for partneravtale
- **Narvesen/Billettservice:** [billettservice.no](https://www.billettservice.no)

For sponsede oppføringer: sett `"sponsored": true` og `"featured": true` i `data/events-{by}.json`.

---

## Personvern og GDPR

- **Ingen cookies** settes av nettsiden selv
- **Geo-deteksjon:** Brukerens GPS-posisjon hentes kun lokalt i nettleseren for å finne
  nærmeste by. Posisjonen sendes ikke til noen server og lagres ikke
- **Affiliate-lenker** kan inneholde sporingskoder fra billettleverandørene –
  dette er opplyst i footeren og i personvernerklæringen på siden
- Personverninformasjon vises automatisk første gang «Finn meg»-knappen brukes

---

## Teknologier

| Område | Teknologi |
|--------|----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Hosting | GitHub Pages (gratis) |
| Automatisering | GitHub Actions (gratis, 2000 min/mnd) |
| Datakilde | Ticketmaster API, Eventbrite API, web-scraping |
| Scraping | `node-html-parser` (ingen headless browser) |
| Geo-deteksjon | Browser Geolocation API + Haversine-distanse |

---

## Veikart

- [x] SEO-optimaliserte undersider per by (`ibyenmin.no/bergen/` osv.)
- [x] sitemap.xml og robots.txt for Google-indeksering
- [x] 22 norske byer med daglig datahenting
- [x] Eget domene `ibyenmin.no` med HTTPS
- [x] Ticketmaster API-nøkkel aktivert (`TM_API_KEY` satt som GitHub Secret)
- [x] Google Analytics 4 (G-FSLFBLRW2C)
- [x] Google AdSense Auto Ads aktivert
- [x] Fullstendig personvernerklæring (GDPR)
- [x] Multi-by-valg på forsiden
- [ ] Send inn sitemap til Google Search Console
- [ ] Vent på Google AdSense-godkjenning
- [ ] Ukentlig e-post / varsel «Hva skjer i helgen?» (Mailchimp)
- [ ] Kartvisning (Leaflet.js) med pins per arrangement
- [ ] «Lagre til favoritter» (localStorage)
- [ ] Skjema for arrangører til å sende inn eget event
- [ ] Prisfilter (gratis / under 200 kr / over 200 kr)

---

*Nettsiden bruker affiliate-lenker og kan motta provisjon ved kjøp via våre lenker.*
