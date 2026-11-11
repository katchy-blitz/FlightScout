// Remembers the flights we showed, for 30 minutes, so that checkout uses OUR
// price and never a price sent back by the browser.

const TTL_MS = 30 * 60 * 1000;
const MAX_ITEMS = 500;
const store = new Map();

function saveOffers(offers, context) {
  const now = Date.now();
  for (const [id, item] of store) {
    if (now - item.savedAt > TTL_MS) store.delete(id);
  }
  while (store.size > MAX_ITEMS) store.delete(store.keys().next().value);
  for (const offer of offers) store.set(offer.id, { offer, context, savedAt: now });
}

function getOffer(id) {
  const item = store.get(id);
  if (!item || Date.now() - item.savedAt > TTL_MS) return null;
  return item;
}

module.exports = { saveOffers, getOffer };
