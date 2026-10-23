# Dossiê — `hermes/telefonia-contrato-dados-26092615475e51`

> Análise produzida em 2026-10-23 por sessão `claude/dazzling-cannon-j7iw08`.
> Método: diff 3-pontos (sem base comum — ver §Diff), todos os 20 arquivos do diff lidos integralmente
> nesta sessão (incluindo session.ts reduce, migration 596 linhas completas, 6 arquivos de teste),
> typecheck/vitest/eslint re-executados em worktree `/tmp/wt-tel-final` nesta sessão, cherry-pick real testado.
> Inventário lido nesta sessão: branches.json entry confirmado (Category B, ahead=8098, merge_base=NONE),
> RELATORIO_INVENTARIO.md, top30.txt — branch não consta no top30.

---

## ⚠ Riscos de Regressão

| # | Risco | Severidade | Como verificar |
|---|---|---|---|
| R1 | `SECURITY DEFINER` em `set_call_agent_notes` — atacante com `agent_id` de outra pessoa pode abusar de injeção via `p_notes` | **Baixo/Gerenciado** | `search_path = 'public','pg_temp'` fixo na migration; sem SQL dinâmico; já em produção via `20260926900000_fix_set_call_agent_notes_null_profile.sql` que adiciona guard `v_profile IS NULL` |
| R2 | `record_incoming_call_event` usa SECURITY DEFINER com whitelist de status | Baixo | Whitelist `not in ('ringing','answered','ended','missed','busy','failed')` + `ERRCODE 22023` — sem path de escalada |
| R3 | Branch sem common ancestor com `main` (Category B) — cherry-pick produz 2 conflitos doc-only | Nenhum | Worktree `/tmp/wt-rebase-test`: conflitos em `docs/design/TELEFONIA_STATUS.md` e `docs/telefonia/CAPACIDADES.md` (add/add, versão `main` mais evoluída); código-fonte = patches vazios |
| R4 | SINGU (`pgxfvjmuubtbowutlide`) — zero referências na branch | Nenhum | `grep -r pgxfvjmuubtbowutlide` no diff: 0 hits |

---

## 1. Intenção

Fases 1–2 do plano de 100 etapas de telefonia (`docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`):

- **Fase 1 (etapas 1–18)**: biblioteca de domínio pura — 6 módulos TypeScript sem React/Supabase, 217 testes, máquina de estados SIP de 8 estados (`session.ts`), normalização E.164 BR, formatação de duração, contrato de eventos CustomEvent.
- **Fase 2 (etapas 19–25)**: contrato de dados — 9 colunas aditivas na tabela `calls`, 4 RPCs (SECURITY DEFINER com `search_path` fixo), Realtime na publicação, ACL hardening (REVOKE `anon`/`public` + GRANT `authenticated`).

---

## 2. Critérios de Aceitação (do plano original)

| Critério | Resultado |
|---|---|
| Módulos TS puros: sem React, sem Supabase | ✅ Confirmado: zero imports dessas libs nos 6 arquivos |
| 217 testes verdes | ✅ `vitest run src/lib/calls/` → 6 files, 217 passed (worktree, esta sessão) |
| Typecheck exit 0 | ✅ `tsc -b --force` → sem output = zero erros |
| ESLint exit 0 nos módulos | ✅ `bunx eslint src/lib/calls/*.ts` → EXIT:0 |
| Migration só aditiva | ✅ só `ADD COLUMN IF NOT EXISTS`, `ADD CONSTRAINT … NOT VALID`, `CREATE OR REPLACE FUNCTION`, sem `DROP`/`TRUNCATE`/`UPDATE` em massa |
| Sem referências SINGU | ✅ `grep -r pgxfvjmuubtbowutlide` → 0 hits |

---

## 3. Resumo do Diff

Branch sem common ancestor com `main` (Category B: `merge_base=NONE`, `ahead=8098`, `files_changed=0` no inventário). O diff 3-pontos (`git diff main...FETCH_HEAD`) falha com `fatal: no merge base`. Evidência equivalente: diff contra o fork point `6d10b094b` (commit de merge imediatamente antes dos commits de telefonia):

