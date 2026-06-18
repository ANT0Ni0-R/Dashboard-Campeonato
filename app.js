// app.js - Motor de cálculo, controle de estados e renderização do Dashboard Copa

let transactions = [];
// Seletor de dia: null = Ao Vivo (relógio real). "YYYY-MM-DD" = fechamento daquele
// dia (total cheio do dia, para premiações diárias).
let viewDay = null;
let pollInterval = null;
let activePhaseId = "grupos";
let syncCount = 0;
let lastSyncTime = null;
let nextSyncTime = null;
let syncCountdownInterval = null;

// Inicialização da aplicação
window.addEventListener("DOMContentLoaded", () => {
  initDaySelector();
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

// Inicialização do Seletor de Dia (canto superior direito).
// Permite visualizar o FECHAMENTO de cada dia (total cheio do dia) para as
// premiações diárias. "Ao Vivo" volta ao relógio real.
function initDaySelector() {
  const select = document.getElementById("day-selector");
  if (!select) return;

  select.innerHTML = `<option value="">🔴 Ao Vivo</option>`;
  buildCompetitionDays().forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.iso;          // "YYYY-MM-DD"
    opt.textContent = d.label;  // ex: "Ter 16/06 · Fase de Grupos"
    select.appendChild(opt);
  });

  select.addEventListener("change", () => {
    viewDay = select.value || null;
    forcarAtualizacao();
  });
}

