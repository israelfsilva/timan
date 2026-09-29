# Project Guidelines

# Domain rules (non-negotiable)

1. Store **IANA IDs**, never fixed offsets. DST must be automatic.
2. Time zones and DST come from Node's `Intl` (full ICU, the default since Node 13); no offset table of our own.
3. Differences between zones in **minutes** (India +5:30, Nepal +5:45).
4. "Day" = difference in **civil dates** between the zone and T0 (−1, 0, +1), not derived from hours.

## Colors

Green-LCD theme, in `PALETTE` in `src/theme.ts`: highlight background #173220 · lit segment #C9F2B0 · unlit segment #1F2A20 · land #4F6B52 · land inside the band #B7EC9A · secondary text #6F8571 · borders #3A4A3C. Keep colors in a single place so an amber theme is easy later.

## Language

Everything in English: CLI, TUI, errors, README, code comments and test names.
