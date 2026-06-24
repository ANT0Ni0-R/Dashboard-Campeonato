/**
 * Code.gs — Dashboard Gerencial de Competicao (Apps Script)
 *
 * Tres visoes na mesma pagina (sem trocar de URL):
 *   - Real-time (Supabase): KPIs + graficos + ranking agregados ao vivo.
 *   - Comissao (BigQuery): mesma visao, lendo o snapshot gravado na aba Snapshot_BQ (PR2).
 *   - Consulta de vendas: tabela das vendas Supabase dos ultimos 7 dias.
 *
 * Modelo escalavel: 1 Google Sheet por dashboard (abas Config / Participantes / Acessos /
 * Snapshot_BQ). Para criar outro, duplica-se a planilha e faz-se um novo deploy. Os segredos
 * do Supabase ficam em Script Properties (nunca na planilha nem versionados). A consulta roda
 * no SERVIDOR (UrlFetchApp), entao a URL publica abre sem expor credenciais.
 *
 * Auth Supabase: JWT HS256 assinado no servidor (mantem RLS) — ver competicoes/README.md.
 *   SUPABASE_JWT_SECRET + SUPABASE_JWT_SUB + SUPABASE_PUBLISHABLE_KEY (Script Properties).
 *   Fallbacks: SUPABASE_SERVICE_ROLE_KEY (ignora RLS) ou SUPABASE_ACCESS_TOKEN + publishable.
 *
 * Deploy: Implantar > Nova implantacao > App da Web. Executar como: Eu. Acesso: conforme PR3.
 */

// ===== DEFAULTS (sobrescritos pela aba Config / Script Properties) =====
var DEFAULTS = {
  SUPABASE_URL:    'https://ipalripfknzhrzddhvdx.supabase.co',
  SUPABASE_TABELA: 'db_transactions_events',
  FOTOS_BASE:      'https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/competicoes/fotos/',
  BQ_PROJECT:      'grupo-primo-prd',
  BQ_TABLE:        'grupo-primo-prd.mart_sales_team.mrt_sales_team__transactions_with_sales_request',
  CANAL_TVD:       'TVD'
};

// ===== SERVE A PAGINA =====
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Dashboard Gerencial')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ===== CONFIG (aba "Config" da planilha + segredos) =====
function lerConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script nao esta vinculado a uma planilha. Crie o script DENTRO da Google Sheet (Extensoes > Apps Script).');

  var cfgSheet = ss.getSheetByName('Config');
  if (!cfgSheet) throw new Error('Aba "Config" nao encontrada. Veja Config-template.md.');

  var kv = {};
  var values = cfgSheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var chave = String(values[i][0] || '').trim();
    if (!chave || chave.toLowerCase() === 'chave') continue;
    kv[chave.toLowerCase()] = String(values[i][1] == null ? '' : values[i][1]).trim();
  }

  var p = PropertiesService.getScriptProperties();
  var participantes = (kv['participantes'] || '')
    .split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); })
    .filter(function (s) { return s.length === 3; });

  return {
    // --- parametros da competicao (aba Config) ---
    titulo:        kv['titulo'] || 'Dashboard',
    produto:       kv['produto'] || '',
    premio:        kv['premio'] || '',
    slugLike:      kv['slug_like'] || '%',
    participantes: participantes,
    inicio:        kv['inicio'] || '',
    fim:           kv['fim'] || '',
    pollSegundos:  Number(kv['poll_segundos'] || 60) || 60,
    fotosBase:     kv['fotos_base'] || DEFAULTS.FOTOS_BASE,
    tabela:        kv['tabela'] || DEFAULTS.SUPABASE_TABELA,
    // --- BigQuery (PR2) ---
    bqProject:     kv['bq_project'] || DEFAULTS.BQ_PROJECT,
    bqTable:       kv['bq_table'] || DEFAULTS.BQ_TABLE,
    bqProductLike: kv['bq_product_like'] || '%',
    canalTvd:      kv['canal_tvd'] || DEFAULTS.CANAL_TVD,
    // --- conexao/segredos (Script Properties; url pode vir tambem da aba) ---
    url:            kv['url'] || p.getProperty('SUPABASE_URL') || DEFAULTS.SUPABASE_URL,
    serviceKey:     p.getProperty('SUPABASE_SERVICE_ROLE_KEY') || p.getProperty('SUPABASE_SECRET_KEY'),
    publishableKey: p.getProperty('SUPABASE_PUBLISHABLE_KEY'),
    jwtSecret:      p.getProperty('SUPABASE_JWT_SECRET'),
    jwtRole:        p.getProperty('SUPABASE_JWT_ROLE') || 'authenticated',
    jwtSub:         p.getProperty('SUPABASE_JWT_SUB'),
    jwtEmail:       p.getProperty('SUPABASE_JWT_EMAIL'),
    accessToken:    p.getProperty('SUPABASE_ACCESS_TOKEN')
  };
}

