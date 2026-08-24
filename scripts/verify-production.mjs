import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const baseUrl = process.env.PRODUCTION_BASE_URL ?? "https://nfl-talent-geography.pages.dev";
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const retries = Number(args.get("--retries") ?? 1);
const delayMs = Number(args.get("--delay-ms") ?? 0);
assert.ok(Number.isInteger(retries) && retries > 0, "--retries must be a positive integer");
assert.ok(Number.isFinite(delayMs) && delayMs >= 0, "--delay-ms must be nonnegative");

const local = await readFile(new URL("public/data/nfl-talent-map.json", root));
const localData = JSON.parse(local);
assert.deepEqual(localData.meta.years, [2000, 2026]);
assert.equal(localData.meta.totalPlayers, 6_901);
assert.equal(localData.players.filter((row) => row.year === 2026).length, 257);
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function verify() {
  const url = new URL("/data/nfl-talent-map.json", baseUrl);
  url.searchParams.set("release-check", Date.now().toString());
  const response = await fetch(url, { cache: "no-store" });
  assert.equal(response.status, 200, `${url.pathname} returned HTTP ${response.status}`);
  const remote = Buffer.from(await response.arrayBuffer());
  assert.equal(
    digest(remote),
    digest(local),
    `${url.pathname} does not match the release commit`,
  );
  process.stdout.write(`Production matches this release: ${digest(local)}\n`);
}

let lastError;
for (let attempt = 1; attempt <= retries; attempt += 1) {
  try {
    await verify();
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < retries) {
      process.stderr.write(`Production check ${attempt}/${retries} failed: ${error.message}\n`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
throw lastError;
