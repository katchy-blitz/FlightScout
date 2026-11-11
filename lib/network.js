// Which airline flies which routes, for the SAMPLE FARES.
//
// The fares are generated, but the routes are meant to be real: an airline only gets
// fares on routes it is reported to fly. Built from public route listings and news
// reports up to November 2026. Airlines change routes often, and for some smaller
// carriers the information is thin (marked "less certain"), so treat this as a sample
// network, not a timetable. Only airports FlightScout covers are included; routes to
// other places (Minna, Ado Ekiti, Bauchi, Katsina, Iperu/Gateway, Yenagoa) are left out.
//
// A route is written "AAA-BBB" and works in both directions.

const AIRLINE_NETWORK = [
  {
    name: "Air Peace", factor: 1.0, cabins: ["economy", "premium_economy", "business"],
    routes: ["LOS-ABV", "LOS-PHC", "LOS-ENU", "LOS-KAN", "LOS-QOW", "LOS-QUO", "LOS-CBQ", "LOS-ABB", "LOS-BNI", "LOS-QRW", "LOS-ILR", "LOS-AKR", "LOS-YOL", "LOS-KAD", "LOS-MDI", "ABV-MDI",
      "ABV-PHC", "ABV-ENU", "ABV-KAN", "ABV-QOW", "ABV-QUO", "ABV-CBQ", "ABV-ABB", "ABV-BNI", "ABV-QRW", "ABV-ILR", "ABV-IBA", "ABV-YOL", "ABV-MIU",
      "ENU-KAN", "ENU-ABB", "PHC-KAN", "PHC-KAD", "KAN-QOW", "KAN-ABB"],
  },
  {
    name: "Ibom Air", factor: 1.05, cabins: ["economy", "business"],
    routes: ["LOS-ABV", "LOS-QUO", "LOS-CBQ", "LOS-PHC", "LOS-ENU", "ABV-QUO", "ABV-CBQ", "ABV-PHC", "ABV-ENU"],
  },
  {
    name: "United Nigeria", factor: 0.92, cabins: ["economy"],
    routes: ["LOS-ABV", "LOS-PHC", "LOS-ENU", "LOS-KAN", "LOS-QRW", "LOS-ABB", "LOS-BNI", "LOS-SKO", "LOS-ILR", "LOS-QOW",
      "ABV-PHC", "ABV-BNI", "ABV-KAN", "ABV-ENU", "ABV-QRW", "ABV-ABB", "ABV-ILR", "ABV-QOW"],
  },
  {
    name: "ValueJet", factor: 0.88, cabins: ["economy"],
    routes: ["LOS-ABV", "LOS-PHC", "LOS-CBQ", "LOS-JOS", "LOS-QOW", "ABV-PHC", "ABV-KAN", "ABV-CBQ", "ABV-JOS"],
  },
  {
    name: "Overland Airways", factor: 0.95, cabins: ["economy"],
    routes: ["LOS-ABV", "LOS-ILR", "LOS-QRW", "ABV-ILR", "ABV-GMO", "ABV-AKR", "ABV-QRW", "ABV-IBA"],
  },
  {
    name: "Arik Air", factor: 1.08, cabins: ["economy", "business"],
    routes: ["LOS-ABV", "LOS-PHC", "ABV-PHC", "LOS-JOS", "LOS-BNI", "LOS-QRW", "LOS-ABB"],
  },
  {
    name: "XEJet", factor: 1.0, cabins: ["business"],
    routes: ["LOS-ABV"],
  },
  {
    name: "Dana Air", factor: 0.97, cabins: ["economy"],
    routes: ["LOS-ABV", "LOS-PHC", "LOS-QUO", "LOS-QOW", "ABV-QUO"],
  },
  {
    name: "NG Eagle", factor: 0.9, cabins: ["economy"],
    routes: ["LOS-ABV", "LOS-PHC", "LOS-KAN", "ABV-PHC", "ABV-KAN", "ABV-SKO"],
  },
  {
    name: "Rano Air", factor: 0.9, cabins: ["economy"],
    routes: ["LOS-ABV", "LOS-KAN", "LOS-KAD", "LOS-QRW", "ABV-KAN", "ABV-MIU", "ABV-SKO", "ABV-QRW", "ABV-GMO", "KAN-SKO"],
  },
  {
    name: "Enugu Air", factor: 0.93, cabins: ["economy"],
    routes: ["ENU-LOS", "ENU-ABV", "ENU-QOW", "ENU-KAN", "KAN-LOS", "KAN-ABV"],
  },
  {
    name: "Gateway Air", factor: 0.9, cabins: ["economy"],
    routes: ["ABV-PHC", "ABV-CBQ", "ABV-JOS"], // its Gateway (Iperu) routes are left out: not an airport we cover
  },
  {
    name: "Umza Air", factor: 0.88, cabins: ["economy"],
    routes: ["ABV-QOW", "ABV-ILR"],
  },
  {
    name: "Cally Air", factor: 0.95, cabins: ["economy"],
    routes: ["LOS-CBQ", "ABV-CBQ"],
  },
  {
    name: "Max Air", factor: 0.95, cabins: ["economy"], lessCertain: true,
    routes: ["LOS-ABV", "LOS-KAN", "ABV-KAN", "LOS-PHC", "ABV-SKO"],
  },
  {
    name: "Green Africa", factor: 0.85, cabins: ["economy"], lessCertain: true,
    routes: ["LOS-ABV", "LOS-PHC", "LOS-QOW", "LOS-ENU", "LOS-ILR", "LOS-AKR"],
  },
  {
    name: "Binani Air", factor: 0.95, cabins: ["economy"], lessCertain: true,
    routes: ["LOS-ABV", "ABV-KAN", "ABV-YOL"],
  },
  {
    name: "Aero Contractors", factor: 1.0, cabins: ["economy"], lessCertain: true,
    routes: ["LOS-ABV", "LOS-QRW", "LOS-QUO", "LOS-KAN", "ABV-ABB"],
  },
  {
    name: "Azman Air", factor: 0.92, cabins: ["economy"], lessCertain: true,
    routes: ["LOS-ABV", "LOS-KAN", "ABV-KAN", "ABV-MIU"],
  },
  // No fares for these (see lib/airlines.js for why): Caliphate Air has not started flying,
  // and every Bayelsa Air route starts in Yenagoa, which FlightScout does not cover yet.
];

