#!/usr/bin/env python3
"""
Harness de validação da camada LookML do projeto CRM.

Uso:
  python driver.py view      <arquivo.view.lkml> <modelo.yml>
  python driver.py dashboard <arquivo.dashboard.lookml> <arquivo.view.lkml>

`view`      → parse lkml + cruza dimensões com as colunas do .yml do mart (fonte de verdade).
`dashboard` → parse YAML + lint estrutural + cruza os campos dos tiles com a view; exige model: crm.

Exit code 0 = OK; 1 = erros (listados no stdout). Requer: pip install lkml pyyaml
"""
import re
import sys

try:
    import lkml
except ImportError:
    sys.exit("ERRO: falta a lib 'lkml' — rode: pip install lkml pyyaml")
try:
    import yaml
except ImportError:
    sys.exit("ERRO: falta a lib 'pyyaml' — rode: pip install lkml pyyaml")

TABLE_REF = re.compile(r"\$\{TABLE\}\.(\w+)")
TIMEFRAMES_DEFAULT = ["raw", "time", "date", "week", "month", "quarter", "year"]
QUOTED_SEGMENT = re.compile(r'"[^"]*"')


def _bad_value_format(vf):
    """True se o value_format tem letra literal fora de aspas (ex.: R$#,##0 → o Looker
    interpreta 'R' como caractere de formato). Literais devem vir entre aspas: \"R$\"#,##0."""
    if not vf:
        return False
    fora_aspas = QUOTED_SEGMENT.sub("", vf)
    return bool(re.search(r"[A-Za-z]", fora_aspas))


def _load_view(path):
    """Retorna (view_name, set(colunas referenciadas via ${TABLE}.x),
    set(nomes de campos expostos: dimensões, dimension_groups expandidos e measures))."""
    with open(path) as fh:
        parsed = lkml.load(fh)
    views = parsed.get("views", [])
    if not views:
        raise ValueError(f"{path}: nenhuma view encontrada")
    view = views[0]
    name = view.get("name", "")
    table_refs, exposed, bad_formats = set(), set(), []

    for dim in view.get("dimensions", []):
        exposed.add(dim["name"])
        table_refs |= set(TABLE_REF.findall(dim.get("sql", "")))
        if _bad_value_format(dim.get("value_format")):
            bad_formats.append(f"{dim['name']} ({dim['value_format']})")
    for dg in view.get("dimension_groups", []):
        table_refs |= set(TABLE_REF.findall(dg.get("sql", "")))
        tfs = dg.get("timeframes", TIMEFRAMES_DEFAULT)
        for tf in tfs:
            exposed.add(f"{dg['name']}_{tf}")
        exposed.add(dg["name"])
    for meas in view.get("measures", []):
        exposed.add(meas["name"])
        table_refs |= set(TABLE_REF.findall(meas.get("sql", "")))
        if _bad_value_format(meas.get("value_format")):
            bad_formats.append(f"{meas['name']} ({meas['value_format']})")
    return name, table_refs, exposed, bad_formats


def _yml_columns(path):
    with open(path) as fh:
        doc = yaml.safe_load(fh)
    cols = set()
    for model in doc.get("models", []):
        for col in model.get("columns", []):
            cols.add(col["name"])
    return cols


def validate_view(view_path, yml_path):
    errors, warnings = [], []
    _, table_refs, exposed, bad_formats = _load_view(view_path)
    yml_cols = _yml_columns(yml_path)

    if bad_formats:
        errors.append(
            "value_format com literal fora de aspas (Looker rejeita; use \\\"R$\\\"#,##0): "
            + ", ".join(bad_formats)
        )
    missing = sorted(table_refs - yml_cols)
    if missing:
        errors.append(
            "Dimensões referenciam colunas inexistentes no .yml do mart: "
            + ", ".join(missing)
        )
    undocumented = sorted(yml_cols - table_refs)
    if undocumented:
        warnings.append(
            "Colunas do mart sem dimensão na view (ok se intencional): "
            + ", ".join(undocumented)
        )
    return errors, warnings, {
        "colunas_yml": len(yml_cols),
        "refs_view": len(table_refs),
        "campos_expostos": len(exposed),
    }


def validate_dashboard(dash_path, view_path):
    errors, warnings = [], []
    with open(dash_path) as fh:
        docs = yaml.safe_load(fh)
    if not isinstance(docs, list) or not docs:
        return ["Dashboard deve ser uma lista YAML iniciando com '- dashboard:'."], [], {}
    dash = docs[0]

    for key in ("dashboard", "title", "layout", "preferred_viewer", "elements"):
        if key not in dash:
            errors.append(f"Falta a chave de topo '{key}'.")
    if dash.get("layout") not in (None, "newspaper"):
        warnings.append(f"layout='{dash.get('layout')}' (padrão do repo é 'newspaper').")
    if dash.get("preferred_viewer") not in (None, "dashboards-next"):
        warnings.append("preferred_viewer != 'dashboards-next'.")
    if "filters" not in dash:
        warnings.append("Nenhum filtro nativo declarado (Data/BU/Status são recomendados).")

    _, _, exposed, _ = _load_view(view_path)
    elements = dash.get("elements", []) or []
    if not elements:
        errors.append("Nenhum tile em 'elements'.")

    types_seen = set()
    for el in elements:
        title = el.get("title") or el.get("name") or "(sem nome)"
        if el.get("model") != "crm":
            errors.append(f"Tile '{title}': model != 'crm' (é '{el.get('model')}').")
        types_seen.add(el.get("type"))
        for fld in el.get("fields", []) or []:
            suffix = fld.split(".", 1)[1] if "." in fld else fld
            if suffix not in exposed:
                warnings.append(f"Tile '{title}': campo '{fld}' não encontrado na view.")

    if not (types_seen & {"single_value"}):
        warnings.append("Sem KPI single_value — recomendado para topo.")
    if not (types_seen & {"looker_grid", "table"}):
        warnings.append("Sem tabela (looker_grid) — recomendada para listagem.")
    if not (types_seen & {"looker_bar", "looker_column"}):
        warnings.append("Sem gráfico de barras/colunas — recomendado para distribuições.")

    return errors, warnings, {"tiles": len(elements), "tipos": sorted(t for t in types_seen if t)}


def main():
    if len(sys.argv) < 4 or sys.argv[1] not in ("view", "dashboard"):
        sys.exit(__doc__)
    mode, a, b = sys.argv[1], sys.argv[2], sys.argv[3]
    if mode == "view":
        errors, warnings, stats = validate_view(a, b)
    else:
        errors, warnings, stats = validate_dashboard(a, b)

    print(f"== {mode} :: {a}")
    print(f"   stats: {stats}")
    for w in warnings:
        print(f"   ⚠️  {w}")
    if errors:
        for e in errors:
            print(f"   ❌ {e}")
        print(f"FALHOU ({len(errors)} erro(s))")
        sys.exit(1)
    print("OK")


if __name__ == "__main__":
    main()
