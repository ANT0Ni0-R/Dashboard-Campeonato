// ═══════════════════════════════════════════════════════════════════════════
// AMARELINHA v3 — Apps Script principal
// Grupo Primo · Sales Ops
// ═══════════════════════════════════════════════════════════════════════════

// ── Constantes globais ────────────────────────────────────────────────────
const SS         = () => SpreadsheetApp.getActiveSpreadsheet();
const SH         = (name) => SS().getSheetByName(name);

const ABA_AMAR   = 'Amarelinha';
const ABA_METAS  = 'Metas por Produto';
const ABA_PROD   = 'Produtos';
const ABA_EXT    = 'Extrato';
const ABA_LISTA  = 'Lista';

// Linha onde começa o cabeçalho da Amarelinha
const AMAR_ROW_MES  = 1;   // linha 1: merge do mês
const AMAR_ROW_DIA  = 2;   // linha 2: número do dia
const AMAR_ROW_DOW  = 3;   // linha 3: dia da semana (Seg, Ter…)
const AMAR_DATA_ROW = 4;   // linha 4: primeira linha de vendedor

// Colunas fixas da Amarelinha
const AMAR_COL_NOME = 1;   // A: nome curto
const AMAR_COL_PMP  = 2;   // B: PMP

// Cores dos meses (ciclam a cada 12)
const MONTH_COLORS = [
  '#1F3864','#2E75B6','#2E4057','#0F6E56','#533483',
  '#BA4A00','#1A5276','#145A32','#6E2F1A','#1B2631',
  '#4A235A','#7B241C'
];

// Cores de fim de semana (fundo claro)
const COLOR_WEEKEND_BG  = '#FCE4D6';
const COLOR_WEEKEND_FG  = '#C00000';
const COLOR_WEEKDAY_BG  = '#BDD7EE';
const COLOR_WEEKDAY_FG  = '#1F3864';

// Mapa de cores por tag (background das células)
const TAG_COLORS = {
  'FPF-L':    '#D6E4F7',
  'FPF-C':    '#BDD7EE',
  'FPF-T':    '#9DC3E6',
  'FCE':      '#FFD7D7',
  'GRV':      '#E2EFDA',
  'REN0001':  '#FFF2CC',
  'Portfel':  '#E8D5F5',
  'ANC':      '#FDEBD7',
  'OLG':      '#F0F0F0',
  'FCS':      '#D5F5E3',
  'FIA':      '#FAE5D3',
  'OFF':      '#F5F5F5',
};

