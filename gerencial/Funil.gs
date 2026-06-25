/**
 * Funil.gs — Visao FUNIL (ativacao/conversao do lancamento) por SNAPSHOT do BigQuery.
 *
 * Mesmo modelo da aba Comissao: um trigger de 30 min (snapshotFunil, rodando como o DONO)
 * executa as queries no BigQuery, agrega e grava o JSON ja pronto na aba "Snapshot_Funil".
 * O front (getFunilData) apenas LE essa aba — visitantes nao tocam o BigQuery.
 *
 * IMPORTANTE — acesso: a visao Funil e exclusiva do nivel "gerencial" (coluna Nivel da aba
 * Acessos). getFunilData() chama exigirGerencial_() (defesa em profundidade).
 *
 * IMPORTANTE — snapshot grande: o JSON do funil costuma passar do limite de ~50k chars por
 * celula do Sheets, entao a gravacao usa gravarJsonChunked_/lerJsonChunked_ (em BigQuery.gs).
 *
 * IMPORTANTE — schema: os nomes de coluna abaixo seguem o doc de contexto (CONTEXTO_FUNIL_
 * BIGQUERY.md). Eles DEVEM ser validados contra as amostras reais das tabelas (rode testFunil()
 * no editor). O front consome um shape NORMALIZADO (montado pelos mappers deste arquivo), entao
 * ajustes de coluna ficam restritos a este arquivo — nao mexem na UI.
 *
 * Projeto/tabelas com HIFENS (grupo-primo-prd) — sem hifen o BQ falha (ver CLAUDE.md).
 * Reusa bqQuery_, sqlStr_ e os helpers de chunk de BigQuery.gs; lerConfig_/lerParticipantes_
 * e canonCode_ de Code.gs.
 */

var SNAPSHOT_FUNIL_SHEET = 'Snapshot_Funil';

// Etapas que contam como "ativado" (LOWER(TRIM(deal_stage))). Saidas/laterais nao entram.
var FUNIL_STAGES_ATIVADO = [
  'ativado', 'ativado 2', 'aquece 1', 'aquece 2', 'aquece 3', 'aquece 4', 'aquece 5',
  'engajou', 'nao engajou', 'não engajou',
  'fup 1', 'fup 2', 'fup 3', 'fup 4', 'fup 5', 'fup 6', 'fup 7',
  'aguardando pagamento', 'fup link 1', 'fup link 2', 'fup link 3',
  'pagamento agendado', 'pagamento recorrente', 'venda'
];

// ===== ENTRY POINT do front: le o snapshot da aba e devolve no shape do funil =====
function getFunilData() {
  exigirGerencial_();
  var cfg = lerConfig_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName(SNAPSHOT_FUNIL_SHEET);
  var json = lerJsonChunked_(sh);
  if (!json) {
    throw new Error('Snapshot do Funil ainda nao gerado. Rode "snapshotFunil" no editor (ou aguarde o trigger de 30 min).');
  }
  var dash = JSON.parse(json);
  dash.config = publicConfig_(cfg);
  dash.fonte = 'Funil';
  dash.geradoEm = new Date().toISOString();
  dash.snapshotEm = (sh && sh.getRange('B1').getValue()) || dash.snapshotEm || '';
  return dash;
}

// ===== TRIGGER (30 min): roda as queries e grava o snapshot fragmentado =====
function snapshotFunil() {
  var cfg = lerConfig_();
  var nomes = lerParticipantes_();
  var payload = montaSnapshotFunil_(cfg, nomes);
  payload.fonte = 'Funil';
  payload.snapshotEm = new Date().toISOString();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SNAPSHOT_FUNIL_SHEET) || ss.insertSheet(SNAPSHOT_FUNIL_SHEET);
  gravarJsonChunked_(sh, payload.snapshotEm, JSON.stringify(payload));
  return payload;
}

