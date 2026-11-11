require("dotenv").config();
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const { AIRPORTS, understand, activeProvider, brand, getLastAiError, addDays, lagosToday } = require("./lib/ai");
const { toNGN, ngnToUsd, formatNGN, timeOfDay, NGN_PER_USD } = require("./lib/money");
const { saveOffers, getOffer } = require("./lib/offers");
const paypal = require("./lib/paypal");
const store = require("./lib/store");
const mail = require("./lib/mail");
const { cleanProfile } = require("./lib/profile");
const { BAG_PRICE_NGN, MAX_BAGS, ASSISTANCE, cleanExtras, ROWS, LETTERS, seatOk, takenSeats, checkinInfo } = require("./lib/extras");
const { ticketPage, receiptEmail } = require("./lib/receipt");
const { NAMES, airlinesOn } = require("./lib/network");
const fs = require("fs");

// Flight suppliers. Add new ones to this list (see providers/duffel.js).
const providers = [require("./providers/demo"), require("./providers/duffel")];

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.set("trust proxy", 1); // Render sits behind a proxy
app.use("/api/chats", express.json({ limit: "700kb" })); // saved chats can be long
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const CABINS = ["economy", "premium_economy", "business", "first"];
const TIMES = ["anytime", "morning", "afternoon", "evening"];

// --- Simple rate limit per visitor --------------------------------------
// Protects your supplier, AI and PayPal accounts from being hammered by bots.
function rateLimit(max) {
  const hits = new Map();
  const windowMs = 10 * 60 * 1000;
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, times] of hits) if (!times.some((t) => t > cutoff)) hits.delete(ip);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}

// --- Check what the visitor typed, so bad input never reaches a supplier --
function cleanSearch(body = {}) {
  const origin = String(body.origin || "").trim().toUpperCase();
  const destination = String(body.destination || "").trim().toUpperCase();
  const departureDate = String(body.departureDate || "").trim();
  const returnDate = String(body.returnDate || "").trim();
  const cabin = body.cabin || "economy";
  const time = body.time || "anytime";
  const passengers = Math.min(Math.max(parseInt(body.passengers, 10) || 1, 1), 9);

  const isCode = (v) => /^[A-Z]{3}$/.test(v);
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

  if (!isCode(origin) || !isCode(destination) || !departureDate) {
    return { error: "Please enter your origin, destination and departure date." };
  }
  if (origin === destination) return { error: "Origin and destination cannot be the same." };
  if (!isDate(departureDate)) return { error: "That departure date is not valid." };
  // Allow yesterday so a visitor in a timezone ahead of the server is not blocked.
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (departureDate < yesterday) return { error: "Your departure date is in the past." };
  if (returnDate && (!isDate(returnDate) || returnDate < departureDate)) {
    return { error: "Your return date cannot be before your departure date." };
  }
  if (!CABINS.includes(cabin)) return { error: "Please choose a valid cabin class." };
  if (!TIMES.includes(time)) return { error: "Please choose a valid time of day." };

  return { query: { origin, destination, departureDate, returnDate, cabin, time, passengers } };
}

