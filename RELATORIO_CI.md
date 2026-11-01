# RELATORIO_CI.md — Diagnóstico e Estado dos Workflows

**Data:** 2026-11-01  
**Branch de trabalho:** `claude_04/gifted-ride-xq3mj4`  
**HEAD da main:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## Baseline — Workflows com falha na main (2026-11-01)

Dos 17 workflows ativos, 5 tiveram o último run com `conclusion: failure` na branch `main`:

| Workflow | Run ID | Commit | Falha |
|---|---|---|---|
| CI/CD Pipeline (E2E Playwright) | 41240478106 | `ad7c48f` | Contraste WCAG AA < 4.5:1 em high-contrast |
| Deploy Edge Functions | 41307703680 | `532aa09` | `deno install` não instala `@types/node` sem import real |
| E2E logado | 41240478106 | `ad7c48f` | Mesma causa raiz do item acima |
| DB Live Guard | 41318522203 | `532aa09` | 7 de 7 passos falharam (causa no artefato) |
| DB Migrate | 41307726882 | `1252bb5` | 9 versões faltando para target `20261030135126` |

---

## Diagnóstico Detalhado

### 1. CI/CD Pipeline — E2E Tests (Playwright) `🎭`

**Run:** 41240478106 | **Required check:** `🎭 E2E Tests (Playwright)`

**Causa raiz:** `src/styles/accessibility.css` — bloco `.dark.high-contrast` declara 21 tokens CSS sem `!important`. A função `applyThemePreset()` em `src/components/settings/theme/presets.ts` escreve os mesmos tokens via `element.style.setProperty()` (inline style). Estilos inline têm especificidade maior que classes, sobrescrevendo os tokens do bloco. Resultado: `.leading-relaxed` recebe `--foreground: 44 5% 44%` (#6c717b) contra fundo `#0e0e10` — contraste 3.93:1, abaixo do mínimo WCAG AA de 4.5:1.

**Correção em andamento:** [PR #2513](https://github.com/adm01-debug/Zapp_Web_V2/pull/2513) — branch `claude/fix-email-navy-contrast-261101-2057`. Adiciona `!important` a todos os 21 tokens do bloco. CI queued às 21:55 UTC (2026-11-01). **Aguardando CI completar para auto-merge.**

### 2. Deploy Edge Functions

**Run:** 41307703680

**Causa raiz:** `deno install --config supabase/functions/deno.json` no Deno 2.9.5 não instala pacotes declarados apenas no mapa `imports` do `deno.json` sem que haja um `import` real no código. `@types/ws@8.18.1` tem `/// <reference types="node" />` que força resolução de `@types/node` — como `@types/node` está só no `imports` e nenhum arquivo o importa diretamente, o `deno check` falha com "could not resolve node types".

**Correção em andamento:** [PR #2508](https://github.com/adm01-debug/Zapp_Web_V2/pull/2508) — branch `claude/fix-deploy-functions-types-node-011101`. Adiciona `npm --prefix supabase/functions install --no-save @types/node@25.9.9` antes do `deno check`. CI queued às 21:54 UTC (2026-11-01). **Aguardando CI completar para auto-merge.**

### 3. E2E logado

**Run:** mesmo run 41240478106 que o item 1.

**Causa raiz:** idêntica ao item 1 — mesmo teste de contraste WCAG AA. **Corrigida pela mesma PR #2513.**

### 4. DB Live Guard

**Run:** 41318522203 no commit `532aa09b` (2026-11-01 ~15:29 UTC).

**Falha:** 7 de 7 passos falharam simultaneamente:
- Comparar migrations com schema_migrations  
- Verificar invariantes gerais do banco vivo  
- Regenerar catalogo e comparar com o commitado  
- Regenerar manifesto e comparar com o commitado  
- Verificar frescor do types.ts  
- Paridade tripla (migrations, edges, grants)  
- Auditar configuracao runtime sem dados de clientes  

**Causa raiz não determinada via log.** Os detalhes reais estão no artefato `db-live-evidence-41318522203-1` (ID `13089517610`). A falha simultânea de todos os passos pode indicar: (a) problema de conectividade/autenticação com `DESTINO_URL`, ou (b) drift real acumulado.

**Estado atual:** runs mais recentes na HEAD `1252bb5a` foram **cancelados por concorrência de pushes** (runs `41356238940`, `41356445878`, `41356455756`, `41356604457` todos `cancelled`). Run `41356605138` está `pending` (iniciado às 22:20 UTC). **Aguardar conclusão deste run para confirmar se a falha persiste na HEAD atual.**

**Bloqueador:** não é possível corrigir via código sem ler os logs do artefato — ver PENDENCIAS.md item 1.

### 5. DB Migrate

**Run:** 41307726882

**Falha:** target migration `20261030135126` não registrada no ledger; workflow relata 9 versões faltando.

**Bloqueador:** requer decisão do Joaquim sobre quais migrations aplicar — ver PENDENCIAS.md item 2.

---

## Estado pós-diagnóstico (22:00 UTC 2026-11-01)

| Item | Ação | Estado |
|---|---|---|
| CI/CD Pipeline + E2E logado | PR #2513 em CI | ⏳ CI rodando |
| Deploy Edge Functions | PR #2508 em CI | ⏳ CI rodando |
| DB Live Guard | Aguardar run `41356605138` | ⏳ Pendente |
| DB Migrate | Bloqueado no Joaquim | 🔴 PENDENCIAS |