// Monta o payload normalizado a partir das queries do funil.
function montaSnapshotFunil_(cfg, nomes) {
  var ini = String(cfg.inicio || '').slice(0, 10);
  var fim = String(cfg.fim || '').slice(0, 10);

  var base     = bqQuery_(cfg, sqlFunilBase_(cfg));
  var ativados = bqQuery_(cfg, sqlFunilAtivados_(cfg, ini, fim));
  var vendas   = bqQuery_(cfg, sqlFunilVendas_(cfg, ini, fim));
  var geral    = bqQuery_(cfg, sqlFunilConversaoGeral_(cfg, ini, fim))[0] || {};
  var tmrTotal = bqQuery_(cfg, sqlFunilTmr_(cfg, ini, fim));
  var tmrDia   = bqQuery_(cfg, sqlFunilTmrDia_(cfg, ini, fim));
  var tmrHora  = bqQuery_(cfg, sqlFunilTmrHora_(cfg, ini, fim));

  var basePorOrigem = mapBaseOrigem_(base);
  var ativadosFact  = mapAtivados_(ativados, cfg);
  var vendasFact    = mapVendas_(vendas, cfg);

  return {
    baseTotal:     somaTotalBase_(base),
    basePorOrigem: basePorOrigem,
    origens:       listaOrigens_(basePorOrigem, ativadosFact),
    vendedores:    listaVendedores_(ativadosFact, nomes),
    dias:          listaDias_(ativadosFact, ini, fim),
    ativados:      ativadosFact,                       // [{dia,hora,pmp,origem,n}]
    vendas:        vendasFact,                         // [{dia,pmp,origem,n}]
    conversaoGeral: {
      leadsUnicos:     Number(geral.leads_unicos) || 0,
      compradoresLead: Number(geral.compradores_lead) || 0
    },
    tmrTotal: mapTmrTotal_(tmrTotal, cfg),             // [{pmp,origem,mediana,media,n}] (null=todos)
    tmrDia:   mapTmrDia_(tmrDia, cfg),                 // [{dia,pmp,origem,mediana,n}]
    tmrHora:  mapTmrHora_(tmrHora, cfg)                // [{hora,pmp,origem,p25,p50,p75,n}]
  };
}

// ===================== SQL BUILDERS =====================
// (nomes de coluna seguem o doc de contexto — validar com testFunil contra as amostras)

// Lista SQL das etapas de ativacao (para LOWER(TRIM(deal_stage)) IN (...)).
function funilStagesInSql_() {
  return FUNIL_STAGES_ATIVADO.map(function (s) { return sqlStr_(s); }).join(', ');
}

// Origem do lead. Prioridade: fields.origem_do_lead (campo usado no legado) -> origin_name
// (preenchido nas tabelas atuais quando fields vem vazio) -> '(sem origem)'.
// JSON_VALUE em coluna ausente/sem a chave retorna NULL, entao o COALESCE cai no proximo.
function funilOrigemExpr_() {
  return "COALESCE(" +
    "NULLIF(TRIM(JSON_VALUE(fields, '$.origem_do_lead')), ''), " +
    "NULLIF(TRIM(origin_name), ''), " +
    "'(sem origem)')";
}

// Filtro do grupo do lancamento. Os nomes vem com sufixo de turma (ex.: "... [TDV 2]"),
// entao usamos LIKE (case-insensitive) em vez de igualdade exata.
function funilGrupoWhere_(cfg) {
  return 'LOWER(group_name) LIKE LOWER(' + sqlStr_(cfg.funilGroupLike) + ')';
}

// Base do pipeline (deals do grupo) por origem, com TOTAL via ROLLUP.
function sqlFunilBase_(cfg) {
  return 'SELECT\n' +
    '  ' + funilOrigemExpr_() + ' AS origem,\n' +
    '  COUNT(DISTINCT deal_id) AS total\n' +
    'FROM `' + cfg.bqDealsCleaned + '`\n' +
    'WHERE ' + funilGrupoWhere_(cfg) + '\n' +
    'GROUP BY ROLLUP(origem)';
}

