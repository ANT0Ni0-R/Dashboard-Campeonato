# PRIMO_PLOTS — engine recipes (reference)

Layers 1–4 (`SKILL.md` + `components.md` + `compositions.md`) are engine-agnostic; this file is the binding. Don't redefine principles or tokens here.

## Matplotlib (deck / PPTX / TV — default)

Base canvas is in `SKILL.md`. Conventions:

- `figsize=(16, 9)`, `dpi=140`, white facecolor, `plt.rcParams['text.parse_math'] = False` (so `R$` doesn't break).
- Header via `fig.text`: title TITLE_BLACK 20pt bold, subtitle GREY_TXT 13pt italic, logo top-right.
- Chart axes `fig.add_axes([0.05, 0.13, 0.92, 0.62])` (full-width).
- Footnote `fig.text(0.04, 0.058, l1, fontsize=9, style='italic', color=GREY_TXT)` + `(0.04, 0.030, l2, …)`.
- Reference line: dashed `alpha=0.5, lw=1.2` + inline label in the level color.
- Side callout: `FancyBboxPatch` with `ACCENT_BG` fill (or ≥2px colored border) + a connector arrow.
- Leader: `linestyle=(0,(1,2))`; extend `ylim` before annotating.
- No kicker bar, no formal footer, no side KPI cards with a hero chart.

## HTML/CSS (scroll / dashboard)

- Tokens become CSS variables (`--navy`, `--accent`, `--grey-txt`, `--green-ok`…); typography in rem on the same scale; container ≤1200px.
- Chart engine: Chart.js or D3, reading vars via `getComputedStyle(document.documentElement).getPropertyValue('--navy')`.
- One render function **per composition** (e.g. `renderHeatmapByBand(dataKey, nKey)`), not per instance.

## Plotly (interactive — Streamlit/Dash)

- Tokens via a shared palette dict; don't reimplement.
- pill → annotation with `bgcolor` + `bordercolor` + white font · reference line → shape `line` · phase band → shape `rect` with `layer='below'` · leader → annotation `arrowhead=0` dashed.
