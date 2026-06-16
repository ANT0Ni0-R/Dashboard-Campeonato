// app.js - Motor de cálculo, controle de estados e renderização do Dashboard Copa

let transactions = [];
let simulatedDate = null;
let testMode = false;          // Modo Teste: últimos 30 dias, sem filtro de produto
let pollInterval = null;
let activePhaseId = "grupos";
let syncCount = 0;
let lastSyncTime = null;
let nextSyncTime = null;
let syncCountdownInterval = null;

// Inicialização da aplicação
window.addEventListener("DOMContentLoaded", () => {
  initSimulador();
  startPolling();
  updateDashboard();
  window.addEventListener("resize", fitBracket);
  setInterval(() => {
    const phase = COMPETICAO.fases[activePhaseId];
    if (phase) updateTimer(phase);
    updateSyncCountdown();
  }, 1000);
  // Preenche o intervalo configurado na barra
  const el = document.getElementById("sync-intervalo");
  if (el) el.textContent = COMPETICAO.supabase.poll_segundos + "s";
});

// Inicialização do Painel de Simulação (Controlador de Relógio)
function initSimulador() {
  const simPanel = document.createElement("div");
  simPanel.className = "simulador-panel";
  simPanel.innerHTML = `
    <div class="sim-header">Simulador de Copa (Clique para testar fases)</div>
    <div class="sim-buttons">
      <button class="sim-btn active" data-time="real">Relógio Real</button>
      <button class="sim-btn" data-time="2026-06-16T10:00:00-03:00">Grupos (Ter)</button>
      <button class="sim-btn" data-time="2026-06-19T15:00:00-03:00">Dia da Copa (Sex)</button>
      <button class="sim-btn" data-time="2026-06-21T15:00:00-03:00">Quartas (Dom)</button>
      <button class="sim-btn" data-time="2026-06-22T15:00:00-03:00">Semis (Seg)</button>
      <button class="sim-btn" data-time="2026-06-23T18:00:00-03:00">Final (Ter)</button>
      <button class="sim-btn test" data-test="1">🧪 Modo Teste (30d)</button>
    </div>
  `;
  document.body.appendChild(simPanel);

  // Adiciona estilos inline rápidos para o simulador
  const style = document.createElement("style");
  style.textContent = `
    .simulador-panel {
      position: fixed;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%) translateY(85%);
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: 12px 12px 0 0;
      padding: 8px 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 -5px 25px rgba(0, 0, 0, 0.5);
    }
    .simulador-panel:hover {
      transform: translateX(-50%) translateY(0);
    }
    .sim-header {
      font-family: 'Outfit', sans-serif;
      font-size: 0.75rem;
      font-weight: 700;
      color: #fbbf24;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .sim-buttons {
      display: flex;
      gap: 6px;
    }
    .sim-btn {
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.7rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .sim-btn:hover {
      background: rgba(251, 191, 36, 0.15);
      color: #fff;
    }
    .sim-btn.active {
      background: #fbbf24;
      border-color: #fbbf24;
      color: #060913;
    }
    .sim-btn.test {
      border-color: rgba(96, 165, 250, 0.5);
      color: #93c5fd;
    }
    .sim-btn.test:hover {
      background: rgba(59, 130, 246, 0.2);
      color: #fff;
    }
    .sim-btn.test.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: #fff;
    }
  `;
  document.head.appendChild(style);

  // Bind de cliques no painel
  simPanel.querySelectorAll(".sim-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      simPanel.querySelectorAll(".sim-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (btn.hasAttribute("data-test")) {
        // Modo Teste: abre a tela do Dia da Copa (mais rica visualmente) e puxa 30 dias reais
        testMode = true;
        simulatedDate = new Date("2026-06-19T15:00:00-03:00");
      } else {
        testMode = false;
        const timeVal = btn.getAttribute("data-time");
        simulatedDate = (timeVal === "real") ? null : new Date(timeVal);
      }
      forcarAtualizacao();
    });
  });
}

// Retorna o Date atual (real ou simulado)
function getNow() {
  return simulatedDate ? new Date(simulatedDate) : new Date();
}

// Configura o Polling periódico
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  const ms = COMPETICAO.supabase.poll_segundos * 1000;
  pollInterval = setInterval(updateDashboard, ms);
}

/// Core: Processo de atualização do Dashboard
async function updateDashboard() {
  showLoading(true);
  try {
    activePhaseId = determineActivePhase();
    await fetchTransactions();
    // Congelamento diario: durante a janela, considera apenas vendas ate o horario de corte.
    const fz = getCongelamento(getNow());
    const txns = fz.congelado
      ? transactions.filter(t => parseDate(t.created_at).getTime() <= fz.cutoffMs)
      : transactions;
    const resultados = calcularResultados(txns);
    renderDashboard(resultados);
    toggleCongeladoBanner(fz);
    showStatusDot("success");
    // Registra sincronização bem-sucedida
    syncCount++;
    lastSyncTime = new Date();
    nextSyncTime = new Date(lastSyncTime.getTime() + COMPETICAO.supabase.poll_segundos * 1000);
    updateSyncBar();
  } catch (err) {
    console.error("Erro na atualização do dashboard:", err);
    showStatusDot("error");
  } finally {
    showLoading(false);
  }
}

