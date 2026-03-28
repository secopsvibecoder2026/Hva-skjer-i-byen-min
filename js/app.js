/**
 * app.js
 * Hoved-JavaScript for "Hva skjer i byen min"
 *
 * Flyt:
 *  1. fetchEvents()      – Henter /data/events-{city}.json (GitHub Pages statisk fil)
 *  2. buildFilters()     – Genererer kategori-filterknapper
 *  3. setupSearch()      – Søkefelt med debounce
 *  4. renderAll()        – Oppdaterer featured, dato-grupper og stats
 *
 * JSON-filene genereres daglig av GitHub Actions (scrape.yml)
 * og serves statisk fra GitHub Pages. Ingen backend nødvendig.
 */

/* ============================================================
   TILSTAND
   ============================================================ */
let allEvents    = [];       // Alle innlastede arrangementer
let activeFilters = new Set();
let searchQuery  = "";
let currentCity  = "bergen";

/* ============================================================
   DATO-HJELPERE
   ============================================================ */

/** Returner "YYYY-MM-DD" for en dato (lokal tid) */
function toDateStr(date) {
  return date.toLocaleDateString("sv-SE");
}

/**
 * Dato-gruppe-id basert på arrangementets dato
 * @returns {"idag"|"imorgen"|"uke"|"neste"|"senere"}
 */
function getDateGroup(dateStr) {
  const today    = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const todayStr    = toDateStr(today);
  const tomorrowStr = toDateStr(tomorrow);

  const evDate  = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((evDate - today) / 86_400_000);

  if (dateStr === todayStr)                    return "idag";
  if (dateStr === tomorrowStr)                 return "imorgen";
  if (diffDays >= 2 && diffDays <= 6)          return "uke";
  if (diffDays >= 7 && diffDays <= 13)         return "neste";
  return "senere";
}

const DATE_GROUPS = [
  { id: "idag",    label: "I dag",       icon: "🔴", cssClass: "date-group--idag" },
  { id: "imorgen", label: "I morgen",    icon: "🟣", cssClass: "date-group--imorgen" },
  { id: "uke",     label: "Denne uken",  icon: "🔵", cssClass: "date-group--uke" },
  { id: "neste",   label: "Neste uke",   icon: "🟢", cssClass: "date-group--neste" },
  { id: "senere",  label: "Senere",      icon: "⚫", cssClass: "date-group--senere" },
];

/**
 * Formaterer dato til norsk tekst
 */
function formatDate(dateStr, timeStr) {
  const date = new Date(`${dateStr}T${timeStr}`);
  const days = ["S\u00f8ndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","L\u00f8rdag"];
  const months = ["jan","feb","mar","apr","mai","jun","jul","aug","sep","okt","nov","des"];
  return `${days[date.getDay()]} ${date.getDate()}. ${months[date.getMonth()]} kl. ${timeStr}`;
}

/**
 * Returner norsk kategori-label
 */
function getCategoryLabel(catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat ? `${cat.icon} ${cat.label}` : catId;
}

/* ============================================================
   DATA-HENTING
   ============================================================ */

/**
 * Henter arrangementer fra statisk JSON-fil på GitHub Pages.
 * JSON-filene genereres daglig av GitHub Actions (scrape.yml).
 * Faller tilbake til lokal EVENTS-array om filen ikke finnes.
 */
async function fetchEvents(city = "bergen") {
  document.getElementById("loading-state").hidden = false;
  document.getElementById("events-container").innerHTML = "";

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000);

    // Hent statisk JSON-fil generert av GitHub Actions (scrape.yml)
    const res = await fetch(`/data/events-${city}.json`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Datafil ikke funnet (${res.status})`);
    const data = await res.json();
    return Array.isArray(data.events) ? data.events : data;
  } catch (err) {
    // JSON-filen finnes ikke ennå (første deploy, lokal utvikling) → bruk eksempeldata
    console.info("Datafil ikke tilgjengelig, bruker lokal eksempeldata:", err.message);
    return EVENTS;
  } finally {
    document.getElementById("loading-state").hidden = true;
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

  if (!featured) {
    container.innerHTML = "";
    return;
  }

  const href = featured.affiliateUrl || featured.ticketUrl || "#";

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
          ${
            featured.affiliateUrl || featured.ticketUrl
              ? `<span class="btn btn--primary">🎫 Kj\u00f8p billetter</span>`
              : `<span class="btn btn--outline-white">🆓 Gratis inngang</span>`
          }
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
         <img
           src="${event.imageUrl}"
           alt="${event.title}"
           loading="lazy"
           onerror="this.parentElement.innerHTML='<div class=\'event-card__emoji-fallback\'>${event.imageEmoji}</div>'"
         />
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
          <span class="meta-item">📅 ${formatDate(event.date, event.time)}</span>
          <span class="meta-item">📍 ${event.location}</span>
        </div>
        <p class="event-card__desc">${event.description}</p>
        <div class="event-card__categories">${badges}</div>
        <div class="event-card__actions">${ticketBtn}</div>
      </div>
    </article>`;
}

/* ============================================================
   RENDERING – DATO-GRUPPERT VISNING
   ============================================================ */

function renderByGroups(events) {
  const container  = document.getElementById("events-container");
  const noResults  = document.getElementById("no-results");

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
    return g === "idag" || g === "imorgen" || g === "uke";
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
    input.value = "";
    searchQuery = "";
    clearBtn.hidden = true;
    input.focus();
    renderByGroups(allEvents);
  });
}

/* ============================================================
   BY-VELGER
   ============================================================ */

function setupCityPicker() {
  document.querySelectorAll(".city-pill:not([disabled])").forEach((pill) => {
    pill.addEventListener("click", async () => {
      document.querySelectorAll(".city-pill").forEach((p) => p.classList.remove("city-pill--active"));
      pill.classList.add("city-pill--active");

      currentCity = pill.dataset.city;
      const cityName = pill.textContent.trim().replace(/^[^\s]+\s/, "");

      const labelEl = document.getElementById("current-city-label");
      const nameEl  = document.getElementById("current-city-name");
      if (labelEl) labelEl.textContent = cityName;
      if (nameEl)  nameEl.textContent  = cityName;

      allEvents = await fetchEvents(currentCity);
      updateStats(allEvents);
      renderAll();
    });
  });
}

/* ============================================================
   OPPSTART
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  buildFilters();
  setupSearch();
  setupCityPicker();

  allEvents = await fetchEvents(currentCity);
  updateStats(allEvents);
  renderAll();
});
