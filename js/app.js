/**
 * app.js
 * Hoved-JavaScript for "Hva skjer i byen min"
 *
 * Flyt:
 *  1. fetchEvents()        – Henter data/events-{city}.json (GitHub Pages statisk fil)
 *  2. buildFilters()       – Genererer kategori-filterknapper
 *  3. setupSearch()        – Søkefelt med debounce
 *  4. renderAll()          – Oppdaterer featured, dato-grupper og stats
 *  5. setupStickyBar()     – Sticky by-indikator ved scroll (IntersectionObserver)
 *  6. loadCityCounts()     – Henter event-antall per by og viser i by-piller
 *
 * JSON-filene genereres daglig av GitHub Actions (scrape.yml)
 * og serves statisk fra GitHub Pages. Ingen backend nødvendig.
 */

/* ============================================================
   TILSTAND
   ============================================================ */
let allEvents      = [];
let activeFilters  = new Set();
let searchQuery    = "";
let currentCity    = null;          // null = ingen by valgt ennå
let selectedCities = [];            // forsiden: array av valgte by-IDer
let loadGen        = 0;             // race condition guard

/* ============================================================
   SIKKERHET – ESCAPING AV EKSTERNE DATA
   ============================================================
   Arrangementsdata kommer fra Ticketmaster og scraping
   av tredjeparts nettsider. Alt slikt innhold MÅ escapes før det
   settes inn med innerHTML, ellers kan en tittel som
   <img src=x onerror=...> kjøre vilkårlig JavaScript på siden.
   ============================================================ */

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escaper tekst for trygg innsetting i HTML (og i attributtverdier) */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Returnerer URL-en kun hvis den er trygg å lenke til / laste.
 * Blokkerer javascript:, data: og andre aktive skjemaer.
 * @returns {string|null}
 */
function safeUrl(url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  return /^(https?:\/\/|\/|\.{1,2}\/)/i.test(trimmed) ? trimmed : null;
}

/* ============================================================
   DATO-HJELPERE
   ============================================================ */

/** Returner "YYYY-MM-DD" for en dato (lokal tid) */
function toDateStr(date) {
  return date.toLocaleDateString("sv-SE");
}

/**
 * Returner datostrenger for førstkommende helg (lørdag + søndag),
 * ekskludert i dag og i morgen (de har egne grupper).
 *
 * Merk: kun DEN kommende helgen returneres. En løkke som bare samler
 * "de to første helgedagene innen 8 dager" ville på en fredag hoppe over
 * lørdag (= i morgen) og i stedet ta med neste ukes lørdag.
 */
function getWeekendDateStrings() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Førstkommende lørdag (0 dager unna hvis i dag er lørdag)
  const saturday = new Date(today);
  saturday.setDate(today.getDate() + ((6 - today.getDay() + 7) % 7));
  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  const todayStr    = toDateStr(today);
  const tomorrowStr = toDateStr(tomorrow);

  return [saturday, sunday]
    .map(toDateStr)
    .filter((ds) => ds !== todayStr && ds !== tomorrowStr);
}
const WEEKEND_DATES = getWeekendDateStrings();

/**
 * Dato-gruppe-id basert på arrangementets dato
 * @returns {"idag"|"imorgen"|"helgen"|"uke"|"neste"|"senere"}
 */
function getDateGroup(dateStr) {
  // Normaliser til midnatt – ellers blir diffDays under 1 for lite senere
  // på dagen, og f.eks. et arrangement om 2 dager havner i "Senere".
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayStr    = toDateStr(today);
  const tomorrowStr = toDateStr(tomorrow);

  const evDate   = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((evDate - today) / 86_400_000);

  if (dateStr === todayStr)              return "idag";
  if (dateStr === tomorrowStr)           return "imorgen";
  if (WEEKEND_DATES.includes(dateStr))   return "helgen";
  if (diffDays >= 2 && diffDays <= 6)    return "uke";
  if (diffDays >= 7 && diffDays <= 13)   return "neste";
  return "senere";
}

const DATE_GROUPS = [
  { id: "idag",    label: "I dag",       icon: "🔴", cssClass: "date-group--idag" },
  { id: "imorgen", label: "I morgen",    icon: "🟣", cssClass: "date-group--imorgen" },
  { id: "helgen",  label: "I helgen",    icon: "🎉", cssClass: "date-group--helgen" },
  { id: "uke",     label: "Denne uken",  icon: "🔵", cssClass: "date-group--uke" },
  { id: "neste",   label: "Neste uke",   icon: "🟢", cssClass: "date-group--neste" },
  { id: "senere",  label: "Senere",      icon: "⚫", cssClass: "date-group--senere" },
];

