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
 * ===========================================================================
 *  AUTENTICACAO (apos o Supabase ativar CAPTCHA no Auth)
 * ===========================================================================
 * O Supabase passou a exigir CAPTCHA nos endpoints de Auth (signup, login
 * email+senha, OTP, recover). Isso quebrou o login automatico (grant_type=
 * password) que esta versao usava. Como TODA a chamada ao Supabase acontece
 * aqui no servidor, a solucao recomendada NAO usa login nenhum.
 *
 * IMPORTANTE — qual chave usar a partir do Apps Script:
 *   - A chave NOVA `sb_secret_...` NAO funciona aqui. O Supabase bloqueia secret
 *     keys novas quando o `User-Agent` parece navegador (responde 401
 *     "Forbidden use of secret API key in browser"), e o UrlFetchApp do Apps
 *     Script manda um User-Agent "Mozilla/5.0..." que nao da para sobrescrever.
 *   - Use a `service_role` LEGADA (JWT no formato `eyJ...`), em
 *     Settings > API Keys > aba "Legacy API keys". Ela mapeia para o papel
 *     `service_role`, ignora o RLS, nao expira e NAO tem o bloqueio por
 *     User-Agent. Vai no header `apikey`.
 *   - Alternativa com RLS preservado (Opcao B): publishable key (`sb_publishable_...`)
 *     no header `apikey` + um JWT de usuario/role no `Authorization: Bearer`. O JWT
 *     pode ser ASSINADO PELO PROPRIO SERVIDOR a partir do JWT Secret do projeto
 *     (`SUPABASE_JWT_SECRET`), que o `Code.gs` renova sozinho a cada ~50min — sem
 *     login, sem CAPTCHA, sem token estatico para gerenciar.
 *
 * Qualquer chave/JWT acima e verificada SEM login, entao nenhuma passa por CAPTCHA.
 * Tudo fica SO em Script Properties — NUNCA neste arquivo nem versionado.
 *
 * Ordem de autenticacao (a 1a que estiver configurada vence):
 *   1) SUPABASE_SERVICE_ROLE_KEY -> header apikey (service_role legada). Ignora RLS.
 *      (compat: tambem aceita o valor em SUPABASE_SECRET_KEY)
 *   2) SUPABASE_JWT_SECRET (+ PUBLISHABLE_KEY) -> servidor assina o JWT (HS256) e
 *      renova sozinho. MANTEM o RLS (claim role, default `authenticated`). Opcao B.
 *   3) SUPABASE_ACCESS_TOKEN     -> JWT longo estatico no Authorization Bearer +
 *                                   publishable key no apikey. Mantem o RLS.
 *   4) Login legado email+senha (getAccessToken_) -> SUJEITO A CAPTCHA, tende a
 *                                   falhar. Mantido so como fallback de transicao.
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
 * SEGREDOS (Project Settings > Script Properties):
 *   SUPABASE_SERVICE_ROLE_KEY (Opcao A)  -> service_role legada `eyJ...` (header apikey, ignora RLS)
 *   SUPABASE_JWT_SECRET       (Opcao B)  -> JWT Secret do projeto; servidor assina o token (Bearer)
 *   SUPABASE_PUBLISHABLE_KEY  (Opcao B)  -> publishable `sb_publishable_...` (header apikey)
 *   SUPABASE_JWT_ROLE         (opcional) -> papel no JWT assinado (default: authenticated)
 *   SUPABASE_JWT_SUB          (opcional) -> uuid do usuario, se a RLS usa auth.uid()
 *   SUPABASE_ACCESS_TOKEN     (opcional) -> JWT longo estatico (Authorization Bearer)
 *   SUPABASE_AUTH_EMAIL       (legado)   -> e-mail do login email+senha (modo 4)
 *   SUPABASE_AUTH_PASSWORD    (legado)   -> senha do login email+senha (modo 4)
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
// Roteamento por parametro de URL:
//   ...exec               -> Copa (bracket, layouts por fase)
//   ...exec?view=ranking  -> Ranking Geral do Lancamento (tabela + podio)
// Ambas usam o mesmo getTransactions() (mesmos segredos / mesma fonte).
function doGet(e) {
  var view = (e && e.parameter && e.parameter.view) || '';
  var isRanking = (view === 'ranking');
  var file  = isRanking ? 'RankingIndex' : 'Index';
  var title = isRanking ? 'Ranking Geral do Lançamento' : 'Copa do Mundo: O Legado';

  return HtmlService.createTemplateFromFile(file)
    .evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Permite montar a pagina a partir de varios arquivos HTML.
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Le e normaliza a config de Script Properties (reutilizado pelo diagnostico).
function lerConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    url:            p.getProperty('SUPABASE_URL') || DEFAULTS.SUPABASE_URL,
    tabela:         p.getProperty('SUPABASE_TABELA') || DEFAULTS.SUPABASE_TABELA,
    slugLike:       p.getProperty('PRODUTO_SLUG_LIKE') || DEFAULTS.PRODUTO_SLUG_LIKE,
    desde:          p.getProperty('CREATED_AT_GTE') || DEFAULTS.CREATED_AT_GTE,
    // service_role legada (eyJ...). Aceita o nome antigo SUPABASE_SECRET_KEY por compat.
    serviceKey:     p.getProperty('SUPABASE_SERVICE_ROLE_KEY') || p.getProperty('SUPABASE_SECRET_KEY'),
    publishableKey: p.getProperty('SUPABASE_PUBLISHABLE_KEY'),
    // JWT Secret (assinatura HS256). Com ele o servidor ASSINA o proprio token e
    // renova sozinho — sem login, sem CAPTCHA, sem token estatico para gerenciar.
    jwtSecret:      p.getProperty('SUPABASE_JWT_SECRET'),
    jwtRole:        p.getProperty('SUPABASE_JWT_ROLE') || 'authenticated',
    jwtSub:         p.getProperty('SUPABASE_JWT_SUB'),   // uuid do usuario, se a RLS usa auth.uid()
    accessToken:    p.getProperty('SUPABASE_ACCESS_TOKEN'),
    email:          p.getProperty('SUPABASE_AUTH_EMAIL'),
    password:       p.getProperty('SUPABASE_AUTH_PASSWORD')
  };
}