// Forçar atualização manual (chamado pelo botão na sync-bar)
async function forcarAtualizacao() {
  const btn = document.querySelector(".sync-force-btn");
  if (btn) btn.classList.add("loading");
  // Reinicia o timer do polling
  startPolling();
  await updateDashboard();
  if (btn) btn.classList.remove("loading");
}

function updateSyncBar() {
  const countEl = document.getElementById("sync-count");
  const ultimaEl = document.getElementById("sync-ultima");
  if (countEl) countEl.textContent = syncCount;
  if (ultimaEl && lastSyncTime) {
    ultimaEl.textContent = lastSyncTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
}

function updateSyncCountdown() {
  const el = document.getElementById("sync-countdown");
  if (!el || !nextSyncTime) return;
  const secsLeft = Math.max(0, Math.round((nextSyncTime - Date.now()) / 1000));
  el.textContent = secsLeft + "s";
}

// Determina qual fase da competição está ativa
function determineActivePhase() {
  if (COMPETICAO.fase_ativa_override) {
    return COMPETICAO.fase_ativa_override;
  }
  const nowMs = getNow().getTime();

  // Ordena fases cronologicamente por data de início
  const faseIds = Object.keys(COMPETICAO.fases);

  // Verifica se estamos em alguma janela
  for (let id of faseIds) {
    const inicioMs = parseDate(COMPETICAO.fases[id].inicio).getTime();
    const fimMs = parseDate(COMPETICAO.fases[id].fim).getTime();
    if (nowMs >= inicioMs && nowMs <= fimMs) {
      return id;
    }
  }

  // Gaps entre fases ou fora da competição
  const gruposInicio = parseDate(COMPETICAO.fases.grupos.inicio).getTime();
  if (nowMs < gruposInicio) {
    return "grupos"; // Antes de começar, exibe grupos
  }

  // Pós-competição: exibe a Final
  return "final";
}

// Converte string de data ISO com offset para Date robustamente
function parseDate(dateStr) {
  let cleaned = dateStr.trim();
  if (cleaned.includes(' ') && !cleaned.includes('T')) {
    cleaned = cleaned.replace(' ', 'T');
  }
  const hasOffset = /Z|[+-]\d{2}(:?\d{2})?$/.test(cleaned);
  if (!hasOffset) {
    cleaned += "-03:00"; // Assume America/Sao_Paulo (GMT-3)
  }
  return new Date(cleaned);
}

// True quando estamos na sub-janela da Sexta (Dia da Copa) dentro da fase de grupos
function isCopaDay() {
  const dc = COMPETICAO.fases.grupos.dia_copa;
  if (!dc) return false;
  const nowMs = getNow().getTime();
  return nowMs >= parseDate(dc.inicio).getTime() && nowMs <= parseDate(dc.fim).getTime();
}

// Congelamento diario (apuracao para premiacao diaria). Retorna { congelado, cutoffMs, horaStr }.
// Durante a janela [corte, 23:59:59] o placar exibe o snapshot acumulado ate o horario de corte.
// Fora da janela nao ha corte, entao as vendas do periodo congelado voltam a contar apos 00:00.
// Assume que a maquina (TV) roda em America/Sao_Paulo, mesma premissa do restante do app.
function getCongelamento(now) {
  const cfg = COMPETICAO.congelamento;
  if (!cfg || !cfg.ativo || testMode) return { congelado: false, cutoffMs: null, horaStr: null };
  const horaStr = isCopaDay() ? cfg.hora_dia_copa : cfg.hora_padrao;
  const [h, m] = horaStr.split(":").map(Number);
  const cutoff = new Date(now); cutoff.setHours(h, m, 0, 0);
  const fimDia = new Date(now); fimDia.setHours(23, 59, 59, 999);
  const nowMs = now.getTime();
  const congelado = nowMs >= cutoff.getTime() && nowMs <= fimDia.getTime();
  return { congelado, cutoffMs: cutoff.getTime(), horaStr };
}

// Executa requisição REST ao Supabase ou lê JSON local como fallback
async function fetchTransactions() {
  const hasSupabase = COMPETICAO.supabase.url && COMPETICAO.supabase.anon_key &&
                      !COMPETICAO.supabase.url.includes("[A DEFINIR]");

  if (hasSupabase) {
    try {
      const base = `${COMPETICAO.supabase.url}/rest/v1/${COMPETICAO.supabase.tabela}` +
                   `?type=eq.order_success&select=price,pmp,created_at,slug`;
      let url;
      if (testMode) {
        // Últimos N dias, SEM filtro de produto (valida integração + visualização)
        const dias = (COMPETICAO.modo_teste && COMPETICAO.modo_teste.dias) || 30;
        const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
        url = `${base}&created_at=gte.${desde}`;
      } else {
        // Produção: filtra a coluna `slug` por "%legado%" (case-insensitive via ilike)
        const padrao = encodeURIComponent(COMPETICAO.produto.slug_like.replace(/%/g, "*"));
        url = `${base}&slug=ilike.${padrao}&created_at=gte.2026-06-16T00:00:00-03:00`;
      }
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          apikey: COMPETICAO.supabase.anon_key,
          Authorization: `Bearer ${COMPETICAO.supabase.anon_key}`
        }
      });
      if (resp.ok) {
        transactions = await resp.json();
        return;
      }
      console.warn("Supabase retornou erro HTTP:", resp.status);
    } catch (e) {
      console.warn("Falha ao consultar o Supabase REST API (CORS ou Conexão). Usando dados locais como fallback.", e);
    }
  }

  // Fallback para arquivo JSON local de exemplo
  try {
    const resp = await fetch("db_transactions_events_rows.json");
    if (!resp.ok) throw new Error(`Status: ${resp.status}`);
    const localData = await resp.json();

    // Normaliza datas deslocando-as 154 dias para frente para bater com as datas da competição em Junho
    // Ex: Jan 13 (Terça) -> Jun 16 (Terça)
    const OFFSET_MS = 154 * 24 * 60 * 60 * 1000;

    transactions = localData
      .filter(t => t.type === "order_success")
      .map(t => {
        let originalTime = parseDate(t.created_at).getTime();
        let normalizedTime = new Date(originalTime + OFFSET_MS);
        return {
          price: t.price,
          pmp: t.pmp,
          created_at: normalizedTime.toISOString()
        };
      });
  } catch (err) {
    console.error("Não foi possível carregar o JSON local de backup:", err);
    transactions = [];
  }
}

