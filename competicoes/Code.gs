/**
 * Code.gs — Dashboard de Competicao (podio de GMV) servido pelo Apps Script
 *
 * Modelo escalavel: 1 Google Sheet por competicao.
 *   - Os PARAMETROS da competicao ficam na aba "Config" (chave/valor) e os nomes
 *     dos participantes na aba "Participantes" (PMP -> Nome) da PROPRIA planilha.
 *   - As CREDENCIAIS do Supabase ficam em Script Properties (nunca na planilha
 *     nem versionadas).
 *   - Para criar OUTRA competicao: Arquivo > Fazer uma copia da planilha (o script
 *     vinculado vem junto), ajuste a aba "Config" e faca um novo deploy de Web App.
 *
 * A consulta ao Supabase acontece no SERVIDOR (UrlFetchApp), entao a URL publica
 * do Web App abre direto na smart TV sem login e sem expor credenciais.
 *
 * ===========================================================================
 *  AUTENTICACAO — modo JWT assinado no servidor (mantem RLS)
 * ===========================================================================
 * O servidor assina um JWT HS256 com o JWT Secret do projeto Supabase e o renova
 * sozinho (~50min). Sem login, sem CAPTCHA, sem token estatico para gerenciar.
 *   apikey:        SUPABASE_PUBLISHABLE_KEY (header apikey)
 *   Authorization: Bearer <JWT assinado>  (claims: role + sub = uuid do usuario)
 *
 * SEGREDOS (Project Settings > Script Properties):
 *   SUPABASE_JWT_SECRET      -> JWT Secret do projeto (assinatura HS256)
 *   SUPABASE_JWT_SUB         -> uuid do seu usuario (claim `sub`; RLS via auth.uid())
 *   SUPABASE_PUBLISHABLE_KEY -> publishable key `sb_publishable_...` (header apikey)
 *   SUPABASE_JWT_ROLE        (opcional) -> papel no JWT (default: authenticated)
 *   SUPABASE_JWT_EMAIL       (opcional) -> e-mail, se a RLS usa auth.jwt()->>'email'
 *   SUPABASE_URL             (opcional) -> default: https://ipalripfknzhrzddhvdx.supabase.co
 * Fallbacks (caso nao use JWT): SUPABASE_SERVICE_ROLE_KEY (ignora RLS) ou
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_PUBLISHABLE_KEY (JWT longo estatico).
 *
 * Deploy: Implantar > Nova implantacao > Tipo: App da Web
 *   - Executar como: Eu
 *   - Quem tem acesso: Qualquer pessoa (a smart TV abre sem login)
 */

// ===== DEFAULTS (sobrescritos pela aba Config / Script Properties) =====
var DEFAULTS = {
  SUPABASE_URL:   'https://ipalripfknzhrzddhvdx.supabase.co',
  SUPABASE_TABELA:'db_transactions_events',
  // Fotos publicas: <PMP>.jpg via raw.githubusercontent.com (repo publico).
  // Apos mesclar na main; antes do merge, use a branch em fotos_base na aba Config.
  FOTOS_BASE:     'https://raw.githubusercontent.com/ANT0Ni0-R/Dashboard-Campeonato/main/competicoes/fotos/'
};

