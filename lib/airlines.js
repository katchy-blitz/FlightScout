// The airlines FlightScout's owner listed, with the websites they gave.
// Scout uses this so it never says a listed airline doesn't exist.
// "fare" is the airline's name in lib/network.js. If it has routes there, we can show (sample) fares for it.
const { NAMES, AIRLINE_NETWORK, routesOf } = require("./network");

const AIRLINES = [
  { name: "Aero Contractors", fare: "Aero Contractors", site: "flyaero.com", match: ["aero contractors", "aero contractor"] },
  { name: "Air Peace", fare: "Air Peace", site: "www.flyairpeace.com", match: ["air peace", "airpeace"] },
  { name: "Arik Air", fare: "Arik Air", site: "arikair.com", match: ["arik air", "arik"] },
  { name: "Azman Air", fare: "Azman Air", site: "www.airazman.com", match: ["azman air", "azman"] },
  { name: "Bayelsa Air", why: "all of its flights start from Yenagoa, which I don't cover yet", site: "charter.flypioneerairlines.com", match: ["bayelsa air"] },
  { name: "Binani Air", fare: "Binani Air", site: "binaniair.com", match: ["binani air", "binani"] },
  { name: "Caliphate Air", why: "it has announced its plans (Abuja, Sokoto and Kano) but, as far as I know, hasn't started flying yet", site: "caliphateair.com", match: ["caliphate air", "caliphate"] },
  { name: "Cally Air", fare: "Cally Air", site: "callyair.crossriverstate.gov.ng", match: ["cally air", "cally"] },
  { name: "Dornier Aviation (Dana Air)", fare: "Dana Air", site: "www.dananig.aero", match: ["dornier aviation", "dana air", "dornier"] },
  { name: "Enugu Air", fare: "Enugu Air", site: "enuguairlines.ng", match: ["enugu air", "enugu airlines"] },
  { name: "Gateway Air", fare: "Gateway Air", site: "", match: ["gateway air"] },
  { name: "Green Africa", fare: "Green Africa", site: "greenafrica.com", match: ["green africa"] },
  { name: "Ibom Air", fare: "Ibom Air", site: "ibomair.com", match: ["ibom air", "ibomair"] },
  { name: "Max Air", fare: "Max Air", site: "maxair.com.ng", match: ["max air", "maxair"] },
  { name: "NG Eagle", fare: "NG Eagle", site: "ngeagle.com", match: ["ng eagle", "ngeagle"] },
  { name: "Overland Airways", fare: "Overland Airways", site: "overlandairways.com", match: ["overland airways", "overland"] },
  { name: "Rano Air", fare: "Rano Air", site: "ranoair.com", match: ["rano air", "rano"] },
  { name: "Umza Air", fare: "Umza Air", site: "www.umzaair.com", match: ["umza air", "umza"] },
  { name: "United Nigeria Airlines", fare: "United Nigeria", site: "flyunitednigeria.com", match: ["united nigeria", "united nigeria airlines"] },
  { name: "ValueJet", fare: "ValueJet", site: "flyvaluejet.com", match: ["valuejet", "value jet"] },
  { name: "XEJet", fare: "XEJet", site: "xejet.com", match: ["xejet", "xe jet"] },
];

const isSearchable = (a) => Boolean(a.fare) && routesOf(a.fare).length > 0;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findAirline(text) {
  const t = String(text).toLowerCase();
  let best = null;
  for (const a of AIRLINES) {
    for (const m of a.match) {
      if (new RegExp(`(^|[^a-z])${esc(m)}([^a-z]|$)`).test(t) && (!best || m.length > best.len)) best = { airline: a, len: m.length };
    }
  }
  return best ? best.airline : null;
}

// For the AI's instructions.
function directoryForPrompt() {
  const known = AIRLINES.map((a) => `${a.name}${a.site ? ` (${a.site})` : ""}${isSearchable(a) ? " [fares searchable]" : ""}`).join("; ");
  return `Airlines FlightScout's owner has listed (treat all of these as real Nigerian airlines; never say one of them does not exist): ${known}.
Only the ones marked [fares searchable] show fares in FlightScout today, and each only on the routes it really flies. For the others, say you know the airline, give its website, and explain that its fares are not connected yet, so the traveller should check its website. Do not invent routes, fleets or schedules for any airline.`;
}

// A question about one airline ("do you know Enugu Air?") is answered from this list, the same way every time.
const ASKING = /\b(know|heard|aware|exist|exists|real|website|site|who is|what is|tell me about|about|do you have|is there)\b/;
const SEARCHING = /\b(from|to)\s+[a-z]/;
function routeList(airline) {
  return routesOf(airline.fare).map(([a, b]) => `${NAMES[a]}–${NAMES[b]}`).join(", ");
}

function airlineReply(text) {
  const t = String(text).toLowerCase();
  const airline = findAirline(t);
  if (!airline) return null;
  const searchable = isSearchable(airline);
  // An airline we can't show fares for is answered from the list however the message is worded
  // ("search Enugu Air flights under 100k"), so the AI never says it doesn't exist.
  if (searchable && (!ASKING.test(t) || SEARCHING.test(t))) return null;
  const site = airline.site ? ` Its website is ${airline.site}.` : "";
  if (searchable) {
    return `Yes, ${airline.name} is one of the airlines I search.${site} On the airports I cover, it flies: ${routeList(airline)}.${(AIRLINE_NETWORK.find((n) => n.name === airline.fare) || {}).lessCertain ? " I'm less sure of its current routes, so please check its website." : ""} The fares I show are samples for the demo. Tell me the route and the day and I'll include it in the results.`;
  }
  return airline.why
    ? `Yes, I know ${airline.name}.${site} I can't show its fares because ${airline.why}. Tell me the route and the day, and I'll search the airlines I do cover.`
    : `Yes, I know ${airline.name}.${site} I can't show or book its fares in FlightScout yet. Tell me the route and the day, and I'll search the airlines I do cover.`;
}

// Remove an airline's name from a message, so that "Enugu Air" is not mistaken for the city Enugu.
function stripAirline(text, airline) {
  let out = String(text);
  for (const m of airline.match) out = out.replace(new RegExp(`(^|[^a-z])${esc(m)}(?![a-z])`, "gi"), "$1that airline");
  return out;
}

// A short note added under the results when the traveller also asked for an airline we can't show.
function airlineNote(airline) {
  return `About ${airline.name}: ${airline.why ? `I can't show its fares because ${airline.why}` : `I can't show or book its fares in FlightScout yet${airline.site ? ` (its website is ${airline.site})` : ""}`}, so the results here are from the airlines I do cover.`;
}

module.exports = { isSearchable, AIRLINES, findAirline, directoryForPrompt, airlineReply, stripAirline, airlineNote };
