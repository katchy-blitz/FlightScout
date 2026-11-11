// The AI box: one sentence in, flights out.

const aiForm = document.getElementById("aiForm");
const aiText = document.getElementById("aiText");
const aiButton = document.getElementById("aiButton");
const aiBadge = document.getElementById("aiBadge");
const aiUnderstood = document.getElementById("aiUnderstood");

const PROVIDER_LABELS = {
  claude: "Powered by Claude",
  openai: "Powered by OpenAI",
  basic: "Basic reader (no AI key set)",
};

document.addEventListener("fs-config", () => {
  aiBadge.textContent = PROVIDER_LABELS[window.FS.config.aiProvider] || "";
});

document.querySelectorAll("#aiExamples button").forEach((button) => {
  button.addEventListener("click", () => {
    aiText.value = button.dataset.text;
    aiText.focus();
  });
});

// Show people what the AI understood, so they can trust it and fix it.
function showUnderstood(data) {
  const u = data.understood || {};
  aiUnderstood.innerHTML = "";

  const title = window.FS.el("div", "ai-understood-title", "Here is what I understood");
  const chips = window.FS.el("div", "chips");
  const addChip = (label) => chips.append(window.FS.el("span", "chip", label));

  if (u.origin && u.destination) addChip(`${u.origin} → ${u.destination}`);
  if (u.departureDate) addChip(window.FS.formatDate(u.departureDate));
  if (u.returnDate) addChip(`Return ${window.FS.formatDate(u.returnDate)}`);
  if (u.timePreference && u.timePreference !== "anytime") {
    addChip(`${u.timeIsStrict ? "Only " : "Prefer "}${u.timePreference}`);
  }
  if (u.cabin) addChip(u.cabin.replace("_", " "));
  if (u.passengers) addChip(`${u.passengers} passenger${u.passengers > 1 ? "s" : ""}`);
  if (u.maxPriceNGN) addChip(`Under ₦${Math.round(u.maxPriceNGN).toLocaleString("en-NG")}`);

  aiUnderstood.append(title, chips);

  (u.assumptions || []).forEach((a) => aiUnderstood.append(window.FS.el("div", "ai-note", a)));
  if (data.summary) aiUnderstood.append(window.FS.el("div", "ai-summary", data.summary));
  aiUnderstood.hidden = false;
}

aiForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = aiText.value.trim();
  if (text.length < 8) {
    window.FS.showMessage("Tell me where and when you want to fly.");
    return;
  }

  document.getElementById("message").hidden = true;
  document.getElementById("resultsSection").hidden = true;
  aiUnderstood.hidden = true;
  aiButton.disabled = true;
  aiButton.textContent = "Thinking...";

  try {
    const response = await fetch("/api/ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The AI search failed.");

    if (data.aiProvider) aiBadge.textContent = PROVIDER_LABELS[data.aiProvider] || "";

    if (data.needsMore) {
      aiUnderstood.innerHTML = "";
      aiUnderstood.append(window.FS.el("div", "ai-summary", data.question));
      aiUnderstood.hidden = false;
      aiText.focus();
      return;
    }

    window.FS.fillForm({ ...data.understood });
    showUnderstood(data);
    const u = data.understood;
    window.FS.showResults(data, `${u.origin} to ${u.destination} · ${window.FS.formatDate(u.departureDate)} · ${u.passengers} adult(s)`, u.passengers);
  } catch (error) {
    window.FS.showMessage(error.message);
  } finally {
    aiButton.disabled = false;
    aiButton.textContent = "Find flights with AI";
  }
});