// --- The search itself (used by the form AND by the AI box) ---------------
// options.maxPriceNGN : budget in naira (optional)
// options.preferTime  : "morning" | "afternoon" | "evening" (soft preference)
async function runSearch(query, options = {}) {
  const active = providers.filter((p) => p.isConfigured());
  if (!active.length) {
    const err = new Error("Flight search is not connected yet. Turn on DEMO_MODE or add a supplier token in the server settings.");
    err.status = 503;
    throw err;
  }

  const settled = await Promise.allSettled(active.map((p) => p.search(query)));
  if (settled.every((r) => r.status === "rejected")) {
    const first = settled[0].reason;
    const err = new Error(
      first.name === "AbortError"
        ? "The flight supplier took too long to answer. Please try again."
        : first.message || "The flight supplier could not complete this search."
    );
    err.status = first.status && first.status < 500 ? 502 : 504;
    throw err;
  }

  let offers = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  offers.forEach((o) => {
    o.priceNGN = toNGN(o.price, o.currency);
    o.timeOfDay = timeOfDay(o.departure);
  });

  // Budget: keep flights within it; if none fit, show the cheapest anyway and say so.
  const budget = options.maxPriceNGN || null;
  let overBudget = false;
  let pool = offers;
  if (budget) {
    const within = offers.filter((o) => o.priceNGN != null && o.priceNGN <= budget);
    if (within.length) pool = within;
    else overBudget = offers.length > 0;
  }

  pool.forEach((o) => {
    o.matchesPreference = Boolean(options.preferTime) && o.timeOfDay === options.preferTime;
  });
  const price = (o) => (o.priceNGN == null ? Infinity : o.priceNGN);
  pool.sort((a, b) => Number(b.matchesPreference) - Number(a.matchesPreference) || price(a) - price(b));

  const flights = pool.slice(0, 3);
  saveOffers(flights, { passengers: query.passengers });

  return {
    count: offers.length,
    flights,
    budget: budget ? { maxPriceNGN: budget, overBudget } : null,
    usingSampleFares: flights.some((f) => f.demo),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function dayLabel(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

// No airline we know flies this pair directly. Say so, and suggest going through Lagos or Abuja when that works.
function noDirectReply(ctx) {
  const { origin, destination } = ctx;
  if (!origin || !destination || airlinesOn(origin, destination).length) return null;
  const from = NAMES[origin] || origin;
  const to = NAMES[destination] || destination;
  let text = `I don't know of any airline that flies directly between ${from} and ${to}.`;
  const via = ["LOS", "ABV"].filter((hub) => hub !== origin && hub !== destination && airlinesOn(origin, hub).length && airlinesOn(hub, destination).length);
  if (via.length) {
    text += ` You could fly via ${NAMES[via[0]]}: ${from} to ${NAMES[via[0]]}, then ${NAMES[via[0]]} to ${to}. Want me to search that as two flights? Just tell me the date for each.`;
  } else {
    text += " Try another route or nearby airport.";
  }
  return text;
}

// "15:45" -> "3:45 pm", the same way the flight cards show times
function clock12(local) {
  const [h, m] = String(local).slice(11, 16).split(":").map(Number);
  if (Number.isNaN(h)) return "";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

function summarise(result, ctx) {
  const { flights, budget } = result;
  if (!flights.length) {
    return ctx.cabin === "first"
      ? "No Nigerian domestic airline sells first class. Business is the top cabin on these routes. Want me to check business class?"
      : noDirectReply(ctx) || "I couldn't find any flights for that. Try another date, time or cabin class.";
  }
  const best = [...flights].sort((x, y) => (x.priceNGN ?? Infinity) - (y.priceNGN ?? Infinity))[0];
  const cost = best.priceNGN != null ? formatNGN(best.priceNGN) : `${best.price} ${best.currency}`;

  if (budget && budget.overBudget) {
    const gap = best.priceNGN != null ? best.priceNGN - budget.maxPriceNGN : null;
    return `Nothing is under ${formatNGN(budget.maxPriceNGN)} on ${dayLabel(ctx.departureDate)}. The cheapest is ${best.airline} at ${clock12(best.departure)} for ${cost}${gap > 0 ? `, which is ${formatNGN(gap)} over your budget` : ""}. I'm showing the cheapest options so you can still decide.`;
  }

  const top = flights[0];
  const topCost = top.priceNGN != null ? formatNGN(top.priceNGN) : `${top.price} ${top.currency}`;
  let text = `Here ${flights.length > 1 ? `are the top ${flights.length} options` : "is the best option"} for ${dayLabel(ctx.departureDate)}. Top pick: ${top.airline} at ${clock12(top.departure)} for ${topCost}`;
  if (top.matchesPreference) text += `, which fits your ${ctx.timePreference} preference`;
  text += ".";
  if (budget) text += ` Everything shown is within your ${formatNGN(budget.maxPriceNGN)} budget.`;
  return text;
}

// --- Turn the conversation's search into something runSearch understands ---
function queryFromContext(ctx, overrides = {}) {
  const c = { ...ctx, ...overrides };
  return cleanSearch({
    origin: c.origin, destination: c.destination, departureDate: c.departureDate,
    returnDate: c.returnDate, cabin: c.cabin, passengers: c.passengers,
    time: c.timeIsStrict ? c.timePreference : "anytime",
  });
}

function optionsFromContext(ctx) {
  return {
    maxPriceNGN: ctx.maxPriceNGN,
    preferTime: !ctx.timeIsStrict && ctx.timePreference !== "anytime" ? ctx.timePreference : null,
  };
}

// Checks the days around the chosen one with real searches, never guesses.
// Normally: the day before and after, suggested only if at least ₦5,000 cheaper.
// When nothing fits the budget: two days either side, looking for days that DO fit.
async function nearbyDays(ctx, mainResult) {
  const base = mainResult.flights[0];
  if (!base || base.priceNGN == null) return [];
  const over = Boolean(mainResult.budget && mainResult.budget.overBudget);
  const today = lagosToday().date;

  const checks = (over ? [-2, -1, 1, 2] : [-1, 1]).map(async (offset) => {
    const date = addDays(ctx.departureDate, offset);
    if (date < today) return null;
    if (ctx.returnDate && date > ctx.returnDate) return null;
    const { query, error } = queryFromContext(ctx, { departureDate: date });
    if (error) return null;
    const result = await runSearch(query, optionsFromContext(ctx));
    const flight = [...result.flights].sort((a, b) => (a.priceNGN ?? Infinity) - (b.priceNGN ?? Infinity))[0];
    if (!flight || flight.priceNGN == null) return null;
    const saving = base.priceNGN - flight.priceNGN;
    const fitsBudget = over && !(result.budget && result.budget.overBudget);
    const ok = over ? fitsBudget : saving >= 5000;
    return ok ? { date, label: dayLabel(date), flight, saving, fitsBudget } : null;
  });

  const settled = await Promise.allSettled(checks);
  return settled
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value)
    .sort((a, b) => b.saving - a.saving);
}

// Keep only the fields we expect from the browser's copy of the search.
function cleanContext(c) {
  if (!c || typeof c !== "object") return null;
  const str = (v) => (typeof v === "string" ? v.slice(0, 12) : null);
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    origin: str(c.origin), destination: str(c.destination),
    departureDate: str(c.departureDate) || "", returnDate: str(c.returnDate) || "",
    cabin: str(c.cabin) || "economy", passengers: num(c.passengers) || 1,
    timePreference: str(c.timePreference) || "anytime", timeIsStrict: Boolean(c.timeIsStrict),
    maxPriceNGN: num(c.maxPriceNGN),
    legs: Array.isArray(c.legs) && c.legs.length >= 2
      ? c.legs.slice(0, 5).map((l) => ({ origin: str(l?.origin), destination: str(l?.destination), date: str(l?.date) || "" }))
      : undefined,
  };
}

// --- Multi-city: 2 to 5 separate flights in order ---------------------------
function cleanLegs(legs) {
  if (!Array.isArray(legs) || legs.length < 2 || legs.length > 5) return { error: "A multi-city trip needs between 2 and 5 flights." };
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const clean = [];
  for (const [i, l] of legs.entries()) {
    const origin = String(l?.origin || "").toUpperCase();
    const destination = String(l?.destination || "").toUpperCase();
    const date = String(l?.date || "");
    if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination)) return { error: `Flight ${i + 1}: I need both airports.` };
    if (origin === destination) return { error: `Flight ${i + 1}: the start and end are the same airport.` };
    if (!isDate(date)) return { error: `Flight ${i + 1}: which day do you want to travel?` };
    if (date < yesterday) return { error: `Flight ${i + 1}: that date is in the past.` };
    if (clean.length && date < clean[clean.length - 1].date) return { error: `Flight ${i + 1} is dated before flight ${i}. Please check the order of your dates.` };
    clean.push({ origin, destination, date });
  }
  return { legs: clean };
}

