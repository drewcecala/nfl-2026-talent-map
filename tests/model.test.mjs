import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DEFAULT_FILTERS,
  PRO_BOWL_MATURE_YEAR_MAX,
  buildCountyStats,
  eligiblePlayersForMetric,
  filterPlayers,
  filtersToQuery,
  legendBins,
  metricValue,
  parseFiltersFromSearch,
  playersForGeography,
  summarizeCoverageByEra,
} from "../app/nfl-talent-map/model.ts";

const data = JSON.parse(
  await readFile(new URL("../public/data/nfl-talent-map.json", import.meta.url), "utf8"),
);

test("the default view uses comparable verified high-school evidence", () => {
  const eligible = filterPlayers(data.players, DEFAULT_FILTERS);
  const mapped = playersForGeography(eligible, DEFAULT_FILTERS.geography);
  assert.equal(eligible.length, 3_078);
  assert.equal(mapped.length, 2_690);
  assert.equal(Math.round((mapped.length / eligible.length) * 1_000) / 10, 87.4);
  const allMapped = playersForGeography(eligible, "all_mapped");
  assert.equal(allMapped.length, 2_889);
  assert.equal(Math.round((allMapped.length / eligible.length) * 1_000) / 10, 93.9);
});

test("the historical period exposes the evidence break", () => {
  const historical = filterPlayers(data.players, { ...DEFAULT_FILTERS, year: "2000-2014" });
  assert.equal(historical.length, 3_823);
  assert.equal(playersForGeography(historical, "high_school").length, 0);
  assert.equal(playersForGeography(historical, "all_mapped").length, 2_323);
});

test("coverage audit preserves outside-map and unresolved records", () => {
  assert.deepEqual(summarizeCoverageByEra(data.players), [
    { era: "2000–2014", total: 3_823, mapped: 2_323, highSchool: 0, birthFallback: 2_323, outsideMap: 110, unresolved: 1_390, mappedPct: 60.76, highSchoolPct: 0, unresolvedPct: 36.36 },
    { era: "2015–2023", total: 2_307, mapped: 2_172, highSchool: 1_983, birthFallback: 189, outsideMap: 24, unresolved: 111, mappedPct: 94.15, highSchoolPct: 85.96, unresolvedPct: 4.81 },
    { era: "2024–2025", total: 514, mapped: 462, highSchool: 452, birthFallback: 10, outsideMap: 9, unresolved: 43, mappedPct: 89.88, highSchoolPct: 87.94, unresolvedPct: 8.37 },
    { era: "2026", total: 257, mapped: 255, highSchool: 255, birthFallback: 0, outsideMap: 1, unresolved: 1, mappedPct: 99.22, highSchoolPct: 99.22, unresolvedPct: 0.39 },
  ]);
});

test("per-capita values are withheld below five mapped draftees", () => {
  const stats = buildCountyStats(data.counties, data.players);
  const onePlayer = stats.find((county) => county.total === 1);
  const fivePlayers = stats.find((county) => county.total === 5);
  assert.ok(onePlayer);
  assert.ok(fivePlayers);
  assert.equal(onePlayer.rateEligible, false);
  assert.equal(metricValue(onePlayer, "per_capita"), 0);
  assert.equal(fivePlayers.rateEligible, true);
  assert.ok(metricValue(fivePlayers, "per_capita") > 0);
});

test("an empty per-capita view does not emit zero-width legend ranges", () => {
  assert.deepEqual(legendBins([0, 0, 0, 0], "per_capita"), []);
});

test("Pro Bowl comparisons exclude immature draft classes", () => {
  const metricPool = eligiblePlayersForMetric(data.players, "pro_bowl");
  assert.ok(metricPool.every((row) => row.year <= PRO_BOWL_MATURE_YEAR_MAX));
  assert.ok(metricPool.length < data.players.length);
});

test("URL filters are validated and serialize non-default state", () => {
  assert.deepEqual(parseFiltersFromSearch("?year=garbage&round=9&metric=hof&team=XYZ", data.players), DEFAULT_FILTERS);
  const parsed = parseFiltersFromSearch("?year=2025&geography=all_mapped&round=1&metric=per_capita", data.players);
  assert.equal(parsed.year, "2025");
  assert.equal(parsed.geography, "all_mapped");
  assert.equal(parsed.round, "1");
  assert.equal(parsed.metric, "per_capita");
  assert.equal(filtersToQuery(parsed).toString(), "year=2025&geography=all_mapped&round=1&metric=per_capita");
});

test("the unaudited 2026 conference boundary cannot create false empty results", () => {
  const requested = {
    ...DEFAULT_FILTERS,
    year: "2026",
    conference: "Southeastern Conference",
  };
  const parsed = parseFiltersFromSearch(
    "?year=2026&conference=Southeastern+Conference",
    data.players,
  );

  assert.equal(parsed.year, "2026");
  assert.equal(parsed.conference, "all");
  assert.equal(filtersToQuery(requested).toString(), "year=2026");
  assert.equal(filterPlayers(data.players, requested).length, 257);
  assert.ok(
    data.players
      .filter((player) => player.year === 2026)
      .every((player) => player.conference === "Unknown"),
  );
});