// Aplica a régua multiplicadora de GMV sobre o preço
function calcularGMV(price) {
  if (!price) return 0;
  const regua = COMPETICAO.produto.regua;
  for (let faixa of regua) {
    if (faixa.ate === null || price < faixa.ate) {
      return price * faixa.mult;
    }
  }
  return price;
}

// Calcula todos os GMVs e simula o avanço do chaveamento de forma determinística
function calcularResultados(transactionList) {
  // 1. Inicializa vendedores
  const closers = {};
  Object.keys(COMPETICAO.vendedores).forEach(code => {
    closers[code] = {
      code: code,
      nome: COMPETICAO.vendedores[code].nome,
      selecao: COMPETICAO.vendedores[code].selecao,
      foto: COMPETICAO.vendedores[code].foto,
      bandeira: COMPETICAO.vendedores[code].bandeira,
      gmv_grupos: 0,
      gmv_copa: 0,     // Sexta (Dia da Copa) — competição pontual do dia
      gmv_quartas: 0,
      gmv_semis: 0,
      gmv_final: 0,
      eliminado: false
    };
  });

  const f = COMPETICAO.fases;
  const dc = f.grupos.dia_copa;
  const gruposIni = parseDate(f.grupos.inicio).getTime();
  const gruposFim = parseDate(f.grupos.fim).getTime();
  const copaIni = dc ? parseDate(dc.inicio).getTime() : 0;
  const copaFim = dc ? parseDate(dc.fim).getTime() : 0;
  const quartasIni = parseDate(f.quartas.inicio).getTime();
  const quartasFimW = parseDate(f.quartas.fim).getTime();
  const semisIni = parseDate(f.semis.inicio).getTime();
  const semisFimW = parseDate(f.semis.fim).getTime();
  const finalIni = parseDate(f.final.inicio).getTime();
  const finalFimW = parseDate(f.final.fim).getTime();

  // 2. Distribui e calcula o GMV de cada transação nas fases
  transactionList.forEach(t => {
    if (!t.pmp) return;
    // seller_code = split_part(pmp, '-', -1)
    const segments = t.pmp.split('-');
    const seller_code = segments[segments.length - 1].toUpperCase();

    // Vendedor válido apenas se possui 3 letras e está no cadastro
    if (seller_code.length !== 3 || !closers[seller_code]) return;

    const gmv = calcularGMV(t.price);
    const c = closers[seller_code];

    // MODO TESTE: ignora as datas e ilumina todos os buckets com o GMV real
    if (testMode) {
      c.gmv_grupos += gmv;
      c.gmv_copa += gmv;
      c.gmv_quartas += gmv;
      c.gmv_semis += gmv;
      c.gmv_final += gmv;
      return;
    }

    const timeMs = parseDate(t.created_at).getTime();

    // Associa o GMV ao período correto. A Sexta soma DUPLO: nos grupos (acumulado)
    // e na competição pontual do Dia da Copa.
    if (timeMs >= gruposIni && timeMs <= gruposFim) {
      c.gmv_grupos += gmv;
      if (dc && timeMs >= copaIni && timeMs <= copaFim) c.gmv_copa += gmv;
    } else if (timeMs >= quartasIni && timeMs <= quartasFimW) {
      c.gmv_quartas += gmv;
    } else if (timeMs >= semisIni && timeMs <= semisFimW) {
      c.gmv_semis += gmv;
    } else if (timeMs >= finalIni && timeMs <= finalFimW) {
      c.gmv_final += gmv;
    }
  });

  const nowMs = getNow().getTime();
  const gruposEndMs = gruposFim;
  const quartasEndMs = quartasFimW;
  const semisEndMs = semisFimW;
  const finalEndMs = finalFimW;

  // 3. FASE DE GRUPOS E REPESCAGEM
  const standingGrupos = {};
  const dePassagem = []; // perdedores de cada grupo que caem para repescagem

  COMPETICAO.fases.grupos.grupos.forEach(g => {
    // Ordena membros do grupo por gmv_grupos desc
    const sorted = g.membros.map(c => closers[c]).sort((a, b) => b.gmv_grupos - a.gmv_grupos);
    standingGrupos[g.nome] = sorted;

    // Classificados diretos
    for (let i = 0; i < g.avancam; i++) {
      if (sorted[i]) {
        sorted[i].posicao_grupo = i + 1;
      }
    }
    // Cai para repescagem (os membros abaixo do teto de avanço)
    for (let i = g.avancam; i < sorted.length; i++) {
      if (sorted[i]) {
        dePassagem.push(sorted[i]);
      }
    }
  });

  // Repescagem: O melhor (1) dos que caíram sobe
  const sortedRepescagem = dePassagem.sort((a, b) => b.gmv_grupos - a.gmv_grupos);
  const repEscudo = sortedRepescagem[0]; // Vencedor da repescagem

  // Lista dos 8 classificados finais para as Quartas
  // Ordem deterministicamente solicitada: 1ºA, 2ºA, 1ºB, 2ºB, 1ºC, 2ºC, 1ºD, REP
  const qA1 = standingGrupos["Grupo A"][0];
  const qA2 = standingGrupos["Grupo A"][1];
  const qB1 = standingGrupos["Grupo B"][0];
  const qB2 = standingGrupos["Grupo B"][1];
  const qC1 = standingGrupos["Grupo C"][0];
  const qC2 = standingGrupos["Grupo C"][1];
  const qD1 = standingGrupos["Grupo D"][0];

  const classificadosQF = [
    qA1, qA2, qB1, qB2, qC1, qC2, qD1, repEscudo
  ];

  // Se a fase de grupos já acabou, os demais vendedores que não estão na lista são eliminados
  if (nowMs > gruposEndMs) {
    Object.keys(closers).forEach(code => {
      const c = closers[code];
      const classificado = classificadosQF.find(q => q && q.code === c.code);
      if (!classificado) {
        c.eliminado = true;
      }
    });
  }

  // 4. QUARTAS DE FINAL
  // QF1: 1ºA x 2ºB, QF2: 1ºB x 2ºA, QF3: 1ºC x 1ºD, QF4: REP x 2ºC
  const confrontosQF = [
    { id: "QF1", label: "QF 1", c1: qA1, c2: qB2 },
    { id: "QF2", label: "QF 2", c1: qB1, c2: qA2 },
    { id: "QF3", label: "QF 3", c1: qC1, c2: qD1 },
    { id: "QF4", label: "QF 4", c1: repEscudo, c2: qC2 }
  ];

  // Calcula vencedores das Quartas
  confrontosQF.forEach(qf => {
    qf.vencedor = null;
    if (!qf.c1 || !qf.c2) return;

    const g1 = qf.c1.gmv_quartas;
    const g2 = qf.c2.gmv_quartas;

    if (g1 > g2) {
      qf.vencedor = qf.c1;
    } else if (g2 > g1) {
      qf.vencedor = qf.c2;
    } else {
      // Desempate: quem teve maior receita no grupos
      qf.vencedor = qf.c1.gmv_grupos >= qf.c2.gmv_grupos ? qf.c1 : qf.c2;
    }

    if (nowMs > quartasEndMs) {
      // Elimina o perdedor das QF
      const perdedor = qf.vencedor.code === qf.c1.code ? qf.c2 : qf.c1;
      perdedor.eliminado = true;
    }
  });

  const vQF1 = confrontosQF[0].vencedor;
  const vQF2 = confrontosQF[1].vencedor;
  const vQF3 = confrontosQF[2].vencedor;
  const vQF4 = confrontosQF[3].vencedor;

  // 5. SEMIFINAIS
  // SF1: Venc(QF1) x Venc(QF2), SF2: Venc(QF3) x Venc(QF4)
  const confrontosSF = [
    { id: "SF1", label: "Semi 1", c1: vQF1, c2: vQF2 },
    { id: "SF2", label: "Semi 2", c1: vQF3, c2: vQF4 }
  ];

  confrontosSF.forEach(sf => {
    sf.vencedor = null;
    if (!sf.c1 || !sf.c2) return;

    const g1 = sf.c1.gmv_semis;
    const g2 = sf.c2.gmv_semis;

    if (g1 > g2) {
      sf.vencedor = sf.c1;
    } else if (g2 > g1) {
      sf.vencedor = sf.c2;
    } else {
      // Desempate: quem teve maior receita na fase de Quartas
      sf.vencedor = sf.c1.gmv_quartas >= sf.c2.gmv_quartas ? sf.c1 : sf.c2;
    }

    if (nowMs > semisEndMs) {
      // Elimina o perdedor das semis
      const perdedor = sf.vencedor.code === sf.c1.code ? sf.c2 : sf.c1;
      perdedor.eliminado = true;
    }
  });

  const vSF1 = confrontosSF[0].vencedor;
  const vSF2 = confrontosSF[1].vencedor;

  // 6. FINAL
  const confrontoFinal = { id: "F1", label: "Grande Final", c1: vSF1, c2: vSF2, vencedor: null };
  if (vSF1 && vSF2) {
    const g1 = vSF1.gmv_final;
    const g2 = vSF2.gmv_final;

    if (g1 > g2) {
      confrontoFinal.vencedor = vSF1;
    } else if (g2 > g1) {
      confrontoFinal.vencedor = vSF2;
    } else {
      // Desempate: quem teve maior receita nas semis
      confrontoFinal.vencedor = vSF1.gmv_semis >= vSF2.gmv_semis ? vSF1 : vSF2;
    }

    if (nowMs > finalEndMs) {
      // Elimina o perdedor da final
      const perdedor = confrontoFinal.vencedor.code === vSF1.code ? vSF2 : vSF1;
      perdedor.eliminado = true;
    }
  }

  return {
    closers,
    grupos: standingGrupos,
    repescagem: sortedRepescagem,
    quartas: confrontosQF,
    semis: confrontosSF,
    final: confrontoFinal,
    campeao: nowMs > finalEndMs ? confrontoFinal.vencedor : null
  };
}