/**
 * Formaterer dato til norsk tekst.
 * timeStr kan være null – da utelates klokkeslettet helt, i stedet for
 * å oppgi et tidspunkt vi ikke vet.
 */
function formatDate(dateStr, timeStr) {
  const date = new Date(`${dateStr}T${timeStr || "00:00"}`);
  if (isNaN(date)) return dateStr;
  const days   = ["S\u00f8ndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","L\u00f8rdag"];
  const months = ["jan","feb","mar","apr","mai","jun","jul","aug","sep","okt","nov","des"];
  const base   = `${days[date.getDay()]} ${date.getDate()}. ${months[date.getMonth()]}`;
  return timeStr ? `${base} kl. ${timeStr}` : base;
}

/** "fra 450 kr" – tom streng når prisen er ukjent eller null */
function formatPrice(event) {
  if (typeof event.priceFrom !== "number" || event.priceFrom <= 0) return "";
  // Rund ned: "fra" skal være en nedre grense, aldri høyere enn faktisk pris
  const amount = Math.floor(event.priceFrom).toLocaleString("nb-NO");
  const unit   = !event.currency || event.currency === "NOK" ? "kr" : event.currency;
  return `fra ${amount} ${unit}`;
}

/** Returner norsk kategori-label */
function getCategoryLabel(catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat ? `${cat.icon} ${cat.label}` : catId;
}

/* ============================================================
   KALENDER-NEDLASTING (.ics)
   ============================================================ */

/**
 * Genererer og laster ned en .ics-fil for et arrangement.
 * Fungerer med Google Calendar, Apple Calendar og Outlook.
 */
