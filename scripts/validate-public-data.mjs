import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { buildCoverageAudit } from "./build-coverage-audit.mjs";

const root = new URL("../", import.meta.url);
const readJson = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `${label} must be unique`);
}

const [data, countyGeo, stateGeo, countyReference] = await Promise.all([
  readJson("public/data/nfl-talent-map.json"),
  readJson("public/data/us-counties-2020-simplified.geojson"),
  readJson("public/data/us-states-2020-simplified.geojson"),
  readJson("public/data/county-reference-2020.json"),
]);

assert.deepEqual(Object.keys(data).sort(), ["counties", "meta", "players"]);
assert.equal(data.players.length, 6_901);
assert.equal(data.counties.length, 3_143);
assert.equal(countyGeo.features.length, 3_143);
assert.equal(stateGeo.features.length, 51);
assert.equal(countyReference.county_count, 3_143);

unique(data.players.map((row) => row.id), "player id");
unique(data.players.map((row) => `${row.year}-${row.overallPick}`), "draft key");
unique(data.counties.map((row) => row.fips), "county FIPS");

const countyFips = new Set(data.counties.map((row) => row.fips));
const geographyValues = new Set([
  "high_school",
  "birth_fallback",
  "outside_map",
  "unresolved",
]);

for (const row of data.players) {
  assert.match(row.id, /^20(?:0\d|1\d|2[0-6])-\d+$/);
  assert.ok(row.year >= 2000 && row.year <= 2026, `invalid year: ${row.id}`);
  assert.ok(row.round >= 1 && row.round <= 7, `invalid round: ${row.id}`);
  assert.ok(row.overallPick >= 1, `invalid overall pick: ${row.id}`);
  assert.ok(geographyValues.has(row.geographyBasis), `invalid geography: ${row.id}`);
  assert.equal(
    row.countyFips !== null,
    row.geographyBasis === "high_school" || row.geographyBasis === "birth_fallback",
    `county/evidence mismatch: ${row.id}`,
  );
  if (row.countyFips) {
    assert.match(row.countyFips, /^\d{5}$/);
    assert.ok(countyFips.has(row.countyFips), `unknown county: ${row.id}`);
  }
  for (const forbidden of ["name", "playerName", "highSchool", "birthPlace"]) {
    assert.ok(!(forbidden in row), `public row exposes ${forbidden}`);
  }
}

for (const county of data.counties) {
  assert.match(county.fips, /^\d{5}$/);
  assert.ok(county.population > 0, `invalid population: ${county.fips}`);
}

const geoFips = countyGeo.features.map((feature) => String(feature.id));
unique(geoFips, "county geometry FIPS");
assert.deepEqual([...geoFips].sort(), [...countyFips].sort());

const basisCounts = Object.fromEntries(
  [...geographyValues].map((basis) => [
    basis,
    data.players.filter((row) => row.geographyBasis === basis).length,
  ]),
);
assert.deepEqual(basisCounts, {
  high_school: 2_690,
  birth_fallback: 2_522,
  outside_map: 144,
  unresolved: 1_545,
});
assert.equal(data.meta.totalPlayers, 6_901);
assert.equal(data.meta.mappedPlayers, 5_212);
assert.equal(data.meta.unresolvedPlayers, 1_545);
assert.equal(data.meta.outsideMapPlayers, 144);

for (const source of data.meta.sources) {
  assert.ok(source.label.trim());
  assert.match(source.url, /^https:\/\//);
}

const audit = buildCoverageAudit(data);
assert.deepEqual(
  audit.byEra.map(({ group, total, mapped, highSchool, birthFallback, unresolved }) => ({
    group,
    total,
    mapped,
    highSchool,
    birthFallback,
    unresolved,
  })),
  [
    { group: "2000-2014", total: 3_823, mapped: 2_323, highSchool: 0, birthFallback: 2_323, unresolved: 1_390 },
    { group: "2015-2023", total: 2_307, mapped: 2_172, highSchool: 1_983, birthFallback: 189, unresolved: 111 },
    { group: "2024-2025", total: 514, mapped: 462, highSchool: 452, birthFallback: 10, unresolved: 43 },
    { group: "2026", total: 257, mapped: 255, highSchool: 255, birthFallback: 0, unresolved: 1 },
  ],
);
assert.deepEqual(
  audit.byOutcome.map(({ group, total, mapped, mappedPct }) => ({
    group,
    total,
    mapped,
    mappedPct,
  })),
  [
    { group: "pro_bowl_player_through_2019_classes", total: 652, mapped: 493, mappedPct: 75.61 },
    { group: "no_pro_bowl_through_2019_classes", total: 4_443, mapped: 3_038, mappedPct: 68.38 },
  ],
);

const digest = createHash("sha256")
  .update(await readFile(new URL("public/data/nfl-talent-map.json", root)))
  .digest("hex");
process.stdout.write(
  `Public data validation passed: 6,901 selections, 3,143 counties, sha256 ${digest}\n`,
);
