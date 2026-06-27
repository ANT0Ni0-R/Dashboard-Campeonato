// ═══════════════════════════════════════════════════════════════════════════
// utils.gs — recolorir, trigger de cor automática na Amarelinha
// ═══════════════════════════════════════════════════════════════════════════

// ── Recolorir Amarelinha (menu) ───────────────────────────────────────────
// Percorre todas as células preenchidas e aplica a cor da tag
function recolorAmarelinha() {
  const sh = SH(ABA_AMAR);
  const lastCol = sh.getLastColumn();
  const lastRow = sh.getLastRow();
  if (lastRow < AMAR_DATA_ROW || lastCol < AMAR_COL_PMP + 1) return;

  const numCols = lastCol - AMAR_COL_PMP;
  const numRows = lastRow - AMAR_DATA_ROW + 1;

  const data = sh.getRange(AMAR_DATA_ROW, AMAR_COL_PMP + 1, numRows, numCols).getValues();
  const bgs  = [];
  const fgs  = [];

  data.forEach((row, ri) => {
    const rowBg_default = ri % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
    const bgRow = [];
    const fgRow = [];
    row.forEach(cell => {
      const tag = String(cell || '').trim();
      const bg  = TAG_COLORS[tag] || rowBg_default;
      const isActive = tag && tag !== '' && tag !== 'OFF' && tag !== 'OLG';
      bgRow.push(bg);
      fgRow.push(isActive ? '#1F3864' : '#888888');
    });
    bgs.push(bgRow);
    fgs.push(fgRow);
  });

  const range = sh.getRange(AMAR_DATA_ROW, AMAR_COL_PMP + 1, numRows, numCols);
  range.setBackgrounds(bgs).setFontColors(fgs)
    .setFontSize(9).setHorizontalAlignment('center').setFontFamily('Arial');

  SpreadsheetApp.getUi().alert('✅ Amarelinha recolorida!');
}

// ── onEdit: cor automática ao preencher célula na Amarelinha ─────────────
// Nota: o onEdit simples não dispara para edições via script/API.
// Para atualizações manuais, essa função aplica cor em tempo real.
function onEdit(e) {
  const sh    = e.range.getSheet();
  const shName = sh.getName();

  // ── Extrato: seletor de mês ──────────────────────────────────────────
  if (shName === ABA_EXT && e.range.getRow() === 2 && e.range.getColumn() === 2) {
    const mesStr = e.range.getValue();
    if (mesStr && /^\d{4}-(0[1-9]|1[0-2])$/.test(mesStr)) {
      recalcExtrato(mesStr);
    }
    return;
  }

  // ── Amarelinha: colorir célula ao digitar tag ─────────────────────────
  if (shName !== ABA_AMAR) return;
  const row = e.range.getRow();
  const col = e.range.getColumn();
  if (row < AMAR_DATA_ROW || col <= AMAR_COL_PMP) return;

  // Verifica se a coluna pertence a algum mês
  const tag    = String(e.range.getValue() || '').trim();
  const rowBg  = (row - AMAR_DATA_ROW) % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
  const bg     = TAG_COLORS[tag] || rowBg;
  const isActive = tag && tag !== '' && tag !== 'OFF' && tag !== 'OLG';

  e.range
    .setBackground(bg)
    .setFontColor(isActive ? '#1F3864' : '#888888')
    .setFontSize(9)
    .setFontWeight(isActive ? 'bold' : 'normal')
    .setHorizontalAlignment('center')
    .setFontFamily('Arial');
}

// ── Instala trigger onEdit como installable (necessário para acesso a PropertiesService) ──
function installTriggers() {
  const ss = SS();
  // Remove triggers antigos para evitar duplicatas
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert('✅ Trigger instalado com sucesso!');
}

// ── Utilitário: força recalc do extrato para o mês atual selecionado ─────
function forceRecalcExtrato() {
  const shExt = SH(ABA_EXT);
  if (!shExt) return;
  const mesStr = shExt.getRange('B2').getValue();
  if (!mesStr) {
    SpreadsheetApp.getUi().alert('Selecione um mês no dropdown B2 do Extrato primeiro.');
    return;
  }
  recalcExtrato(String(mesStr).trim());
  SpreadsheetApp.getUi().alert('✅ Extrato recalculado para ' + mesStr);
}

// ── Adiciona item extra ao menu ────────────────────────────────────────────
// Chamada no onOpen após criar o menu base
function _addUtilMenuItems(menu) {
  return menu
    .addSeparator()
    .addItem('🔁 Recalcular Extrato agora', 'forceRecalcExtrato')
    .addItem('🔧 Instalar trigger (1ª vez)', 'installTriggers');
}