// Airport positions (degrees), used to estimate flight time and a sample fare for any pair.
const COORDS = {
  LOS: [6.577, 3.321], ABV: [9.007, 7.263], ENU: [6.474, 7.562], PHC: [5.015, 6.95], KAN: [12.048, 8.521],
  BNI: [6.317, 5.599], IBA: [7.362, 3.978], MIU: [11.855, 13.081], KAD: [10.696, 7.32], QOW: [5.427, 7.206],
  QUO: [5.051, 7.934], CBQ: [4.976, 8.347], ABB: [6.203, 6.659], ILR: [8.44, 4.494], JOS: [9.64, 8.869],
  YOL: [9.258, 12.43], SKO: [12.916, 5.207], QRW: [5.596, 5.818], AKR: [7.247, 5.301], GMO: [10.298, 10.896],
  MDI: [7.704, 8.614],
};

const NAMES = {
  LOS: "Lagos", ABV: "Abuja", ENU: "Enugu", PHC: "Port Harcourt", KAN: "Kano", BNI: "Benin City", IBA: "Ibadan", MIU: "Maiduguri",
  KAD: "Kaduna", QOW: "Owerri", QUO: "Uyo", CBQ: "Calabar", ABB: "Asaba", ILR: "Ilorin", JOS: "Jos", YOL: "Yola", SKO: "Sokoto",
  QRW: "Warri", AKR: "Akure", GMO: "Gombe", MDI: "Makurdi",
};

const routeKey = (a, b) => [a, b].sort().join("-");

function distanceKm(a, b) {
  if (!COORDS[a] || !COORDS[b]) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const [la1, lo1] = COORDS[a];
  const [la2, lo2] = COORDS[b];
  const h = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// The airlines that fly this pair, in the network above.
function airlinesOn(origin, destination) {
  const key = routeKey(origin, destination);
  return AIRLINE_NETWORK.filter((a) => a.routes.some((r) => routeKey(...r.split("-")) === key));
}

// The routes an airline flies, as pairs of airport codes.
function routesOf(airlineName) {
  const a = AIRLINE_NETWORK.find((x) => x.name === airlineName);
  return a ? a.routes.map((r) => r.split("-")) : [];
}

module.exports = { NAMES, AIRLINE_NETWORK, routeKey, distanceKm, airlinesOn, routesOf };
