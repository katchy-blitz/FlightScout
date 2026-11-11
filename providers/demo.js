// SAMPLE FARES for the hackathon demo.
// These are generated, NOT real airline prices or schedules. They let anyone
// (judges included) run the whole flow without airline accounts.
// Turn on with DEMO_MODE=true. The website labels these clearly.

const { airlinesOn, distanceKm } = require("../lib/network");

// Typical one-way economy fare in naira, and flight minutes, for routes we have set by hand.
// Any other pair is estimated from the distance between the airports.
const ROUTES = {
  "ABV-LOS": [95000, 75], "ENU-LOS": [90000, 70], "LOS-PHC": [88000, 70],
  "KAN-LOS": [110000, 100], "BNI-LOS": [70000, 50], "IBA-LOS": [60000, 40],
  "LOS-MIU": [125000, 120], "ABV-ENU": [80000, 55], "ABV-PHC": [85000, 65],
  "ABV-KAN": [75000, 60], "ABV-BNI": [78000, 65], "ABV-IBA": [82000, 70],
  "ABV-MIU": [90000, 80], "ENU-PHC": [65000, 45], "ENU-KAN": [95000, 85],
};

function routeBasics(origin, destination) {
  const key = [origin, destination].sort().join("-");
  if (ROUTES[key]) return ROUTES[key];
  const km = distanceKm(origin, destination);
  if (km == null) return [95000, 75];
  return [Math.round((35000 + km * 110) / 500) * 500, Math.round(25 + km / 10)];
}
const CABIN_MULTIPLIER = { economy: 1, premium_economy: 1.6, business: 2.7 };
// Fridays and Sundays are the busiest days, midweek and Saturday the cheapest.
// (Sample pattern for the demo, so "a cheaper day" suggestions have something to find.)
const WEEKDAY_FACTOR = [1.15, 1.05, 0.92, 0.9, 1.0, 1.18, 0.93]; // Sun..Sat
const SLOTS = ["06:15", "07:30", "09:00", "10:45", "12:30", "14:00", "15:45", "17:30", "19:00", "20:15"];

function isConfigured() {
  return process.env.DEMO_MODE === "true";
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Small repeatable random numbers, so the same search gives the same fares.
function seeded(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addMinutes(local, minutes) {
  const d = new Date(`${local}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

function slotsFor(time) {
  if (time === "morning") return SLOTS.filter((s) => s < "12:00");
  if (time === "afternoon") return SLOTS.filter((s) => s >= "12:00" && s < "17:00");
  if (time === "evening") return SLOTS.filter((s) => s >= "17:00");
  return SLOTS;
}

async function search({ origin, destination, departureDate, returnDate, passengers, cabin, time }) {
  const [basePrice, minutes] = routeBasics(origin, destination);
  const daysAway = Math.max(0, Math.round((Date.parse(departureDate) - Date.now()) / 86400000));
  const urgency = daysAway < 3 ? 1.25 : daysAway < 7 ? 1.1 : 1;
  const dayFactor = WEEKDAY_FACTOR[new Date(`${departureDate}T00:00:00Z`).getUTCDay()];
  const slots = slotsFor(time);
  const offers = [];

  // Only airlines that really fly this route (see lib/network.js) get fares.
  airlinesOn(origin, destination).filter((a) => a.cabins.includes(cabin)).forEach((airline, index) => {
    const seed = hash(`${origin}${destination}${departureDate}${returnDate}${cabin}${airline.name}`);
    const rand = seeded(seed);

    // Each airline offers up to two departures a day.
    const picks = [...new Set([Math.floor(rand() * slots.length), Math.floor(rand() * slots.length)])];
    picks.forEach((slotIndex, n) => {
      if (!slots.length) return;
      const oneWay = basePrice * airline.factor * CABIN_MULTIPLIER[cabin] * urgency * dayFactor * (0.9 + rand() * 0.35);
      const legs = returnDate ? 1.9 : 1;
      const total = Math.round((oneWay * legs * passengers) / 500) * 500;
      const departure = `${departureDate}T${slots[slotIndex]}:00`;
      const flightNumber = String(100 + Math.floor(rand() * 800));

      let returnDeparture = null;
      let returnArrival = null;
      if (returnDate) {
        returnDeparture = `${returnDate}T${SLOTS[Math.floor(rand() * SLOTS.length)]}:00`;
        returnArrival = addMinutes(returnDeparture, minutes);
      }

      offers.push({
        id: `demo_${seed.toString(36)}_${index}${n}`,
        supplier: "Sample fares",
        demo: true,
        bookable: true,
        price: total,
        currency: "NGN",
        cabin,
        airline: airline.name,
        airlineCode: "",
        flightNumber,
        departure,
        arrival: addMinutes(departure, minutes),
        origin,
        destination,
        stops: 0,
        returnDeparture,
        returnArrival,
        expiresAt: null,
      });
    });
  });

  return offers;
}

module.exports = { name: "Sample fares", isConfigured, search };
