// teste.js — Versão de TESTE do dashboard
// Objetivos:
//   1) Validar a conexão real com o Supabase
//   2) Replicar o front do ranking estilo "Jogo do Brasil" (Brasileirão)
//   3) Somar a RECEITA por vendedor nos últimos 30 dias, INDEPENDENTE do produto
//   4) Validar a atualização automática com sinal visual a cada refresh

// Janela de apuração: últimos 30 dias a partir de agora
const DIAS_JANELA = 30;

// Intervalo de polling. Usa o do config se existir; cai para 30s no teste.
const POLL_SEGUNDOS = (window.COMPETICAO && COMPETICAO.supabase && COMPETICAO.supabase.poll_segundos)
  ? COMPETICAO.supabase.poll_segundos
  : 30;

let pollInterval = null;
let lastSnapshot = {};   // { code: receita } da última renderização (p/ destacar mudanças)
let updateCount = 0;

window.addEventListener("DOMContentLoaded", () => {
  renderControls();
  refresh();
  startPolling();
});

// ---- Polling / atualização automática ----
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(refresh, POLL_SEGUNDOS * 1000);
}

async function refresh() {
  showLoading(true);
  try {
    const rows = await fetchUltimos30Dias();
    const ranking = agregarPorVendedor(rows);
    renderRanking(ranking, rows.length);
    showStatusDot("success");
    sinalizarAtualizacao();
  } catch (err) {
    console.error("[TESTE] Erro ao atualizar:", err);
    showStatusDot("error");
  } finally {
    showLoading(false);
    document.getElementById("last-update").textContent =
      new Date().toLocaleTimeString("pt-BR");
  }
}

// ---- Conexão com o Supabase ----
// Busca TODAS as transações order_success dos últimos 30 dias, sem filtrar produto.
async function fetchUltimos30Dias() {
  const cfg = COMPETICAO.supabase;
  if (!cfg || !cfg.url || !cfg.anon_key || cfg.url.includes("[A DEFINIR]")) {
    throw new Error("Credenciais do Supabase ausentes no config.js");
  }

  const desde = new Date(Date.now() - DIAS_JANELA * 24 * 60 * 60 * 1000).toISOString();

  // Sem filtro de slug/produto: pega a receita de qualquer produto na janela.
  const url = `${cfg.url}/rest/v1/${cfg.tabela}`
    + `?type=eq.order_success`
    + `&select=price,pmp,created_at`
    + `&created_at=gte.${encodeURIComponent(desde)}`
    + `&price=not.is.null`
    + `&limit=50000`;

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      apikey: cfg.anon_key,
      Authorization: `Bearer ${cfg.anon_key}`
    }
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Supabase HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  return await resp.json();
}

// ---- Agregação: receita total por vendedor ----
function agregarPorVendedor(rows) {
  const vendedores = COMPETICAO.vendedores || {};
  const acc = {};

  Object.keys(vendedores).forEach(code => {
    acc[code] = {
      code,
      nome: vendedores[code].nome,
      selecao: vendedores[code].selecao,
      foto: vendedores[code].foto ? "../" + vendedores[code].foto : "",
      bandeira: vendedores[code].bandeira ? "../" + vendedores[code].bandeira : "",
      receita: 0,
      vendas: 0
    };
  });

  rows.forEach(t => {
    if (!t.pmp || t.price == null) return;
    // seller_code = última parte do pmp (split por '-')
    const segs = t.pmp.split("-");
    const code = segs[segs.length - 1].toUpperCase();
    if (code.length !== 3 || !acc[code]) return;
    acc[code].receita += Number(t.price) || 0;
    acc[code].vendas += 1;
  });

  return Object.values(acc).sort((a, b) => b.receita - a.receita);
}

// ---- Render: ranking estilo Brasileirão ----
function formatCurrency(val) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);
}

function renderControls() {
  const body = document.getElementById("dashboard-body");
  const bar = document.createElement("div");
  bar.className = "test-controls";
  bar.innerHTML = `
    <button class="test-btn" id="btn-refresh">🔄 Forçar atualização</button>
    <span class="test-meta">
      Polling automático a cada <strong>${POLL_SEGUNDOS}s</strong>
      · Janela: <strong>últimos ${DIAS_JANELA} dias</strong>
      · Atualizações nesta sessão: <strong id="update-counter">0</strong>
    </span>
  `;
  body.appendChild(bar);
  bar.querySelector("#btn-refresh").addEventListener("click", refresh);
}

