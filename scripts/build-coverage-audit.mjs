import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const dataPath = new URL("../public/data/nfl-talent-map.json", import.meta.url);
const reportPath = new URL("../reports/coverage-audit.json", import.meta.url);

function roundPct(value) {
  return Math.round(value * 100) / 100;
}

function summarize(rows, label) {
  const total = rows.length;
  const highSchool = rows.filter(
    (row) => row.geographyBasis === "high_school",
  ).length;
  const birthFallback = rows.filter(
    (row) => row.geographyBasis === "birth_fallback",
  ).length;
  const outsideMap = rows.filter(
    (row) => row.geographyBasis === "outside_map",
  ).length;
  const unresolved = rows.filter(
    (row) => row.geographyBasis === "unresolved",
  ).length;
  const mapped = highSchool + birthFallback;
  const pct = (value) => (total ? roundPct((value / total) * 100) : 0);
  return {
    group: String(label),
    total,
    mapped,
    mappedPct: pct(mapped),
    highSchool,
    highSchoolPct: pct(highSchool),
    birthFallback,
    birthFallbackPct: pct(birthFallback),
    outsideMap,
    outsideMapPct: pct(outsideMap),
    unresolved,
    unresolvedPct: pct(unresolved),
  };
}

function groupRows(rows, valueForRow) {
  const groups = new Map();
  for (const row of rows) {
    const value = valueForRow(row);
    const values = groups.get(value) ?? [];
    values.push(row);
    groups.set(value, values);
  }
  return [...groups.entries()].map(([label, values]) =>
    summarize(values, label),
  );
}

export function buildCoverageAudit(data) {
  const players = data.players;
  const byEra = [
    summarize(
      players.filter((row) => row.year >= 2000 && row.year <= 2014),
      "2000-2014",
    ),
    summarize(
      players.filter((row) => row.year >= 2015 && row.year <= 2023),
      "2015-2023",
    ),
    summarize(
      players.filter((row) => row.year >= 2024 && row.year <= 2025),
      "2024-2025",
    ),
    summarize(
      players.filter((row) => row.year === 2026),
      "2026",
    ),
  ];
  const byYear = groupRows(players, (row) => row.year).sort(
    (a, b) => Number(a.group) - Number(b.group),
  );
  const byRound = groupRows(players, (row) => row.round).sort(
    (a, b) => Number(a.group) - Number(b.group),
  );
  const byPosition = groupRows(players, (row) => row.position || "Unknown").sort(
    (a, b) => a.mappedPct - b.mappedPct || b.total - a.total,
  );
  const byTeam = groupRows(players, (row) => row.team || "Unknown").sort(
    (a, b) => a.mappedPct - b.mappedPct || a.group.localeCompare(b.group),
  );
  const byConference = groupRows(
    players,
    (row) => row.conference || "Unknown",
  ).sort(
    (a, b) => a.mappedPct - b.mappedPct || a.group.localeCompare(b.group),
  );
  const matureOutcomeRows = players.filter((row) => row.year <= 2019);
  const byOutcome = [
    summarize(
      matureOutcomeRows.filter((row) => row.proBowls > 0),
      "pro_bowl_player_through_2019_classes",
    ),
    summarize(
      matureOutcomeRows.filter((row) => row.proBowls === 0),
      "no_pro_bowl_through_2019_classes",
    ),
  ];
  const meaningfulPositions = byPosition.filter((row) => row.total >= 30);
  const firstRound = byRound.find((row) => row.group === "1");
  const seventhRound = byRound.find((row) => row.group === "7");
  const earliestEra = byEra[0];
  const historicalEra = byEra[1];

  return {
    schemaVersion: 1,
    dataAsOf: data.meta.dataAsOf,
    grain: "one official NFL Draft selection keyed by draft year and overall pick",
    population: summarize(players, "2000-2026"),
    byEra,
    byYear,
    byRound,
    byPosition,
    byTeam,
    byConference,
    byOutcome,
    riskFindings: [
      {
        id: "era_measurement_break",
        severity: "high",
        evidence: {
          pre2015MappedPct: earliestEra.mappedPct,
          pre2015HighSchoolPct: earliestEra.highSchoolPct,
          post2015To2023MappedPct: historicalEra.mappedPct,
          post2015To2023HighSchoolPct: historicalEra.highSchoolPct,
        },
        interpretation:
          "The pre-2015 mapped population uses birth-county fallback rather than verified high-school county, so cross-era county comparisons do not use one stable geography definition.",
        control:
          "Default the product to the 2015-2026 verified-high-school view and label the all-years fallback view as mixed evidence.",
      },
      {
        id: "round_coverage_gradient",
        severity: "medium",
        evidence: {
          firstRoundMappedPct: firstRound?.mappedPct ?? null,
          seventhRoundMappedPct: seventhRound?.mappedPct ?? null,
        },
        interpretation:
          "Later-round picks have lower location coverage, so mapped-only analyses can overrepresent earlier selections.",
        control:
          "Show coverage after every filter and never treat unresolved records as zero.",
      },
      {
        id: "position_coverage_gradient",
        severity: "medium",
        evidence: {
          lowestCoveragePosition: meaningfulPositions[0]?.group ?? null,
          lowestCoveragePct: meaningfulPositions[0]?.mappedPct ?? null,
          highestCoveragePosition:
            meaningfulPositions[meaningfulPositions.length - 1]?.group ?? null,
          highestCoveragePct:
            meaningfulPositions[meaningfulPositions.length - 1]?.mappedPct ?? null,
        },
        interpretation:
          "Coverage varies by listed position, partly because source position taxonomies change across eras.",
        control:
          "Expose selection-level coverage and avoid claims that position differences represent true geographic production without adjustment.",
      },
      {
        id: "outcome_coverage_gradient",
        severity: "medium",
        evidence: {
          proBowlPlayerMappedPct: byOutcome[0].mappedPct,
          noProBowlMappedPct: byOutcome[1].mappedPct,
          outcomeWindow: "draft classes through 2019",
        },
        interpretation:
          "Within mature draft classes, players with a Pro Bowl have higher county coverage than other selections, so mapped-only outcome summaries can overrepresent successful players.",
        control:
          "Label the outcome window, disclose the coverage gradient, and present county outcome counts as descriptive rather than causal.",
      },
    ],
  };
}

export async function loadCoverageAuditSource() {
  return JSON.parse(await readFile(dataPath, "utf8"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await loadCoverageAuditSource();
  const report = buildCoverageAudit(data);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${reportPath.pathname.replace(projectRoot, "")}\n`);
}