// Fato de ativados: 1 linha por deal, contabilizada no momento da PRIMEIRA etapa de ativacao.
// Grao dia x hora x pmp(dono) x origem. Somar n = total de deals ativados (distintos).
function sqlFunilAtivados_(cfg, ini, fim) {
  return 'WITH hist AS (\n' +
    '  SELECT\n' +
    '    deal_id,\n' +
    '    UPPER(user_pmp) AS pmp,\n' +
    '    entered_stage_at AS ts,\n' +  // DATETIME ja em BRT — sem conversao de fuso
    '    ROW_NUMBER() OVER (PARTITION BY deal_id ORDER BY entered_stage_at, deal_stage) AS rn\n' +
    '  FROM `' + cfg.bqDealsHistory + '`\n' +
    '  WHERE LOWER(TRIM(deal_stage)) IN (' + funilStagesInSql_() + ')\n' +
    '),\n' +
    'first_act AS (\n' +
    '  SELECT deal_id, pmp, ts FROM hist WHERE rn = 1\n' +
    '),\n' +
    'base AS (\n' +
    '  SELECT deal_id, ' + funilOrigemExpr_() + ' AS origem\n' +
    '  FROM `' + cfg.bqDealsCleaned + '`\n' +
    '  WHERE ' + funilGrupoWhere_(cfg) + '\n' +
    ')\n' +
    'SELECT\n' +
    "  FORMAT_DATE('%Y-%m-%d', DATE(f.ts)) AS dia,\n" +
    '  EXTRACT(HOUR FROM f.ts) AS hora,\n' +
    "  COALESCE(NULLIF(f.pmp, ''), '(sem pmp)') AS pmp,\n" +
    '  b.origem AS origem,\n' +
    '  COUNT(*) AS n\n' +
    'FROM first_act f\n' +
    'JOIN base b USING (deal_id)\n' +
    "  WHERE DATE(f.ts) BETWEEN DATE " + sqlStr_(ini) + ' AND DATE ' + sqlStr_(fim) + '\n' +
    'GROUP BY dia, hora, pmp, origem';
}

// Fato de vendas (comprador distinto) por dia x pmp x origem do lead (match e-mail/telefone).
// Sem match com lead -> origem '(sem match)'. Somar n por pmp = vendas do vendedor.
function sqlFunilVendas_(cfg, ini, fim) {
  var t = sqlStr_(cfg.canalTvd);
  return 'WITH vendas AS (\n' +
    '  SELECT\n' +
    "    FORMAT_DATE('%Y-%m-%d', transaction_dt) AS dia,\n" +
    '    UPPER(seller_pmp) AS pmp,\n' +
    '    LOWER(TRIM(email)) AS email,\n' +
    "    RIGHT(REGEXP_REPLACE(CAST(phone AS STRING), r'[^0-9]', ''), 11) AS phone11\n" +
    '  FROM `' + cfg.bqTable + '`\n' +
    '  WHERE NOT COALESCE(is_refunded, FALSE)\n' +
    '    AND sales_channel = ' + t + '\n' +
    '    AND seller_pmp IS NOT NULL\n' +
    '    AND UPPER(product_name) LIKE UPPER(' + sqlStr_(cfg.bqProductLike) + ')\n' +
    '    AND transaction_dt BETWEEN DATE ' + sqlStr_(ini) + ' AND DATE ' + sqlStr_(fim) + '\n' +
    '),\n' +
    'leads AS (\n' +
    '  SELECT\n' +
    '    ' + funilOrigemExpr_() + ' AS origem,\n' +
    '    LOWER(TRIM(contact_email)) AS email,\n' +
    "    RIGHT(REGEXP_REPLACE(CAST(contact_phone AS STRING), r'[^0-9]', ''), 11) AS phone11\n" +
    '  FROM `' + cfg.bqDealsCleaned + '`\n' +
    '  WHERE ' + funilGrupoWhere_(cfg) + '\n' +
    '),\n' +
    'venda_origem AS (\n' +
    '  SELECT v.dia, v.pmp, v.email, v.phone11,\n' +
    '    COALESCE(le.origem, lp.origem) AS origem\n' +
    '  FROM vendas v\n' +
    '  LEFT JOIN leads le ON le.email = v.email AND v.email IS NOT NULL AND v.email != \'\'\n' +
    '  LEFT JOIN leads lp ON lp.phone11 = v.phone11 AND v.phone11 IS NOT NULL AND LENGTH(v.phone11) = 11\n' +
    ')\n' +
    'SELECT\n' +
    '  dia,\n' +
    "  COALESCE(NULLIF(pmp, ''), '(sem pmp)') AS pmp,\n" +
    "  COALESCE(origem, '(sem match)') AS origem,\n" +
    '  COUNT(DISTINCT COALESCE(email, phone11)) AS n\n' +
    'FROM venda_origem\n' +
    'GROUP BY dia, pmp, origem';
}

