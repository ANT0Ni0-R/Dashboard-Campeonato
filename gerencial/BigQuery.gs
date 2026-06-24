/**
 * BigQuery.gs — Visao Comissao (BigQuery) por SNAPSHOT.
 *
 * Um trigger de 30 em 30 min (snapshotBigQuery, executado como o DONO) roda as queries no
 * BigQuery e grava o resultado ja agregado na aba "Snapshot_BQ" da planilha. A visao Comissao
 * do front (getDashboardBigQuery) apenas LE essa aba — assim os visitantes precisam so de
 * leitura na planilha, sem acesso ao BigQuery.
 *
 * Projeto/tabela com HIFENS (grupo-primo-prd) — sem hifen o BQ falha (ver CLAUDE.md).
 * TVD no BigQuery = sales_channel = 'TVD' (canal_tvd na aba Config). GMV/receita de transactions.
 * Habilite o servico avancado "BigQuery" no editor (ou via appsscript.json).
 */

var SNAPSHOT_SHEET = 'Snapshot_BQ';

// ===== ENTRY POINT do front: le o snapshot da aba e devolve no shape do dashboard =====
function getDashboardBigQuery() {
  var cfg = lerConfig_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName(SNAPSHOT_SHEET);
  var json = sh ? String(sh.getRange('B2').getValue() || '') : '';
  if (!json) {
    throw new Error('Snapshot do BigQuery ainda nao gerado. Rode "snapshotBigQuery" no editor (ou aguarde o trigger de 30 min).');
  }
  var dash = JSON.parse(json);
  dash.config = publicConfig_(cfg);
  dash.fonte = 'BigQuery';
  dash.geradoEm = new Date().toISOString();
  dash.snapshotEm = sh.getRange('B1').getValue() || dash.snapshotEm || '';
  return dash;
}

// ===== TRIGGER (30 min): roda as queries e grava o snapshot =====
function snapshotBigQuery() {
  var cfg = lerConfig_();
  var nomes = lerParticipantes_();
  var payload = montaSnapshotBQ_(cfg, nomes);
  payload.fonte = 'BigQuery';
  payload.snapshotEm = new Date().toISOString();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SNAPSHOT_SHEET) || ss.insertSheet(SNAPSHOT_SHEET);
  sh.getRange('A1').setValue('geradoEm');
  sh.getRange('B1').setValue(payload.snapshotEm);
  sh.getRange('A2').setValue('json');
  sh.getRange('B2').setValue(JSON.stringify(payload));
  return payload;
}

// Monta o payload (mesmo shape de aggregateRows_) a partir das 4 queries.
function montaSnapshotBQ_(cfg, nomes) {
  var ini = String(cfg.inicio || '').slice(0, 10);
  var fim = String(cfg.fim || '').slice(0, 10);

  var k = bqQuery_(cfg, sqlKpisBQ_(cfg, ini, fim))[0] || {};
  var ranking = bqQuery_(cfg, sqlRankingBQ_(cfg, ini, fim));
  var dia = bqQuery_(cfg, sqlPorDiaBQ_(cfg, ini, fim));
  var hora = bqQuery_(cfg, sqlPorHoraBQ_(cfg));

  return {
    kpis: {
      hoje:  kpiBQ_(k.gmv_total_hoje, k.vendas_total_hoje, k.gmv_tvd_hoje, k.vendas_tvd_hoje),
      total: kpiBQ_(k.gmv_total, k.vendas_total, k.gmv_tvd, k.vendas_tvd)
    },
    ranking: rankingBQ_(ranking, cfg, nomes),
    porDia: porDiaBQ_(dia),
    porHora: porHoraBQ_(hora)
  };
}

