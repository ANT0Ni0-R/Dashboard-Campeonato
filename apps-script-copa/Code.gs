/**
 * Code.gs — Copa do Mundo: O Legado (bracket) servido pelo Apps Script
 *
 * Por que esta versao existe:
 *   Permite hospedar o dashboard da Copa como Web App do Apps Script, com as
 *   requisicoes ao Supabase feitas no SERVIDOR (nao no navegador). Assim:
 *     - o repositorio do codigo pode ficar PRIVADO (o Apps Script guarda a
 *       propria copia do codigo);
 *     - a URL publica do Web App abre direto na smart TV, sem login;
 *     - as credenciais do Supabase ficam 100% server-side (Script Properties),
 *       nunca no codigo do cliente.
 *
 * Deploy: Implantar > Nova implantacao > Tipo: App da Web
 *   - Executar como: Eu
 *   - Quem tem acesso: Qualquer pessoa (necessario para a smart TV abrir sem login)
 *
 * Arquivos do projeto (cole cada um no arquivo correspondente do editor):
 *   Code.gs        -> este arquivo
 *   Index.html     -> casca HTML (usa include() para montar a pagina)
 *   Stylesheet.html-> CSS (styles.css inline)
 *   Config.html    -> COMPETICAO + ASSETS_BASE (config.js inline)
 *   JavaScript.html-> motor do dashboard (app.js, com fetch via google.script.run)
 *
 * SEGREDOS (Project Settings > Script Properties) — defina antes de publicar:
 *   SUPABASE_PUBLISHABLE_KEY  (obrigatorio) -> chave publishable do Supabase (header apikey)
 *   SUPABASE_AUTH_EMAIL       (obrigatorio) -> e-mail do usuario Supabase usado para login
 *   SUPABASE_AUTH_PASSWORD    (obrigatorio) -> senha desse usuario
 *   SUPABASE_URL              (opcional)    -> default: https://ipalripfknzhrzddhvdx.supabase.co
 *   SUPABASE_TABELA           (opcional)    -> default: db_transactions_events
 *   PRODUTO_SLUG_LIKE         (opcional)    -> default: %legado%
 *   CREATED_AT_GTE            (opcional)    -> default: 2026-06-16T00:00:00-03:00
 *
 * Dica: rode setSecrets_() UMA vez (preenchendo os valores) para gravar os
 * segredos via codigo, depois APAGUE os valores. Ou use a UI de Script Properties.
 */

// ===== CONFIG (defaults; sobrescritos por Script Properties quando presentes) =====
var DEFAULTS = {
  SUPABASE_URL:     'https://ipalripfknzhrzddhvdx.supabase.co',
  SUPABASE_TABELA:  'db_transactions_events',
  PRODUTO_SLUG_LIKE:'%legado%',
  CREATED_AT_GTE:   '2026-06-16T00:00:00-03:00'
};

// ===== SERVE A PAGINA =====
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Copa do Mundo: O Legado')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Permite montar a pagina a partir de varios arquivos HTML.
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// ===== CONSULTA O SUPABASE (chamado pelo front via google.script.run) =====
// Retorna o array de transacoes (price, pmp, created_at, slug, id), igual ao
// formato que o app.js ja espera.
function getTransactions() {
  var p = PropertiesService.getScriptProperties();
  var cfg = {
    url:      p.getProperty('SUPABASE_URL') || DEFAULTS.SUPABASE_URL,
    tabela:   p.getProperty('SUPABASE_TABELA') || DEFAULTS.SUPABASE_TABELA,
    slugLike: p.getProperty('PRODUTO_SLUG_LIKE') || DEFAULTS.PRODUTO_SLUG_LIKE,
    desde:    p.getProperty('CREATED_AT_GTE') || DEFAULTS.CREATED_AT_GTE,
    key:      p.getProperty('SUPABASE_PUBLISHABLE_KEY'),
    email:    p.getProperty('SUPABASE_AUTH_EMAIL'),
    password: p.getProperty('SUPABASE_AUTH_PASSWORD')
  };

  if (!cfg.key || !cfg.email || !cfg.password) {
    throw new Error('Segredos do Supabase ausentes. Defina SUPABASE_PUBLISHABLE_KEY, ' +
                    'SUPABASE_AUTH_EMAIL e SUPABASE_AUTH_PASSWORD em Script Properties.');
  }

  // ilike usa "*" como coringa; o config guarda o padrao com "%".
  var slugFilter = encodeURIComponent(cfg.slugLike.replace(/%/g, '*'));
  var path = '/rest/v1/' + cfg.tabela +
             '?type=eq.order_success' +
             '&select=price,pmp,created_at,slug,id' +
             '&slug=ilike.' + slugFilter +
             '&created_at=gte.' + encodeURIComponent(cfg.desde);

  // 1a tentativa com o token (possivelmente em cache). Se vier 401, renova e repete.
  var resp = restGet_(cfg, path, getAccessToken_(cfg, false));
  if (resp.getResponseCode() === 401) {
    resp = restGet_(cfg, path, getAccessToken_(cfg, true));
  }

  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase REST erro ' + code + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText() || '[]');
}

// GET autenticado na REST do Supabase (apikey publishable + Bearer da sessao).
function restGet_(cfg, path, token) {
  return UrlFetchApp.fetch(cfg.url + path, {
    method: 'get',
    headers: {
      apikey: cfg.key,
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  });
}

// Faz login (grant_type=password) e devolve o access_token, cacheando-o para
// nao logar a cada poll. forceRefresh ignora o cache (usado apos um 401).
function getAccessToken_(cfg, forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('sb_access_token');
    if (cached) return cached;
  }

  var resp = UrlFetchApp.fetch(cfg.url + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.key },
    payload: JSON.stringify({ email: cfg.email, password: cfg.password }),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var body = {};
  try { body = JSON.parse(resp.getContentText() || '{}'); } catch (e) {}

  if (code < 200 || code >= 300 || !body.access_token) {
    var msg = body.error_description || body.msg || body.error || resp.getContentText();
    throw new Error('Falha no login Supabase (' + code + '): ' + msg);
  }

  // Cache no maximo ~6h (limite do CacheService) e com margem antes do expirar.
  var expires = Number(body.expires_in || 3600);
  var ttl = Math.max(60, Math.min(expires - 120, 21600));
  cache.put('sb_access_token', body.access_token, ttl);
  return body.access_token;
}

// ===== UTILITARIO OPCIONAL =====
// Preencha os valores, rode UMA vez no editor, e depois apague os valores daqui.
function setSecrets_() {
  PropertiesService.getScriptProperties().setProperties({
    SUPABASE_PUBLISHABLE_KEY: '',
    SUPABASE_AUTH_EMAIL: '',
    SUPABASE_AUTH_PASSWORD: ''
    // , SUPABASE_URL: '', SUPABASE_TABELA: '', PRODUTO_SLUG_LIKE: '%legado%'
  });
}
