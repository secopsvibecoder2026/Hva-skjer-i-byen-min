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
  - I dag / I morgen / Denne uken / Neste uke / Senere
- **Fremhevet arrangement** («featured») med stor bildebanner øverst
- **Filtrering** på kategori: Familievennlig, Gratis, Konsert/Uteliv, Barn
- **Live-søk** etter tittel, sted og kategori (debounced)
- **Automatisk datahenting** via GitHub Actions – kjøres daglig kl. 06:00
- **Mobilvennlig** og responsivt design (CSS Grid + media queries)
- **Inntjeningsklart**: Google AdSense-plassholde + affiliate-lenker
- **Ingen backend** nødvendig – alt kjører gratis på GitHub

---

## Arkitektur

```
GitHub Actions (kron daglig kl. 06:00)
  │
  ├── Ticketmaster Discovery API (NO)
  ├── Eventbrite Public API
  └── Web-scraping (visitbergen.com, visitoslo.com, ...)
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

### Dataflyten
1. **Scraper** (`scripts/scrape.mjs`) kaller alle kilder parallelt
2. Resultater slettes og dedupliceres (samme tittel+dato telles ikke dobbelt)
3. JSON lagres i `data/` og commites til `main`-branchen
4. **GitHub Pages** server JSON-filene som statiske filer
5. **Frontend** (`js/app.js`) henter `/data/events-{by}.json` ved sidelasting
6. Faller tilbake til lokal eksempeldata om filen ikke finnes

---

## Prosjektstruktur

```
hva-skjer-i-byen-min/
├── index.html                  # Hoved-HTML
├── css/
│   └── style.css               # Alt design (CSS-variabler, responsivt)
├── js/
│   ├── app.js                  # Frontend-logikk (søk, filtre, rendering)
│   └── events.js               # Lokal eksempeldata (fallback)
├── data/                       # Generert av GitHub Actions
│   ├── events-bergen.json
│   ├── events-oslo.json
│   ├── events-trondheim.json
│   └── events-stavanger.json
├── scripts/
│   └── scrape.mjs              # Standalone scraper-script
├── api/                        # Vercel serverless (fremtidig bruk)
│   ├── events.js               # Aggregator-endepunkt
│   └── sources/
│       ├── ticketmaster.js     # Ticketmaster Discovery API v2
│       ├── eventbrite.js       # Eventbrite Public API
│       └── scrape.js           # Web-scraping av lokale nettsider
├── .github/
│   └── workflows/
│       ├── deploy.yml          # Deploy frontend til GitHub Pages
│       └── scrape.yml          # Daglig datahenting
├── vercel.json                 # Vercel-konfig (for fremtidig API-deploy)
├── package.json
├── .env.example                # Mal for miljøvariabler
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
# Med npx (anbefalt)
npx serve .

# Eller med Python
python3 -m http.server 8080
```

Frontenden bruker lokal eksempeldata som fallback når `data/events-bergen.json` ikke er tilgjengelig.

### Kjør scraperen manuelt

```bash
# Kopier og fyll inn API-nøkler
cp .env.example .env.local