// Conversao geral: leads unicos (dedup email) x leads que compraram (match email/telefone).
function sqlFunilConversaoGeral_(cfg, ini, fim) {
  var t = sqlStr_(cfg.canalTvd);
  return 'WITH leads_u AS (\n' +
    '  SELECT LOWER(TRIM(lead_email)) AS email,\n' +
    "    ANY_VALUE(RIGHT(REGEXP_REPLACE(CAST(lead_phone_number AS STRING), r'[^0-9]', ''), 11)) AS phone11\n" +
    '  FROM `' + cfg.bqLeads + '`\n' +
    '  WHERE campanha = ' + sqlStr_(cfg.funilCampanha) + '\n' +
    '    AND lead_email IS NOT NULL\n' +
    '  GROUP BY email\n' +
    '),\n' +
    'compradores AS (\n' +
    '  SELECT DISTINCT LOWER(TRIM(email)) AS email,\n' +
    "    RIGHT(REGEXP_REPLACE(CAST(phone AS STRING), r'[^0-9]', ''), 11) AS phone11\n" +
    '  FROM `' + cfg.bqTable + '`\n' +
    '  WHERE NOT COALESCE(is_refunded, FALSE)\n' +
    '    AND sales_channel = ' + t + '\n' +
    '    AND UPPER(product_name) LIKE UPPER(' + sqlStr_(cfg.bqProductLike) + ')\n' +
    '    AND transaction_dt BETWEEN DATE ' + sqlStr_(ini) + ' AND DATE ' + sqlStr_(fim) + '\n' +
    ')\n' +
    'SELECT\n' +
    '  (SELECT COUNT(*) FROM leads_u) AS leads_unicos,\n' +
    '  (SELECT COUNT(DISTINCT l.email) FROM leads_u l\n' +
    '     WHERE EXISTS (SELECT 1 FROM compradores c\n' +
    '       WHERE c.email = l.email OR (LENGTH(l.phone11) = 11 AND c.phone11 = l.phone11))) AS compradores_lead';
}

// ===== TMR (tempo medio de resposta) — par cliente -> 1a resposta humana =====
// CTE base reusada pelas 3 granularidades.
function funilTmrBaseCte_(cfg, ini, fim) {
  var canais = cfg.tvdChannelIds.map(function (id) { return sqlStr_(id); }).join(', ');
  return 'WITH ativados AS (\n' +
    '  SELECT DISTINCT h.deal_id, c.contact_id, ' + funilOrigemExpr_() + ' AS origem\n' +
    '  FROM `' + cfg.bqDealsHistory + '` h\n' +
    '  JOIN `' + cfg.bqDealsCleaned + '` c USING (deal_id)\n' +
    '  WHERE LOWER(c.group_name) LIKE LOWER(' + sqlStr_(cfg.funilGroupLike) + ')\n' +
    '    AND LOWER(TRIM(h.deal_stage)) IN (' + funilStagesInSql_() + ')\n' +
    '),\n' +
    'dono AS (\n' +  // pmp do dono do deal (primeira ativacao)
    '  SELECT deal_id, UPPER(user_pmp) AS pmp FROM (\n' +
    '    SELECT deal_id, user_pmp,\n' +
    '      ROW_NUMBER() OVER (PARTITION BY deal_id ORDER BY entered_stage_at, deal_stage) AS rn\n' +
    '    FROM `' + cfg.bqDealsHistory + '`\n' +
    '    WHERE LOWER(TRIM(deal_stage)) IN (' + funilStagesInSql_() + ')\n' +
    '  ) WHERE rn = 1\n' +
    '),\n' +
    'msgs AS (\n' +
    '  SELECT m.chat_contact_id, m.message_id, m.created_at, m.message_type, m.message_source,\n' +
    '    LAG(m.message_type) OVER w AS prev_type,\n' +
    '    LAG(m.created_at)   OVER w AS prev_at\n' +
    '  FROM `' + cfg.bqMessages + '` m\n' +
    '  JOIN ativados a ON a.contact_id = m.chat_contact_id\n' +
    '  WHERE m.chat_channel_account_id IN (' + canais + ')\n' +
    '  WINDOW w AS (PARTITION BY m.chat_contact_id ORDER BY m.created_at, m.message_id)\n' +
    '),\n' +
    'resp AS (\n' +
    '  SELECT a.deal_id, a.origem, d.pmp,\n' +
    "    FORMAT_DATE('%Y-%m-%d', DATE(msgs.created_at)) AS dia,\n" +
    '    EXTRACT(HOUR FROM msgs.created_at) AS hora,\n' +
    '    DATETIME_DIFF(msgs.created_at, msgs.prev_at, SECOND) AS resp_seconds\n' +
    '  FROM msgs\n' +
    '  JOIN ativados a ON a.contact_id = msgs.chat_contact_id\n' +
    '  LEFT JOIN dono d ON d.deal_id = a.deal_id\n' +
    "  WHERE msgs.message_type = 'USER' AND msgs.message_source = 'CHAT'\n" +
    "    AND msgs.prev_type = 'CUSTOMER'\n" +
    '    AND DATE(msgs.created_at) BETWEEN DATE ' + sqlStr_(ini) + ' AND DATE ' + sqlStr_(fim) + '\n' +
    ')\n';
}

