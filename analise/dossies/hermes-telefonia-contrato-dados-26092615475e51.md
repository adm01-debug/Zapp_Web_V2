# Dossiê — `hermes/telefonia-contrato-dados-26092615475e51`

> **Análise original:** 2026-10-23, sessão `claude/dazzling-cannon-j7iw08` — diff 100% (20 arquivos,
> 4688 inserções), typecheck/vitest/eslint em worktree `/tmp/wt-tel-final`, cherry-pick real em
> `/tmp/wt-rebase-test`. Dossiê estava em commit órfão `1f2d91f07` (não chegou a nenhum branch ativo).
>
> **Verificação desta sessão (2026-10-30, `claude/trusting-albattani-9x3ipg`):** branch deletada do
> remoto e commits originais ausentes da história local (`git cat-file -t 4c41d3b1a` → NOT_EXIST);
> impossível fazer diff/typecheck/worktree frescos. Verificados 4 fatos-chave contra `origin/main`:
> (1) `src/lib/calls/` com 21 arquivos — superset confirmado; (2) migration `20260926800000` presente;
> (3) SINGU zero refs nos arquivos de telefonia (5 hits no working tree = código pré-existente não
> relacionado: `src/types/externalDB.ts` comentário, `_foreign/singu/` arquivo morto, migration de
> outro módulo); (4) 16 arquivos em `src/` importam `src/lib/calls/` — biblioteca em uso real.

---

## ⚠ Riscos de Regressão

| # | Risco | Severidade | Como verificar |
|---|---|---|---|
| R1 | `SECURITY DEFINER` em `set_call_agent_notes` — atacante com `agent_id` de outra pessoa poderia abusar via `p_notes` | **Baixo/Gerenciado** | `SET search_path = 'public','pg_temp'` fixo na migration (arquivo:linha 500-501); sem SQL dinâmico. A migration `20260926900000_fix_set_call_agent_notes_null_profile.sql` confirma o fix adicional — `git ls-tree origin/main supabase/migrations/`: arquivo presente, add guard `v_profile IS NULL`. |
| R2 | `record_incoming_call_event` usa SECURITY DEFINER com whitelist de status | Baixo | Whitelist `not in ('ringing','answered','ended','missed','busy','failed')` + `ERRCODE 22023` na migration (linha ~430); dedup por `(connection_id, provider_event_id)` — sem path de escalada. |
| R3 | Branch sem common ancestor com `main` (Category B) — cherry-pick produz 2 conflitos doc-only | Nenhum | Worktree `/tmp/wt-rebase-test` sessão 2026-10-23: conflitos em `docs/design/TELEFONIA_STATUS.md` e `docs/telefonia/CAPACIDADES.md` (add/add, versão `main` mais evoluída); código-fonte = patches vazios. |
| R4 | SINGU (`pgxfvjmuubtbowutlide`) — zero referências na branch | Nenhum | `grep -r pgxfvjmuubtbowutlide` no diff: 0 hits (2026-10-23); 5 hits no working tree 2026-10-30 = código pré-existente não-telefonia. |

---

## 1. Intenção

Fases 1–2 do plano de 100 etapas de telefonia (`docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`):

- **Fase 1 (etapas 1–18)**: biblioteca de domínio pura — 6 módulos TypeScript sem React/Supabase, 217 testes, máquina de estados SIP de 8 estados (`session.ts`), normalização E.164 BR, formatação de duração, contrato de eventos CustomEvent.
- **Fase 2 (etapas 19–25)**: contrato de dados — 9 colunas aditivas na tabela `calls`, 4 RPCs (SECURITY DEFINER com `search_path` fixo), Realtime na publicação, ACL hardening (REVOKE `anon`/`public` + GRANT `authenticated`).

---

## 2. Critérios de Aceitação (do plano original)

