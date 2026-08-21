# Methodology

## Unit of analysis

One row represents one official NFL Draft selection, keyed by draft year and overall pick. The population contains 6,901 selections from the 2000 through 2026 drafts.

## Geography evidence hierarchy

1. Accept a high-school county only when a player-school source and an exact school-location source support it.
2. When high-school county cannot be verified, accept birth county only when the exact player identity has an independently corroborated birthplace and the Census place lies wholly in one county.
3. Preserve verified international, territory, and other outside-map locations separately.
4. Leave every other record unresolved.

Fuzzy school matching, nearest-point assignment, county centroids, and arbitrary choices for multi-county places are prohibited.

## Evidence eras

- **2000–2014:** no high-school county is promoted because the independent verification snapshot was incomplete. The 2,323 mapped selections use corroborated birth-county fallback.
- **2015–2023:** 1,983 selections use high-school county and 189 use birth-county fallback.
- **2024–2025:** 452 selections use high-school county and 10 use birth-county fallback.
- **2026:** 255 selections use high-school county, one record is verified outside the 50-state/DC map, and one is unresolved. No birth-county fallback is used for this class.

The product therefore defaults to the 2015–2026 verified-high-school view. The full-period option is an audit view, not a like-for-like trend series.

## Conference boundary

Conference means the NCAA general institutional affiliation for the academic year ending in the draft year, not a football-only conference. Unsupported or multiple affiliations are labeled `Unknown`. The 2026 class remains `Unknown` until its draft-year NCAA membership audit is complete; prior-year labels are not inferred.

## Measures

- **Total draftees:** mapped selections in the current evidence and player filters.
- **First-round picks:** mapped selections with round equal to one.
- **Pro Bowl players:** mapped selections with at least one Pro Bowl, restricted to draft classes through 2019 to reduce right-censoring.
- **Draftees per 100,000:** mapped selections divided by 2020 Decennial Census county population, multiplied by 100,000. Ranking requires at least five mapped selections in the current filter.

Hall of Fame status is intentionally excluded as a comparison metric because recent draft classes have not had comparable eligibility or career time.

## Reproducibility boundary

The repository can deterministically validate the published anonymous payload, geometry keys, evidence partition, measures, and coverage report. Raw biography text and copied player-school tables are not redistributed. Row-level private audit materials remain outside this public application boundary.
