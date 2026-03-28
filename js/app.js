/**
 * app.js
 * Hoved-JavaScript for "Hva skjer i byen min"
 *
 * Flyt:
 *  1. fetchEvents()      – Henter data fra /api/events, faller tilbake til lokal EVENTS
 *  2. buildFilters()     – Genererer kategori-filterknapper
 *  3. setupSearch()      – Søkefelt med debounce
 *  4. renderAll()        – Oppdaterer featured, dato-grupper og stats
 *
 * For å aktivere ekte API-data: sett opp Vercel (se api/-mappen)
 * og deploy prosjektet. Frontend henter da automatisk fra /api/events.
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
  return date.toLocaleDateString("sv-SE"); // sv-SE gir ISO-format uten konvertering
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

  // Beregn ukenummer for arrangement og "neste uke"
  const evDate = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((evDate - today) / 86_400_000);

  if (dateStr === todayStr)    return "idag";
  if (dateStr === tomorrowStr) return "imorgen";
  if (diffDays >= 2 && diffDays <= 6)  return "uke";   // Resten av denne uken
  if (diffDays >= 7 && diffDays <= 13) return "neste"; // Neste uke
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
  const days = ["Søndag","Mandag","Tirsdag","Onsdag","Torsdag","Fredag","Lørdag"];
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
 * Henter arrangementer fra /api/events (Vercel serverless).
 * Faller automatisk tilbake til lokal EVENTS-array om API ikke svarer.
 */
async function fetchEvents(city = "bergen") {
  // Vis laste-indikator
  document.getElementById("loading-state").hidden = false;
  document.getElementById("events-container").innerHTML = "";

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000); // 8 sek timeout

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

/**
 * Sjekk om et arrangement matcher gjeldende filtre og søk
 */
function eventMatches(event) {
  // Søkefilter
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

  // Kategorifilter (AND-logikk: alle valgte filtre må matche)
  if (activeFilters.size > 0) {
    const hasAll = [...activeFilters].every((f) => event.categories.includes(f));
    if (!hasAll) return false;
  }

  return true;
}

/* ============================================================
   RENDERING – FEATURED EVENT
   ============================================================ */

/**
 * Renderer det fremhevede arrangementet (featured: true, sponset)
 * Vises som stor banner mellom hero og resten av innholdet.
 */
