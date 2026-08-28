"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { geoAlbersUsa, geoPath } from "d3-geo";
import type {
  Feature,
  FeatureCollection,
  Geometry,
} from "geojson";
import {
  DEFAULT_FILTERS,
  EMPTY_COLOR,
  METRIC_LABELS,
  PRO_BOWL_MATURE_YEAR_MAX,
  RATE_INSUFFICIENT_COLOR,
  RATE_MIN_COUNT,
  UNAUDITED_CONFERENCE_YEAR,
  buildCountyStats,
  colorScale,
  conferenceFilterUnavailable,
  eligiblePlayersForMetric,
  filtersToQuery,
  filterPlayers,
  formatMetric,
  geographyLabel,
  legendBins,
  metricValue,
  normalizeConferenceBoundary,
  number,
  oneDecimal,
  optionValues,
  parseFiltersFromSearch,
  playerCountLabel,
  playersForGeography,
  summarizeCoverageByEra,
  twoDecimals,
  yearScopeIncludesUnauditedConference,
} from "./model";
import type {
  CountyMeta,
  CountyStats,
  FilterState,
  Metric,
  PlayerRow,
} from "./model";

type PosterFormat = "reddit" | "wide";

type SourceItem = {
  label: string;
  url: string;
};

type TalentData = {
  meta: {
    title: string;
    years: [number, number];
    totalPlayers: number;
    mappedPlayers: number;
    unresolvedPlayers: number;
    unresolvedPct: number;
    outsideMapPlayers: number;
    outsideMapPct: number;
    populationYear: number;
    dataAsOf: string;
    publicUrl: string;
    methodology: string;
    conferenceDefinition: string;
    sources: SourceItem[];
  };
  counties: CountyMeta[];
  players: PlayerRow[];
};

type CountyFeatureProperties = {
  GEOID?: string;
  NAME?: string;
  STUSPS?: string;
  STATEFP?: string;
  county_fips?: string;
  county_name?: string;
  state_abbr?: string;
  state_fips?: string;
};

type CountyFeature = Feature<Geometry, CountyFeatureProperties>;

function countyFeatureFips(feature: CountyFeature) {
  return (
    feature.properties.GEOID ??
    feature.properties.county_fips ??
    String(feature.id ?? "")
  );
}

type LoadedGeometry = {
  countyFeatures: CountyFeature[];
  countyCollection: FeatureCollection<Geometry, CountyFeatureProperties>;
  stateFeatures: Feature<Geometry>[];
};

type TalentBundle = {
  data: TalentData;
  geometry: LoadedGeometry;
};