// Resolve os headers de autenticacao do modo ativo (usado pelo diagnostico).
// Mesma ordem/regra de getTransactions(). force re-assina/re-loga ignorando cache.
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
  return { apikey: cfg.publishableKey, Authorization: 'Bearer ' + getAccessToken_(cfg, force) };
}

// ===== CONSULTA O SUPABASE (chamado pelo front via google.script.run) =====
// Retorna o array de transacoes (price, pmp, created_at, slug, id), igual ao
// formato que o app.js ja espera.
function getTransactions() {
  var cfg = lerConfig_();

  // ilike usa "*" como coringa; o config guarda o padrao com "%".
  var slugFilter = encodeURIComponent(cfg.slugLike.replace(/%/g, '*'));
  var path = '/rest/v1/' + cfg.tabela +
             '?type=eq.order_success' +
             '&select=price,pmp,created_at,slug,id' +
             '&slug=ilike.' + slugFilter +
             '&created_at=gte.' + encodeURIComponent(cfg.desde);

  // ---- MODO 1: service_role legada como apikey (sem login; ignora RLS) ----
  if (cfg.serviceKey) {
    return parseRows_(restGet_(cfg.url, path, { apikey: cfg.serviceKey }));
  }

  // ---- MODO 2 (Opcao B, mantem RLS): servidor ASSINA o JWT e renova sozinho ----
  // publishable key no apikey + JWT recem-assinado (HS256) no Bearer.
  if (cfg.jwtSecret) {
    if (!cfg.publishableKey) {
      throw new Error('SUPABASE_JWT_SECRET definido, mas falta SUPABASE_PUBLISHABLE_KEY (header apikey).');
    }
    var h = { apikey: cfg.publishableKey, Authorization: 'Bearer ' + mintJwt_(cfg, false) };
    var rr = restGet_(cfg.url, path, h);
    if (rr.getResponseCode() === 401) {
      h.Authorization = 'Bearer ' + mintJwt_(cfg, true); // re-assina ignorando o cache
      rr = restGet_(cfg.url, path, h);
    }
    return parseRows_(rr);
  }

  // ---- MODO 3: JWT longo estatico no Bearer + publishable key no apikey (mantem RLS) ----
  if (cfg.accessToken) {
    if (!cfg.publishableKey) {
      throw new Error('SUPABASE_ACCESS_TOKEN definido, mas falta SUPABASE_PUBLISHABLE_KEY (header apikey).');
    }
    return parseRows_(restGet_(cfg.url, path, {
      apikey: cfg.publishableKey,
      Authorization: 'Bearer ' + cfg.accessToken
    }));
  }

  // ---- MODO 4 (legado, sujeito a CAPTCHA): login email+senha por sessao ----
  if (!cfg.publishableKey || !cfg.email || !cfg.password) {
    throw new Error('Configure SUPABASE_JWT_SECRET + SUPABASE_PUBLISHABLE_KEY (Opcao B, mantem RLS), ' +
                    'ou SUPABASE_SERVICE_ROLE_KEY (ignora RLS), ou SUPABASE_ACCESS_TOKEN ' +
                    '+ SUPABASE_PUBLISHABLE_KEY, ou os segredos de login legado ' +
                    '(SUPABASE_PUBLISHABLE_KEY + SUPABASE_AUTH_EMAIL + SUPABASE_AUTH_PASSWORD).');
  }
  var headers = { apikey: cfg.publishableKey, Authorization: 'Bearer ' + getAccessToken_(cfg, false) };
  var resp = restGet_(cfg.url, path, headers);
  if (resp.getResponseCode() === 401) {
    headers.Authorization = 'Bearer ' + getAccessToken_(cfg, true);
    resp = restGet_(cfg.url, path, headers);
  }
  return parseRows_(resp);
}