function renderFeatured(events) {
  const container = document.getElementById("featured-section");
  if (!container) return;

  // Velg første featured event (prioritert: featured=true + sponsored)
  const featured =
    events.find((e) => e.featured && e.sponsored) ||
    events.find((e) => e.featured) ||
    events.find((e) => e.sponsored);

  if (!featured) {
    container.innerHTML = "";
    return;
  }

  // Billenke (affiliate-prioritert)
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
              ? `<span class="btn btn--primary">🎟️ Kjøp billetter</span>`
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

/**
 * Bygger HTML for ett arrangementkort
 */
function buildEventCard(event) {
  // Badges
  const badges = event.categories
    .map((cat) => `<span class="badge badge--${cat}">${getCategoryLabel(cat)}</span>`)
    .join("");

  // Bildetopp – ekte bilde eller emoji-fallback
  const imageSection = event.imageUrl
    ? `<div class="event-card__image">
         <img
           src="${event.imageUrl}"
           alt="${event.title}"
           loading="lazy"
           onerror="this.parentElement.innerHTML='<div class=\\'event-card__emoji-fallback\\'>${event.imageEmoji}</div>'"
         />
         ${event.sponsored ? `<div class="sponsored-label">✨ Sponset</div>` : ""}
       </div>`
    : `<div class="event-card__image">
         <div class="event-card__emoji-fallback">${event.imageEmoji}</div>
         ${event.sponsored ? `<div class="sponsored-label">✨ Sponset</div>` : ""}
       </div>`;

  // Billettknapp
  let ticketBtn;
  if (event.affiliateUrl) {
    ticketBtn = `<a href="${event.affiliateUrl}" class="btn btn--primary" target="_blank" rel="noopener sponsored">🎟️ Kjøp billetter</a>`;
  } else if (event.ticketUrl) {
    ticketBtn = `<a href="${event.ticketUrl}" class="btn btn--primary" target="_blank" rel="noopener">🎟️ Kjøp billetter</a>`;
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

/**
 * Renderer alle arrangementer gruppert per dato-periode
 */
function renderByGroups(events) {
  const container  = document.getElementById("events-container");
  const noResults  = document.getElementById("no-results");

  // Filtrer og sorter (sponsede alltid øverst innen hver gruppe)
  const filtered = events
    .filter(eventMatches)
    .sort((a, b) => {
      if (a.sponsored && !b.sponsored) return -1;
      if (!a.sponsored && b.sponsored) return  1;
      return new Date(a.date + "T" + a.time) - new Date(b.date + "T" + b.time);
    });

  // Oppdater event-teller
  document.getElementById("event-count").textContent = filtered.length;

  if (filtered.length === 0) {
    container.innerHTML = "";
    noResults.hidden = false;
    return;
  }
  noResults.hidden = true;

  // Grupper etter dato-periode
  const groups = {};
  for (const event of filtered) {
    const gId = getDateGroup(event.date);
    if (!groups[gId]) groups[gId] = [];
    groups[gId].push(event);
  }

  // Bygg HTML – kun grupper med events
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

/**
 * Oppdaterer stats-tallene i hero-seksjonen
 */
function updateStats(events) {
  const total = events.length;

  // Tell gratis arrangementer
  const free = events.filter((e) => e.categories.includes("gratis")).length;

  // Tell arrangementer denne uken
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

/**
 * Rendererer alt basert på gjeldende tilstand
 */
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

  // Tilbakestill-knapp
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
      const cityName = pill.textContent.trim().replace(/^[^\s]+\s/, ""); // Fjern emoji

      // Oppdater by-navn i hero
      const labelEl = document.getElementById("current-city-label");
      const nameEl  = document.getElementById("current-city-name");
      if (labelEl) labelEl.textContent = cityName;
      if (nameEl)  nameEl.textContent  = cityName;

      // Hent ny data
      allEvents = await fetchEvents(currentCity);
      updateStats(allEvents);
      renderAll();
    });
  });
}

/* ============================================================
   GEOLOKASJON
   ============================================================ */

/** Haversine-avstand i km mellom to koordinater */
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Finn nærmeste aktiverte city-pill basert på GPS-koordinater
 * og aktiver den som om brukeren klikket på den.
 */
function setupGeolocation() {
  const btn = document.getElementById("locate-btn");
  if (!btn || !navigator.geolocation) {
    if (btn) btn.hidden = true;
    return;
  }

  btn.addEventListener("click", () => {
    btn.disabled = true;
    btn.textContent = "📍 Finner deg…";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        // Samle alle city-pills med koordinater (ikke disabled)
        const pills = [...document.querySelectorAll(".city-pill[data-lat]:not([disabled])")];

        if (pills.length === 0) {
          btn.disabled = false;
          btn.textContent = "📍 Finn meg";
          return;
        }

        // Finn nærmeste pill
        let nearest = null;
        let minDist = Infinity;
        for (const pill of pills) {
          const d = distanceKm(
            latitude, longitude,
            parseFloat(pill.dataset.lat),
            parseFloat(pill.dataset.lon)
          );
          if (d < minDist) { minDist = d; nearest = pill; }
        }

        btn.disabled = false;
        btn.textContent = "📍 Finn meg";

        if (nearest && nearest.dataset.city !== currentCity) {
          nearest.click(); // Gjenbruk eksisterende city-picker logikk
        }
      },
      (err) => {
        btn.disabled = false;
        btn.textContent = "📍 Finn meg";
        console.warn("Geolokasjon ikke tilgjengelig:", err.message);
        // Vis kort tilbakemelding
        btn.setAttribute("title", "Kunne ikke hente posisjon – sjekk nettleserinnstillingene");
      },
      { timeout: 8000, maximumAge: 60_000 }
    );
  });
}

/* ============================================================
   OPPSTART
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  buildFilters();
  setupSearch();
  setupCityPicker();
  setupGeolocation();

  // Last inn data
  allEvents = await fetchEvents(currentCity);
  updateStats(allEvents);
  renderAll();
});