// Gera a lista de dias da competição a partir do config (span grupos.inicio -> final.fim).
// Cada dia é rotulado com o dia da semana e a fase correspondente (derivada das datas).
function buildCompetitionDays() {
  const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const pad = n => String(n).padStart(2, "0");
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Itera por dia-calendário usando uma âncora ao meio-dia UTC (independente do
  // fuso da máquina). As datas da competição estão em -03:00 (sem horário de verão).
  const toUTCNoon = isoDate => new Date(isoDate + "T12:00:00Z");
  let cur = toUTCNoon(COMPETICAO.fases.grupos.inicio.slice(0, 10));
  const last = toUTCNoon(COMPETICAO.fases.final.fim.slice(0, 10));

  const days = [];
  while (cur.getTime() <= last.getTime()) {
    const y = cur.getUTCFullYear(), m = cur.getUTCMonth() + 1, d = cur.getUTCDate();
    const iso = `${y}-${pad(m)}-${pad(d)}`;
    const asOfMs = parseDate(iso + "T23:59:59-03:00").getTime();
    const faseLabel = isCopaDayMs(asOfMs) ? "Dia da Copa" : translatePhaseName(phaseForMs(asOfMs));
    days.push({
      iso,
      label: `${weekdays[cur.getUTCDay()]} ${pad(d)}/${pad(m)} · ${faseLabel}`
    });
    cur = new Date(cur.getTime() + DAY_MS);
  }
  return days;
}

// Retorna o Date atual. Com um dia selecionado, ancora no fim daquele dia
// (23:59:59) — base do "fechamento / total cheio do dia".
function getNow() {
  if (viewDay) return parseDate(viewDay + "T23:59:59-03:00");
  return new Date();
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
    // Apuração: ao vivo aplica o congelamento no horário de corte; com um dia
    // selecionado, mostra o total cheio daquele dia (corte = fim do dia).
    const ap = getApuracao();
    const txns = ap.filtrar
      ? transactions.filter(t => parseDate(t.created_at).getTime() <= ap.cutoffMs)
      : transactions;
    const resultados = calcularResultados(txns);
    renderDashboard(resultados);
    toggleApuracaoBanner(ap);
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

// Determina qual fase da competição está ativa (relógio real ou dia selecionado).
function determineActivePhase() {
  if (COMPETICAO.fase_ativa_override) {
    return COMPETICAO.fase_ativa_override;
  }
  return phaseForMs(getNow().getTime());
}

// Mapeia um instante (ms) para o id da fase correspondente, derivando das datas
// configuradas. Reutilizado pelo seletor de dia para rotular cada dia.
function phaseForMs(nowMs) {
  for (let id of Object.keys(COMPETICAO.fases)) {
    const inicioMs = parseDate(COMPETICAO.fases[id].inicio).getTime();
    const fimMs = parseDate(COMPETICAO.fases[id].fim).getTime();
    if (nowMs >= inicioMs && nowMs <= fimMs) return id;
  }
  // Antes de começar, exibe grupos; pós-competição, exibe a Final.
  if (nowMs < parseDate(COMPETICAO.fases.grupos.inicio).getTime()) return "grupos";
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
  return isCopaDayMs(getNow().getTime());
}

function isCopaDayMs(nowMs) {
  const dc = COMPETICAO.fases.grupos.dia_copa;
  if (!dc) return false;
  return nowMs >= parseDate(dc.inicio).getTime() && nowMs <= parseDate(dc.fim).getTime();
}

// Congelamento diario (apuracao para premiacao diaria). Retorna { congelado, cutoffMs, horaStr }.
// Durante a janela [corte, 23:59:59] o placar exibe o snapshot acumulado ate o horario de corte.
// Fora da janela nao ha corte, entao as vendas do periodo congelado voltam a contar apos 00:00.
// Assume que a maquina (TV) roda em America/Sao_Paulo, mesma premissa do restante do app.
function getCongelamento(now) {
  const cfg = COMPETICAO.congelamento;
  if (!cfg || !cfg.ativo) return { congelado: false, cutoffMs: null, horaStr: null };
  const horaStr = isCopaDay() ? cfg.hora_dia_copa : cfg.hora_padrao;
  const [h, m] = horaStr.split(":").map(Number);
  const cutoff = new Date(now); cutoff.setHours(h, m, 0, 0);
  const fimDia = new Date(now); fimDia.setHours(23, 59, 59, 999);
  const nowMs = now.getTime();
  const congelado = nowMs >= cutoff.getTime() && nowMs <= fimDia.getTime();
  return { congelado, cutoffMs: cutoff.getTime(), horaStr };
}

// Resolve a apuração exibida. Dois modos:
//  - "dia": seletor de dia ativo -> total cheio daquele dia (corte = 23:59:59).
//  - "corte": ao vivo -> congelamento diário no horário de corte (21:00 / 18:30 na sexta).
function getApuracao() {
  if (viewDay) {
    const cutoffMs = parseDate(viewDay + "T23:59:59-03:00").getTime();
    const [yyyy, mm, dd] = viewDay.split("-");
    return { modo: "dia", filtrar: true, cutoffMs, label: `${dd}/${mm}` };
  }
  const fz = getCongelamento(getNow());
  return { modo: "corte", filtrar: fz.congelado, cutoffMs: fz.cutoffMs, label: fz.horaStr };
}

// Executa requisição REST ao Supabase ou lê JSON local como fallback
async function fetchTransactions() {
  const hasSupabase = COMPETICAO.supabase.url && COMPETICAO.supabase.anon_key &&
                      !COMPETICAO.supabase.url.includes("[A DEFINIR]") &&
                      !COMPETICAO.supabase.anon_key.includes("__SUPABASE_ANON_KEY__");

  if (hasSupabase) {
    try {
      const base = `${COMPETICAO.supabase.url}/rest/v1/${COMPETICAO.supabase.tabela}` +
                   `?type=eq.order_success&select=price,pmp,created_at,slug,email`;
      // Filtra a coluna `slug` por "%legado%" (case-insensitive via ilike)
      const padrao = encodeURIComponent(COMPETICAO.produto.slug_like.replace(/%/g, "*"));
      const url = `${base}&slug=ilike.${padrao}&created_at=gte.2026-06-16T00:00:00-03:00`;
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
          email: t.email,
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
      gmv_dia: 0,      // GMV apenas do dia selecionado no seletor (fechamento diário)
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

  // Janela do dia selecionado (fechamento diário): apenas as vendas daquele dia.
  const diaIni = viewDay ? parseDate(viewDay + "T00:00:00-03:00").getTime() : 0;
  const diaFim = viewDay ? parseDate(viewDay + "T23:59:59-03:00").getTime() : 0;

  // 2. Distribui e calcula o GMV de cada transação nas fases
  transactionList.forEach(t => {
    if (!t.pmp) return;
    // Ignora transacoes de compradores na lista de exclusao (case-insensitive)
    const email = (t.email || "").trim().toLowerCase();
    const excluir = (COMPETICAO.produto.excluir_emails || []);
    if (email && excluir.some(e => e.toLowerCase() === email)) return;
    // seller_code = split_part(pmp, '-', -1)
    const segments = t.pmp.split('-');
    const seller_code = segments[segments.length - 1].toUpperCase();

    // Vendedor válido apenas se possui 3 letras e está no cadastro
    if (seller_code.length !== 3 || !closers[seller_code]) return;

    // Override de price por e-mail (aplicado por transacao, antes da regua)
    const ajustes = (COMPETICAO.produto.ajustar_precos || {});
    const precoEfetivo = (email && Object.prototype.hasOwnProperty.call(ajustes, email))
      ? ajustes[email] : t.price;
    const gmv = calcularGMV(precoEfetivo);
    const c = closers[seller_code];

    const timeMs = parseDate(t.created_at).getTime();

    // GMV exclusivo do dia selecionado (independente da fase) — base do fechamento diário.
    if (viewDay && timeMs >= diaIni && timeMs <= diaFim) c.gmv_dia += gmv;

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

  // Classificados por seed (chave usada pelo chaveamento configurável das Quartas).
  //   A1/A2 = 1º/2º do Grupo A | B1/B2 = Grupo B | C1/C2 = Grupo C | D1 = 1º do Grupo D
  //   REP   = vencedor da repescagem
  const seeds = {
    A1: standingGrupos["Grupo A"][0],
    A2: standingGrupos["Grupo A"][1],
    B1: standingGrupos["Grupo B"][0],
    B2: standingGrupos["Grupo B"][1],
    C1: standingGrupos["Grupo C"][0],
    C2: standingGrupos["Grupo C"][1],
    D1: standingGrupos["Grupo D"][0],
    REP: repEscudo
  };

  const classificadosQF = Object.values(seeds);

  // Se a fase de grupos já acabou, os demais vendedores que não estão na lista são eliminados
  if (nowMs >= gruposEndMs) {
    Object.keys(closers).forEach(code => {
      const c = closers[code];
      const classificado = classificadosQF.find(q => q && q.code === c.code);
      if (!classificado) {
        c.eliminado = true;
      }
    });
  }

  // 4. QUARTAS DE FINAL — confrontos montados a partir do chaveamento em config.js.
  // Cada item referencia dois seeds (ex.: C1 x C2, D1 x REP).
  const confrontosQF = COMPETICAO.fases.quartas.chaveamento.map((cf, i) => ({
    id: "QF" + (i + 1),
    label: cf.label,
    c1: seeds[cf.seeds[0]],
    c2: seeds[cf.seeds[1]],
    vencedor: null
  }));

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

    if (nowMs >= quartasEndMs) {
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

    if (nowMs >= semisEndMs) {
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

    if (nowMs >= finalEndMs) {
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
    campeao: nowMs >= finalEndMs ? confrontoFinal.vencedor : null
  };
}

// Formata valores numéricos para Real BRL (sem casas decimais — evita o GMV
// estourar/encostar na bandeira nos cards e mantém os números mais limpos)
function formatCurrency(val) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val);
}

// Renderiza a interface baseada na fase de competição ativa
function renderDashboard(res) {
  // Atualiza metadados do cabeçalho
  const currentPhase = COMPETICAO.fases[activePhaseId];
  const copa = isCopaDay();
  const faseNome = copa ? "Dia da Copa (Sexta)" : translatePhaseName(activePhaseId);
  document.getElementById("fase-nome").textContent = faseNome;
  document.getElementById("product-name").textContent =
    COMPETICAO.produto.slug_like.replace(/%/g, "");

  // Atualiza cronômetro regressivo
  updateTimer(currentPhase);

  const container = document.getElementById("dashboard-body");
  container.innerHTML = "";

  const copaView = (activePhaseId === "grupos" && copa);

  // Decide a view ativa. Ordem de prioridade:
  //  1. Seletor de dia ativo -> Fechamento do Dia (ranking só do GMV daquele dia).
  //  2. Sexta (Dia da Copa) ao vivo -> tela dividida grupos + todos-contra-todos.
  //  3. Semifinais ao vivo -> tela horizontal Semi 1 | cotados p/ final | Semi 2.
  //  4. Final ao vivo -> tela dividida em duas metades (um finalista em cada lado).
  //  5. Demais (grupos/quartas) -> chaveamento de duas linhas.
  let viewClass;
  if (viewDay) {
    viewClass = "view-daily";
    renderDailyClosing(container, res);
  } else if (copaView) {
    viewClass = "view-copa";
    renderCopaDay(container, res);
  } else if (activePhaseId === "semis") {
    viewClass = "view-semis";
    renderSemis(container, res);
  } else if (activePhaseId === "final") {
    viewClass = "view-final";
    renderFinal(container, res);
  } else {
    viewClass = "view-bracket";
    renderBracket(container, res);
  }

  // Marca a view atual para escopar o CSS (header compacto, destaques, etc.)
  ["view-copa", "view-bracket", "view-daily", "view-semis", "view-final"]
    .forEach(c => document.body.classList.toggle(c, c === viewClass));
}

// Mostra/oculta o banner de apuração no header.
//  - modo "dia": fechamento do dia selecionado (total cheio do dia).
//  - modo "corte": resultado congelado no horário de corte (ao vivo).
function toggleApuracaoBanner(ap) {
  const banner = document.getElementById("congelado-banner");
  if (!banner) return;
  if (!ap || !ap.filtrar) { banner.hidden = true; return; }

  const icon = banner.querySelector(".congelado-icon");
  const title = banner.querySelector(".congelado-title");
  const sub = document.getElementById("congelado-sub");

  if (ap.modo === "dia") {
    if (icon) icon.textContent = "📅";
    if (title) title.textContent = "FECHAMENTO DO DIA";
    if (sub) sub.textContent = `${ap.label} · total do dia`;
  } else {
    if (icon) icon.textContent = "🔒";
    if (title) title.textContent = "RESULTADO CONGELADO";
    if (sub) sub.textContent = `Apuração diária · snapshot ${ap.label}`;
  }
  banner.hidden = false;
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

// Cria o bloco de grupos (A, B, C, D) + Repescagem. Reutilizado pelo chaveamento,
// pela tela do Dia da Copa e pelo Fechamento do Dia.
// opts:
//   destaque         -> liga o highlight (verde) do classificado / melhor do grupo
//   gmvProp          -> qual GMV exibir/ordenar ("gmv_grupos" padrão, "gmv_dia" no fechamento)
//   mostrarRepescagem-> exibe (ou não) o bloco de repescagem ao lado
//   modoDia          -> ordena por gmvProp e destaca o MELHOR de cada grupo no dia
//                       (ignora a marcação de eliminado, pois é uma apuração diária)
function createGruposContainer(res, opts = {}) {
  const {
    destaque = false,
    gmvProp = "gmv_grupos",
    mostrarRepescagem = true,
    modoDia = false
  } = opts;

  const containerGrupos = document.createElement("div");
  containerGrupos.className = "grupos-container";

  // Renderiza Grupos A, B, C, D
  COMPETICAO.fases.grupos.grupos.forEach(gConf => {
    const gBox = document.createElement("div");
    gBox.className = "grupo-box";
    gBox.innerHTML = `<div class="grupo-title">${gConf.nome}</div>`;

    const membersList = document.createElement("div");
    membersList.className = "grupo-members";

    // No fechamento diário ordena pelo GMV do dia; senão usa o standing acumulado.
    const sortedMembers = modoDia
      ? gConf.membros.map(code => res.closers[code]).slice().sort((a, b) => b[gmvProp] - a[gmvProp])
      : res.grupos[gConf.nome];

    const maxGMV = Math.max(...sortedMembers.map(m => m[gmvProp]));

    sortedMembers.forEach(c => {
      const isLeader = maxGMV > 0 && c[gmvProp] === maxGMV;
      if (modoDia) {
        // Destaca em verde o melhor do grupo no dia (ignora eliminado)
        const card = createCloserCard(c, c[gmvProp], false, isLeader && destaque, { ignoreEliminated: true });
        membersList.appendChild(card);
      } else {
        const isQualified = c.posicao_grupo <= gConf.avancam;
        const card = createCloserCard(c, c[gmvProp], isLeader, isQualified && destaque);
        membersList.appendChild(card);
      }
    });

    gBox.appendChild(membersList);
    containerGrupos.appendChild(gBox);
  });

  if (!mostrarRepescagem) return containerGrupos;

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
    const card = createCloserCard(c, c.gmv_grupos, isLeader, isWinnerRep && destaque);
    repMembers.appendChild(card);
  });
  repBox.querySelector(".grupo-box").appendChild(repMembers);
  containerGrupos.appendChild(repBox);

  return containerGrupos;
}

// Sequência de fases do chaveamento (a Copa/Sexta é tela à parte, fora daqui).
const PHASE_ORDER = ["grupos", "quartas", "semis", "final", "campeao"];

// Renderiza o chaveamento em DUAS linhas: a fase ATIVA (grande, com destaque) e a
// PRÓXIMA fase (prévia projetada pelo placar atual). Ex.: Grupos + Quartas, depois
// Quartas + Semis, etc. Não se aplica à tela do Dia da Copa (renderCopaDay).
function renderBracket(container, res) {
  const bracket = document.createElement("div");
  bracket.className = "bracket-wrapper";

  const idx = Math.max(0, PHASE_ORDER.indexOf(activePhaseId));
  const activeId = PHASE_ORDER[idx];
  const nextId = PHASE_ORDER[idx + 1] || null;

  // Linha 1: fase ativa (destaque máximo)
  const activeSection = buildPhaseSection(activeId, res, true);
  if (activeSection) bracket.appendChild(activeSection);

  // Linha 2: próxima fase (prévia projetada). Para "campeao", só aparece quando
  // já existe um campeão definido (sem placeholder de campeão).
  if (nextId) {
    const nextSection = buildPhaseSection(nextId, res, false);
    if (nextSection) bracket.appendChild(nextSection);
  }

  // Envolve o canvas numa camada de escala e adiciona à tela
  const scaler = document.createElement("div");
  scaler.className = "bracket-scaler";
  scaler.appendChild(bracket);
  container.appendChild(scaler);

  // Escala o canvas para caber na área disponível
  fitBracket();
}

// Monta a linha (.phase-row) de uma fase. isActive controla o destaque/escala.
// Retorna null quando não há conteúdo a exibir (ex.: campeão ainda indefinido).
function buildPhaseSection(id, res, isActive) {
  if (id === "campeao") {
    return res.campeao ? buildCampeaoRow(res) : null;
  }

  const row = createPhaseRow(id, isActive);
  const grid = row.querySelector(".phase-grid");

  if (id === "grupos") {
    grid.appendChild(createGruposContainer(res, { destaque: activePhaseId === "grupos" }));
  } else {
    grid.appendChild(buildConfrontosFor(id, res));
  }
  return row;
}

// Constrói o container de confrontos (mata-mata) de uma fase, com os participantes
// projetados pelo placar atual (prévia). createConfrontoBox trata slots vazios.
function buildConfrontosFor(id, res) {
  const cont = document.createElement("div");
  cont.className = "confrontos-container";

  if (id === "quartas") {
    res.quartas.forEach(q =>
      cont.appendChild(createConfrontoBox(q.label, q.c1, q.c2, q.vencedor, "gmv_quartas", "grupos")));
  } else if (id === "semis") {
    res.semis.forEach(s =>
      cont.appendChild(createConfrontoBox(s.label, s.c1, s.c2, s.vencedor, "gmv_semis", "quartas")));
  } else if (id === "final") {
    cont.appendChild(createConfrontoBox(res.final.label, res.final.c1, res.final.c2, res.final.vencedor, "gmv_final", "semis"));
  }
  return cont;
}

// Linha exclusiva do Campeão (destacada como ativa).
function buildCampeaoRow(res) {
  const row = document.createElement("div");
  row.className = "phase-row active campeao-row";
  row.innerHTML = `<div class="phase-grid"></div>`;

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

  row.querySelector(".phase-grid").appendChild(champBox);
  return row;
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

// Cria a linha de fase. isActive => destaque máximo; senão => prévia da próxima fase.
function createPhaseRow(id, isActive) {
  const row = document.createElement("div");
  row.className = "phase-row " + (isActive ? "active" : "preview");
  row.innerHTML = `
    <div class="phase-side-label">${translatePhaseName(id)}</div>
    <div class="phase-grid"></div>
  `;
  if (!isActive) {
    const tag = document.createElement("div");
    tag.className = "preview-tag";
    tag.textContent = "Próxima fase · prévia";
    row.appendChild(tag);
  }
  return row;
}

// Helper: Cria card do vendedor.
// Novo layout: foto | nome + GMV | bandeira MAIOR à direita (sem código PMP).
function createCloserCard(c, gmvVal, isLiveLeader = false, isQualified = false, opts = {}) {
  const card = document.createElement("div");
  card.className = "closer-card";

  if (c.eliminado && !opts.ignoreEliminated) {
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
      <img src="${bandeira}" alt="${c.selecao || ''}" class="flag-img" onerror="this.style.visibility='hidden'">
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
  const phaseIsOver = nowMs >= phaseEndMs;

  // Mantém o vencedor (ou líder parcial) SEMPRE no topo do confronto, para que
  // todos os jogos fiquem visualmente consistentes (ex.: QF2 igual às demais).
  const slots = [
    { comp: comp1, gmv: g1, leader: isC1Leader },
    { comp: comp2, gmv: g2, leader: isC2Leader }
  ];
  slots.sort((a, b) => (Number(b.leader) - Number(a.leader)) || (b.gmv - a.gmv));

  const card1 = createCloserCard(slots[0].comp, slots[0].gmv,
    slots[0].leader && !phaseIsOver,
    slots[0].leader && phaseIsOver
  );
  const card2 = createCloserCard(slots[1].comp, slots[1].gmv,
    slots[1].leader && !phaseIsOver,
    slots[1].leader && phaseIsOver
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
  left.appendChild(createGruposContainer(res, { destaque: true }));

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
  right.appendChild(buildPodium(ranking.slice(0, 3), "gmv_copa"));
  right.appendChild(buildCopaList(ranking.slice(3), "gmv_copa"));

  split.appendChild(left);
  split.appendChild(right);
  container.appendChild(split);
}

// Constrói o pódio (2º à esquerda, 1º ao centro mais alto, 3º à direita).
// Sem medalhas: a foto do vendedor é o destaque (ocupa todo o quadro após o nome).
// gmvProp define qual GMV exibir (ex.: "gmv_copa" no Dia da Copa, "gmv_dia" no fechamento).
function buildPodium(top3, gmvProp = "gmv_copa") {
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
    place.innerHTML = `
      <div class="podium-card">
        <div class="podium-name">${c.nome}</div>
        <div class="podium-avatar">
          <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
        </div>
        <div class="podium-selecao">
          <img src="${bandeira}" alt="${c.selecao || ''}" class="podium-flag">
          <span>${c.selecao || ''}</span>
        </div>
        <div class="podium-gmv">${formatCurrency(c[gmvProp])}</div>
      </div>
      <div class="podium-bar"><span class="podium-num">${pos}</span></div>
    `;
    podium.appendChild(place);
  });

  return podium;
}

// Constrói a lista dos demais colocados (4º em diante) com bandeira + seleção
function buildCopaList(resto, gmvProp = "gmv_copa") {
  const list = document.createElement("div");
  list.className = "copa-list";

  resto.forEach((c, idx) => {
    const pos = idx + 4;
    const bandeira = c.bandeira || "flags/brasil.svg";
    const row = document.createElement("div");
    row.className = "copa-list-row" + (c[gmvProp] <= 0 ? " zero" : "");
    row.innerHTML = `
      <div class="copa-list-pos">${pos}º</div>
      <div class="copa-list-avatar">
        <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
      </div>
      <div class="copa-list-name">${c.nome}</div>
      <div class="copa-list-selecao">
        <img src="${bandeira}" alt="${c.selecao || ''}" class="copa-list-flag" onerror="this.style.visibility='hidden'">
        <span>${c.selecao || ''}</span>
      </div>
      <div class="copa-list-gmv">${formatCurrency(c[gmvProp])}</div>
    `;
    list.appendChild(row);
  });

  return list;
}

// ===========================================================
//  FECHAMENTO DO DIA (Seletor de Dia) — ranking só pelo GMV do dia selecionado.
//  Premiação diária: "o melhor do dia". Reaproveita o pódio (sem medalhas) + lista.
// ===========================================================
function renderDailyClosing(container, res) {
  const split = document.createElement("div");
  split.className = "copa-day-split";

  const [yyyy, mm, dd] = viewDay.split("-");
  const dataLabel = `${dd}/${mm}`;

  // --- LADO ESQUERDO: melhor de cada grupo (A, B, C, D) somente pelo GMV do dia ---
  const left = document.createElement("div");
  left.className = "copa-left";
  left.innerHTML = `<div class="copa-side-title">Melhor por Grupo <span>somente GMV do dia ${dataLabel}</span></div>`;
  left.appendChild(createGruposContainer(res, {
    destaque: true,
    gmvProp: "gmv_dia",
    mostrarRepescagem: false,
    modoDia: true
  }));

  // --- LADO DIREITO: ranking geral do dia (melhor do dia) ---
  const right = document.createElement("div");
  right.className = "copa-right";

  const ranking = Object.keys(res.closers)
    .map(c => res.closers[c])
    .sort((a, b) => b.gmv_dia - a.gmv_dia);

  const totalDia = ranking.reduce((acc, c) => acc + c.gmv_dia, 0);

  right.innerHTML = `
    <div class="copa-right-header">
      <div class="copa-right-title">
        <span class="copa-icon">🏅</span>
        <div>
          <h2>Fechamento do Dia — ${dataLabel}</h2>
          <p>Melhor do dia geral • ranking apenas pelo GMV de ${dataLabel}</p>
        </div>
      </div>
      <div class="copa-right-total">
        <div class="copa-total-label">GMV do Dia</div>
        <div class="copa-total-valor">${formatCurrency(totalDia)}</div>
      </div>
    </div>
  `;

  right.appendChild(buildPodium(ranking.slice(0, 3), "gmv_dia"));
  right.appendChild(buildCopaList(ranking.slice(3), "gmv_dia"));

  split.appendChild(left);
  split.appendChild(right);
  container.appendChild(split);
}

// Card grande de jogador (foto em destaque) usado nas Semis e na Final.
// opts: { leader, winner, eliminated, prev } — prev = nome da fase anterior p/ placeholder.
function buildBigPlayerCard(c, gmvVal, opts = {}) {
  const card = document.createElement("div");
  card.className = "big-player";
  if (!c) {
    card.classList.add("a-definir");
    card.innerHTML = `<span class="a-definir-label">A definir</span>`;
    return card;
  }
  if (c.eliminado || opts.eliminated) card.classList.add("eliminated");
  if (opts.leader) card.classList.add("leader");
  if (opts.winner) card.classList.add("winner");

  const bandeira = c.bandeira || "flags/brasil.svg";
  card.innerHTML = `
    <div class="bp-photo">
      <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
    </div>
    <div class="bp-name">${c.nome}</div>
    <div class="bp-selecao">
      <img src="${bandeira}" alt="${c.selecao || ''}" class="bp-flag" onerror="this.style.visibility='hidden'">
      <span>${c.selecao || ''}</span>
    </div>
    <div class="bp-gmv">${formatCurrency(gmvVal)}</div>
  `;
  return card;
}

// ===========================================================
//  SEMIFINAIS — layout horizontal: Semi 1 | cotados para a Final | Semi 2.
//  Cada semi mostra a dupla lado a lado (grande); o centro projeta o confronto
//  da final pelos líderes atuais de cada semi ("cotados até o momento").
// ===========================================================
function renderSemis(container, res) {
  const stage = document.createElement("div");
  stage.className = "semis-stage";

  const sf1 = res.semis[0];
  const sf2 = res.semis[1];
  const semisOver = getNow().getTime() >= parseDate(COMPETICAO.fases.semis.fim).getTime();

  stage.appendChild(buildSemiBlock(sf1, "Semifinal 1", semisOver));
  stage.appendChild(buildFinalProjection(sf1.vencedor, sf2.vencedor));
  stage.appendChild(buildSemiBlock(sf2, "Semifinal 2", semisOver));

  container.appendChild(stage);
}

function buildSemiBlock(sf, titulo, semisOver) {
  const block = document.createElement("div");
  block.className = "semi-block";
  block.innerHTML = `<div class="semi-block-title">${titulo}</div>`;

  const duo = document.createElement("div");
  duo.className = "semi-duo";

  const leader1 = sf.vencedor && sf.c1 && sf.vencedor.code === sf.c1.code;
  const leader2 = sf.vencedor && sf.c2 && sf.vencedor.code === sf.c2.code;

  const card1 = buildBigPlayerCard(sf.c1, sf.c1 ? sf.c1.gmv_semis : 0,
    { leader: leader1 && !semisOver, winner: leader1 && semisOver, prev: "quartas" });
  const card2 = buildBigPlayerCard(sf.c2, sf.c2 ? sf.c2.gmv_semis : 0,
    { leader: leader2 && !semisOver, winner: leader2 && semisOver, prev: "quartas" });

  const vs = document.createElement("div");
  vs.className = "semi-vs";
  vs.textContent = "VS";

  duo.appendChild(card1);
  duo.appendChild(vs);
  duo.appendChild(card2);
  block.appendChild(duo);
  return block;
}

// Centro das semis: confronto projetado da final pelos líderes atuais de cada semi.
function buildFinalProjection(p1, p2) {
  const box = document.createElement("div");
  box.className = "final-projection";
  box.innerHTML = `
    <div class="trofeu-icon">🏆</div>
    <div class="final-proj-title">Cotados para a Final</div>
  `;

  const inner = document.createElement("div");
  inner.className = "final-proj-inner";
  inner.appendChild(buildProjCard(p1));

  const vs = document.createElement("div");
  vs.className = "final-proj-vs";
  vs.textContent = "VS";
  inner.appendChild(vs);

  inner.appendChild(buildProjCard(p2));
  box.appendChild(inner);
  return box;
}

function buildProjCard(c) {
  const card = document.createElement("div");
  card.className = "proj-card";
  if (!c) {
    card.classList.add("a-definir");
    card.innerHTML = `<span class="a-definir-label">A definir</span>`;
    return card;
  }
  const bandeira = c.bandeira || "flags/brasil.svg";
  card.innerHTML = `
    <div class="proj-avatar">
      <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
    </div>
    <div class="proj-info">
      <span class="proj-name">${c.nome}</span>
      <span class="proj-gmv">${formatCurrency(c.gmv_semis)}</span>
    </div>
    <img src="${bandeira}" alt="${c.selecao || ''}" class="proj-flag" onerror="this.style.visibility='hidden'">
  `;
  return card;
}

// ===========================================================
//  GRANDE FINAL — tela dividida: cada finalista ocupa metade da tela com a
//  imagem grande. O campeão só é coroado no fim do dia (res.campeao truthy).
// ===========================================================
function renderFinal(container, res) {
  const stage = document.createElement("div");
  stage.className = "final-stage";

  const f = res.final;
  const finalOver = getNow().getTime() >= parseDate(COMPETICAO.fases.final.fim).getTime();
  const champ = res.campeao; // só definido após o fim do dia da final

  const win1 = f.vencedor && f.c1 && f.vencedor.code === f.c1.code;
  const win2 = f.vencedor && f.c2 && f.vencedor.code === f.c2.code;

  const half1 = buildFinalHalf(f.c1, f.c1 ? f.c1.gmv_final : 0, {
    leader: win1 && !finalOver,
    champion: !!(champ && win1),
    dim: !!(champ && !win1)
  });
  const half2 = buildFinalHalf(f.c2, f.c2 ? f.c2.gmv_final : 0, {
    leader: win2 && !finalOver,
    champion: !!(champ && win2),
    dim: !!(champ && !win2)
  });

  const vs = document.createElement("div");
  vs.className = "final-vs";
  vs.textContent = "VS";

  stage.appendChild(half1);
  stage.appendChild(vs);
  stage.appendChild(half2);
  container.appendChild(stage);
}

function buildFinalHalf(c, gmvVal, opts = {}) {
  const half = document.createElement("div");
  half.className = "final-half";
  if (opts.leader) half.classList.add("leader");
  if (opts.champion) half.classList.add("champion");
  if (opts.dim) half.classList.add("dim");

  if (!c) {
    half.classList.add("a-definir");
    half.innerHTML = `<span class="a-definir-label">A definir</span>`;
    return half;
  }

  const bandeira = c.bandeira || "flags/brasil.svg";
  const coroa = opts.champion
    ? `<div class="fh-champ"><span class="fh-trophy">🏆</span><span class="fh-champ-label">Campeão do Lançamento</span></div>`
    : "";
  half.innerHTML = `
    ${coroa}
    <div class="fh-photo">
      <img src="${c.foto}" alt="${c.nome}" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
    </div>
    <div class="fh-name">${c.nome}</div>
    <div class="fh-selecao">
      <img src="${bandeira}" alt="${c.selecao || ''}" class="fh-flag" onerror="this.style.visibility='hidden'">
      <span>${c.selecao || ''}</span>
    </div>
    <div class="fh-gmv">${formatCurrency(gmvVal)}</div>
  `;
  return half;
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
