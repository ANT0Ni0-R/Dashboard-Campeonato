/**
 * Code.gs — Dashboard "Corrida de Fechamento" servido pelo Apps Script
 *
 * Painel de TV para estimular o fechamento das metas do mes (foco no ultimo dia):
 * velocimetro de GMV de hoje, corrida dos vendedores, podio do dia, countdown e
 * ritmo necessario para bater a meta.
 *
 * Fonte unica de dados: Supabase (tabela db_transactions_events), consultada no
 * SERVIDOR (UrlFetchApp) com JWT HS256 assinado e renovado sozinho (~50min). A URL
 * publica do Web App abre direto na smart TV sem login e sem expor credenciais.
 *
 * PARAMETROS na planilha vinculada (Extensoes > Apps Script):
 *   - aba "Config"        (chave | valor): metas, janela, defaults
 *   - aba "Participantes" (PMP | Nome | Falta): vendedores + quanto falta p/ a meta
 *   - aba "Parcelamento"  (slug_like | valor_min | valor_max | meses | fator): GMV Ajustado
 *
 * SEGREDOS (Project Settings > Script Properties):
 *   SUPABASE_JWT_SECRET      -> JWT Secret do projeto (assinatura HS256)
 *   SUPABASE_JWT_SUB         -> uuid do seu usuario (claim `sub`)
 *   SUPABASE_PUBLISHABLE_KEY -> publishable key `sb_publishable_...` (header apikey)
 *   SUPABASE_JWT_ROLE        (opcional) -> papel no JWT (default: authenticated)
 *   SUPABASE_JWT_EMAIL       (opcional) -> e-mail, se a RLS usa auth.jwt()->>'email'
 *   SUPABASE_URL             (opcional) -> default abaixo
 * Fallbacks: SUPABASE_SERVICE_ROLE_KEY (ignora RLS) ou SUPABASE_ACCESS_TOKEN + publishable.
 *
 * Deploy: Implantar > Nova implantacao > App da Web
 *   - Executar como: Eu | Quem tem acesso: Qualquer pessoa (a smart TV abre sem login)
 */

// ===== DEFAULTS (sobrescritos pela aba Config / Script Properties) =====
var DEFAULTS = {
  SUPABASE_URL:    'https://ipalripfknzhrzddhvdx.supabase.co',
  SUPABASE_TABELA: 'db_transactions_events',
  FOTOS_BASE:      'https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/assets/fotos/',
  EXCLUIR_SLUGS:   'legado,trilogia do investidor',
  EXCLUDE_EMAIL:   'timeprimo.com',
  EXPEDIENTE_INI:  8,
  EXPEDIENTE_FIM:  24
};

// Paleta usada quando o vendedor nao tem cor propria (atribuida por ordem de PMP).
var SELLER_COLORS = ['#2bd4a0', '#5b9cff', '#ffd35c', '#ff6b9d', '#b98bff', '#36d6e7',
                     '#ff8a3d', '#7ee787', '#f778ba', '#a5d6ff', '#ffab70'];

// ===== SERVE A PAGINA =====
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Corrida de Fechamento')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ===== CONFIG (aba "Config" + segredos + DEFAULTS) =====
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
  return {
    // --- parametros (aba Config) ---
    titulo:       kv['titulo'] || 'Corrida de Fechamento',
    inicio:       kv['inicio'] || '',
    fim:          kv['fim'] || '',
    metaMes:      Number(kv['meta_mes']) || 0,
    metaDia:      Number(kv['meta_dia']) || 0,   // 0 = usa falta do mes como referencia do velocimetro
    gmvRequisicoes: Number(kv['gmv_requisicoes']) || 0,  // aporte manual: GMV de requisicoes que nao cai no Supabase
    pollSegundos: Number(kv['poll_segundos'] || 60) || 60,
    fotosBase:    kv['fotos_base'] || DEFAULTS.FOTOS_BASE,
    tabela:       kv['tabela'] || DEFAULTS.SUPABASE_TABELA,
    excluirSlugs: lista_(kv['excluir_slugs'] || DEFAULTS.EXCLUIR_SLUGS),
    excluirPmps:  lista_(kv['excluir_pmps']).map(function (s) { return s.toUpperCase(); }),
    expedienteIni: kv['expediente_inicio'] !== undefined && kv['expediente_inicio'] !== ''
                     ? Number(kv['expediente_inicio']) : DEFAULTS.EXPEDIENTE_INI,
    expedienteFim: kv['expediente_fim'] !== undefined && kv['expediente_fim'] !== ''
                     ? Number(kv['expediente_fim']) : DEFAULTS.EXPEDIENTE_FIM,
    aliasPmp:     parseAliasPmp_(kv['pmp_aliases']),
    excludeEmailDomains: lista_(kv['exclude_email_domains'] || DEFAULTS.EXCLUDE_EMAIL),

    // --- conexao/segredos ---
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

function lista_(raw) {
  return String(raw || '').split(/[,;]+/).map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length; });
}

