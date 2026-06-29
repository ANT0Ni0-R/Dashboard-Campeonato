---
name: plot-patterns
description: Grupo Primo PRIMO_PLOTS visual system for executive decks, dashboards and charts (matplotlib / HTML-CSS / Plotly). Theme-agnostic visual grammar. Auto-loaded when generating any chart, slide, deck, dashboard or data viz. Follow the core rules here; read the reference files for component/composition/render detail.
user-invocable: false
---

# PRIMO_PLOTS — executive visual system (core)

Theme-agnostic visual grammar, portable across engines (matplotlib for static/TV decks, HTML/CSS for scroll dashboards, Plotly for interactive). **This core is always loaded; the component catalog, composition recipes and engine bindings live in reference files — read them on demand (see foot).** Decide the medium first: **deck** (PPTX, TV 2–4m, 16:9, matplotlib) or **HTML** (browser, scroll, hover).

## Layer 1 — Principles

- **P1. Take the work onto yourself** — pre-digest; the audience won't work for the chart.
- **P2. The chart carries the argument** ("Princípio Paulo") — reading it *without* the title gives ≥60% of the message. Cause/justification goes to the talk track, not the slide.
- **P3. Exception-based** — surface what's off, not the normal.
- **P4. Honest decomposition** — never invent a vector to close a narrative; a drop that decomposes into 2 vectors gets 2 bars. Counterfactuals are marked as estimates and go to an annex.
- **P5. NAVY structures, ACCENT highlights** — fixed roles. Inverting destroys learned reading.
- **P6. Annotation never covers data** — extend `ylim` to open a free zone *before* annotating.

## Layer 2 — Tokens

```python
# Text
TITLE_BLACK = "#1F1F1F"   # action title — NEVER navy
GREY_TXT    = "#5A6478"   # subtitle, axes, secondary labels
GREY_LT     = "#D5D9E0"
# Structure
NAVY        = "#1E2761"   # pills, section titles (not the title)
NAVY_DARK   = "#0F1A3F"; NAVY_LIGHT = "#3D5A99"
MID_BLUE    = "#5B8AC4"   # mid category in stacked
LIGHT_BLUE  = "#A8C5E8"; PALE_BLUE = "#D6E4F4"
# Highlight
ACCENT      = "#C97B5E"   # terracotta: hero / highlight
ACCENT_LT   = "#E8B5A2"; ACCENT_BG = "#FBEDE6"
# Semantic
RED_BAD     = "#B23A3A"; RED_LT   = "#E8C2C2"
GREEN_OK    = "#3D8B5C"; GREEN_LT = "#A8D4B8"; GREEN_BG = "#E8F2EC"
AMBER       = "#C9A24E"
# Phase banding
PHASE_GREEN = "#E8F2EC"; PHASE_BLUE = "#E8EEF7"
PHASE_RED   = "#F7E8E8"; PHASE_DARK_RED = "#E8C2C2"; WEEKEND_BG = "#FBEDE6"
OUTROS_GREY = "#B0B7C3"
```

- Don't invent colors outside this list. Light colors (LIGHT_BLUE, PALE_BLUE, GREY_LT) have <2:1 contrast on TV — use only as complementary fill behind a dark main, banding, or decorative edge, never as the sole data color on TV.
- **Semantic color is never the sole encoding.** GREEN/AMBER/RED always pairs with a second channel — an inline label (`Saudável`/`OK`/`Break-even`), shape, or position. Color alone fails under TV glare and for color-blind viewers (this is why "stoplight as sole encoding" is an anti-pattern).
- **Typography floors (TV, 2–4m)**: action title 19–22pt bold TITLE_BLACK · subtitle 13–14pt italic GREY_TXT · section title 12–13pt bold · X ticks 13–14pt · Y ticks 12–13pt · bar totals 14–15pt bold · in-stack labels 11–12pt bold white (slice ≥8%) · inline annotation 12–14pt bold · legend 12–13pt · reference-line / `n=` / footnote 9–10pt. **Floor 10pt** on TV; if a screenshot looks tiny, +2pt and regenerate. HTML uses rem on the same scale.
- **Numeric scale**: `k` up to 9.999k (`R$ 318k`), `MM` from 1MM (`R$ 1,09 MM`) — never `K`/`M`. Comma decimal. Signed deltas (`+R$ 234k`, `-27%`), `+22,6pp`, multiplier `2,8x`, range en-dash `R$ 40–60k`, dates `mar/26`/`1-13/Abr`. **Partial current month always flagged** (`*` or note).

