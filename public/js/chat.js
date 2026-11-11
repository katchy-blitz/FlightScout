// The chat screen: messages, flight cards, trips with several cities, and the hover actions.
// Everything the AI or the server sends is shown with textContent (never as HTML).
// The list of messages (state.messages) is the single source of truth; the screen is drawn from it.

const scroller = document.getElementById("chat");
const thread = document.getElementById("thread");
const composer = document.getElementById("composer");
const input = document.getElementById("input");
const sendButton = document.getElementById("send");
const starters = document.getElementById("starters");
const topTitle = document.getElementById("topTitle");

const state = {
  chatId: newId(),
  title: "",
  messages: [], // [{ id, role, text, time, kind, data, payload, ctxBefore, local, error, feedback }]
  context: null, // the search so far (the server sends it back each turn)
  busy: false,
  user: null, // set by sidebar.js
  config: { aiProvider: "basic", sampleFares: false, paypalClientId: null, ngnPerUsd: 1500, logos: {}, airports: {} },
};

const CABIN_LABELS = { economy: "Economy", premium_economy: "Premium Economy", business: "Business", first: "First" };
const PROVIDER_LABELS = { claude: "Powered by Claude", openai: "Powered by OpenAI", groq: "Powered by Groq", basic: "Basic mode (no AI key)" };
const FARE_LIFETIME_MS = 25 * 60 * 1000; // the server remembers fares for 30 minutes

// ---------- helpers ----------
function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const formatTime = (v) => (v ? new Date(v).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true }) : "--:--");
const formatDate = (v) => (v ? new Date(v).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "");
const formatPrice = (amount, currency) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: currency === "NGN" || !currency ? 0 : 2 }).format(amount);

// "10:05 AM" today, "8 Nov, 10:05 AM" on other days
function formatStamp(ms) {
  const d = new Date(ms);
  const clock = d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true });
  return d.toDateString() === new Date().toDateString() ? clock : `${d.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}, ${clock}`;
}

const placeName = (code) => (state.config.airports && state.config.airports[code] ? `${state.config.airports[code]} (${code})` : code);

function toBottom() {
  scroller.scrollTo({ top: scroller.scrollHeight });
}

// ---------- icons (our own simple line icons) ----------
const ICONS = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  up: '<path d="M7 11v9H4v-9h3z"/><path d="M7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6.5A2 2 0 0 1 17.3 20H7"/>',
  down: '<g transform="translate(0 24) scale(1 -1)"><path d="M7 11v9H4v-9h3z"/><path d="M7 11l4-8a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6.5A2 2 0 0 1 17.3 20H7"/></g>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.500 5.700 12 3z"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M16 8l4 4-4 4M20 12H9"/>',
  upcircle: '<circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.500 11.500L12 8l3.500 3.500"/>',
};

function icon(name, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name]; // fixed strings above, never user text
  return svg;
}

function iconButton(name, label, onClick, extraClass = "") {
  const button = el("button", `icon-btn ${extraClass}`.trim());
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(icon(name));
  button.addEventListener("click", onClick);
  return button;
}

// ---------- airline logos ----------
// Real logos can be dropped into public/logos (see the README there). Until then,
// each airline gets a neutral coloured badge with its initials.
const slug = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function logoBadge(name) {
  const words = String(name).trim().split(/\s+/);
  const letters = (words.length > 1 ? words[0][0] + words[1][0] : String(name).slice(0, 2)).toUpperCase();
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const badge = el("span", "airline-logo badge", letters);
  badge.style.background = `hsl(${hash} 48% 36%)`;
  badge.setAttribute("aria-hidden", "true");
  return badge;
}

function airlineLine(name, className = "airline") {
  const line = el("span", `${className} airline-line`);
  const url = state.config.logos && state.config.logos[slug(name)];
  let mark;
  if (url) {
    mark = document.createElement("img");
    mark.className = "airline-logo";
    mark.src = url;
    mark.alt = "";
    mark.addEventListener("error", () => mark.replaceWith(logoBadge(name)));
  } else {
    mark = logoBadge(name);
  }
  line.append(mark, el("span", "airline-name", name));
  return line;
}

// ---------- what the AI needs to know about earlier turns ----------
function historyBefore(index) {
  return state.messages
    .slice(0, index)
    .filter((m) => m.text && !m.error)
    .map((m) => ({ role: m.role, content: String(m.text).slice(0, 1200) }))
    .slice(-12);
}

// The flights that were on screen when message `index` was sent (so "the first one" makes sense).
function shownAt(index) {
  for (let i = index - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role === "assistant" && m.kind === "results" && m.data && m.data.flights) return m.data.flights;
  }
  return [];
}

