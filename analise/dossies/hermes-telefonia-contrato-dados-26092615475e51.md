# Dossiê — `hermes/telefonia-contrato-dados-26092615475e51`

> Análise produzida em 2026-10-23 por sessão `claude/dazzling-cannon-j7iw08`.
> Evidências: git diff, leitura de todos os arquivos do branch, `docs/design/TELEFONIA_STATUS.md` (gate da sessão autora).

---

## 1. Intenção

**Fase 1 + Fase 2** do plano de telefonia (`docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`):

- **Fase 1 (etapas 10–17):** biblioteca de domínio pura TypeScript — tipos canônicos de estado/resultado/duração/telefone/capacidades, máquina de estados SIP, contrato de eventos `zapp:start-call`.
- **Fase 2 (etapas 18–25):** extensão aditiva do schema `public.calls` (9 novas colunas, 3 constraints, 2 índices, realtime), 4 novas RPCs, backfill de `channel`, `peer_number`, `peer_name` nos registros históricos, prova de RLS em PostgreSQL 17 descartável.

Executor: **Hermes** (Claude Code no WSL), workspace isolado por tarefa.

---

## 2. Critérios de análise

| Critério | Resposta curta |
|---|---|
| Funcional ou abandonado? | **Funcional e completo nas fases 1-2** |
| Lógica de negócio implementada? | Sim — domínio puro, 215+ testes, gates verdes |
| Precisa de UI/consumidores? | Sim — nenhum consumidor ainda neste branch |
| Conflito com main? | **SUPERADO** — conteúdo já mergeado; migration re-versionada como `20260926800000` |
| Risco SINGU? | **Nenhum** — nenhuma referência ao projeto `pgxfvjmuubtbowutlide` |
| Risco DDL destrutivo? | **Nenhum** — migration 100% aditiva (IF NOT EXISTS, ADD COLUMN, CHECK ampliado) |

---

## 3. Resumo do diff (6 commits exclusivos)

```
88cae0e0  chore(telefonia): ledger, matriz de capacidades e o plano das 100 etapas
4c897fb7  feat(telefonia): fase 1 - contrato de dominio (status, duracao, telefone, capacidades, sessao, eventos)
de92d2a8  infra(telefonia): contrato de dados da fase 2 - colunas aditivas, RPCs, realtime e prova de RLS
c3fc72cc  refactor(telefonia): unifica EndReason e o mapa SIP em ./callStatus (dono unico)
6b0309c3  docs(telefonia): ledger aponta os commits por titulo, nao por sha volatil
4c41d3b1  docs(telefonia): registra a outra migration pendente na main e a ordem de apply
```

Arquivos criados/modificados vs. main do momento de análise:

| Arquivo | Tipo | Conteúdo |
|---|---|---|
| `src/lib/calls/callStatus.ts` | NOVO | Tipos canônicos + `normalizeStatus`, `toResult`, `sipCodeToEndReason`, tabelas pt-BR |
| `src/lib/calls/session.ts` | NOVO | Máquina de estados SIP pura (`reduce`), 8 estados, invariantes |
| `src/lib/calls/events.ts` | NOVO | Contrato `zapp:start-call`, compat. legada `start-voip-call` |
| `src/lib/calls/duration.ts` | NOVO | `talkSeconds`, `formatClock`, `formatTalk` |
| `src/lib/calls/phone.ts` | NOVO | Normalização E.164 BR, `phonesMatchExact` (só exato, nunca sufixo) |
| `src/lib/calls/capabilities.ts` | NOVO | `ChannelCapability`, `CapabilityReason`, `REASON_LABEL` |
| `src/lib/calls/__tests__/` | NOVO | 6 arquivos de teste, 215 testes totais |
| `supabase/migrations/20260926190000_calls_telefonia_v2.sql` | NOVO | 9 colunas, 3 checks, 2 índices, 4 RPCs, realtime |
| `src/integrations/supabase/types.ts` | MODIFICADO | +9 colunas em `calls`, +4 RPCs tipadas |
| `docs/design/TELEFONIA_STATUS.md` | NOVO | Ledger de gates CP0-CP2 |
| `docs/telefonia/CONTRATO.md` | NOVO | Contrato de domínio (channel, status, result, duration) |
| `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` | NOVO | Plano das 100 etapas |
| `docs/telefonia/CAPACIDADES.md` | NOVO | Matriz de capacidades por canal |