// Le a aba "Participantes" (PMP | Nome) -> { PMP: Nome }. Opcional.
function lerParticipantes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName('Participantes');
  var mapa = {};
  if (!sh) return mapa;
  var values = sh.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var pmp = String(values[i][0] || '').trim().toUpperCase();
    if (!pmp || pmp.length !== 3 || pmp.toLowerCase() === 'pmp') continue;
    mapa[pmp] = String(values[i][1] == null ? '' : values[i][1]).trim() || pmp;
  }
  return mapa;
}

// ===== publicConfig: dados de cabecalho para o front =====
function publicConfig_(cfg) {
  return {
    titulo: cfg.titulo, produto: cfg.produto, premio: cfg.premio,
    inicio: cfg.inicio, fim: cfg.fim, pollSegundos: cfg.pollSegundos
  };
}

// ===== DASHBOARD REAL-TIME (Supabase) — chamado via google.script.run =====
// periodo (opcional): { inicio, fim } ISO para sobrescrever a janela da aba Config (seletor de datas).
function getDashboardSupabase(periodo) {
  var cfg = lerConfig_();
  if (periodo && periodo.inicio) cfg.inicio = periodo.inicio;
  if (periodo && periodo.fim)    cfg.fim = periodo.fim;

  var nomes = lerParticipantes_();
  var rows = fetchTransactions_(cfg);
  var dash = aggregateRows_(rows, cfg, nomes);
  dash.config = publicConfig_(cfg);
  dash.fonte = 'Supabase';
  dash.geradoEm = new Date().toISOString();
  return dash;
}

// ===== AGREGACAO (puro) — transforma linhas do Supabase no shape do dashboard =====
// TVD = pmp contem "TVD". "Outros" = pmp sem "TVD". GMV = price.
function aggregateRows_(rows, cfg, nomes) {
  var hoje = hojeSP_();
  var kpiTotal = novoKpi_(), kpiHoje = novoKpi_();
  var rankAcc = {}, dias = {}, horas = {};

  (rows || []).forEach(function (t) {
    var price = Number(t.price) || 0;
    var tvd = isTvd_(t.pmp);
    var dia = diaSP_(t.created_at);
    var ehHoje = dia === hoje;

    acumulaKpi_(kpiTotal, price, tvd);
    if (ehHoje) acumulaKpi_(kpiHoje, price, tvd);

    if (!dias[dia]) dias[dia] = { dia: dia, gmv_tvd: 0, gmv_outros: 0 };
    if (tvd) dias[dia].gmv_tvd += price; else dias[dia].gmv_outros += price;

    if (tvd) {
      var code = sellerCode_(t.pmp);
      if (code) {
        if (!rankAcc[code]) rankAcc[code] = { code: code, nome: nomes[code] || code, gmv: 0, vendas: 0, gmv_hoje: 0, vendas_hoje: 0 };
        rankAcc[code].gmv += price; rankAcc[code].vendas += 1;
        if (ehHoje) { rankAcc[code].gmv_hoje += price; rankAcc[code].vendas_hoje += 1; }
      }
      if (ehHoje) {
        var h = horaSP_(t.created_at);
        horas[h] = (horas[h] || 0) + price;
      }
    }
  });

  return {
    kpis: { hoje: fechaKpi_(kpiHoje), total: fechaKpi_(kpiTotal) },
    ranking: montaRanking_(rankAcc, cfg),
    porDia: montaPorDia_(dias),
    porHora: montaPorHora_(horas)
  };
}