// TMR janela total: grouping sets () (pmp) (origem) (pmp,origem).
function sqlFunilTmr_(cfg, ini, fim) {
  return funilTmrBaseCte_(cfg, ini, fim) +
    'SELECT pmp, origem,\n' +
    '  COUNT(*) AS respostas,\n' +
    '  ROUND(AVG(resp_seconds)/60, 1) AS tmr_medio_min,\n' +
    '  ROUND(APPROX_QUANTILES(resp_seconds, 100)[OFFSET(50)]/60, 1) AS tmr_mediana_min\n' +
    'FROM resp\n' +
    'GROUP BY GROUPING SETS ((), (pmp), (origem), (pmp, origem))';
}

// TMR por dia: grouping sets (dia) (dia,pmp) (dia,origem).
function sqlFunilTmrDia_(cfg, ini, fim) {
  return funilTmrBaseCte_(cfg, ini, fim) +
    'SELECT dia, pmp, origem,\n' +
    '  COUNT(*) AS respostas,\n' +
    '  ROUND(APPROX_QUANTILES(resp_seconds, 100)[OFFSET(50)]/60, 1) AS tmr_mediana_min\n' +
    'FROM resp\n' +
    'GROUP BY GROUPING SETS ((dia), (dia, pmp), (dia, origem))';
}

// TMR por hora: grouping sets (hora) (hora,origem) (hora,pmp) (hora,pmp,origem) com faixa p25-p75.
function sqlFunilTmrHora_(cfg, ini, fim) {
  return funilTmrBaseCte_(cfg, ini, fim) +
    'SELECT hora, pmp, origem,\n' +
    '  COUNT(*) AS respostas,\n' +
    '  ROUND(APPROX_QUANTILES(resp_seconds, 100)[OFFSET(25)]/60, 1) AS p25_min,\n' +
    '  ROUND(APPROX_QUANTILES(resp_seconds, 100)[OFFSET(50)]/60, 1) AS p50_min,\n' +
    '  ROUND(APPROX_QUANTILES(resp_seconds, 100)[OFFSET(75)]/60, 1) AS p75_min\n' +
    'FROM resp\n' +
    'GROUP BY GROUPING SETS ((hora), (hora, origem), (hora, pmp), (hora, pmp, origem))';
}

// ===================== MAPPERS (linhas do BQ -> shape normalizado) =====================
function canon_(code, cfg) { return canonCode_(String(code || '').toUpperCase(), cfg.aliasPmp); }
function isRollupTotal_(v) { return v == null || v === ''; }

function mapBaseOrigem_(rows) {
  return (rows || []).filter(function (r) { return !isRollupTotal_(r.origem); })
    .map(function (r) { return { origem: r.origem, total: Number(r.total) || 0 }; })
    .sort(function (a, b) { return b.total - a.total; });
}
function somaTotalBase_(rows) {
  var tot = (rows || []).filter(function (r) { return isRollupTotal_(r.origem); })[0];
  if (tot) return Number(tot.total) || 0;
  return (rows || []).reduce(function (s, r) { return s + (Number(r.total) || 0); }, 0);
}
function mapAtivados_(rows, cfg) {
  return (rows || []).map(function (r) {
    return { dia: r.dia, hora: Number(r.hora) || 0, pmp: canon_(r.pmp, cfg),
      origem: r.origem || '(sem origem)', n: Number(r.n) || 0 };
  });
}
function mapVendas_(rows, cfg) {
  return (rows || []).map(function (r) {
    return { dia: r.dia, pmp: canon_(r.pmp, cfg), origem: r.origem || '(sem match)', n: Number(r.n) || 0 };
  });
}
function mapTmrTotal_(rows, cfg) {
  return (rows || []).map(function (r) {
    return { pmp: isRollupTotal_(r.pmp) ? null : canon_(r.pmp, cfg),
      origem: isRollupTotal_(r.origem) ? null : r.origem,
      mediana: Number(r.tmr_mediana_min) || 0, media: Number(r.tmr_medio_min) || 0,
      n: Number(r.respostas) || 0 };
  });
}
function mapTmrDia_(rows, cfg) {
  return (rows || []).map(function (r) {
    return { dia: r.dia, pmp: isRollupTotal_(r.pmp) ? null : canon_(r.pmp, cfg),
      origem: isRollupTotal_(r.origem) ? null : r.origem,
      mediana: Number(r.tmr_mediana_min) || 0, n: Number(r.respostas) || 0 };
  });
}
function mapTmrHora_(rows, cfg) {
  return (rows || []).map(function (r) {
    return { hora: Number(r.hora) || 0,
      pmp: isRollupTotal_(r.pmp) ? null : canon_(r.pmp, cfg),
      origem: isRollupTotal_(r.origem) ? null : r.origem,
      p25: Number(r.p25_min) || 0, p50: Number(r.p50_min) || 0, p75: Number(r.p75_min) || 0,
      n: Number(r.respostas) || 0 };
  });
}

