// The side panel: chat history, search, sign in / sign up, settings.
//
// Guests can chat and book. Their chat is kept only for this browser tab (so a refresh
// does not lose it) and is NOT saved to history. Signed-in users get saved chats.

(function () {
const { state, el, icon } = window.FS;

const sidebar = document.getElementById("sidebar");
const chatList = document.getElementById("chatList");
const searchBox = document.getElementById("chatSearch");
const profileBox = document.getElementById("profile");
const authDialog = document.getElementById("authDialog");
const settingsDialog = document.getElementById("settingsDialog");

let chats = [];
let query = "";
let authMode = "signin";

// Browser storage can be blocked (private windows), so every use is wrapped.
const keep = {
  get(store, key) { try { return window[store].getItem(key); } catch { return null; } },
  set(store, key, value) { try { window[store].setItem(key, value); } catch { /* ignore */ } },
  del(store, key) { try { window[store].removeItem(key); } catch { /* ignore */ } },
};

async function api(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await response.json(); } catch { /* empty body */ }
  return { ok: response.ok, status: response.status, data };
}

// ---------- open and close (small screens) ----------
function setOpen(open) {
  document.body.classList.toggle("side-open", open);
  document.body.classList.toggle("side-closed", !open && window.matchMedia("(min-width: 861px)").matches);
}
document.getElementById("menuBtn").addEventListener("click", () => {
  const desktop = window.matchMedia("(min-width: 861px)").matches;
  const open = desktop ? document.body.classList.contains("side-closed") : !document.body.classList.contains("side-open");
  if (desktop) document.body.classList.toggle("side-closed", !open);
  else document.body.classList.toggle("side-open", open);
});
document.getElementById("backdrop").addEventListener("click", () => document.body.classList.remove("side-open"));
const closeOnSmall = () => document.body.classList.remove("side-open");

// ---------- saving ----------
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}

async function saveNow() {
  if (!state.messages.length) return;
  if (state.user) {
    const { ok } = await api("PUT", `/api/chats/${state.chatId}`, { title: state.title || "New chat", messages: state.messages, context: state.context });
    keep.set("sessionStorage", "fs_active", state.chatId);
    if (ok) loadList();
  } else {
    // A guest's chat stays in this tab only.
    keep.set("sessionStorage", "fs_guest", JSON.stringify({ id: state.chatId, title: state.title, messages: state.messages, context: state.context }));
  }
}
window.FS.onChange = scheduleSave;
window.addEventListener("pagehide", () => { if (saveTimer) { clearTimeout(saveTimer); saveNow(); } });

// ---------- history list ----------
function groupName(ms) {
  const day = 86400000;
  const start = new Date().setHours(0, 0, 0, 0);
  if (ms >= start) return "Today";
  if (ms >= start - day) return "Yesterday";
  if (ms >= start - 7 * day) return "Previous 7 days";
  return "Older";
}

function renderList() {
  chatList.replaceChildren();

  if (!state.user) {
    const box = el("div", "side-note");
    box.append(
      el("strong", "", query ? "Sign in to search your chats" : "Your chats aren't saved"),
      el("p", "", "You can chat and book without an account. Sign in and your chats are saved here so you can come back to them.")
    );
    chatList.append(box);
    return;
  }

  if (!chats.length) {
    chatList.append(el("div", "side-note", query ? "No chats match that search." : "No saved chats yet. Start one and it will appear here."));
    return;
  }

  let last = "";
  chats.forEach((chat) => {
    const group = query ? "Results" : groupName(chat.updatedAt);
    if (group !== last) {
      chatList.append(el("div", "side-group", group));
      last = group;
    }
    const item = el("div", `chat-item${chat.id === state.chatId ? " active" : ""}`);
    const open = el("button", "chat-open");
    open.type = "button";
    open.append(el("span", "chat-title", chat.title || "New chat"));
    if (chat.snippet) open.append(el("span", "chat-snippet", chat.snippet));
    open.addEventListener("click", () => openChat(chat.id));
    const del = window.FS.iconButton("trash", "Delete chat", (event) => {
      event.stopPropagation();
      removeChat(chat);
    }, "chat-del");
    item.append(open, del);
    chatList.append(item);
  });
}