// Formata valores numéricos para Real BRL
function formatCurrency(val) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
}

// Renderiza a interface baseada na fase de competição ativa
function renderDashboard(res) {
  // Atualiza metadados do cabeçalho
  const currentPhase = COMPETICAO.fases[activePhaseId];
  const copa = isCopaDay();
  let faseNome = copa ? "Dia da Copa (Sexta)" : translatePhaseName(activePhaseId);
  if (testMode) faseNome = "🧪 Modo Teste · " + faseNome;
  document.getElementById("fase-nome").textContent = faseNome;
  document.getElementById("product-name").textContent =
    testMode ? "TESTE · 30 dias" : COMPETICAO.produto.slug_like.replace(/%/g, "");

  // Atualiza cronômetro regressivo
  updateTimer(currentPhase);

  const container = document.getElementById("dashboard-body");
  container.innerHTML = "";

  const copaView = (activePhaseId === "grupos" && copa);
  // Marca a view atual para escopar o CSS (header compacto e destaque de fase no chaveamento)
  document.body.classList.toggle("view-copa", copaView);
  document.body.classList.toggle("view-bracket", !copaView);

  if (copaView) {
    // Sexta = Dia da Copa: tela dividida (grupos à esquerda, todos-contra-todos à direita)
    renderCopaDay(container, res);
  } else {
    // Demais dias: chaveamento completo
    renderBracket(container, res);
  }
}

