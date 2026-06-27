// ═══════════════════════════════════════════════════════════════════════════
// addMonth.gs — adiciona bloco de mês na Amarelinha e linhas em Metas
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

  try {
    addMonth(raw);
    ui.alert('✅ Mês ' + raw + ' adicionado com sucesso!');
  } catch (e) {
    ui.alert('Erro: ' + e.message);
  }
}

// ── Core function ─────────────────────────────────────────────────────────
function addMonth(mesStr) {
  // mesStr = "2026-07"
  const [year, month] = mesStr.split('-').map(Number);

  // Verifica se já existe
  if (_monthExists(mesStr)) {
    throw new Error('O mês ' + mesStr + ' já existe na Amarelinha.');
  }

  const numDays = new Date(year, month, 0).getDate(); // dias no mês
  const monthLabel = _monthLabel(year, month);         // "Julho/2026"
  const monthColor = _monthColor(month);               // cor do bloco

  _addMonthToAmarelinha(mesStr, year, month, numDays, monthLabel, monthColor);
  _addMonthToMetas(mesStr, numDays);
  _updateExtratoDropdown(mesStr);
}

// ── Amarelinha: adiciona bloco de colunas ────────────────────────────────
function _addMonthToAmarelinha(mesStr, year, month, numDays, monthLabel, monthColor) {
  const sh = SH(ABA_AMAR);
  const lastCol = sh.getLastColumn();

  // Próxima coluna disponível (após os dados existentes, mínimo col 3)
  const startCol = Math.max(lastCol + 1, AMAR_COL_PMP + 1);
  const endCol   = startCol + numDays - 1;

  // ── Linha 1: merge + rótulo do mês ─────────────────────────────────────
  const mesMergeRange = sh.getRange(AMAR_ROW_MES, startCol, 1, numDays);
  mesMergeRange.merge()
    .setValue(monthLabel)
    .setBackground(monthColor)
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11)
    .setFontFamily('Arial')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sh.setRowHeight(AMAR_ROW_MES, 22);

  // ── Linhas 2 e 3: dia e dia-da-semana ──────────────────────────────────
  const PT_DOW = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  for (let d = 1; d <= numDays; d++) {
    const col  = startCol + d - 1;
    const date = new Date(year, month - 1, d);
    const dow  = date.getDay(); // 0=Dom
    const isWeekend = dow === 0 || dow === 6;
    const bgDay = isWeekend ? COLOR_WEEKEND_BG : COLOR_WEEKDAY_BG;
    const fgDay = isWeekend ? COLOR_WEEKEND_FG : COLOR_WEEKDAY_FG;

    // Dia numérico
    sh.getRange(AMAR_ROW_DIA, col)
      .setValue(d)
      .setBackground(bgDay)
      .setFontColor(fgDay)
      .setFontWeight('bold')
      .setFontSize(9)
      .setFontFamily('Arial')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    // Dia da semana
    sh.getRange(AMAR_ROW_DOW, col)
      .setValue(PT_DOW[dow])
      .setBackground(isWeekend ? '#FCE4D6' : '#DEEAF1')
      .setFontColor(fgDay)
      .setFontSize(8)
      .setFontFamily('Arial')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle');

    sh.setColumnWidth(col, 40);
  }
  sh.setRowHeight(AMAR_ROW_DIA, 18);
  sh.setRowHeight(AMAR_ROW_DOW, 16);

  // ── Linhas de vendedor: células em branco formatadas ──────────────────
  const lastVendRow = _getLastVendedorRow(sh);

  for (let row = AMAR_DATA_ROW; row <= lastVendRow; row++) {
    const rowBg = (row - AMAR_DATA_ROW) % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
    const range = sh.getRange(row, startCol, 1, numDays);
    range.setBackground(rowBg)
      .setFontFamily('Arial')
      .setFontSize(9)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setBorder(true, true, true, true, true, true, '#CCCCCC',
                 SpreadsheetApp.BorderStyle.SOLID_THIN);

    // Tag validation — dropdown com todas as tags cadastradas
    const tags = _getAllTags();
    if (tags.length > 0) {
      const val = SpreadsheetApp.newDataValidation()
        .requireValueInList(tags, true).build();
      range.setDataValidation(val);
    }
  }

  // ── Armazena mapeamento mês→coluna para o Extrato ─────────────────────
  _storeMonthMapping(mesStr, startCol, numDays);
}

