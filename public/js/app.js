// Search form, results list and small helpers shared by ai.js and checkout.js.

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

const CABIN_LABELS = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First",
};

// ---------- small helpers ----------
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

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatPrice(amount, currency) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
  }).format(amount);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- trip type + dates ----------
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

// Fill the form from a search (used by the AI box so people can see and edit it).
function fillForm(search) {
  const set = (id, value) => {
    if (value !== undefined && value !== null && value !== "") document.getElementById(id).value = value;
  };
  set("origin", search.origin);
  set("destination", search.destination);
  set("departureDate", search.departureDate);
  set("cabin", search.cabin);
  set("passengers", search.passengers);
  set("time", search.timeIsStrict ? search.timePreference : "anytime");

  const wantsReturn = Boolean(search.returnDate);
  document.querySelector(`input[name="tripType"][value="${wantsReturn ? "return" : "oneway"}"]`).checked = true;
  returnField.hidden = !wantsReturn;
  returnInput.required = wantsReturn;
  returnInput.value = wantsReturn ? search.returnDate : "";
}

// ---------- results ----------
function renderFlights(flights, passengers) {
  resultsContainer.innerHTML = "";

  flights.forEach((flight) => {
    const card = el("article", "flight-card");
    const details = el("div");

    const top = el("div", "card-top");
    top.append(el("div", "airline-name", flight.airline));
    if (flight.demo) top.append(el("span", "tag tag-sample", "Sample fare"));
    if (flight.matchesPreference) top.append(el("span", "tag tag-match", "Matches your time preference"));
    details.append(top);

    details.append(
      el(
        "div",
        "flight-number",
        `${flight.flightNumber ? `Flight ${flight.flightNumber} · ` : ""}${CABIN_LABELS[flight.cabin] || "Economy"}`
      )
    );

    const route = el("div", "flight-route");
    const departure = el("div");
    departure.append(el("div", "flight-time", formatTime(flight.departure)), el("div", "flight-airport", flight.origin));
    const arrival = el("div");
    arrival.append(el("div", "flight-time", formatTime(flight.arrival)), el("div", "flight-airport", flight.destination));
    route.append(departure, el("div", "route-line"), arrival);
    details.append(route);

    details.append(el("div", "flight-stops", flight.stops === 0 ? "Direct flight" : `${flight.stops} stop(s)`));

    if (flight.returnDeparture) {
      details.append(
        el(
          "div",
          "flight-stops",
          `Return: ${formatDate(flight.returnDeparture)} · ${formatTime(flight.returnDeparture)} → ${formatTime(flight.returnArrival)}`
        )
      );
    }

    const priceArea = el("div", "flight-price");
    const priceDetails = el("div");
    priceDetails.append(
      el("div", "price", formatPrice(flight.price, flight.currency)),
      el("div", "price-caption", passengers > 1 ? `Total for ${passengers} passengers` : "Total fare")
    );

    const selectButton = el("button", "select-flight", "Select flight");
    selectButton.addEventListener("click", () => window.FS.onSelect(flight, passengers));

    priceArea.append(priceDetails, selectButton);
    card.append(details, priceArea);
    resultsContainer.appendChild(card);
  });
}

// Show a finished search (from the form or from the AI box).
function showResults(data, heading, passengers) {
  message.hidden = true;
  document.getElementById("checkoutSection").hidden = true;
  document.getElementById("confirmation").hidden = true;
  document.getElementById("resultSummary").textContent = heading;
  document.getElementById("sampleBanner").hidden = !(data.usingSampleFares || window.FS.config.sampleFares);

  if (!data.flights.length) {
    resultsSection.hidden = true;
    showMessage("No matching flights were found. Try another date, time or cabin class.");
    return;
  }

  renderFlights(data.flights, passengers);
  resultsSection.hidden = false;
  resultsSection.scrollIntoView({ behavior: "smooth" });
}

// ---------- form search ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  message.hidden = true;
  resultsSection.hidden = true;
  document.getElementById("aiUnderstood").hidden = true;

  const tripType = document.querySelector('input[name="tripType"]:checked').value;
  const departureDate = departureInput.value;
  const returnDate = tripType === "return" ? returnInput.value : "";

  if (returnDate && returnDate < departureDate) {
    showMessage("Your return date cannot be before your departure date.");
    return;
  }

  const origin = document.getElementById("origin").value;
  const destination = document.getElementById("destination").value;
  if (origin === destination) {
    showMessage("Please choose two different airports.");
    return;
  }

  const search = {
    origin,
    destination,
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
    if (!response.ok) throw new Error(data.error || "Flight search failed.");

    showResults(
      data,
      `${search.origin} to ${search.destination} · ${formatDate(search.departureDate)} · ${search.passengers} adult(s)`,
      search.passengers
    );
  } catch (error) {
    showMessage(error.message);
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = "Search available flights <span>→</span>";
  }
});

// Shared with ai.js and checkout.js
window.FS = {
  config: { sampleFares: false, paypalClientId: null, aiProvider: "basic", ngnPerUsd: 1500 },
  showMessage, formatPrice, formatTime, formatDate, el, fillForm, showResults,
  onSelect: () => {}, // checkout.js replaces this
};

fetch("/api/config")
  .then((r) => r.json())
  .then((config) => {
    window.FS.config = config;
    document.getElementById("sampleBanner").hidden = !config.sampleFares;
    document.dispatchEvent(new Event("fs-config"));
  })
  .catch(() => {});