// Mostra/oculta o banner de "resultado congelado" (apuracao diaria) no header.
function toggleCongeladoBanner(fz) {
  const banner = document.getElementById("congelado-banner");
  if (!banner) return;
  if (fz && fz.congelado) {
    const sub = document.getElementById("congelado-sub");
    if (sub) sub.textContent = `Apuração diária · snapshot ${fz.horaStr}`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

// Traduz o ID da fase para um nome amigável de exibição
function translatePhaseName(id) {
  const dict = {
    grupos: "Fase de Grupos",
    quartas: "Quartas de Final",
    semis: "Semifinais",
    final: "Grande Final"
  };
  return dict[id] || id;
}

// Atualiza o timer de contagem regressiva
function updateTimer(phase) {
  const timerEl = document.getElementById("cronometro-tempo");
  if (!phase) {
    timerEl.textContent = "00:00:00";
    return;
  }

  // No Dia da Copa, conta para o fim da sexta (não para o fim dos grupos)
  let inicio = parseDate(phase.inicio).getTime();
  let fim = parseDate(phase.fim).getTime();
  if (isCopaDay() && COMPETICAO.fases.grupos.dia_copa) {
    inicio = parseDate(COMPETICAO.fases.grupos.dia_copa.inicio).getTime();
    fim = parseDate(COMPETICAO.fases.grupos.dia_copa.fim).getTime();
  }

  const now = getNow().getTime();

  if (now < inicio) {
    // Fase ainda não começou
    const diff = inicio - now;
    timerEl.textContent = "COMEÇA EM: " + formatDuration(diff);
  } else if (now <= fim) {
    // Fase rolando
    const diff = fim - now;
    timerEl.textContent = formatDuration(diff);
  } else {
    // Fase encerrada
    timerEl.textContent = "ENCERRADA";
  }
}

function formatDuration(diffMs) {
  const totalSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Cria o bloco de grupos (A, B, C, D) + Repescagem. Reutilizado pelo chaveamento
// e pela tela do Dia da Copa. `destaqueClassificados` liga o highlight verde.
function createGruposContainer(res, destaqueClassificados) {
  const containerGrupos = document.createElement("div");
  containerGrupos.className = "grupos-container";

  // Renderiza Grupos A, B, C, D
  COMPETICAO.fases.grupos.grupos.forEach(gConf => {
    const gBox = document.createElement("div");
    gBox.className = "grupo-box";
    gBox.innerHTML = `<div class="grupo-title">${gConf.nome}</div>`;

    const membersList = document.createElement("div");
    membersList.className = "grupo-members";

    const sortedMembers = res.grupos[gConf.nome];
    // Identifica o líder parcial do grupo
    const maxGMV = Math.max(...sortedMembers.map(m => m.gmv_grupos));

    sortedMembers.forEach(c => {
      const isLeader = maxGMV > 0 && c.gmv_grupos === maxGMV;
      const isQualified = c.posicao_grupo <= gConf.avancam;
      const card = createCloserCard(c, c.gmv_grupos, isLeader, isQualified && destaqueClassificados);
      membersList.appendChild(card);
    });

    gBox.appendChild(membersList);
    containerGrupos.appendChild(gBox);
  });

  // Bloco de Repescagem ao lado
  const repBox = document.createElement("div");
  repBox.className = "repescagem-container";
  repBox.innerHTML = `<div class="grupo-box"><div class="grupo-title" style="color: #60a5fa;">Repescagem</div></div>`;
  const repMembers = document.createElement("div");
  repMembers.className = "grupo-members";

  // Apenas quem sobrou dos grupos entra aqui
  const maxRepGMV = Math.max(...res.repescagem.map(m => m.gmv_grupos));
  res.repescagem.forEach((c, idx) => {
    const isWinnerRep = idx === 0; // O primeiro elemento é o classificado
    const isLeader = maxRepGMV > 0 && c.gmv_grupos === maxRepGMV;
    const card = createCloserCard(c, c.gmv_grupos, isLeader, isWinnerRep && destaqueClassificados);
    repMembers.appendChild(card);
  });
  repBox.querySelector(".grupo-box").appendChild(repMembers);
  containerGrupos.appendChild(repBox);

  return containerGrupos;
}

// Renderiza a estrutura de Bracket Vertical Completo
function renderBracket(container, res) {
  const bracket = document.createElement("div");
  bracket.className = "bracket-wrapper";

  const nowMs = getNow().getTime();
  const quartasDone = nowMs > parseDate(COMPETICAO.fases.quartas.fim).getTime();
  const semisDone = nowMs > parseDate(COMPETICAO.fases.semis.fim).getTime();

  // --- LINHA 1: GRUPOS + REPESCAGEM ---
  const rowGrupos = createPhaseRow("grupos");
  rowGrupos.querySelector(".phase-grid").appendChild(
    createGruposContainer(res, activePhaseId === "grupos")
  );
  bracket.appendChild(rowGrupos);


  // --- LINHA 2: QUARTAS DE FINAL (mostra os escalados dos grupos) ---
  const rowQF = createPhaseRow("quartas");
  const containerQF = document.createElement("div");
  containerQF.className = "confrontos-container";

  res.quartas.forEach(q => {
    const cBox = createConfrontoBox(q.label, q.c1, q.c2, q.vencedor, "gmv_quartas", "grupos");
    containerQF.appendChild(cBox);
  });
  rowQF.querySelector(".phase-grid").appendChild(containerQF);
  bracket.appendChild(rowQF);


  // --- LINHA 3: SEMIFINAIS (a definir até as quartas terminarem) ---
  const rowSF = createPhaseRow("semis");
  const containerSF = document.createElement("div");
  containerSF.className = "confrontos-container";

  res.semis.forEach(s => {
    const c1 = quartasDone ? s.c1 : null;
    const c2 = quartasDone ? s.c2 : null;
    const venc = quartasDone ? s.vencedor : null;
    const cBox = createConfrontoBox(s.label, c1, c2, venc, "gmv_semis", "quartas");
    containerSF.appendChild(cBox);
  });
  rowSF.querySelector(".phase-grid").appendChild(containerSF);
  bracket.appendChild(rowSF);


  // --- LINHA 4: GRANDE FINAL (a definir até as semis terminarem) ---
  const rowF = createPhaseRow("final");
  const containerF = document.createElement("div");
  containerF.className = "confrontos-container";

  const fc1 = semisDone ? res.final.c1 : null;
  const fc2 = semisDone ? res.final.c2 : null;
  const fvenc = semisDone ? res.final.vencedor : null;
  const finalBox = createConfrontoBox(res.final.label, fc1, fc2, fvenc, "gmv_final", "semis");
  containerF.appendChild(finalBox);

  rowF.querySelector(".phase-grid").appendChild(containerF);
  bracket.appendChild(rowF);


  // --- LINHA 5: CAMPEÃO ---
  const rowWinner = document.createElement("div");
  rowWinner.className = "phase-row";
  if (res.campeao) {
    rowWinner.className += " active";
  }
  rowWinner.innerHTML = `<div class="phase-grid"></div>`;
  const winnerContainer = rowWinner.querySelector(".phase-grid");

  if (res.campeao) {
    const champBox = document.createElement("div");
    champBox.className = "campeao-box";
    champBox.innerHTML = `
      <div class="trofeu-icon">🏆</div>
      <div class="campeao-label">Campeão do Lançamento</div>
    `;
    const champCard = createCloserCard(res.campeao, res.campeao.gmv_final, false, true);
    champCard.style.marginTop = "0.5rem";
    champCard.style.width = "100%";
    champBox.appendChild(champCard);
    winnerContainer.appendChild(champBox);
    bracket.appendChild(rowWinner);
  }

  // Envolve o canvas numa camada de escala e adiciona à tela
  const scaler = document.createElement("div");
  scaler.className = "bracket-scaler";
  scaler.appendChild(bracket);
  container.appendChild(scaler);

  // Escala o canvas para caber na área disponível
  fitBracket();
}

// Mede o canvas (largura fixa 1500px, altura natural) e aplica transform:scale()
// para que TODO o chaveamento caiba na área visível, em qualquer resolução,
// sem cortes nem sobreposições e preservando as proporções entre as fases.
function fitBracket() {
  const stage = document.getElementById("dashboard-body");
  if (!stage) return;
  const scaler = stage.querySelector(".bracket-scaler");
  const canvas = scaler ? scaler.querySelector(".bracket-wrapper") : null;
  if (!scaler || !canvas) return;

  // Mede o tamanho natural do canvas (sem escala)
  scaler.style.transform = "translate(-50%, -50%) scale(1)";
  const cw = canvas.offsetWidth;
  const ch = canvas.offsetHeight;
  if (!cw || !ch) return;

  const availW = stage.clientWidth;
  const availH = stage.clientHeight;
  const scale = Math.min(availW / cw, availH / ch);

  scaler.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(4)})`;
}

// Cria container de linha de fase com classes corretas
function createPhaseRow(id) {
  const row = document.createElement("div");
  row.className = "phase-row";
  if (activePhaseId === id) {
    row.className += " active";
  }
  row.innerHTML = `
    <div class="phase-side-label">${translatePhaseName(id)}</div>
    <div class="phase-grid"></div>
  `;
  return row;
}

// Helper: Cria card do vendedor.
// Novo layout: foto | nome + GMV | bandeira MAIOR à direita (sem código PMP).
function createCloserCard(c, gmvVal, isLiveLeader = false, isQualified = false) {
  const card = document.createElement("div");
  card.className = "closer-card";

  if (c.eliminado) {
    card.classList.add("eliminated");
  } else {
    if (isLiveLeader) card.classList.add("live-leader");
    if (isQualified) card.classList.add("qualified");
  }

  const bandeira = c.bandeira || "flags/brasil.svg";
  card.innerHTML = `
    <div class="avatar-wrapper">
      <img src="${c.foto}" alt="${c.nome}" class="avatar-img" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
    </div>
    <div class="closer-details">
      <span class="closer-name">${c.nome}</span>
      <div class="closer-gmv">${formatCurrency(gmvVal)}</div>
    </div>
    <div class="closer-flag">
      <img src="${bandeira}" alt="${c.selecao || ''}" class="flag-img">
    </div>
  `;
  return card;
}

// Helper: Cria box de confronto 1v1
function createConfrontoBox(title, c1, c2, vencedor, gmvPropName, prevPhaseName) {
  const box = document.createElement("div");
  box.className = "confronto-box";
  box.innerHTML = `<div class="confronto-title">${title}</div>`;

  if (!c1 && !c2) {
    // Placeholder quando a fase anterior ainda não foi decidida ("A definir")
    const emptyCard = document.createElement("div");
    emptyCard.className = "closer-card a-definir";
    emptyCard.innerHTML = `<span class="a-definir-label">A definir</span>`;
    box.appendChild(emptyCard);
    const vsBadge = document.createElement("div");
    vsBadge.className = "confronto-vs";
    vsBadge.textContent = "VS";
    box.appendChild(vsBadge);
    box.appendChild(emptyCard.cloneNode(true));
    return box;
  }

  // Define os dois competidores
  const comp1 = c1 || { nome: `Venc. ${prevPhaseName}`, code: "???", foto: "", bandeira: "flags/brasil.svg", eliminado: false };
  const comp2 = c2 || { nome: `Venc. ${prevPhaseName}`, code: "???", foto: "", bandeira: "flags/brasil.svg", eliminado: false };

  const g1 = c1 ? c1[gmvPropName] : 0;
  const g2 = c2 ? c2[gmvPropName] : 0;

  // Destaca o líder do confronto atual
  const isC1Leader = vencedor && c1 && vencedor.code === c1.code;
  const isC2Leader = vencedor && c2 && vencedor.code === c2.code;

  // Fase aberta: líder parcial recebe highlight dourado (live-leader)
  // Fase encerrada: vencedor recebe highlight verde (qualified)
  const nowMs = getNow().getTime();
  const phaseId = getFaseIdFromGmvProp(gmvPropName);
  const phaseEndMs = phaseId && COMPETICAO.fases[phaseId] ? parseDate(COMPETICAO.fases[phaseId].fim).getTime() : 0;
  const phaseIsOver = nowMs > phaseEndMs;

  const card1 = createCloserCard(comp1, g1,
    isC1Leader && !phaseIsOver,
    isC1Leader && phaseIsOver
  );
  const card2 = createCloserCard(comp2, g2,
    isC2Leader && !phaseIsOver,
    isC2Leader && phaseIsOver
  );

  const vsBadge = document.createElement("div");
  vsBadge.className = "confronto-vs";
  vsBadge.textContent = "VS";

  box.appendChild(card1);
  box.appendChild(vsBadge);
  box.appendChild(card2);
  return box;
}

function getFaseIdFromGmvProp(prop) {
  const dict = {
    gmv_grupos: "grupos",
    gmv_quartas: "quartas",
    gmv_semis: "semis",
    gmv_final: "final"
  };
  return dict[prop] || "";
}

// ===========================================================
//  DIA DA COPA (Sexta) — tela dividida:
//  Esquerda: grupos + repescagem | Direita: todos contra todos (pódio + lista)
// ===========================================================
function renderCopaDay(container, res) {
  const split = document.createElement("div");
  split.className = "copa-day-split";

  // --- LADO ESQUERDO: grupos + repescagem ---
  const left = document.createElement("div");
  left.className = "copa-left";
  left.innerHTML = `<div class="copa-side-title">Fase de Grupos <span>acumulado Ter–Sáb</span></div>`;
  left.appendChild(createGruposContainer(res, true));

  // --- LADO DIREITO: ranking do dia (todos contra todos) ---
  const right = document.createElement("div");
  right.className = "copa-right";

  // Ordena os 11 closers pelo GMV do dia (Sexta / Dia da Copa)
  const ranking = Object.keys(res.closers)
    .map(c => res.closers[c])
    .sort((a, b) => b.gmv_copa - a.gmv_copa);

  const totalDia = ranking.reduce((acc, c) => acc + c.gmv_copa, 0);

  right.innerHTML = `
    <div class="copa-right-header">
      <div class="copa-right-title">
        <span class="copa-icon">🇧🇷</span>
        <div>
          <h2>Jogo do Brasil — Dia da Copa</h2>
          <p>Todos os 11 closers • ranking do dia (sexta)</p>
        </div>
      </div>
      <div class="copa-right-total">
        <div class="copa-total-label">GMV do Dia</div>
        <div class="copa-total-valor">${formatCurrency(totalDia)}</div>
      </div>
    </div>
  `;

  // Pódio (top 3) + lista (demais)
  right.appendChild(buildPodium(ranking.slice(0, 3)));
  right.appendChild(buildCopaList(ranking.slice(3)));

  split.appendChild(left);
  split.appendChild(right);
  container.appendChild(split);
}

// Constrói o pódio (2º à esquerda, 1º ao centro mais alto, 3º à direita)
function buildPodium(top3) {
  const podium = document.createElement("div");
  podium.className = "podium";

  // Ordem visual: 2 - 1 - 3
  const ordem = [
    { c: top3[1], pos: 2 },
    { c: top3[0], pos: 1 },
    { c: top3[2], pos: 3 }
  ];

  ordem.forEach(({ c, pos }) => {
    const place = document.createElement("div");
    place.className = `podium-place place-${pos}`;
    if (!c) { podium.appendChild(place); return; }

    const bandeira = c.bandeira || "flags/brasil.svg";
    const medalha = pos === 1 ? "🥇" : pos === 2 ? "🥈" : "🥉";
    place.innerHTML = `
      <div class="podium-card">
        <div class="podium-medal">${medalha}</div>
        <div class="podium-avatar">
          <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
        </div>
        <div class="podium-name">${c.nome}</div>
        <div class="podium-selecao">
          <img src="${bandeira}" alt="${c.selecao || ''}" class="podium-flag">
          <span>${c.selecao || ''}</span>
        </div>
        <div class="podium-gmv">${formatCurrency(c.gmv_copa)}</div>
      </div>
      <div class="podium-bar"><span class="podium-num">${pos}</span></div>
    `;
    podium.appendChild(place);
  });

  return podium;
}

// Constrói a lista dos demais colocados (4º em diante) com bandeira + seleção
function buildCopaList(resto) {
  const list = document.createElement("div");
  list.className = "copa-list";

  resto.forEach((c, idx) => {
    const pos = idx + 4;
    const bandeira = c.bandeira || "flags/brasil.svg";
    const row = document.createElement("div");
    row.className = "copa-list-row" + (c.gmv_copa <= 0 ? " zero" : "");
    row.innerHTML = `
      <div class="copa-list-pos">${pos}º</div>
      <div class="copa-list-avatar">
        <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
      </div>
      <div class="copa-list-name">${c.nome}</div>
      <div class="copa-list-selecao">
        <img src="${bandeira}" alt="${c.selecao || ''}" class="copa-list-flag">
        <span>${c.selecao || ''}</span>
      </div>
      <div class="copa-list-gmv">${formatCurrency(c.gmv_copa)}</div>
    `;
    list.appendChild(row);
  });

  return list;
}

// Manipuladores visuais de carregamento e status de conexão
function showLoading(isLoading) {
  const dot = document.getElementById("status-dot");
  if (!dot) return;
  if (isLoading) {
    dot.classList.add("loading");
    dot.classList.remove("error");
  } else {
    dot.classList.remove("loading");
  }
}

function showStatusDot(status) {
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  if (!dot || !label) return;

  dot.className = "status-dot"; // Reset
  if (status === "success") {
    dot.classList.add("success");
    label.textContent = "Conectado";
  } else {
    dot.classList.add("error");
    label.textContent = "Offline / Erro Supabase";
  }
}