// ── Metas: insere linhas do mês ───────────────────────────────────────────
function _addMonthToMetas(mesStr, numDays) {
  const sh = SH(ABA_METAS);
  const [year, month] = mesStr.split('-').map(Number);

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

  // Encontra última linha com dados
  const lastRow = sh.getLastRow();
  const insertRow = lastRow + 1;

  const rows = metasSeed.map(([tag, nome, meta, dIni, dFim, obs]) =>
    [mesStr, tag, nome, meta, dIni, dFim, obs]
  );

  sh.getRange(insertRow, 1, rows.length, 7).setValues(rows);

  // Formata: fundo amarelo (input) em meta + datas
  const metaRange = sh.getRange(insertRow, 4, rows.length, 3);
  metaRange.setBackground('#FFF2CC').setFontFamily('Arial');
  sh.getRange(insertRow, 4, rows.length, 1).setNumberFormat('R$ #,##0.00');

  // Cor de linha alternada
  rows.forEach((_, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
    sh.getRange(insertRow + i, 1, 1, 3).setBackground(bg).setFontFamily('Arial');
    sh.getRange(insertRow + i, 7, 1, 1).setBackground(bg).setFontFamily('Arial');
  });

  // Negrito no mês da primeira coluna
  sh.getRange(insertRow, 1, rows.length, 1).setFontWeight('bold');

  SpreadsheetApp.flush();
}

// ── Helpers ───────────────────────────────────────────────────────────────
function _monthExists(mesStr) {
  const sh = SH(ABA_AMAR);
  const lastCol = sh.getLastColumn();
  if (lastCol < 3) return false;
  const row1 = sh.getRange(AMAR_ROW_MES, 3, 1, lastCol - 2).getValues()[0];
  // O mês fica nas células de nota nas propriedades — verificamos via PropertiesService
  const props = PropertiesService.getDocumentProperties();
  return !!props.getProperty('month_col_' + mesStr);
}

function _storeMonthMapping(mesStr, startCol, numDays) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty('month_col_' + mesStr, JSON.stringify({ startCol, numDays }));
  // Atualiza lista ordenada de meses
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

function getMonthMapping(mesStr) {
  const props = PropertiesService.getDocumentProperties();
  const raw = props.getProperty('month_col_' + mesStr);
  return raw ? JSON.parse(raw) : null;
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
  const vals = sh.getRange(AMAR_DATA_ROW, AMAR_COL_NOME, sh.getLastRow() - AMAR_DATA_ROW + 1, 1).getValues();
  let last = AMAR_DATA_ROW;
  vals.forEach((r, i) => { if (r[0]) last = AMAR_DATA_ROW + i; });
  return last;
}

function _getAllTags() {
  const sh = SH(ABA_PROD);
  if (!sh) return [];
  const vals = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues();
  return vals.map(r => r[0]).filter(v => v && v !== '');
}

function _updateExtratoDropdown(mesStr) {
  const sh = SH(ABA_EXT);
  if (!sh) return;
  const meses = _getMonthList();
  const val = SpreadsheetApp.newDataValidation()
    .requireValueInList(meses, true).build();
  sh.getRange('B2').setDataValidation(val);
  // Se não tiver mês selecionado, seleciona o mais recente
  if (!sh.getRange('B2').getValue()) {
    sh.getRange('B2').setValue(meses[meses.length - 1]);
  }
}