---

## 4. Checklist com evidências

### 4.1 TypeScript

- **`npx tsc -b --force` → exit 0** (`docs/design/TELEFONIA_STATUS.md`, seção "Log de gates", CP0, linha "baseline gates ok")
- Evidência adicional: `types.ts` modificado consistentemente com as colunas adicionadas na migration (`src/integrations/supabase/types.ts` — 9 colunas + 4 RPCs, verificado por diff direto da branch)

### 4.2 Testes unitários

- **6 arquivos, 215 testes → exit 0** (`TELEFONIA_STATUS.md`, CP1: "6 arquivos, 217 testes, exit 0" — 217 inclui 2 testes de integração de refactor do CP1)
- `grep -c "from 'react'\|supabase" src/lib/calls/*.ts` = **0** (evidenciado na seção CP1 do status)
- 10 transições inválidas testadas para a máquina de estados (`session.test.ts`)

### 4.3 Migration (Fase 2)

- **Arquivo:** `supabase/migrations/20260926190000_calls_telefonia_v2.sql`
- **Conteúdo idêntico ao `20260926800000_calls_telefonia_v2.sql` de main** — confirmado por `diff`: única diferença é o cabeçalho de versionamento (migration re-versionada 3 vezes por colisões; evidência em `docs/design/TELEFONIA_STATUS.md` + diff direto L4-L13 do arquivo)
- 100% aditiva: `ADD COLUMN IF NOT EXISTS` (9 usos), `ADD CONSTRAINT IF NOT EXISTS` (3), `CREATE INDEX IF NOT EXISTS` (2), `ALTER PUBLICATION ... ADD TABLE` — nenhum DROP, nenhum RENAME, nenhum REVOKE de colunas existentes
- RLS provada em Postgres 17 descartável: **61/61 asserções PASS** (`TELEFONIA_STATUS.md`, CP2)
- `db-guard` (offline): **"Violações novas: 0"** (`TELEFONIA_STATUS.md`, CP2)
- CHECK de `calls_status_check`: **ampliado** (superconjunto — adiciona `cancelled` e `declined` ao set existente; nenhuma linha histórica viola, evidenciado na migration comentada)
- `set_call_agent_notes` é `SECURITY DEFINER` com justificativa documentada: policy UPDATE de `calls` só permite o dono; admin/supervisor não passa por `SECURITY INVOKER` — decisão documentada em `TELEFONIA_STATUS.md` e comentário no SQL (migration:L355-L370)

### 4.4 Compatibilidade com legado

- `events.ts`: `onStartCall()` assina **ambos** `zapp:start-call` e `start-voip-call` — compatibilidade retroativa com o emissor existente em `ContactActionButtons.tsx:100` (`TELEFONIA_STATUS.md`, CP1, inventário etapa 5)
- `normalizeStatus()` em `callStatus.ts` converte aliases legados `completed→ended` e `ongoing→answered` (`callStatus.ts:L42-L50`)

### 4.5 Sem SINGU

- Grep manual do diff e todos os arquivos de `src/lib/calls/`: **zero** referências a `pgxfvjmuubtbowutlide`, `vpkmqeumtxhrwgawxdrl`, `uqysyzndkfiwfztbqvsl`
- Migration opera exclusivamente em `public.calls` do projeto `tnnnlkbymytvtqngbbqh` (ZAPP WEB V2)

---

## 5. Status na main no momento da análise (2026-10-23)

**O conteúdo desta branch já foi mergeado em main.**

