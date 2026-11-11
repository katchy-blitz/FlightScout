// Money helpers.
// PayPal cannot charge in naira, so checkout is charged in US dollars.
// Set NGN_PER_USD in your settings to the rate you want to use.

const NGN_PER_USD = Number(process.env.NGN_PER_USD) || 1500;

// Convert a supplier price to naira so offers from different suppliers can be compared.
// Returns null for currencies we have no rate for.
function toNGN(price, currency) {
  if (currency === "NGN") return price;
  if (currency === "USD") return price * NGN_PER_USD;
  return null;
}

function ngnToUsd(ngn) {
  return Math.ceil((ngn / NGN_PER_USD) * 100) / 100;
}

function formatNGN(amount) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

// "morning" / "afternoon" / "evening" from a local time like 2026-11-20T08:00:00
function timeOfDay(localDateTime) {
  const hour = parseInt(String(localDateTime).slice(11, 13), 10);
  if (Number.isNaN(hour)) return "anytime";
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

module.exports = { NGN_PER_USD, toNGN, ngnToUsd, formatNGN, timeOfDay };