// ===== Mapeadores (linhas do BQ -> shape do dashboard) =====
function kpiBQ_(gTotal, vTotal, gTvd, vTvd) {
  var gt = Number(gTotal) || 0, vt = Number(vTotal) || 0, gv = Number(gTvd) || 0, vv = Number(vTvd) || 0;
  return {
    gmv_total: gt, gmv_tvd: gv,
    share_tvd: gt > 0 ? gv / gt : 0,
    vendas_total: vt, vendas_tvd: vv,
    ticket_total: vt > 0 ? gt / vt : 0,
    ticket_tvd: vv > 0 ? gv / vv : 0
  };
}
function rankingBQ_(rows, cfg, nomes) {
  return (rows || []).map(function (r) {
    var code = String(r.seller_pmp || '').toUpperCase();
    return {
      code: code,
      nome: nomes[code] || r.seller_name || code,
      foto: cfg.fotosBase + code + '.jpg',
      gmv: Number(r.gmv) || 0, vendas: Number(r.vendas) || 0,
      gmv_hoje: Number(r.gmv_hoje) || 0, vendas_hoje: Number(r.vendas_hoje) || 0
    };
  });
}
function porDiaBQ_(rows) {
  return (rows || []).map(function (x) {
    var tvd = Number(x.gmv_tvd) || 0, outros = Number(x.gmv_outros) || 0;
    var tot = tvd + outros;
    return { dia: x.dia, gmv_tvd: tvd, gmv_outros: outros, share_tvd: tot > 0 ? tvd / tot : 0 };
  });
}
function porHoraBQ_(rows) {
  var map = {};
  (rows || []).forEach(function (x) { map[Number(x.hora)] = Number(x.gmv_tvd) || 0; });
  var atual = Number(Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH'));
  var out = [];
  for (var h = 0; h <= atual; h++) out.push({ hora: h, gmv_tvd: map[h] || 0 });
  return out;
}

// ===== SQL builders (parametrizados pela aba Config) =====
function bqFiltrosBase_(cfg, ini, fim) {
  return 'NOT COALESCE(is_refunded, FALSE)\n' +
         '  AND UPPER(product_name) LIKE UPPER(' + sqlStr_(cfg.bqProductLike) + ')\n' +
         '  AND transaction_dt BETWEEN DATE ' + sqlStr_(ini) + ' AND DATE ' + sqlStr_(fim);
}
function sqlKpisBQ_(cfg, ini, fim) {
  var t = sqlStr_(cfg.canalTvd), hoje = "CURRENT_DATE('America/Sao_Paulo')";
  return 'SELECT\n' +
    '  SUM(gmv) AS gmv_total,\n' +
    '  SUM(net_transactions) AS vendas_total,\n' +
    '  SUM(IF(sales_channel = ' + t + ', gmv, 0)) AS gmv_tvd,\n' +
    '  SUM(IF(sales_channel = ' + t + ', net_transactions, 0)) AS vendas_tvd,\n' +
    '  SUM(IF(transaction_dt = ' + hoje + ', gmv, 0)) AS gmv_total_hoje,\n' +
    '  SUM(IF(transaction_dt = ' + hoje + ', net_transactions, 0)) AS vendas_total_hoje,\n' +
    '  SUM(IF(transaction_dt = ' + hoje + ' AND sales_channel = ' + t + ', gmv, 0)) AS gmv_tvd_hoje,\n' +
    '  SUM(IF(transaction_dt = ' + hoje + ' AND sales_channel = ' + t + ', net_transactions, 0)) AS vendas_tvd_hoje\n' +
    'FROM `' + cfg.bqTable + '`\n' +
    'WHERE ' + bqFiltrosBase_(cfg, ini, fim);
}
function sqlRankingBQ_(cfg, ini, fim) {
  var hoje = "CURRENT_DATE('America/Sao_Paulo')";
  return 'SELECT\n' +
    '  seller_pmp,\n' +
    '  ANY_VALUE(seller_name) AS seller_name,\n' +
    '  SUM(gmv) AS gmv,\n' +
    '  SUM(net_transactions) AS vendas,\n' +
    '  SUM(IF(transaction_dt = ' + hoje + ', gmv, 0)) AS gmv_hoje,\n' +
    '  SUM(IF(transaction_dt = ' + hoje + ', net_transactions, 0)) AS vendas_hoje\n' +
    'FROM `' + cfg.bqTable + '`\n' +
    'WHERE ' + bqFiltrosBase_(cfg, ini, fim) + '\n' +
    '  AND sales_channel = ' + sqlStr_(cfg.canalTvd) + '\n' +
    '  AND seller_pmp IS NOT NULL\n' +
    'GROUP BY seller_pmp\n' +
    'ORDER BY gmv DESC';
}
function sqlPorDiaBQ_(cfg, ini, fim) {
  var t = sqlStr_(cfg.canalTvd);
  return 'SELECT\n' +
    "  FORMAT_DATE('%Y-%m-%d', transaction_dt) AS dia,\n" +
    '  SUM(IF(sales_channel = ' + t + ', gmv, 0)) AS gmv_tvd,\n' +
    '  SUM(IF(sales_channel = ' + t + ', 0, gmv)) AS gmv_outros\n' +
    'FROM `' + cfg.bqTable + '`\n' +
    'WHERE ' + bqFiltrosBase_(cfg, ini, fim) + '\n' +
    'GROUP BY dia\n' +
    'ORDER BY dia';
}
function sqlPorHoraBQ_(cfg) {
  return 'SELECT\n' +
    "  EXTRACT(HOUR FROM DATETIME(transaction_at, 'America/Sao_Paulo')) AS hora,\n" +
    '  SUM(gmv) AS gmv_tvd\n' +
    'FROM `' + cfg.bqTable + '`\n' +
    'WHERE NOT COALESCE(is_refunded, FALSE)\n' +
    '  AND sales_channel = ' + sqlStr_(cfg.canalTvd) + '\n' +
    '  AND UPPER(product_name) LIKE UPPER(' + sqlStr_(cfg.bqProductLike) + ')\n' +
    "  AND transaction_dt = CURRENT_DATE('America/Sao_Paulo')\n" +
    'GROUP BY hora\n' +
    'ORDER BY hora';
}

// Literal SQL seguro (escapa aspas simples). Use so para valores de config (planilha do dono).
function sqlStr_(v) { return "'" + String(v == null ? '' : v).replace(/'/g, "''") + "'"; }

// ===== Executor de query no BigQuery (servico avancado) =====
function bqQuery_(cfg, sql) {
  var request = { query: sql, useLegacySql: false, timeoutMs: 60000 };
  var resp = BigQuery.Jobs.query(request, cfg.bqProject);

  // Se o job nao completou no timeout, busca os resultados pelo jobId.
  if (!resp.jobComplete) {
    var jobId = resp.jobReference.jobId;
    var loc = resp.jobReference.location;
    var tries = 0;
    do {
      Utilities.sleep(1000);
      resp = BigQuery.Jobs.getQueryResults(cfg.bqProject, jobId, { location: loc, timeoutMs: 60000 });
      tries++;
    } while (!resp.jobComplete && tries < 30);
    if (!resp.jobComplete) throw new Error('BigQuery: tempo esgotado aguardando o job.');
  }

  var fields = (resp.schema && resp.schema.fields ? resp.schema.fields : []).map(function (f) { return f.name; });
  return (resp.rows || []).map(function (r) {
    var o = {};
    r.f.forEach(function (cell, i) { o[fields[i]] = cell.v; });
    return o;
  });
}

// ===== Instala/atualiza o trigger de 30 min (rode UMA vez no editor) =====
function criarTriggerSnapshot() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'snapshotBigQuery') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('snapshotBigQuery').timeBased().everyMinutes(30).create();
  snapshotBigQuery(); // gera o primeiro snapshot agora
  Logger.log('Trigger de 30 min criado e primeiro snapshot gerado.');
}

// ===== Diagnostico: roda as 4 queries e loga contagens (sem gravar) =====
function testSnapshot() {
  var cfg = lerConfig_();
  var ini = String(cfg.inicio || '').slice(0, 10), fim = String(cfg.fim || '').slice(0, 10);
  Logger.log('BQ PROJECT: %s | TABLE: %s', cfg.bqProject, cfg.bqTable);
  Logger.log('JANELA: %s -> %s | PRODUTO LIKE: %s | CANAL TVD: %s', ini, fim, cfg.bqProductLike, cfg.canalTvd);
  try {
    var k = bqQuery_(cfg, sqlKpisBQ_(cfg, ini, fim))[0] || {};
    Logger.log('KPIs: %s', JSON.stringify(k));
    Logger.log('Ranking: %s linhas', bqQuery_(cfg, sqlRankingBQ_(cfg, ini, fim)).length);
    Logger.log('PorDia: %s linhas', bqQuery_(cfg, sqlPorDiaBQ_(cfg, ini, fim)).length);
    Logger.log('PorHora: %s linhas', bqQuery_(cfg, sqlPorHoraBQ_(cfg)).length);
  } catch (e) {
    Logger.log('ERRO BigQuery: %s', e && e.message ? e.message : e);
  }
}