// GET na REST do Supabase com os headers ja resolvidos pelo modo de auth.
function restGet_(url, path, headers) {
  headers = headers || {};
  headers.Accept = 'application/json';
  return UrlFetchApp.fetch(url + path, {
    method: 'get',
    headers: headers,
    muteHttpExceptions: true
  });
}

// Valida a resposta REST e devolve o array de linhas (ou lanca erro descritivo).
function parseRows_(resp) {
  var code = resp.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase REST erro ' + code + ': ' + resp.getContentText());
  }
  return JSON.parse(resp.getContentText() || '[]');
}

// LEGADO (modo 3): login (grant_type=password) -> access_token, cacheado para nao
// logar a cada poll. forceRefresh ignora o cache (usado apos um 401).
// ATENCAO: sujeito ao CAPTCHA do Supabase Auth; tende a falhar. Prefira o modo 1.
function getAccessToken_(cfg, forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('sb_access_token');
    if (cached) return cached;
  }

  var resp = UrlFetchApp.fetch(cfg.url + '/auth/v1/token?grant_type=password', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: cfg.publishableKey },
    payload: JSON.stringify({ email: cfg.email, password: cfg.password }),
    muteHttpExceptions: true
  });

  var code = resp.getResponseCode();
  var body = {};
  try { body = JSON.parse(resp.getContentText() || '{}'); } catch (e) {}

  if (code < 200 || code >= 300 || !body.access_token) {
    var msg = body.error_description || body.msg || body.error || resp.getContentText();
    throw new Error('Falha no login Supabase (' + code + '): ' + msg +
                    ' — dica: o login email+senha agora exige CAPTCHA. Configure ' +
                    'SUPABASE_SERVICE_ROLE_KEY em Script Properties (modo recomendado).');
  }

  // Cache no maximo ~6h (limite do CacheService) e com margem antes do expirar.
  var expires = Number(body.expires_in || 3600);
  var ttl = Math.max(60, Math.min(expires - 120, 21600));
  cache.put('sb_access_token', body.access_token, ttl);
  return body.access_token;
}

// MODO 2 (Opcao B): assina um JWT HS256 com o JWT Secret do projeto e o cacheia.
// O token vale 1h; o cache guarda por 50min, entao o servidor RE-ASSINA sozinho
// ~10min antes de vencer. Nao ha login (logo, sem CAPTCHA) nem token estatico.
// forceRefresh ignora o cache (usado apos um 401). Respeita o RLS pelo claim role.
function mintJwt_(cfg, forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('sb_minted_jwt');
    if (cached) return cached;
  }

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'HS256', typ: 'JWT' };
  var payload = {
    iss: 'supabase',
    role: cfg.jwtRole,        // 'authenticated' por padrao (RLS aplica esse papel)
    iat: now,
    exp: now + 3600           // 1h de validade do token
  };
  if (cfg.jwtSub) {           // necessario se a policy de RLS usa auth.uid()
    payload.sub = cfg.jwtSub;
    payload.aud = 'authenticated';
  }

  var b64 = function (obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  };
  var signingInput = b64(header) + '.' + b64(payload);
  var sigBytes = Utilities.computeHmacSha256Signature(signingInput, cfg.jwtSecret);
  var sig = Utilities.base64EncodeWebSafe(sigBytes).replace(/=+$/, '');
  var token = signingInput + '.' + sig;

  cache.put('sb_minted_jwt', token, 3000); // 50min: re-assina sozinho ao expirar o cache
  return token;
}

// ===== UTILITARIO OPCIONAL =====
// Preencha o valor, rode UMA vez no editor, e depois APAGUE o valor daqui.
// (NUNCA versionar a chave: o Supabase revoga chaves achadas em repo publico.)
function setSecrets_() {
  PropertiesService.getScriptProperties().setProperties({
    // OPCAO B (mantem RLS): JWT Secret do projeto (Settings > API > JWT Settings).
    // O servidor assina e renova o token sozinho. Precisa tambem da publishable key.
    SUPABASE_JWT_SECRET: '',
    SUPABASE_PUBLISHABLE_KEY: ''
    // SUPABASE_JWT_SUB: ''   // uuid do usuario, so se a policy de RLS usa auth.uid()

    // OPCAO A (ignora RLS): service_role LEGADA (eyJ...), aba "Legacy API keys".
    // NAO use a sb_secret_ nova aqui: o Apps Script e bloqueado por User-Agent.
    // SUPABASE_SERVICE_ROLE_KEY: ''
  });
}

