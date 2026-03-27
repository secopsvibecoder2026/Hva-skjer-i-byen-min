/**
 * app.js
 * Hoved-JavaScript for "Hva skjer i byen min"
 *
 * Ansvarsområder:
 *  - Rendrer arrangementkort fra EVENTS-datasettet
 *  - Håndterer filtrering per kategori (toggle)
 *  - Håndterer live-søk etter tittel og kategori
 *  - Sorterer arrangementer etter dato (neste arrangement øverst)
 *  - Viser sponsede oppføringer med tydelig merking
 *
 * For fremtidig API-integrasjon: bytt ut EVENTS-importen
 * med et fetch()-kall til din backend, f.eks:
 *   const events = await fetch('/api/events').then(r => r.json());
 */

/* ============================================================
   TILSTAND (State)
   ============================================================ */
let activeFilters = new Set(); // Aktive kategori-filtre
let searchQuery = "";          // Nåværende søketekst

/* ============================================================
   HJELPEFUNKSJONER
   ============================================================ */

/**
 * Formaterer dato til norsk format
 * @param {string} dateStr - ISO-dato "YYYY-MM-DD"
 * @param {string} timeStr - Tidspunkt "HH:MM"
 * @returns {string} F.eks. "Lørdag 5. april 2026 kl. 12:00"
 */
function formatDate(dateStr, timeStr) {
  const date = new Date(`${dateStr}T${timeStr}`);
  const days = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];
  const months = [
    "januar", "februar", "mars", "april", "mai", "juni",
    "juli", "august", "september", "oktober", "november", "desember",
  ];
  return `${days[date.getDay()]} ${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()} kl. ${timeStr}`;
}

/**
 * Returnerer norsk kategorinavn for en kategori-id
 * @param {string} catId
 * @returns {string}
 */
function getCategoryLabel(catId) {
  const cat = CATEGORIES.find((c) => c.id === catId);
  return cat ? `${cat.icon} ${cat.label}` : catId;
}

/**
 * Sjekker om et arrangement passer gjeldende filtre og søk
 * @param {object} event
 * @returns {boolean}
 */
function eventMatchesFilters(event) {
  // Søkefilter: sjekk tittel og kategorinavn
  if (searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase();
    const inTitle = event.title.toLowerCase().includes(q);
    const inDesc = event.description.toLowerCase().includes(q);
    const inCategory = event.categories.some((cat) => {
      const label = (CATEGORIES.find((c) => c.id === cat)?.label || cat).toLowerCase();
      return label.includes(q) || cat.includes(q);
    });
    if (!inTitle && !inDesc && !inCategory) return false;
  }

  // Kategorifilter: alle valgte filtre må matche
  if (activeFilters.size > 0) {
    const hasAll = [...activeFilters].every((f) => event.categories.includes(f));
    if (!hasAll) return false;
  }

  return true;
}

/* ============================================================
   RENDERING
   ============================================================ */

/**
 * Bygger HTML for ett arrangementkort
 * @param {object} event
 * @returns {string} HTML-streng
 */
function buildEventCard(event) {
  // Kategoribadges
  const badges = event.categories
    .map(
      (cat) =>
        `<span class="badge badge--${cat}">${getCategoryLabel(cat)}</span>`
    )
    .join("");

  // Billettknapp / affiliate-lenke
  let ticketBtn = "";
  if (event.affiliateUrl) {
    // Bruk affiliate-lenke for inntjening
    ticketBtn = `<a href="${event.affiliateUrl}" class="btn btn--primary" target="_blank" rel="noopener sponsored">
      🎟️ Kjøp billetter
    </a>`;
  } else if (event.ticketUrl) {
    ticketBtn = `<a href="${event.ticketUrl}" class="btn btn--primary" target="_blank" rel="noopener">
      🎟️ Kjøp billetter
    </a>`;
  } else {
    ticketBtn = `<span class="btn btn--free">🆓 Gratis inngang</span>`;
  }

  // Sponset-merking
  const sponsoredBadge = event.sponsored
    ? `<div class="sponsored-label">✨ Sponset</div>`
    : "";

  return `
    <article class="event-card ${event.sponsored ? "event-card--sponsored" : ""}" data-id="${event.id}">
      ${sponsoredBadge}
      <div class="event-card__emoji">${event.imageEmoji}</div>
      <div class="event-card__body">
        <h2 class="event-card__title">${event.title}</h2>
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

/**
 * Rendrer alle arrangementkort basert på gjeldende filtre
 */
function renderEvents() {
  const container = document.getElementById("events-grid");
  const noResults = document.getElementById("no-results");

  // Filtrer og sorter (dato stigende, sponsede alltid øverst)
  const filtered = EVENTS.filter(eventMatchesFilters).sort((a, b) => {
    if (a.sponsored && !b.sponsored) return -1;
    if (!a.sponsored && b.sponsored) return 1;
    return new Date(a.date) - new Date(b.date);
  });

  if (filtered.length === 0) {
    container.innerHTML = "";
    noResults.hidden = false;
  } else {
    noResults.hidden = true;
    container.innerHTML = filtered.map(buildEventCard).join("");
  }

  // Oppdater teller i headeren
  document.getElementById("event-count").textContent = filtered.length;
}

/* ============================================================
   FILTER-KNAPPER
   ============================================================ */

/**
 * Bygger filterknapper dynamisk fra CATEGORIES-arrayen
 */
function buildFilters() {
  const container = document.getElementById("filter-buttons");
  container.innerHTML = CATEGORIES.map(
    (cat) => `
    <button
      class="filter-btn"
      data-filter="${cat.id}"
      aria-pressed="false"
      title="Filtrer på ${cat.label}"
    >
      ${cat.icon} ${cat.label}
    </button>`
  ).join("");

  // Legg til klikk-hendelser
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
      renderEvents();
    });
  });
}

/* ============================================================
   SØK
   ============================================================ */

/**
 * Setter opp søkefelt med debounce for ytelse
 */
function setupSearch() {
  const input = document.getElementById("search-input");
  const clearBtn = document.getElementById("search-clear");

  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value;
      clearBtn.hidden = searchQuery === "";
      renderEvents();
    }, 200); // 200ms debounce
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    searchQuery = "";
    clearBtn.hidden = true;
    input.focus();
    renderEvents();
  });
}

/* ============================================================
   ANNONSE-PLASSERING (Google Ads / Affiliate)
   ============================================================ */

/**
 * Initialiserer Google Ads.
 * Bytt ut `ca-pub-XXXXXXXXXX` med din faktiske Google AdSense publisher-ID.
 *
 * For å aktivere: fjern kommentarene nedenfor og legg til AdSense-scriptet i <head>:
 * <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js
 *   ?client=ca-pub-XXXXXXXXXX" crossorigin="anonymous"></script>
 */
function initAds() {
  // (window.adsbygoogle = window.adsbygoogle || []).push({});
  console.info(
    "Ads: Erstatt placeholder med ekte Google AdSense publisher-ID for å aktivere annonser."
  );
}

/* ============================================================
   OPPSTART
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  buildFilters();
  setupSearch();
  renderEvents();
  initAds();

  // Oppdater "Neste arrangement"-countdown hvert minutt
  // (kan utvides med faktisk nedtelling)
  setInterval(renderEvents, 60_000);
});