async function multiReply(ctx, assumptions, provider) {
  const { legs, error } = cleanLegs(ctx.legs);
  if (error) return { reply: error, context: ctx, aiProvider: provider };

  const results = [];
  for (const leg of legs) {
    const { query, error: qErr } = queryFromContext(ctx, { origin: leg.origin, destination: leg.destination, departureDate: leg.date, returnDate: "" });
    if (qErr) return { reply: qErr, context: ctx, aiProvider: provider };
    results.push(await runSearch(query, optionsFromContext(ctx)));
  }

  const cheap = (r) => Math.min(...r.flights.map((f) => f.priceNGN ?? Infinity));
  const trip = {
    legs: legs.map((l, i) => ({
      index: i, origin: l.origin, destination: l.destination, date: l.date, label: dayLabel(l.date),
      flights: results[i].flights, overBudget: Boolean(results[i].budget && results[i].budget.overBudget),
    })),
  };
  const empty = trip.legs.filter((l) => !l.flights.length);
  const total = results.every((r) => r.flights.length) ? results.reduce((sum, r) => sum + cheap(r), 0) : null;

  let reply;
  if (empty.length) {
    reply = empty
      .map((l) => noDirectReply({ origin: l.origin, destination: l.destination }) || `I couldn't find flights for ${NAMES[l.origin] || l.origin} to ${NAMES[l.destination] || l.destination} on ${l.label}. Try another date or cabin class.`)
      .join(" ");
  } else {
    reply = `Here are the cheapest options for each of your ${legs.length} flights. Taking the cheapest on every leg, the whole trip comes to about ${formatNGN(total)}.`;
    const over = trip.legs.filter((l) => l.overBudget);
    if (over.length) {
      reply += ` Heads up: ${over.map((l) => `nothing was under ${formatNGN(ctx.maxPriceNGN)} for ${l.origin} to ${l.destination} (cheapest ${formatNGN(cheap(results[l.index]))})`).join("; ")}.`;
    } else if (ctx.maxPriceNGN) {
      reply += ` Every flight shown is within your ${formatNGN(ctx.maxPriceNGN)} budget per flight.`;
    }
    reply += " Choose one flight for each leg and I'll book them together in one payment.";
  }
  trip.totalNGN = total;

  return {
    reply, context: ctx, assumptions, trip,
    usingSampleFares: results.some((r) => r.usingSampleFares),
    aiProvider: provider,
  };
}

