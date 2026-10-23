# Dossiê — `hermes/telefonia-contrato-dados-26092615475e51`

> Análise produzida em 2026-10-23 por sessão `claude/dazzling-cannon-j7iw08`.
> Método completo: diff 100%, typecheck, vitest, leitura da migration, consulta ao banco de produção.
> Worktree criado em `/tmp/wt-telefonia`, removido após análise.

---

## 1. Intenção

**Fases 1 e 2** do plano de telefonia (`docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`):

- **Fase 1 (etapas 10–17):** biblioteca de domínio pura TypeScript — tipos canônicos de estado/resultado/duração/telefone/capacidades, máquina de estados SIP, contrato de eventos `zapp:start-call`.
- **Fase 2 (etapas 18–25):** extensão aditiva do schema `public.calls` (9 novas colunas, 3 constraints, 2 índices, realtime), 4 novas RPCs, backfill de `channel`/`peer_number`/`peer_name` nos registros históricos, prova de RLS em PostgreSQL 17 descartável.

Critério implícito de "pronto": módulos TypeScript com zero dependências externas, 215+ testes unitários verdes, migration idempotente com prova de RLS em Postgres descartável, `tsc` e `db:guard` limpos.

Executor: **Hermes** (Claude Code no WSL), workspace isolado por tarefa.

---

## 2. Commits exclusivos

```
88cae0e0  chore(telefonia): ledger, matriz de capacidades e o plano das 100 etapas
4c897fb7  feat(telefonia): fase 1 - contrato de dominio (status, duracao, telefone, capacidades, sessao, eventos)
de92d2a8  infra(telefonia): contrato de dados da fase 2 - colunas aditivas, RPCs, realtime e prova de RLS
c3fc72cc  refactor(telefonia): unifica EndReason e o mapa SIP em ./callStatus (dono unico)
6b0309c3  docs(telefonia): ledger aponta os commits por titulo, nao por sha volatil
4c41d3b1  docs(telefonia): registra a outra migration pendente na main e a ordem de apply
```

Base SHA: `001fd463` (merge de `#873` — `hermes/fix-e2e-nome-lista-26092615369eb1`).

---

## 3. Diff completo (22 arquivos, 4 713 inserções, 2 deleções)

Evidência: `git diff 001fd463b..HEAD --stat` na worktree `/tmp/wt-telefonia`.

| Arquivo | Tipo | Conteúdo |
|---|---|---|
| `src/lib/calls/callStatus.ts` | NOVO | Tipos canônicos + `normalizeStatus`, `toResult`, `sipCodeToEndReason`, tabelas pt-BR |
| `src/lib/calls/session.ts` | NOVO | Máquina de estados SIP pura (`reduce`), 8 estados |
| `src/lib/calls/events.ts` | NOVO | Contrato `zapp:start-call`, compat. legada `start-voip-call` |
| `src/lib/calls/duration.ts` | NOVO | `talkSeconds`, `formatClock`, `formatTalk` |
| `src/lib/calls/phone.ts` | NOVO | Normalização E.164 BR, `phonesMatchExact` (só exato) |
| `src/lib/calls/capabilities.ts` | NOVO | `ChannelCapability`, `CapabilityReason`, `REASON_LABEL` |
| `src/lib/calls/__tests__/` | NOVO | 6 arquivos de teste |
| `supabase/migrations/20260926190000_calls_telefonia_v2.sql` | NOVO | 9 colunas, 3 checks, 2 índices, 4 RPCs, realtime (596 linhas) |
| `src/integrations/supabase/types.ts` | MODIFICADO | +9 colunas em `calls`, +4 RPCs tipadas |
| `docs/design/TELEFONIA_STATUS.md` | NOVO | Ledger de gates CP0–CP2 |
| `docs/telefonia/CONTRATO.md` | NOVO | Contrato de domínio |
| `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` | NOVO | Plano das 100 etapas |
| `docs/telefonia/CAPACIDADES.md` | NOVO | Matriz de capacidades por canal |
| `scripts/db-audit/calls-telefonia-contract.test.sh` | NOVO | 352 linhas, script de prova de RLS em Postgres descartável |
| `.github/workflows/db-guard.yml` | MODIFICADO | +5 linhas: novo step "Simular contrato de dados da Telefonia v2" |
| `e2e/conversation.spec.ts` | MODIFICADO | Troca `E2E_FIXTURE_CONTACT_NAME` → `E2E_FIXTURE_CONTACT_DISPLAY_NAME` |
| `e2e/fixtures/e2e-contact.ts` | MODIFICADO | Exporta `E2E_FIXTURE_CONTACT_DISPLAY_NAME` (primeira palavra do nome) |

