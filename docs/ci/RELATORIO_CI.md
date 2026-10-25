# Relatório CI — PR #2218 (branch `claude_05/brave-mccarthy-zvzky4`)

Data: 2026-10-25  
HEAD final: `709fccbbdb61c35b282bd1fb26f87ed0e12bcc06`

---

## 1. Baseline local (pré-correções)

Commits da branch antes das correções: apenas `1c3369932` (commit inicial da sessão anterior).

### Typecheck
- Baseline: 93 erros (herdados de `main`)
- Após correções: 75 erros
- Novos introduzidos: **0** (ratchet OK)

### Lint
- Baseline: 819 avisos
- Após correções: 819 avisos
- Novos introduzidos: **0** (ratchet OK)

### Migrations
- Arquivos válidos em `supabase/migrations/`: **1055**
- Comparação com ledger: DESTINO_URL ausente — estrutura local validada; comparação com ledger pulada.

---

## 2. Falhas identificadas e corrigidas

### Falha 1 — Playwright version mismatch (commit `9f4d324c0`)
**Sintoma:** `🎭 E2E Tests (Playwright)` falhando com erro de versão incompatível.  
**Causa:** `bun.lock` e `.github/toolchain.json` tinham `playwright@1.63.0`; `ci.yml` usava `1.64.1`.  
**Arquivos corrigidos:**
- `.github/toolchain.json` — `1.63.0` → `1.64.1`
- `package.json` — `@playwright/test: 1.63.0` → `1.64.1`
- `bun.lock` — regenerado com `bun install` (todas as entradas playwright → `1.64.1`)
- `.github/workflows/e2e-logado.yml` — linhas 131, 135: `playwright@1.63.0` → `1.64.1`
- `.github/workflows/e2e-talkx.yml` — linhas 94, 98: `playwright@1.63.0` → `1.64.1`

### Falha 2 — Migration editada após commit (commit `709fccbbd`)
**Sintoma:** `Contrato DB offline` falhando com "Rejeitar edicao de migration ja existente".  
**Causa:** `supabase/migrations/20261009193246_team_receipts_reactions_conversation_id_forced.sql` havia sido modificado na branch (adicionadas linhas `DISABLE/ENABLE TRIGGER` ao redor do backfill), mas o arquivo já existia em `main` — qualquer edição dispara o guard `db-guard.yml`.  
**Correção:** revertido ao conteúdo idêntico ao de `main` (removidas 3 linhas: comentário adicional e os dois `ALTER TABLE ... DISABLE/ENABLE TRIGGER`).

### Falha 3 — Unit test: `getBoundingClientRect` sem `writable: true` (commit `709fccbbd`)
**Sintoma:** `🧪 Unit Tests` falhando em `useFilesContainerColumns.test.tsx` no teste de resize.  
**Causa:** `Object.defineProperty` em `containerOf()` (linha 16) definia `getBoundingClientRect` sem `writable: true`; o teste de resize (linha 131) tentava reatribuir a propriedade diretamente — lança `TypeError` em strict mode.  
**Correção:** adicionado `writable: true` no `defineProperty`.

### Falha 4 — `fila-merge.mjs` catch sem `bloqueadas` (commit `709fccbbd`)
**Sintoma:** `🧩 Node CI Scripts` falhando com `TypeError: Cannot read properties of undefined (reading 'length')`.  
**Causa:** catch block em `decisaoAtual()` (linha 138) retornava `{ acao: 'aguardar', ..., fila: [] }` sem `bloqueadas`; `main()` acessava `decisao.bloqueadas.length` incondicionalmente (linha 175).  
**Correção:** adicionado `bloqueadas: []` no objeto retornado pelo catch.

---

## 3. Estado dos 6 checks obrigatórios em `709fccbbd`

| Check | Conclusion |
|---|---|
| `🔍 Lint & TypeCheck` | success ✅ (`🔎 TypeCheck` job) |
| `🧪 Unit Tests` | in_progress (3 shards) |
| `🏗️ Build` | aguardando jobs anteriores |
| `🔒 Security Audit` | **success** ✅ |
| `Contrato DB offline` | in_progress |
| `🎭 E2E Tests (Playwright)` | in_progress |

Check não obrigatório que passou: `Replay local das migrations` — **success** ✅

---

## 4. Inventário de workflows na `main` (últimas execuções)

| Workflow | Último status | Observação |
|---|---|---|
| Auto Update PR Branches | success/cancelled (normal) | Disparado a cada push em main; cancela runs redundantes |
| CI (`ci.yml`) | — | Required checks definidos nos PRs, não na main diretamente |
| DB Guard (`db-guard.yml`) | success | Valida migrations em cada PR |
| Settings Guard | — | Agendado 15/*/6h UTC |
| DB Live Guard | — | Agendado diariamente 06:13 UTC |

Nenhuma falha ativa nos workflows obrigatórios da `main` identificada durante esta sessão.

---

## 5. Commits da branch

| SHA | Descrição |
|---|---|
| `1c3369932` | commit inicial (sessão anterior) — useFilesContainerColumns + fila-merge + migration |
| `9f4d324c0` | fix: alinhar playwright 1.63.0 → 1.64.1 em todos os artefatos |
| `709fccbbd` | fix: corrigir 3 falhas de CI no PR #2218 |
| `(este commit)` | chore: adicionar RELATORIO_CI e PENDENCIAS ao repositório |