// Run the search for a conversation and shape the chat reply.
async function searchReply(ctx, assumptions, provider) {
  if (ctx.legs && ctx.legs.length >= 2) return multiReply(ctx, assumptions, provider);
  const { query, error } = queryFromContext(ctx);
  if (error) return { reply: error, context: ctx, aiProvider: provider };

  const result = await runSearch(query, optionsFromContext(ctx));
  let suggestions = [];
  if (result.flights.length) {
    try { suggestions = await nearbyDays(ctx, result); } catch (err) { console.error("Nearby days failed:", err.message); }
  }

  let reply = summarise(result, ctx);
  if (result.budget && result.budget.overBudget && result.flights.length) {
    const fits = suggestions.filter((s) => s.fitsBudget);
    if (fits.length) {
      reply += ` Good news: ${fits[0].label} has a flight for ${formatNGN(fits[0].flight.priceNGN)} that fits your budget.`;
    } else {
      reply += ` I also checked two days either side and nothing fits ${formatNGN(result.budget.maxPriceNGN)} there either, so the realistic options are to raise your budget a little or try a different route or week.`;
    }
  }

  return {
    reply,
    context: ctx,
    assumptions,
    flights: result.flights,
    suggestions: suggestions.slice(0, 2),
    budget: result.budget,
    usingSampleFares: result.usingSampleFares,
    aiProvider: provider,
  };
}

function sendError(res, err) {
  console.error("Request error:", err.message);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong." });
}

// Airline logos you have added to public/logos (for example valuejet.svg or air-peace.png).
function logoMap() {
  const out = {};
  try {
    for (const f of fs.readdirSync(path.join(__dirname, "public", "logos"))) {
      const m = f.match(/^([a-z0-9-]+)\.(svg|png|webp|jpg)$/i);
      if (m) out[m[1].toLowerCase()] = `/logos/${f}`;
    }
  } catch { /* no logos folder yet */ }
  return out;
}

app.use("/api", attachUser); // so every /api route knows who is signed in

app.get("/api/config", (req, res) => {
  res.json({
    paypalClientId: paypal.isConfigured() ? process.env.PAYPAL_CLIENT_ID : null,
    paypalEnv: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
    aiProvider: brand(activeProvider()),
    sampleFares: providers[0].isConfigured(),
    ngnPerUsd: NGN_PER_USD,
    logos: logoMap(),
    airports: AIRPORTS,
    emailConfigured: mail.configured(),
    extras: { bagPriceNGN: BAG_PRICE_NGN, maxBags: MAX_BAGS, assistance: ASSISTANCE },
  });
});

// Form search
app.post("/api/flights/search", rateLimit(20), async (req, res) => {
  const { query, error } = cleanSearch(req.body);
  if (error) return res.status(400).json({ error });
  try {
    const result = await runSearch(query);
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, err);
  }
});