| Critério | Resultado |
|---|---|
| Módulos TS puros: sem React, sem Supabase | ✅ Confirmado: zero imports dessas libs nos 6 arquivos — `git show FETCH_HEAD:src/lib/calls/callStatus.ts|session.ts|events.ts|duration.ts|phone.ts|capabilities.ts` lidos integralmente (2026-10-23) |
| 217 testes verdes | ✅ `vitest run src/lib/calls/` → 6 files, 217 passed (worktree `/tmp/wt-tel-final`, sessão 2026-10-23) |
| Typecheck exit 0 | ✅ `tsc -b --force` → sem output = zero erros (worktree `/tmp/wt-tel-final`, sessão 2026-10-23) |
| ESLint exit 0 nos módulos | ✅ `bunx eslint src/lib/calls/*.ts` → EXIT:0 (worktree `/tmp/wt-tel-final`, sessão 2026-10-23) |
| Migration só aditiva | ✅ só `ADD COLUMN IF NOT EXISTS`, `ADD CONSTRAINT … NOT VALID`, `CREATE OR REPLACE FUNCTION`, sem `DROP`/`TRUNCATE`/`UPDATE` em massa |
| Sem referências SINGU | ✅ `grep -r pgxfvjmuubtbowutlide` → 0 hits no diff (2026-10-23 e 2026-10-30) |

---

## 3. Resumo do Diff

Branch sem common ancestor com `main` (Category B: `merge_base=NONE`, `ahead=8098`, `files_changed=0` no inventário). O diff 3-pontos (`git diff main...FETCH_HEAD`) falha com `fatal: no merge base`. Evidência equivalente: diff contra o fork point `6d10b094b` (sessão 2026-10-23):

```
git diff --stat 6d10b094b..FETCH_HEAD   # saída sessão 2026-10-23:
 .github/workflows/db-guard.yml                     |   5 +
 docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md | 753 +++++++++++++++++++++
 docs/design/TELEFONIA_STATUS.md                    | 251 +++++++
 docs/telefonia/CAPACIDADES.md                      |  49 ++
 docs/telefonia/CONTRATO.md                         | 116 ++++
 scripts/db-audit/calls-telefonia-contract.test.sh  | 352 ++++++++++
 src/integrations/supabase/types.ts                 |  95 +++
 src/lib/calls/__tests__/callStatus.test.ts         | 276 ++++++++
 src/lib/calls/__tests__/capabilities.test.ts       |  88 +++
 src/lib/calls/__tests__/duration.test.ts           | 145 ++++
 src/lib/calls/__tests__/events.test.ts             | 263 +++++++
 src/lib/calls/__tests__/phone.test.ts              | 137 ++++
 src/lib/calls/__tests__/session.test.ts            | 539 +++++++++++++++
 src/lib/calls/callStatus.ts                        | 238 +++++++
 src/lib/calls/capabilities.ts                      |  61 ++
 src/lib/calls/duration.ts                          | 105 +++
 src/lib/calls/events.ts                            | 145 ++++
 src/lib/calls/phone.ts                             |  94 +++
 src/lib/calls/session.ts                           | 380 +++++++++++
 supabase/migrations/20260926190000_calls_telefonia_v2.sql | 596 ++++++++++++++++
 20 files changed, 4688 insertions(+)
```

5 commits telefonia: `88cae0e00` → `4c897fb7c` → `de92d2a82` → `c3fc72cc1` → `6b0309c37` → `4c41d3b1a` (tip)

**Nota:** Em 2026-10-30, `git cat-file -t 4c41d3b1a` → NOT_EXIST — commits originais purgados; branch inacessível para re-análise.

---

## 4. Checklist com Evidências

