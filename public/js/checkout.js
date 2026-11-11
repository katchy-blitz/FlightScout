// Checkout inside the chat: passenger details, PayPal button, confirmation.
// The browser never sends a price. The server looks up the fare it showed you.

let current = null; // { flights, passengers, card, form, errorBox }
let paypalLoading = null;

function loadPayPalSdk(clientId) {
  if (paypalLoading) return paypalLoading;
  paypalLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => {
      paypalLoading = null;
      reject(new Error("Could not load PayPal. Check your internet connection and try again."));
    };
    document.head.appendChild(script);
  });
  return paypalLoading;
}

function field(i, label, name, type, extra = {}) {
  const wrap = window.FS.el("div", "field");
  const id = `p${i}-${name}`;
  const lab = window.FS.el("label", "", label);
  lab.htmlFor = id;
  const inputEl = document.createElement("input");
  Object.assign(inputEl, { id, type, required: true, ...extra });
  inputEl.dataset.index = i;
  inputEl.dataset.name = name;
  wrap.append(lab, inputEl);
  return wrap;
}

function readForm(form) {
  const passengers = [];
  form.querySelectorAll(".passenger input").forEach((inputEl) => {
    const i = Number(inputEl.dataset.index);
    passengers[i] = passengers[i] || {};
    passengers[i][inputEl.dataset.name] = inputEl.value.trim();
  });
  return {
    passengers,
    contact: { email: form.querySelector(".contact-email").value.trim(), phone: form.querySelector(".contact-phone").value.trim() },
  };
}

function setError(text) {
  if (!current) return;
  current.errorBox.textContent = text;
  current.errorBox.hidden = !text;
}

function startCheckout(flightsIn, passengers) {
  const { el, formatDate, formatTime, formatPrice, airlineLine } = window.FS;
  const config = window.FS.state.config;
  const flights = Array.isArray(flightsIn) ? flightsIn : [flightsIn];

  // Only one checkout at a time.
  if (current && current.card.isConnected) {
    current.card.replaceChildren(el("div", "note", "Checkout replaced by a new selection."));
  }

  const rate = config.ngnPerUsd;
  const fareNGN = flights.reduce((sum, f) => sum + (f.priceNGN || 0), 0);
  const extrasConfig = config.extras || { bagPriceNGN: 15000, maxBags: 2, assistance: {} };
  const extras = { bags: 0, codes: new Set(), note: "" };
  const totalNow = () => fareNGN + extras.bags * passengers * flights.length * extrasConfig.bagPriceNGN;
  const intro = flights.length > 1
    ? `Great, ${flights.length} flights, one payment. I just need each passenger's details, exactly as they appear on their ID, because airlines can refuse boarding if names don't match. After that you can pay with PayPal.`
    : `Great choice. I just need each passenger's details, exactly as they appear on their ID, because airlines can refuse boarding if names don't match. After that you can pay with PayPal.`;
  const body = window.FS.addAssistant(intro, { local: true });

  const card = el("div", "checkout");
  const summary = el("div", "summary");
  flights.forEach((flight) => {
    const row = el("div", "summary-flight");
    const main = el("div", "summary-main");
    main.append(airlineLine(flight.airline, "airline-inline"), ` · ${flight.origin} → ${flight.destination}`);
    row.append(main, el("div", "sub", `${formatDate(flight.departure)} · ${formatTime(flight.departure)} · ${formatPrice(flight.priceNGN, "NGN")}`));
    summary.append(row);
  });
  const totalEl = el("div", "summary-price", "");
  summary.append(el("div", "sub", `${passengers} passenger${passengers > 1 ? "s" : ""}`), totalEl);

  const form = el("form", "");
  form.noValidate = true;
  const maxDob = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < passengers; i++) {
    const set = el("fieldset", "passenger");
    set.append(el("legend", "", `Passenger ${i + 1}`));
    const grid = el("div", "grid");
    grid.append(
      field(i, "FIRST NAME", "firstName", "text", { autocomplete: "given-name" }),
      field(i, "LAST NAME", "lastName", "text", { autocomplete: "family-name" }),
      field(i, "DATE OF BIRTH", "dateOfBirth", "date", { max: maxDob })
    );
    set.append(grid);
    form.append(set);
  }
  const contact = el("div", "grid two");
  const email = field("c", "EMAIL", "email", "email", { autocomplete: "email" });
  email.querySelector("input").classList.add("contact-email");
  const phone = field("c", "PHONE", "phone", "tel", { autocomplete: "tel", placeholder: "+234..." });
  phone.querySelector("input").classList.add("contact-phone");
  contact.append(email, phone);
  form.append(contact);

  // ----- optional extras (kept closed so the form stays short) -----
  const det = el("details", "extras");
  const sum = el("summary", "", "");
  sum.append("Add extras ", el("span", "sub", "bags, special assistance (optional)"));
  const inner = el("div", "extras-body");

  const bagBox = el("div", "");
  bagBox.append(el("h4", "", "Extra checked bags"));
  const stepper = el("div", "stepper");
  const minus = el("button", "", "−"); const plus = el("button", "", "+");
  minus.type = plus.type = "button";
  minus.setAttribute("aria-label", "One fewer bag"); plus.setAttribute("aria-label", "One more bag");
  const count = el("b", "", "0");
  stepper.append(minus, count, plus);
  const bagHint = el("p", "hint", `${formatPrice(extrasConfig.bagPriceNGN, "NGN")} per bag, per passenger, per flight.`);
  bagBox.append(stepper, bagHint);

  const helpBox = el("div", "");
  helpBox.append(el("h4", "", "Special assistance (free)"));
  const pills = el("div", "pills");
  Object.entries(extrasConfig.assistance).forEach(([code, label]) => {
    const l = el("label", "pill-opt");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => { cb.checked ? extras.codes.add(code) : extras.codes.delete(code); });
    l.append(cb, label);
    pills.append(l);
  });
  const noteBox = document.createElement("textarea");
  noteBox.placeholder = "Anything else the airline should know? (optional)";
  noteBox.maxLength = 200;
  noteBox.addEventListener("input", () => { extras.note = noteBox.value; });
  helpBox.append(pills, noteBox, el("p", "hint", "In this beta we record your request on your booking. For a real trip, please also tell the airline directly."));
  inner.append(bagBox, helpBox);
  det.append(sum, inner);
  form.append(det);

  const note = el("p", "hint", "");
  const refreshTotals = () => {
    const total = totalNow();
    const usd = Math.ceil((total / rate) * 100) / 100;
    count.textContent = String(extras.bags);
    minus.disabled = extras.bags <= 0;
    plus.disabled = extras.bags >= extrasConfig.maxBags;
    totalEl.textContent = `Total ${formatPrice(total, "NGN")}`;
    note.textContent = `PayPal cannot charge naira, so you will pay US$${usd.toFixed(2)} (at ₦${rate.toLocaleString("en-NG")} per US$1).`;
  };
  minus.addEventListener("click", () => { extras.bags = Math.max(0, extras.bags - 1); refreshTotals(); });
  plus.addEventListener("click", () => { extras.bags = Math.min(extrasConfig.maxBags, extras.bags + 1); refreshTotals(); });
  refreshTotals();
  const buttons = el("div", "paypal-box");
  const errorBox = el("div", "inline-error");
  errorBox.hidden = true;

  card.append(summary, form, note, buttons, errorBox);
  body.insertBefore(card, body.querySelector(".meta")); // keep the time stamp at the bottom
  current = { flights, passengers, card, form, errorBox, extras };
  window.FS.toBottom();
  card.scrollIntoView({ block: "nearest" });

  renderPayPal(buttons, form, config);
}

