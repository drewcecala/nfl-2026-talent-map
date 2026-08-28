export type Metric = "per_capita" | "total" | "first_round" | "pro_bowl";

export type GeographyBasis =
  | "high_school"
  | "birth_fallback"
  | "outside_map"
  | "unresolved";

export type GeographyView = "high_school" | "all_mapped";

export type PlayerRow = {
  id: string;
  year: number;
  round: number;
  overallPick: number;
  position: string;
  college: string;
  conference: string;
  team: string;
  proBowls: number;
  hallOfFame: boolean;
  countyFips: string | null;
  geographyBasis: GeographyBasis;
};

export type CountyMeta = {
  fips: string;
  name: string;
  state: string;
  stateAbbr: string;
  population: number;
};

export type CountyStats = CountyMeta & {
  total: number;
  perCapita: number;
  rateEligible: boolean;
  firstRound: number;
  proBowl: number;
  mostCommonPosition: string;
};

export type FilterState = {
  year: string;
  geography: GeographyView;
  position: string;
  round: string;
  conference: string;
  team: string;
  firstRoundOnly: boolean;
  proBowlOnly: boolean;
  metric: Metric;
};

export const RATE_MIN_COUNT = 5;
export const PRO_BOWL_MATURE_YEAR_MAX = 2019;
export const UNAUDITED_CONFERENCE_YEAR = 2026;

export const DEFAULT_FILTERS: FilterState = {
  year: "2015-2026",
  geography: "high_school",
  position: "all",
  round: "all",
  conference: "all",
  team: "all",
  firstRoundOnly: false,
  proBowlOnly: false,
  metric: "total",
};

export const METRIC_LABELS: Record<Metric, string> = {
  total: "Total draftees",
  per_capita: "Draftees per 100,000",
  first_round: "First-round picks",
  pro_bowl: "Pro Bowl players",
};

export const MAP_COLORS = [
  "#d9e8f3",
  "#accbe1",
  "#73a9cf",
  "#367fb7",
  "#075786",
];

export const EMPTY_COLOR = "#edf1f4";
export const RATE_INSUFFICIENT_COLOR = "#d9d4c8";

export const number = new Intl.NumberFormat("en-US");
export const oneDecimal = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
export const twoDecimals = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function playerCountLabel(value: number) {
  return `${number.format(value)} ${value === 1 ? "player" : "players"}`;
}

export function normalString(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : "Unknown";
}

export function metricValue(stats: CountyStats, metric: Metric) {
  if (metric === "per_capita") {
    return stats.rateEligible ? stats.perCapita : 0;
  }
  if (metric === "total") return stats.total;
  if (metric === "first_round") return stats.firstRound;
  return stats.proBowl;
}

export function formatMetric(value: number, metric: Metric) {
  return metric === "per_capita"
    ? twoDecimals.format(value)
    : number.format(value);
}

function quantile(sorted: number[], probability: number) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function colorScale(stats: CountyStats[], metric: Metric) {
  const positive = stats
    .map((county) => metricValue(county, metric))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const thresholds =
    metric === "per_capita"
      ? [0.2, 0.4, 0.6, 0.8].map((probability) =>
          quantile(positive, probability),
        )
      : [0.2, 0.4, 0.6, 0.8].reduce<number[]>((output, probability) => {
          const rounded = Math.max(1, Math.ceil(quantile(positive, probability)));
          const next = output.length
            ? Math.max(rounded, output[output.length - 1] + 1)
            : rounded;
          output.push(next);
          return output;
        }, []);

  return {
    thresholds,
    color(value: number) {
      if (value <= 0) return EMPTY_COLOR;
      const index = thresholds.findIndex((threshold) => value <= threshold);
      return MAP_COLORS[index === -1 ? MAP_COLORS.length - 1 : index];
    },
  };
}

export function legendBins(thresholds: number[], metric: Metric) {
  if (!thresholds.length || thresholds.every((threshold) => threshold === 0)) {
    return [];
  }
  if (metric !== "per_capita") {
    return MAP_COLORS.map((color, index) => {
      const lower = index === 0 ? 1 : Math.floor(thresholds[index - 1]) + 1;
      const upper =
        index < thresholds.length ? Math.floor(thresholds[index]) : null;
      const label =
        upper === null
          ? `${number.format(lower)}+`
          : lower === upper
            ? number.format(lower)
            : `${number.format(lower)}–${number.format(upper)}`;
      return { color, label };
    });
  }
  const starts = [0, ...thresholds];
  return MAP_COLORS.map((color, index) => {
    const floor = starts[index];
    const ceiling = index < thresholds.length ? thresholds[index] : null;
    const label =
      ceiling === null
        ? `${formatMetric(floor, metric)}+`
        : index === 0
          ? `>0–${formatMetric(ceiling, metric)}`
          : `${formatMetric(floor, metric)}–${formatMetric(ceiling, metric)}`;
    return { color, label };
  });
}