async function loadList() {
  if (!state.user) {
    chats = [];
    renderList();
    return;
  }
  const { ok, data } = await api("GET", `/api/chats${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  if (ok) chats = data.chats || [];
  renderList();
}

async function openChat(id) {
  if (state.busy || id === state.chatId) return closeOnSmall();
  flushSave();
  const { ok, data } = await api("GET", `/api/chats/${id}`);
  if (!ok) return;
  window.FS.loadChat(data);
  keep.set("sessionStorage", "fs_active", id);
  renderList();
  closeOnSmall();
}

async function removeChat(chat) {
  if (!confirm(`Delete "${chat.title || "this chat"}"? This cannot be undone.`)) return;
  await api("DELETE", `/api/chats/${chat.id}`);
  if (chat.id === state.chatId) window.FS.newChat();
  loadList();
}

// Save the current chat right now. The chat is copied before the first wait, so it is safe
// to switch to another chat straight afterwards without waiting for the network.
function flushSave() {
  if (!saveTimer) return Promise.resolve();
  clearTimeout(saveTimer);
  saveTimer = null;
  return saveNow();
}

function startNew() {
  if (state.busy) return;
  flushSave();
  keep.del("sessionStorage", "fs_guest");
  keep.del("sessionStorage", "fs_active");
  window.FS.newChat();
  renderList();
  closeOnSmall();
}
document.getElementById("newChat").addEventListener("click", startNew);

let searchTimer = null;
searchBox.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = searchBox.value.trim();
    loadList();
  }, 250);
});

// ---------- profile area and its pop-up menu ----------
const userMenu = document.getElementById("userMenu");

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function closeMenu() {
  userMenu.hidden = true;
  const button = profileBox.querySelector(".profile");
  if (button) button.setAttribute("aria-expanded", "false");
}

function renderProfile() {
  profileBox.replaceChildren();
  closeMenu();
  if (state.user) {
    const wrap = el("button", "profile");
    wrap.type = "button";
    wrap.setAttribute("aria-haspopup", "menu");
    wrap.setAttribute("aria-expanded", "false");
    wrap.append(el("div", "profile-avatar", initials(state.user.name)));
    const who = el("div", "profile-who");
    who.append(el("div", "profile-name", state.user.name), el("div", "profile-email", state.user.email));
    wrap.append(who);
    wrap.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = userMenu.hidden;
      document.getElementById("menuEmail").textContent = state.user.email;
      userMenu.hidden = !open;
      wrap.setAttribute("aria-expanded", String(open));
      if (open) userMenu.querySelector("button").focus();
    });
    profileBox.append(wrap);
  } else {
    const wrap = el("div", "auth-buttons");
    const signin = el("button", "ghost", "Sign in");
    const signup = el("button", "primary", "Sign up");
    signin.type = signup.type = "button";
    signin.addEventListener("click", () => openAuth("signin"));
    signup.addEventListener("click", () => openAuth("signup"));
    wrap.append(signin, signup);
    profileBox.append(wrap);
  }
}

userMenu.querySelectorAll(".mi").forEach((node) => node.append(icon(node.dataset.icon, 17)));
document.addEventListener("click", (event) => { if (!userMenu.hidden && !userMenu.contains(event.target)) closeMenu(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !userMenu.hidden) { closeMenu(); const p = profileBox.querySelector(".profile"); if (p) p.focus(); }
  // Ctrl+Shift+, opens Settings
  if (event.ctrlKey && event.shiftKey && event.code === "Comma") { event.preventDefault(); openSettings(); }
});
document.getElementById("menuSettings").addEventListener("click", () => { closeMenu(); openSettings(); });
document.getElementById("menuLanguage").addEventListener("click", () => { closeMenu(); document.getElementById("languageDialog").showModal(); });
document.getElementById("menuLogout").addEventListener("click", async () => { closeMenu(); await signOut(); });
document.getElementById("languageClose").addEventListener("click", () => document.getElementById("languageDialog").close());

// ---------- sign in / sign up / verify email ----------
const authForm = document.getElementById("authForm");
const verifyForm = document.getElementById("verifyForm");
const authError = document.getElementById("authError");
const verifyError = document.getElementById("verifyError");
let pendingEmail = "";

function showError(box, text, extra) {
  box.replaceChildren(document.createTextNode(text));
  if (extra) box.append(" ", extra);
  box.hidden = false;
}

function showVerify(email, devCode, note) {
  pendingEmail = email;
  verifyError.classList.remove("ok");
  authForm.hidden = true;
  verifyForm.hidden = false;
  document.getElementById("authFoot").hidden = true;
  document.getElementById("authTitle").textContent = "Check your email";
  document.getElementById("authSub").textContent = `We sent a 6-digit code to ${email}. It works for 15 minutes. Check your spam folder if you don't see it.`;
  const box = document.getElementById("devCodeBox");
  box.hidden = !devCode;
  box.textContent = devCode ? `Email sending isn't set up on this demo server, so here is your code: ${devCode}` : "";
  verifyError.hidden = !note;
  if (note) verifyError.textContent = note;
  document.getElementById("verifyCode").value = "";
  if (!authDialog.open) authDialog.showModal();
  document.getElementById("verifyCode").focus();
}

function openAuth(mode, email) {
  authMode = mode;
  const signup = mode === "signup";
  authForm.hidden = false;
  verifyForm.hidden = true;
  document.getElementById("authFoot").hidden = false;
  document.getElementById("authTitle").textContent = signup ? "Create your account" : "Welcome back";
  document.getElementById("authSub").textContent = signup
    ? "Save your chats and pick them up on any device."
    : "Sign in to see your saved chats.";
  document.getElementById("nameField").hidden = !signup;
  document.getElementById("profileFields").hidden = !signup;
  document.getElementById("profileHint").hidden = !signup;
  document.getElementById("authAge").required = signup;
  document.getElementById("authName").required = signup;
  document.getElementById("authPassword").autocomplete = signup ? "new-password" : "current-password";
  document.getElementById("authSubmit").textContent = signup ? "Create account" : "Sign in";
  document.getElementById("authSwitchText").textContent = signup ? "Already have an account?" : "New to FlightScout?";
  document.getElementById("authSwitch").textContent = signup ? "Sign in" : "Sign up";
  authError.hidden = true;
  if (email) document.getElementById("authEmail").value = email;
  if (!authDialog.open) authDialog.showModal();
  (signup ? document.getElementById("authName") : document.getElementById("authEmail")).focus();
}

document.getElementById("authSwitch").addEventListener("click", () => openAuth(authMode === "signup" ? "signin" : "signup", document.getElementById("authEmail").value));
document.getElementById("authClose").addEventListener("click", () => authDialog.close());

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.hidden = true;
  const submit = document.getElementById("authSubmit");
  submit.disabled = true;
  const body = {
    email: document.getElementById("authEmail").value.trim(),
    password: document.getElementById("authPassword").value,
  };
  if (authMode === "signup") {
    body.name = document.getElementById("authName").value.trim();
    body.gender = document.getElementById("authGender").value;
    body.age = Number(document.getElementById("authAge").value);
  }
  const { ok, data } = await api("POST", authMode === "signup" ? "/api/auth/signup" : "/api/auth/signin", body);
  submit.disabled = false;

  if (data.needsVerification) {
    // The account exists but the email is not verified yet: ask for the code.
    document.getElementById("authPassword").value = "";
    return showVerify(data.email || body.email, data.devCode, data.error);
  }
  if (!ok) {
    if (data.exists) {
      // The email is already registered.
      const link = el("button", "link", "Sign in instead");
      link.type = "button";
      link.addEventListener("click", () => openAuth("signin", body.email));
      return showError(authError, "This email already has an account.", link);
    }
    return showError(authError, data.error || "Something went wrong. Please try again.");
  }
  authForm.reset();
  authDialog.close();
  await onSignedIn(data.user);
});

verifyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  verifyError.hidden = true;
  const submit = document.getElementById("verifySubmit");
  submit.disabled = true;
  const { ok, data } = await api("POST", "/api/auth/verify", { email: pendingEmail, code: document.getElementById("verifyCode").value.trim() });
  submit.disabled = false;
  if (!ok) return showError(verifyError, data.error || "That code is not right.");
  authForm.reset();
  authDialog.close();
  await onSignedIn(data.user);
});

document.getElementById("verifyResend").addEventListener("click", async () => {
  const { ok, data } = await api("POST", "/api/auth/resend", { email: pendingEmail });
  if (!ok) return showError(verifyError, data.error || "Could not send a new code.");
  showVerify(pendingEmail, data.devCode, "A new code is on its way.");
  verifyError.classList.add("ok");
});
document.getElementById("verifyCode").addEventListener("input", () => { verifyError.hidden = true; });
document.getElementById("verifyBack").addEventListener("click", () => openAuth("signup", pendingEmail));

// The chat the visitor was having as a guest becomes the first saved chat.
async function onSignedIn(user) {
  state.user = user;
  keep.del("sessionStorage", "fs_guest");
  renderProfile();
  renderSettings();
  if (state.messages.length) await saveNow();
  window.FS.renderAll(); // the greeting now uses their name
  await loadList();
}

async function signOut() {
  await flushSave();
  await api("POST", "/api/auth/signout");
  state.user = null;
  keep.del("sessionStorage", "fs_active");
  keep.del("sessionStorage", "fs_guest");
  chats = [];
  query = "";
  searchBox.value = "";
  window.FS.newChat();
  renderProfile();
  renderSettings();
  renderList();
}

// ---------- settings ----------
function applyTheme(theme) {
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme; // anything else is the default dark blue
  else delete document.documentElement.dataset.theme;
  keep.set("localStorage", "fs_theme", theme);
}

