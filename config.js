const COMPETICAO = {
  // fase_ativa_override: "grupos" | "quartas" | "semis" | "final" | null
  // Usar null para derivar automaticamente do relógio da máquina (America/Sao_Paulo)
  fase_ativa_override: null,

  produto: {
    // Slug de busca do produto (case-insensitive via ILIKE no Supabase).
    // "%legado%" -> filtra a coluna `slug` por qualquer ocorrência de "legado".
    slug_like: "%legado%",
    regua: [
      { ate: null, mult: 1 }
    ]
  },

  supabase: {
    url: "https://ipalripfknzhrzddhvdx.supabase.co",
    // A anon_key NAO fica versionada. No deploy (GitHub Pages), o workflow
    // substitui o placeholder abaixo pelo valor do secret SUPABASE_ANON_KEY.
    // Localmente o placeholder permanece e o app cai no fallback JSON.
    anon_key: "__SUPABASE_ANON_KEY__",
    tabela: "db_transactions_events",
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
