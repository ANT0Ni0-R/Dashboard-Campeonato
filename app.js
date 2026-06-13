// app.js - Motor de cálculo, controle de estados e renderização do Dashboard Copa

let transactions = [];
let simulatedDate = null; // Se null, usa o relógio real
let pollInterval = null;
let activePhaseId = "grupos";

// Inicialização da aplicação
window.addEventListener("DOMContentLoaded", () => {
  initSimulador();
  startPolling();
  updateDashboard();
  window.addEventListener("resize", applyAutoZoom);
  // Atualiza o cronômetro a cada segundo sem refetch
  setInterval(() => {
    const phase = COMPETICAO.fases[activePhaseId];
    if (phase) updateTimer(phase);
  }, 1000);
});

// Inicialização do Painel de Simulação (Controlador de Relógio)
function initSimulador() {
  const simPanel = document.createElement("div");
  simPanel.className = "simulador-panel";
  simPanel.innerHTML = `
    <div class="sim-header">Simulador de Copa (Clique para testar fases)</div>
    <div class="sim-buttons">
      <button class="sim-btn active" data-time="real">Relógio Real</button>
      <button class="sim-btn" data-time="2026-06-16T10:00:00-03:00">Terça (Grupos - Dia 1)</button>
      <button class="sim-btn" data-time="2026-06-17T20:00:00-03:00">Quarta (Grupos - Dia 2)</button>
      <button class="sim-btn" data-time="2026-06-18T15:00:00-03:00">Quinta (Quartas)</button>
      <button class="sim-btn" data-time="2026-06-19T16:00:00-03:00">Sexta (Brasil)</button>
      <button class="sim-btn" data-time="2026-06-20T14:00:00-03:00">Sábado (Semis)</button>
      <button class="sim-btn" data-time="2026-06-21T18:00:00-03:00">Domingo (Final)</button>
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
  `;
  document.head.appendChild(style);

  // Bind de cliques no painel
  simPanel.querySelectorAll(".sim-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      simPanel.querySelectorAll(".sim-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      
      const timeVal = btn.getAttribute("data-time");
      if (timeVal === "real") {
        simulatedDate = null;
      } else {
        simulatedDate = new Date(timeVal);
      }
      updateDashboard();
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

// Core: Processo de atualização do Dashboard
async function updateDashboard() {
  showLoading(true);
  try {
    // 1. Determina a fase ativa
    activePhaseId = determineActivePhase();
    
    // 2. Busca as transações
    await fetchTransactions();

    // 3. Processa dados e calcula chaveamento/ranking
    const resultados = calcularResultados(transactions);

    // 4. Renderiza a tela baseada na fase
    renderDashboard(resultados);
    showStatusDot("success");
  } catch (err) {
    console.error("Erro na atualização do dashboard:", err);
    showStatusDot("error");
  } finally {
    showLoading(false);
  }
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

// Executa requisição REST ao Supabase ou lê JSON local como fallback
async function fetchTransactions() {
  const hasSupabase = COMPETICAO.supabase.url && COMPETICAO.supabase.anon_key && 
                      !COMPETICAO.supabase.url.includes("[A DEFINIR]");
  
  if (hasSupabase) {
    try {
      const url = `${COMPETICAO.supabase.url}/rest/v1/${COMPETICAO.supabase.tabela}?type=eq.order_success&select=price,pmp,created_at&created_at=gte.2026-06-16T00:00:00-03:00`;
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
      gmv_quartas: 0,
      gmv_brasil: 0,
      gmv_semis: 0,
      gmv_final: 0,
      eliminado: false
    };
  });

  // 2. Distribui e calcula o GMV de cada transação nas fases
  transactionList.forEach(t => {
    if (!t.pmp) return;
    // seller_code = split_part(pmp, '-', -1)
    const segments = t.pmp.split('-');
    const seller_code = segments[segments.length - 1].toUpperCase();

    // Vendedor válido apenas se possui 3 letras e está no cadastro
    if (seller_code.length !== 3 || !closers[seller_code]) return;

    const gmv = calcularGMV(t.price);
    const timeMs = parseDate(t.created_at).getTime();

    // Associa o GMV ao período correto
    const f = COMPETICAO.fases;
    if (timeMs >= parseDate(f.grupos.inicio).getTime() && timeMs <= parseDate(f.grupos.fim).getTime()) {
      closers[seller_code].gmv_grupos += gmv;
    } else if (timeMs >= parseDate(f.quartas.inicio).getTime() && timeMs <= parseDate(f.quartas.fim).getTime()) {
      closers[seller_code].gmv_quartas += gmv;
    } else if (timeMs >= parseDate(f.brasil.inicio).getTime() && timeMs <= parseDate(f.brasil.fim).getTime()) {
      closers[seller_code].gmv_brasil += gmv;
    } else if (timeMs >= parseDate(f.semis.inicio).getTime() && timeMs <= parseDate(f.semis.fim).getTime()) {
      closers[seller_code].gmv_semis += gmv;
    } else if (timeMs >= parseDate(f.final.inicio).getTime() && timeMs <= parseDate(f.final.fim).getTime()) {
      closers[seller_code].gmv_final += gmv;
    }
  });

  const nowMs = getNow().getTime();
  const gruposEndMs = parseDate(COMPETICAO.fases.grupos.fim).getTime();
  const quartasEndMs = parseDate(COMPETICAO.fases.quartas.fim).getTime();
  const semisEndMs = parseDate(COMPETICAO.fases.semis.fim).getTime();
  const finalEndMs = parseDate(COMPETICAO.fases.final.fim).getTime();

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
  document.getElementById("fase-nome").textContent = translatePhaseName(activePhaseId);
  document.getElementById("product-name").textContent = COMPETICAO.produto.slug_like.replace(/%/g, "");

  // Atualiza cronômetro regressivo
  updateTimer(currentPhase);

  const container = document.getElementById("dashboard-body");
  container.innerHTML = "";

  if (activePhaseId === "brasil") {
    // Renderiza a tela de Ranking Estilo Brasileirão (pausa o Bracket)
    renderBrasilLeaderboard(container, res);
  } else {
    // Renderiza o Bracket completo
    renderBracket(container, res);
  }
}

// Traduz o ID da fase para um nome amigável de exibição
function translatePhaseName(id) {
  const dict = {
    grupos: "Fase de Grupos",
    quartas: "Quartas de Final",
    brasil: "Jogo do Brasil (Sexta)",
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
  
  const now = getNow().getTime();
  const inicio = parseDate(phase.inicio).getTime();
  const fim = parseDate(phase.fim).getTime();

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

// Renderiza a estrutura de Bracket Vertical Completo
function renderBracket(container, res) {
  const bracket = document.createElement("div");
  bracket.className = "bracket-wrapper";

  // --- LINHA 1: GRUPOS + REPESCAGEM ---
  const rowGrupos = createPhaseRow("grupos");
  
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
      const card = createCloserCard(c, c.gmv_grupos, isLeader, isQualified && activePhaseId === "grupos");
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
    const card = createCloserCard(c, c.gmv_grupos, isLeader, isWinnerRep && activePhaseId === "grupos");
    repMembers.appendChild(card);
  });
  repBox.querySelector(".grupo-box").appendChild(repMembers);
  containerGrupos.appendChild(repBox);

  rowGrupos.querySelector(".phase-grid").appendChild(containerGrupos);
  bracket.appendChild(rowGrupos);


  // --- LINHA 2: QUARTAS DE FINAL ---
  const rowQF = createPhaseRow("quartas");
  const containerQF = document.createElement("div");
  containerQF.className = "confrontos-container";

  res.quartas.forEach(q => {
    const cBox = createConfrontoBox(q.label, q.c1, q.c2, q.vencedor, "gmv_quartas", "grupos");
    containerQF.appendChild(cBox);
  });
  rowQF.querySelector(".phase-grid").appendChild(containerQF);
  bracket.appendChild(rowQF);


  // --- LINHA 3: SEMIFINAIS ---
  const rowSF = createPhaseRow("semis");
  const containerSF = document.createElement("div");
  containerSF.className = "confrontos-container";

  res.semis.forEach(s => {
    const cBox = createConfrontoBox(s.label, s.c1, s.c2, s.vencedor, "gmv_semis", "quartas");
    containerSF.appendChild(cBox);
  });
  rowSF.querySelector(".phase-grid").appendChild(containerSF);
  bracket.appendChild(rowSF);


  // --- LINHA 4: GRANDE FINAL ---
  const rowF = createPhaseRow("final");
  const containerF = document.createElement("div");
  containerF.className = "confrontos-container";

  const finalBox = createConfrontoBox(res.final.label, res.final.c1, res.final.c2, res.final.vencedor, "gmv_final", "semis");
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
  } else {
    // Placeholder da Taça quando não concluído
    const placeholderChamp = document.createElement("div");
    placeholderChamp.className = "campeao-box";
    placeholderChamp.style.opacity = "0.3";
    placeholderChamp.style.borderStyle = "dashed";
    placeholderChamp.style.boxShadow = "none";
    placeholderChamp.innerHTML = `
      <div class="trofeu-icon" style="filter: grayscale(100%);">🏆</div>
      <div class="campeao-label" style="color: var(--text-secondary);">Aguardando Campeão...</div>
    `;
    winnerContainer.appendChild(placeholderChamp);
  }
  bracket.appendChild(rowWinner);

  container.appendChild(bracket);

  // Ajusta grid-template-rows: fase ativa recebe 3fr, demais 1fr
  applyBracketGrid(bracket);
  // Zoom automático para caber em qualquer resolução
  applyAutoZoom();
}

// Define proporções do grid com base na fase ativa
// Grupos recebe 4fr (mais vendedores), demais fases ativas recebem 3fr, inativas 1fr
function applyBracketGrid(bracket) {
  const phaseOrder = ["grupos", "quartas", "semis", "final", "campeao"];
  const rows = phaseOrder.map(id => {
    const isActive = activePhaseId === id || (id === "campeao" && activePhaseId === "final");
    if (!isActive) return "1fr";
    return id === "grupos" ? "4fr" : "3fr";
  });
  bracket.style.gridTemplateRows = rows.join(" ");
}

// Aplica zoom global no app-container para caber na viewport atual
function applyAutoZoom() {
  const container = document.querySelector(".app-container");
  if (!container) return;
  container.style.zoom = "";
  const scaleW = window.innerWidth / container.scrollWidth;
  const scaleH = window.innerHeight / container.scrollHeight;
  const scale = Math.min(scaleW, scaleH, 1);
  if (scale < 0.99) container.style.zoom = scale.toFixed(3);
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

// Helper: Cria card do vendedor
function createCloserCard(c, gmvVal, isLiveLeader = false, isQualified = false) {
  const card = document.createElement("div");
  card.className = "closer-card";
  
  if (c.eliminado) {
    card.classList.add("eliminated");
  } else {
    if (isLiveLeader) card.classList.add("live-leader");
    if (isQualified) card.classList.add("qualified");
  }

  card.innerHTML = `
    <div class="avatar-wrapper">
      <img src="${c.foto}" alt="${c.nome}" class="avatar-img" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
      <div class="flag-badge">
        <img src="${c.bandeira}" alt="${c.selecao}" class="flag-img">
      </div>
    </div>
    <div class="closer-details">
      <div class="closer-identity">
        <span class="closer-name">${c.nome}</span>
        <span class="closer-code">${c.code}</span>
      </div>
      <div class="closer-gmv">${formatCurrency(gmvVal)}</div>
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
    // Placeholder quando a fase anterior não terminou
    const emptyCard = document.createElement("div");
    emptyCard.className = "closer-card eliminated";
    emptyCard.style.justifyContent = "center";
    emptyCard.style.padding = "0.5rem";
    emptyCard.innerHTML = `<span class="closer-name" style="font-size: 0.65rem;">Aguardando fase anterior...</span>`;
    box.appendChild(emptyCard);
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

// Renderiza a tela estilo Brasileirão (Sexta-feira Jogo do Brasil)
function renderBrasilLeaderboard(container, res) {
  // Ordena os 11 closers por GMV de Sexta desc
  const ranking = Object.keys(res.closers)
    .map(c => res.closers[c])
    .sort((a, b) => b.gmv_brasil - a.gmv_brasil);

  const totalGeral = ranking.reduce((acc, c) => acc + c.gmv_brasil, 0);

  const wrapper = document.createElement("div");
  wrapper.className = "brasil-ranking-wrapper";
  
  wrapper.innerHTML = `
    <div class="brasil-header">
      <div class="brasil-header-title">
        <span class="brasil-icon-pulse">🇧🇷</span>
        <div class="brasil-header-text">
          <h2>Jogo do Brasil — Classificação Geral</h2>
          <p>Todos os 11 closers disputando o ranking geral do dia</p>
        </div>
      </div>
      <div class="brasil-total-acumulado">
        <div class="brasil-total-label">Faturamento Geral Sexta</div>
        <div class="brasil-total-valor">${formatCurrency(totalGeral)}</div>
      </div>
    </div>
    <div class="ranking-table-container">
      <table class="ranking-table">
        <thead>
          <tr>
            <th class="ranking-pos">Pos</th>
            <th>Vendedor</th>
            <th>Seleção</th>
            <th style="text-align: right;">GMV Sexta</th>
          </tr>
        </thead>
        <tbody>
        </tbody>
      </table>
    </div>
  `;

  const tbody = wrapper.querySelector("tbody");
  
  ranking.forEach((c, idx) => {
    const tr = document.createElement("tr");
    tr.className = "ranking-row";
    
    // Configura classe de pódio ou normal
    let posClass = "pos-normal";
    if (idx === 0) posClass = "pos-1";
    else if (idx === 1) posClass = "pos-2";
    else if (idx === 2) posClass = "pos-3";

    tr.classList.add(posClass);

    tr.innerHTML = `
      <td class="ranking-pos">${idx + 1}º</td>
      <td>
        <div class="ranking-closer-cell">
          <div class="ranking-avatar-wrapper">
            <img src="${c.foto}" alt="${c.nome}" class="ranking-avatar" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${c.nome}'">
            <div class="ranking-flag">
              <img src="${c.bandeira}" alt="${c.selecao}" style="width:100%; height:100%; object-fit:cover;">
            </div>
          </div>
          <div class="ranking-closer-info">
            <span class="ranking-closer-name">${c.nome}</span>
            <span class="ranking-closer-pmp">${c.code}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="ranking-selection-name">${c.selecao}</span>
      </td>
      <td class="ranking-gmv-cell">
        ${formatCurrency(c.gmv_brasil)}
      </td>
    `;
    tbody.appendChild(tr);
  });

  container.appendChild(wrapper);
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