// Aba "Participantes" (PMP | Nome | Falta) -> [{ code, nome, falta }] na ordem da planilha.
function lerParticipantes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName('Participantes');
  var out = [];
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var pmp = String(values[i][0] || '').trim().toUpperCase();
    if (!pmp || pmp.length !== 3 || pmp.toLowerCase() === 'pmp') continue;
    out.push({
      code: pmp,
      nome: String(values[i][1] == null ? '' : values[i][1]).trim() || pmp,
      falta: Number(values[i][2]) || 0
    });
  }
  return out;
}

// Aba "Parcelamento" (slug_like | valor_min | valor_max | meses | fator) -> regras de GMV Ajustado.
function lerParcelamento_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss && ss.getSheetByName('Parcelamento');
  var out = [];
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var slug = String(values[i][0] == null ? '' : values[i][0]).trim();
    if (!slug || slug.toLowerCase().indexOf('slug') === 0) continue; // pula cabecalho/vazio
    var min = values[i][1], max = values[i][2], meses = values[i][3], fator = values[i][4];
    out.push({
      slug:  normSlug_(slug),  // normalizado: casa por "contem" ignorando acento/espaco/hifen
      min:   (min === '' || min == null) ? 0 : (Number(min) || 0),
      max:   (max === '' || max == null) ? Infinity : (Number(max) || 0),
      meses: Number(meses) || 1,
      fator: (fator === '' || fator == null) ? 1 : (Number(fator) || 1)
    });
  }
  return out;
}

// ===== DASHBOARD (chamado pelo front via google.script.run) =====
function getDashboard() {
  var cfg = lerConfig_();
  var participantes = lerParticipantes_();
  var regras = lerParcelamento_();

  // Duas consultas direcionadas (paginadas) para nao bater no teto de linhas do PostgREST:
  //  - mes/time: so vendas TVD na janela do mes -> KPIs gerais (realizado, GMV hoje, hora-a-hora)
  //  - hoje/corrida: todos os canais, so o dia de hoje -> corrida/podio por PMP
  var rowsTvdMes = fetchPaginado_(cfg, '&pmp=ilike.*TVD*', cfg.inicio, cfg.fim);
  var rowsHoje   = fetchPaginado_(cfg, '', hojeInicioISO_(), cfg.fim);
  return montaDashboard_(rowsTvdMes, rowsHoje, cfg, participantes, regras);
}

// Transforma as linhas do Supabase no shape consumido pelo front.
// rowsTvdMes = vendas TVD do mes; rowsHoje = vendas de hoje (qualquer canal).
function montaDashboard_(rowsTvdMes, rowsHoje, cfg, participantes, regras) {
  var hoje = hojeSP_();
  var geral = { realizadoMes: 0, gmvHoje: 0 };
  var horas = {};
  var porPmp = {};
  participantes.forEach(function (s) {
    porPmp[s.code] = { code: s.code, nome: s.nome, falta: s.falta, gmvHoje: 0 };
  });

  (rowsTvdMes || []).forEach(function (t) {
    var gmv = gmvAjustado_(Number(t.price) || 0, t.slug, regras);
    acumulaGeralTvd_(geral, horas, gmv, t.pmp, diaSP_(t.created_at) === hoje, t.created_at);
  });
  (rowsHoje || []).forEach(function (t) {
    var gmv = gmvAjustado_(Number(t.price) || 0, t.slug, regras);
    acumulaPorPmp_(porPmp, gmv, t.pmp, cfg.aliasPmp);
  });

  // GMV de requisicoes: aporte manual (Config) que nunca cai no Supabase. Entra so no acumulado
  // do mes do time -> reflete em realizado, falta e ritmo. Nao afeta hoje/hora-a-hora/corrida.
  geral.realizadoMes += cfg.gmvRequisicoes;

  var meta = montaMeta_(cfg, geral);
  meta.pctDia = meta.metaDia > 0 ? geral.gmvHoje / meta.metaDia : 0;
  return {
    config: { titulo: cfg.titulo, pollSegundos: cfg.pollSegundos, fim: cfg.fim, inicio: cfg.inicio, expedienteFim: cfg.expedienteFim },
    meta: meta,
    hoje: montaHoje_(cfg, geral, meta.faltaMes),
    sellers: montaSellers_(porPmp, cfg),
    hourly: montaPorHora_(horas),
    fonte: 'Supabase',
    geradoEm: new Date().toISOString()
  };
}

