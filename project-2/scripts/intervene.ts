/**
 * `npm run intervene -- "Connected the X account by hand"`: logs a human intervention on the
 * public dashboard. Judges ask where you had to step in; log every time, honestly.
 * Needs PMF_APP_URL (the app's URL from `naive up`) and PMF_ADMIN_TOKEN.
 */
const url = process.env["PMF_APP_URL"];
const token = process.env["PMF_ADMIN_TOKEN"];
const description = process.argv.slice(2).join(" ").trim();

if (!url || !token) {
  console.error("Set PMF_APP_URL and PMF_ADMIN_TOKEN first.");
  process.exit(1);
}
if (!description) {
  console.error('Usage: npm run intervene -- "what you did and why"');
  process.exit(1);
}

const response = await fetch(new URL("/api/interventions", url), {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify({ description }),
});
console.log(response.status, await response.text());
if (!response.ok) process.exit(1);