function validYearScope(value: string | null) {
  if (!value) return DEFAULT_FILTERS.year;
  if (["all", "2000-2014", "2015-2026"].includes(value)) return value;
  if (/^20(?:0\d|1\d|2[0-6])$/.test(value)) return value;
  return DEFAULT_FILTERS.year;
}

function validOption(
  requested: string | null,
  players: PlayerRow[],
  field: "position" | "conference" | "team",
) {
  if (!requested || requested === "all") return "all";
  const allowed = new Set(players.map((player) => normalString(player[field])));
  return allowed.has(requested) ? requested : "all";
}

export function parseFiltersFromSearch(
  search: string,
  players: PlayerRow[],
): FilterState {
  const query = new URLSearchParams(search);
  const metric = query.get("metric");
  const geography = query.get("geography");
  const round = query.get("round");
  return normalizeConferenceBoundary({
    year: validYearScope(query.get("year")),
    geography:
      geography === "all_mapped" ? "all_mapped" : DEFAULT_FILTERS.geography,
    position: validOption(query.get("position"), players, "position"),
    round: round && /^[1-7]$/.test(round) ? round : "all",
    conference: validOption(query.get("conference"), players, "conference"),
    team: validOption(query.get("team"), players, "team"),
    firstRoundOnly: query.get("first_round") === "1",
    proBowlOnly: query.get("pro_bowl") === "1",
    metric:
      metric && metric in METRIC_LABELS
        ? (metric as Metric)
        : DEFAULT_FILTERS.metric,
  });
}

export function filtersToQuery(filters: FilterState) {
  const normalized = normalizeConferenceBoundary(filters);
  const query = new URLSearchParams();
  if (normalized.year !== DEFAULT_FILTERS.year) query.set("year", normalized.year);
  if (normalized.geography !== DEFAULT_FILTERS.geography) {
    query.set("geography", normalized.geography);
  }
  if (normalized.position !== "all") query.set("position", normalized.position);
  if (normalized.round !== "all") query.set("round", normalized.round);
  if (normalized.conference !== "all") {
    query.set("conference", normalized.conference);
  }
  if (normalized.team !== "all") query.set("team", normalized.team);
  if (normalized.firstRoundOnly) query.set("first_round", "1");
  if (normalized.proBowlOnly) query.set("pro_bowl", "1");
  if (normalized.metric !== DEFAULT_FILTERS.metric) {
    query.set("metric", normalized.metric);
  }
  return query;
}

function yearMatches(year: number, scope: string) {
  if (scope === "all") return true;
  if (scope === "2000-2014") return year >= 2000 && year <= 2014;
  if (scope === "2015-2026") return year >= 2015 && year <= 2026;
  return year === Number(scope);
}

export function yearScopeIncludesUnauditedConference(scope: string) {
  return yearMatches(UNAUDITED_CONFERENCE_YEAR, scope);
}

export function conferenceFilterUnavailable(scope: string) {
  return scope === String(UNAUDITED_CONFERENCE_YEAR);
}

export function normalizeConferenceBoundary(filters: FilterState): FilterState {
  if (!conferenceFilterUnavailable(filters.year) || filters.conference === "all") {
    return filters;
  }
  return { ...filters, conference: "all" };
}

export function filterPlayers(players: PlayerRow[], filters: FilterState) {
  const normalized = normalizeConferenceBoundary(filters);
  return players.filter((player) => {
    if (!yearMatches(player.year, normalized.year)) return false;
    if (
      normalized.position !== "all" &&
      normalString(player.position) !== normalized.position
    ) {
      return false;
    }
    if (normalized.round !== "all" && player.round !== Number(normalized.round)) {
      return false;
    }
    if (
      normalized.conference !== "all" &&
      normalString(player.conference) !== normalized.conference
    ) {
      return false;
    }
    if (normalized.team !== "all" && normalString(player.team) !== normalized.team) {
      return false;
    }
    if (normalized.firstRoundOnly && player.round !== 1) return false;
    if (
      normalized.proBowlOnly &&
      (player.year > PRO_BOWL_MATURE_YEAR_MAX || player.proBowls < 1)
    ) {
      return false;
    }
    return true;
  });
}