// ===== SERVE A PAGINA =====
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Competicao — Podio')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ===== CONFIG DA COMPETICAO (aba "Config" da planilha + segredos) =====
// Le a aba "Config" (chave | valor) e mescla com Script Properties (segredos) e
// os DEFAULTS. Lanca erro claro se a planilha/abas nao existirem.
function lerConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script nao esta vinculado a uma planilha. Crie o script DENTRO da Google Sheet (Extensoes > Apps Script).');

  var cfgSheet = ss.getSheetByName('Config');
  if (!cfgSheet) throw new Error('Aba "Config" nao encontrada. Veja Config-template.md.');

  var kv = {};
  var values = cfgSheet.getDataRange().getValues();
  for (var i = 0; i < values.length; i++) {
    var chave = String(values[i][0] || '').trim();
    if (!chave || chave.toLowerCase() === 'chave') continue; // pula cabecalho/linhas vazias
    kv[chave.toLowerCase()] = String(values[i][1] == null ? '' : values[i][1]).trim();
  }

  var p = PropertiesService.getScriptProperties();
  var participantes = (kv['participantes'] || '')
    .split(/[,;\s]+/).map(function (s) { return s.trim().toUpperCase(); })
    .filter(function (s) { return s.length === 3; });

  return {
    // --- parametros da competicao (aba Config) ---
    titulo:       kv['titulo'] || 'Competicao',
    produto:      kv['produto'] || '',
    premio:       kv['premio'] || '',
    slugLike:     kv['slug_like'] || '%',
    participantes: participantes,
    inicio:       kv['inicio'] || '',
    fim:          kv['fim'] || '',
    pollSegundos: Number(kv['poll_segundos'] || 60) || 60,
    fotosBase:    kv['fotos_base'] || DEFAULTS.FOTOS_BASE,
    tabela:       kv['tabela'] || DEFAULTS.SUPABASE_TABELA,

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

// ===== RANKING (chamado pelo front via google.script.run) =====
// Retorna { config, ranking[], fonte, geradoEm }. ranking ordenado por gmv desc.
function getRanking() {
  var cfg = lerConfig_();
  var nomes = lerParticipantes_();

  var rows = fetchTransactions_(cfg);

  // Inicializa todos os participantes (mesmo sem venda) para aparecerem no podio.
  var acc = {};
  cfg.participantes.forEach(function (code) {
    acc[code] = { code: code, nome: nomes[code] || code, gmv: 0, qtd: 0 };
  });

  var participanteSet = {};
  cfg.participantes.forEach(function (c) { participanteSet[c] = true; });

  rows.forEach(function (t) {
    if (!t.pmp) return;
    var segs = String(t.pmp).split('-');
    var code = (segs[segs.length - 1] || '').toUpperCase();
    if (code.length !== 3 || !participanteSet[code]) return;
    var price = Number(t.price) || 0;
    acc[code].gmv += price;     // GMV = price (produto sem recorrencia)
    acc[code].qtd += 1;
  });

  var ranking = Object.keys(acc).map(function (k) {
    var r = acc[k];
    r.foto = cfg.fotosBase + r.code + '.jpg';
    return r;
  }).sort(function (a, b) { return b.gmv - a.gmv || a.nome.localeCompare(b.nome); });

  return {
    config: {
      titulo: cfg.titulo, produto: cfg.produto, premio: cfg.premio,
      inicio: cfg.inicio, fim: cfg.fim, pollSegundos: cfg.pollSegundos
    },
    ranking: ranking,
    total: ranking.reduce(function (s, r) { return s + r.gmv; }, 0),
    fonte: 'Supabase',
    geradoEm: new Date().toISOString()
  };
}

// ===== CONSULTA O SUPABASE (janela + slug) =====
function fetchTransactions_(cfg) {
  // ilike usa "*" como coringa; o config guarda o padrao com "%".
  var slugFilter = encodeURIComponent(String(cfg.slugLike).replace(/%/g, '*'));
  var path = '/rest/v1/' + cfg.tabela +
             '?type=eq.order_success' +
             '&select=price,pmp,created_at,slug,id' +
             '&slug=ilike.' + slugFilter;
  if (cfg.inicio) path += '&created_at=gte.' + encodeURIComponent(cfg.inicio);
  if (cfg.fim)    path += '&created_at=lte.' + encodeURIComponent(cfg.fim);

  var h = resolveAuthHeaders_(cfg, false);
  var resp = restGet_(cfg.url, path, h);
  if (resp.getResponseCode() === 401) {              // token expirado -> re-assina
    h = resolveAuthHeaders_(cfg, true);
    resp = restGet_(cfg.url, path, h);
  }
  return parseRows_(resp);
}

// Resolve os headers de autenticacao do modo ativo (1a opcao configurada vence).
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
  Logger.log('TITULO: %s | PRODUTO: %s', cfg.titulo, cfg.produto);
  Logger.log('JANELA: %s -> %s', cfg.inicio || '(inicio vazio)', cfg.fim || '(fim vazio)');
  Logger.log('SLUG ilike: %s', cfg.slugLike);
  Logger.log('PARTICIPANTES: %s', JSON.stringify(cfg.participantes));
  Logger.log('URL: %s | TABELA: %s', cfg.url, cfg.tabela);
  Logger.log('FOTOS_BASE: %s', cfg.fotosBase);
  Logger.log('JWT_SECRET: %s (role=%s, sub=%s)', mask(cfg.jwtSecret), cfg.jwtRole, cfg.jwtSub || '(nenhum)');
  Logger.log('PUBLISHABLE_KEY: %s', mask(cfg.publishableKey));
  Logger.log('SERVICE_ROLE_KEY: %s', mask(cfg.serviceKey));
  try {
    var r = getRanking();
    Logger.log('--- getRanking() OK: %s participantes, total GMV %s ---', r.ranking.length, r.total);
    Logger.log('Ranking: %s', JSON.stringify(r.ranking));
  } catch (e) {
    Logger.log('--- getRanking() ERRO ---');
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