// ---------- copy ----------
async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    try { document.execCommand("copy"); } catch { /* nothing more we can do */ }
    area.remove();
  }
  if (button) {
    button.replaceChildren(icon("check"));
    button.classList.add("done");
    setTimeout(() => {
      button.replaceChildren(icon("copy"));
      button.classList.remove("done");
    }, 1400);
  }
}

function textForCopy(msg) {
  let text = msg.text || "";
  if (msg.kind === "results" && msg.data && msg.data.flights) {
    text += `\n\n${msg.data.flights.map((f) => `${f.airline} ${formatTime(f.departure)} - ${formatPrice(f.priceNGN, "NGN")}`).join("\n")}`;
  }
  if (msg.kind === "trip" && msg.data && msg.data.trip) {
    text += `\n\n${msg.data.trip.legs.map((l) => `${l.origin} to ${l.destination}, ${l.label}:\n${l.flights.map((f) => `  ${f.airline} ${formatTime(f.departure)} - ${formatPrice(f.priceNGN, "NGN")}`).join("\n")}`).join("\n")}`;
  }
  return text;
}

// ---------- hover actions ----------
function previousUser(msg) {
  const i = state.messages.indexOf(msg);
  for (let k = i - 1; k >= 0; k--) if (state.messages[k].role === "user") return state.messages[k];
  return null;
}

function metaBar(msg) {
  const meta = el("div", "meta");
  const actions = el("div", "actions");

  if (msg.role === "user") {
    if (!msg.local) {
      actions.append(iconButton("reload", "Ask Scout again", () => reloadFrom(msg)));
      if (msg.payload && msg.payload.text) actions.append(iconButton("edit", "Edit message", () => startEdit(msg)));
    }
    const copy = iconButton("copy", "Copy", () => copyText(msg.text, copy));
    actions.append(copy);
  } else {
    const copy = iconButton("copy", "Copy", () => copyText(textForCopy(msg), copy));
    actions.append(copy);
    if (!msg.error) {
      const up = iconButton("up", "Good response", () => setFeedback(msg, "up", up, down), msg.feedback === "up" ? "on" : "");
      const down = iconButton("down", "Bad response", () => setFeedback(msg, "down", up, down), msg.feedback === "down" ? "on" : "");
      up.setAttribute("aria-pressed", String(msg.feedback === "up"));
      down.setAttribute("aria-pressed", String(msg.feedback === "down"));
      actions.append(up, down);
    }
    const source = previousUser(msg);
    if (!msg.local && source && !source.local) actions.append(iconButton("reload", "Try again", () => reloadFrom(source)));
  }

  meta.append(actions, el("span", "stamp", formatStamp(msg.time)));
  return meta;
}

function setFeedback(msg, value, up, down) {
  msg.feedback = msg.feedback === value ? null : value;
  up.classList.toggle("on", msg.feedback === "up");
  down.classList.toggle("on", msg.feedback === "down");
  up.setAttribute("aria-pressed", String(msg.feedback === "up"));
  down.setAttribute("aria-pressed", String(msg.feedback === "down"));
  changed();
}

// ---------- drawing messages ----------
function makeMsg(role, text, extra = {}) {
  return { id: newId(), role, text, time: Date.now(), ...extra };
}

function greeting() {
  const name = state.user && state.user.name ? state.user.name.split(" ")[0] : "";
  return `Hi${name ? ` ${name}` : ""}, I'm Scout, your flight assistant. ✈\n\nWhere would you like to fly today? Tell me the route and the day, plus anything that matters to you, like the time of day or your budget. You can even plan a trip through several cities.`;
}

function assistantShell() {
  const row = el("div", "msg assistant");
  row.append(el("div", "avatar", "✈"));
  const body = el("div", "body");
  row.append(body);
  return { row, body };
}

function renderMessage(msg) {
  let row;
  if (msg.role === "user") {
    row = el("div", "msg user");
    const col = el("div", "col");
    col.append(el("div", "bubble", msg.text), metaBar(msg));
    row.append(col);
  } else {
    const shell = assistantShell();
    row = shell.row;
    const { body } = shell;
    if (msg.text && msg.kind !== "booking") body.append(el("div", msg.error ? "text error" : "text", msg.text));
    if (msg.kind === "results") renderResults(body, msg);
    else if (msg.kind === "trip") renderTrip(body, msg);
    else if (msg.kind === "booking") renderBooking(body, msg);
    body.append(metaBar(msg));
  }
  row.dataset.id = msg.id;
  thread.append(row);
  return row;
}

function addTyping() {
  const { row, body } = assistantShell();
  const dots = el("div", "typing");
  dots.append(el("span"), el("span"), el("span"));
  dots.setAttribute("aria-label", "Scout is typing");
  body.append(dots);
  thread.append(row);
  toBottom();
  return row;
}