// The chat. The browser sends the message, the search so far, and recent history.
//   { text, context, history }                      a normal message
//   { action: "change_date", date, context }        the "cheaper day" buttons
app.post("/api/chat", rateLimit(30), async (req, res) => {
  try {
    const ctx = cleanContext(req.body?.context);

    if (req.body?.action === "change_date") {
      const date = String(req.body.date || "");
      if (!ctx || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "That date is not valid." });
      const next = { ...ctx, departureDate: date };
      // Keep a return trip valid when the outbound day moves.
      if (next.returnDate && next.returnDate < date) next.returnDate = "";
      return res.json(await searchReply(next, [], activeProvider()));
    }

    const text = String(req.body?.text || "").trim().slice(0, 500);
    if (text.length < 2) return res.status(400).json({ error: "Type a message first." });

    // The flights on screen, so the AI can tell which one "the first one" or "the 7:30" means.
    const shown = (Array.isArray(req.body?.shown) ? req.body.shown : []).slice(0, 3).map((f) => ({
      airline: String(f?.airline || "").slice(0, 40),
      time: String(f?.time || "").slice(0, 5),
      priceNGN: Number(f?.priceNGN) || 0,
    }));

    const u = await understand(text, { context: ctx, history: req.body?.history, shown, who: req.user ? req.user.callMe : "" });

    // If the traveller also named an airline we can't show fares for, say so under the answer.
    const send = (body) => {
      const notes = [u.airlineNote];
      const c = body.context;
      if (u.airlineAsked && c && c.origin && c.destination && !(c.legs && c.legs.length >= 2) && body.flights && !airlinesOn(c.origin, c.destination).some((a) => a.name === u.airlineAsked)) {
        notes.push(`${u.airlineAsked} doesn't fly ${NAMES[c.origin] || c.origin} to ${NAMES[c.destination] || c.destination} as far as I know, so these are the airlines that do.`);
      }
      const extra = notes.filter(Boolean).join("\n\n");
      res.json(extra && body.reply ? { ...body, reply: `${body.reply}\n\n${extra}` } : body);
    };

    if (u.intent === "select") {
      return send({ select: u.selectIndex, reply: u.reply, context: ctx, aiProvider: u.provider });
    }

    if (u.intent === "question") {
      const answer = u.reply || "I'm not sure about that one.";
      // The reminder only belongs on real answers about rules, not on a hello or a one-liner.
      const reminder = answer.length > 90 ? "\n\nPlease confirm this with the airline before you travel, as rules can change." : "";
      return send({
        reply: `${answer}${reminder}`,
        context: ctx, aiProvider: u.provider,
      });
    }
    if (u.intent === "other") {
      return send({ reply: u.reply || "Tell me where you would like to fly, and on which day.", context: ctx, aiProvider: u.provider });
    }
    if (u.clarification) {
      return send({ reply: u.clarification, context: u.context, aiProvider: u.provider });
    }

    send(await searchReply(u.context, u.assumptions, u.provider));
  } catch (err) {
    sendError(res, err);
  }
});

// --- Checkout with PayPal -------------------------------------------------
const pendingOrders = new Map(); // PayPal order id -> what is being bought
const bookings = new Map(); // PayPal order id -> confirmed booking

