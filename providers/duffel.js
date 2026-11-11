// Duffel flight supplier.
// Every supplier returns offers in the same simple shape, so the website
// does not care where a price came from. To add Wakanow (or any other
// supplier later), copy this file, change search(), and register it in server.js.

const DUFFEL_URL = process.env.DUFFEL_API_URL || "https://api.duffel.com";
const TIMEOUT_MS = 45000;

const TIME_RANGES = {
  morning: { from: "05:00", to: "11:59" },
  afternoon: { from: "12:00", to: "16:59" },
  evening: { from: "17:00", to: "23:59" },
};

function isConfigured() {
  return Boolean(process.env.DUFFEL_ACCESS_TOKEN);
}

async function search({ origin, destination, departureDate, returnDate, passengers, cabin, time }) {
  const outbound = { origin, destination, departure_date: departureDate };
  if (TIME_RANGES[time]) outbound.departure_time = TIME_RANGES[time];

  const slices = [outbound];
  if (returnDate) {
    slices.push({ origin: destination, destination: origin, departure_date: returnDate });
  }

  const payload = {
    data: {
      slices,
      passengers: Array.from({ length: passengers }, () => ({ type: "adult" })),
      cabin_class: cabin,
      max_connections: 1,
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${DUFFEL_URL}/air/offer_requests?return_offers=true`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "Duffel-Version": "v2",
      },
      body: JSON.stringify(payload),
    });
  } finally {
    clearTimeout(timer);
  }

  const result = await response.json();

  if (!response.ok) {
    console.error("Duffel API error:", JSON.stringify(result));
    const err = new Error(
      result.errors?.[0]?.message || "The flight supplier could not complete this search."
    );
    err.status = response.status;
    throw err;
  }

  return (result.data?.offers || []).map((offer) => {
    const out = offer.slices?.[0];
    const back = offer.slices?.[1];
    const first = out?.segments?.[0];
    const last = out?.segments?.[out.segments.length - 1];

    return {
      id: offer.id,
      supplier: "Duffel",
      demo: false,
      bookable: false, // live ticketing is not switched on (see README)
      cabin,
      price: Number(offer.total_amount),
      currency: offer.total_currency,
      airline: first?.operating_carrier?.name || first?.marketing_carrier?.name || "Airline",
      airlineCode: first?.operating_carrier?.iata_code || "",
      flightNumber: first?.marketing_carrier_flight_number || "",
      departure: first?.departing_at || "",
      arrival: last?.arriving_at || "",
      origin: first?.origin?.iata_code || origin,
      destination: last?.destination?.iata_code || destination,
      stops: Math.max((out?.segments?.length || 1) - 1, 0),
      returnDeparture: back?.segments?.[0]?.departing_at || null,
      returnArrival: back?.segments?.[back.segments.length - 1]?.arriving_at || null,
      expiresAt: offer.expires_at || null,
    };
  });
}

module.exports = { name: "Duffel", isConfigured, search };