// Geral do time = criterio TVD (pmp contem "TVD"). Alimenta meta do mes, GMV de hoje e hora-a-hora.
function acumulaGeralTvd_(geral, horas, gmv, pmp, ehHoje, createdAt) {
  if (!isTvd_(pmp)) return;
  geral.realizadoMes += gmv;
  if (ehHoje) {
    geral.gmvHoje += gmv;
    var h = horaSP_(createdAt);
    horas[h] = (horas[h] || 0) + gmv;
  }
}

// Corrida/podio = atribuicao por PMP cadastrado (independente de canal).
// Recebe apenas linhas de hoje (rowsHoje), entao nao filtra data aqui.
function acumulaPorPmp_(porPmp, gmv, pmp, aliasPmp) {
  var code = canonCode_(sellerCode_(pmp), aliasPmp);
  if (code && porPmp[code]) porPmp[code].gmvHoje += gmv;
}

function montaMeta_(cfg, geral) {
  var faltaMes = Math.max(0, cfg.metaMes - geral.realizadoMes);
  return {
    metaMes: cfg.metaMes,
    realizadoMes: geral.realizadoMes,
    faltaMes: faltaMes,
    pctMes: cfg.metaMes > 0 ? geral.realizadoMes / cfg.metaMes : 0,
    metaDia: cfg.metaDia > 0 ? cfg.metaDia : faltaMes,   // referencia do velocimetro
    pctDia: 0  // preenchido em montaDashboard_ (depende do gmvHoje)
  };
}

function montaHoje_(cfg, geral, faltaMes) {
  var dec = horasDecorridas_(cfg), rest = horasRestantes_(cfg);
  var realHora = dec > 0 ? geral.gmvHoje / dec : 0;
  var necHora = rest > 0 ? faltaMes / rest : 0;
  return {
    gmv: geral.gmvHoje,
    realHora: realHora,
    necHora: necHora,
    ritmo: realHora > 0 ? necHora / realHora : 0
  };
}

function montaSellers_(porPmp, cfg) {
  var arr = Object.keys(porPmp).map(function (k) { return porPmp[k]; });
  arr.sort(function (a, b) { return b.gmvHoje - a.gmvHoje || a.nome.localeCompare(b.nome); });
  return arr.map(function (s, i) {
    return {
      code: s.code,
      nome: s.nome,
      foto: cfg.fotosBase + s.code + '.jpg',   // PMP maiusculo + .jpg (ex.: CCL.jpg)
      cor: SELLER_COLORS[i % SELLER_COLORS.length],
      gmvHoje: s.gmvHoje,
      falta: s.falta,
      metaPct: s.falta > 0 ? s.gmvHoje / s.falta : 0
    };
  });
}

// Eixo fixo 0h-23h -> grafico estavel o dia inteiro.
function montaPorHora_(horas) {
  var out = [];
  for (var h = 0; h < 24; h++) out.push({ hora: h, gmv: horas[h] || 0 });
  return out;
}

// ===== GMV Ajustado por produto =====
// A 1a parcela (price) casa por slug (contem, normalizado) + faixa de preco numa regra de
// Parcelamento e vira price*meses*fator (contrato cheio). Sem match -> price inalterado.
function gmvAjustado_(price, slug, regras) {
  price = Number(price) || 0;
  if (!regras || !regras.length || !slug) return price;
  var s = normSlug_(slug);
  for (var i = 0; i < regras.length; i++) {
    var r = regras[i];
    if (r.slug && s.indexOf(r.slug) >= 0 && price >= r.min && price <= r.max) return price * r.meses * r.fator;
  }
  return price;
}