function renderSettings() {
  const box = document.getElementById("settingsAccount");
  box.replaceChildren();
  if (state.user) {
    box.append(el("p", "", `Signed in as ${state.user.name} (${state.user.email}).`));

    // How Scout greets you
    const form = el("form", "profile-form");
    const gender = document.createElement("select");
    [["", "Prefer not to say"], ["female", "Female"], ["male", "Male"]].forEach(([v, t]) => { const o = el("option", "", t); o.value = v; gender.append(o); });
    gender.value = state.user.gender || "";
    const age = document.createElement("input");
    Object.assign(age, { type: "number", min: 18, max: 110, placeholder: "Age", value: state.user.age || "" });
    const save = el("button", "ghost", "Save");
    const msg = el("span", "hint", "");
    const gWrap = el("div", "field"); gWrap.append(el("label", "", "GENDER"), gender);
    const aWrap = el("div", "field"); aWrap.append(el("label", "", "AGE"), age);
    const grid = el("div", "grid two"); grid.append(gWrap, aWrap);
    form.append(grid, save, msg);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const { ok, data } = await api("PUT", "/api/me/profile", { name: state.user.name, gender: gender.value, age: Number(age.value) });
      if (ok) { state.user = data.user; msg.textContent = " Saved. Scout will greet you as " + data.user.callMe + "."; renderProfile(); }
      else msg.textContent = " " + (data.error || "Could not save.");
    });
    box.append(form);

    const row = el("div", "settings-row");
    const out = el("button", "ghost", "Sign out");
    const clear = el("button", "ghost danger", "Delete all chats");
    const del = el("button", "ghost danger", "Delete account");
    out.type = clear.type = del.type = "button";
    out.addEventListener("click", async () => { settingsDialog.close(); await signOut(); });
    clear.addEventListener("click", async () => {
      if (!confirm("Delete all of your saved chats? This cannot be undone.")) return;
      await api("DELETE", "/api/chats");
      settingsDialog.close();
      window.FS.newChat();
      loadList();
    });
    del.addEventListener("click", async () => {
      if (!confirm("Delete your account and all of your chats? This cannot be undone.")) return;
      await api("DELETE", "/api/account");
      settingsDialog.close();
      state.user = null;
      chats = [];
      window.FS.newChat();
      renderProfile();
      renderSettings();
      renderList();
    });
    row.append(out, clear, del);
    box.append(row);
  } else {
    box.append(el("p", "", "You're using FlightScout as a guest. You can chat and book, but your chats are not saved."));
    const row = el("div", "settings-row");
    const signin = el("button", "ghost", "Sign in");
    const signup = el("button", "primary", "Sign up");
    signin.type = signup.type = "button";
    signin.addEventListener("click", () => { settingsDialog.close(); openAuth("signin"); });
    signup.addEventListener("click", () => { settingsDialog.close(); openAuth("signup"); });
    row.append(signin, signup);
    box.append(row);
  }
}

function openSettings() {
  const theme = keep.get("localStorage", "fs_theme") || "navy";
  settingsDialog.querySelectorAll('input[name="theme"]').forEach((r) => { r.checked = r.value === (theme === "light" || theme === "dark" ? theme : "navy"); });
  renderSettings();
  if (!settingsDialog.open) settingsDialog.showModal();
}
document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("settingsClose").addEventListener("click", () => settingsDialog.close());
settingsDialog.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener("change", () => applyTheme(r.value)));
[authDialog, settingsDialog, document.getElementById("languageDialog")].forEach((d) => d.addEventListener("click", (event) => { if (event.target === d) d.close(); })); // click outside

// ---------- start ----------
document.getElementById("searchIcon").append(icon("search", 15));
document.getElementById("newIcon").append(icon("plus", 16));
document.getElementById("settingsBtn").append(icon("gear", 18));
document.getElementById("menuBtn").append(icon("menu", 20));
document.getElementById("authClose").append(icon("close", 18));
document.getElementById("settingsClose").append(icon("close", 18));
document.getElementById("languageClose").append(icon("close", 18));

applyTheme(keep.get("localStorage", "fs_theme") || "navy");

(async function start() {
  renderProfile();
  renderList();
  const me = await api("GET", "/api/me");
  state.user = me.ok ? me.data.user : null;
  renderProfile();
  window.FS.renderAll();

  if (state.user) {
    const active = keep.get("sessionStorage", "fs_active");
    if (active) {
      const { ok, data } = await api("GET", `/api/chats/${active}`);
      if (ok) window.FS.loadChat(data);
    }
    await loadList();
  } else {
    // Bring back a guest's chat after a refresh.
    try {
      const saved = JSON.parse(keep.get("sessionStorage", "fs_guest") || "null");
      if (saved && Array.isArray(saved.messages) && saved.messages.length) window.FS.loadChat(saved);
    } catch { /* ignore a damaged copy */ }
  }
})();
})();
