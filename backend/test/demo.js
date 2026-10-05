// Integration test for "Book a Demo" requests: the public form endpoint and
// the site-owner-only inbox — run against the real Express app and real SQL,
// with an in-memory Postgres-compatible engine as the database.

process.env.JWT_SECRET = "test-secret";
process.env.PORT = "4505";
process.env.CORS_ORIGIN = "http://localhost:8790";
process.env.NODE_ENV = "test";
process.env.ADMIN_SEED_KEY = "test-seed-key";

const { setupTestDb } = require("./setup");
setupTestDb();

const BASE = `http://localhost:${process.env.PORT}`;
const results = [];
const check = (name, cond) => results.push({ name, pass: !!cond });

const json = (token) => ({ "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) });

async function signup(fullName, email, inviteCode) {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: json(),
    body: JSON.stringify({ fullName, company: `${fullName} Co`, email, password: "supersecret123", inviteCode }),
  });
  return res.json();
}

const submit = (body) => fetch(`${BASE}/api/demo-requests`, { method: "POST", headers: json(), body: JSON.stringify(body) });
const inbox = (token) => fetch(`${BASE}/api/demo-requests`, { headers: json(token) });

async function main() {
  require("../server");
  await new Promise((r) => setTimeout(r, 500));

  // The first workspace ever created is the site owner's.
  const owner = await signup("Site Owner", "owner@site.test");
  const customer = await signup("Some Customer", "admin@customer.test");
  check("the first workspace's admin is the site owner", owner.user.isSiteOwner === true);
  check("another workspace's admin is not the site owner", customer.user.isSiteOwner === false);

  // ---------------- Public form ----------------
  let res = await submit({ fullName: "", email: "lead@corp.test" });
  check("a request without a name is rejected", res.status === 400);

  res = await submit({ fullName: "Lena Lead", email: "not-an-email" });
  check("a request with a bad email is rejected", res.status === 400);

  res = await submit({ fullName: "Bot", email: "bot@spam.test", website: "http://spam.test" });
  check("a honeypot submission looks accepted", res.status === 201);

  res = await submit({
    fullName: "  Lena Lead  ",
    email: "Lena@Corp.Test",
    company: "Corp Inc",
    phone: "+1 555 0100",
    message: "We'd like a walkthrough for <b>20</b> people.",
    kind: "demo",
  });
  check("a valid demo request is accepted without an account", res.status === 201);

  res = await submit({ fullName: "Sam Sales", email: "sam@corp.test", kind: "sales" });
  check("a sales request needs only a name and email", res.status === 201);

  res = await submit({ fullName: "Odd Kind", email: "odd@corp.test", kind: "nonsense", message: "x".repeat(5000) });
  check("an unknown kind and oversized message are still accepted", res.status === 201);

  // ---------------- Who can read them ----------------
  res = await inbox();
  check("the inbox needs a login", res.status === 401);

  res = await inbox(customer.token);
  check("another workspace's admin can't read the inbox", res.status === 403);

  const team = await (await fetch(`${BASE}/api/team`, { headers: json(owner.token) })).json();
  const staff = await signup("Owner Staff", "staff@site.test", team.workspace.inviteCode);
  res = await inbox(staff.token);
  check("a non-admin in the owner's workspace can't read the inbox", res.status === 403 && staff.user.isSiteOwner === false);

  res = await inbox(owner.token);
  const { requests } = await res.json();
  check("the site owner can read the inbox", res.status === 200);
  check("the honeypot submission was not saved", requests.length === 3 && !requests.some((r) => r.email === "bot@spam.test"));

  const lena = requests.find((r) => r.email === "lena@corp.test");
  check("name and email are trimmed and normalised", !!lena && lena.full_name === "Lena Lead");
  check(
    "the request keeps its details and starts as new",
    lena.company === "Corp Inc" && lena.phone === "+1 555 0100" && lena.kind === "demo" && lena.status === "new" &&
      lena.message === "We'd like a walkthrough for <b>20</b> people."
  );
  const sam = requests.find((r) => r.email === "sam@corp.test");
  check("a sales request is recorded as sales with empty optional fields", sam.kind === "sales" && sam.company === null && sam.message === null);
  const odd = requests.find((r) => r.email === "odd@corp.test");
  check("an unknown kind falls back to demo and long messages are capped", odd.kind === "demo" && odd.message.length === 2000);

  // ---------------- Managing them ----------------
  res = await fetch(`${BASE}/api/demo-requests/${lena.id}`, { method: "PUT", headers: json(customer.token), body: JSON.stringify({ status: "contacted" }) });
  check("another workspace's admin can't update a request", res.status === 403);

  res = await fetch(`${BASE}/api/demo-requests/${lena.id}`, { method: "PUT", headers: json(owner.token), body: JSON.stringify({ status: "archived" }) });
  check("an unknown status is rejected", res.status === 400);

  res = await fetch(`${BASE}/api/demo-requests/${lena.id}`, { method: "PUT", headers: json(owner.token), body: JSON.stringify({ status: "contacted" }) });
  check("the site owner can mark a request contacted", res.status === 200 && (await res.json()).request.status === "contacted");

  res = await fetch(`${BASE}/api/demo-requests/${odd.id}`, { method: "DELETE", headers: json(customer.token) });
  check("another workspace's admin can't delete a request", res.status === 403);

  res = await fetch(`${BASE}/api/demo-requests/${odd.id}`, { method: "DELETE", headers: json(owner.token) });
  check("the site owner can delete a request", res.status === 200);
  check("the deleted request is gone", (await (await inbox(owner.token)).json()).requests.length === 2);

  // ---------------- Rate limit ----------------
  // Three valid requests were saved above; the limit is five per address.
  res = await submit({ fullName: "Fourth", email: "four@corp.test" });
  const fifth = await submit({ fullName: "Fifth", email: "five@corp.test" });
  check("requests up to the limit are accepted", res.status === 201 && fifth.status === 201);
  res = await submit({ fullName: "Sixth", email: "six@corp.test" });
  check("the next request from the same address is rate limited", res.status === 429);
  check("a rate-limited request is not saved", !(await (await inbox(owner.token)).json()).requests.some((r) => r.email === "six@corp.test"));

  // ---------------- OWNER_EMAIL names the owner explicitly ----------------
  const me = async (token) => (await (await fetch(`${BASE}/api/auth/me`, { headers: json(token) })).json()).user;

  process.env.OWNER_EMAIL = " Admin@Customer.Test , someone-else@site.test";
  check("the named account becomes the site owner", (await me(customer.token)).isSiteOwner === true);
  check("the named account can read the inbox", (await inbox(customer.token)).status === 200);
  check("the oldest workspace's admin is no longer the owner", (await me(owner.token)).isSiteOwner === false);
  check("the oldest workspace's admin can no longer read the inbox", (await inbox(owner.token)).status === 403);

  // A named owner who is only a member still gets the inbox, and is made an
  // admin of their own workspace on the next startup.
  process.env.OWNER_EMAIL = "staff@site.test";
  check("a named owner doesn't need to be an admin already", (await inbox(staff.token)).status === 200);
  check("before startup promotion they are still a member", (await me(staff.token)).accessLevel === "member");
  await require("../workspaces").promoteOwner();
  const promoted = await me(staff.token);
  check("startup promotion makes the named owner an admin", promoted.accessLevel === "admin" && promoted.isSiteOwner === true);
  check("promotion leaves other accounts alone", (await me(customer.token)).isSiteOwner === false && (await me(customer.token)).accessLevel === "admin");

  delete process.env.OWNER_EMAIL;
  check("without OWNER_EMAIL the oldest-workspace rule applies again", (await me(owner.token)).isSiteOwner === true);

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"} - ${r.name}`));
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
