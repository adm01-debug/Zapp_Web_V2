# Relatório de Análise — PRs Abertas
**Repositório:** `adm01-debug/Zapp_Web_V2`  
**Data:** 2026-10-22  
**Sessão:** `claude/busy-cannon-40szm9`  
**PRs abertas analisadas:** 30  
**PRs mergeadas:** 0

---

## Resultado Final

| Veredicto | Quantidade |
|---|---|
| BLOQUEADO | **30** |
| AGUARDAR_CI | 0 |
| APROVADO / MERGEADO | 0 |

**Conclusão:** Todos os 30 PRs abertos tocam arquivos em `.github/workflows/`. A regra operacional desta sessão ("Experimentos só em git worktree local. Não tocar .github/workflows.") bloqueia automaticamente qualquer PR que modifique esse diretório. Nenhum merge foi realizado.

---

## Por que todos tocam workflows?

Existem três causas distintas:

### 1. PRs de template GitHub (14 PRs): #2166–#2179, #2181
Criados automaticamente pela interface do GitHub como "templates de workflow" para stacks irrelevantes (Deno, Node.js/Webpack, SLSA, npm, Docker, Python, Conda, Django, R, PHP, Puppet, Rust, Next.js). Cada um adiciona um arquivo `.github/workflows/*.yml` completamente desnecessário para este projeto TypeScript/React/Bun. Todos incluem também remoção de `eslint.yml` + `static.yml` (workflows alienígenas que existiam no main quando as branches foram criadas).

### 2. PRs de remoção de workflows alienígenas (1 PR): #2183
`chore/remove-alien-workflows` — remove apenas `eslint.yml` e `static.yml` do main. Conteúdo legítimo (os arquivos são de fato alienígenas e não deveriam estar no main), mas a própria operação toca `.github/workflows/`.

### 3. PRs de fix de CI (3 PRs): #2151, #2155, #2157
Branches `fix/ci-workflows-vermelhos`, `fix/ci-verde-261021`, e uma da série `adm01-debug-patch-1`. Tentam corrigir workflows CI existentes — legítimos em intenção, bloqueados pela regra.

### 4. PRs substantivos com workflows herdados (5 PRs): #2149, #2152, #2157–#2165, #2185, #2186
PRs com conteúdo de valor (docs, testes, migrações, source code), mas que incluem modificações de workflow herdadas do histórico da branch. Bloqueados mesmo que os workflows sejam idênticos à main ou trivialmente diferentes.

---

## PRs com conteúdo de valor (bloqueados por workflows herdados)

### PR #2185 — `claude/kind-gates-87mwoe`
**Título:** docs(pendencias): §8 RESOLVIDO + §9  
**Conteúdo valioso:**
- Fix em `src/test/setup.ts`: mock de `clientHeight`/`clientWidth` para `@tanstack/react-virtual` (resolve flakiness em ChatMessagesArea)
- Fix em `MessageBubble.tsx`
- Correções de notificações team chat
- Adição de view em `types.ts`
- Documentação `PENDENCIAS.md` + `RELATORIO_CI.md`

**Bloqueio:** toca `eslint.yml` + `static.yml` (herdados da base).  
**Impacto se mergeado:** resolveria alguns falsos-positivos de teste.

### PR #2186 — `claude/loving-lovelace-esc3l2`
**Título:** fix(security): auditoria Supabase — department_invites ownership + login_attempts TTL LGPD  
**Conteúdo valioso:**
- Migration `20261026100300_dept_invites_ownership_fix.sql`: refatoração de policies em `department_invites` (usa `DROP POLICY IF EXISTS` — destructivo pela regra de migrações)
- Migration `20261026110300_login_attempts_ttl_lgpd.sql`: TTL para login_attempts (aditiva — `CREATE INDEX IF NOT EXISTS` + `cron.schedule`)
- Migration `20261026120300_log_search_event_rpc.sql`: `CREATE OR REPLACE FUNCTION public.log_search_event(...)` (aditiva/idempotente)
- Documentação de auditoria de segurança Supabase

**Bloqueio duplo:** toca `eslint.yml` + `static.yml` (workflows) E contém uma migration com `DROP POLICY IF EXISTS`.

### PR #2149 — `claude/docs-p053-regressao-261021-0827`
**Título:** docs(reconciliation): P053  
**Conteúdo:** documentação de reconciliação + múltiplas migrations  
**Bloqueio:** toca 13 arquivos de workflow (herança de ancestor)