function novoKpi_() { return { gmv_total: 0, gmv_tvd: 0, vendas_total: 0, vendas_tvd: 0 }; }
function acumulaKpi_(k, price, tvd) {
  k.gmv_total += price; k.vendas_total += 1;
  if (tvd) { k.gmv_tvd += price; k.vendas_tvd += 1; }
}
function fechaKpi_(k) {
  return {
    gmv_total: k.gmv_total, gmv_tvd: k.gmv_tvd,
    share_tvd: k.gmv_total > 0 ? k.gmv_tvd / k.gmv_total : 0,
    vendas_total: k.vendas_total, vendas_tvd: k.vendas_tvd,
    ticket_total: k.vendas_total > 0 ? k.gmv_total / k.vendas_total : 0,
    ticket_tvd: k.vendas_tvd > 0 ? k.gmv_tvd / k.vendas_tvd : 0
  };
}
function montaRanking_(rankAcc, cfg) {
  return Object.keys(rankAcc).map(function (k) {
    var r = rankAcc[k];
    r.foto = cfg.fotosBase + r.code + '.jpg';
    return r;
  }).sort(function (a, b) { return b.gmv - a.gmv || a.nome.localeCompare(b.nome); });
}
function montaPorDia_(dias) {
  return Object.keys(dias).sort().map(function (d) {
    var x = dias[d];
    var tot = x.gmv_tvd + x.gmv_outros;
    x.share_tvd = tot > 0 ? x.gmv_tvd / tot : 0;
    return x;
  });
}
function montaPorHora_(horas) {
  var atual = Number(Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'HH'));
  var out = [];
  for (var h = 0; h <= atual; h++) out.push({ hora: h, gmv_tvd: horas[h] || 0 });
  return out;
}

// ===== HELPERS de tempo/atribuicao =====
function isTvd_(pmp) { return /tvd/i.test(String(pmp || '')); }
function sellerCode_(pmp) {
  var segs = String(pmp || '').split('-');
  var code = (segs[segs.length - 1] || '').toUpperCase();
  return code.length === 3 ? code : '';
}
function hojeSP_() { return Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd'); }
function diaSP_(iso) {
  var d = new Date(iso);
  return isNaN(d) ? '' : Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd');
}
function horaSP_(iso) {
  var d = new Date(iso);
  return isNaN(d) ? 0 : Number(Utilities.formatDate(d, 'America/Sao_Paulo', 'HH'));
}

// ===== CONSULTA O SUPABASE (janela + slug) =====
function fetchTransactions_(cfg) {
  var slugFilter = encodeURIComponent(String(cfg.slugLike).replace(/%/g, '*'));
  var path = '/rest/v1/' + cfg.tabela +
             '?type=eq.order_success' +
             '&select=price,pmp,created_at,slug,id' +
             '&slug=ilike.' + slugFilter;
  if (cfg.inicio) path += '&created_at=gte.' + encodeURIComponent(cfg.inicio);
  if (cfg.fim)    path += '&created_at=lte.' + encodeURIComponent(cfg.fim);
  // PostgREST limita a 1000 linhas por padrao — sem isto o GMV agregado vem truncado.
  path += '&limit=100000';

  var h = resolveAuthHeaders_(cfg, false);
  var resp = restGet_(cfg.url, path, h);
  if (resp.getResponseCode() === 401) {
    h = resolveAuthHeaders_(cfg, true);
    resp = restGet_(cfg.url, path, h);
  }
  return parseRows_(resp);
}

// ===== CONSULTA DE VENDAS (ultimos 7 dias) — chamado via google.script.run =====
function listarVendas(termo) {
  termo = String(termo || '').trim();
  var cfg = lerConfig_();
  var seteDias = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  var path = '/rest/v1/' + cfg.tabela +
             '?type=eq.order_success' +
             '&select=created_at,slug,pmp,price,name,email,phone' +
             '&created_at=gte.' + encodeURIComponent(seteDias);

  if (termo) {
    var cond = [];
    if (termo.indexOf('@') >= 0) {
      cond.push('email.ilike.*' + encodeURIComponent(termo) + '*');
    } else {
      var digitos = termo.replace(/\D/g, '');
      if (digitos) cond.push('phone.ilike.*' + encodeURIComponent(digitos) + '*');
      cond.push('email.ilike.*' + encodeURIComponent(termo) + '*');
    }
    path += '&or=(' + cond.join(',') + ')';
  }
  path += '&order=created_at.desc&limit=300';

  var h = resolveAuthHeaders_(cfg, false);
  var resp = restGet_(cfg.url, path, h);
  if (resp.getResponseCode() === 401) { h = resolveAuthHeaders_(cfg, true); resp = restGet_(cfg.url, path, h); }
  var rows = parseRows_(resp);

  return rows.map(function (t) {
    return {
      created_at: t.created_at,
      slug:       t.slug || '',
      pmp:        t.pmp || '',
      pmp_code:   sellerCode_(t.pmp),
      tvd:        isTvd_(t.pmp),
      nome:       t.name || '',
      email:      t.email || '',
      phone:      t.phone || '',
      price:      Number(t.price) || 0
    };
  });
}

// ===== AUTH / REST / JWT (Supabase) =====
function resolveAuthHeaders_(cfg, force) {
  if (cfg.serviceKey) return { apikey: cfg.serviceKey };
  if (cfg.jwtSecret) {
    if (!cfg.publishableKey) throw new Error('Falta SUPABASE_PUBLISHABLE_KEY (header apikey).');
    return { apikey: cfg.publishableKey, Authorization: 'Bearer ' + mintJwt_(cfg, force) };
  }
  if (cfg.accessToken) {
    if (!cfg.publishableKey) throw new Error('Falta SUPABASE_PUBLISHABLE_KEY (header apikey).');
    return { apikey: cfg.publishableKey, Authorization: 'Bearer ' + cfg.accessToken };
  }
  throw new Error('Configure SUPABASE_JWT_SECRET + SUPABASE_JWT_SUB + SUPABASE_PUBLISHABLE_KEY em Script Properties (modo JWT recomendado).');
}

function restGet_(url, path, headers) {
  headers = headers || {};
  headers.Accept = 'application/json';
  return UrlFetchApp.fetch(url + path, { method: 'get', headers: headers, muteHttpExceptions: true });
}

function parseRows_(resp) {
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase REST erro ' + code + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText() || '[]');
}

function mintJwt_(cfg, forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('sb_minted_jwt');
    if (cached) return cached;
  }
  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'HS256', typ: 'JWT' };
  var payload = { iss: 'supabase', role: cfg.jwtRole, iat: now, exp: now + 3600 };
  if (cfg.jwtSub)   { payload.sub = cfg.jwtSub; payload.aud = 'authenticated'; }
  if (cfg.jwtEmail) { payload.email = cfg.jwtEmail; }

  var b64 = function (obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  };
  var signingInput = b64(header) + '.' + b64(payload);
  var sigBytes = Utilities.computeHmacSha256Signature(signingInput, cfg.jwtSecret);
  var sig = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, '');
  var token = signingInput + '.' + sig;
  cache.put('sb_minted_jwt', token, 3000); // 50min
  return token;
}

