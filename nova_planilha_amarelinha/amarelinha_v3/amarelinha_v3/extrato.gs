// ═══════════════════════════════════════════════════════════════════════════
// extrato.gs — recalcula o Extrato quando o mês selecionado muda
// ═══════════════════════════════════════════════════════════════════════════

// ── Core: recalcula o Extrato para um mês ────────────────────────────────
// Chamado pelo onEdit em utils.gs quando dropdown B2 do Extrato muda
function recalcExtrato(mesStr) {
  const shExt  = SH(ABA_EXT);
  const shAmar = SH(ABA_AMAR);
  const shMeta = SH(ABA_METAS);

  if (!shExt || !shAmar || !shMeta) return;

  // 1. Pega o mapeamento de colunas do mês na Amarelinha
  const mapping = getMonthMapping(mesStr);
  if (!mapping) {
    shExt.getRange('C2').setValue('⚠️ Mês não encontrado na Amarelinha.');
    return;
  }
  shExt.getRange('C2').setValue('');

  const { startCol, numDays } = mapping;
  const endCol = startCol + numDays - 1;

  // 2. Lê definições de produtos das Metas para o mês
  const prodDefs = _getMetasForMonth(shMeta, mesStr);
  if (prodDefs.length === 0) {
    shExt.getRange('C2').setValue('⚠️ Nenhuma meta encontrada para ' + mesStr + ' em "Metas por Produto".');
    return;
  }

  // 3. Lê vendedores da Amarelinha
  const vendedores = _getVendedores(shAmar);
  if (vendedores.length === 0) return;

  // 4. Lê bloco de alocação do mês
  const alocData = shAmar.getRange(AMAR_DATA_ROW, startCol, vendedores.length, numDays).getValues();

  // 5. Calcula dias por produto por vendedor
  const diasMatrix = _calcDias(vendedores, alocData, prodDefs, numDays);

  // 6. Calcula denominadores
  const denoms = _calcDenoms(diasMatrix, prodDefs.length);

  // 7. Calcula meta rateada
  const metasMatrix = _calcMetas(diasMatrix, denoms, prodDefs);

  // 8. Escreve no Extrato
  _writeExtrato(shExt, mesStr, vendedores, prodDefs, diasMatrix, denoms, metasMatrix);
}

// ── Lê metas do mês ──────────────────────────────────────────────────────
function _getMetasForMonth(shMeta, mesStr) {
  const lastRow = shMeta.getLastRow();
  if (lastRow < 2) return [];

  const data = shMeta.getRange(2, 1, lastRow - 1, 7).getValues();
  const defs = [];

  data.forEach(row => {
    const [mes, tag, nome, meta, dIni, dFim] = row;
    if (String(mes).trim() !== mesStr) return;
    if (!tag) return;
    defs.push({
      mes:    String(mes).trim(),
      tag:    String(tag).trim(),
      nome:   String(nome).trim(),
      meta:   Number(meta) || 0,
      dIni:   Number(dIni) || 1,
      dFim:   Number(dFim) || 31,
      // Tags adicionais (FPF-T conta para FPF-L e FPF-C)
      tagExtra: _getTagExtra(String(tag).trim()),
    });
  });
  return defs;
}

function _getTagExtra(tag) {
  // FPF-L e FPF-C também contam dias de FPF-T
  if (tag === 'FPF-L' || tag === 'FPF-C') return 'FPF-T';
  return null;
}

// ── Lê vendedores da Amarelinha ───────────────────────────────────────────
function _getVendedores(shAmar) {
  const lastRow = shAmar.getLastRow();
  if (lastRow < AMAR_DATA_ROW) return [];
  const data = shAmar.getRange(AMAR_DATA_ROW, 1, lastRow - AMAR_DATA_ROW + 1, 2).getValues();
  return data
    .filter(r => r[0] && String(r[0]).trim() !== '')
    .map(r => ({ nome: String(r[0]).trim(), pmp: String(r[1]).trim() }));
}

// ── Calcula dias alocados por vendedor × produto ──────────────────────────
function _calcDias(vendedores, alocData, prodDefs, numDays) {
  // diasMatrix[vi][pi] = número de dias
  return vendedores.map((vend, vi) => {
    return prodDefs.map(prod => {
      let count = 0;
      for (let d = 0; d < numDays; d++) {
        const dayNum = d + 1;
        if (dayNum < prod.dIni || dayNum > prod.dFim) continue;
        const cellTag = String(alocData[vi] ? alocData[vi][d] || '' : '').trim();
        if (cellTag === prod.tag || (prod.tagExtra && cellTag === prod.tagExtra)) {
          count++;
        }
      }
      return count;
    });
  });
}

