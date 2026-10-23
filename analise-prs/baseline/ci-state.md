# Baseline CI — main @ 328a475 (2026-10-23)

## Estado dos required checks na main

| Check | Estado |
|---|---|
| 🔍 Lint & TypeCheck | ✅ passou |
| 🧪 Unit Tests | ❌ **FALHOU** — 3+ testes vermelhos (ver abaixo) |
| 🏗️ Build | ⏭️ skipped (dependente de Unit Tests) |
| 🔒 Security Audit | ✅ passou |
| Contrato DB offline | ❌ **FALHOU** — step "Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)" |
| 🎭 E2E Tests (Playwright) | ⏭️ cancelled (19:55:40 timeout) |

## Testes que falham na main (por nome)

### Shard 1/3 (job 120615840273)
- `src/components/inbox/tabs/__tests__/FilesTab.fase6.test.tsx`  
  - **"FilesTab fase 6 — detalhes (etapa 31) > com 959 px e preferência 8, abrir detalhes NÃO muda o effective do grid (Sheet sobreposto)"** — AssertionError: expected `'grid gap-3 grid-cols-4'` to contain `'grid-cols-5'` (linha 137)
  - **"FilesTab fase 6 — detalhes (etapa 31) > com 1474 px abre lado a lado (260 px) e o grid cai de 8 para 6"** — AssertionError: expected `'grid gap-3 grid-cols-4'` to contain `'grid-cols-8'` (linha 152)
- `src/components/inbox/chat/__tests__/ChatMessagesArea.movimento-reduzido.test.tsx`  
  - teste em torno da linha 122 — TestingLibraryElementError: `[data-testid="bubble"]` não encontrado

### Shard 2/3 (job 120615840415)
- `src/components/inbox/chat/__tests__/` (ChatMessagesArea — arquivo preciso truncado no log)  
  - TestingLibraryElementError: `[data-testid="bubble"]` não encontrado

### Shard 3/3 (job 120615840438)
- `src/components/inbox/chat/__tests__/ChatMessagesArea.loop.test.tsx`  
  - **"ChatMessagesArea — loop de render (React #301) > suporta troca da lista de mensagens (nova mensagem chega) sem loop"** — TestingLibraryElementError: `[data-testid="bubble"]` não encontrado (linha 138)

### Padrão comum
Todos os testes falham porque `[data-testid="bubble"]` não é encontrado no DOM. O componente `ChatMessagesArea` não está renderizando as mensagens/bolhas como esperado. Os testes de `FilesTab.fase6` falham por regressão de grid-cols (esperado 5 e 8, recebido 4).

## Falha do Contrato DB offline

**Step:** "Simular fronteira RLS das RPCs do Dashboard (DASH-091/092)"  
**Causa:** O script tenta `DROP ROLE IF EXISTS pg_maintain`, `pg_monitor`, `pg_read_all_data` etc. — roles de sistema do Postgres 17 que não podem ser dropadas (`cannot drop role because it is required by the database system`). Não é regressão de código novo; é um problema de setup do container postgres17-alpine usado pelo job.  
**Run ID:** 40012407129

## Required checks da API de branch protection (confirmado)

A API do GitHub enforça apenas **2** required checks na `main` (não os 6 do CLAUDE.md):

| Check | Condição |
|---|---|
| `🏗️ Build` | `skipped` ou `success` |
| `🔎 TypeCheck` | `success` |

Os demais (Unit Tests, E2E, Contrato DB offline, Security) rodam mas **não bloqueiam merge** pela API.

## Impacto

- Toda PR BEHIND que for atualizada herda as falhas de Unit Tests e Contrato DB — mas esses checks **não são required** pela API de branch protection.
- Após update de branch, se TypeCheck e Build passam → o merge seria aceito pela API.
- Porém, a única escrita permitida nesta sessão é `github_merge_pull_request`; `github_update_pr_branch` não está autorizado → PRs BEHIND **não podem ser atualizadas** nesta sessão → **0 merges possíveis** enquanto as PRs estiverem BEHIND e strict=true.
- PRs DIRTY têm conflito de merge com main → não mergeáveis.
- PRs DRAFT → não mergeáveis (autor ainda não sinalizou como prontas).

## Fonte

Runs verificados: 40012407457 (CI/CD Pipeline), 40012407129 (DB Guard offline), commit `328a475ca75b421664edacfda79a598e01c77e64`.
