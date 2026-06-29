// ═══════════════════════════════════════════════════════════════════════════
// addMonth.gs — adiciona bloco de mês na Amarelinha e linhas em Metas
//
// Robustez (ver ../ERROS.md e nova_planilha_amarelinha/ERROS.md):
//  - Escritas EM LOTE (setValues / setBackgrounds / setColumnWidths) em vez de
//    celula-a-celula. Reduz drasticamente as chamadas ao servico Sheets e evita
//    "O servico Planilhas apresentou falha ao acessar o documento" (erro
//    transiente sob carga). Fonte: Apps Script Best Practices.
//  - breakApart() ANTES de merge() evita "E necessario selecionar todas as
//    celulas em um intervalo para mescla-las". Fonte: Range.breakApart (docs).
//  - addMonth e IDEMPOTENTE (_removeMonth no inicio) e roda dentro de _retry,
//    entao uma falha transiente pode ser repetida sem duplicar colunas.
//  - getMonthMapping DERIVA a coluna do mes lendo a planilha (linha 1), entao
//    remover/recriar meses nunca dessincroniza o mapeamento.
// ═══════════════════════════════════════════════════════════════════════════

// ── Entry point via menu ──────────────────────────────────────────────────
function menuAddMonth() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt(
    '➕ Adicionar mês',
    'Digite o mês no formato AAAA-MM (ex: 2026-07):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  const raw = resp.getResponseText().trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    ui.alert('Formato inválido. Use AAAA-MM, ex: 2026-07.');
    return;
  }

  // Se ja existe, confirma recriacao (apaga as alocacoes desse mes).
  if (_monthExists(raw)) {
    const c = ui.alert(
      'Mês já existe',
      'O mês ' + raw + ' já existe. Recriar? Isso APAGA as alocações desse mês.',
      ui.ButtonSet.YES_NO
    );
    if (c !== ui.Button.YES) return;
  }

  try {
    _retry(() => addMonth(raw), 3);
    ui.alert('✅ Mês ' + raw + ' adicionado com sucesso!');
  } catch (e) {
    ui.alert('Erro ao adicionar ' + raw + ': ' + e.message);
  }
}

// ── Core: idempotente e seguro para repetir ───────────────────────────────
function addMonth(mesStr) {
  const [year, month] = mesStr.split('-').map(Number);
  const numDays    = new Date(year, month, 0).getDate(); // dias no mês
  const monthLabel = _monthLabel(year, month);           // "Julho/2026"
  const monthColor = _monthColor(month);                 // cor do bloco

  // Limpa qualquer estado anterior/parcial deste mes (idempotencia / retry-safe).
  _removeMonth(mesStr);

  _addMonthToAmarelinha(mesStr, year, month, numDays, monthLabel, monthColor);
  _addMonthToMetas(mesStr, numDays);

  // Registra na lista de meses SOMENTE apos as escritas terem sucesso.
  _addToMonthList(mesStr);
  _updateExtratoDropdown(mesStr);

  SpreadsheetApp.flush();
}

// ── Retry com backoff para erros transientes do servico Sheets ────────────
function _retry(fn, attempts) {
  attempts = attempts || 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return fn();
    } catch (e) {
      lastErr = e;
      // So repete erro transiente de acesso ao documento; o resto sobe na hora.
      if (!/failed while accessing|falha ao acessar|try again|tente novamente/i
            .test(String(e && e.message))) {
        throw e;
      }
      Utilities.sleep(1000 * Math.pow(2, i)); // 1s, 2s, 4s
    }
  }
  throw lastErr;
}