// ── Instalação do menu customizado ───────────────────────────────────────
function onOpen() {
  const menu = SpreadsheetApp.getUi()
    .createMenu('🗓️ Amarelinha')
    .addItem('➕ Adicionar mês…',           'menuAddMonth')
    .addItem('🔄 Recolorir Amarelinha',     'recolorAmarelinha')
    .addItem('🔁 Recalcular Extrato agora', 'forceRecalcExtrato')
    .addSeparator()
    .addItem('📋 Setup inicial (1ª vez)',   'setupInitial')
    .addItem('🔧 Instalar trigger (1ª vez)','installTriggers');
  menu.addToUi();
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP INICIAL — cria todas as abas e estrutura base
// ═══════════════════════════════════════════════════════════════════════════
function setupInitial() {
  const ss = SS();
  const ui = SpreadsheetApp.getUi();

  const resp = ui.alert(
    'Setup inicial',
    'Isso vai criar (ou recriar) todas as abas da Amarelinha v3.\n\nContinuar?',
    ui.ButtonSet.YES_NO
  );
  if (resp !== ui.Button.YES) return;

  _createProdutos(ss);
  _createMetas(ss);
  _createAmarelinha(ss);
  _createExtrato(ss);
  _createLista(ss);

  // Ordena as abas
  const order = [ABA_PROD, ABA_METAS, ABA_AMAR, ABA_EXT, ABA_LISTA];
  order.forEach((name, i) => {
    const sh = ss.getSheetByName(name);
    if (sh) {
      ss.setActiveSheet(sh);
      ss.moveActiveSheet(i + 1);
    }
  });

  ss.setActiveSheet(ss.getSheetByName(ABA_AMAR));
  ui.alert('✅ Setup concluído!', 'Abas criadas. Use "Adicionar mês" para incluir Julho/2026 em diante.', ui.ButtonSet.OK);
}

// ── Aba Produtos ──────────────────────────────────────────────────────────
function _createProdutos(ss) {
  let sh = ss.getSheetByName(ABA_PROD);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(ABA_PROD);
  sh.setTabColor('#4472C4');

  const headers = ['#','Tag (Código)','Nome do Produto','Produto Pai','Excluir de Metas?','Observações'];
  const data = [
    [1,'FPF-L','FPF Lista de Espera','FPF','Não','Tag para vendedores na fila de espera FPF'],
    [2,'FPF-C','FPF Carrinho','FPF','Não','Tag para vendedores no carrinho FPF'],
    [3,'FPF-T','FPF Ambos','FPF','Não','Conta para FPF-L e FPF-C simultaneamente'],
    [4,'FCE','FCE','','Não','Perpétuo (dias 1-24) + Lançamento (dias 25-30)'],
    [5,'GRV','Grão','','Não',''],
    [6,'REN0001','Renovação','','Não',''],
    [7,'Portfel','Portfel','','Sim','Sem meta monetária'],
    [8,'ANC','Ancora','','Não',''],
    [9,'OLG','OLG / Legado','','Sim','Excluído das metas de produto'],
    [10,'FCS','FCS','','Sim',''],
    [11,'FIA','FIA','','Não',''],
    [12,'OFF','Folga / OFF','','Sim','Não conta como dia trabalhado'],
  ];

  sh.getRange('A1:F1').setValues([headers])
    .setBackground('#2E75B6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  sh.getRange(2, 1, data.length, 6).setValues(data);

  // Alternating rows
  data.forEach((_, i) => {
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
    sh.getRange(i + 2, 1, 1, 6).setBackground(bg);
  });

  // Validation: col E
  const tagVal = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Sim','Não'], true).build();
  sh.getRange('E2:E100').setDataValidation(tagVal);

  sh.setColumnWidth(1, 40);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 140);
  sh.setColumnWidth(6, 300);
  sh.setFrozenRows(1);
  sh.getRange('A1:F1').setFontFamily('Arial');
}

// ── Aba Metas por Produto ─────────────────────────────────────────────────
function _createMetas(ss) {
  let sh = ss.getSheetByName(ABA_METAS);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(ABA_METAS);
  sh.setTabColor('#ED7D31');

  const headers = ['Mês','Tag (Código)','Nome / Linha de Meta','Meta (R$)','Dia Início','Dia Fim','Observações'];
  sh.getRange('A1:G1').setValues([headers])
    .setBackground('#2E75B6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center');

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 130);
  sh.setColumnWidth(5, 90);
  sh.setColumnWidth(6, 90);
  sh.setColumnWidth(7, 300);
  sh.setFrozenRows(1);

  // Formato moeda na col D
  sh.getRange('D2:D1000').setNumberFormat('R$ #,##0.00');

  sh.getRange('A1:G1').setFontFamily('Arial');

  // Nota de uso
  sh.getRange('A' + (sh.getMaxRows())).setValue(
    '💡 Use "Adicionar mês" no menu para pré-preencher as linhas de meta de um novo mês.'
  ).setFontColor('#595959').setFontStyle('italic').setFontSize(9);
}