function useTalentBundle() {
  const [bundle, setBundle] = useState<TalentBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/data/nfl-talent-map.json").then((response) => {
        if (!response.ok) throw new Error("The player geography file is unavailable.");
        return response.json() as Promise<TalentData>;
      }),
      fetch("/data/us-counties-2020-simplified.geojson").then((response) => {
        if (!response.ok) throw new Error("The county geometry file is unavailable.");
        return response.json() as Promise<
          FeatureCollection<Geometry, CountyFeatureProperties>
        >;
      }),
      fetch("/data/us-states-2020-simplified.geojson").then((response) => {
        if (!response.ok) throw new Error("The state geometry file is unavailable.");
        return response.json() as Promise<FeatureCollection<Geometry>>;
      }),
    ])
      .then(([data, countyCollection, stateCollection]) => {
        if (!cancelled) {
          setBundle({
            data,
            geometry: {
              countyFeatures: countyCollection.features as CountyFeature[],
              countyCollection,
              stateFeatures: stateCollection.features,
            },
          });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "The source-backed map could not be loaded.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { bundle, error };
}

type CountyMapProps = {
  geometry: LoadedGeometry;
  countyStats: CountyStats[];
  metric: Metric;
  descriptionId?: string;
  activeFips?: string | null;
  labelFips?: string[];
  staticMode?: boolean;
  onCountyEnter?: (county: CountyStats) => void;
  onCountyLeave?: () => void;
  onCountySelect?: (county: CountyStats) => void;
};

function CountyMap({
  geometry,
  countyStats,
  metric,
  descriptionId,
  activeFips = null,
  labelFips = [],
  staticMode = false,
  onCountyEnter,
  onCountyLeave,
  onCountySelect,
}: CountyMapProps) {
  const projection = useMemo(
    () =>
      geoAlbersUsa().fitExtent(
        [
          [14, 12],
          [966, 598],
        ],
        geometry.countyCollection,
      ),
    [geometry.countyCollection],
  );
  const path = useMemo(() => geoPath(projection), [projection]);
  const statsByFips = useMemo(
    () => new Map(countyStats.map((county) => [county.fips, county])),
    [countyStats],
  );
  const scale = useMemo(
    () => colorScale(countyStats, metric),
    [countyStats, metric],
  );
  const labels = useMemo(() => {
    const raw = labelFips
      .map((fips, rank) => {
        const countyFeature = geometry.countyFeatures.find(
          (item) => countyFeatureFips(item) === fips,
        );
        const county = statsByFips.get(fips);
        if (!countyFeature || !county) return null;
        const [x, y] = path.centroid(countyFeature);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { county, x, y, rank, side: x < 490 ? "left" : "right" };
      })
      .filter(
        (
          item,
        ): item is {
          county: CountyStats;
          x: number;
          y: number;
          rank: number;
          side: string;
        } => item !== null,
      );

    const output: Array<
      (typeof raw)[number] & { labelX: number; labelY: number }
    > = [];
    for (const side of ["left", "right"]) {
      const items = raw
        .filter((item) => item.side === side)
        .sort((a, b) => a.y - b.y);
      let priorY = 28;
      for (const item of items) {
        const labelY = Math.min(575, Math.max(item.y, priorY));
        priorY = labelY + 31;
        output.push({
          ...item,
          labelX: side === "left" ? Math.max(8, item.x - 134) : Math.min(842, item.x + 12),
          labelY,
        });
      }
    }
    return output;
  }, [geometry.countyFeatures, labelFips, path, statsByFips]);

  return (
    <svg
      className="county-map"
      viewBox="0 0 980 610"
      role="img"
      aria-label={`U.S. county map shaded by ${METRIC_LABELS[metric].toLowerCase()}`}
      aria-describedby={descriptionId}
    >
      <rect className="map-ocean" width="980" height="610" rx="18" />
      <g className="county-layer">
        {geometry.countyFeatures.map((countyFeature) => {
          const fips = countyFeatureFips(countyFeature);
          const county = statsByFips.get(fips);
          const value = county ? metricValue(county, metric) : 0;
          const fill =
            metric === "per_capita" && county?.total && !county.rateEligible
              ? RATE_INSUFFICIENT_COLOR
              : scale.color(value);
          const d = path(countyFeature);
          if (!d) return null;
          const interactive = !staticMode && Boolean(county?.total);
          return (
            <path
              key={fips}
              d={d}
              fill={fill}
              className={activeFips === fips ? "county active" : "county"}
              aria-hidden="true"
              onMouseEnter={
                interactive && county ? () => onCountyEnter?.(county) : undefined
              }
              onMouseLeave={interactive ? onCountyLeave : undefined}
              onClick={
                interactive && county ? () => onCountySelect?.(county) : undefined
              }
            />
          );
        })}
      </g>
      <g className="state-boundary-layer" aria-hidden="true">
        {geometry.stateFeatures.map((stateFeature, index) => (
          <path
            className="state-boundary"
            d={path(stateFeature) ?? undefined}
            key={String(stateFeature.id ?? index)}
          />
        ))}
      </g>
      {labels.map((item) => (
        <g className="poster-county-label" key={item.county.fips}>
          <path
            d={`M${item.x},${item.y} L${
              item.side === "left" ? item.labelX + 124 : item.labelX
            },${item.labelY - 4}`}
          />
          <rect
            x={item.labelX}
            y={item.labelY - 19}
            width="124"
            height="30"
            rx="5"
          />
          <text x={item.labelX + 7} y={item.labelY - 7}>
            {item.rank + 1}. {item.county.name.replace(" County", "")}
          </text>
          <text className="poster-label-value" x={item.labelX + 7} y={item.labelY + 5}>
            {playerCountLabel(item.county.total)}
          </text>
        </g>
      ))}
      <g className="inset-labels" aria-hidden="true">
        <text x="190" y="568">
          ALASKA
        </text>
        <text x="365" y="564">
          HAWAII
        </text>
      </g>
    </svg>
  );
}

function CountyDetail({
  county,
  onClose,
}: {
  county: CountyStats;
  onClose?: () => void;
}) {
  return (
    <section className="county-detail" aria-live="polite">
      <div className="county-detail-heading">
        <div>
          <p className="detail-kicker">County detail</p>
          <h3>
            {county.name}, {county.stateAbbr}
          </h3>
        </div>
        {onClose ? (
          <button
            aria-label="Close county detail"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
      </div>
      <dl className="county-detail-grid">
        <div>
          <dt>Mapped draftees</dt>
          <dd>{number.format(county.total)}</dd>
        </div>
        <div>
          <dt>Players per 100,000</dt>
          <dd>{twoDecimals.format(county.perCapita)}</dd>
        </div>
        <div>
          <dt>First-round picks</dt>
          <dd>{number.format(county.firstRound)}</dd>
        </div>
        <div>
          <dt>Pro Bowl players</dt>
          <dd>{number.format(county.proBowl)}</dd>
        </div>
        <div>
          <dt>Most common position</dt>
          <dd>{county.mostCommonPosition}</dd>
        </div>
      </dl>
      <p className="population-note">
        2020 population: {number.format(county.population)}. Per-capita rankings
        require at least {RATE_MIN_COUNT} mapped draftees
        {county.rateEligible ? "." : "; this county is not rate-ranked."}
      </p>
    </section>
  );
}

function SelectFilter({
  id,
  label,
  value,
  values,
  allLabel = "All",
  includeAll = true,
  valueLabels = {},
  description,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  values: string[];
  allLabel?: string;
  includeAll?: boolean;
  valueLabels?: Record<string, string>;
  description?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label className="filter-field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        aria-describedby={descriptionId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {includeAll ? <option value="all">{allLabel}</option> : null}
        {values.map((item) => (
          <option key={item} value={item}>
            {valueLabels[item] ?? item}
          </option>
        ))}
      </select>
      {description ? (
        <small className="filter-help" id={descriptionId}>
          {description}
        </small>
      ) : null}
    </label>
  );
}

function CountyInspector({
  counties,
  selectedFips,
  onChange,
}: {
  counties: CountyStats[];
  selectedFips: string;
  onChange: (fips: string) => void;
}) {
  const options = [...counties]
    .filter((county) => county.total > 0)
    .sort(
      (a, b) =>
        a.state.localeCompare(b.state) || a.name.localeCompare(b.name),
    );
  return (
    <label className="county-inspector" htmlFor="county-inspector">
      <span>Inspect a mapped county</span>
      <select
        id="county-inspector"
        value={selectedFips}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Choose a county</option>
        {options.map((county) => (
          <option key={county.fips} value={county.fips}>
            {county.name}, {county.stateAbbr} — {playerCountLabel(county.total)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckboxFilter({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-filter">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span aria-hidden="true" className="checkbox-mark" />
      <span>{label}</span>
    </label>
  );
}

function LoadingState({ error }: { error?: string | null }) {
  return (
    <main className="loading-shell" aria-busy={!error}>
      <div className="loading-card" role={error ? "alert" : "status"}>
        <span className="brand-chip">DRAFT EQUITY</span>
        <h1>The Geography of NFL Talent</h1>
        <p>
          {error ??
            "Loading the audited player locations, county boundaries, and Census population data…"}
        </p>
      </div>
    </main>
  );
}

export function NFLTalentMap() {
  const { bundle, error } = useTalentBundle();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hoveredCounty, setHoveredCounty] = useState<CountyStats | null>(null);
  const [pinnedCounty, setPinnedCounty] = useState<CountyStats | null>(null);
  const [shareState, setShareState] = useState("Copy share link");
  const didReadUrl = useRef(false);

  useEffect(() => {
    if (!bundle || didReadUrl.current) return;
    didReadUrl.current = true;
    const readUrl = () => {
      setFilters(
        parseFiltersFromSearch(window.location.search, bundle.data.players),
      );
      setPinnedCounty(null);
    };
    readUrl();
    window.addEventListener("popstate", readUrl);
    return () => window.removeEventListener("popstate", readUrl);
  }, [bundle]);

  useEffect(() => {
    if (!didReadUrl.current || typeof window === "undefined") return;
    const query = filtersToQuery(filters).toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }, [filters]);

  const update = useCallback(
    <Key extends keyof FilterState>(key: Key, value: FilterState[Key]) => {
      setFilters((current) =>
        normalizeConferenceBoundary({ ...current, [key]: value }),
      );
      setPinnedCounty(null);
    },
    [],
  );

  const filteredPlayers = useMemo(
    () => (bundle ? filterPlayers(bundle.data.players, filters) : []),
    [bundle, filters],
  );
  const metricEligiblePlayers = useMemo(
    () => eligiblePlayersForMetric(filteredPlayers, filters.metric),
    [filteredPlayers, filters.metric],
  );
  const mappedPlayersForView = useMemo(
    () => playersForGeography(metricEligiblePlayers, filters.geography),
    [filters.geography, metricEligiblePlayers],
  );
  const countyStats = useMemo(
    () =>
      bundle ? buildCountyStats(bundle.data.counties, mappedPlayersForView) : [],
    [bundle, mappedPlayersForView],
  );
  const scale = useMemo(
    () => colorScale(countyStats, filters.metric),
    [countyStats, filters.metric],
  );
  const bins = useMemo(
    () => legendBins(scale.thresholds, filters.metric),
    [filters.metric, scale.thresholds],
  );
  const rankings = useMemo(
    () =>
      [...countyStats]
        .filter((county) => metricValue(county, filters.metric) > 0)
        .sort(
          (a, b) =>
            metricValue(b, filters.metric) - metricValue(a, filters.metric) ||
            b.total - a.total ||
            a.name.localeCompare(b.name),
        )
        .slice(0, 10),
    [countyStats, filters.metric],
  );
  const coverageAudit = useMemo(
    () => (bundle ? summarizeCoverageByEra(bundle.data.players) : []),
    [bundle],
  );
  const outcomeCoverageAudit = useMemo(() => {
    if (!bundle) return { proBowl: 0, other: 0 };
    const mature = bundle.data.players.filter(
      (player) => player.year <= PRO_BOWL_MATURE_YEAR_MAX,
    );
    const coverageFor = (players: PlayerRow[]) => {
      if (!players.length) return 0;
      return (
        (players.filter((player) => player.countyFips).length / players.length) *
        100
      );
    };
    return {
      proBowl: coverageFor(mature.filter((player) => player.proBowls > 0)),
      other: coverageFor(mature.filter((player) => player.proBowls === 0)),
    };
  }, [bundle]);

  if (!bundle) return <LoadingState error={error} />;

  const { data, geometry } = bundle;
  const activeCounty = pinnedCounty ?? hoveredCounty;
  const mappedFiltered = mappedPlayersForView.length;
  const coverage =
    metricEligiblePlayers.length > 0
      ? (mappedFiltered / metricEligiblePlayers.length) * 100
      : 0;
  const highSchoolAvailable = metricEligiblePlayers.filter(
    (player) => player.geographyBasis === "high_school",
  ).length;
  const birthFallbackAvailable = metricEligiblePlayers.filter(
    (player) => player.geographyBasis === "birth_fallback",
  ).length;
  const unavailableLocations = metricEligiblePlayers.length -
    highSchoolAvailable -
    birthFallbackAvailable;
  const years = [...new Set(data.players.map((player) => player.year))]
    .sort((a, b) => a - b)
    .map(String);
  const rounds = [...new Set(data.players.map((player) => player.round))]
    .sort((a, b) => a - b)
    .map(String);
  const conferenceUnavailable = conferenceFilterUnavailable(filters.year);
  const scopeIncludesUnauditedConference =
    yearScopeIncludesUnauditedConference(filters.year);
  const conferenceHelp = conferenceUnavailable
    ? `Conference filtering is unavailable for ${UNAUDITED_CONFERENCE_YEAR}. Every ${UNAUDITED_CONFERENCE_YEAR} conference value remains unaudited and is kept as Unknown.`
    : scopeIncludesUnauditedConference && filters.conference === "Unknown"
      ? `Unknown / unaudited includes the entire ${UNAUDITED_CONFERENCE_YEAR} class; named conference membership for that class has not been assigned.`
      : scopeIncludesUnauditedConference && filters.conference !== "all"
        ? `Named-conference results exclude the entire ${UNAUDITED_CONFERENCE_YEAR} class because its draft-year membership audit is pending.`
        : scopeIncludesUnauditedConference
          ? `Conference labels are audited through ${UNAUDITED_CONFERENCE_YEAR - 1}. The ${UNAUDITED_CONFERENCE_YEAR} class remains in All as unaudited Unknown.`
          : "Conference labels are audited for this draft period.";
  const outcomeWindowLimited =
    filters.metric === "pro_bowl" || filters.proBowlOnly;
  const pre2015HighSchoolGap =
    filters.geography === "high_school" &&
    (filters.year === "all" ||
      filters.year === "2000-2014" ||
      (/^\d{4}$/.test(filters.year) && Number(filters.year) <= 2014));
  const selectedCountyFips = pinnedCounty?.fips ?? "";
  const mapDescription = `${geographyLabel(filters.geography)} view for ${
    filters.year === "all" ? "2000 through 2026" : filters.year
  }. ${number.format(mappedFiltered)} of ${number.format(
    metricEligiblePlayers.length,
  )} eligible draft selections are mapped. County values are also available in the county selector and ranking.`;

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareState("Link copied");
      window.setTimeout(() => setShareState("Copy share link"), 1600);
    } catch {
      setShareState("Use the URL in your browser");
    }
  };

  return (
    <main className="site-shell" data-map-ready="true">
      <header className="site-header">
        <div className="header-copy">
          <div className="eyebrow-line">
            <span>2000–2026 NFL DRAFTS</span>
            <span className="brand-chip">DRAFT EQUITY</span>
          </div>
          <h1>The Geography of NFL Talent</h1>
          <p>
            The default view compares verified high-school counties for the
            2015–2026 evidence-consistent era. The full 2000–2026 audit remains
            available with its birthplace-fallback limitation clearly marked.
          </p>
        </div>
        <div className="header-actions">
          <button className="share-button" type="button" onClick={handleShare}>
            {shareState}
          </button>
          <p>Selections stay in the URL when you share.</p>
        </div>
      </header>

      <section className="coverage-strip" aria-label="Current selection coverage">
        <div>
          <span>Eligible draft picks</span>
          <strong>{number.format(metricEligiblePlayers.length)}</strong>
        </div>
        <div>
          <span>Mapped in this view</span>
          <strong>{number.format(mappedFiltered)}</strong>
        </div>
        <div>
          <span>Evidence coverage</span>
          <strong>{oneDecimal.format(coverage)}%</strong>
        </div>
        <div>
          <span>Not shown in this view</span>
          <strong>
            {number.format(metricEligiblePlayers.length - mappedFiltered)}
          </strong>
        </div>
      </section>

      <div className="workspace-grid">
        <section className="map-panel">
          <div className="map-panel-head">
            <div>
              <p className="panel-kicker">County view</p>
              <h2>{METRIC_LABELS[filters.metric]}</h2>
            </div>
            <p className="interaction-note">
              Point to or tap a county · keyboard users can use the selector
            </p>
          </div>
          <div className="view-status" role="note">
            <strong>{geographyLabel(filters.geography)}</strong>
            <span>
              {filters.year === "all" ? "2000–2026" : filters.year} draft
              selection
            </span>
          </div>
          {filters.geography === "all_mapped" ? (
            <p className="analysis-warning" role="note">
              Mixed evidence: 2000–2014 mapped rows use birth county, while most
              2015–2026 rows use high-school county. Do not interpret cross-era
              differences as changes in where players developed.
            </p>
          ) : null}
          {pre2015HighSchoolGap ? (
            <p className="analysis-warning" role="note">
              No pre-2015 selection has a promoted high-school county. Those
              rows are omitted from this evidence view; “All mapped” can show
              corroborated birth county, but it is not an equivalent
              development-location measure.
            </p>
          ) : null}
          {outcomeWindowLimited ? (
            <p className="analysis-warning" role="note">
              Pro Bowl comparisons are restricted to draft classes through{" "}
              {PRO_BOWL_MATURE_YEAR_MAX} so recent classes are not treated as
              completed careers. In that mature-class audit, county coverage is{" "}
              {oneDecimal.format(outcomeCoverageAudit.proBowl)}% for Pro Bowl
              players versus {oneDecimal.format(outcomeCoverageAudit.other)}%
              for other selections, so mapped outcome counts are descriptive.
            </p>
          ) : null}
          {filters.metric === "per_capita" ? (
            <p className="analysis-warning rate-note" role="note">
              Per-capita rates use the 2020 Census and require at least{" "}
              {RATE_MIN_COUNT} mapped draftees in the current selection. Smaller
              counts are shown separately rather than ranked.
            </p>
          ) : null}
          <div className="metric-tabs" role="group" aria-label="Map metric">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((metric) => (
              <button
                key={metric}
                type="button"
                aria-pressed={filters.metric === metric}
                onClick={() => update("metric", metric)}
              >
                {METRIC_LABELS[metric]}
              </button>
            ))}
          </div>
          <CountyInspector
            counties={countyStats}
            selectedFips={selectedCountyFips}
            onChange={(fips) => {
              setPinnedCounty(
                countyStats.find((county) => county.fips === fips) ?? null,
              );
              setHoveredCounty(null);
            }}
          />
          <p className="visually-hidden" id="map-description">
            {mapDescription}
          </p>
          <div className="map-stage">
            <CountyMap
              geometry={geometry}
              countyStats={countyStats}
              metric={filters.metric}
              descriptionId="map-description"
              activeFips={activeCounty?.fips}
              onCountyEnter={setHoveredCounty}
              onCountyLeave={() => setHoveredCounty(null)}
              onCountySelect={(county) =>
                setPinnedCounty((current) =>
                  current?.fips === county.fips ? null : county,
                )
              }
            />
            {activeCounty ? (
              <CountyDetail
                county={activeCounty}
                onClose={pinnedCounty ? () => setPinnedCounty(null) : undefined}
              />
            ) : (
              <div className="map-placeholder-detail">
                <strong>Select a county</strong>
                <span>
                  See player totals, rate, first-round picks, Pro Bowl players,
                  and the most common position. Every mapped county is available
                  through the selector above.
                </span>
              </div>
            )}
          </div>
          <div className="legend" aria-label={`${METRIC_LABELS[filters.metric]} legend`}>
            <span className="legend-title">{METRIC_LABELS[filters.metric]}</span>
            <span className="legend-item">
              <i style={{ background: EMPTY_COLOR }} />
              0
            </span>
            {filters.metric === "per_capita" ? (
              <span className="legend-item">
                <i style={{ background: RATE_INSUFFICIENT_COLOR }} />1–
                {RATE_MIN_COUNT - 1} mapped (rate withheld)
              </span>
            ) : null}
            {bins.map((bin) => (
              <span className="legend-item" key={`${bin.color}-${bin.label}`}>
                <i style={{ background: bin.color }} />
                {bin.label}
              </span>
            ))}
          </div>
        </section>

        <aside className="filter-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Refine the evidence</p>
              <h2>Filters</h2>
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setFilters(DEFAULT_FILTERS);
                setPinnedCounty(null);
                setHoveredCounty(null);
              }}
            >
              Reset
            </button>
          </div>
          <div className="filter-grid">
            <SelectFilter
              id="filter-year"
              label="Draft period"
              value={filters.year}
              values={["2015-2026", "2000-2014", ...years]}
              allLabel="All 2000–2026 (mixed evidence)"
              valueLabels={{
                "2015-2026": "2015–2026 comparable high-school era",
                "2000-2014": "2000–2014 birth-fallback era",
              }}
              onChange={(value) => update("year", value)}
            />
            <SelectFilter
              id="filter-geography"
              label="Geography evidence"
              value={filters.geography}
              values={["high_school", "all_mapped"]}
              includeAll={false}
              valueLabels={{
                high_school: "Verified high-school county",
                all_mapped: "All mapped, including birth fallback",
              }}
              onChange={(value) =>
                update("geography", value as FilterState["geography"])
              }
            />
            <SelectFilter
              id="filter-position"
              label="Position"
              value={filters.position}
              values={optionValues(data.players, "position")}
              onChange={(value) => update("position", value)}
            />
            <SelectFilter
              id="filter-round"
              label="Draft round"
              value={filters.round}
              values={rounds}
              onChange={(value) => update("round", value)}
            />
            <SelectFilter
              id="filter-conference"
              label="NCAA conference"
              value={filters.conference}
              values={
                conferenceUnavailable
                  ? []
                  : optionValues(data.players, "conference")
              }
              allLabel={
                conferenceUnavailable
                  ? `${UNAUDITED_CONFERENCE_YEAR} audit pending`
                  : "All"
              }
              valueLabels={{ Unknown: "Unknown / unaudited" }}
              description={conferenceHelp}
              disabled={conferenceUnavailable}
              onChange={(value) => update("conference", value)}
            />
            <SelectFilter
              id="filter-team"
              label="NFL drafting team"
              value={filters.team}
              values={optionValues(data.players, "team")}
              onChange={(value) => update("team", value)}
            />
          </div>
          <div className="checkbox-stack">
            <CheckboxFilter
              label="First-round picks only"
              checked={filters.firstRoundOnly}
              onChange={(checked) => update("firstRoundOnly", checked)}
            />
            <CheckboxFilter
              label={`Pro Bowl players only (through ${PRO_BOWL_MATURE_YEAR_MAX} classes)`}
              checked={filters.proBowlOnly}
              onChange={(checked) => update("proBowlOnly", checked)}
            />
          </div>
          <div className="filter-note">
            <strong>Evidence policy</strong>
            <p>
              Verified high-school county is the comparable development-location
              measure. Birth county is an independently corroborated fallback,
              not an equivalent substitute.
            </p>
            <p>
              Current selection: {number.format(highSchoolAvailable)} selections
              with verified high-school counties, {number.format(birthFallbackAvailable)}
              {" "}birth fallbacks, and {number.format(unavailableLocations)} unresolved
              or outside the map.
            </p>
            <p>{data.meta.conferenceDefinition}</p>
          </div>
        </aside>

        <aside className="ranking-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Current selection</p>
              <h2>Top counties</h2>
            </div>
          </div>
          <ol className="ranking-list">
            {rankings.length ? (
              rankings.map((county) => (
                <li key={county.fips}>
                  <button
                    type="button"
                    aria-label={`Inspect ${county.name}, ${county.stateAbbr}: ${formatMetric(
                      metricValue(county, filters.metric),
                      filters.metric,
                    )} ${METRIC_LABELS[filters.metric].toLowerCase()}`}
                    onMouseEnter={() => setHoveredCounty(county)}
                    onMouseLeave={() => setHoveredCounty(null)}
                    onFocus={() => setHoveredCounty(county)}
                    onBlur={() => setHoveredCounty(null)}
                    onClick={() => setPinnedCounty(county)}
                  >
                    <span className="rank-number">
                      {rankings.indexOf(county) + 1}
                    </span>
                    <span className="rank-name">
                      <strong>{county.name}</strong>
                      <small>{county.stateAbbr}</small>
                    </span>
                    <span className="rank-value">
                      {formatMetric(metricValue(county, filters.metric), filters.metric)}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="empty-ranking">
                No mapped players match this filter combination.
              </li>
            )}
          </ol>
          <div className="rank-context">
            <strong>
              {filters.metric === "per_capita"
                ? "Rate reliability rule"
                : "Ranking scope"}
            </strong>
            <p>
              {filters.metric === "per_capita"
                ? `Counties need at least ${RATE_MIN_COUNT} mapped draftees in the current selection to enter the per-capita ranking. County detail still shows the exact count and 2020 population.`
                : `Rankings use only the current draft-period, geography-evidence, and player filters. They do not estimate unobserved locations.`}
            </p>
          </div>
        </aside>
      </div>

      <section className="coverage-audit" aria-labelledby="coverage-audit-title">
        <div className="coverage-audit-heading">
          <div>
            <p className="panel-kicker">Missing-data audit</p>
            <h2 id="coverage-audit-title">Coverage changes sharply by evidence era.</h2>
          </div>
          <p>
            The default view starts in 2015 because pre-2015 mapped records use
            birth county rather than verified high-school county. Missingness is
            never converted to zero.
          </p>
        </div>
        <p className="table-scroll-note">
          Swipe horizontally to see all evidence columns.
        </p>
        <div
          className="audit-table-wrap"
          role="region"
          aria-label="Missing-data audit table"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Draft era</th>
                <th scope="col">Draft picks</th>
                <th scope="col">Mapped</th>
                <th scope="col">Verified high school</th>
                <th scope="col">Birth fallback</th>
                <th scope="col">Outside map</th>
                <th scope="col">Unresolved</th>
              </tr>
            </thead>
            <tbody>
              {coverageAudit.map((row) => (
                <tr key={row.era}>
                  <th scope="row">{row.era}</th>
                  <td>{number.format(row.total)}</td>
                  <td>
                    {number.format(row.mapped)} · {oneDecimal.format(row.mappedPct)}%
                  </td>
                  <td>
                    {number.format(row.highSchool)} ·{" "}
                    {oneDecimal.format(row.highSchoolPct)}%
                  </td>
                  <td>{number.format(row.birthFallback)}</td>
                  <td>{number.format(row.outsideMap)}</td>
                  <td>
                    {number.format(row.unresolved)} ·{" "}
                    {oneDecimal.format(row.unresolvedPct)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="methodology-band">
        <div>
          <p className="panel-kicker">Methodology</p>
          <h2>Location evidence is graded, not guessed.</h2>
        </div>
        <p>{data.meta.methodology}</p>
        <dl>
          <div>
            <dt>All drafted players</dt>
            <dd>{number.format(data.meta.totalPlayers)}</dd>
          </div>
          <div>
            <dt>Mapped</dt>
            <dd>{number.format(data.meta.mappedPlayers)}</dd>
          </div>
          <div>
            <dt>Unresolved locations</dt>
            <dd>
              {number.format(data.meta.unresolvedPlayers)} ·{" "}
              {oneDecimal.format(data.meta.unresolvedPct)}%
            </dd>
          </div>
          <div>
            <dt>Known outside 50 states/DC</dt>
            <dd>
              {number.format(data.meta.outsideMapPlayers)} ·{" "}
              {oneDecimal.format(data.meta.outsideMapPct)}%
            </dd>
          </div>
        </dl>
      </section>

      <footer className="site-footer">
        <div>
          <strong>Sources</strong>
          <p>
            {data.meta.sources.map((source, index) => (
              <Fragment key={source.url}>
                {index ? " · " : ""}
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.label}
                </a>
              </Fragment>
            ))}
          </p>
        </div>
        <div className="footer-note">
          <span>Data through {data.meta.dataAsOf}</span>
          <span className="quiet-brand">DRAFT EQUITY</span>
        </div>
      </footer>
    </main>
  );
}

function PosterRanking({
  title,
  counties,
  metric,
}: {
  title: string;
  counties: CountyStats[];
  metric: Metric;
}) {
  return (
    <section className="poster-ranking">
      <h2>{title}</h2>
      <ol>
        {counties.map((county, index) => (
          <li key={county.fips}>
            <span className="poster-rank">{index + 1}</span>
            <span className="poster-rank-name">
              <strong>{county.name.replace(" County", "")}</strong>
              <small>{county.stateAbbr}</small>
            </span>
            <span className="poster-rank-value">
              {formatMetric(metricValue(county, metric), metric)}
              {metric === "per_capita" ? (
                <small>
                  {playerCountLabel(county.total)} · pop.{" "}
                  {number.format(county.population)}
                </small>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PosterLegend({
  countyStats,
  metric,
}: {
  countyStats: CountyStats[];
  metric: Metric;
}) {
  const scale = colorScale(countyStats, metric);
  const bins = legendBins(scale.thresholds, metric);
  return (
    <div className="poster-legend">
      <span className="poster-legend-title">{METRIC_LABELS[metric]}</span>
      <span>
        <i style={{ background: EMPTY_COLOR }} />0
      </span>
      {metric === "per_capita" ? (
        <span>
          <i style={{ background: RATE_INSUFFICIENT_COLOR }} />1–
          {RATE_MIN_COUNT - 1} mapped
        </span>
      ) : null}
      {bins.map((bin) => (
        <span key={`${bin.color}-${bin.label}`}>
          <i style={{ background: bin.color }} />
          {bin.label}
        </span>
      ))}
    </div>
  );
}

export function StaticTalentPoster({ format }: { format: PosterFormat }) {
  const { bundle, error } = useTalentBundle();

  if (!bundle) return <LoadingState error={error} />;

  const { data, geometry } = bundle;
  const posterSelection = filterPlayers(data.players, DEFAULT_FILTERS);
  const mappedPlayers = playersForGeography(
    posterSelection,
    DEFAULT_FILTERS.geography,
  );
  const countyStats = buildCountyStats(data.counties, mappedPlayers);
  const topTotal = [...countyStats]
    .filter((county) => county.total > 0)
    .sort(
      (a, b) =>
        b.total - a.total ||
        b.perCapita - a.perCapita ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 10);
  const topPerCapita = [...countyStats]
    .filter((county) => county.rateEligible)
    .sort(
      (a, b) =>
        b.perCapita - a.perCapita ||
        b.total - a.total ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 10);
  const topTenPlayers = topTotal.reduce((sum, county) => sum + county.total, 0);
  const topTenShare =
    mappedPlayers.length > 0 ? (topTenPlayers / mappedPlayers.length) * 100 : 0;
  const birthMapped = posterSelection.filter(
    (player) => player.geographyBasis === "birth_fallback",
  ).length;
  const unavailablePosterLocations = posterSelection.length -
    mappedPlayers.length -
    birthMapped;
  const topCounty = topTotal[0];
  const topRateCounty = topPerCapita[0];

  return (
    <main
      className={`poster poster-${format}`}
      data-poster-ready="true"
      aria-label={`${data.meta.title} static poster`}
    >
      <header className="poster-header">
        <div>
          <div className="poster-eyebrow">
            <span>NFL DRAFT · 2015–2026 VERIFIED HIGH SCHOOLS</span>
            <span className="poster-brand">DRAFT EQUITY</span>
          </div>
          <h1>The Geography of NFL Talent</h1>
          <p>
            Comparable development-location view · unresolved records and birth
            fallbacks remain outside the ranking
          </p>
        </div>
        <div className="poster-total">
          <strong>{number.format(mappedPlayers.length)}</strong>
          <span>verified HS locations</span>
          <small>
            of {number.format(posterSelection.length)} drafted ·{" "}
            {oneDecimal.format(
              (mappedPlayers.length / posterSelection.length) * 100,
            )}
            %
          </small>
        </div>
      </header>

      <div className="poster-body">
        <section className="poster-map-column">
          <div className="poster-map-heading">
            <div>
              <span>Main metric</span>
              <h2>Draftees per 100,000 residents</h2>
            </div>
            <p>
              2020 Census population · minimum {RATE_MIN_COUNT} mapped draftees
              for a rate
            </p>
          </div>
          <CountyMap
            geometry={geometry}
            countyStats={countyStats}
            metric="per_capita"
            labelFips={topTotal.map((county) => county.fips)}
            staticMode
          />
          <PosterLegend countyStats={countyStats} metric="per_capita" />
          <p className="poster-map-note">
            Map labels identify the 10 counties with the most players. Per-capita
            rankings require at least {RATE_MIN_COUNT} mapped draftees and show
            the count and population.
          </p>
          <section className="poster-takeaways">
            <article>
              <span>01</span>
              <p>
                <strong>
                  {topCounty?.name.replace(" County", "")},{" "}
                  {topCounty?.stateAbbr}
                </strong>{" "}
                leads the total count with{" "}
                <strong>{number.format(topCounty?.total ?? 0)} players</strong>.
              </p>
            </article>
            <article>
              <span>02</span>
              <p>
                The 10 leading counties account for{" "}
                <strong>{oneDecimal.format(topTenShare)}%</strong> of all mapped
                draftees.
              </p>
            </article>
            <article>
              <span>03</span>
              <p>
                <strong>
                  {topRateCounty?.name.replace(" County", "")},{" "}
                  {topRateCounty?.stateAbbr}
                </strong>{" "}
                has the highest rate:{" "}
                <strong>
                  {twoDecimals.format(topRateCounty?.perCapita ?? 0)} per 100,000
                </strong>{" "}
                ({playerCountLabel(topRateCounty?.total ?? 0)}).
              </p>
            </article>
          </section>
        </section>

        <aside className="poster-sidebar">
          <PosterRanking
            title="Top 10 · total players"
            counties={topTotal}
            metric="total"
          />
          <PosterRanking
            title="Top 10 · per 100,000"
            counties={topPerCapita}
            metric="per_capita"
          />
        </aside>
      </div>

      <section className="poster-method">
        <div>
          <strong>{number.format(posterSelection.length)}</strong>
          <span>2015–2026 draft picks</span>
        </div>
        <div>
          <strong>{number.format(mappedPlayers.length)}</strong>
          <span>verified high-school county</span>
        </div>
        <div>
          <strong>{number.format(birthMapped)}</strong>
          <span>birth fallbacks excluded from this comparable view</span>
        </div>
        <div>
          <strong>{number.format(unavailablePosterLocations)}</strong>
          <span>unresolved or outside the 50-state/DC map</span>
        </div>
        <p>
          The complete audited dataset covers 2000–2026. Earlier rows are not
          combined here because their mapped locations use birth county rather
          than verified high-school county.
        </p>
      </section>

      <footer className="poster-footer">
        <div>
          <strong>Sources</strong>
          <span>
            nflverse Draft Picks · NFL Play Football / High School Football
            America · Wikidata / DBpedia · NCES EDGE · U.S. Census Bureau
          </span>
        </div>
        <div className="poster-url">
          <span>Explore the interactive map:</span>
          <strong>{data.meta.publicUrl || "[FINAL URL PENDING]"}</strong>
        </div>
      </footer>
    </main>
  );
}
