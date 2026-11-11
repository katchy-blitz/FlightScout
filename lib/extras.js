// Optional extras at checkout, seat maps and check-in times.
const crypto = require("crypto");
const { AIRLINES } = require("./airlines");

const BAG_PRICE_NGN = 15000; // per extra checked bag, per passenger, per flight (sample price for the beta)
const MAX_BAGS = 2;
const ASSISTANCE = {
  wheelchair: "Wheelchair help at the airport",
  mobility: "Help walking or boarding",
  visual: "Help for low vision or blindness",
  hearing: "Help for hearing difficulty",
  medical: "Medical needs (airline may call you)",
  child: "Help with a young child or infant",
};

// -> { bags, assistance: [labels], codes, note, bagsNGN } or { error }
function cleanExtras(raw, passengers, flights) {
  const e = raw && typeof raw === "object" ? raw : {};
  const bags = Number(e.bags) || 0;
  if (!Number.isInteger(bags) || bags < 0 || bags > MAX_BAGS) return { error: `You can add up to ${MAX_BAGS} extra bags per passenger.` };
  const codes = [...new Set((Array.isArray(e.assistance) ? e.assistance : []).map(String).filter((c) => ASSISTANCE[c]))];
  const note = String(e.note || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  return { bags, codes, assistance: codes.map((c) => ASSISTANCE[c]), note, bagsNGN: bags * passengers * flights * BAG_PRICE_NGN };
}

// ---- seats: 20 rows, A-F (A-C and D-F either side of the aisle) ----
const ROWS = 20;
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const seatOk = (s) => /^([1-9]|1\d|20)[A-F]$/.test(String(s));

// Seats other travellers already hold (sample data, the same every time for one booking).
function takenSeats(reference, flightIndex) {
  const taken = new Set();
  for (let r = 1; r <= ROWS; r++) {
    for (const l of LETTERS) {
      const h = crypto.createHash("sha1").update(`${reference}:${flightIndex}:${r}${l}`).digest()[0];
      if (h < 90) taken.add(`${r}${l}`); // about 35 percent
    }
  }
  return taken;
}

// ---- check-in times (typical, airlines differ) ----
const pad = (n) => String(n).padStart(2, "0");
function minus(local, minutes) {
  const d = new Date(`${String(local).slice(0, 19)}Z`);
  d.setUTCMinutes(d.getUTCMinutes() - minutes);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function siteOf(airlineName) {
  const a = AIRLINES.find((x) => x.name === airlineName || x.fare === airlineName);
  return a && a.site ? `https://${a.site.replace(/^https?:\/\//, "")}` : "";
}
function checkinInfo(flight) {
  return {
    arriveBy: minus(flight.departure, 120),
    counterCloses: minus(flight.departure, 45),
    gateCloses: minus(flight.departure, 20),
    site: siteOf(flight.airline),
  };
}

module.exports = { BAG_PRICE_NGN, MAX_BAGS, ASSISTANCE, cleanExtras, ROWS, LETTERS, seatOk, takenSeats, checkinInfo };