# Rediger .env.local og legg inn TM_API_KEY og EB_TOKEN
# Kjør scraperen
node scripts/scrape.mjs
```

Uten API-nøkler kjøres kun web-scraping av offentlige nettsider.

---

## Deploy til GitHub Pages

### Automatisk (anbefalt)

1. Gå til **Settings → Pages** i GitHub-repoet
2. Under **Source**, velg **GitHub Actions**
3. Klikk **Save**

Siden deployes automatisk ved hvert push til `main`.

### Manuell trigger

**Actions → "Deploy til GitHub Pages" → Run workflow**

---

## Konfigurer scraping

### GitHub Secrets

Go til **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Beskrivelse | Henter her |
|--------|-------------|------------|
| `TM_API_KEY` | Ticketmaster Consumer Key | [developer.ticketmaster.com](https://developer.ticketmaster.com) → My Apps |
| `EB_TOKEN` | Eventbrite Private Token | [eventbrite.com](https://www.eventbrite.com/platform/api) → Account → Developer Links |

Begge API-er er gratis å bruke.

### Manuell kjøring av scraper

**Actions → "Scrape events" → Run workflow**

Scraperen kjøres automatisk kl. 06:00 (UTC+1) hver dag.

### Event-dataformat

Alle datakilder normaliseres til dette formatet:

```json
{
  "id": "tm-12345",
  "title": "Konsert i Bergen",
  "description": "Kort beskrivelse av arrangementet.",
  "date": "2026-04-10",
  "time": "19:00",
  "endTime": "23:00",
  "location": "Grieghallen, Bergen",
  "categories": ["konsert", "uteliv"],
  "ticketUrl": "https://www.ticketmaster.no/...",
  "affiliateUrl": "https://www.ticketmaster.no/...?ref=hvaSkjerIByenMin",
  "imageUrl": "https://s1.ticketm.net/...",
  "imageEmoji": "🎵",
  "sponsored": false,
  "featured": false,
  "source": "ticketmaster"
}
```

**Kategori-IDer:**
| ID | Label | Farge |
|----|-------|-------|
| `familie` | Familievennlig | Grønn |
| `gratis` | Gratis | Lilla |
| `konsert` | Konsert / Uteliv | Rosa |
| `barn` | Barn | Oransje |

---

## Legg til ny by

### 1. Legg til by i scraperen

Åpne `api/sources/scrape.js` og legg til i `CITY_SOURCES`:

```js
kristiansand: [
  {
    url:     "https://www.visitsorlandet.com/hva-skjer/",
    scraper: scrapeGeneric,
    label:   "visitsorlandet.com",
  },
],
```

Åpne `scripts/scrape.mjs` og legg til i `CITIES`:

```js
const CITIES = ["bergen", "oslo", "trondheim", "stavanger", "kristiansand"];
```

### 2. Aktiver by-knappen i frontend

Åpne `index.html` og legg til en knapp i `.city-picker-row`:

```html
<button class="city-pill" data-city="kristiansand">🏞️ Kristiansand</button>
```

Fjern `disabled`-attributtet når data er tilgjengelig.

### 3. Push endringer

```bash
git add .
git commit -m "feat: legg til Kristiansand"
git push origin main
```

Scraperen kjører automatisk ved neste daglige cron, eller trigger manuelt via Actions.

---

## Inntjening

### Google AdSense

1. Registrer deg på [adsense.google.com](https://adsense.google.com)
2. Hent din publisher-ID (`ca-pub-XXXXXXXXXX`)
3. Åpne `index.html` og erstatt kommentarene med ekte AdSense-kode:

```html
<!-- Fjern kommentarene og bytt ut XXXXXXXXXX / YYYYYYYYYY: -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js
  ?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>

<ins class="adsbygoogle"
     data-ad-client="ca-pub-XXXXXXXXXX"
     data-ad-slot="YYYYYYYYYY"
     ...></ins>
```

Det er to annonseplasser klar i HTML-en:
- **Leaderboard** (728×90) under hero
- **Rectangle** (300×250) nederst på siden

### Affiliate-lenker

Alle billettkjøp-lenker har `?ref=hvaSkjerIByenMin` og `rel="sponsored"`. Bytt ut med ditt eget affiliate-ID:

- **Ticketmaster:** [affiliate.ticketmaster.no](https://www.ticketmaster.no/affiliate)
- **Eventbrite:** Kontakt Eventbrite for partneravtale
- **Narvesen/Billettservice:** [billettservice.no](https://www.billettservice.no)

For å legge til et arrangement som sponset oppføring, sett `sponsored: true` og `featured: true` i datasettet.

---

## Teknologier

| Område | Teknologi |
|--------|----------|
| Frontend | Vanilla HTML, CSS, JavaScript (ingen rammeverk) |
| Hosting | GitHub Pages (gratis) |
| Automatisering | GitHub Actions (gratis, 2000 min/mnd) |
| Datakilde | Ticketmaster API, Eventbrite API, web-scraping |
| Scraping | `node-html-parser` (ingen headless browser) |
| Fremtidig API | Vercel serverless functions (klar til deploy) |

---

## Veikart

- [ ] Legg til Oslo, Trondheim og Stavanger med egne scraping-mål
- [ ] Kartvisning (Leaflet.js) med pins per arrangement
- [ ] "Lagre til favoritter" (localStorage)
- [ ] E-post/push-varsler for nye events i valgt kategori
- [ ] Skjema for arrangører til å sende inn eget event
- [ ] Prisfilteret (gratis / under 200 kr / over 200 kr)
- [ ] Aktiver Vercel API for sanntidsdata uten cron-delay

---

## Bidra

Pull requests mottas med takk. For større endringer, åpne gjerne en issue først.

---

*Nettsiden bruker affiliate-lenker. Vi kan motta provisjon ved kjøp via våre lenker.*
