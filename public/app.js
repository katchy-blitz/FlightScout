const form = document.getElementById("searchForm");
const searchButton = document.getElementById("searchButton");
const resultsSection = document.getElementById("resultsSection");
const resultsContainer = document.getElementById("results");
const message = document.getElementById("message");

const departureInput = document.getElementById("departureDate");
const returnInput = document.getElementById("returnDate");
const returnField = document.getElementById("returnField");

const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000)
  .toISOString()
  .split("T")[0];

departureInput.min = localToday;
returnInput.min = localToday;

document.querySelectorAll('input[name="tripType"]').forEach((option) => {
  option.addEventListener("change", () => {
    const isReturn = option.value === "return" && option.checked;
    returnField.hidden = !isReturn;
    returnInput.required = isReturn;

    if (!isReturn) returnInput.value = "";
  });
});

departureInput.addEventListener("change", () => {
  returnInput.min = departureInput.value || localToday;

  if (returnInput.value && returnInput.value < departureInput.value) {
    returnInput.value = "";
  }
});

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

function formatTime(value) {
  if (!value) return "--:--";

  return new Date(value).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatPrice(amount, currency) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function renderFlights(flights) {
  resultsContainer.innerHTML = "";

  if (!flights.length) {
    showMessage(
      "No matching flights were returned. Try another date or route."
    );
    return;
  }

  flights.forEach((flight, index) => {
    const card = document.createElement("article");
    card.className = "flight-card";

    const details = document.createElement("div");

    const airline = document.createElement("div");
    airline.className = "airline-name";
    airline.textContent = flight.airline;

    const flightNumber = document.createElement("div");
    flightNumber.className = "flight-number";
    flightNumber.textContent = flight.flightNumber
      ? `Flight ${flight.flightNumber}`
      : "Flight details";

    const route = document.createElement("div");
    route.className = "flight-route";

    const departure = document.createElement("div");
    const departureTime = document.createElement("div");
    departureTime.className = "flight-time";
    departureTime.textContent = formatTime(flight.departure);

    const departureAirport = document.createElement("div");
    departureAirport.className = "flight-airport";
    departureAirport.textContent = flight.origin;

    departure.append(departureTime, departureAirport);

    const line = document.createElement("div");
    line.className = "route-line";

    const arrival = document.createElement("div");
    const arrivalTime = document.createElement("div");
    arrivalTime.className = "flight-time";
    arrivalTime.textContent = formatTime(flight.arrival);

    const arrivalAirport = document.createElement("div");
    arrivalAirport.className = "flight-airport";
    arrivalAirport.textContent = flight.destination;

    arrival.append(arrivalTime, arrivalAirport);
    route.append(departure, line, arrival);

    const stops = document.createElement("div");
    stops.className = "flight-stops";
    stops.textContent =
      flight.stops === 0 ? "Direct flight" : `${flight.stops} stop(s)`;

    details.append(airline, flightNumber, route, stops);

    const priceArea = document.createElement("div");
    priceArea.className = "flight-price";

    const priceDetails = document.createElement("div");
    const price = document.createElement("div");
    price.className = "price";
    price.textContent = formatPrice(flight.price, flight.currency);

    const caption = document.createElement("div");
    caption.className = "price-caption";
    caption.textContent = "Total fare returned by supplier";

    priceDetails.append(price, caption);

    const selectButton = document.createElement("button");
    selectButton.className = "select-flight";
    selectButton.textContent = "Select flight";
    selectButton.addEventListener("click", () => {
      alert(
        `Selected ${flight.airline} for ${formatPrice(
          flight.price,
          flight.currency
        )}.\n\nBooking checkout will be connected after supplier booking access is configured.`
      );
    });

    priceArea.append(priceDetails, selectButton);
    card.append(details, priceArea);
    resultsContainer.appendChild(card);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.hidden = true;
  resultsSection.hidden = true;

  const tripType = document.querySelector(
    'input[name="tripType"]:checked'
  ).value;

  const departureDate = departureInput.value;
  const returnDate = tripType === "return" ? returnInput.value : "";

  if (returnDate && returnDate < departureDate) {
    showMessage("Your return date cannot be before your departure date.");
    return;
  }

  const search = {
    origin: document.getElementById("origin").value,
    destination: document.getElementById("destination").value,
    departureDate,
    returnDate,
    time: document.getElementById("time").value,
    cabin: document.getElementById("cabin").value,
    passengers: Number(document.getElementById("passengers").value),
  };

  searchButton.disabled = true;
  searchButton.textContent = "Searching available flights...";
  resultsContainer.innerHTML = "";

  try {
    const response = await fetch("/api/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(search),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Flight search failed.");
    }

    document.getElementById("resultSummary").textContent = `${
      search.origin
    } to ${search.destination} · ${formatDate(search.departureDate)} · ${
      search.passengers
    } adult(s)`;

    renderFlights(data.flights);
    resultsSection.hidden = false;
    resultsSection.scrollIntoView({ behavior: "smooth" });

    if (!data.flights.length) {
      showMessage("No flights were found for these dates.");
    }
  } catch (error) {
    showMessage(error.message);
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = "Search available flights <span>→</span>";
  }
});
