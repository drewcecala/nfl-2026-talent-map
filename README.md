<p align="center">
  <img src="docs/readme-hero.png" alt="American football talent pathways visualized across a county map" width="100%">
</p>

# The Geography of NFL Talent

A county-level recruiting and NFL Draft geography project covering all 6,901 selections from 2000–2026. The interactive product defaults to verified high-school counties for 2015–2026 because that is the comparable development-location era. The complete historical audit remains available as a clearly labeled mixed-evidence view.

[Explore the live interactive map](https://nfl-talent-geography.pages.dev/nfl-talent-map).

## What the product does

- Maps verified high-school counties, with optional independently corroborated birth-county fallbacks.
- Shows coverage after every filter; unresolved records are never treated as zero.
- Supports totals, first-round picks, mature-career Pro Bowl outcomes, and per-capita rates.
- Withholds per-capita rankings until a county has at least five mapped selections.
- Includes a visible missing-data audit and exact 1080×1350 and 1920×1080 poster routes.

## Routes

- `/nfl-talent-map` — interactive desktop/mobile map.
- `/nfl-talent-map/reddit` — 1080×1350 poster.
- `/nfl-talent-map/wide` — 1920×1080 poster.

## Quality checks

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check` validates the public data contract, regenerates the coverage-bias report, builds both deployment targets, runs model/server tests, and tests the rendered product in desktop and mobile Chromium.

`npm run deploy:pages` runs that full suite before publishing the static Pages
build. A separate production smoke workflow then compares the live dataset
byte-for-byte with the release commit.

## Conference-data boundary

Conference labels are audited through the 2025 draft. All 257 selections from
2026 remain `Unknown` until a draft-year NCAA membership audit is complete;
prior-year labels are not inferred. The exact-year 2026 conference filter is
therefore disabled, and named-conference filters spanning 2026 exclude that
class.

## Evidence and publication boundary

The public payload contains county geometry, 2020 Census population, anonymous draft/filter attributes, and source citations. It excludes player names, high-school names, copied biography text, and annual player-school source tables. See [METHODOLOGY.md](METHODOLOGY.md), [DATA_QUALITY.md](DATA_QUALITY.md), and [ATTRIBUTION.md](ATTRIBUTION.md).

This is the public source repository for the published interactive map.

## License

Original project code and documentation are MIT-licensed. Third-party data and source material are not relicensed; their separate terms and attributions are documented in [ATTRIBUTION.md](ATTRIBUTION.md).