// ===== DIAGNOSTICO (rode no editor; resultado no Registro de execucao) =====
function diag() {
  var cfg = lerConfig_();
  var mask = function (s) { return !s ? '(vazio)' : s.slice(0, 12) + '... (len ' + s.length + ')'; };
  Logger.log('TITULO: %s | PRODUTO: %s', cfg.titulo, cfg.produto);
  Logger.log('JANELA: %s -> %s', cfg.inicio || '(inicio vazio)', cfg.fim || '(fim vazio)');
  Logger.log('SLUG ilike: %s', cfg.slugLike);
  Logger.log('PARTICIPANTES: %s', JSON.stringify(cfg.participantes));
  Logger.log('URL: %s | TABELA: %s', cfg.url, cfg.tabela);
  Logger.log('JWT_SECRET: %s (role=%s, sub=%s)', mask(cfg.jwtSecret), cfg.jwtRole, cfg.jwtSub || '(nenhum)');
  Logger.log('PUBLISHABLE_KEY: %s | SERVICE_ROLE_KEY: %s', mask(cfg.publishableKey), mask(cfg.serviceKey));
  try {
    var d = getDashboardSupabase(null);
    Logger.log('--- getDashboardSupabase() OK ---');
    Logger.log('KPIs total: %s', JSON.stringify(d.kpis.total));
    Logger.log('Ranking: %s vendedores | porDia: %s | porHora: %s', d.ranking.length, d.porDia.length, d.porHora.length);
  } catch (e) {
    Logger.log('--- getDashboardSupabase() ERRO ---');
    Logger.log(e && e.message ? e.message : e);
  }
}

// ===== UTILITARIO: grava os segredos UMA vez, depois APAGUE os valores =====
function setSecrets_() {
  PropertiesService.getScriptProperties().setProperties({
    SUPABASE_JWT_SECRET: '',
    SUPABASE_JWT_SUB: '',
    SUPABASE_PUBLISHABLE_KEY: ''
  });
}