// The fresh-chat screen: a greeting and the message box in the middle, like Gemini or ChatGPT.
function updateHero() {
  const empty = state.messages.length === 0;
  input.placeholder = empty ? "Tell Scout where you want to fly..." : "Ask a follow-up, or say \"make it evening\"...";
  document.querySelector(".main").classList.toggle("is-empty", empty);
  const who = state.user && (state.user.callMe || state.user.name);
  document.getElementById("heroTitle").textContent = who ? `Hello ${who}, where are we flying?` : "Where would you like to fly?";
}

function renderAll() {
  thread.replaceChildren();
  state.messages.forEach(renderMessage);
  updateHero();
  starters.hidden = state.messages.length > 0;
  topTitle.textContent = state.title || "New chat";
  toBottom();
}

function pushMessage(msg) {
  state.messages.push(msg);
  const row = renderMessage(msg);
  document.querySelector(".main").classList.remove("is-empty");
  input.placeholder = "Ask a follow-up, or say \"make it evening\"...";
  starters.hidden = true;
  toBottom();
  return row;
}

function changed() {
  topTitle.textContent = state.title || "New chat";
  if (window.FS && window.FS.onChange) window.FS.onChange();
}

// ---------- results ----------
function chipsFor(ctx, { trip = false } = {}) {
  const chips = el("div", "chips");
  const add = (label) => chips.append(el("span", "chip", label));
  if (!trip && ctx.origin && ctx.destination) add(`${ctx.origin} → ${ctx.destination}`);
  if (!trip && ctx.departureDate) add(formatDate(ctx.departureDate));
  if (!trip && ctx.returnDate) add(`Return ${formatDate(ctx.returnDate)}`);
  if (ctx.timePreference && ctx.timePreference !== "anytime") add(`${ctx.timeIsStrict ? "Only " : "Prefer "}${ctx.timePreference}`);
  if (ctx.cabin) add(CABIN_LABELS[ctx.cabin] || ctx.cabin);
  add(`${ctx.passengers || 1} passenger${(ctx.passengers || 1) > 1 ? "s" : ""}`);
  if (ctx.maxPriceNGN) add(`Under ${formatPrice(ctx.maxPriceNGN, "NGN")}${trip ? " per flight" : ""}`);
  return chips;
}

// Returns the card; card._button is its Select button.
function flightCard(flight, passengers, onSelect) {
  const card = el("article", "flight-card");
  const left = el("div");

  const top = el("div", "card-top");
  top.append(airlineLine(flight.airline));
  if (flight.demo) top.append(el("span", "tag tag-sample", "Sample fare"));
  if (flight.matchesPreference) top.append(el("span", "tag tag-match", "Fits your time preference"));
  left.append(top);
  left.append(el("div", "sub", `${flight.flightNumber ? `Flight ${flight.flightNumber} · ` : ""}${CABIN_LABELS[flight.cabin] || "Economy"} · ${flight.stops === 0 ? "Direct" : `${flight.stops} stop(s)`}`));

  const route = el("div", "route");
  const a = el("div");
  a.append(el("div", "time", formatTime(flight.departure)), el("div", "airport", flight.origin));
  const b = el("div");
  b.append(el("div", "time", formatTime(flight.arrival)), el("div", "airport", flight.destination));
  route.append(a, el("div", "line"), b);
  left.append(route);

  if (flight.returnDeparture) {
    left.append(el("div", "sub", `Return ${formatDate(flight.returnDeparture)} · ${formatTime(flight.returnDeparture)} → ${formatTime(flight.returnArrival)}`));
  }

  const right = el("div", "price-col");
  const price = el("div");
  price.append(
    el("div", "price", formatPrice(flight.price, flight.currency)),
    el("div", "price-sub", passengers > 1 ? `Total for ${passengers} passengers` : "Total fare")
  );
  const select = el("button", "primary", "Select");
  select.type = "button";
  select.addEventListener("click", () => onSelect(flight));
  right.append(price, select);

  card.append(left, right);
  card._button = select;
  return card;
}

function renderSuggestions(body, suggestions) {
  const fits = suggestions.some((s) => s.fitsBudget);
  const box = el("div", "suggest");
  box.append(el("div", "suggest-title", fits ? "These days fit your budget" : "You could save by changing the day"));
  suggestions.forEach((s) => {
    const row = el("div", "suggest-row");
    const info = el("div");
    const main = s.fitsBudget
      ? `${s.label}: ${formatPrice(s.flight.priceNGN, "NGN")}, within your budget`
      : `${s.label}: ${formatPrice(s.saving, "NGN")} cheaper`;
    const sub = el("div", "suggest-sub");
    sub.append(airlineLine(s.flight.airline, "airline-inline"), ` at ${formatTime(s.flight.departure)} for ${formatPrice(s.flight.priceNGN, "NGN")}`);
    info.append(el("div", "suggest-main", main), sub);
    const go = el("button", "ghost", "Show these flights");
    go.type = "button";
    go.addEventListener("click", () => submit({ action: { type: "change_date", date: s.date }, label: `Show me flights on ${s.label}` }));
    row.append(info, go);
    box.append(row);
  });
  body.append(box);
}

