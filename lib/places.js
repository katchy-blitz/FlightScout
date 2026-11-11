// Places people ask for that have no airport Scout can search, and the nearest
// airport Scout does cover. This is a fixed list, not the AI's memory, so the
// answer is the same every time.
//
// status:
//   none     - no airport at all, as far as we know
//   airstrip - no commercial airport, only a small airstrip
//   cargo    - a cargo airport with no passenger flights
//   limited  - has an airport, but little regular passenger service that Scout can search
//
// Based on a published list of Nigerian airports. It reflects what we knew at the last
// update, so please check it before relying on it.

const PLACES = [
  { names: ["kogi", "lokoja", "okene", "kabba"], label: "Kogi", status: "airstrip", nearest: ["ABV", "ILR"] },
  { names: ["nasarawa", "lafia", "keffi"], label: "Nasarawa", status: "cargo", nearest: ["ABV"] },
  { names: ["niger state", "minna", "bida", "suleja", "kontagora"], label: "Niger State", status: "limited", nearest: ["ABV"] },
  { names: ["ogun", "abeokuta", "ijebu ode", "sagamu", "ilishan", "iperu", "gateway airport", "gateway international", "ilishan remo"], label: "Ogun", status: "limited", nearest: ["LOS"] },
  { names: ["osun", "osogbo", "ile-ife", "ife", "ilesa"], label: "Osun", status: "none", nearest: ["IBA", "ILR"] },
  { names: ["ekiti", "ado-ekiti", "ado ekiti"], label: "Ekiti", status: "none", nearest: ["AKR", "IBA"] },
  { names: ["zamfara", "gusau"], label: "Zamfara", status: "airstrip", nearest: ["SKO", "KAD"] },
  { names: ["kebbi", "birnin kebbi"], label: "Kebbi", status: "limited", nearest: ["SKO"] },
  { names: ["jigawa", "dutse", "hadejia"], label: "Jigawa", status: "limited", nearest: ["KAN"] },
  { names: ["katsina"], label: "Katsina", status: "limited", nearest: ["KAN", "KAD"] },
  { names: ["bauchi"], label: "Bauchi", status: "limited", nearest: ["JOS", "GMO"] },
  { names: ["yobe", "damaturu", "potiskum"], label: "Yobe", status: "cargo", nearest: ["MIU"] },
  { names: ["taraba", "jalingo", "wukari"], label: "Taraba", status: "limited", nearest: ["YOL"] },
  { names: ["ebonyi", "abakaliki"], label: "Ebonyi", status: "limited", nearest: ["ENU"] },
  { names: ["anambra", "awka", "onitsha", "nnewi", "umueri", "chinua achebe"], label: "Anambra", status: "limited", nearest: ["ABB", "QOW", "ENU"] },
  { names: ["abia", "umuahia", "aba"], label: "Abia", status: "none", nearest: ["QOW", "QUO"] },
  { names: ["bayelsa", "yenagoa"], label: "Bayelsa", status: "limited", nearest: ["PHC", "QRW"] },
  { names: ["nsukka"], label: "Nsukka", status: "none", nearest: ["ENU"] },
];

const OPENINGS = {
  none: (said) => `${said} doesn't have an airport.`,
  airstrip: (said) => `${said} has no commercial airport, only a small airstrip.`,
  cargo: (said) => `${said} only has a cargo airport, with no passenger flights.`,
  limited: (said) => `there is an airport in or near ${said}, but it has little regular passenger service, so I can't search flights from there yet.`,
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Returns { place, said } if the message names one of these places, else null.
function findNoAirportPlace(text) {
  const t = String(text).toLowerCase();
  for (const place of PLACES) {
    for (const name of place.names) {
      if (new RegExp(`(^|[^a-z])${escapeRe(name)}([^a-z]|$)`).test(t)) {
        const said = name.replace(/(^|[ -])([a-z])/g, (m, a, b) => a + b.toUpperCase());
        return { place, said };
      }
    }
  }
  return null;
}

function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

// The reply Scout gives. airports: the code-to-name map.
function noAirportReply({ place, said }, airports) {
  const names = place.nearest.map((c) => airports[c]);
  const first = names[0];
  const opening = `As of my last update, ${OPENINGS[place.status](said)}`;
  const others = names.length > 1 ? ` ${joinNames(names.slice(1))} ${names.length > 2 ? "are other options" : "is another option"}.` : "";
  return `${opening} The nearest airport I cover is ${first}.${others} You would travel the rest of the way by road.\n\nWould you like me to search using ${first} instead? If yes, just say so and I'll keep the rest of your trip details.`;
}

module.exports = { findNoAirportPlace, noAirportReply, PLACES };
