"""
bq_fetch.py — Consulta o BigQuery e grava bq_data.json para o ranking.html consumir.

Uso:
  python bq_fetch.py                  # roda uma vez e sai
  python bq_fetch.py --loop           # roda a cada 30 min continuamente
  python bq_fetch.py --creds CAMINHO  # usa credencial num caminho específico

Pré-requisito:
  pip install google-cloud-bigquery
  (a autenticação é via Application Default Credentials do gcloud)
"""

import json
import time
import argparse
import os
from datetime import datetime

# ── Configuração ────────────────────────────────────────────────────────────
TABELA       = "grupoprimoprd.mart_sales_team.mrt_sales_team__transactions_with_sales_request"
OUTPUT_FILE  = "bq_data.json"        # gerado na mesma pasta que este script
INTERVALO_S  = 30 * 60               # 30 minutos

# Filtro de produto — deixe None para a versão de teste (sem filtro)
# Quando souber o nome exato, troque por ex: "legado" ou "Formação de Planejador"
FILTRO_PRODUTO = None   # ex: "LEGADO"

# ── Query ────────────────────────────────────────────────────────────────────
def build_query():
    filtros = ["is_refunded = false", "seller_pmp IS NOT NULL", "LENGTH(seller_pmp) = 3"]
    if FILTRO_PRODUTO:
        filtros.append(f"UPPER(product_name) LIKE UPPER('%{FILTRO_PRODUTO}%')")

    where = "\n  AND ".join(filtros)
    return f"""
SELECT
  seller_pmp,
  MAX(seller_name) AS seller_name,
  SUM(gmv)         AS gmv_total,
  COUNT(*)         AS qtd_vendas
FROM `{TABELA}`
WHERE {where}
GROUP BY seller_pmp
ORDER BY gmv_total DESC
"""

# ── Execução ─────────────────────────────────────────────────────────────────
def fetch_and_save(creds_path=None):
    try:
        from google.cloud import bigquery
        from google.oauth2 import service_account
    except ImportError:
        print("❌ Instale o pacote: pip install google-cloud-bigquery")
        return False

    try:
        if creds_path:
            # Credencial explícita (arquivo copiado para Documentos)
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = creds_path

        client = bigquery.Client()
        query  = build_query()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Consultando BigQuery...")
        print(f"Filtro produto: {FILTRO_PRODUTO or '(nenhum — versão de teste)'}")

        rows = client.query(query).result()
        data = [
            {
                "seller_pmp":  row.seller_pmp,
                "seller_name": row.seller_name or "",
                "gmv_total":   float(row.gmv_total or 0),
                "qtd_vendas":  int(row.qtd_vendas or 0),
            }
            for row in rows
        ]

        output = {
            "atualizado_em": datetime.now().isoformat(),
            "filtro_produto": FILTRO_PRODUTO,
            "vendedores": data,
        }

        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), OUTPUT_FILE)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"✅ {len(data)} vendedores gravados em {OUTPUT_FILE}")
        return True

    except Exception as e:
        print(f"❌ Erro: {e}")
        # Grava um json de erro para o front exibir
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), OUTPUT_FILE)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"erro": str(e), "atualizado_em": datetime.now().isoformat(), "vendedores": []}, f)
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--loop",  action="store_true", help="Roda em loop a cada 30 min")
    parser.add_argument("--creds", default=None,        help="Caminho para application_default_credentials.json")
    args = parser.parse_args()

    fetch_and_save(args.creds)

    if args.loop:
        print(f"🔁 Próxima atualização em {INTERVALO_S // 60} minutos. Pressione Ctrl+C para parar.")
        while True:
            time.sleep(INTERVALO_S)
            fetch_and_save(args.creds)


if __name__ == "__main__":
    main()