// ── Calcula denominadores (Σ pessoa-dias por produto) ─────────────────────
function _calcDenoms(diasMatrix, numProds) {
  const denoms = new Array(numProds).fill(0);
  diasMatrix.forEach(vendRow => {
    vendRow.forEach((dias, pi) => { denoms[pi] += dias; });
  });
  return denoms;
}

// ── Calcula meta rateada ──────────────────────────────────────────────────
function _calcMetas(diasMatrix, denoms, prodDefs) {
  return diasMatrix.map(vendRow => {
    return vendRow.map((dias, pi) => {
      if (denoms[pi] === 0 || dias === 0) return 0;
      return (dias / denoms[pi]) * prodDefs[pi].meta;
    });
  });
}

// ── Escreve o Extrato ─────────────────────────────────────────────────────
function _writeExtrato(shExt, mesStr, vendedores, prodDefs, diasMatrix, denoms, metasMatrix) {
  // Limpa área de dados (linhas 4+)
  const maxRow = shExt.getMaxRows();
  if (maxRow >= 4) {
    shExt.getRange(4, 1, maxRow - 3, shExt.getMaxColumns()).clearContent().clearFormat();
  }

  const numProd = prodDefs.length;
  const numVend = vendedores.length;

  // ── Cabeçalho de colunas (linha 4) ────────────────────────────────────
  // Layout: A=nome, B=pmp, C=dias_total, D..D+N-1=dias_prod, D+N=|, D+N+1..2N=meta_prod, 2N+1=total, 2N+2=total_s_legado
  const COL_NOME  = 1;
  const COL_PMP   = 2;
  const COL_DIAS_TOT = 3;
  const COL_DIAS_START = 4;
  const COL_SEP   = COL_DIAS_START + numProd;        // separador visual
  const COL_META_START = COL_SEP + 1;
  const COL_TOTAL = COL_META_START + numProd;
  const COL_TOTAL_SL = COL_TOTAL + 1;                // sem legado/portfel

  // Títulos seção dias
  const hdrDias  = ['Vendedor','PMP','Dias\n(excl. OFF)'];
  prodDefs.forEach(p => hdrDias.push(p.nome));
  hdrDias.push(''); // separador

  // Títulos seção metas
  const hdrMetas = [];
  prodDefs.forEach(p => hdrMetas.push(p.nome));
  hdrMetas.push('TOTAL (R$)');
  hdrMetas.push('Total s/\nLegado (R$)');

  const hdrRow = [...hdrDias, ...hdrMetas];
  const hdrRange = shExt.getRange(4, 1, 1, hdrRow.length);
  hdrRange.setValues([hdrRow])
    .setBackground('#2E75B6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontSize(9)
    .setFontFamily('Arial').setWrap(true)
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  shExt.setRowHeight(4, 32);

  // Cor diferente no bloco de metas
  shExt.getRange(4, COL_META_START, 1, numProd + 2)
    .setBackground('#1F3864');

  // ── Dados dos vendedores (linhas 5..5+N-1) ────────────────────────────
  const tagsExcluidas = new Set(['OLG','Portfel','OFF','FCS']); // excluídas do total limpo

  const dataRows = vendedores.map((vend, vi) => {
    const diasTot = diasMatrix[vi].reduce((s, d) => s + d, 0);
    const metasTot = metasMatrix[vi].reduce((s, m) => s + m, 0);

    // Total sem legado/portfel
    let metasSL = 0;
    prodDefs.forEach((prod, pi) => {
      if (!tagsExcluidas.has(prod.tag)) metasSL += metasMatrix[vi][pi];
    });

    return [
      vend.nome,
      vend.pmp,
      diasTot,
      ...diasMatrix[vi],
      '',           // separador
      ...metasMatrix[vi],
      metasTot,
      metasSL,
    ];
  });

  if (dataRows.length > 0) {
    const dataRange = shExt.getRange(5, 1, numVend, dataRows[0].length);
    dataRange.setValues(dataRows).setFontFamily('Arial').setFontSize(10);

    // Alternating rows
    dataRows.forEach((_, i) => {
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
      shExt.getRange(5 + i, 1, 1, dataRows[0].length).setBackground(bg);
    });

    // Colunas de meta: formato moeda + alinhamento direita
    const metaRange = shExt.getRange(5, COL_META_START, numVend, numProd + 2);
    metaRange.setNumberFormat('R$ #,##0.00').setHorizontalAlignment('right');

    // Colunas de dias: alinhamento centro
    const diasRange = shExt.getRange(5, COL_DIAS_START, numVend, numProd + 1);
    diasRange.setHorizontalAlignment('center');

    // Destaque na coluna TOTAL
    shExt.getRange(5, COL_TOTAL, numVend, 2)
      .setBackground('#D6E4F0').setFontWeight('bold');

    // Nome negrito
    shExt.getRange(5, COL_NOME, numVend, 1).setFontWeight('bold');
  }

  // ── Linha DENOMINADOR ─────────────────────────────────────────────────
  const denomRow = 5 + numVend;
  const denomData = ['DENOMINADOR','','', ...denoms, '', ...new Array(numProd + 2).fill('')];
  shExt.getRange(denomRow, 1, 1, denomData.length)
    .setValues([denomData])
    .setBackground('#2E75B6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontFamily('Arial').setHorizontalAlignment('center');

  // ── Linha TOTAL POR PRODUTO ───────────────────────────────────────────
  const totalRow = denomRow + 1;
  const totalProdDias = prodDefs.map((_, pi) => diasMatrix.reduce((s, vr) => s + vr[pi], 0));
  const totalProdMeta = prodDefs.map((_, pi) => metasMatrix.reduce((s, vr) => s + vr[pi], 0));
  const grandTotal = totalProdMeta.reduce((s, m) => s + m, 0);

  const totalData = ['TOTAL POR PRODUTO','','', ...totalProdDias, '', ...totalProdMeta, grandTotal, ''];
  shExt.getRange(totalRow, 1, 1, totalData.length)
    .setValues([totalData])
    .setBackground('#1F3864').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontFamily('Arial');
  shExt.getRange(totalRow, COL_META_START, 1, numProd + 1)
    .setNumberFormat('R$ #,##0.00').setHorizontalAlignment('right');

  // ── Sanity checks ─────────────────────────────────────────────────────
  const scRow = totalRow + 2;
  shExt.getRange(scRow, 1, 1, 3)
    .setValues([['🔍 SANITY CHECKS','','']])
    .setBackground('#2E75B6').setFontColor('#FFFFFF')
    .setFontWeight('bold').setFontFamily('Arial');
  shExt.getRange(scRow, 1, 1, hdrRow.length).setBackground('#2E75B6');

  // Check 1: rateado − meta por produto ≈ 0
  const check1Row = scRow + 1;
  const check1 = ['1) Rateado − Meta (deve ser ≈ 0)','',''];
  prodDefs.forEach((prod, pi) => {
    check1.push(Math.round((totalProdMeta[pi] - prod.meta) * 100) / 100);
  });
  check1.push('');
  prodDefs.forEach(() => check1.push(''));
  const allZero = prodDefs.every((prod, pi) => Math.abs(totalProdMeta[pi] - prod.meta) < 1);
  check1.push(allZero ? '✅ OK' : '❌ ERRO');
  check1.push('');

  shExt.getRange(check1Row, 1, 1, check1.length).setValues([check1])
    .setBackground(allZero ? '#E2EFDA' : '#FFDDC1').setFontFamily('Arial').setFontSize(9);
  shExt.getRange(check1Row, COL_DIAS_START, 1, numProd).setNumberFormat('R$ #,##0.00');

  // Check 2: total geral vs soma das metas
  const check2Row = scRow + 2;
  const somaMetasDef = prodDefs.reduce((s, p) => s + p.meta, 0);
  const ok2 = Math.abs(grandTotal - somaMetasDef) < 1;
  shExt.getRange(check2Row, 1, 1, 3)
    .setValues([['2) Total geral vs Σ metas definidas', grandTotal, somaMetasDef]])
    .setBackground(ok2 ? '#E2EFDA' : '#FFDDC1').setFontFamily('Arial').setFontSize(9);
  shExt.getRange(check2Row, 2, 1, 2).setNumberFormat('R$ #,##0.00');
  shExt.getRange(check2Row, COL_TOTAL, 1, 1)
    .setValue(ok2 ? '✅ OK' : '❌ ERRO')
    .setFontWeight('bold').setFontFamily('Arial');

  // Check 3: produtos com meta > 0 mas sem alocação
  const check3Row = scRow + 3;
  const orphans = prodDefs.filter((p, pi) => p.meta > 0 && denoms[pi] === 0).map(p => p.nome);
  const ok3 = orphans.length === 0;
  shExt.getRange(check3Row, 1, 1, 3)
    .setValues([['3) Produtos com meta mas sem alocação', orphans.length, orphans.join(', ') || '—']])
    .setBackground(ok3 ? '#E2EFDA' : '#FFDDC1').setFontFamily('Arial').setFontSize(9);
  shExt.getRange(check3Row, COL_TOTAL, 1, 1)
    .setValue(ok3 ? '✅ OK' : '❌ ERRO')
    .setFontWeight('bold').setFontFamily('Arial');

  // ── Widths ────────────────────────────────────────────────────────────
  shExt.setColumnWidth(COL_NOME, 160);
  shExt.setColumnWidth(COL_PMP, 80);
  shExt.setColumnWidth(COL_DIAS_TOT, 80);
  for (let i = 0; i < numProd; i++) {
    shExt.setColumnWidth(COL_DIAS_START + i, 100);
    shExt.setColumnWidth(COL_META_START + i, 130);
  }
  shExt.setColumnWidth(COL_SEP, 20);
  shExt.setColumnWidth(COL_TOTAL, 130);
  shExt.setColumnWidth(COL_TOTAL_SL, 140);

  shExt.setFrozenRows(4);
  shExt.setFrozenColumns(2);

  SpreadsheetApp.flush();

  // Atualiza a Lista também
  _refreshLista(mesStr);
}

// ── Atualiza aba Lista ────────────────────────────────────────────────────
function _refreshLista(mesStr) {
  const shExt   = SH(ABA_EXT);
  const shLista = SH(ABA_LISTA);
  if (!shExt || !shLista) return;

  // A lista já usa QUERY do Extrato, apenas garante que a fórmula aponta certo
  // e limpa dados antigos
  const lastRow = shLista.getLastRow();
  if (lastRow > 1) {
    shLista.getRange(2, 1, lastRow - 1, 5).clearContent();
  }

  // Lê os dados do Extrato diretamente (pós-cálculo)
  const extLastRow = shExt.getLastRow();
  if (extLastRow < 5) return;

  const extData = shExt.getRange(5, 1, extLastRow - 4, shExt.getLastColumn()).getValues();
  const rows = [];

  // Linhas de vendedor (até encontrar DENOMINADOR)
  extData.forEach(row => {
    const nome = String(row[0] || '');
    if (!nome || nome.startsWith('DENOMINADOR') || nome.startsWith('TOTAL') || nome.startsWith('🔍')) return;
    const pmp  = String(row[1] || '');

    // Mapeia colunas de meta do Extrato de volta para produto
    // O Extrato tem: nome(0), pmp(1), diasTot(2), dias[](3..3+N-1), sep, metas[](...)
    // Precisamos ler apenas as células de meta que têm valor
    // Como recalcExtrato escreve os valores diretos, vamos lê-los pelo índice
    // Para simplicidade, relemos a estrutura via prodDefs
    const mapping = getMonthMapping(mesStr);
    if (!mapping) return;
    const prodDefs = _getMetasForMonth(SH(ABA_METAS), mesStr);
    const numProd  = prodDefs.length;
    const COL_META_START_IDX = 3 + numProd + 1; // 0-indexed

    prodDefs.forEach((prod, pi) => {
      const metaVal = Number(row[COL_META_START_IDX + pi] || 0);
      if (metaVal <= 0) return;
      rows.push([mesStr, nome, pmp, prod.tag, metaVal]);
    });
  });

  if (rows.length > 0) {
    shLista.getRange(2, 1, rows.length, 5).setValues(rows)
      .setFontFamily('Arial').setFontSize(10);
    shLista.getRange(2, 5, rows.length, 1).setNumberFormat('R$ #,##0.00');

    // Alternating
    rows.forEach((_, i) => {
      const bg = i % 2 === 0 ? '#FFFFFF' : '#F2F8FD';
      shLista.getRange(2 + i, 1, 1, 5).setBackground(bg);
    });
  }

  SpreadsheetApp.flush();
}