function cleanTravellers(body, count) {
  const nameOk = (v) => /^[\p{L}][\p{L} .'-]{1,39}$/u.test(v);
  const passengers = Array.isArray(body.passengers) ? body.passengers : [];
  if (passengers.length !== count) return { error: `Please enter details for all ${count} passenger(s).` };

  const clean = [];
  for (const [i, p] of passengers.entries()) {
    const firstName = String(p.firstName || "").trim();
    const lastName = String(p.lastName || "").trim();
    const dob = String(p.dateOfBirth || "").trim();
    if (!nameOk(firstName) || !nameOk(lastName)) return { error: `Passenger ${i + 1}: enter first and last name exactly as on their ID.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob)) || dob >= new Date().toISOString().slice(0, 10)) {
      return { error: `Passenger ${i + 1}: enter a valid date of birth.` };
    }
    clean.push({ firstName, lastName, dateOfBirth: dob });
  }

  const email = String(body.contact?.email || "").trim();
  const phone = String(body.contact?.phone || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (!/^\+?[\d\s-]{7,20}$/.test(phone)) return { error: "Enter a valid phone number." };

  return { passengers: clean, contact: { email, phone } };
}

app.post("/api/paypal/create-order", rateLimit(20), async (req, res) => {
  try {
    if (!paypal.isConfigured()) {
      return res.status(503).json({ error: "PayPal is not connected yet. Add your PayPal sandbox client ID and secret to the server settings." });
    }
    // One flight (offerId) or a multi-city trip (offerIds): paid for in one go.
    const ids = [...new Set((Array.isArray(req.body?.offerIds) ? req.body.offerIds : [req.body?.offerId]).map((v) => String(v || "")).filter(Boolean))].slice(0, 5);
    if (!ids.length) return res.status(400).json({ error: "Please choose a flight first." });

    const items = ids.map(getOffer);
    if (items.some((i) => !i)) return res.status(410).json({ error: "A fare has expired. Please search again." });
    if (items.some((i) => !i.offer.bookable)) return res.status(409).json({ error: "Booking is not switched on for this supplier yet." });
    const count = items[0].context.passengers;
    if (items.some((i) => i.context.passengers !== count)) return res.status(400).json({ error: "These flights were searched for different numbers of passengers. Please search again." });
    if (items.some((i) => i.offer.priceNGN == null)) return res.status(409).json({ error: "A fare could not be priced. Please search again." });

    const who = cleanTravellers(req.body, count);
    if (who.error) return res.status(400).json({ error: who.error });

    const offers = items.map((i) => i.offer);
    const extras = cleanExtras(req.body?.extras, count, offers.length);
    if (extras.error) return res.status(400).json({ error: extras.error });
    const totalNGN = offers.reduce((sum, o) => sum + o.priceNGN, 0) + extras.bagsNGN;
    const usd = ngnToUsd(totalNGN);
    const order = await paypal.createOrder({
      usdAmount: usd,
      offerId: ids.join(",").slice(0, 120),
      description: offers.map((o) => `${o.airline} ${o.origin}-${o.destination} ${o.departure.slice(0, 10)}`).join("; ").slice(0, 120),
    });

    pendingOrders.set(order.id, { offers, usd, totalNGN, travellers: who, extras, createdAt: Date.now() });
    res.json({ id: order.id, usd, ngn: totalNGN });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/paypal/capture-order", rateLimit(20), async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || "");
    if (bookings.has(orderId)) return res.json(bookings.get(orderId)); // already done: same answer

    const pending = pendingOrders.get(orderId);
    if (!pending) return res.status(404).json({ error: "We don't recognise this payment. Please start again." });

    const capture = await paypal.captureOrder(orderId);
    const part = capture.purchase_units?.[0]?.payments?.captures?.[0];
    if (capture.status !== "COMPLETED" || part?.status !== "COMPLETED") {
      return res.status(402).json({ error: "PayPal has not completed this payment. You have not been charged for a booking." });
    }
    if (part.amount?.currency_code !== "USD" || Math.abs(Number(part.amount.value) - pending.usd) > 0.005) {
      console.error("Amount mismatch", part.amount, pending.usd);
      return res.status(409).json({ error: "The amount paid did not match the fare. Please contact support." });
    }

    const { offers, travellers, extras } = pending;
    const flights = offers.map((offer) => ({
      airline: offer.airline, flightNumber: offer.flightNumber,
      origin: offer.origin, destination: offer.destination,
      departure: offer.departure, arrival: offer.arrival,
      returnDeparture: offer.returnDeparture, returnArrival: offer.returnArrival,
      cabin: offer.cabin,
      checkin: checkinInfo(offer),
    }));
    const booking = {
      reference: `FS-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      status: offers.every((o) => o.demo) ? "CONFIRMED (beta booking, sandbox payment, no real ticket issued)" : "CONFIRMED",
      flights,
      flight: flights[0], // kept for older screens
      passengers: travellers.passengers.map((p) => `${p.firstName} ${p.lastName}`),
      email: travellers.contact.email,
      paid: { usd: pending.usd, ngn: pending.totalNGN, paypalCaptureId: part.id },
      extras: { bags: extras.bags, assistance: extras.assistance, note: extras.note, bagsNGN: extras.bagsNGN },
      seats: {},
    };
    bookings.set(orderId, booking);
    store.saveBooking(booking);
    pendingOrders.delete(orderId);
    res.json(booking);
  } catch (err) {
    sendError(res, err);
  }
});

