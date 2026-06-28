# PRIMO_PLOTS — editorial components (reference)

Theme-agnostic. Tokens and principles live in `SKILL.md`. Each component is a reusable named unit.

1. **Action title** — see core (`SKILL.md`).
2. **Subtitle** — optional, default absent; only forward-look / next-action / off-chart context, ≤14 words, 1 line, bold only on the number.
3. **Footnote** — bottom-left 9pt italic GREY_TXT, ≤2 lines (L1 scope, L2 hatch/exception).
4. **Delta encoding** — semantic color + explicit sign: rounded pill (delta is the metric), lateral double-arrow + dotted leader (waterfall / MoM), curved-arrow pill (multiplier, sparing), inline text (secondary).
5. **Reference line** — always an inline label in the level color (10pt italic), dashed `alpha 0.5 lw 1.2`; min-max band variant for ranges. Unlabeled = noise.
6. **Phase banding** — `axvspan` **always with a top badge** naming the phase (+ summary metric in-band ideal); year-banding variant with `band_gap`.
7. **Event vertical line** — dashed, marks a *point* (vs phase = interval), label in a NAVY_DARK bbox.
8. **Highlight box** — dashed colored border (GREEN_OK / ACCENT) around the hero, `facecolor='none'`.
9. **Side callout** — block outside the data with a connector (no connector → don't use); textual (left border) or multimedia (image / mini-table).
10. **Structural grouping** — bracket under the X axis + dotted vertical separator.
11. **Out-of-scope gray hatch** — hatched gray stacked over the solid bar; **footnote mandatory**.
12. **Dotted leader** — `linestyle=(0,(1,2))` to a label in a free zone; extend `ylim` first.
13. **Cohort imaturity shading** — gray `alpha 0.15` + inline label ("partial"); fades instead of highlighting.
14. **Confidence band / n flag** — `fill_between` `alpha 0.15` + `n=XXX`; `n<30` → dotted.
15. **Conditional formatting** — semantic bands with **caller-defined thresholds** (e.g. ROAS: green ≥ target, amber mid, red below break-even); in heatmaps use NAVY intensity for raw magnitude + semantic color for efficiency. **Always paired with a label or shape — never color alone** (see the semantic-encoding rule in `SKILL.md`). Same vocabulary in deck and HTML.
16. **Identifier normalization** — chaotic IDs → clean ordinals (`T1..T8`), original to footnote.

## Extensions (generic patterns, theme-neutral)

- **Bridge with sub-group brackets** — group waterfall deltas by any sub-group dimension, with label + share% atop each bracket.
- **Cohort heatmap "crossed at M+N" sidebar** — a badge right of each row showing the period where the cohort crossed its target threshold.
- **Scatter with named quadrants** — a 2×2 action matrix (e.g. SCALE / BET / CUT / TEST) + micro-caption ("low spend · high return"). Quadrant labels are illustrative.
- **Cohort triangle with highlighted diagonal** — ACCENT borders mark the M+0 diagonal.
- **Matrix with TOP-N banner** — top totalizer banner + connectors down to the ranked columns.

## Retirement rule (exception-based maintenance)

Components accrete; prune them. A pattern seen **multiple times** becomes a component; used **once** it stays in a speculative appendix, not the catalog. Promote on the 2nd sighting; **retire** a component left unused across review cycles. Rule of thumb: a component goes in only if you can name one that could come out.