function renderResults(body, msg) {
  const data = msg.data || {};
  const ctx = data.context || {};
  (data.assumptions || []).forEach((note) => body.append(el("div", "note", note)));
  if (!data.flights || !data.flights.length) return;

  body.append(chipsFor(ctx));
  const cards = el("div", "cards");
  data.flights.forEach((f) => cards.append(flightCard(f, ctx.passengers || 1, (flight) => chooseFlights([flight], ctx.passengers || 1, msg))));
  body.append(cards);

  if (data.suggestions && data.suggestions.length) renderSuggestions(body, data.suggestions);
  if (data.usingSampleFares) body.append(el("div", "note", "These are generated sample fares for the demo, not real airline prices."));
}

// ---------- multi-city trips ----------
function renderTrip(body, msg) {
  const data = msg.data || {};
  const ctx = data.context || {};
  const legs = data.trip.legs;
  const passengers = ctx.passengers || 1;
  msg.selection = msg.selection || {};
  (data.assumptions || []).forEach((note) => body.append(el("div", "note", note)));
  body.append(chipsFor(ctx, { trip: true }));

  const cardsByLeg = new Map();
  legs.forEach((leg) => {
    const section = el("section", "leg");
    const head = el("div", "leg-head");
    head.append(el("span", "leg-num", `Flight ${leg.index + 1}`), el("span", "leg-route", `${placeName(leg.origin)} → ${placeName(leg.destination)}`), el("span", "leg-date", leg.label));
    section.append(head);
    if (!leg.flights.length) {
      section.append(el("div", "note", "No flights found for this one. Try a different date."));
    } else {
      if (leg.overBudget) section.append(el("div", "note warn", `Nothing here is under ${formatPrice(ctx.maxPriceNGN, "NGN")}. These are the cheapest available.`));
      const cards = el("div", "cards");
      const list = leg.flights.map((f) => {
        const card = flightCard(f, passengers, (flight) => {
          msg.selection[leg.index] = msg.selection[leg.index] === flight.id ? null : flight.id;
          refresh();
          changed();
        });
        card._flight = f;
        cards.append(card);
        return card;
      });
      cardsByLeg.set(leg.index, list);
      section.append(cards);
    }
    body.append(section);
  });

  const bar = el("div", "trip-bar");
  const barText = el("div", "trip-text");
  const book = el("button", "primary", "Book these flights");
  book.type = "button";
  bar.append(barText, book);
  body.append(bar);

  function refresh() {
    let total = 0;
    let chosen = 0;
    legs.forEach((leg) => {
      (cardsByLeg.get(leg.index) || []).forEach((card) => {
        const on = msg.selection[leg.index] === card._flight.id;
        card.classList.toggle("selected", on);
        card._button.textContent = on ? "Selected ✓" : "Select";
        if (on) { chosen++; total += card._flight.priceNGN || 0; }
      });
    });
    const withFlights = legs.filter((l) => l.flights.length).length;
    book.disabled = chosen !== legs.length || withFlights !== legs.length;
    barText.textContent = chosen === legs.length
      ? `All ${legs.length} flights chosen · ${formatPrice(total, "NGN")}`
      : `Choose one flight for each leg (${chosen} of ${legs.length})${chosen ? ` · ${formatPrice(total, "NGN")} so far` : ""}`;
    book.textContent = chosen === legs.length ? `Book ${legs.length} flights` : "Book these flights";
  }
  book.addEventListener("click", () => {
    const flights = legs.map((l) => l.flights.find((f) => f.id === msg.selection[l.index])).filter(Boolean);
    if (flights.length === legs.length) chooseFlights(flights, passengers, msg);
  });
  refresh();

  if (data.usingSampleFares) body.append(el("div", "note", "These are generated sample fares for the demo, not real airline prices."));
}

