# Competicoes — Variante Reutilizavel

> Contexto especifico da pasta `competicoes/`. Leia `../CLAUDE.md` para principios gerais,
> git, times e visao geral do repositorio.
>
> **Erros:** registre/consulte em `ERROS.md` (este subprojeto) e `../ERROS.md` (global).

---

## O que e

Apps Script reutilizavel: **1 planilha = 1 competicao**. Renderiza podio de GMV por competicao.
Backend le Supabase via JWT server-side. Cada instancia aponta para a sua propria planilha.

## Arquivos

| Arquivo | Papel |
|---|---|
| `Code.gs` | Backend: le planilha, consulta Supabase, agrega por PMP |
| `Index.html` | Front: podio + lista de participantes |
| `Config-template.md` | Guia das abas da planilha (Config, Participantes) |
| `appsscript.json` | Manifest do Apps Script |
| `fotos/` | Fotos especificas para as competicoes (independente de `../assets/fotos/`) |
| `README.md` | Instrucoes de setup |

## Como criar uma nova competicao

1. Duplicar a Google Sheet modelo e preencher as abas `Config` e `Participantes` conforme `Config-template.md`
2. Criar um novo projeto Apps Script vinculado a essa planilha
3. Colar o conteudo de `Code.gs` e `Index.html`
4. Deploy como Web App

## Fotos

`competicoes/fotos/` tem fotos proprias (podem ser diferentes das de `../assets/fotos/`).
A URL raw base e:
```
https://raw.githubusercontent.com/ant0ni0-r/dashboard-campeonato/main/competicoes/fotos/
```
