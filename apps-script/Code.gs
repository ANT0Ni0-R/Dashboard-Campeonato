/**
 * Code.gs — Ranking Geral do Lançamento (BigQuery via Apps Script)
 *
 * Deploy: Implantar > Nova implantação > Tipo: App da Web
 *   - Executar como: Eu
 *   - Quem tem acesso: (sua escolha — ver nota de segurança no final)
 *
 * Pré-requisito: Serviço avançado "BigQuery" habilitado (já está, pelo seu print).
 */

// ===== CONFIGURAÇÃO =====
// Projeto onde o JOB roda (cobrança/cota) — o que você tem acesso.
var PROJECT_ID = 'grupo-primo-prd';

// Tabela completa (projeto.dataset.tabela), com crases.
var TABELA = '`grupo-primo-prd.mart_sales_team.mrt_sales_team__transactions_with_sales_request`';

// Filtro de produto:
//   '' (vazio)  -> VERSÃO DE TESTE: traz todos os produtos (valida o front)
//   'legado'    -> produção: busca parcial, case-insensitive, no product_name
var PRODUTO_LIKE = '';

// ===== SERVE A PÁGINA =====
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Ranking Geral do Lançamento')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===== CONSULTA O BIGQUERY (chamado pelo front via google.script.run) =====
function getRankingData() {
  var filtros = [
    'is_refunded = false',
    'seller_pmp IS NOT NULL',
    'LENGTH(seller_pmp) = 3'
  ];
  if (PRODUTO_LIKE) {
    filtros.push("UPPER(product_name) LIKE UPPER('%" + PRODUTO_LIKE + "%')");
  }
  var where = filtros.join('\n      AND ');

  var query =
    'SELECT\n' +
    '  seller_pmp,\n' +
    '  MAX(seller_name) AS seller_name,\n' +
    '  SUM(gmv)         AS gmv_total,\n' +
    '  COUNT(*)         AS qtd\n' +
    'FROM ' + TABELA + '\n' +
    'WHERE ' + where + '\n' +
    'GROUP BY seller_pmp\n' +
    'ORDER BY gmv_total DESC';

  var res = BigQuery.Jobs.query({ query: query, useLegacySql: false }, PROJECT_ID);

  var vendedores = (res.rows || []).map(function (row) {
    var f = row.f;
    return {
      pmp:  f[0].v,
      nome: f[1].v || f[0].v,
      gmv:  Number(f[2].v || 0),
      qtd:  Number(f[3].v || 0)
    };
  });

  return {
    atualizado_em:  new Date().toISOString(),
    filtro_produto: PRODUTO_LIKE || null,
    vendedores:     vendedores
  };
}
