// A tiny file-based store for accounts and saved chats. No database to install.
//
// IMPORTANT: on Render's free plan the disk is wiped when the service redeploys or
// restarts after long idle, so accounts and chats can reset. For a real launch,
// move this to a database (the functions here are the only place that would change).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FILE = process.env.DATA_FILE || path.join(__dirname, "..", "data", "store.json");

let db = { secret: "", users: {}, chats: {}, bookings: {} };
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
} catch {
  /* first run: start empty */
}
if (!db.secret) db.secret = crypto.randomBytes(32).toString("hex");

// Optional free cloud copy (Upstash Redis). Hosts with a wiped disk (Render free plan) would
// otherwise forget every account. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
const REMOTE_KEY = "flightscout:db";
const remoteUrl = () => (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const remoteOn = () => Boolean(remoteUrl() && process.env.UPSTASH_REDIS_REST_TOKEN);

async function remote(command) {
  const res = await fetch(remoteUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data.result;
}

// The server waits for this before it starts, so accounts are loaded first.
// Nothing is pushed to the cloud until the cloud copy has been read, so an empty start can never wipe it.
let remoteLoaded = !remoteOn();
const ready = (async () => {
  if (!remoteOn()) return;
  try {
    const saved = await remote(["GET", REMOTE_KEY]);
    if (saved) db = { ...db, ...JSON.parse(saved) };
    if (!db.secret) db.secret = crypto.randomBytes(32).toString("hex");
    remoteLoaded = true;
    save();
    console.log(saved ? "Accounts loaded from the cloud copy (Upstash)." : "Cloud copy is empty, starting it from this server.");
  } catch (err) {
    console.error("Could not load the cloud copy, using the local file:", err.message);
  }
})();

let timer = null;
let remoteTimer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
async function pushNow() {
  if (!remoteOn() || !remoteLoaded) return;
  try {
    const text = JSON.stringify(db);
    if (text.length > 900000) console.error("Warning: saved data is close to the 1 MB limit of the free Upstash plan.");
    await remote(["SET", REMOTE_KEY, text]);
  } catch (err) {
    console.error("Could not save the cloud copy:", err.message);
  }
}
function pushRemote() {
  if (!remoteOn() || !remoteLoaded) return;
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(() => { remoteTimer = null; pushNow(); }, 500);
}
function flush() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch (err) {
    console.error("Could not save data:", err.message);
  }
  pushRemote();
}
process.on("exit", () => {
  if (timer) flush();
});
save(); // writes the secret on the very first run

// When the host stops the server (a redeploy sends SIGTERM), save everything first.
async function shutdown() {
  if (timer) { clearTimeout(timer); flush(); }
  if (remoteTimer) { clearTimeout(remoteTimer); remoteTimer = null; await pushNow(); }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ---------- passwords ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function checkPassword(password, user) {
  const { hash } = hashPassword(password, user.salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- sessions (signed cookie: userId.expiry.signature) ----------
const SECRET = () => process.env.SESSION_SECRET || db.secret;
const sign = (value) => crypto.createHmac("sha256", SECRET()).update(value).digest("hex");
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function makeSession(userId) {
  const body = `${userId}.${Date.now() + THIRTY_DAYS}`;
  return `${body}.${sign(body)}`;
}
function readSession(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [userId, expiry, sig] = parts;
  const good = sign(`${userId}.${expiry}`);
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Number(expiry) < Date.now()) return null;
  return db.users[userId] && isVerified(db.users[userId]) ? userId : null;
}

// ---------- users ----------
// Accounts made before email verification existed have no "verified" flag and count as verified.
const isVerified = (u) => u.verified !== false;
const { addressAs } = require("./profile");
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, gender: u.gender || "", age: u.age || null, callMe: addressAs(u) });
const findByEmail = (email) => {
  const key = String(email).toLowerCase();
  return Object.values(db.users).find((u) => u.email.toLowerCase() === key) || null;
};

// A 6-digit code, kept only as a hash, valid for 15 minutes, 5 tries.
const CODE_MINUTES = 15;
const codeHash = (userId, code) => crypto.createHmac("sha256", SECRET()).update(`${userId}:${code}`).digest("hex");

function issueCode(user) {
  if (user.codeSentAt && Date.now() - user.codeSentAt < 30 * 1000) return { error: "Please wait a few seconds before asking for another code." };
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  user.codeHash = codeHash(user.id, code);
  user.codeExpires = Date.now() + CODE_MINUTES * 60 * 1000;
  user.codeTries = 0;
  user.codeSentAt = Date.now();
  save();
  return { code };
}

function createUser({ name, email, password, gender = "", age = null }) {
  const existing = findByEmail(email);
  if (existing && isVerified(existing)) return { error: "There is already an account with this email. Try signing in.", exists: true };

  // Someone who never finished verifying can start again with the same email.
  if (existing) {
    const { salt, hash } = hashPassword(password);
    Object.assign(existing, { name, salt, hash, gender, age });
    const issued = issueCode(existing);
    return issued.error ? { error: issued.error } : { user: publicUser(existing), code: issued.code, unverified: true };
  }

  const id = crypto.randomBytes(8).toString("hex");
  const { salt, hash } = hashPassword(password);
  db.users[id] = { id, name, email, salt, hash, gender, age, verified: false, createdAt: Date.now() };
  db.chats[id] = {};
  const issued = issueCode(db.users[id]);
  return { user: publicUser(db.users[id]), code: issued.code, unverified: true };
}

function verifyEmail(email, code) {
  const user = findByEmail(email);
  const bad = { error: "That code is not right, or it has expired. Ask for a new one." };
  if (!user || isVerified(user) || !user.codeHash) return user && isVerified(user) ? { user: publicUser(user) } : bad;
  if (Date.now() > user.codeExpires || (user.codeTries || 0) >= 5) return bad;
  user.codeTries = (user.codeTries || 0) + 1;
  const a = Buffer.from(codeHash(user.id, String(code).trim()), "hex");
  const b = Buffer.from(user.codeHash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    save();
    return bad;
  }
  user.verified = true;
  delete user.codeHash;
  delete user.codeExpires;
  save();
  return { user: publicUser(user) };
}

// Sends back a fresh code for an account that is not verified yet (nothing for anyone else).
function resendCode(email) {
  const user = findByEmail(email);
  if (!user || isVerified(user)) return {};
  const issued = issueCode(user);
  return issued.error ? { error: issued.error } : { user: publicUser(user), code: issued.code };
}

function signIn(email, password) {
  const user = findByEmail(email);
  // Same message either way, so nobody can use this to find out who has an account.
  if (!user || !checkPassword(password, user)) return { error: "That email or password is not right." };
  if (!isVerified(user)) return { unverified: true, user: publicUser(user) };
  return { user: publicUser(user) };
}

const getUser = (id) => (db.users[id] && isVerified(db.users[id]) ? publicUser(db.users[id]) : null);

function updateProfile(id, { name, gender, age }) {
  const u = db.users[id];
  if (!u) return null;
  if (name) u.name = name;
  u.gender = gender;
  u.age = age;
  save();
  return publicUser(u);
}

// ---------- bookings (so tickets, seats and receipts still work after a restart) ----------
const MAX_BOOKINGS = 300;
function saveBooking(booking) {
  db.bookings = db.bookings || {};
  db.bookings[booking.reference] = { ...booking, savedAt: Date.now() };
  const all = Object.values(db.bookings);
  if (all.length > MAX_BOOKINGS) {
    all.sort((a, b) => a.savedAt - b.savedAt).slice(0, all.length - MAX_BOOKINGS).forEach((b) => delete db.bookings[b.reference]);
  }
  save();
}
const getBooking = (reference) => (db.bookings || {})[String(reference).toUpperCase()] || null;

function deleteUser(id) {
  delete db.users[id];
  delete db.chats[id];
  save();
}

// ---------- chats ----------
const MAX_CHATS = 100;
const messageText = (m) => String((m && m.text) || "");

function listChats(userId, query) {
  const all = Object.values(db.chats[userId] || {});
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const chat of all) {
    let snippet = "";
    if (words.length) {
      const hay = [chat.title, ...(chat.messages || []).map(messageText)].join("\n").toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      const hit = (chat.messages || []).find((m) => messageText(m).toLowerCase().includes(words[0]));
      if (hit) {
        const text = messageText(hit);
        const at = Math.max(0, text.toLowerCase().indexOf(words[0]) - 30);
        snippet = text.slice(at, at + 90);
      }
    }
    out.push({ id: chat.id, title: chat.title, updatedAt: chat.updatedAt, snippet });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

const getChat = (userId, id) => (db.chats[userId] || {})[id] || null;

function saveChat(userId, id, { title, messages, context }) {
  const mine = (db.chats[userId] = db.chats[userId] || {});
  if (!mine[id] && Object.keys(mine).length >= MAX_CHATS) {
    // Make room by dropping the oldest chat.
    const oldest = Object.values(mine).sort((a, b) => a.updatedAt - b.updatedAt)[0];
    if (oldest) delete mine[oldest.id];
  }
  mine[id] = { id, title, messages, context, createdAt: mine[id]?.createdAt || Date.now(), updatedAt: Date.now() };
  save();
  return { id, title, updatedAt: mine[id].updatedAt };
}

function deleteChat(userId, id) {
  if (db.chats[userId]) delete db.chats[userId][id];
  save();
}
function deleteAllChats(userId) {
  db.chats[userId] = {};
  save();
}

module.exports = {
  ready, createUser, verifyEmail, resendCode, signIn, getUser, deleteUser, updateProfile, saveBooking, getBooking,
  makeSession, readSession,
  listChats, getChat, saveChat, deleteChat, deleteAllChats,
  flush,
};