function renderRanking(ranking, totalRows) {
  const container = document.getElementById("dashboard-body");

  // Mantém a barra de controles; remove só o ranking anterior
  const prev = container.querySelector(".brasil-ranking-wrapper, .empty-state");
  if (prev) prev.remove();

  const totalReceita = ranking.reduce((s, c) => s + c.receita, 0);

  if (totalReceita === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <div class="empty-icon">📭</div>
      <div>Conexão OK, mas nenhuma receita encontrada para os vendedores cadastrados nos últimos ${DIAS_JANELA} dias.</div>
      <div style="font-size:0.8rem;">${totalRows} transações recebidas do Supabase.</div>
    `;
    container.appendChild(empty);
    lastSnapshot = {};
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "brasil-ranking-wrapper";
  wrapper.innerHTML = `
    <div class="brasil-header">
      <div class="brasil-header-title">
        <span class="brasil-icon-pulse">💰</span>
        <div class="brasil-header-text">
          <h2>Receita por Vendedor — Últimos ${DIAS_JANELA} dias</h2>
          <p>Todos os produtos · ${totalRows} transações apuradas via Supabase</p>
        </div>
      </div>
      <div class="brasil-total-acumulado">
        <div class="brasil-total-label">Receita Total</div>
        <div class="brasil-total-valor">${formatCurrency(totalReceita)}</div>
      </div>
    </div>
    <div class="ranking-table-container">
      <table class="ranking-table">
        <thead>
          <tr>
            <th class="ranking-pos">Pos</th>
            <th>Vendedor</th>
            <th>Vendas</th>
            <th style="text-align: right;">Receita (30d)</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  const tbody = wrapper.querySelector("tbody");
  const newSnapshot = {};

  ranking.forEach((c, idx) => {
    newSnapshot[c.code] = c.receita;
    const changed = lastSnapshot[c.code] !== undefined && lastSnapshot[c.code] !== c.receita;

    const tr = document.createElement("tr");
    let posClass = "pos-normal";
    if (idx === 0) posClass = "pos-1";
    else if (idx === 1) posClass = "pos-2";
    else if (idx === 2) posClass = "pos-3";
    tr.className = `ranking-row ${posClass}${changed ? " value-changed" : ""}`;

    tr.innerHTML = `
      <td class="ranking-pos">${idx + 1}º</td>
      <td>
        <div class="ranking-closer-cell">
          <div class="ranking-avatar-wrapper">
            <img src="${c.foto}" alt="${c.nome}" class="ranking-avatar" onerror="this.src='https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(c.nome)}'">
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
      <td><span class="ranking-selection-name">${c.vendas} venda(s)</span></td>
      <td class="ranking-gmv-cell">${formatCurrency(c.receita)}</td>
    `;
    tbody.appendChild(tr);
  });

  container.appendChild(wrapper);
  lastSnapshot = newSnapshot;
}

// ---- Sinais visuais ----
function sinalizarAtualizacao() {
  updateCount++;
  const counter = document.getElementById("update-counter");
  if (counter) counter.textContent = updateCount;

  // Flash dourado no quadro do ranking
  const wrapper = document.querySelector(".brasil-ranking-wrapper");
  if (wrapper) {
    wrapper.classList.remove("flash");
    void wrapper.offsetWidth; // força reflow p/ reiniciar a animação
    wrapper.classList.add("flash");
  }

  // Toast no canto
  const toast = document.getElementById("update-toast");
  const txt = document.getElementById("update-toast-text");
  if (toast && txt) {
    txt.textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR")}`;
    toast.classList.remove("show");
    void toast.offsetWidth;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }
}

function showLoading(isLoading) {
  const dot = document.getElementById("status-dot");
  if (!dot) return;
  dot.classList.toggle("loading", isLoading);
  if (isLoading) dot.classList.remove("error");
}

function showStatusDot(status) {
  const dot = document.getElementById("status-dot");
  const label = document.getElementById("status-label");
  if (!dot || !label) return;
  dot.className = "status-dot";
  if (status === "success") {
    dot.classList.add("success");
    label.textContent = "Conectado ao Supabase";
  } else {
    dot.classList.add("error");
    label.textContent = "Erro de conexão Supabase";
  }
}