// ---------- confirmation ----------
// Typical times (airlines differ), worked out from the departure time.
function clock(local, minutesBefore) {
  const d = new Date(`${String(local).slice(0, 19)}Z`);
  d.setUTCMinutes(d.getUTCMinutes() - minutesBefore);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function bookingFlights(booking) { return booking.flights || [booking.flight]; }

function seatLine(booking, i) {
  const s = (booking.seats || {})[i] || {};
  const parts = booking.passengers.map((p, n) => (s[n] ? `${p.split(" ")[0]} ${s[n]}` : "")).filter(Boolean);
  return parts.length ? `Seats: ${parts.join(" · ")}` : "";
}

function receiptText(booking) {
  const lines = [`FlightScout booking ${booking.reference}`, "(Beta: sample fares and a PayPal sandbox payment. Not a real airline ticket.)", ""];
  bookingFlights(booking).forEach((f, i) => {
    lines.push(`${f.airline} ${f.flightNumber || ""}: ${placeName(f.origin)} to ${placeName(f.destination)}`);
    lines.push(`${formatDate(f.departure)}, departs ${formatTime(f.departure)}, arrives ${formatTime(f.arrival)}`);
    const seats = seatLine(booking, i);
    if (seats) lines.push(seats);
    lines.push(`Be at the airport by ${clock(f.departure, 120)}. Check-in desk closes about ${clock(f.departure, 45)}.`, "");
  });
  const x = booking.extras || {};
  const extra = [];
  if (x.bags) extra.push(`${x.bags} extra bag${x.bags > 1 ? "s" : ""} per passenger, per flight`);
  (x.assistance || []).forEach((a) => extra.push(a));
  lines.push(`Passengers: ${booking.passengers.join(", ")}`);
  if (extra.length) lines.push(`Extras: ${extra.join("; ")}`);
  lines.push(`Paid: US$${booking.paid.usd.toFixed(2)} (about ${formatPrice(booking.paid.ngn, "NGN")}) via PayPal`);
  return lines.join("\n");
}

function renderBooking(body, msg) {
  const box = el("div", "booking-wrap");
  body.append(el("div", "text", msg.text), box);
  drawBooking(box, msg);
}

function drawBooking(box, msg) {
  const booking = msg.data.booking;
  const flights = bookingFlights(booking);
  const ownEmail = booking.email || "";
  box.replaceChildren();

  // 1. The ticket: the reference and the flights, nothing else.
  const card = el("div", "ticket-card");
  const panel = el("div", "");
  card.append(el("div", "eyebrow", "BOOKING CONFIRMED"), el("div", "ref", booking.reference));
  flights.forEach((f, i) => {
    const leg = el("div", "tleg");
    const route = el("div", "tr");
    route.append(airlineLine(f.airline, "airline-inline"), ` ${f.origin} → ${f.destination}`);
    leg.append(route, el("div", "tw", `${formatDate(f.departure)} · ${formatTime(f.departure)} → ${formatTime(f.arrival)}${f.flightNumber ? ` · ${f.flightNumber}` : ""}`));
    const seats = seatLine(booking, i);
    if (seats) leg.append(el("div", "ts", seats));
    else {
      const pick = el("button", "link-btn", flights.length > 1 ? "Choose seats for this flight" : "Choose your seat");
      pick.type = "button";
      pick.addEventListener("click", () => { panel.hidden = false; openSeatPanel(panel, booking, msg, box, i); });
      leg.append(pick);
    }
    card.append(leg);
  });
  const extraBits = [];
  const x = booking.extras || {};
  if (x.bags) extraBits.push(`${x.bags} extra bag${x.bags > 1 ? "s" : ""} each`);
  (x.assistance || []).forEach((a) => extraBits.push(a));
  card.append(el("div", "status-line", `${booking.passengers.join(", ")} · Paid US$${booking.paid.usd.toFixed(2)} (about ${formatPrice(booking.paid.ngn, "NGN")})${extraBits.length ? ` · ${extraBits.join(", ")}` : ""}`));
  card.append(el("div", "status-line", booking.status));

  // 2. Three actions.
  const actions = el("div", "tk-actions");
  const ticket = el("a", "ghost", "Download ticket");
  ticket.href = `/api/bookings/${encodeURIComponent(booking.reference)}/ticket?email=${encodeURIComponent(ownEmail)}`;
  ticket.target = "_blank"; ticket.rel = "noopener";
  ticket.setAttribute("role", "button");
  const mailBtn = el("button", "ghost", "Email me this receipt");
  const seatBtn = el("button", "ghost", flights.some((_, i) => seatLine(booking, i)) ? "Change seats" : flights.length > 1 ? `Choose seats (${flights.length} flights)` : "Choose seats");
  mailBtn.type = seatBtn.type = "button";
  actions.append(ticket, mailBtn, seatBtn);
  card.append(actions);

  card.append(panel);
  mailBtn.addEventListener("click", () => { panel.hidden = false; openReceiptPanel(panel, booking); });
  seatBtn.addEventListener("click", () => { panel.hidden = false; openSeatPanel(panel, booking, msg, box); });

  // 3. Before you fly: three numbers, the rest folded away.
  const info = el("div", "flyinfo");
  info.append(el("h4", "", "Before you fly"));
  const first = flights[0];
  const times = el("div", "times");
  [[clock(first.departure, 120), "Be at the airport"], [clock(first.departure, 45), "Check-in desk closes"], [clock(first.departure, 20), "Gate closes"]].forEach(([t, label]) => {
    const d = el("div", ""); d.append(el("b", "", t), el("span", "", label)); times.append(d);
  });
  info.append(times);
  if (flights.length > 1) info.append(el("p", "fi-leg", `For your first flight (${first.origin} → ${first.destination}). Other flights: be there 2 hours before departure.`));
  const more = el("details", "");
  more.append(el("summary", "", "More tips"));
  const list = el("ul", "");
  list.append(
    el("li", "", "Bring the photo ID that matches the name on your ticket."),
    el("li", "", "Times are typical for domestic flights. Your airline may ask for more, so check with them.")
  );
  const site = first.checkin && first.checkin.site;
  const online = el("li", "", "Online check-in is not available through FlightScout yet. ");
  if (site) {
    const link = el("a", "", `Check the airline's website`);
    link.href = site; link.target = "_blank"; link.rel = "noopener";
    online.append("Some airlines offer it on their own website or app: ", link, ".");
  } else online.append("Some airlines offer it on their own website or app.");
  list.append(online);
  more.append(list);
  info.append(more);

  box.append(card, info);
}

function openReceiptPanel(panel, booking) {
  panel.className = "inline-panel";
  panel.replaceChildren();
  panel.append(el("div", "suggest-title", "Where should I send it?"));
  const row = el("div", "row");
  const input = document.createElement("input");
  input.type = "email"; input.value = (window.FS.state.user && window.FS.state.user.email) || booking.email || ""; input.placeholder = "name@example.com";
  input.setAttribute("aria-label", "Email address");
  const send = el("button", "primary", "Send");
  send.type = "button";
  const close = el("button", "ghost", "Close");
  close.type = "button";
  row.append(input, send, close);
  const out = el("p", "hint", "");
  panel.append(row, out);
  close.addEventListener("click", () => { panel.replaceChildren(); panel.className = ""; });
  send.addEventListener("click", async () => {
    const to = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { out.textContent = "Please enter a valid email address."; return; }
    send.disabled = true; out.textContent = "Sending...";
    try {
      const r = await fetch(`/api/bookings/${encodeURIComponent(booking.reference)}/receipt`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: booking.email, to }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) { out.textContent = `Done. I've sent your receipt to ${to}.`; }
      else if (data.notConfigured) {
        // Sending is not set up on this server: open the person's own email app with the receipt filled in.
        const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`Your FlightScout receipt ${booking.reference}`)}&body=${encodeURIComponent(receiptText(booking))}`;
        out.textContent = "Email sending isn't switched on in this beta, so I've opened your email app with the receipt ready to send.";
        window.location.href = url;
      } else out.textContent = data.error || "I couldn't send that. Please try again.";
    } catch { out.textContent = "I couldn't reach the server. Please try again."; }
    send.disabled = false;
  });
  input.focus();
}

async function openSeatPanel(panel, booking, msg, box, startFlight = 0) {
  panel.className = "inline-panel";
  panel.replaceChildren(el("p", "hint", "Loading the seat map..."));
  let data;
  try {
    const r = await fetch(`/api/bookings/${encodeURIComponent(booking.reference)}?email=${encodeURIComponent(booking.email || "")}`);
    data = await r.json();
    if (!r.ok) throw new Error(data.error);
  } catch {
    panel.replaceChildren(el("p", "hint", "I can't open the seat map for this booking any more. Please contact support with your reference."));
    return;
  }
  let current = data.booking;
  const flights = bookingFlights(current);
  let flightIdx = startFlight;
  let pax = 0;
  const info = data.seatMap;
  const draw = () => {
    panel.replaceChildren();
    panel.append(el("div", "suggest-title", "Pick your seats (included, no extra charge)"));
    if (flights.length > 1) {
      const tabs = el("div", "seat-tabs");
      flights.forEach((f, i) => {
        const have = Object.keys((current.seats || {})[i] || {}).length;
        const done = have >= current.passengers.length;
        const b = el("button", i === flightIdx ? "on" : "", `${done ? "✓ " : ""}Flight ${i + 1}: ${f.origin} → ${f.destination}`); b.type = "button"; b.addEventListener("click", () => { flightIdx = i; draw(); }); tabs.append(b); });
      panel.append(tabs);
    }
    if (current.passengers.length > 1) {
      const tabs = el("div", "seat-tabs");
      current.passengers.forEach((p, i) => { const b = el("button", i === pax ? "on" : "", p.split(" ")[0]); b.type = "button"; b.addEventListener("click", () => { pax = i; draw(); }); tabs.append(b); });
      panel.append(tabs);
    }
    const mine = (current.seats || {})[flightIdx] || {};
    const taken = new Set(info.flights[flightIdx].taken);
    const map = el("div", "seatmap");
    for (let r = 1; r <= info.rows; r++) {
      const row = el("div", "seat-row");
      row.append(el("span", "rn", String(r)));
      info.letters.forEach((l, k) => {
        if (k === 3) row.append(el("span", "", ""));
        const id = `${r}${l}`;
        const b = el("button", "seat", l);
        b.type = "button";
        b.setAttribute("aria-label", `Seat ${id}`);
        const holder = Object.entries(mine).find(([, seat]) => seat === id);
        if (holder) b.classList.add(Number(holder[0]) === pax ? "mine" : "chosen");
        b.disabled = taken.has(id) || Boolean(holder && Number(holder[0]) !== pax);
        b.addEventListener("click", () => pick(id));
        row.append(b);
      });
      map.append(row);
    }
    const hint = el("p", "hint", `Choosing a seat for ${current.passengers[pax]} on ${flights[flightIdx].origin} → ${flights[flightIdx].destination}. Greyed seats are taken.${flights.length > 1 ? " Use the tabs above to pick seats on your other flights too." : ""}`);
    const done = el("button", "primary", "Done");
    done.type = "button";
    done.addEventListener("click", () => drawBooking(box, msg)); // redraw the ticket with the seats
    panel.append(map, hint, done);
  };
  async function pick(seat) {
    const r = await fetch(`/api/bookings/${encodeURIComponent(booking.reference)}/seat`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: booking.email, flight: flightIdx, passenger: pax, seat }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok) { alert(out.error || "Could not choose that seat."); return; }
    current = out.booking;
    msg.data.booking = { ...msg.data.booking, seats: current.seats };
    changed();
    const scroll = panel.querySelector(".seatmap");
    const top = scroll ? scroll.scrollTop : 0;
    draw();
    const again = panel.querySelector(".seatmap");
    if (again) again.scrollTop = top;
  }
  draw();
}

// ---------- choosing flights ----------
function chooseFlights(flights, passengers, sourceMsg) {
  if (state.busy) return;

  // Fares are only remembered for a short while. For an older chat, refresh them first.
  if (sourceMsg && Date.now() - sourceMsg.time > FARE_LIFETIME_MS) {
    const source = previousUser(sourceMsg);
    if (source && !source.local) {
      pushMessage(makeMsg("assistant", "These fares are a little old, so let me refresh them first.", { local: true }));
      reloadFrom(source);
      return;
    }
  }

  const label = flights.length === 1
    ? `I'll take the ${flights[0].airline} flight at ${formatTime(flights[0].departure)}`
    : `I'll book these ${flights.length} flights: ${flights.map((f) => `${f.origin} → ${f.destination}`).join(", ")}`;
  pushMessage(makeMsg("user", label, { local: true }));
  changed();
  window.FS.startCheckout(flights, passengers);
}

// ---------- talking to the server ----------
function submit({ text, action, label }) {
  if (state.busy) return;
  const shown = label || text;
  if (!state.title) state.title = shown.slice(0, 48);
  const msg = makeMsg("user", shown, { payload: action ? { action } : { text }, ctxBefore: state.context });
  pushMessage(msg);
  respond(msg);
}

function reloadFrom(userMsg) {
  if (state.busy) return;
  const i = state.messages.indexOf(userMsg);
  if (i < 0) return;
  state.messages.splice(i + 1); // forget everything Scout said after this message
  state.context = userMsg.ctxBefore || null;
  renderAll();
  respond(userMsg);
}

async function respond(userMsg) {
  state.busy = true;
  sendButton.disabled = true;
  starters.hidden = true;
  const index = state.messages.indexOf(userMsg);
  const typing = addTyping();
  const failure = (text) => {
    typing.remove();
    pushMessage(makeMsg("assistant", text, { error: true }));
  };

  try {
    const shown = shownAt(index);
    const payload = userMsg.payload.action
      ? { action: userMsg.payload.action.type, date: userMsg.payload.action.date, context: userMsg.ctxBefore }
      : {
          text: userMsg.payload.text,
          context: userMsg.ctxBefore,
          history: historyBefore(index),
          shown: shown.map((f) => ({ airline: f.airline, time: f.departure.slice(11, 16), priceNGN: f.priceNGN })),
        };

    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();

    if (!response.ok) return failure(data.error || "Sorry, something went wrong. Please try again.");
    typing.remove();

    if (data.aiProvider) {
      // A key is set but the answer came from the basic reader: the AI could not be reached.
      const failed = data.aiProvider === "basic" && state.config.aiProvider !== "basic";
      document.getElementById("aiBadge").textContent = failed ? "AI not reachable: basic mode" : PROVIDER_LABELS[data.aiProvider] || "";
    }
    if (data.context) state.context = data.context;

    if (data.select) {
      const flight = shown[data.select - 1];
      pushMessage(makeMsg("assistant", flight ? data.reply : "Which flight would you like? Tap Select on one of the cards above."));
      if (flight) {
        changed();
        window.FS.startCheckout([flight], (state.context && state.context.passengers) || 1);
      }
      return;
    }

    const kind = data.trip ? "trip" : data.flights ? "results" : "text";
    const extra = { kind };
    if (kind !== "text") {
      extra.data = { context: data.context || state.context, assumptions: data.assumptions || [], usingSampleFares: data.usingSampleFares, flights: data.flights, suggestions: data.suggestions, budget: data.budget, trip: data.trip };
    }
    pushMessage(makeMsg("assistant", data.reply || "", extra));
  } catch {
    failure("I couldn't reach the server. Please check your connection and try again.");
  } finally {
    state.busy = false;
    sendButton.disabled = !input.value.trim();
    changed();
  }
}

// ---------- editing a message you sent ----------
function startEdit(msg) {
  if (state.busy) return;
  const row = thread.querySelector(`[data-id="${msg.id}"]`);
  if (!row) return;
  const col = row.querySelector(".col");
  const box = el("div", "edit-box");
  const area = document.createElement("textarea");
  area.value = msg.text;
  area.maxLength = 500;
  area.rows = Math.min(6, Math.max(2, Math.ceil(msg.text.length / 40)));
  area.setAttribute("aria-label", "Edit your message");
  const buttons = el("div", "edit-buttons");
  const cancel = el("button", "ghost", "Cancel");
  const save = el("button", "primary", "Send");
  cancel.type = save.type = "button";
  buttons.append(cancel, save);
  box.append(area, buttons);
  col.replaceChildren(box);
  area.focus();
  area.setSelectionRange(area.value.length, area.value.length);

  const done = () => {
    const text = area.value.trim();
    if (text.length < 2) return;
    msg.text = text;
    msg.payload = { text };
    msg.time = Date.now();
    if (state.messages.find((m) => m.role === "user") === msg) state.title = text.slice(0, 48);
    reloadFrom(msg);
  };
  cancel.addEventListener("click", renderAll);
  save.addEventListener("click", done);
  area.addEventListener("keydown", (event) => {
    if (event.key === "Escape") renderAll();
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      done();
    }
  });
}

// ---------- the message box ----------
function resizeInput() {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  sendButton.disabled = state.busy || !input.value.trim();
}

input.addEventListener("input", resizeInput);
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || state.busy) return;
  input.value = "";
  resizeInput();
  submit({ text });
});

