/**
 * events.js
 * Inneholder eksempeldata for arrangementer.
 * Bytt ut med API-kall mot backend for produksjon.
 *
 * Fremtidig integrasjon:
 *   async function fetchEvents() {
 *     const res = await fetch('/api/events');
 *     return res.json();
 *   }
 */

const EVENTS = [
  {
    id: 1,
    title: "Familiedag i Byparken",
    description:
      "En hel dag fylt med aktiviteter for hele familien! Klatrevegg, trampoline, ansiktsmaling og food trucks. Perfekt utflukt for store og små.",
    date: "2026-04-05",
    time: "12:00",
    endTime: "18:00",
    location: "Byparken, Bergen",
    categories: ["familie", "barn", "gratis"],
    ticketUrl: null, // Gratis arrangement
    imageEmoji: "🌳",
    sponsored: false,
    affiliateUrl: null,
  },
  {
    id: 2,
    title: "Spellemannsgalla – Vestland",
    description:
      "Årets store musikkevent på Vestlandet! Norske artister konkurrerer om de gjeve Spellemannprisene. Rød løper og glamour fra start til slutt.",
    date: "2026-04-10",
    time: "19:00",
    endTime: "23:00",
    location: "Grieghallen, Bergen",
    categories: ["konsert", "uteliv"],
    ticketUrl: "https://www.ticketmaster.no",
    imageEmoji: "🎵",
    sponsored: true, // Sponset oppføring
    affiliateUrl: "https://www.ticketmaster.no/?ref=hvaSkjerIByenMin", // Affiliate-lenke
  },
  {
    id: 3,
    title: "Gratiskonsert: Bergen Filharmoniske",
    description:
      "Bergen Filharmoniske Orkester spiller utendørs gratis for publikum. Ta med picnictepper og nyt klassisk musikk under åpen himmel.",
    date: "2026-04-12",
    time: "14:00",
    endTime: "16:00",
    location: "Torgallmenningen, Bergen",
    categories: ["konsert", "familie", "gratis"],
    ticketUrl: null,
    imageEmoji: "🎻",
    sponsored: false,
    affiliateUrl: null,
  },
  {
    id: 4,
    title: "Barneteater: Askeladden og de gode hjelperne",
    description:
      "Den klassiske eventyret om Askeladden er tilbake på scenen! Fargerik forestilling for barn mellom 3 og 10 år. Interaktivt og morsomt.",
    date: "2026-04-18",
    time: "11:00",
    endTime: "12:30",
    location: "Den Nationale Scene, Bergen",
    categories: ["barn", "familie"],
    ticketUrl: "https://www.dns.no",
    imageEmoji: "🎭",
    sponsored: false,
    affiliateUrl: "https://www.dns.no/billetter?ref=hvaSkjerIByenMin",
  },
  {
    id: 5,
    title: "Nattjazz 2026",
    description:
      "Bergens eldste jazzfestival er tilbake! Fem dager med verdensstjerner og lokale talenter. Over 150 konserter på 20 scener i Bergen sentrum.",
    date: "2026-05-20",
    time: "18:00",
    endTime: "02:00",
    location: "Sentrale Bergen",
    categories: ["konsert", "uteliv"],
    ticketUrl: "https://www.nattjazz.no",
    imageEmoji: "🎷",
    sponsored: true,
    affiliateUrl: "https://www.nattjazz.no/billetter?ref=hvaSkjerIByenMin",
  },
  {
    id: 6,
    title: "Lørdag på Barnas Museum",
    description:
      "Interaktivt museum designet for barn fra 1–12 år. Prøv å være forsker, kokk eller astronaut! Alltid noe nytt å oppdage.",
    date: "2026-04-19",
    time: "10:00",
    endTime: "16:00",
    location: "Barnas Museum, Bergen",
    categories: ["barn", "familie"],
    ticketUrl: "https://www.barnasmuseum.no",
    imageEmoji: "🔬",
    sponsored: false,
    affiliateUrl: "https://www.barnasmuseum.no/billetter?ref=hvaSkjerIByenMin",
  },
  {
    id: 7,
    title: "Gatekunstfestival – Open Walls",
    description:
      "Internasjonale og norske gatekunstnere dekorerer Bergens fasader. Guidede turer tilgjengelig. Gratis og åpent for alle.",
    date: "2026-04-25",
    time: "10:00",
    endTime: "20:00",
    location: "Møhlenpris, Bergen",
    categories: ["familie", "gratis"],
    ticketUrl: null,
    imageEmoji: "🎨",
    sponsored: false,
    affiliateUrl: null,
  },
  {
    id: 8,
    title: "Club Night: DJ Kygo støtteshow",
    description:
      "En eksklusiv clubnight med bergenske DJ-talenter som hyllest til Kygo. Dansegulvet åpner kl. 22. Aldersgrense 20 år.",
    date: "2026-05-02",
    time: "22:00",
    endTime: "03:00",
    location: "USF Verftet, Bergen",
    categories: ["konsert", "uteliv"],
    ticketUrl: "https://www.usf.no",
    imageEmoji: "🎧",
    sponsored: false,
    affiliateUrl: "https://www.usf.no/billetter?ref=hvaSkjerIByenMin",
  },
];

/**
 * Kategorier med norsk label og ikon
 * Brukes for å generere filterknapper dynamisk
 */
const CATEGORIES = [
  { id: "familie",  label: "Familievennlig", icon: "👨‍👩‍👧‍👦" },
  { id: "gratis",   label: "Gratis",          icon: "🆓" },
  { id: "konsert",  label: "Konsert / Uteliv", icon: "🎵" },
  { id: "barn",     label: "Barn",             icon: "🧒" },
];
