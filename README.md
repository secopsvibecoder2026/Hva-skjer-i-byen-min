# 🏙️ Hva skjer i byen min?

En lokal aktivitetsguide for norske byer – konserter, familieaktiviteter, gratis events og mer, samlet på étt sted.

**Live demo:** [secopsvibecoder2026.github.io/hva-skjer-i-byen-min](https://secopsvibecoder2026.github.io/hva-skjer-i-byen-min/)

---

## Innhold

- [Funksjoner](#funksjoner)
- [Arkitektur](#arkitektur)
- [Prosjektstruktur](#prosjektstruktur)
- [Kom i gang lokalt](#kom-i-gang-lokalt)
- [Deploy til GitHub Pages](#deploy-til-github-pages)
- [Konfigurer scraping](#konfigurer-scraping)
- [Legg til ny by](#legg-til-ny-by)
- [Inntjening](#inntjening)
- [Teknologier](#teknologier)
- [Veikart](#veikart)

---

## Funksjoner

- **Oversiktlig forside** med kommende arrangementer gruppert etter dato
  - I dag · I morgen · Denne uken · Neste uke · Senere
- **Fremhevet arrangement** med stor bildebanner øverst
- **Filtrering** på kategori: Familievennlig, Gratis, Konsert/Uteliv, Barn
- **Live-søk** etter tittel, sted og kategori
- **Automatisk datahenting** via GitHub Actions – kjøres daglig kl. 06:00
- **Mobilvennlig** og responsivt design
- **Inntjeningsklart**: Google AdSense-plassholde + affiliate-lenker
- **Ingen backend** nødvendig – alt kjører gratis på GitHub

---

## Arkitektur

```
GitHub Actions (cron daglig kl. 06:00)
  ├── Ticketmaster Discovery API (NO)
  ├── Eventbrite Public API
  └── Web-scraping (visitbergen.com, visitoslo.com …)
       │
       └── data/events-bergen.json
            data/events-oslo.json
            data/events-trondheim.json
            data/events-stavanger.json
                 │
                 └── GitHub Pages (statisk hosting)
                          │
                          └── Nettleseren henter /data/events-{by}.json
```

---

## Prosjektstruktur

```
hva-skjer-i-byen-min/
├── index.html                      # Hoved-HTML
├── css/
│   └── style.css                   # Design (CSS-variabler, responsivt)
├── js/
│   ├── app.js                      # Frontend-logikk (søk, filtre, rendering)
│   └── events.js                   # Lokal eksempeldata (fallback)
├── data/                           # Generert av GitHub Actions
│   ├── events-bergen.json
│   ├── events-oslo.json
│   ├── events-trondheim.json
│   └── events-stavanger.json
├── scripts/
│   ├── scrape.mjs                  # Kjøres av GitHub Actions
│   └── sources/
│       ├── ticketmaster.js         # Ticketmaster Discovery API v2
│       ├── eventbrite.js           # Eventbrite Public API
│       └── scrape.js               # Web-scraping av lokale nettsider
├── .github/
│   └── workflows/
│       ├── deploy.yml              # Deploy frontend til GitHub Pages
│       └── scrape.yml              # Daglig datahenting
├── package.json
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

Apåne `index.html` direkte i nettleseren, eller bruk en lokal server:

```bash
npx serve .
# eller
python3 -m http.server 8080
```

Frontenden viser lokal eksempeldata automatisk når `data/events-bergen.json` ikke finnes.

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

Scraperen kjører automatisk daglig kl. 06:00 (UTC+1).

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

| ID | Label | Farge |
|----|-------|-------|
| `familie` | Familievennlig | Grønn |
| `gratis` | Gratis | Lilla |
| `konsert` | Konsert / Uteliv | Rosa |
| `barn` | Barn | Oransje |

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
const CITIES = ["bergen", "oslo", "trondheim", "stavanger", "kristiansand"];
```

**3.** `index.html` – legg til by-pill:

```html
<button class="city-pill" data-city="kristiansand">🏞️ Kristiansand</button>
```

**4.** Push til `main` – scraperen kjører automatisk ved neste cron.

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

## Teknologier

| Område | Teknologi |
|--------|----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Hosting | GitHub Pages (gratis) |
| Automatisering | GitHub Actions (gratis, 2000 min/mnd) |
| Datakilde | Ticketmaster API, Eventbrite API, web-scraping |
| Scraping | `node-html-parser` (ingen headless browser) |

---

## Veikart

- [ ] Aktiver Oslo, Trondheim og Stavanger med egne scraping-mål
- [ ] Kartvisning (Leaflet.js) med pins per arrangement
- [ ] "Lagre til favoritter" (localStorage)
- [ ] Skjema for arrangører til å sende inn eget event
- [ ] Prisfilter (gratis / under 200 kr / over 200 kr)
- [ ] E-post-varsler for nye events i valgt kategori

---

*Nettsiden bruker affiliate-lenker og kan motta provisjon ved kjøp via våre lenker.*
