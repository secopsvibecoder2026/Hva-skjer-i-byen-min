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

/* ============================================================
   DATO-HJELPERE
   ============================================================ */

/** Returner "YYYY-MM-DD" for en dato (lokal tid) */
function toDateStr(date) {
  return date.toLocaleDateString("sv-SE");
}

/**
 * Returner datostrenger for kommende helg (lørdag + søndag),
 * ekskludert idag og imorgen (de har egne grupper).
 */
function getWeekendDateStrings() {
  const today = new Date();
  const todayStr    = toDateStr(today);
  const tomorrow    = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);
  const result = [];
  for (let i = 1; i <= 8; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const ds = toDateStr(d);
    if ((d.getDay() === 6 || d.getDay() === 0) && ds !== todayStr && ds !== tomorrowStr) {
      result.push(ds);
    }
    if (result.length === 2) break;
  }
  return result;
}
const WEEKEND_DATES = getWeekendDateStrings();

/**
 * Dato-gruppe-id basert på arrangementets dato
 * @returns {"idag"|"imorgen"|"helgen"|"uke"|"neste"|"senere"}
 */
function getDateGroup(dateStr) {
  const today    = new Date();
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

/** Formaterer dato til norsk tekst */
function formatDate(dateStr, timeStr) {
  const date = new Date(`${dateStr}T${timeStr}`);
  const days   = ["S\u00f8ndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","L\u00f8rdag"];
  const months = ["jan","feb","mar","apr","mai","jun","jul","aug","sep","okt","nov","des"];
  return `${days[date.getDay()]} ${date.getDate()}. ${months[date.getMonth()]} kl. ${timeStr}`;
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

  const dtStart = dt(event.date, event.time);
  let dtEnd;
  if (event.endTime) {
    dtEnd = dt(event.date, event.endTime);
  } else {
    // Standardvarighet: 2 timer
    const endHour = (parseInt(event.time.split(":")[0]) + 2) % 24;
    dtEnd = dt(event.date, `${pad(endHour)}:${event.time.split(":")[1]}`);
  }

  const esc = (s) => (s || "").replace(/[,;\\]/g, "\\$&").replace(/\n/g, "\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ibyenmin.no//Hva skjer i byen min//NO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
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
  } finally {
    document.getElementById("events-container").innerHTML = "";
  }
}

async function fetchMultipleCities(cities) {
  showSkeleton();
  try {
    const results = await Promise.all(cities.map(fetchOneCity));
    const merged  = results.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
    return merged;
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
    const inCategory = event.categories.some((cat) => {
      const label = (CATEGORIES.find((c) => c.id === cat)?.label || cat).toLowerCase();
      return label.includes(q) || cat.includes(q);
    });
    if (!inTitle && !inDesc && !inLocation && !inCategory) return false;
  }

  if (activeFilters.size > 0) {
    const hasAll = [...activeFilters].every((f) => event.categories.includes(f));
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

  const href    = featured.affiliateUrl || featured.ticketUrl || "#";
  const bgStyle = featured.imageUrl
    ? `style="background-image: url('${featured.imageUrl}')"`
    : `style="background: linear-gradient(135deg, #1e3a8a, #7c3aed)"`;

  container.innerHTML = `
    <a href="${href}" class="featured-card" target="${href !== "#" ? "_blank" : "_self"}" rel="noopener sponsored" aria-label="Fremhevet: ${featured.title}">
      <div class="featured-card__bg" ${bgStyle}></div>
      <div class="featured-card__overlay"></div>
      <div class="featured-card__content">
        <div class="featured-card__badge">⭐ Fremhevet arrangement</div>
        <h2 class="featured-card__title">${featured.title}</h2>
        <div class="featured-card__meta">
          <span>📅 ${formatDate(featured.date, featured.time)}</span>
          <span>📍 ${featured.location}</span>
        </div>
        <div class="featured-card__actions">
          ${featured.affiliateUrl || featured.ticketUrl
            ? `<span class="btn btn--primary">🎫 Kj\u00f8p billetter</span>`
            : `<span class="btn btn--outline-white">🆓 Gratis inngang</span>`}
          <span class="btn btn--outline-white">Les mer →</span>
        </div>
      </div>
    </a>`;
}

/* ============================================================
   RENDERING – ARRANGEMENTKORT
   ============================================================ */

function buildEventCard(event) {
  const badges = event.categories
    .map((cat) => `<span class="badge badge--${cat}">${getCategoryLabel(cat)}</span>`)
    .join("");

  const imageSection = event.imageUrl
    ? `<div class="event-card__image">
         <img src="${event.imageUrl}" alt="${event.title}" loading="lazy"
           onerror="this.parentElement.innerHTML='<div class=\'event-card__emoji-fallback\'>${event.imageEmoji}</div>'" />
         ${event.sponsored ? `<div class="sponsored-label">✨ Sponset</div>` : ""}
       </div>`
    : `<div class="event-card__image">
         <div class="event-card__emoji-fallback">${event.imageEmoji}</div>
         ${event.sponsored ? `<div class="sponsored-label">✨ Sponset</div>` : ""}
       </div>`;

  let ticketBtn;
  if (event.affiliateUrl) {
    ticketBtn = `<a href="${event.affiliateUrl}" class="btn btn--primary" target="_blank" rel="noopener sponsored">🎫 Kj\u00f8p billetter</a>`;
  } else if (event.ticketUrl) {
    ticketBtn = `<a href="${event.ticketUrl}" class="btn btn--primary" target="_blank" rel="noopener">🎫 Kj\u00f8p billetter</a>`;
  } else {
    ticketBtn = `<span class="btn btn--free">🆓 Gratis inngang</span>`;
  }

  return `
    <article class="event-card ${event.sponsored ? "event-card--sponsored" : ""}" data-id="${event.id}">
      ${imageSection}
      <div class="event-card__body">
        <h3 class="event-card__title">${event.title}</h3>
        <div class="event-card__meta">
          ${selectedCities.length > 1 && event._city ? `<span class="event-card__city-badge">${event._city.charAt(0).toUpperCase() + event._city.slice(1)}</span>` : ""}
          <span class="meta-item">📅 ${formatDate(event.date, event.time)}</span>
          <span class="meta-item">📍 ${event.location}</span>
        </div>
        <p class="event-card__desc">${event.description}</p>
        <div class="event-card__categories">${badges}</div>
        <div class="event-card__actions">
          ${ticketBtn}
          <button class="btn btn--calendar" data-cal-id="${event.id}" aria-label="Legg til i kalender">📅 Kalender</button>
        </div>
      </div>
    </article>`;
}

/* ============================================================
   RENDERING – DATO-GRUPPERT VISNING
   ============================================================ */

function renderByGroups(events) {
  const container = document.getElementById("events-container");
  const noResults = document.getElementById("no-results");

  const filtered = events
    .filter(eventMatches)
    .sort((a, b) => {
      if (a.sponsored && !b.sponsored) return -1;
      if (!a.sponsored && b.sponsored) return  1;
      return new Date(a.date + "T" + a.time) - new Date(b.date + "T" + b.time);
    });

  document.getElementById("event-count").textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = "";
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
  const free     = events.filter((e) => e.categories.includes("gratis")).length;
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
}

/* ============================================================
   HOVED-RENDER
   ============================================================ */

function renderAll() {
  renderFeatured(allEvents);
  renderByGroups(allEvents);
}

/* ============================================================
   FILTER-KNAPPER
   ============================================================ */

function buildFilters() {
  const container = document.getElementById("filter-buttons");
  container.innerHTML = CATEGORIES.map(
    (cat) => `
    <button class="filter-btn" data-filter="${cat.id}" aria-pressed="false">
      ${cat.icon} ${cat.label}
    </button>`
  ).join("");

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

  document.getElementById("reset-filters").addEventListener("click", () => {
    activeFilters.clear();
    container.querySelectorAll(".filter-btn--active").forEach((b) => {
      b.classList.remove("filter-btn--active");
      b.setAttribute("aria-pressed", "false");
    });
    renderByGroups(allEvents);
  });
}

/* ============================================================
   SØK
   ============================================================ */

function setupSearch() {
  const input    = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value;
      clearBtn.hidden = searchQuery === "";
      renderByGroups(allEvents);
    }, 200);
  });

  clearBtn.addEventListener("click", () => {
    input.value  = "";
    searchQuery  = "";
    clearBtn.hidden = true;
    input.focus();
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
  const pill = document.querySelector(`.city-pill[data-city="${city}"]`);
  if (!pill) return;

  document.querySelectorAll(".city-pill").forEach((p) => p.classList.remove("city-pill--active"));
  pill.classList.add("city-pill--active");

  currentCity = city;
  const cityName = (pill.dataset.label || pill.textContent)
    .trim()
    .replace(/^[^\s]+\s/, "")
    .replace(/\s*\(\d+\)$/, "");

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
  document.querySelectorAll(".city-pill:not([disabled]):not(.city-pill--locate)").forEach((pill) => {
    pill.addEventListener("click", () => {
      const city = pill.dataset.city;

      // By-sider: naviger til annen by som før
      if (window.PRESELECTED_CITY) {
        if (city === window.PRESELECTED_CITY) return;
        window.location.href = `../${city}/`;
        return;
      }

      // Forsiden: toggle multi-valg
      const idx = selectedCities.indexOf(city);
      if (idx === -1) {
        selectedCities.push(city);
        pill.classList.add("city-pill--active");
      } else {
        selectedCities.splice(idx, 1);
        pill.classList.remove("city-pill--active");
      }
      loadSelectedCities();
    });
  });
}

async function loadSelectedCities() {
  if (selectedCities.length === 0) {
    // Ingen by valgt – vis startside
    document.getElementById("start-state").hidden      = false;
    document.getElementById("featured-section").hidden = true;
    document.getElementById("city-content").hidden     = true;
    document.getElementById("hero-stats").hidden       = true;
    document.getElementById("current-city-indicator").hidden = true;
    document.getElementById("hero-title-default").hidden = false;
    document.getElementById("hero-title-city").hidden   = true;
    document.getElementById("sticky-city-bar").hidden   = true;
    currentCity = null;
    return;
  }

  // Vis innhold
  document.getElementById("start-state").hidden      = true;
  document.getElementById("featured-section").hidden = false;
  document.getElementById("city-content").hidden     = false;
  document.getElementById("hero-stats").hidden       = false;

  const cityNames = selectedCities.map((id) => {
    const pill = document.querySelector(`.city-pill[data-city="${id}"]`);
    return (pill?.dataset.label || pill?.textContent || id)
      .trim().replace(/^[^\s]+\s/, "").replace(/\s*\(\d+\)$/, "");
  });

  const displayName = cityNames.length === 1
    ? cityNames[0]
    : cityNames.slice(0, -1).join(", ") + " & " + cityNames.at(-1);

  document.getElementById("current-city-indicator").hidden = false;
  document.getElementById("current-city-label").textContent = displayName.toUpperCase();
  document.getElementById("current-city-name").textContent  = displayName;
  document.getElementById("hero-title-default").hidden = true;
  document.getElementById("hero-title-city").hidden    = false;
  updateStickyBar(displayName);
  currentCity = selectedCities[0];

  allEvents = selectedCities.length === 1
    ? await fetchEvents(selectedCities[0])
    : await fetchMultipleCities(selectedCities);

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

function setupGeolocation() {
  const btn = document.getElementById("locate-btn");
  if (!btn || !navigator.geolocation) { if (btn) btn.hidden = true; return; }

  btn.addEventListener("click", () => {
    btn.disabled    = true;
    btn.textContent = "📍 Finner deg…";
    const notice = document.getElementById("locate-notice");
    if (notice) notice.hidden = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const pills = [...document.querySelectorAll(".city-pill[data-lat]:not([disabled])")];
        if (pills.length === 0) { btn.disabled = false; btn.textContent = "📍 Finn meg"; return; }

        // Beregn avstand til alle byer og sorter
        const sorted = pills
          .map((pill) => ({
            pill,
            dist: distanceKm(latitude, longitude, parseFloat(pill.dataset.lat), parseFloat(pill.dataset.lon)),
          }))
          .sort((a, b) => a.dist - b.dist);

        // Fremhev top 3 nærmeste
        pills.forEach((p) => p.classList.remove("city-pill--nearby"));
        sorted.slice(0, 3).forEach(({ pill }) => pill.classList.add("city-pill--nearby"));

        // Sorter by-pillene i DOM slik at nærmeste vises øverst (etter locate-btn)
        const row = document.querySelector(".city-picker-row");
        const locateBtn = document.getElementById("locate-btn");
        sorted.forEach(({ pill }) => row.appendChild(pill));
        row.insertBefore(locateBtn, row.firstChild);

        btn.disabled    = false;
        btn.textContent = "📍 Finn meg";

        // Naviger til nærmeste by etter kort pause så brukeren ser fremhevingen
        const nearest = sorted[0].pill;
        if (nearest.dataset.city !== window.PRESELECTED_CITY) {
          setTimeout(() => {
            const base = window.PRESELECTED_CITY ? "../" : "./";
            window.location.href = `${base}${nearest.dataset.city}/`;
          }, 1200);
        }
      },
      (err) => {
        btn.disabled    = false;
        btn.textContent = "📍 Finn meg";
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
  buildFilters();
  setupSearch();
  setupCityPicker();
  setupGeolocation();
  setupStickyBar();

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