## Layout — data slides (canonical: no kicker, no footer)

Action title TITLE_BLACK top-left (≤2 lines), optional subtitle italic GREY_TXT (1 line), logo `GRUPO | PRIMO` top-right (a unit/partner suffix like `· VENDAS` is allowed), chart full-width.

```python
import matplotlib.pyplot as plt
plt.rcParams['font.family'] = 'DejaVu Sans'
plt.rcParams['text.parse_math'] = False   # required so R$ doesn't break
fig = plt.figure(figsize=(16, 9), dpi=140); fig.patch.set_facecolor('white')
fig.text(0.04, 0.93,  title_l1, fontsize=20, fontweight='bold', color=TITLE_BLACK)
fig.text(0.04, 0.885, title_l2, fontsize=20, fontweight='bold', color=TITLE_BLACK)
fig.text(0.04, 0.835, subtitle, fontsize=13, color=GREY_TXT, style='italic')  # optional
fig.text(0.96, 0.93,  "GRUPO | PRIMO", fontsize=12, fontweight='bold', color=TITLE_BLACK, ha='right')
ax = fig.add_axes([0.05, 0.13, 0.92, 0.62])   # full-width chart
```

Export PNG 16:9 @140 dpi. **Brand chrome slides** (cover, agenda, section divider, closing) are a *separate* template — dark background, brand orange, structural titles — and are NOT governed by the TITLE_BLACK / full-width rules. The rules here are for **data slides**.

## Action title

Headline-with-number that carries the argument. `{entity} {action verb} {number} {short context}`, number ideally in the first half. One line default; two only for two independent numbers. No hedging ("muito", "relevante"), no subordinate cause clause (that's talk track). Cut test: if the second half can go without loss, cut it.

## Composition index

Read `compositions.md` for the recipe of each:
- **C1** Ritual monthly — stacked + share-line (twin axis)
- **C2** Decomposition waterfall
- **C3** Efficiency × volume combo — *the only admissible dual Y axis*
- **C4** Evolutive stacked
- **C5** A/B cohort small multiples
- **C6** Historical ranking with hero
- **C7** Heatmap by band
- **C8** DE→PARA table
- **Multi-panel** — horizontal split (2 charts) / vertical split (line over bars, shared X)

## Anti-patterns

Title in NAVY (it's TITLE_BLACK) · kicker bar · formal footer (`Produto — Análise · n/N`) · side KPI cards with a hero chart · action title bundling cause+effect+action · subtitle re-explaining the chart or 2–3 lines · **causality asserted when data only supports correlation** · emoji/3D/shadow/heavy gradient · everything painted NAVY · mid category in dark navy (use MID_BLUE) · gold `#D4AF37` (off-palette) · multiple navies with no semantic role · partial current month without a flag · reference line without an inline level-color label · confidence band without declared `n` · phase band without a badge · side callout without a connector · thin 1px annotation outlines (use `ACCENT_BG` fill or ≥2px border) · **semantic color as the sole encoding (stoplight)** — always add a label/shape · hatch as the *only* differentiator · logo absent on a data slide · label <10pt on TV · light color as isolated data on TV · annotation over a bar/point (extend ylim first) · >4–5 annotations on one chart · inventing a waterfall vector to close a story · `K`/`M` · pie/donut · dual Y axis outside C3 · broken zero baseline · reading slides aloud live.

## Reference files (read on demand)

- **`components.md`** — the editorial component catalog + extensions + retirement rule. Read when placing a specific component (delta, reference line, phase band, callout, heatmap…).
- **`compositions.md`** — C1–C8 + multi-panel layouts, component-by-component. Read when assembling a full chart.
- **`recipes.md`** — engine bindings (matplotlib canvas detail, HTML/CSS vars, Plotly mapping). Read when writing render code.