// ===== DIAGNOSTICO =====
// Selecione esta funcao no editor e clique em Executar. O resultado aparece no
// "Registro de execucao". NAO imprime as chaves inteiras (so prefixo/tamanho).
function diagSupabase() {
  var cfg = lerConfig_();

  var mask = function (s) {
    if (!s) return '(vazio)';
    return s.slice(0, 12) + '… (len ' + s.length + ')';
  };
  Logger.log('URL: %s', cfg.url);
  Logger.log('TABELA: %s', cfg.tabela);
  Logger.log('FILTRO: slug ilike "%s"  E  created_at >= %s', cfg.slugLike, cfg.desde);
  Logger.log('SERVICE_ROLE_KEY (ou SECRET_KEY): %s', mask(cfg.serviceKey));
  Logger.log('PUBLISHABLE_KEY: %s', mask(cfg.publishableKey));
  Logger.log('JWT_SECRET: %s  (role=%s, sub=%s)', mask(cfg.jwtSecret), cfg.jwtRole, cfg.jwtSub || '(nenhum)');
  Logger.log('ACCESS_TOKEN: %s', mask(cfg.accessToken));
  Logger.log('Modo de auth que sera usado: %s',
             cfg.serviceKey   ? '1 (service_role / apikey, ignora RLS)' :
             cfg.jwtSecret    ? '2 (JWT assinado no servidor, mantem RLS)' :
             cfg.accessToken  ? '3 (JWT longo estatico)' : '4 (login legado — CAPTCHA)');

  // Avisa se a chave for uma sb_secret_ nova (nao funciona via Apps Script).
  if (cfg.serviceKey && cfg.serviceKey.indexOf('sb_secret_') === 0) {
    Logger.log('ATENCAO: a chave comeca com "sb_secret_" (secret key NOVA). Ela e ' +
               'bloqueada no Apps Script (erro "Forbidden use of secret API key in ' +
               'browser"). Use a service_role LEGADA (formato eyJ...).');
  }

  var headers;
  try {
    headers = resolveAuthHeaders_(cfg, true);
    headers.Accept = 'application/json';
  } catch (e) {
    Logger.log('Erro ao resolver autenticacao: %s', e && e.message ? e.message : e);
    return;
  }
  var base = cfg.url + '/rest/v1/' + cfg.tabela;
  var get = function (qs) {
    return UrlFetchApp.fetch(base + qs, { method: 'get', headers: headers, muteHttpExceptions: true });
  };

  // A) Leitura crua, SEM nenhum filtro. Diz se a auth/RLS deixa ler a tabela.
  var a = get('?select=pmp,slug,price,created_at&limit=3');
  Logger.log('--- A) leitura SEM filtro (limit=3) --- HTTP %s', a.getResponseCode());
  Logger.log('Body: %s', a.getContentText().slice(0, 700));
  if (a.getResponseCode() === 200 && (a.getContentText() || '').trim() === '[]') {
    Logger.log('>>> A veio VAZIA: a RLS nao deixa este papel ("%s") ler a tabela. ' +
               'Defina SUPABASE_JWT_SUB com o uuid do usuario certo, ajuste a policy ' +
               'de SELECT, ou use a service_role (Opcao A).', cfg.jwtRole);
  }

  // B) order_success no periodo, SEM filtro de slug -> quais slugs existem de fato?
  var b = get('?type=eq.order_success&created_at=gte.' + encodeURIComponent(cfg.desde) + '&select=slug&limit=100');
  Logger.log('--- B) order_success desde %s, SEM filtro de slug --- HTTP %s', cfg.desde, b.getResponseCode());
  try {
    var rb = JSON.parse(b.getContentText() || '[]');
    var slugs = {};
    rb.forEach(function (r) { var s = r.slug || '(null)'; slugs[s] = (slugs[s] || 0) + 1; });
    Logger.log('Linhas: %s | slugs distintos presentes: %s', rb.length, JSON.stringify(slugs));
    Logger.log('>>> Se nenhum slug acima contem "%s", o filtro de produto esta errado ' +
               '(ajuste PRODUTO_SLUG_LIKE em Script Properties).', cfg.slugLike.replace(/%/g, ''));
  } catch (e) {
    Logger.log('Body: %s', b.getContentText().slice(0, 700));
  }

  // C) Consulta REAL do dashboard (via getTransactions()).
  try {
    var rows = getTransactions();
    Logger.log('--- C) getTransactions() OK: %s linhas ---', rows.length);
    Logger.log('Amostra: %s', JSON.stringify(rows.slice(0, 2)));
  } catch (e) {
    Logger.log('--- C) getTransactions() LANCOU ERRO ---');
    Logger.log(e && e.message ? e.message : e);
  }
}