// ── Amarelinha: adiciona bloco de colunas (tudo em lote) ──────────────────
function _addMonthToAmarelinha(mesStr, year, month, numDays, monthLabel, monthColor) {
  const sh = SH(ABA_AMAR);
  const lastVendRow = _getLastVendedorRow(sh);
  // Proxima coluna livre (apos os dados existentes, minimo col 3)
  const startCol = Math.max(sh.getLastColumn() + 1, AMAR_COL_PMP + 1);

  // Defensivo: desfaz merges remanescentes no bloco de cabecalho antes de mesclar.
  const numHeaderRows = AMAR_ROW_DOW - AMAR_ROW_MES + 1; // linhas mes+dia+dow
  sh.getRange(AMAR_ROW_MES, startCol, numHeaderRows, numDays).breakApart();

  // ── Linha 1: rotulo do mes (1 merge + 1 setValue) ─────────────────────
  // setNumberFormat('@') ANTES do setValue: em locale pt-BR o Sheets converte
  // "Julho/2026" para a data 01/07/2026 (serial 46204) se o formato for automatico.
  // getMonthMapping procura a STRING literal "Julho/2026" na linha 1; com a data
  // gravada ele nunca acha e o Extrato da "Mes nao encontrado". Forcar texto evita.
  sh.getRange(AMAR_ROW_MES, startCol, 1, numDays).merge()
    .setNumberFormat('@')
    .setValue(monthLabel)
    .setBackground(monthColor).setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(11).setFontFamily('Arial')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // ── Linhas 2 e 3: monta arrays e grava de uma vez (em lote) ───────────
  const PT_DOW = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const dias = [], dows = [], bgDia = [], fgDia = [], bgDow = [];
  for (let d = 1; d <= numDays; d++) {
    const dow = new Date(year, month - 1, d).getDay(); // 0=Dom
    const weekend = dow === 0 || dow === 6;
    dias.push(d);
    dows.push(PT_DOW[dow]);
    bgDia.push(weekend ? COLOR_WEEKEND_BG : COLOR_WEEKDAY_BG);
    fgDia.push(weekend ? COLOR_WEEKEND_FG : COLOR_WEEKDAY_FG);
    bgDow.push(weekend ? '#FCE4D6' : '#DEEAF1');
  }

  sh.getRange(AMAR_ROW_DIA, startCol, 1, numDays)
    .setValues([dias]).setBackgrounds([bgDia]).setFontColors([fgDia])
    .setFontWeight('bold').setFontSize(9).setFontFamily('Arial')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  sh.getRange(AMAR_ROW_DOW, startCol, 1, numDays)
    .setValues([dows]).setBackgrounds([bgDow]).setFontColors([fgDia])
    .setFontSize(8).setFontFamily('Arial')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');

  // Larguras (1 chamada para todas as colunas) + alturas das linhas
  sh.setColumnWidths(startCol, numDays, 40);
  sh.setRowHeight(AMAR_ROW_MES, 22);
  sh.setRowHeight(AMAR_ROW_DIA, 18);
  sh.setRowHeight(AMAR_ROW_DOW, 16);

  // ── Bloco de vendedores: backgrounds + bordas + validacao em lote ─────
  const numVend = lastVendRow - AMAR_DATA_ROW + 1;
  if (numVend > 0) {
    const bgGrid = [];
    for (let r = 0; r < numVend; r++) {
      const rowBg = r % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
      bgGrid.push(new Array(numDays).fill(rowBg));
    }
    const vendRange = sh.getRange(AMAR_DATA_ROW, startCol, numVend, numDays);
    vendRange.setBackgrounds(bgGrid)
      .setFontFamily('Arial').setFontSize(9)
      .setHorizontalAlignment('center').setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#CCCCCC',
                 SpreadsheetApp.BorderStyle.SOLID_THIN);

    const tags = _getAllTags(); // 1x, FORA do loop de vendedores
    if (tags.length > 0) {
      const rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(tags, true).build();
      vendRange.setDataValidation(rule); // mesma regra para todo o bloco
    }
  }
}

