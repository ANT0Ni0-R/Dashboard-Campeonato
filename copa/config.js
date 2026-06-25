<script>
// ===========================================================
//  ASSETS (fotos + bandeiras)
//  O Apps Script nao serve arquivos locais. Estes assets sao carregados de um
//  repositorio PUBLICO via raw.githubusercontent. Mantenha as fotos/ e flags/
//  num repo publico (pode ser um repo separado so de assets) para que estas
//  URLs funcionem mesmo com o repo de codigo privado.
//
//  >>> ANTES de tornar o repo de codigo privado, troque ASSETS_BASE para o
//      repo publico de assets, ex.:
//      'https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato-assets/main'
// ===========================================================
const ASSETS_BASE = 'https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato/main';
const DEFAULT_FLAG = ASSETS_BASE + '/flags/brasil.svg';

const COMPETICAO = {
  // fase_ativa_override: "grupos" | "quartas" | "semis" | "final" | null
  // Usar null para derivar automaticamente do relógio da máquina (America/Sao_Paulo)
  fase_ativa_override: null,

  produto: {
    // Slug de busca do produto. O filtro real (ilike no slug) roda no servidor
    // (Code.gs / Script Property PRODUTO_SLUG_LIKE). Aqui o valor serve apenas
    // para exibir o nome do produto no cabecalho.
    slug_like: "%legado%",
    regua: [
      { ate: null, mult: 1 }
    ],
    // IDs (campo `id` do Supabase) cujas transacoes sao ignoradas nos placares.
    // Comparacao case-insensitive.
    // 6a31f4d2cc1cfab5a1fe7e7b = cristianeamanda@hotmail.com
    // 6a32aec05a20e4c3d73c6f57 = lmfalconi@gmail.com
    excluir_ids: ["6a31f4d2cc1cfab5a1fe7e7b", "6a32aec05a20e4c3d73c6f57", '6a3a85e1f3732f6e3f4233b7', '6a3ab149d864301a520f9954', '6a3b1da0fa40e973582feae7'],
    // Override de price/GMV por `id` (case-insensitive, chaves em minusculas).
    // Aplicado por transacao, antes da regua de GMV.
    // 6a313a63b98a6054e251eab7 = masterbrushsouza@gmail.com
    ajustar_precos: { "6a313a63b98a6054e251eab7": 4741.51 , '6a35722c65b156eeb39d85f9': 4741.51}
  },

  supabase: {
    // As credenciais do Supabase agora ficam no SERVIDOR (Apps Script Script
    // Properties), nunca aqui. O front busca os dados via google.script.run.
    // Apenas o intervalo de polling permanece no cliente.
    poll_segundos: 60
  },

  // Congelamento diario (DESATIVADO): no modo ao vivo o placar segue contando sem
  // congelar. O fechamento de cada dia (premiacao diaria) agora e visto sob demanda
  // pelo Seletor de Dia no canto superior direito. Mantido aqui apenas como toggle.
  congelamento: {
    ativo: false,
    hora_padrao: "21:00",    // (sem efeito enquanto ativo=false)
    hora_dia_copa: "18:30"   // (sem efeito enquanto ativo=false)
  },

  vendedores: {
    // Chave de 3 letras (seller_code/PMP). Visível e associada às transações.
    // Cada vendedor representa uma seleção (país) com a respectiva bandeira em flags/.
    "CCL": { nome: "Camila",     selecao: "Inglaterra", foto: "fotos/CCL.jpeg", bandeira: "flags/inglaterra.png" },
    "HDZ": { nome: "Diniz",      selecao: "Argentina",  foto: "fotos/HDZ.jpg",  bandeira: "flags/argentina.webp" },
    "EZB": { nome: "Enzo",       selecao: "Portugal",   foto: "fotos/EZB.jpg",  bandeira: "flags/portugal.webp" },
    "FAL": { nome: "Fernando",   selecao: "Canadá",     foto: "fotos/FAL.JPG",  bandeira: "flags/canada.png" },
    "HLM": { nome: "Harry",      selecao: "Espanha",    foto: "fotos/HLM.jpg",  bandeira: "flags/espanha.png" },
    "HMD": { nome: "Henrique",   selecao: "USA",        foto: "fotos/HMD.jpg",  bandeira: "flags/usa.png" },
    "HUM": { nome: "Hudson",     selecao: "Japão",      foto: "fotos/HUM.jpg",  bandeira: "flags/japao.png" },
    "JKC": { nome: "Jackson",    selecao: "México",     foto: "fotos/JKC.jpeg", bandeira: "flags/mexico.webp" },
    "JPP": { nome: "João Pedro", selecao: "Brasil",     foto: "fotos/JPP.jpg",  bandeira: "flags/brasil.svg" },
    "MDR": { nome: "Monica",     selecao: "Holanda",    foto: "fotos/MDR.jpg",  bandeira: "flags/holanda.webp" },
    "THS": { nome: "Thayna",     selecao: "França",     foto: "fotos/THS.JPG",  bandeira: "flags/franca.png" }
  },

  fases: {
    // FASE DE GRUPOS — Terça a Sábado (GMV acumulado no período).
    // A sexta (dia_copa) cai DENTRO desta janela, então seu GMV soma no acumulado
    // dos grupos E também alimenta a competição pontual do Dia da Copa.
    grupos: {
      tipo: "grupos",
      inicio: "2026-06-16T00:00:00-03:00",
      fim: "2026-06-20T23:59:59-03:00",
      // Sub-janela: Sexta = "Dia da Copa" (todos contra todos, competição do dia).
      dia_copa: {
        inicio: "2026-06-19T00:00:00-03:00",
        fim: "2026-06-19T23:59:59-03:00"
      },
      grupos: [
        { nome: "Grupo A", membros: ["HDZ", "HLM", "JPP"], avancam: 2 },
        { nome: "Grupo B", membros: ["HUM", "JKC", "MDR"], avancam: 2 },
        { nome: "Grupo C", membros: ["EZB", "FAL", "THS"], avancam: 2 },
        { nome: "Grupo D", membros: ["CCL", "HMD"],        avancam: 1 }
      ],
      repescagem: { sobem: 1 }
    },
    quartas: {
      tipo: "mata-mata-1v1",
      inicio: "2026-06-21T00:00:00-03:00",
      fim: "2026-06-21T23:59:59-03:00",
      // Chaveamento data-driven (rastreável num só lugar). Seeds dos classificados:
      //   A1,A2 = 1º/2º do Grupo A | B1,B2 = 1º/2º do Grupo B
      //   C1,C2 = 1º/2º do Grupo C | D1 = 1º do Grupo D | REP = vencedor da repescagem
      // Regras desta edição:
      //   - Os dois do Grupo C se enfrentam entre si (C1 x C2).
      //   - O melhor do Grupo D enfrenta o vindo da repescagem (D1 x REP).
      chaveamento: [
        { label: "QF 1", seeds: ["A1", "B2"] },
        { label: "QF 2", seeds: ["B1", "A2"] },
        { label: "QF 3", seeds: ["C1", "C2"] },
        { label: "QF 4", seeds: ["D1", "REP"] }
      ]
    },
    semis: {
      tipo: "mata-mata-1v1",
      inicio: "2026-06-22T00:00:00-03:00",
      fim: "2026-06-22T23:59:59-03:00"
    },
    final: {
      tipo: "mata-mata-1v1",
      inicio: "2026-06-23T00:00:00-03:00",
      fim: "2026-06-23T23:59:59-03:00"
    }
  }
};

// Normaliza as URLs de fotos/bandeiras: caminhos relativos viram URLs absolutas
// no repositorio publico de assets (ASSETS_BASE). URLs ja absolutas sao mantidas.
Object.keys(COMPETICAO.vendedores).forEach(function (code) {
  var v = COMPETICAO.vendedores[code];
  if (v.foto && v.foto.indexOf('http') !== 0) v.foto = ASSETS_BASE + '/' + v.foto;
  if (v.bandeira && v.bandeira.indexOf('http') !== 0) v.bandeira = ASSETS_BASE + '/' + v.bandeira;
});
</script>