// Normaliza slug para casar planilha ("Formação Consultor de IA") x banco
// ("formacao-consultor-de-ia"): tira acentos, minusculas, remove tudo que nao e [a-z0-9].
function normSlug_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ===== HELPERS de tempo/atribuicao =====
function isTvd_(pmp) { return /tvd/i.test(String(pmp || '')); }
function sellerCode_(pmp) {
  var segs = String(pmp || '').split('-');
  var code = (segs[segs.length - 1] || '').toUpperCase();
  return code.length === 3 ? code : '';
}
function parseAliasPmp_(raw) {
  var map = {};
  String(raw || '').split(/[,;]+/).forEach(function (par) {
    var kv = par.split(':');
    var de = (kv[0] || '').trim().toUpperCase(), para = (kv[1] || '').trim().toUpperCase();
    if (de && para) map[de] = para;
  });
  if (!Object.keys(map).length) map.JCK = 'JKC';
  return map;
}
function canonCode_(code, aliasMap) {
  code = String(code || '').toUpperCase();
  return (aliasMap && aliasMap[code]) || code;
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
// Hora fracionada (BRT) do momento atual, para o ritmo R$/h.
function horaAgoraSP_() {
  var now = new Date();
  var hh = Number(Utilities.formatDate(now, 'America/Sao_Paulo', 'HH'));
  var mm = Number(Utilities.formatDate(now, 'America/Sao_Paulo', 'mm'));
  return hh + mm / 60;
}
function horasDecorridas_(cfg) {
  return Math.max(0, Math.min(cfg.expedienteFim, horaAgoraSP_()) - cfg.expedienteIni);
}
function horasRestantes_(cfg) {
  return Math.max(0, cfg.expedienteFim - Math.max(cfg.expedienteIni, horaAgoraSP_()));
}

// Remove vendas de teste: e-mail com dominio interno. E-mail vazio = venda real (mantida).
function semEmailTeste_(rows, cfg) {
  var doms = (cfg && cfg.excludeEmailDomains) || [];
  if (!doms.length) return rows || [];
  return (rows || []).filter(function (t) {
    var email = String(t.email || '').trim().toLowerCase();
    if (!email) return true;
    return !doms.some(function (d) { return email.slice(-(d.length + 1)) === '@' + d.toLowerCase(); });
  });
}

// ===== CONSULTA O SUPABASE (paginada) =====
// O PostgREST tem teto de linhas por resposta (db-max-rows, ~1000) que o `limit` nao ultrapassa.
// Para a janela de um mes inteiro isso truncava o resultado (so vinham as ~1000 mais antigas).
// Aqui paginamos por offset com order=created_at.asc ate exaurir. `filtroExtra` = filtros PostgREST
// adicionais (ex.: '&pmp=ilike.*TVD*'); `inicioISO`/`fimISO` = janela de created_at.
function fetchPaginado_(cfg, filtroExtra, inicioISO, fimISO) {
  var PAGE = 1000, MAX = 300000;   // MAX = guarda de seguranca contra loop infinito
  var base = '/rest/v1/' + cfg.tabela +
             '?type=eq.order_success' +
             '&select=price,pmp,created_at,slug,id,email' +
             (filtroExtra || '');
  if (inicioISO) base += '&created_at=gte.' + encodeURIComponent(inicioISO);
  if (fimISO)    base += '&created_at=lte.' + encodeURIComponent(fimISO);
  base += '&order=created_at.asc';

  var todas = [], offset = 0;
  while (offset < MAX) {
    var rows = parseRows_(restGetAuth_(cfg, base + '&limit=' + PAGE + '&offset=' + offset));
    todas = todas.concat(rows);
    // Avanca pelo tamanho real da pagina (robusto a qualquer teto do servidor); para quando vazia.
    if (!rows.length) break;
    offset += rows.length;
  }
  // Exclusao de slugs no Apps Script: not.ilike no PostgREST descartaria vendas com slug NULL/vazio
  // (que NAO sao legado/trilogia) — aqui sao mantidas. A exclusao por PMP roda no mesmo nivel para
  // tirar o GMV do vendedor de TODOS os indicadores (geral/TVD, hora-a-hora e corrida/podio).
  return semPmpExcluido_(semSlugExcluido_(semEmailTeste_(todas, cfg), cfg), cfg);
}

// GET autenticado com retry de 401 (re-assina o JWT).
function restGetAuth_(cfg, path) {
  var resp = restGet_(cfg.url, path, resolveAuthHeaders_(cfg, false));
  if (resp.getResponseCode() === 401) resp = restGet_(cfg.url, path, resolveAuthHeaders_(cfg, true));
  return resp;
}

// Inicio do dia de hoje (BRT) em ISO, para a janela da corrida (so hoje).
function hojeInicioISO_() { return hojeSP_() + 'T00:00:00-03:00'; }

// Remove vendas cujo slug contem algum termo de cfg.excluirSlugs (normalizado: ignora
// acento/espaco/hifen). Slug vazio/ausente = mantida (nao casa nenhum termo de exclusao).
function semSlugExcluido_(rows, cfg) {
  var termos = (cfg && cfg.excluirSlugs || []).map(normSlug_).filter(function (t) { return t.length; });
  if (!termos.length) return rows || [];
  return (rows || []).filter(function (t) {
    var slug = normSlug_(t.slug);
    return !termos.some(function (term) { return slug.indexOf(term) >= 0; });
  });
}

// Remove vendas atribuidas a PMPs excluidos (config excluir_pmps). Resolve o codigo do vendedor
// igual a corrida (ultimo segmento do pmp + alias) e descarta se estiver na lista. Sem codigo de
// 3 letras (ex.: PMP so "TVD") = mantida, pois nao casa nenhum PMP excluido.
function semPmpExcluido_(rows, cfg) {
  var codigos = (cfg && cfg.excluirPmps) || [];
  if (!codigos.length) return rows || [];
  var excluidos = {};
  codigos.forEach(function (c) {
    var code = canonCode_(c, cfg.aliasPmp);
    if (code) excluidos[code] = true;
  });
  return (rows || []).filter(function (t) {
    var code = canonCode_(sellerCode_(t.pmp), cfg.aliasPmp);
    return !(code && excluidos[code]);
  });
}

function resolveAuthHeaders_(cfg, force) {
  if (cfg.serviceKey) return { apikey: cfg.serviceKey };       // ignora RLS
  if (cfg.jwtSecret) {                                          // modo recomendado
    if (!cfg.publishableKey) throw new Error('Falta SUPABASE_PUBLISHABLE_KEY (header apikey).');
    return { apikey: cfg.publishableKey, Authorization: 'Bearer ' + mintJwt_(cfg, force) };
  }
  if (cfg.accessToken) {
    if (!cfg.publishableKey) throw new Error('Falta SUPABASE_PUBLISHABLE_KEY (header apikey).');
    return { apikey: cfg.publishableKey, Authorization: 'Bearer ' + cfg.accessToken };
  }
  throw new Error('Configure SUPABASE_JWT_SECRET + SUPABASE_JWT_SUB + SUPABASE_PUBLISHABLE_KEY ' +
                  'em Script Properties (modo JWT recomendado).');
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

// Assina um JWT HS256 com o JWT Secret do projeto e o cacheia ~50min (renova sozinho).
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
  Logger.log('TITULO: %s', cfg.titulo);
  Logger.log('JANELA: %s -> %s', cfg.inicio || '(vazio)', cfg.fim || '(vazio)');
  Logger.log('META MES: %s | META DIA: %s', cfg.metaMes, cfg.metaDia);
  Logger.log('EXCLUIR SLUGS: %s', JSON.stringify(cfg.excluirSlugs));
  Logger.log('EXCLUIR PMPS: %s', JSON.stringify(cfg.excluirPmps));
  Logger.log('EXPEDIENTE: %s -> %s', cfg.expedienteIni, cfg.expedienteFim);
  Logger.log('URL: %s | TABELA: %s', cfg.url, cfg.tabela);
  Logger.log('JWT_SECRET: %s (role=%s, sub=%s)', mask(cfg.jwtSecret), cfg.jwtRole, cfg.jwtSub || '(nenhum)');
  Logger.log('PUBLISHABLE_KEY: %s', mask(cfg.publishableKey));
  Logger.log('PARTICIPANTES: %s', JSON.stringify(lerParticipantes_()));
  Logger.log('PARCELAMENTO: %s', JSON.stringify(lerParcelamento_()));
  try {
    var d = getDashboard();
    Logger.log('--- getDashboard() OK ---');
    Logger.log('Realizado mes (TVD): %s | GMV hoje (TVD): %s | Falta: %s',
               d.meta.realizadoMes, d.hoje.gmv, d.meta.faltaMes);
    Logger.log('Ritmo: real R$/h %s | nec R$/h %s | %sx',
               Math.round(d.hoje.realHora), Math.round(d.hoje.necHora), d.hoje.ritmo.toFixed(1));
    Logger.log('Sellers: %s', JSON.stringify(d.sellers));
    Logger.log('Hora-a-hora (hoje): %s', JSON.stringify(d.hourly));
  } catch (e) {
    Logger.log('--- getDashboard() ERRO ---');
    Logger.log(e && e.message ? e.message : e);
  }
}

// ===== UTILITARIO: grava os segredos UMA vez, depois APAGUE os valores =====
function setSecrets_() {
  PropertiesService.getScriptProperties().setProperties({
    SUPABASE_JWT_SECRET: '',       // JWT Secret do projeto (Settings > API > JWT)
    SUPABASE_JWT_SUB: '',          // uuid do seu usuario (Authentication > Users)
    SUPABASE_PUBLISHABLE_KEY: ''   // sb_publishable_...
  });
}