// ── Metas: insere linhas do mês ───────────────────────────────────────────
function _addMonthToMetas(mesStr, numDays) {
  const sh = SH(ABA_METAS);

  // Definição padrão dos produtos com meta
  // (tag, nome, meta default, diaInicio, diaFim, obs)
  const metasSeed = [
    ['FPF-L',   'FPF Lista de Espera',  0, 1,        numDays, 'Sub-meta FPF. Tags FPF-L e FPF-T.'],
    ['FPF-C',   'FPF Carrinho',         0, 1,        numDays, 'Sub-meta FPF. Tags FPF-C e FPF-T.'],
    ['FCE',     'FCE Perpétuo',         0, 1,        Math.min(24, numDays), 'Janela dia 1-24. Tag FCE.'],
    ['FCE',     'FCE Lançamento',       0, Math.min(25, numDays), numDays, 'Janela dia 25-fim. Tag FCE.'],
    ['GRV',     'Grão',                 0, 1,        numDays, ''],
    ['REN0001', 'Renovação',            0, 1,        numDays, ''],
    ['Portfel', 'Portfel',              0, 1,        numDays, 'Sem meta monetária'],
    ['ANC',     'Ancora',               0, 1,        numDays, ''],
    ['OLG',     'OLG',                  0, 1,        numDays, 'Excluído de metas'],
    ['FCS',     'FCS',                  0, 1,        numDays, ''],
    ['FIA',     'FIA',                  0, 1,        numDays, ''],
  ];

  const insertRow = sh.getLastRow() + 1;
  const rows = metasSeed.map(([tag, nome, meta, dIni, dFim, obs]) =>
    [mesStr, tag, nome, meta, dIni, dFim, obs]
  );

  // Forcar texto na coluna Mes ANTES de gravar: em pt-BR "2026-07" pode virar data,
  // e _getMetasForMonth compara String(mes) === mesStr (falharia com a data).
  sh.getRange(insertRow, 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(insertRow, 1, rows.length, 7).setValues(rows);

  // Formata: fundo amarelo (input) em meta + datas
  sh.getRange(insertRow, 4, rows.length, 3).setBackground('#FFF2CC').setFontFamily('Arial');
  sh.getRange(insertRow, 4, rows.length, 1).setNumberFormat('R$ #,##0.00');

  // Cor de linha alternada (em lote: 1 array de backgrounds por bloco)
  const bgGrid = rows.map((_, i) =>
    new Array(3).fill(i % 2 === 0 ? '#FFFFFF' : '#F2F8FD')
  );
  sh.getRange(insertRow, 1, rows.length, 3).setBackgrounds(bgGrid).setFontFamily('Arial');
  sh.getRange(insertRow, 7, rows.length, 1)
    .setBackgrounds(bgGrid.map(r => [r[0]])).setFontFamily('Arial');

  // Negrito no mês (primeira coluna)
  sh.getRange(insertRow, 1, rows.length, 1).setFontWeight('bold');
}

// ── Remove um mes: colunas na Amarelinha + linhas na Metas + lista ────────
// Idempotente: se o mes nao existe, e um no-op.
function _removeMonth(mesStr) {
  const sh = SH(ABA_AMAR);

  // 1. Colunas na Amarelinha (breakApart antes — nao da pra deletar coluna com merge atravessando)
  const mapping = getMonthMapping(mesStr);
  if (mapping) {
    const numHeaderRows = AMAR_ROW_DOW - AMAR_ROW_MES + 1; // linhas mes+dia+dow
    sh.getRange(AMAR_ROW_MES, mapping.startCol, numHeaderRows, mapping.numDays).breakApart();
    sh.deleteColumns(mapping.startCol, mapping.numDays);
  }

  // 2. Linhas da Metas com esse mes (coluna A), de baixo pra cima
  const shM = SH(ABA_METAS);
  if (shM && shM.getLastRow() >= 2) {
    const colA = shM.getRange(2, 1, shM.getLastRow() - 1, 1).getValues();
    for (let i = colA.length - 1; i >= 0; i--) {
      if (String(colA[i][0]).trim() === mesStr) shM.deleteRow(i + 2);
    }
  }

  // 3. Remove da lista de meses
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('month_list', JSON.stringify(_getMonthList().filter(m => m !== mesStr)));
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Existencia derivada da planilha (nao depende de props desatualizadas).
function _monthExists(mesStr) {
  return getMonthMapping(mesStr) !== null;
}

// Mapeamento mes -> colunas, DERIVADO da planilha (sempre consistente, mesmo
// apos remover/recriar meses, que deslocam colunas).
function getMonthMapping(mesStr) {
  const sh = SH(ABA_AMAR);
  if (!sh) return null;
  const lastCol = sh.getLastColumn();
  if (lastCol < AMAR_COL_PMP + 1) return null;

  const [year, month] = mesStr.split('-').map(Number);
  const label = _monthLabel(year, month);
  const row1 = sh.getRange(AMAR_ROW_MES, 1, 1, lastCol).getValues()[0];
  const idx = row1.indexOf(label); // celula mesclada: rotulo so no top-left
  if (idx === -1) return null;

  return { startCol: idx + 1, numDays: new Date(year, month, 0).getDate() };
}

// Lista ordenada de meses (usada no dropdown do Extrato).
function _addToMonthList(mesStr) {
  const props = PropertiesService.getDocumentProperties();
  const lista = _getMonthList();
  if (!lista.includes(mesStr)) {
    lista.push(mesStr);
    lista.sort();
    props.setProperty('month_list', JSON.stringify(lista));
  }
}

function _getMonthList() {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty('month_list');
  return raw ? JSON.parse(raw) : [];
}

function _monthLabel(year, month) {
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return names[month - 1] + '/' + year;
}

function _monthColor(month) {
  return MONTH_COLORS[(month - 1) % MONTH_COLORS.length];
}

function _getLastVendedorRow(sh) {
  // Última linha com dado na coluna A (nome do vendedor)
  const last = sh.getLastRow();
  if (last < AMAR_DATA_ROW) return AMAR_DATA_ROW - 1; // sem vendedores
  const vals = sh.getRange(AMAR_DATA_ROW, AMAR_COL_NOME, last - AMAR_DATA_ROW + 1, 1).getValues();
  let lastRow = AMAR_DATA_ROW - 1;
  vals.forEach((r, i) => { if (r[0]) lastRow = AMAR_DATA_ROW + i; });
  return lastRow;
}

function _getAllTags() {
  const sh = SH(ABA_PROD);
  if (!sh || sh.getLastRow() < 2) return [];
  const vals = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  return vals.map(r => r[0]).filter(v => v && v !== '');
}

function _updateExtratoDropdown(mesStr) {
  const sh = SH(ABA_EXT);
  if (!sh) return;
  const meses = _getMonthList();
  // Forcar texto: senao o Sheets (pt-BR) converte "2026-07" para a data 46204, e
  // tanto o onEdit (regex AAAA-MM) quanto o getMonthMapping deixam de reconhecer o mes.
  sh.getRange('B2').setNumberFormat('@');
  const val = SpreadsheetApp.newDataValidation()
    .requireValueInList(meses, true).build();
  sh.getRange('B2').setDataValidation(val);
  // Se nao tiver mes selecionado, seleciona o mais recente
  if (!sh.getRange('B2').getValue() && meses.length > 0) {
    sh.getRange('B2').setValue(meses[meses.length - 1]);
  }
}
