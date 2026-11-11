// How Scout addresses a signed-in person: "Mr. Alex", "Ms. Ada" or just "Alex".
// Titles are used only when we know the gender and the person is 35 or older; otherwise the first name.

const GENDERS = ["male", "female", ""];

function firstName(name) {
  const first = String(name || "").trim().split(/\s+/)[0] || "";
  return first.charAt(0).toUpperCase() + first.slice(1); // "alex" -> "Alex"
}

function addressAs(user) {
  if (!user) return "";
  const first = firstName(user.name);
  if (!first) return "";
  const age = Number(user.age) || 0;
  if (age >= 35 && user.gender === "male") return `Mr. ${first}`;
  if (age >= 35 && user.gender === "female") return `Ms. ${first}`;
  return first;
}

// Returns { gender, age } or { error }.
function cleanProfile(body) {
  const gender = String(body?.gender || "").toLowerCase();
  if (!GENDERS.includes(gender)) return { error: "Please choose one of the options for gender." };
  const age = Number(body?.age);
  if (!Number.isInteger(age) || age < 18 || age > 110) return { error: "Please enter your age (you need to be 18 or older to create an account)." };
  return { gender, age };
}

module.exports = { addressAs, cleanProfile, firstName };
