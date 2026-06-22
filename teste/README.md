# Versão de TESTE — Conexão Supabase + Atualização Automática

Build isolada para validar 3 coisas, sem mexer no dashboard de produção:

1. **Conexão com o Supabase** está funcionando (status no header: verde = conectado, vermelho = erro).
2. **Receita por vendedor nos últimos 30 dias, independente do produto** — soma de `price` de todas as transações `order_success` da janela, agrupada por `seller_code` (últimas 3 letras do `pmp`). Sem nenhum filtro de slug/produto.
3. **Atualização automática com sinal visual** — polling periódico que dispara, a cada refresh:
   - um *toast* verde no canto inferior direito ("Atualizado às HH:MM:SS");
   - um *flash* dourado no quadro do ranking;
   - um *pulse* azul no ponto de status enquanto carrega;
   - linhas cujo valor mudou piscam em verde;
   - contador de atualizações da sessão.

O front replica a tela "Jogo do Brasil" (ranking estilo Brasileirão) do dashboard.

## Como rodar localmente

A partir da **raiz do repositório** (a página usa `../styles.css` e `../config.js`):

```bash
python3 -m http.server 8090
```

Depois abra: <http://localhost:8090/teste/>

> Use uma porta diferente da do dashboard principal para rodar os dois lado a lado.

## Ajustes rápidos

- Intervalo de polling: herdado de `config.js` (`supabase.poll_segundos`); cai para 30s se ausente.
- Janela de apuração: constante `DIAS_JANELA` em `teste.js`.
- Botão **"Forçar atualização"** dispara um refresh manual para testar o sinal visual na hora.

## Observação

As credenciais do Supabase são reaproveitadas de `../config.js` (chave `anon`).