// Origens conhecidas (base + ativados), sem duplicar, ordenadas.
function listaOrigens_(basePorOrigem, ativadosFact) {
  var set = {};
  (basePorOrigem || []).forEach(function (o) { set[o.origem] = true; });
  (ativadosFact || []).forEach(function (a) { set[a.origem] = true; });
  return Object.keys(set).sort();
}
// Vendedores (pmp) presentes nos ativados, com nome da aba Participantes.
function listaVendedores_(ativadosFact, nomes) {
  var set = {};
  (ativadosFact || []).forEach(function (a) { if (a.pmp) set[a.pmp] = true; });
  return Object.keys(set).map(function (pmp) {
    return { pmp: pmp, nome: (nomes && nomes[pmp]) || pmp };
  }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}
// Eixo de dias do lancamento (ini..fim) — garante dias vazios no grafico dia a dia.
function listaDias_(ativadosFact, ini, fim) {
  var dias = [];
  var d = new Date(ini + 'T00:00:00-03:00'), end = new Date(fim + 'T00:00:00-03:00');
  if (isNaN(d) || isNaN(end)) {  // fallback: dias presentes nos dados
    var set = {}; (ativadosFact || []).forEach(function (a) { set[a.dia] = true; });
    return Object.keys(set).sort();
  }
  while (d <= end) {
    dias.push(Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd'));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

// ===== Instala/atualiza o trigger de 30 min (rode UMA vez no editor) =====
function criarTriggerFunil() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'snapshotFunil') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('snapshotFunil').timeBased().everyMinutes(30).create();
  snapshotFunil();
  Logger.log('Trigger de 30 min do Funil criado e primeiro snapshot gerado.');
}

// ===== Diagnostico: roda cada query e loga contagens (sem gravar). Valide as colunas aqui. =====
function testFunil() {
  var cfg = lerConfig_();
  var ini = String(cfg.inicio || '').slice(0, 10), fim = String(cfg.fim || '').slice(0, 10);
  Logger.log('FUNIL janela %s -> %s | grupo LIKE %s | campanha %s', ini, fim, cfg.funilGroupLike, cfg.funilCampanha);
  var passos = [
    ['base', function () { return sqlFunilBase_(cfg); }],
    ['ativados', function () { return sqlFunilAtivados_(cfg, ini, fim); }],
    ['vendas', function () { return sqlFunilVendas_(cfg, ini, fim); }],
    ['conversaoGeral', function () { return sqlFunilConversaoGeral_(cfg, ini, fim); }],
    ['tmrTotal', function () { return sqlFunilTmr_(cfg, ini, fim); }],
    ['tmrDia', function () { return sqlFunilTmrDia_(cfg, ini, fim); }],
    ['tmrHora', function () { return sqlFunilTmrHora_(cfg, ini, fim); }]
  ];
  passos.forEach(function (p) {
    try {
      var rows = bqQuery_(cfg, p[1]());
      Logger.log('OK %s: %s linhas | amostra: %s', p[0], rows.length, JSON.stringify(rows[0] || {}));
    } catch (e) {
      Logger.log('ERRO %s: %s', p[0], e && e.message ? e.message : e);
    }
  });
}