export function eligiblePlayersForMetric(players: PlayerRow[], metric: Metric) {
  return metric === "pro_bowl"
    ? players.filter((player) => player.year <= PRO_BOWL_MATURE_YEAR_MAX)
    : players;
}

export function playersForGeography(
  players: PlayerRow[],
  geography: GeographyView,
) {
  return players.filter((player) => {
    if (!player.countyFips) return false;
    return geography === "all_mapped"
      ? true
      : player.geographyBasis === "high_school";
  });
}

export function buildCountyStats(
  counties: CountyMeta[],
  players: PlayerRow[],
) {
  const aggregate = new Map<
    string,
    {
      total: number;
      firstRound: number;
      proBowl: number;
      positions: Map<string, number>;
    }
  >();

  for (const player of players) {
    if (!player.countyFips) continue;
    const current = aggregate.get(player.countyFips) ?? {
      total: 0,
      firstRound: 0,
      proBowl: 0,
      positions: new Map<string, number>(),
    };
    current.total += 1;
    current.firstRound += player.round === 1 ? 1 : 0;
    current.proBowl += player.proBowls > 0 ? 1 : 0;
    const position = normalString(player.position);
    current.positions.set(position, (current.positions.get(position) ?? 0) + 1);
    aggregate.set(player.countyFips, current);
  }

  return counties.map((county): CountyStats => {
    const current = aggregate.get(county.fips);
    const positions = current?.positions ?? new Map<string, number>();
    const mostCommonPosition =
      [...positions.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0] ?? "—";
    const total = current?.total ?? 0;
    return {
      ...county,
      total,
      perCapita:
        county.population > 0 ? (total / county.population) * 100_000 : 0,
      rateEligible: total >= RATE_MIN_COUNT,
      firstRound: current?.firstRound ?? 0,
      proBowl: current?.proBowl ?? 0,
      mostCommonPosition,
    };
  });
}

export function optionValues(
  players: PlayerRow[],
  field: "position" | "conference" | "team",
) {
  return [...new Set(players.map((player) => normalString(player[field])))]
    .filter((value) => value !== "Unknown" || field === "conference")
    .sort((a, b) => a.localeCompare(b));
}

export function geographyLabel(geography: GeographyView) {
  return geography === "high_school"
    ? "Verified high-school county"
    : "All mapped counties (includes birth fallback)";
}

export type CoverageAuditRow = {
  era: string;
  total: number;
  mapped: number;
  highSchool: number;
  birthFallback: number;
  outsideMap: number;
  unresolved: number;
  mappedPct: number;
  highSchoolPct: number;
  unresolvedPct: number;
};

export function summarizeCoverageByEra(players: PlayerRow[]) {
  const definitions = [
    { era: "2000–2014", start: 2000, end: 2014 },
    { era: "2015–2023", start: 2015, end: 2023 },
    { era: "2024–2025", start: 2024, end: 2025 },
    { era: "2026", start: 2026, end: 2026 },
  ];
  return definitions.map(({ era, start, end }): CoverageAuditRow => {
    const rows = players.filter(
      (player) => player.year >= start && player.year <= end,
    );
    const highSchool = rows.filter(
      (player) => player.geographyBasis === "high_school",
    ).length;
    const birthFallback = rows.filter(
      (player) => player.geographyBasis === "birth_fallback",
    ).length;
    const outsideMap = rows.filter(
      (player) => player.geographyBasis === "outside_map",
    ).length;
    const unresolved = rows.filter(
      (player) => player.geographyBasis === "unresolved",
    ).length;
    const mapped = highSchool + birthFallback;
    const pct = (value: number) =>
      rows.length ? Math.round((value / rows.length) * 10_000) / 100 : 0;
    return {
      era,
      total: rows.length,
      mapped,
      highSchool,
      birthFallback,
      outsideMap,
      unresolved,
      mappedPct: pct(mapped),
      highSchoolPct: pct(highSchool),
      unresolvedPct: pct(unresolved),
    };
  });
}
