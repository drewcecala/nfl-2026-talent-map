# Data quality and missing-data audit

The complete population is retained: 5,212 selections are county-mapped, 144 are known outside the 50 states/DC, and 1,545 remain unresolved. Overall unresolved share is 22.4%, so mapped records are not presented as a complete census of development locations.

| Draft era | Selections | Mapped | Verified high school | Birth fallback | Outside map | Unresolved |
|---|---:|---:|---:|---:|---:|---:|
| 2000–2014 | 3,823 | 2,323 (60.8%) | 0 | 2,323 | 110 | 1,390 (36.4%) |
| 2015–2023 | 2,307 | 2,172 (94.1%) | 1,983 | 189 | 24 | 111 (4.8%) |
| 2024–2025 | 514 | 462 (89.9%) | 452 | 10 | 9 | 43 (8.4%) |
| 2026 | 257 | 255 (99.2%) | 255 | 0 | 1 | 1 (0.4%) |

## Material risks and controls

- **Era measurement break — high:** pre-2015 mapped records represent birth county, while most post-2015 mapped records represent high-school county. Control: default to 2015–2026 verified high school and warn on mixed-evidence views.
- **Selection-round gradient — medium:** first-round coverage is 79.3%; seventh-round coverage is 71.6%. Control: recalculate and display coverage after every filter.
- **Position/taxonomy gradient — medium:** coverage varies by listed position and the source taxonomy changes over time. Control: do not interpret raw position differences as causal geography effects.
- **Small-denominator rate instability — high:** one-player counties can dominate naive per-capita rankings. Control: require five mapped selections for rate ranking and visually separate smaller counts.
- **Outcome right-censoring and coverage — high:** recent careers have less time to accumulate honors. Within classes through 2019, county coverage is 75.6% for Pro Bowl players and 68.4% for other selections. Control: restrict Pro Bowl analysis to mature classes, disclose the coverage difference, treat mapped outcome counts as descriptive, and omit Hall of Fame comparisons.

The 2026 class uses an official 257-pick high-school table and conservative exact/reviewed school-location matching: 255 selections are mapped to high-school counties, one international pathway record is outside the map, and one player who did not play high-school football remains unresolved. No 2026 birth fallback or prior-year conference label is inferred.

The machine-readable audit is regenerated at `reports/coverage-audit.json`. `npm run validate:data` fails on changed population counts, duplicate draft keys, invalid evidence partitions, unknown county keys, nonpositive populations, geometry/reference disagreement, or accidental publication of identity fields.

## What the map does not claim

The map does not estimate unresolved locations, establish causal recruiting effects, compare eras on a single geography definition, measure county population at the time each player attended high school, or represent undrafted NFL players.