function downloadICS(event) {
  const pad    = (n) => String(n).padStart(2, "0");
  const dt     = (dateStr, timeStr) => {
    const [y, m, d] = dateStr.split("-");
    const [hh, mm]  = timeStr.split(":");
    return `${y}${m}${d}T${hh}${mm}00`;
  };

  // Uten klokkeslett blir det et heldagsarrangement i kalenderen,
  // i stedet for et oppdiktet tidspunkt.
  const allDay = !event.time;
  let dtStartLine, dtEndLine;

  if (allDay) {
    const start = event.date.replace(/-/g, "");
    const next  = new Date(`${event.date}T00:00:00`);
    next.setDate(next.getDate() + 1);
    const end = next.toLocaleDateString("sv-SE").replace(/-/g, "");
    dtStartLine = `DTSTART;VALUE=DATE:${start}`;
    dtEndLine   = `DTEND;VALUE=DATE:${end}`;
  } else {
    let dtEnd;
    if (event.endTime) {
      dtEnd = dt(event.date, event.endTime);
    } else {
      // Standardvarighet: 2 timer
      const endHour = (parseInt(event.time.split(":")[0]) + 2) % 24;
      dtEnd = dt(event.date, `${pad(endHour)}:${event.time.split(":")[1]}`);
    }
    dtStartLine = `DTSTART:${dt(event.date, event.time)}`;
    dtEndLine   = `DTEND:${dtEnd}`;
  }

  const esc = (s) => (s || "").replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ibyenmin.no//Hva skjer i byen min//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    dtStartLine,
    dtEndLine,
    `SUMMARY:${esc(event.title)}`,
    `DESCRIPTION:${esc(event.description)}`,
    `LOCATION:${esc(event.location)}`,
    event.ticketUrl || event.affiliateUrl ? `URL:${event.ticketUrl || event.affiliateUrl}` : "",
    `UID:${event.id}@ibyenmin.no`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");

  const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `${event.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_")}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   DATA-HENTING
   ============================================================ */

/** Vis skeleton-kort mens data hentes */
function showSkeleton() {
  document.getElementById("loading-state").hidden = true;
  document.getElementById("no-results").hidden    = true;
  document.getElementById("events-container").innerHTML = `
    <div class="skeleton-grid">
      ${Array(6).fill(`
        <div class="skeleton-card">
          <div class="skeleton skeleton--image"></div>
          <div class="skeleton-card__body">
            <div class="skeleton skeleton--title"></div>
            <div class="skeleton skeleton--line"></div>
            <div class="skeleton skeleton--line skeleton--line-short"></div>
            <div class="skeleton skeleton--line skeleton--line-short"></div>
          </div>
        </div>`).join("")}
    </div>`;
}

/**
 * Henter arrangementer fra statisk JSON-fil på GitHub Pages.
 * JSON-filene genereres daglig av GitHub Actions (scrape.yml).
 * Faller tilbake til lokal EVENTS-array om filen ikke finnes.
 */
async function fetchOneCity(city) {
  const base = window.DATA_BASE || "./";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${base}data/events-${city}.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const events = Array.isArray(data.events) ? data.events : data;
    return events.map((e) => ({ ...e, _city: city }));
  } catch {
    return city === "bergen" ? EVENTS.map((e) => ({ ...e, _city: city })) : [];
  }
}

async function fetchEvents(city = "bergen") {
  showSkeleton();
  try {
    return await fetchOneCity(city);
  } catch {
    return city === "bergen" ? EVENTS.map((e) => ({ ...e, _city: city })) : [];
  } finally {
    document.getElementById("events-container").innerHTML = "";
  }
}

async function fetchMultipleCities(cities) {
  showSkeleton();
  try {
    const snapshot = [...cities]; // snapshot i tilfelle array muteres
    const results  = await Promise.all(snapshot.map(fetchOneCity));
    return results.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch {
    return [];
  } finally {
    document.getElementById("events-container").innerHTML = "";
  }
}

/* ============================================================
   FILTRERING
   ============================================================ */

function eventMatches(event) {
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    const inTitle    = event.title.toLowerCase().includes(q);
    const inDesc     = (event.description || "").toLowerCase().includes(q);
    const inLocation = (event.location || "").toLowerCase().includes(q);
    const inCategory = (event.categories || []).some((cat) => {
      const label = (CATEGORIES.find((c) => c.id === cat)?.label || cat).toLowerCase();
      return label.includes(q) || cat.includes(q);
    });
    if (!inTitle && !inDesc && !inLocation && !inCategory) return false;
  }

  if (activeFilters.size > 0) {
    const hasAll = [...activeFilters].every((f) => (event.categories || []).includes(f));
    if (!hasAll) return false;
  }

  return true;
}

/* ============================================================
   RENDERING – FEATURED EVENT
   ============================================================ */

function renderFeatured(events) {
  const container = document.getElementById("featured-section");
  if (!container) return;

  const featured =
    events.find((e) => e.featured && e.sponsored) ||
    events.find((e) => e.featured) ||
    events.find((e) => e.sponsored);

  if (!featured) { container.innerHTML = ""; return; }

  const href    = safeUrl(featured.affiliateUrl) || safeUrl(featured.ticketUrl);
  const imgUrl  = safeUrl(featured.imageUrl);
  const featuredPrice = formatPrice(featured);

  container.innerHTML = `
    <a href="${escapeHtml(href || "#")}" class="featured-card" target="${href ? "_blank" : "_self"}" rel="noopener sponsored" aria-label="Fremhevet: ${escapeHtml(featured.title)}">
      <div class="featured-card__bg"></div>
      <div class="featured-card__overlay"></div>
      <div class="featured-card__content">
        <div class="featured-card__badge">⭐ Fremhevet arrangement</div>
        <h2 class="featured-card__title">${escapeHtml(featured.title)}</h2>
        <div class="featured-card__meta">
          <span>📅 ${escapeHtml(formatDate(featured.date, featured.time))}</span>
          <span>📍 ${escapeHtml(featured.location)}</span>
        </div>
        <div class="featured-card__actions">
          ${href
            ? `<span class="btn btn--primary">🎫 Billetter${featuredPrice ? ` <span class="btn__price">${escapeHtml(featuredPrice)}</span>` : ""}</span>`
            : `<span class="btn btn--outline-white">🆓 Gratis inngang</span>`}
          <span class="btn btn--outline-white">Les mer →</span>
        </div>
      </div>
    </a>`;

  // Bakgrunnsbilde settes via DOM-API – aldri via string-interpolasjon i
  // en style-attributt (en URL med apostrof kunne ellers bryte ut av url()).
  const bgEl = container.querySelector(".featured-card__bg");
  if (imgUrl) bgEl.style.backgroundImage = `url("${imgUrl.replace(/["'()\\]/g, "")}")`;
  else        bgEl.style.background      = "linear-gradient(135deg, #1e3a8a, #7c3aed)";
}

/* ============================================================
   RENDERING – ARRANGEMENTKORT
   ============================================================ */

function buildEventCard(event) {
  const badges = (event.categories || [])
    .map((cat) => `<span class="badge badge--${escapeHtml(cat)}">${escapeHtml(getCategoryLabel(cat))}</span>`)
    .join("");

  const imgUrl    = safeUrl(event.imageUrl);
  const emoji     = escapeHtml(event.imageEmoji || "🎪");
  const sponsored = event.sponsored ? `<div class="sponsored-label">✨ Sponset</div>` : "";

  // Ved bildefeil byttes <img> ut med emoji-fallback av en delegert
  // error-lytter (se setupImageFallback) – ingen inline onerror.
  const imageSection = `
    <div class="event-card__image">
      ${imgUrl
        ? `<img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(event.title)}" loading="lazy" data-fallback-emoji="${emoji}" />`
        : `<div class="event-card__emoji-fallback">${emoji}</div>`}
      ${sponsored}
    </div>`;

  const affiliate = safeUrl(event.affiliateUrl);
  const ticket    = safeUrl(event.ticketUrl);

  // Pris er det folk lurer mest på – vis den på knappen når vi vet den
  const price      = formatPrice(event);
  const priceLabel = price
    ? `🎫 Billetter <span class="btn__price">${escapeHtml(price)}</span>`
    : `🎫 Kj\u00f8p billetter`;

  let ticketBtn;
  if (affiliate) {
    ticketBtn = `<a href="${escapeHtml(affiliate)}" class="btn btn--primary" target="_blank" rel="noopener sponsored">${priceLabel}</a>`;
  } else if (ticket) {
    ticketBtn = `<a href="${escapeHtml(ticket)}" class="btn btn--primary" target="_blank" rel="noopener">${priceLabel}</a>`;
  } else {
    ticketBtn = `<span class="btn btn--free">🆓 Gratis inngang</span>`;
  }

  const cityBadge = selectedCities.length > 1 && event._city
    ? `<span class="event-card__city-badge">${escapeHtml(event._city.charAt(0).toUpperCase() + event._city.slice(1))}</span>`
    : "";

  return `
    <article class="event-card ${event.sponsored ? "event-card--sponsored" : ""}" data-id="${escapeHtml(event.id)}">
      ${imageSection}
      <div class="event-card__body">
        <h3 class="event-card__title">${escapeHtml(event.title)}</h3>
        <div class="event-card__meta">
          ${cityBadge}
          <span class="meta-item">📅 ${escapeHtml(formatDate(event.date, event.time))}</span>
          <span class="meta-item">📍 ${escapeHtml(event.location)}</span>
        </div>
        ${event.description ? `<p class="event-card__desc">${escapeHtml(event.description)}</p>` : ""}
        <div class="event-card__categories">${badges}</div>
        <div class="event-card__actions">
          ${ticketBtn}
          <button class="btn btn--calendar" data-cal-id="${escapeHtml(event.id)}" aria-label="Legg til i kalender">📅 Kalender</button>
        </div>
      </div>
    </article>`;
}

/**
 * Delegert fallback for bilder som ikke lastes.
 * error-events bobler ikke, derfor capture-fasen.
 * Bytter kun ut <img> – sponsor-merket beholdes.
 */
function setupImageFallback() {
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallbackEmoji) return;
    const fallback = document.createElement("div");
    fallback.className   = "event-card__emoji-fallback";
    fallback.textContent = img.dataset.fallbackEmoji;
    img.replaceWith(fallback);
  }, true);
}

/* ============================================================
   RENDERING – DATO-GRUPPERT VISNING
   ============================================================ */

/**
 * Nærmeste byer som har arrangementer, basert på by-pillene.
 * Pillene genereres kun for byer med data, så alle forslag har innhold.
 */
function nearestCitiesWithEvents(limit = 3) {
  const meta = window.CITY_META;
  const pills = [...document.querySelectorAll(".city-pill[data-city][data-lat]")]
    .filter((p) => p.dataset.city !== window.PRESELECTED_CITY);

  const cities = pills.map((p) => ({
    id:   p.dataset.city,
    name: p.querySelector(".city-pill__name")?.textContent?.trim() || p.dataset.city,
    lat:  parseFloat(p.dataset.lat),
    lon:  parseFloat(p.dataset.lon),
  }));

  if (!meta || typeof meta.lat !== "number") return cities.slice(0, limit);

  return cities
    .map((c) => ({ ...c, dist: distanceKm(meta.lat, meta.lon, c.lat, c.lon) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}

/**
 * Fyller tom-tilstanden med riktig budskap.
 *
 * Har byen ingen data i det hele tatt, er det ikke brukerens søk som er
 * problemet – da er det feil å be dem "fjerne noen filtre". Vi sier hva
 * som faktisk er tilfelle og peker videre til byer som har noe.
 */
function renderEmptyState(cityHasNoData) {
  const box = document.getElementById("no-results");
  if (!box) return;

  if (!cityHasNoData) {
    box.innerHTML = `
      <div class="no-results__emoji">😕</div>
      <h3>Ingen treff</h3>
      <p>Prøv et annet søkeord eller fjern noen filtre.</p>`;
    return;
  }

  const cityName = window.CITY_META?.name
    || document.getElementById("current-city-name")?.textContent
    || "denne byen";
  const nearby = nearestCitiesWithEvents(3);
  const base   = window.PRESELECTED_CITY ? "../" : "./";

  box.innerHTML = `
    <div class="no-results__emoji">🌱</div>
    <h3>Ingen arrangementer i ${escapeHtml(cityName)} ennå</h3>
    <p>Vi henter inn nye arrangementer hver natt. Sjekk gjerne igjen om noen dager.</p>
    ${nearby.length ? `
      <p class="no-results__suggest">Det skjer ting i nærheten:</p>
      <div class="no-results__cities">
        ${nearby.map((c) => `<a class="no-results__city" href="${base}${encodeURIComponent(c.id)}/">${escapeHtml(c.name)}</a>`).join("")}
      </div>` : ""}`;
}

/**
 * Filtre og resultat-teller gir ingen mening når byen ikke har data –
 * de skjules så siden ikke ser ødelagt ut.
 */
function setCityChromeVisible(visible) {
  const filterSection = document.querySelector(".filter-section");
  const resultsHeader = document.querySelector(".results-header");
  if (filterSection) filterSection.hidden = !visible;
  if (resultsHeader) resultsHeader.hidden = !visible;
}

function renderByGroups(events) {
  const container = document.getElementById("events-container");
  const noResults = document.getElementById("no-results");

  const filtered = events
    .filter(eventMatches)
    .sort((a, b) => {
      if (a.sponsored && !b.sponsored) return -1;
      if (!a.sponsored && b.sponsored) return  1;
      return new Date(`${a.date}T${a.time || "00:00"}`) - new Date(`${b.date}T${b.time || "00:00"}`);
    });

  document.getElementById("event-count").textContent = filtered.length;

  const cityHasNoData = events.length === 0;
  setCityChromeVisible(!cityHasNoData);

  if (filtered.length === 0) {
    container.innerHTML = "";
    renderEmptyState(cityHasNoData);
    noResults.hidden = false;
    return;
  }
  noResults.hidden = true;

  const groups = {};
  for (const event of filtered) {
    const gId = getDateGroup(event.date);
    if (!groups[gId]) groups[gId] = [];
    groups[gId].push(event);
  }

  let html = "";
  for (const group of DATE_GROUPS) {
    const groupEvents = groups[group.id];
    if (!groupEvents || groupEvents.length === 0) continue;

    html += `
      <section class="date-group ${group.cssClass}" aria-label="${group.label}">
        <div class="date-group__header">
          <span class="date-group__label">${group.icon} ${group.label}</span>
          <span class="date-group__count">${groupEvents.length} arrangement${groupEvents.length !== 1 ? "er" : ""}</span>
        </div>
        <div class="date-group__grid" role="list">
          ${groupEvents.map(buildEventCard).join("")}
        </div>
      </section>`;
  }

  container.innerHTML = html;
}

/* ============================================================
   STATISTIKK I HERO
   ============================================================ */

function updateStats(events) {
  const total    = events.length;
  // Gratis = merket gratis, eller laveste billettpris er 0
  const free     = events.filter(
    (e) => (e.categories || []).includes("gratis") || e.priceFrom === 0
  ).length;
  const thisWeek = events.filter((e) => {
    const g = getDateGroup(e.date);
    return g === "idag" || g === "imorgen" || g === "helgen" || g === "uke";
  }).length;

  const statTotal    = document.getElementById("stat-total");
  const statFree     = document.getElementById("stat-free");
  const statThisWeek = document.getElementById("stat-thisweek");

  if (statTotal)    statTotal.textContent    = total;
  if (statFree)     statFree.textContent     = free;
  if (statThisWeek) statThisWeek.textContent = thisWeek;

  // "0 / 0 / 0" får siden til å se ødelagt ut – skjul heller hele blokka
  const statsBox = document.getElementById("hero-stats");
  if (statsBox) statsBox.hidden = total === 0;
}

/* ============================================================
   HOVED-RENDER
   ============================================================ */

function renderAll() {
  buildFilters(allEvents);
  renderFeatured(allEvents);
  renderByGroups(allEvents);
}

/* ============================================================
   FILTER-KNAPPER
   ============================================================ */

/**
 * Bygger filterknapper for kategoriene som faktisk finnes i dataene.
 *
 * Tidligere ble alle kategoriene vist alltid, så en by med seks
 * arrangementer fikk sju knapper der de fleste ga null treff.
 */
function buildFilters(events = []) {
  const container = document.getElementById("filter-buttons");
  if (!container) return;

  const present = new Set(events.flatMap((e) => e.categories || []));

  // Filtre for kategorier som ikke lenger finnes ville låst visningen til null treff
  for (const f of [...activeFilters]) {
    if (!present.has(f)) activeFilters.delete(f);
  }

  const cats = CATEGORIES.filter((c) => present.has(c.id));
  container.innerHTML = cats
    .map((cat) => {
      const active = activeFilters.has(cat.id);
      return `
    <button class="filter-btn${active ? " filter-btn--active" : ""}" data-filter="${escapeHtml(cat.id)}" aria-pressed="${active}">
      ${cat.icon} ${escapeHtml(cat.label)}
    </button>`;
    })
    .join("");

  container.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.dataset.filter;
      if (activeFilters.has(filter)) {
        activeFilters.delete(filter);
        btn.classList.remove("filter-btn--active");
        btn.setAttribute("aria-pressed", "false");
      } else {
        activeFilters.add(filter);
        btn.classList.add("filter-btn--active");
        btn.setAttribute("aria-pressed", "true");
      }
      renderByGroups(allEvents);
    });
  });
}

/** Nullstill-knappen henger på siden, ikke på de genererte knappene */
function setupFilterReset() {
  document.getElementById("reset-filters")?.addEventListener("click", () => {
    activeFilters.clear();
    document.querySelectorAll(".filter-btn--active").forEach((b) => {
      b.classList.remove("filter-btn--active");
      b.setAttribute("aria-pressed", "false");
    });
    renderByGroups(allEvents);
  });
}

/* ============================================================
   SØK
   ============================================================ */

function filterCityPills(query) {
  const q = query.trim().toLowerCase();
  const pills = document.querySelectorAll(".city-pill[data-city]");
  pills.forEach((pill) => {
    const name = (pill.querySelector(".city-pill__name")?.textContent || pill.dataset.city).toLowerCase();
    pill.hidden = q !== "" && !name.includes(q);
  });
}

function setupSearch() {
  const input    = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value;
      clearBtn.hidden = searchQuery === "";
      filterCityPills(searchQuery);
      renderByGroups(allEvents);
    }, 150);
  });

  clearBtn.addEventListener("click", () => {
    input.value  = "";
    searchQuery  = "";
    clearBtn.hidden = true;
    input.focus();
    filterCityPills("");
    renderByGroups(allEvents);
  });
}

/* ============================================================
   BY-VELGER
   ============================================================ */

function updateStickyBar(cityName) {
  const bar    = document.getElementById("sticky-city-bar");
  const nameEl = document.getElementById("sticky-city-name");
  if (!bar || !nameEl) return;
  nameEl.textContent = cityName;
  bar.removeAttribute("hidden");
}

/**
 * Laster innhold for en forhåndsvalgt by (kalles ved sideinnlasting).
 * Navigerer IKKE – brukes kun når PRESELECTED_CITY er satt i HTML.
 */
async function activateCity(city) {
  // Byer uten arrangementer har ingen by-pille, men siden skal fortsatt
  // fungere for den som kommer inn via bokmerke eller søkemotor.
  const pill = document.querySelector(`.city-pill[data-city="${city}"]`);
  if (pill) {
    document.querySelectorAll(".city-pill").forEach((p) => p.classList.remove("city-pill--active"));
    pill.classList.add("city-pill--active");
  }

  currentCity = city;

  const pillName = pill
    ? (pill.dataset.label || pill.textContent).trim().replace(/^[^\s]+\s/, "").replace(/\s*\(\d+\)$/, "")
    : "";
  const cityName = window.CITY_META?.name || pillName || city.charAt(0).toUpperCase() + city.slice(1);

  document.getElementById("current-city-label").textContent = cityName.toUpperCase();
  document.getElementById("current-city-name").textContent  = cityName;
  document.getElementById("current-city-indicator").hidden  = false;
  document.getElementById("hero-title-default").hidden      = true;
  document.getElementById("hero-title-city").hidden         = false;

  document.getElementById("start-state").hidden      = true;
  document.getElementById("featured-section").hidden = false;
  document.getElementById("city-content").hidden     = false;
  document.getElementById("hero-stats").hidden       = false;

  updateStickyBar(cityName);

  allEvents = await fetchEvents(city);
  updateStats(allEvents);
  renderAll();
}

/**
 * By-piller navigerer til /{by}/ – URL oppdateres og city-siden laster.
 * På city-sider navigeres til ../{by}/ (ett nivå opp).
 */
function setupCityPicker() {
  document.querySelectorAll(".city-pill[data-city]").forEach((pill) => {
    pill.addEventListener("click", () => {
      const city = pill.dataset.city;

      // By-sider: naviger til annen by
      if (window.PRESELECTED_CITY) {
        if (city === window.PRESELECTED_CITY) return;
        window.location.href = `../${city}/`;
        return;
      }

      // Forsiden: naviger direkte til by-siden
      window.location.href = `/${city}/`;
    });
  });
}

async function loadSelectedCities() {
  const gen = ++loadGen; // denne forespørselens generasjon

  if (selectedCities.length === 0) {
    document.getElementById("start-state").hidden            = false;
    document.getElementById("featured-section").hidden       = true;
    document.getElementById("city-content").hidden           = true;
    document.getElementById("hero-stats").hidden             = true;
    document.getElementById("current-city-indicator").hidden = true;
    document.getElementById("hero-title-default").hidden     = false;
    document.getElementById("hero-title-city").hidden        = true;
    document.getElementById("sticky-city-bar").hidden        = true;
    currentCity = null;
    return;
  }

  document.getElementById("start-state").hidden      = true;
  document.getElementById("featured-section").hidden = false;
  document.getElementById("city-content").hidden     = false;
  document.getElementById("hero-stats").hidden       = false;

  const cityNames = selectedCities.map((id) => {
    const pill = document.querySelector(`.city-pill[data-city="${id}"]`);
    const raw  = pill?.dataset.label || pill?.textContent || id;
    return raw.trim().replace(/^[^\s]+\s/, "").replace(/\s*\(\d+\)$/, "");
  });

  const displayName = cityNames.length === 1
    ? cityNames[0]
    : cityNames.slice(0, -1).join(", ") + " & " + cityNames[cityNames.length - 1];

  document.getElementById("current-city-indicator").hidden   = false;
  document.getElementById("current-city-label").textContent  = displayName.toUpperCase();
  document.getElementById("current-city-name").textContent   = displayName;
  document.getElementById("hero-title-default").hidden       = true;
  document.getElementById("hero-title-city").hidden          = false;
  updateStickyBar(displayName);
  currentCity = selectedCities[0];

  const events = selectedCities.length === 1
    ? await fetchEvents(selectedCities[0])
    : await fetchMultipleCities(selectedCities);

  if (gen !== loadGen) return; // nyere kall har allerede tatt over

  allEvents = events;
  updateStats(allEvents);
  renderAll();
}

/* ============================================================
   GEOLOKASJON
   ============================================================ */

/** Haversine-avstand i km mellom to koordinater */
function distanceKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Sorterer by-pillene etter avstand fra et punkt og fremhever de 3 nærmeste.
 * @returns {HTMLElement[]} pillene sortert nærmest først
 */
function highlightNearbyCities(lat, lon) {
  const pills = [...document.querySelectorAll(".city-pill[data-lat]:not([disabled])")];
  if (pills.length === 0) return [];

  const sorted = pills
    .map((pill) => ({
      pill,
      dist: distanceKm(lat, lon, parseFloat(pill.dataset.lat), parseFloat(pill.dataset.lon)),
    }))
    .sort((a, b) => a.dist - b.dist)
    .map(({ pill }) => pill);

  pills.forEach((p) => p.classList.remove("city-pill--nearby"));
  sorted.slice(0, 3).forEach((pill) => pill.classList.add("city-pill--nearby"));

  const row = document.querySelector(".city-picker-row");
  if (row) sorted.forEach((pill) => row.appendChild(pill));

  return sorted;
}

function setupGeolocation() {
  const btn = document.getElementById("locate-btn");
  if (!btn || !navigator.geolocation) { if (btn) btn.hidden = true; return; }

  btn.addEventListener("click", () => {
    btn.disabled = true;
    const btnLabel = btn.querySelector("span:last-child");
    if (btnLabel) btnLabel.textContent = "Finner deg…";
    const notice = document.getElementById("locate-notice");
    if (notice) notice.hidden = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const resetLabel = () => {
          btn.disabled = false;
          const label = btn.querySelector("span:last-child");
          if (label) label.textContent = "Finn meg – vis byer nær deg";
        };

        const sorted = highlightNearbyCities(latitude, longitude);
        resetLabel();
        if (sorted.length === 0) return;

        // Naviger til nærmeste by etter kort pause så brukeren ser fremhevingen.
        // Koordinatene sendes med i URL slik at by-siden kan fremheve nabobyer.
        const nearest = sorted[0];
        if (nearest.dataset.city !== window.PRESELECTED_CITY) {
          setTimeout(() => {
            const base = window.PRESELECTED_CITY ? "../" : "./";
            const lat  = latitude.toFixed(5);
            const lon  = longitude.toFixed(5);
            window.location.href = `${base}${nearest.dataset.city}/?lat=${lat}&lon=${lon}`;
          }, 1200);
        }
      },
      (err) => {
        btn.disabled = false;
        const btnLabelErr = btn.querySelector("span:last-child");
        if (btnLabelErr) btnLabelErr.textContent = "Finn meg – vis byer nær deg";
        console.warn("Geolokasjon ikke tilgjengelig:", err.message);
        btn.setAttribute("title", "Kunne ikke hente posisjon – sjekk nettleserinnstillingene");
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/* ============================================================
   STICKY BY-BAR
   ============================================================ */

/**
 * Viser en sticky bar øverst på siden når hero-en er scrollet ut av visningen.
 * Bruker IntersectionObserver – ingen scroll-event-listener.
 */
function setupStickyBar() {
  const bar      = document.getElementById("sticky-city-bar");
  const changeBtn = document.getElementById("sticky-change-city");
  const hero     = document.querySelector(".site-header");
  if (!bar || !hero) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      // Hero er synlig → skjul bar. Hero er scrollet vekk → vis bar (om by er valgt)
      if (entry.isIntersecting) {
        bar.classList.remove("sticky-city-bar--visible");
      } else if (currentCity) {
        bar.classList.add("sticky-city-bar--visible");
      }
    },
    { threshold: 0.1 }
  );
  observer.observe(hero);

  changeBtn?.addEventListener("click", () => {
    hero.scrollIntoView({ behavior: "smooth" });
  });
}

/* ============================================================
   EVENT-TELLER PER BY-PILL
   ============================================================ */

/**
 * Henter event-antall for alle byer i bakgrunnen og viser det på by-pillene.
 * Bruker cache: "force-cache" for å unngå unødvendige nettverksforespørsler.
 */
async function loadCityCounts() {
  const pills = [...document.querySelectorAll(".city-pill[data-city]")];
  const base  = window.DATA_BASE || "./";

  await Promise.allSettled(
    pills.map(async (pill) => {
      const city = pill.dataset.city;
      try {
        const res = await fetch(`${base}data/events-${city}.json`, { cache: "force-cache" });
        if (!res.ok) return;
        const data  = await res.json();
        const count = Array.isArray(data.events) ? data.events.length : (Array.isArray(data) ? data.length : 0);

        // Lagre label uten badge for by-velger-logikken
        if (!pill.dataset.label) pill.dataset.label = pill.textContent.trim();

        // Legg til count-badge (unngå duplikater)
        const existing = pill.querySelector(".city-pill__count");
        if (existing) {
          existing.textContent = count;
        } else if (count > 0) {
          const badge  = document.createElement("span");
          badge.className   = "city-pill__count";
          badge.textContent = count;
          pill.appendChild(badge);
        }
      } catch {
        // Stille feil – count vises ikke for denne byen
      }
    })
  );
}

/* ============================================================
   OPPSTART
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  setupFilterReset();
  setupSearch();
  setupCityPicker();
  setupGeolocation();
  setupStickyBar();
  setupImageFallback();

  // Hvis brukeren kom hit via "Finn meg", fremhev nærliggende byer basert på URL-params
  const urlParams = new URLSearchParams(window.location.search);
  const urlLat = parseFloat(urlParams.get("lat"));
  const urlLon = parseFloat(urlParams.get("lon"));
  if (!isNaN(urlLat) && !isNaN(urlLon)) {
    highlightNearbyCities(urlLat, urlLon);
  }

  // Last by-tall i bakgrunnen
  loadCityCounts();

  // Delegert klikk for .ics-nedlasting
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cal-id]");
    if (!btn) return;
    const event = allEvents.find((ev) => ev.id === btn.dataset.calId);
    if (event) downloadICS(event);
  });

  // By-spesifikke sider: last innhold for forhåndsvalgt by
  if (window.PRESELECTED_CITY) {
    activateCity(window.PRESELECTED_CITY);
  }
});