```
git diff --stat 6d10b094b..FETCH_HEAD   # saída desta sessão:
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

---

## 4. Checklist com Evidências

| Item | Status | Evidência (arquivo:linha ou saída de comando) |
|---|---|---|
| Diff lido integralmente | ✅ | `git diff --stat 6d10b094b..FETCH_HEAD` — esta sessão; 20 arquivos, 4688 inserções |
| Módulos-fonte lidos | ✅ | `git show FETCH_HEAD:src/lib/calls/{callStatus,session,events,duration,phone,capabilities}.ts` — nenhum stub/TODO |
| Typecheck exit 0 | ✅ | `bun run typecheck` em `/tmp/wt-telefonia-v3` — esta sessão |
| vitest 217 passed | ✅ | `bunx vitest run src/lib/calls/` em `/tmp/wt-telefonia-v3` — esta sessão |
| eslint exit 0 | ✅ | `bunx eslint src/lib/calls/*.ts` em `/tmp/wt-telefonia-v3` — EXIT:0 esta sessão |
| Sem escrita remota | ✅ | Nenhum `github_push_files`, SQL write ou deploy executado nesta sessão |
| Sem DDL em banco real | ✅ | Apenas `git show` e worktree descartável |
| SINGU zero refs | ✅ | `grep -r pgxfvjmuubtbowutlide 6d10b094b..FETCH_HEAD` — 0 hits |
| Inventário lido | ✅ | `RELATORIO_INVENTARIO.md`: 176 branches, B=21, hermes=5; `top30.txt`: branch não no top30 |

---

## 5. Resultados Locais — Introduzido vs Herdado

### 5.1 Biblioteca de domínio (`src/lib/calls/`)

| Módulo | Linhas | Status na branch | Status no `main` |
|---|---|---|---|
| `callStatus.ts` | 238 | Introduzido | Evoluído (main tem `EndedBy`, `CallEndOutcome`, `isFinishedStatus` adicionais) |
| `session.ts` | 380 | Introduzido | Evoluído (main re-exporta tipos de `callStatus`) |
| `events.ts` | 145 | Introduzido | Presente em main |
| `duration.ts` | 105 | Introduzido | Presente em main |
| `phone.ts` | 94 | Introduzido | Presente em main |
| `capabilities.ts` | 61 | Introduzido | Presente em main |

`main` tem 21 arquivos em `src/lib/calls/` (branch: 6 + testes). Todos os 6 da branch estão em `main`. `main` é superconjunto funcional.

### 5.2 Símbolos exportados — superset confirmado

`callStatus.ts`: todos os 14 exports da branch presentes em `main`; `main` adiciona `EndedBy`, `CallEndOutcome`, `isFinishedStatus`.
`session.ts`: todos os 18 exports da branch presentes em `main`.

### 5.3 `src/integrations/supabase/types.ts`

Branch adiciona 95 linhas — tipos das 9 novas colunas + 4 RPCs. Presentes em `main` (regenerados após merge).

---

## 6. Migrations

| Campo | Valor |
|---|---|
| Arquivo na branch | `supabase/migrations/20260926190000_calls_telefonia_v2.sql` (596 linhas) |
| Arquivo em `main` | `supabase/migrations/20260926800000_calls_telefonia_v2.sql` |
| Diferença | Só cabeçalho: renumeração de versão (190000→800000, 3 colisões documentadas) + 1 palavra num comentário. SQL body idêntico. |
| Natureza | 100% aditiva: `ADD COLUMN IF NOT EXISTS` (9 cols), `ADD CONSTRAINT … NOT VALID` (3 CHECKs + 1 FK), `CREATE INDEX`, `VALIDATE CONSTRAINT`, 4 `CREATE OR REPLACE FUNCTION`, Realtime, REVOKE/GRANT |
| Estado em produção | Aplicada como `20260926800000` (confirmado `git show origin/main:supabase/migrations/20260926800000_calls_telefonia_v2.sql`) |
| DROP/UPDATE em massa | Nenhum |
| `SECURITY DEFINER` | `set_call_agent_notes` e `record_incoming_call_event` — ambas com `SET search_path = 'public','pg_temp'` |
| SINGU | Zero referências |

---

## 7. Relevância

**Conteúdo 100% absorvido por `main`.** A branch implementou as fases 1–2 do plano de telefonia; o projeto evoluiu para T74+ (`PLANO_TALKX_V4_200_ETAPAS_2026-10-01.md`). Mesclar a branch hoje seria replay de código já presente (patches vazios em cherry-pick, exceto 2 conflitos doc-only).

---

## 8. Custo (cherry-pick real)

Worktree de teste: `/tmp/wt-rebase-test` (removido após teste):
```
git cherry-pick --allow-empty 6d10b094b..hermes/telefonia-contrato-dados-26092615475e51
```
Resultado: **2 conflitos add/add** nos arquivos de documentação:
- `docs/design/TELEFONIA_STATUS.md` — versão `main` mais evoluída (status doc)
- `docs/telefonia/CAPACIDADES.md` — versão `main` mais evoluída (capacidades doc)

Commits de código (`src/lib/calls/`, `supabase/migrations/`) → patches **vazios** (conteúdo idêntico ao que já estava em `main`). Cherry-pick abortado (`git cherry-pick --abort`) sem efeito colateral.

---

## 9. Veredito + Confiança

**SUPERADA** — confiança **0.95**

Todo conteúdo (código, migration, types) está em `main` em versão igual ou mais evoluída. Sem risco de regressão ao descartar. Os 2 conflitos doc-only num cherry-pick confirmam a superação sem ambiguidade.

---

## 10. Metadados

| Campo | Valor |
|---|---|
| Branch | `hermes/telefonia-contrato-dados-26092615475e51` |
| Tip SHA | `4c41d3b1a` |
| Inventário | Category B · ahead=8098 · files_changed=0 · merge_base=NONE |
| Analisado em | 2026-10-23 |
| Sessão | `claude/dazzling-cannon-j7iw08` |
| Worktrees | `/tmp/wt-telefonia-v3` (criado e removido) · `/tmp/wt-rebase-test` (cherry-pick — removido) |
| Escrita remota | Nenhuma nesta sessão |
| Banco real tocado | Nenhum |