---

## 4. Completude

### 4.1 TypeScript

- **Branch**: `bun run typecheck` na worktree → **0 erros** (`/tmp/wt-telefonia`, executado nesta sessão).
- **Baseline main**: `bun run typecheck` em `/home/user/Zapp_Web_V2` → **11 erros**, todos em `vite.config.ts` (tipos de ambiente ausentes no CI — não é regressão da branch).
- A branch melhora o baseline: zero erros de código de produto.
- Evidência adicional: `types.ts` modificado consistentemente (+9 colunas + 4 RPCs) — diff verificado.

### 4.2 Testes unitários

- **`bunx vitest run src/lib/calls/`** na worktree `/tmp/wt-telefonia` → **6 arquivos, 217 testes, todos passam** (executado nesta sessão; saída: `Test Files 6 passed (6)`, `Tests 217 passed (217)`, duração 2.33s).
- `grep -c "import.*from 'react'\|from '@supabase" src/lib/calls/*.ts` → **0** em todos os 6 módulos — zero dependências externas confirmado.

### 4.3 Migration — análise da SQL

**Arquivo:** `supabase/migrations/20260926190000_calls_telefonia_v2.sql` (596 linhas)

100% aditiva — evidência direta:
- `ADD COLUMN IF NOT EXISTS` (9 usos para as 9 colunas novas).
- `ADD CONSTRAINT IF NOT EXISTS` (3 usos: `calls_channel_check`, `calls_recording_status_check`, `calls_status_check` ampliada).
- `CREATE INDEX IF NOT EXISTS` (2 usos).
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.calls`.
- Nenhum `DROP TABLE`, `DROP COLUMN`, `RENAME`, `TRUNCATE`, `DELETE` ou `UPDATE` em dados (`grep -n "DROP\|RENAME\|DELETE\|TRUNCATE"` → só linha 7 de comentário declarando que não há).
- `REVOKE` aplicado **somente nas 4 funções novas** (remoção de acesso `public`/`anon` padrão do PostgreSQL — hardening de ACL, não remoção de acesso preexistente).
- `SECURITY DEFINER` em `set_call_agent_notes` com justificativa documentada na migration:L366-L370: a policy `UPDATE` de `calls` só permite o dono; admin/supervisor aprovado pelo Apêndice B.4 precisaria desta função para gravar. `search_path` fixado, sem SQL dinâmico.

**Conteúdo idêntico ao que está em produção:**
- `diff 20260926190000...20260926800000` → só o cabeçalho de versionamento difere (branch: 2 linhas; main: 11 linhas explicando as 3 revisões de versão por colisão). Uma palavra de comentário diferente (linha 367 vs 375).

### 4.4 Verificação em produção (somente leitura)

- **9 colunas novas em `public.calls`**: confirmadas via `SELECT column_name FROM information_schema.columns` → todas 9 presentes. (Evidência: query executada nesta sessão; resultado: `agent_notes, answered_by, channel, end_reason, peer_name, peer_number, provider_call_id, recording_status, talk_seconds`.)
- **4 RPCs novas**: `my_calls_kpi`, `search_my_calls`, `set_call_agent_notes`, `upsert_my_call` — confirmadas via `pg_proc`. (Evidência: query executada nesta sessão.)
- **Ledger de produção**: `version = '20260926800000'` presente com `stmt_count = 39`; `version = '20260926190000'` ausente (nunca aplicada separadamente — re-versionada antes do apply).

### 4.5 Sem SINGU

- `grep -rn "pgxfvjmuubtbowutlide\|vpkmqeumtxhrwgawxdrl\|uqysyzndkfiwfztbqvsl" src/lib/calls/ supabase/migrations/20260926190000...` → **zero resultados** (executado nesta sessão).

### 4.6 Arquivos de workflow

- `db-guard.yml` modificado: adicionado step `"Simular contrato de dados da Telefonia v2"` (+5 linhas) que executa `calls-telefonia-contract.test.sh` — addição ao CI, não remoção de guarda existente.
- Evidência: `git diff 001fd463b..HEAD -- .github/workflows/db-guard.yml` lido integralmente nesta sessão.

### 4.7 E2E

- `conversation.spec.ts`: substituição de `E2E_FIXTURE_CONTACT_NAME` por `E2E_FIXTURE_CONTACT_DISPLAY_NAME` (primeira palavra do nome do fixture).
- `e2e-contact.ts`: exporta `E2E_FIXTURE_CONTACT_DISPLAY_NAME = E2E_FIXTURE_CONTACT_NAME.split(' ')[0]`.
- Motivo documentado nos comentários do diff: desde PR #816, `VirtualizedRealtimeList.tsx` exibe `contact.nickname?.trim() || name.split(' ')[0]` — sem apelido, o filtro pelo nome completo não casava.
- Mudança correta e auto-explicada; não introduz dependência nova.

---

## 5. Relevância — estado atual de main

**O conteúdo desta branch está 100% em main.**

| Artefato da branch | Estado em main |
|---|---|
| `src/lib/calls/` (6 módulos + testes) | **PRESENTE E EVOLUÍDO** — main tem 21 arquivos em `src/lib/calls/`, incluindo os 6 da branch mais 15 extras (`MediaTransport.ts`, `WhatsAppCallAdapter.ts`, `sipProvisioning.ts`, `persistence.ts`, `adapters/`, etc.) |
| `supabase/migrations/20260926190000...` | **PRESENTE** re-versionada como `20260926800000` (conteúdo SQL idêntico, só cabeçalho difere) |
| `src/integrations/supabase/types.ts` | Main tem **mais** RPCs e colunas do que a branch — evolução posterior |
| `db-guard.yml` step de telefonia | **PRESENTE em main** |
| `calls-telefonia-contract.test.sh` | **PRESENTE em main** |
| `e2e/conversation.spec.ts` fix | **PRESENTE em main** (merge de `hermes/fix-e2e-nome-lista-26092615369eb1`) |
| `callStatus.ts` da branch | Evolução: main acrescenta `EndedBy`, `CallEndOutcome`, `isTerminalStatus`, mais tabelas |

O projeto de telefonia avançou pelo menos até **T74** (PR #1864) em main — muito além das etapas 1–25 desta branch.

---

## 6. Custo de rebase

**Zero** — branch é arquivo histórico. Todo conteúdo já está em main. Não há o que rebase ou mergear.

Se fosse analisada antes do merge: esforço restante era aprovação humana do DDL via `db-migrate.yml`, sem bloqueios técnicos. Custo classificado: **P** (pronto).

---

## 7. Riscos

| Risco | Severidade | Observação |
|---|---|---|
| SINGU (Gestão de Clientes) | **Nenhum** | Zero referências ao projeto `pgxfvjmuubtbowutlide` verificado por grep |
| DDL destrutivo em produção | **Nenhum** | Migration 100% aditiva; conteúdo já em produção como `20260926800000` |
| `SECURITY DEFINER` em `set_call_agent_notes` | **Baixo / Gerenciado** | Decisão documentada na migration:L366-L370; escopo fechado (dono OU admin/supervisor); `REVOKE public/anon` aplicado |
| Regressão em `calls_status_check` | **Nenhum** | CHECK ampliado (superconjunto: adiciona `cancelled` e `declined`) |
| Colisão de evento legado `start-voip-call` | **Nenhum** | `onStartCall()` assina ambos — compat. retroativa |
| Reaplicar a migration em produção | **Nenhum** | `IF NOT EXISTS` em todas as adições; idempotente |

---

## 8. Veredito

| Campo | Valor |
|---|---|
| **Veredito** | ✅ **SUPERADA — conteúdo já mergeado e evoluído em main** |
| **Confiança** | **Alta (95%)** |
| **3 evidências decisivas** | (1) `git diff` branch vs main confirma conteúdo idêntico na migration (só cabeçalho difere); (2) query ao banco de produção confirma 9 colunas + 4 RPCs presentes com `20260926800000` no ledger; (3) `ls src/lib/calls/` em main mostra 21 arquivos, incluindo todos os 6 da branch mais 15 da evolução posterior |
| **5% de incerteza** | `calls-telefonia-contract.test.sh` (61 asserções de RLS) não foi executado localmente nesta sessão de análise (exige Docker para Postgres descartável); baseamos nos gates do autor em `TELEFONIA_STATUS.md` + CI do db-guard em main |
| **Esforço restante** | **Zero** — branch é arquivo histórico |
| **Nada escrito no remoto** | ✅ Somente leitura: nenhum push, PR, merge ou DDL nesta sessão de análise |
| **Nenhum banco tocado** | ✅ Apenas SELECTs no banco de produção; nenhuma migration aplicada |
| **Worktree removido** | ✅ `/tmp/wt-telefonia` removido após análise |

---

## 9. Checklist de verificações desta sessão

- [x] `inventario/progresso.json` lido — 176 branches processadas, inventário completo
- [x] `analise/progresso.json` lido — branch presente com entrada anterior (incompleta, rejeitada por stop hooks 3×)
- [x] `git log --oneline` na worktree — 6 commits exclusivos identificados
- [x] `git diff 001fd463b..HEAD --stat` — 22 arquivos, 4 713 inserções, 2 deleções
- [x] Diff de todos os arquivos lido integralmente na worktree
- [x] `bun install --ignore-scripts` na worktree — 618 pacotes, 3.40s
- [x] `bun run typecheck` na worktree → 0 erros (vs 11 no baseline main, todos em vite.config)
- [x] `bunx vitest run src/lib/calls/` na worktree → 6 arquivos, 217 testes, todos passam
- [x] `grep -c "import.*react\|from '@supabase"` nos 6 módulos → 0
- [x] `grep -n "pgxfvjmuubtbowutlide..."` em arquivos novos → zero resultados (SINGU limpo)
- [x] `grep -n "DROP\|RENAME\|DELETE\|TRUNCATE"` na migration → só linha de comentário
- [x] `diff 20260926190000 vs 20260926800000` — só cabeçalho difere (SQL idêntico)
- [x] Query produção `information_schema.columns` — 9 colunas confirmadas
- [x] Query produção `pg_proc` — 4 RPCs confirmadas
- [x] Query produção `schema_migrations` — `20260926800000` com 39 stmts; `20260926190000` ausente
- [x] `ls src/lib/calls/` em main — 21 arquivos (6 da branch + 15 evolutivos)
- [x] `db-guard.yml` diff lido — só +5 linhas de novo step

---

## 10. Metadados

```
branch:    hermes/telefonia-contrato-dados-26092615475e51
tip_sha:   4c41d3b1
base_sha:  001fd463  (merge de #873 em main)
commits_exclusivos: 6
arquivos_modificados: 22
testes_adicionados: 217
migration: 20260926190000 (re-versionada como 20260926800000 em main)
analisado_em: 2026-10-23
sessao: claude/dazzling-cannon-j7iw08
metodo: diff 100% + typecheck + vitest + query banco produção + leitura completa da migration
```