async function renderPayPal(container, form, config) {
  if (!config.paypalClientId) {
    setError("PayPal is not connected yet. Add your PayPal sandbox client ID and secret to the server settings.");
    return;
  }
  const mine = current;

  try {
    const paypal = await loadPayPalSdk(config.paypalClientId);
    paypal
      .Buttons({
        style: { layout: "vertical", shape: "rect", label: "pay" },

        // Check the details first; PayPal opens only if they are complete.
        onClick: (data, actions) => {
          setError("");
          return form.reportValidity() ? actions.resolve() : actions.reject();
        },

        createOrder: async () => {
          const response = await fetch("/api/paypal/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ offerIds: mine.flights.map((f) => f.id), ...readForm(form), extras: { bags: mine.extras.bags, assistance: [...mine.extras.codes], note: mine.extras.note } }),
          });
          const data = await response.json();
          if (!response.ok) {
            setError(data.error || "Could not start the payment.");
            throw new Error(data.error);
          }
          return data.id;
        },

        onApprove: async (data) => {
          const response = await fetch("/api/paypal/capture-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.orderID }),
          });
          const booking = await response.json();
          if (!response.ok) {
            setError(booking.error || "The payment could not be completed.");
            return;
          }
          showConfirmation(mine, booking);
        },

        onCancel: () => setError("Payment cancelled. You have not been charged."),
        onError: () => {
          if (!current.errorBox.textContent) setError("Something went wrong with PayPal. Please try again.");
        },
      })
      .render(container);
  } catch (error) {
    setError(error.message);
  }
}

function showConfirmation(mine, booking) {
  mine.card.remove();
  window.FS.addBooking(booking); // the confirmation is a saved message in the chat
  current = null;
}

window.FS.startCheckout = startCheckout;
