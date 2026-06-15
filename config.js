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

  // Modo Teste (botão no painel inferior): puxa os últimos N dias SEM filtro de
  // produto/slug e ilumina a tela inteira com dados reais para validar a integração.
  modo_teste: { dias: 30 },

  supabase: {
    url: "https://ipalripfknzhrzddhvdx.supabase.co",
    anon_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlwYWxyaXBma256aHJ6ZGRodmR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNDk1MTYsImV4cCI6MjA3MzcyNTUxNn0.HQ9BiUd07DT05n_mKsuedKwxvw5UQdR0QovSjk27JoA",
    tabela: "db_transactions_events",
    poll_segundos: 60
  },

  vendedores: {
    // Chave de 3 letras (seller_code/PMP). Visível e associada às transações.
    // Todos iniciam com a bandeira do brasil.svg por definição inicial do briefing.
    "CCL": { nome: "Camila",     selecao: "Brasil", foto: "fotos/CCL.jpeg", bandeira: "flags/brasil.svg" },
    "HDZ": { nome: "Diniz",      selecao: "Brasil", foto: "fotos/HDZ.jpg",  bandeira: "flags/brasil.svg" },
    "EZB": { nome: "Enzo",       selecao: "Brasil", foto: "fotos/EZB.jpg",  bandeira: "flags/brasil.svg" },
    "FAL": { nome: "Fernando",   selecao: "Brasil", foto: "fotos/FAL.JPG",  bandeira: "flags/brasil.svg" },
    "HLM": { nome: "Harry",      selecao: "Brasil", foto: "fotos/HLM.jpg",  bandeira: "flags/brasil.svg" },
    "HMD": { nome: "Henrique",   selecao: "Brasil", foto: "fotos/HMD.jpg",  bandeira: "flags/brasil.svg" },
    "HUM": { nome: "Hudson",     selecao: "Brasil", foto: "fotos/HUM.jpg",  bandeira: "flags/brasil.svg" },
    "JKC": { nome: "Jackson",    selecao: "Brasil", foto: "fotos/JKC.jpeg", bandeira: "flags/brasil.svg" },
    "JPP": { nome: "João Pedro", selecao: "Brasil", foto: "fotos/JPP.jpg",  bandeira: "flags/brasil.svg" },
    "MDR": { nome: "Monica",     selecao: "Brasil", foto: "fotos/MDR.jpg",  bandeira: "flags/brasil.svg" },
    "THS": { nome: "Thayna",     selecao: "Brasil", foto: "fotos/THS.JPG",  bandeira: "flags/brasil.svg" }
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
        { nome: "Grupo A", membros: ["CCL", "FAL", "MDR"], avancam: 2 },
        { nome: "Grupo B", membros: ["HDZ", "HLM", "THS"], avancam: 2 },
        { nome: "Grupo C", membros: ["EZB", "HMD", "JPP"], avancam: 2 },
        { nome: "Grupo D", membros: ["HUM", "JKC"],       avancam: 1 }
      ],
      repescagem: { sobem: 1 }
    },
    quartas: {
      tipo: "mata-mata-1v1",
      inicio: "2026-06-21T00:00:00-03:00",
      fim: "2026-06-21T23:59:59-03:00"
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