// --- Accounts and saved chats ---------------------------------------------
// Guests can chat and book without an account. Chats are only saved on the server
// for signed-in users.
function readCookie(req, name) {
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function setSession(req, res, userId) {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `fs_session=${encodeURIComponent(store.makeSession(userId))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}${secure}`);
}
function clearSession(res) {
  res.setHeader("Set-Cookie", "fs_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}
function attachUser(req, res, next) {
  const id = store.readSession(readCookie(req, "fs_session"));
  req.userId = id;
  req.user = id ? store.getUser(id) : null;
  next();
}
function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in first." });
  next();
}

app.get("/api/me", (req, res) => res.json({ user: req.user }));

// Sends the code and tells the browser to show the "enter your code" step.
// If email isn't set up (local testing or a demo), SHOW_CODE_ON_SCREEN=true shows the code on screen instead.
async function sendCode(res, { user, code }, status = 200) {
  const result = await mail.sendVerificationCode({ to: user.email, name: user.name, code });
  const body = { needsVerification: true, email: user.email, emailSent: result.sent };
  if (!result.sent && process.env.SHOW_CODE_ON_SCREEN === "true") body.devCode = code;
  if (!result.sent && !body.devCode) body.error = "We could not send the email right now. Please try again in a few minutes.";
  res.status(body.error ? 503 : status).json(body);
}

app.post("/api/auth/signup", rateLimit(10), async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 40);
    const email = String(req.body?.email || "").trim().slice(0, 120);
    const password = String(req.body?.password || "");
    if (name.length < 1) return res.status(400).json({ error: "Please enter your name." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (password.length < 8 || password.length > 100) return res.status(400).json({ error: "Your password needs at least 8 characters." });
    const profile = cleanProfile(req.body);
    if (profile.error) return res.status(400).json({ error: profile.error });
    const made = store.createUser({ name, email, password, gender: profile.gender, age: profile.age });
    if (made.exists) return res.status(409).json({ error: made.error, exists: true });
    if (made.error) return res.status(429).json({ error: made.error });
    await sendCode(res, made);
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/auth/verify", rateLimit(20), (req, res) => {
  const done = store.verifyEmail(String(req.body?.email || "").slice(0, 120), String(req.body?.code || "").slice(0, 10));
  if (done.error) return res.status(400).json({ error: done.error });
  setSession(req, res, done.user.id);
  res.json({ user: done.user });
});

app.post("/api/auth/resend", rateLimit(10), async (req, res) => {
  try {
    const again = store.resendCode(String(req.body?.email || "").slice(0, 120));
    if (again.error) return res.status(429).json({ error: again.error });
    if (!again.user) return res.json({ needsVerification: true, emailSent: true }); // same answer for any email
    await sendCode(res, again);
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/auth/signin", rateLimit(15), async (req, res) => {
  try {
    const found = store.signIn(String(req.body?.email || "").slice(0, 120), String(req.body?.password || "").slice(0, 100));
    if (found.error) return res.status(401).json({ error: found.error });
    if (found.unverified) {
      // The password was right but the email was never verified: send a new code.
      const again = store.resendCode(found.user.email);
      if (again.user) return sendCode(res, again, 403);
      return res.status(403).json({ needsVerification: true, email: found.user.email, emailSent: true });
    }
    setSession(req, res, found.user.id);
    res.json({ user: found.user });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/api/auth/signout", (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.put("/api/me/profile", requireUser, (req, res) => {
  const profile = cleanProfile(req.body);
  if (profile.error) return res.status(400).json({ error: profile.error });
  const name = String(req.body?.name || "").trim().slice(0, 40);
  res.json({ user: store.updateProfile(req.userId, { name, gender: profile.gender, age: profile.age }) });
});

app.delete("/api/account", requireUser, (req, res) => {
  store.deleteUser(req.userId);
  clearSession(res);
  res.json({ ok: true });
});

app.get("/api/chats", requireUser, (req, res) => {
  res.json({ chats: store.listChats(req.userId, String(req.query.q || "").slice(0, 80)) });
});

app.delete("/api/chats", requireUser, (req, res) => {
  store.deleteAllChats(req.userId);
  res.json({ ok: true });
});

app.get("/api/chats/:id", requireUser, (req, res) => {
  const chat = store.getChat(req.userId, req.params.id);
  if (!chat) return res.status(404).json({ error: "That chat was not found." });
  res.json(chat);
});

app.put("/api/chats/:id", requireUser, (req, res) => {
  const id = String(req.params.id);
  if (!/^[a-z0-9]{6,32}$/.test(id)) return res.status(400).json({ error: "Bad chat id." });
  const title = String(req.body?.title || "New chat").slice(0, 80);
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-300) : [];
  const context = req.body?.context && typeof req.body.context === "object" ? req.body.context : null;
  res.json(store.saveChat(req.userId, id, { title, messages, context }));
});

app.delete("/api/chats/:id", requireUser, (req, res) => {
  store.deleteChat(req.userId, String(req.params.id));
  res.json({ ok: true });
});

// --- Booking extras: seats, ticket page, receipt email -----------------------
// A booking is found by its reference AND the email used at checkout.
function findBooking(req) {
  const booking = store.getBooking(String(req.params.ref || "").slice(0, 20));
  const email = String(req.query.email || req.body?.email || "").trim().toLowerCase();
  if (!booking || !email || booking.email.toLowerCase() !== email) return null;
  return booking;
}

function seatInfo(booking) {
  return booking.flights.map((f, i) => {
    const mine = Object.values((booking.seats || {})[i] || {});
    const taken = [...takenSeats(booking.reference, i)].filter((s) => !mine.includes(s));
    return { taken };
  });
}

app.get("/api/bookings/:ref", rateLimit(60), (req, res) => {
  const booking = findBooking(req);
  if (!booking) return res.status(404).json({ error: "We could not find that booking." });
  res.json({ booking, seatMap: { rows: ROWS, letters: LETTERS, flights: seatInfo(booking) } });
});

app.post("/api/bookings/:ref/seat", rateLimit(60), (req, res) => {
  const booking = findBooking(req);
  if (!booking) return res.status(404).json({ error: "We could not find that booking." });
  const flight = Number(req.body?.flight);
  const passenger = Number(req.body?.passenger);
  const seat = String(req.body?.seat || "").toUpperCase();
  if (!Number.isInteger(flight) || !booking.flights[flight]) return res.status(400).json({ error: "That flight is not part of this booking." });
  if (!Number.isInteger(passenger) || !booking.passengers[passenger]) return res.status(400).json({ error: "That passenger is not part of this booking." });
  if (!seatOk(seat)) return res.status(400).json({ error: "Please pick a seat from the map." });
  const mineNow = (booking.seats = booking.seats || {});
  const onFlight = (mineNow[flight] = mineNow[flight] || {});
  const heldByOther = Object.entries(onFlight).some(([p, s]) => Number(p) !== passenger && s === seat);
  if (heldByOther || takenSeats(booking.reference, flight).has(seat)) return res.status(409).json({ error: "Sorry, that seat has just been taken. Please pick another." });
  onFlight[passenger] = seat;
  store.saveBooking(booking);
  res.json({ booking });
});

app.get("/api/bookings/:ref/ticket", rateLimit(60), (req, res) => {
  const booking = findBooking(req);
  if (!booking) return res.status(404).send("We could not find that booking.");
  res.type("html").send(ticketPage(booking));
});

app.post("/api/bookings/:ref/receipt", rateLimit(8), async (req, res) => {
  try {
    const booking = findBooking(req);
    if (!booking) return res.status(404).json({ error: "We could not find that booking." });
    const to = String(req.body?.to || "").trim().slice(0, 120);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (!mail.configured()) return res.status(501).json({ notConfigured: true, error: "Email sending is not switched on in this beta." });
    const who = req.user ? req.user.callMe : "";
    const message = receiptEmail(booking, who);
    const result = await mail.sendMessage({ to, name: booking.passengers[0], ...message });
    if (!result.sent) return res.status(502).json({ error: "We could not send the email right now. Please try again in a few minutes." });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "FlightScout server is running",
    suppliers: providers.map((p) => ({ name: p.name, connected: p.isConfigured() })),
    ai: brand(activeProvider()),
    aiLastError: getLastAiError(),
    paypalConnected: paypal.isConfigured(),
    emailConfigured: mail.configured(),
  });
});

store.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`FlightScout running at http://localhost:${PORT}`);
    console.log(mail.configured() ? "Email: set up (verification codes are emailed)." : `Email: NOT set up. ${process.env.SHOW_CODE_ON_SCREEN === "true" ? "Codes are shown on screen (demo setting)." : "Sign-up cannot send codes until you set BREVO_API_KEY and MAIL_FROM."}`);
  });
});