starters.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    input.value = button.dataset.text;
    resizeInput();
    composer.requestSubmit();
  });
});

// ---------- chats ----------
function newChat() {
  state.chatId = newId();
  state.title = "";
  state.messages = [];
  state.context = null;
  state.busy = false;
  renderAll();
  input.focus();
}

function loadChat(chat) {
  state.chatId = chat.id;
  state.title = chat.title || "";
  state.messages = Array.isArray(chat.messages) ? chat.messages : [];
  state.context = chat.context || null;
  state.busy = false;
  renderAll();
}

// ---------- start ----------
window.FS = {
  state, el, icon, iconButton, formatTime, formatDate, formatPrice, formatStamp, toBottom, airlineLine, placeName,
  newChat, loadChat, renderAll, changed, pushMessage, makeMsg,
  onChange: null, // sidebar.js saves the chat here
  addAssistant(text, extra = {}) {
    const row = pushMessage(makeMsg("assistant", text, extra));
    return row.querySelector(".body");
  },
  addBooking(booking) {
    const who = state.user && state.user.callMe ? `, ${state.user.callMe}` : "";
    const lines = [
      `You're all set${who}! Your ticket is below, and I've put the key times for travel day right under it so you don't have to go hunting. Would you like me to look at a return flight, or help with anything else for this trip?`,
      `Booked${who}, and the hard part is done! You can download your ticket below or have the receipt emailed to you. If you'd like, I can find a return flight or help you pick seats.`,
      `All sorted${who}! Your ticket is ready below, and you can choose your seats whenever you like. Shall I check a return flight for you, or is there anything else I can take off your hands?`,
    ];
    const text = lines[parseInt(booking.reference.slice(3, 5), 16) % lines.length];
    pushMessage(makeMsg("assistant", text, { kind: "booking", local: true, data: { booking } }));
    changed();
  },
  startCheckout: () => {}, // checkout.js replaces this
};

renderAll();

fetch("/api/config")
  .then((r) => r.json())
  .then((config) => {
    state.config = { ...state.config, ...config };
    document.getElementById("aiBadge").textContent = PROVIDER_LABELS[config.aiProvider] || "";
    document.getElementById("demoPill").hidden = !config.sampleFares;
    document.getElementById("fineprint").textContent = config.sampleFares
      ? "Beta mode: sample fares (not real airline prices) and the PayPal sandbox, so no real money moves and no real ticket is issued. Scout can make mistakes."
      : "Scout can make mistakes. Please confirm fares and rules with the airline.";
    if (!state.busy) renderAll(); // draw again now that airline logos and names are known
  })
  .catch(() => {});