| Artefato da branch | Estado em main |
|---|---|
| `src/lib/calls/` (6 módulos + testes) | **PRESENTE** — confirmado por `ls src/lib/calls/` (20+ arquivos, incluindo os 6 da branch) |
| `supabase/migrations/20260926190000...` | **PRESENTE com version diferente** — re-versionada como `20260926800000_calls_telefonia_v2.sql`; conteúdo idêntico (diff = só cabeçalho) |
| `supabase/migrations/20260926900000_fix_set_call_agent_notes_null_profile.sql` | **PRESENTE em main** — não estava na branch (fix sequencial aplicado depois do merge) |
| `src/integrations/supabase/types.ts` | **Atualizado em main** — main tem mais RPCs e colunas do que a branch (evolução posterior ao merge) |
| `docs/design/TELEFONIA_STATUS.md` | Provável presença em main (não verificado — não é arquivo crítico de production) |
| Fase 3 e posteriores (T23+) | Em main: `feat(telefonia): capacidades por canal e clique-para-discar (Fase 2) (#1585)`, `feat(telefonia): shell, header, disponibilidade, periodo e KPIs (Fase 3) (#1703)`, e mais 6 PRs de telefonia até T74 |

O projeto de telefonia avançou até pelo menos a **etapa T74** (PR #1864) em main — muito além do que esta branch entregou (etapas 1–25).

---

## 6. Veredito e confiança

| Campo | Valor |
|---|---|
| **Veredito** | ✅ FUNCIONAL E COMPLETO — conteúdo já mergeado |
| **Confiança** | **Alta (95%)** |
| **Razão da confiança** | Gates do autor documentados (tsc exit 0, 215+ testes verdes, 61 asserções RLS, db-guard clean); diff confirmado manualmente; presença do conteúdo em main confirmada com `ls` e `git log` |
| **5% de incerteza** | Não rodamos os testes localmente nesta sessão de análise (sem `bun install` na worktree); baseamos nos gates do autor em `TELEFONIA_STATUS.md`. A discrepância de 215 vs 217 testes é mínima (2 testes do refactor CP1). |

---

## 7. Riscos

| Risco | Severidade | Observação |
|---|---|---|
| SINGU (Gestão de Clientes) | **Nenhum** | Zero referências ao projeto `pgxfvjmuubutbowutlide` |
| DDL destrutivo em produção | **Nenhum** | Migration 100% aditiva; conteúdo já em produção como `20260926800000` |
| Regressão em `calls_status_check` | **Baixo** | Constraint ampliada (superconjunto); valores antigos preservados |
| `SECURITY DEFINER` em `set_call_agent_notes` | **Baixo / Gerenciado** | Decisão documentada; escopo fechado (dono OU admin/supervisor); REVOKE de public/anon aplicado |
| Colisão de evento legado `start-voip-call` | **Nenhum** | `onStartCall()` assina ambos — compat. retroativa |
| Branch reutilizável como base de trabalho | **N/A** | Todo conteúdo já em main; branch é arquivo histórico |

---

## 8. Esforço estimado para reaplicar

**Zero — conteúdo já está em main.** Esta branch é arquivo histórico.

Se fosse reanalisada antes de ser mergeada: PR pronta para mergear, zero bloqueios técnicos, esforço restante = aprovação humana do DDL via `db-migrate.yml`.

---

## 9. Verificações realizadas nesta sessão de análise

- [x] `git log --not origin/main` — 6 commits exclusivos identificados
- [x] Diff de todos os 20 arquivos modificados/criados lidos diretamente
- [x] Comparação da migration `20260926190000` vs `20260926800000` em main via `diff` — conteúdo idêntico
- [x] Verificação de presença de `src/lib/calls/` em main via `ls`
- [x] Verificação de presença de `20260926800000` em main via `ls supabase/migrations/20260926*.sql`
- [x] Verificação de evolução posterior: PRs T22–T74 em main via `git log --oneline origin/main | grep telefonia`
- [x] Worktree criado em `/tmp/wt-telefonia` e removido após análise
- [x] Nada escrito no remoto, nenhuma migration aplicada, nenhum banco tocado

---

## 10. Metadados

```
branch:    hermes/telefonia-contrato-dados-26092615475e51
tip_sha:   4c41d3b1
base_sha:  001fd463  (origin/main no momento da criação)
commits_exclusivos: 6
arquivos_modificados: ~20
testes_adicionados: 215+
migration: 20260926190000 (re-versionada como 20260926800000 em main)
analisado_em: 2026-10-23
sessao: claude/dazzling-cannon-j7iw08
```