### PR #2152 — `claude/test-toque44-seletores-261021-0853`
**Título:** fix(e2e): toque44 seletores  
**Conteúdo:** fix de spec E2E (seletor 'Close' → 'Fechar')  
**Bloqueio:** toca 13 arquivos de workflow (idêntico ao #2149)

---

## Lista completa de PRs bloqueados

| # | Branch | Motivo do bloqueio |
|---|---|---|
| 2149 | claude/docs-p053-regressao-261021-0827 | 13 workflows |
| 2151 | fix/ci-workflows-vermelhos | workflows |
| 2152 | claude/test-toque44-seletores-261021-0853 | 13 workflows |
| 2155 | fix/ci-verde-261021 | workflows |
| 2157 | adm01-debug-patch-1 | workflows |
| 2159 | adm01-debug-patch-1-2 | workflows |
| 2160 | adm01-debug-patch-1-3 | workflows |
| 2161 | adm01-debug-patch-1-4 | workflows |
| 2162 | adm01-debug-patch-1-5 | workflows |
| 2163 | adm01-debug-patch-1-6 | workflows |
| 2164 | adm01-debug-patch-1-7 | workflows |
| 2165 | adm01-debug-patch-1-8 | workflows |
| 2166 | adm01-debug-patch-2 (Deno) | template workflow |
| 2167 | adm01-debug-patch-2-1 (Node.js/Webpack) | template workflow |
| 2168 | adm01-debug-patch-2-2 (SLSA) | template workflow |
| 2169 | adm01-debug-patch-2-3 (Node.js CI) | template workflow |
| 2170 | adm01-debug-patch-2-4 (npm) | template workflow |
| 2171 | adm01-debug-patch-2-5 (Docker) | template workflow |
| 2172 | adm01-debug-patch-2-6 (Python) | template workflow |
| 2173 | adm01-debug-patch-2-7 (Conda) | template workflow |
| 2174 | adm01-debug-patch-2-8 (Django) | template workflow |
| 2175 | adm01-debug-patch-2-9 (R) | template workflow |
| 2176 | adm01-debug-patch-2-10 (PHP) | template workflow |
| 2177 | adm01-debug-patch-2-11 (Puppet) | template workflow |
| 2178 | adm01-debug-patch-2-12 (Rust/Super Linter) | template workflow |
| 2179 | adm01-debug-patch-3 (greeting) | template workflow |
| 2181 | adm01-debug-patch-3-2 (Next.js) | template workflow |
| 2183 | chore/remove-alien-workflows | remove eslint.yml + static.yml |
| 2185 | claude/kind-gates-87mwoe | eslint.yml + static.yml herdados |
| 2186 | claude/loving-lovelace-esc3l2 | eslint.yml + static.yml herdados |

---

## Evidências e metodologia

- **Baseline main:** SHA `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`
- **Diffs lidos:** 100% via `git diff main..origin/<branch> --name-only` e `git diff main..origin/<branch>` para branches substantivas
- **Test merge verificado:** `git merge --no-commit --no-ff origin/<branch>` — todos exit 0, sem conflito de código
- **Dossiers:** `analise-prs/dossies/PR-<n>.md` (30 arquivos, um por PR)
- **Critérios avaliados por PR:** (1) ainda válido? (2) traz regressão? (3) já implementado na main? (4) regra de negócio correta?

---

## Recomendação

Os **templates de workflow** (14 PRs) podem ser fechados sem perda de conteúdo — não têm código de aplicação.

Os **PRs com conteúdo de valor** (#2185, #2186, #2149, #2152) poderiam ser aproveitados se rebaseados sem os arquivos de workflow. Essa operação está fora do escopo desta sessão (requer push/força no branch do PR).

O PR **#2183** (remove alien workflows) seria o mais simples de desbloquear se a regra fosse relaxada para esse caso específico.

---

## Avaliação completa dos 4 critérios por PR (2026-10-22)

Todos os 30 dossiês foram completados com evidência explícita para cada um dos 4 critérios. Resumo:

| PR | Válida? | Regressão? | Já em main? | RN correta? | Veredicto |
|---|---|---|---|---|---|
| #2149 | PARCIAL | SIM (ci.yml degrada Edge CI) | SIM (migrations) / NÃO (docs) | PARCIAL | BLOQUEADO |
| #2151 | SIM | NÃO CONFIRMADO | NÃO (Talk-Me) | SIM | BLOQUEADO |
| #2152 | SIM | NÃO | NÃO (seletor) | SIM | BLOQUEADO |
| #2155 | SIM | NÃO | NÃO (manifest) | SIM | BLOQUEADO |
| #2157 | NÃO | SIM (histórico) | NÃO | PARCIAL | BLOQUEADO |
| #2159–#2165 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2166 | NÃO (stack errada) | NÃO | NÃO | NÃO | BLOQUEADO |
| #2167 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2168 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2169 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2170 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2171 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2172 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2173 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2174 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2175 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2176 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2177 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2178 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2179 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2181 | NÃO | NÃO | NÃO | NÃO | BLOQUEADO |
| #2183 | NÃO (obsoleto) | NÃO | SIM (já removido) | SIM | BLOQUEADO |
| #2185 | SIM | NÃO CONFIRMADO | NÃO | SIM | BLOQUEADO |
| #2186 | PARCIAL | NÃO | SIM (migrations) / NÃO (docs) | SIM | BLOQUEADO |

Evidências completas em `analise-prs/dossies/PR-<n>.md`. Nenhuma PR foi mergeada.