// ── Aba Amarelinha ────────────────────────────────────────────────────────
function _createAmarelinha(ss) {
  let sh = ss.getSheetByName(ABA_AMAR);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(ABA_AMAR);
  sh.setTabColor('#2E75B6');

  // Colunas fixas: A = nome, B = PMP
  sh.getRange('A1:B3').merge(); // placeholder
  sh.getRange('A1').setValue('Vendedor / PMP')
    .setBackground('#1F3864').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center')
    .setVerticalAlignment('middle').setFontFamily('Arial');

  // Linhas fixas de cabeçalho
  sh.getRange('A2:B2').merge().setValue('Nome').setBackground('#1F3864')
    .setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setFontFamily('Arial');
  sh.getRange('A3').setValue('PMP').setBackground('#1F3864')
    .setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center').setFontFamily('Arial');

  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 80);
  sh.setRowHeight(1, 22);
  sh.setRowHeight(2, 18);
  sh.setRowHeight(3, 18);
  sh.setFrozenColumns(2);
  sh.setFrozenRows(3);

  // Adiciona os vendedores padrão (A4 em diante)
  const vendedores = [
    ['Camila','CCL'],
    ['Diniz','HDZ'],
    ['Henrique','HMD'],
    ['Hudson','HUM'],
    ['Thayna','THS'],
    ['Enzo','EZB'],
    ['Fernando','FAL'],
    ['Jackson','JKC'],
    ['João Pedro','JPP'],
    ['Nathan','NCS'],
    ['Monica','MDR'],
    ['Tamiles','TJS'],
    ['Harry','HLM'],
    ['Pedro','PHM'],
    ['Bruna','BPS'],
    ['Igor (Freela)','A definir'],
    ['Wesley (Freela)','A definir'],
  ];

  vendedores.forEach(([nome, pmp], i) => {
    const row = AMAR_DATA_ROW + i;
    const bg = i % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
    sh.getRange(row, AMAR_COL_NOME).setValue(nome)
      .setBackground(bg).setFontWeight('bold').setFontFamily('Arial').setFontSize(10);
    sh.getRange(row, AMAR_COL_PMP).setValue(pmp)
      .setBackground(bg).setHorizontalAlignment('center').setFontFamily('Arial').setFontSize(10);
    sh.setRowHeight(row, 18);
  });
}

// ── Aba Extrato ───────────────────────────────────────────────────────────
function _createExtrato(ss) {
  let sh = ss.getSheetByName(ABA_EXT);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(ABA_EXT);
  sh.setTabColor('#70AD47');

  // Cabeçalho título
  sh.getRange('A1:B1').merge().setValue('📊 Extrato — Meta por Vendedor')
    .setBackground('#1F3864').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(13).setFontFamily('Arial')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(1, 30);

  // Seletor de mês
  sh.getRange('A2').setValue('Mês:')
    .setFontWeight('bold').setFontFamily('Arial').setBackground('#F2F8FD');
  sh.getRange('B2').setValue('')
    .setBackground('#FFF2CC').setFontWeight('bold').setFontFamily('Arial')
    .setHorizontalAlignment('center');
  sh.getRange('C2').setValue('← selecione o mês no dropdown')
    .setFontColor('#888888').setFontStyle('italic').setFontSize(9).setFontFamily('Arial');

  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 120);
  sh.setFrozenRows(2);

  // Nota
  sh.getRange('A3').setValue(
    '💡 As colunas de produto e metas são geradas automaticamente quando você seleciona um mês.'
  ).setFontColor('#595959').setFontStyle('italic').setFontSize(9).setFontFamily('Arial');

  sh.setTabColor('#70AD47');
}

// ── Aba Lista ─────────────────────────────────────────────────────────────
function _createLista(ss) {
  let sh = ss.getSheetByName(ABA_LISTA);
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet(ABA_LISTA);
  sh.setTabColor('#C55A11');

  const headers = ['mes','seller_name','seller_pmp','produto','meta_gmv'];
  sh.getRange('A1:E1').setValues([headers])
    .setBackground('#2E75B6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setHorizontalAlignment('center').setFontFamily('Arial');

  sh.getRange('A2').setFormula(
    '=IFERROR(QUERY(Extrato!A5:F1000,"select A,B,C,D,E where E > 0 order by A,B",0),"")'
  ).setFontFamily('Arial');

  sh.getRange('E2:E1000').setNumberFormat('R$ #,##0.00');
  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 200);
  sh.setColumnWidth(3, 100);
  sh.setColumnWidth(4, 120);
  sh.setColumnWidth(5, 150);
  sh.setFrozenRows(1);

  sh.getRange('A3').setValue(
    '💡 Populada automaticamente pelo Extrato. Filtra apenas linhas com meta > 0.'
  ).setFontColor('#595959').setFontStyle('italic').setFontSize(9).setFontFamily('Arial');
}