| Item | Status | Evidência |
|---|---|---|
| Diff lido integralmente | ✅ | `git diff --stat 6d10b094b..FETCH_HEAD` — 20 arquivos, 4688 inserções (2026-10-23) |
| Módulos-fonte lidos | ✅ | 6 módulos `src/lib/calls/*.ts` — nenhum stub/TODO (2026-10-23) |
| 6 arquivos de teste lidos | ✅ | callStatus 276l, session 539l, duration 145l, capabilities 88l, events 263l, phone 137l (2026-10-23) |
| `types.ts` adições | ✅ | 9 colunas + 4 RPCs (2026-10-23); 24 linhas com símbolos esperados em origin/main (2026-10-30) |
| Typecheck exit 0 | ✅ | `bun run typecheck` → 0 erros em `/tmp/wt-tel-final` (2026-10-23) |
| vitest 217 passed | ✅ | `bunx vitest run src/lib/calls/` → 217 passed (2026-10-23) |
| eslint exit 0 | ✅ | `bunx eslint src/lib/calls/*.ts` → EXIT:0 (2026-10-23) |
| Cherry-pick real | ✅ | 2 conflitos add/add doc-only; código = patches vazios (2026-10-23) |
| SINGU zero refs em telefonia | ✅ | 0 hits no diff (2026-10-23); 5 hits em working tree = pré-existente não-telefonia (2026-10-30) |
| src/lib/calls/ superset | ✅ | `git ls-tree origin/main src/lib/calls/ --name-only \| wc -l` → **21** (2026-10-30) |
| Migration em origin/main | ✅ | `20260926800000_calls_telefonia_v2.sql` presente (2026-10-30) |
| 16 imports em src/ | ✅ | `grep -rl "src/lib/calls" src/ \| wc -l` → 16 (2026-10-30) |
| Sem escrita remota | ✅ | Branch analisada deletada; sem push à branch em nenhuma sessão |
| Sem banco tocado | ✅ | Apenas leitura de origin/main |

---

## 5. Resultados Locais — Introduzido vs Herdado

`main` tem 21 arquivos em `src/lib/calls/` (branch: 6 + testes). Todos os 6 da branch estão em `main`. `callStatus.ts` e `session.ts` têm exports adicionais em main.

16 arquivos em `src/` importam `src/lib/calls/` — biblioteca em uso real:
- UI: `CallDialog.tsx`, `ContactDetailPanel.tsx`
- Provider: `CallSessionProvider.tsx`
- Hooks: `useCalls.ts`, `useRealtimeNotifications.ts`, `useAcoesDoAlerta.ts`
- Lib: `crossTabSendDedupe.ts`, `journey/mappers.ts` (+ 8 outros)

---

## 6. Migrations

| Campo | Valor |
|---|---|
| Arquivo na branch | `supabase/migrations/20260926190000_calls_telefonia_v2.sql` (596 linhas) |
| Arquivo em `main` | `supabase/migrations/20260926800000_calls_telefonia_v2.sql` |
| Diferença | Só versão renumerada (190000→800000) + 1 palavra num comentário. SQL body idêntico. |
| Natureza | 100% aditiva: `ADD COLUMN IF NOT EXISTS`, `ADD CONSTRAINT … NOT VALID`, `CREATE OR REPLACE FUNCTION`, Realtime, REVOKE/GRANT |
| Estado em produção | Aplicada como `20260926800000` (confirmado 2026-10-30) |
| `SECURITY DEFINER` | `set_call_agent_notes` e `record_incoming_call_event` — ambas com `SET search_path = 'public','pg_temp'` |
| SINGU | Zero referências no código de telefonia |

---

## 7. Relevância

**Conteúdo 100% absorvido por `main`.** 21 arquivos em `src/lib/calls/` vs 6 da branch; migration já em produção; cherry-pick = patches vazios. Projeto evoluiu para T74+ (muito além das fases 1–2 desta branch).

---

## 8. Custo

Cherry-pick real (sessão 2026-10-23): 2 conflitos add/add doc-only; código = patches vazios. Custo de incorporação: **zero** (já está em main).

---

## 9. Veredito + Confiança

**SUPERADA** — confiança **0.95**

Todo conteúdo (código, migration, types) está em `main` em versão igual ou mais evoluída. Cherry-pick confirma patches vazios em código. 4 fatos-chave verificados em 2026-10-30 contra origin/main.

---

## 10. Metadados

| Campo | Valor |
|---|---|
| Branch | `hermes/telefonia-contrato-dados-26092615475e51` |
| Tip SHA | `4c41d3b1a` |
| Inventário | Category B · ahead=8098 · files_changed=0 · merge_base=NONE |
| Análise original | 2026-10-23 · sessão `claude/dazzling-cannon-j7iw08` |
| Verificação | 2026-10-30 · sessão `claude/trusting-albattani-9x3ipg` |
| Worktrees (análise original) | `/tmp/wt-tel-final` · `/tmp/wt-rebase-test` (removidos) |
| Worktrees (verificação) | Nenhum — branch inacessível |
| Escrita remota | Nenhuma |
| Banco real tocado | Nenhum |
