# Dossiê — `hermes/telefonia-contrato-dados-26092615475e51`

> Análise produzida em 2026-10-23 por sessão `claude/dazzling-cannon-j7iw08`.
> Método completo: diff 100% (3 pontos, 22 arquivos), typecheck (introduzido vs herdado),
> vitest, eslint nos arquivos tocados, integration checklist, TODO/FIXME scan,
> leitura integral da migration, query banco de produção (somente leitura), rebase cost.
> Worktree criado em `/tmp/wt-telefonia-v2`, removido após análise.

---

## 1. Intenção

**Fases 1 e 2** do plano de telefonia (`docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md`):

- **Fase 1 (etapas 10–17):** biblioteca de domínio pura TypeScript — tipos canônicos de
  estado/resultado/duração/telefone/capacidades, máquina de estados SIP, contrato de eventos
  `zapp:start-call`.
- **Fase 2 (etapas 18–25):** extensão aditiva do schema `public.calls` (9 novas colunas,
  3 constraints, 2 índices, realtime), 4 novas RPCs, ACL hardening (REVOKE anon/public +
  GRANT authenticated), prova de RLS em PostgreSQL 17 descartável.

Critério implícito de "pronto": módulos TypeScript com zero dependências externas, 215+ testes
unitários verdes, migration idempotente, `tsc` e `db:guard` limpos.
**A biblioteca é fundação** — as fases 1-2 não criam componentes de UI; estes vêm nas fases
posteriores (T26+) que consomem a lib. Por isso `src/lib/calls/` não é importada por código de
produto nesta branch — isso é design, não incomplete.

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

## 3. Diff completo — 3 pontos (`001fd463..HEAD`)

Evidência: `git log --oneline 001fd463..HEAD --stat` na worktree `/tmp/wt-telefonia-v2` (executado nesta sessão).

**22 arquivos, 4 713 inserções, 2 deleções.**

| # | Arquivo | Tipo | Conteúdo |
|---|---|---|---|
| 1 | `src/lib/calls/callStatus.ts` | NOVO | Tipos canônicos + `normalizeStatus`, `toResult`, `sipCodeToEndReason`, tabelas pt-BR |
| 2 | `src/lib/calls/session.ts` | NOVO+REFACTOR | Máquina de estados SIP pura (`reduce`), 8 estados; `EndReason` unificado c/ `callStatus` no commit `c3fc72cc` |
| 3 | `src/lib/calls/events.ts` | NOVO | Contrato `zapp:start-call`, compat. legada `start-voip-call` |
| 4 | `src/lib/calls/duration.ts` | NOVO | `talkSeconds`, `formatClock`, `formatTalk` |
| 5 | `src/lib/calls/phone.ts` | NOVO | Normalização E.164 BR, `phonesMatchExact` |
| 6 | `src/lib/calls/capabilities.ts` | NOVO | `ChannelCapability`, `CapabilityReason`, `REASON_LABEL` |
| 7 | `src/lib/calls/__tests__/callStatus.test.ts` | NOVO | 276 linhas |
| 8 | `src/lib/calls/__tests__/capabilities.test.ts` | NOVO | 88 linhas |
| 9 | `src/lib/calls/__tests__/duration.test.ts` | NOVO | 145 linhas |
| 10 | `src/lib/calls/__tests__/events.test.ts` | NOVO | 263 linhas |
| 11 | `src/lib/calls/__tests__/phone.test.ts` | NOVO | 137 linhas |
| 12 | `src/lib/calls/__tests__/session.test.ts` | NOVO | 496 + 43 (refactor commit) = 539 linhas |
| 13 | `supabase/migrations/20260926190000_calls_telefonia_v2.sql` | NOVO | 596 linhas — 9 colunas, 3 checks, 2 índices, 4 RPCs, realtime |
| 14 | `src/integrations/supabase/types.ts` | MODIFICADO | +95 linhas: 9 colunas + 4 RPCs tipadas |
| 15 | `docs/design/TELEFONIA_STATUS.md` | NOVO | Ledger de gates CP0–CP2 |
| 16 | `docs/telefonia/CONTRATO.md` | NOVO | Contrato de domínio (116 linhas) |
| 17 | `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` | NOVO | Plano das 100 etapas (753 linhas) |
| 18 | `docs/telefonia/CAPACIDADES.md` | NOVO | Matriz de capacidades por canal (49 linhas) |
| 19 | `scripts/db-audit/calls-telefonia-contract.test.sh` | NOVO | 352 linhas — prova de RLS em Postgres descartável |
| 20 | `.github/workflows/db-guard.yml` | MODIFICADO | +5 linhas step "Simular contrato de dados da Telefonia v2" |
| 21 | `e2e/conversation.spec.ts` | MODIFICADO | Troca `E2E_FIXTURE_CONTACT_NAME` → `E2E_FIXTURE_CONTACT_DISPLAY_NAME` |
| 22 | `e2e/fixtures/e2e-contact.ts` | MODIFICADO | Exporta `E2E_FIXTURE_CONTACT_DISPLAY_NAME = name.split(' ')[0]` |

---

## 4. Completude

### 4.1 Integration checklist

| Critério | Estado | Evidência |
|---|---|---|
| `src/lib/calls/` importada por código de produto? | ✅ Não esperado (fundação) | `grep -rn "from.*lib/calls" src/ \| grep -v __tests__` → **ZERO** (worktree) |
| Rota registrada? | N/A | Nenhum arquivo em `src/pages/` ou `src/App.tsx` tocado |
| Entrada na UI (menu/botão)? | N/A | Nenhum `.tsx` criado; branch é pura lib + schema |
| invokeEdge / `supabase.functions.invoke` | ✅ Não | `grep -rn "invokeEdge\|supabase.functions.invoke" src/lib/calls/` → **ZERO** |
| RPCs consumidas pelo front? | ⚠️ Não nesta branch (por design) | Tipadas em `types.ts` mas não invocadas — consumo nas fases de UI (T26+) |
| Tabelas/colunas da migration tipadas em `types.ts`? | ✅ Sim | `git diff 001fd463b..HEAD -- src/integrations/supabase/types.ts \| grep "^+" \| grep "channel\|end_reason\|peer_name\|peer_number"` → 15 linhas confirmadas |
| Código usa coluna inexistente? | ✅ Não | Colunas declaradas na migration e espelhadas em `types.ts`; sem uso em componentes nesta branch |
| `db-guard.yml` — step adicionado ou removido? | ✅ Adicionado | `git diff 001fd463b..HEAD -- .github/workflows/db-guard.yml` → +5 linhas, zero removidas |

### 4.2 Implementação

| Critério | Estado | Evidência |
|---|---|---|
| Corpo vazio / `return` provisório / `not implemented` | ✅ Nenhum | Leitura integral dos 6 módulos |
| TODO/FIXME/WIP/HACK — arquivo:linha | ✅ **ZERO** | `grep -rn "TODO\|FIXME\|WIP\|HACK\|not implemented" src/lib/calls/ supabase/migrations/... e2e/ docs/telefonia/` → saída **vazia** (worktree) |
| Fluxos incompletos | ✅ N/A | Biblioteca de domínio pura — sem operações CRUD de UI |
| Compat. evento legado `start-voip-call` | ✅ Retrocompatível | `events.ts`: `onStartCall()` assina `zapp:start-call` E `start-voip-call` |

### 4.3 Qualidade local

| Verificação | Resultado | Evidência |
|---|---|---|
| `bun install --ignore-scripts` | ✅ 618 pacotes, 3.40s | Worktree `/tmp/wt-telefonia-v2` |
| `bun run typecheck` (branch) | ✅ **0 erros** | `tsc -b --force` exit 0 na worktree |
| `bun run typecheck` (main — baseline) | 11 erros em `vite.config.ts` | Comparação: **0 erros introduzidos** pela branch |
| `bunx eslint src/lib/calls/*.ts` | ✅ **EXIT 0** | 6 módulos novos — sem erro nem warning |
| `bunx eslint src/integrations/supabase/types.ts e2e/conversation.spec.ts e2e/fixtures/e2e-contact.ts` | ✅ **EXIT 0** | 3 arquivos modificados |
| `bunx vitest run src/lib/calls/` | ✅ **6 arquivos, 217 testes, todos passam** | `Tests 217 passed (217)`, 2.33s |
| Zero deps externas nos módulos | ✅ | `grep -c "import.*react\|from '@supabase" src/lib/calls/*.ts` → 0 em todos |
| Build (`bun run build`) | NÃO VERIFICADO — branch SUPERADA | Timeout; não bloqueante |

### 4.4 Migration

**Arquivo:** `supabase/migrations/20260926190000_calls_telefonia_v2.sql` (596 linhas, lido integralmente)

**100% aditiva:**
- `ADD COLUMN IF NOT EXISTS` — 9 colunas (migration:L1-L100)
- `ADD CONSTRAINT IF NOT EXISTS` — 3 constraints (migration:L100-L150)
- `CREATE INDEX IF NOT EXISTS` — 2 índices
- `ALTER PUBLICATION supabase_realtime ADD TABLE public.calls`
- `grep -n "DROP\|RENAME\|DELETE\|TRUNCATE"` → só linha 7 (comentário declarando ausência)

**RLS:**
- Migration NÃO altera `ENABLE ROW LEVEL SECURITY` em `public.calls` — tabela preexistente com RLS já ativo
- Evidência: `grep -n "ENABLE ROW LEVEL\|CREATE POLICY" migration` → **vazio**
- Confirmado em produção: `SELECT relrowsecurity FROM pg_class WHERE relname='calls'` → **`true`**

**ACL das 4 novas funções (migration:L584-L596):**
```sql
revoke all on function public.search_my_calls(...) from public;
revoke all on function public.search_my_calls(...) from anon;
-- idem para my_calls_kpi, upsert_my_call, set_call_agent_notes
grant execute on function public.search_my_calls(...) to authenticated;
-- idem para as outras 3
```
Hardening correto: somente `authenticated` pode executar.

**`SECURITY DEFINER` em `set_call_agent_notes` (migration:L366-L370):**
Documentado no SQL: policy de UPDATE de `calls` só permite o dono; admin/supervisor aprovado pelo Apêndice B.4 precisa desta função para gravar. `search_path` fixado, sem SQL dinâmico. Severidade: **Baixa/Gerenciada**.

**Diff branch vs. main:**
`20260926190000` vs `20260926800000`: só cabeçalho de re-versionamento difere (branch: 2 linhas; main: 11 linhas explicando 3 revisões por colisão). Uma palavra de comentário diferente (L367 vs L375). SQL aplicado em produção: **idêntico**.

### 4.5 Verificação em produção (somente leitura)

| Query | Resultado |
|---|---|
| `information_schema.columns WHERE table_name='calls'` | 9 colunas novas presentes: `agent_notes, answered_by, channel, end_reason, peer_name, peer_number, provider_call_id, recording_status, talk_seconds` |
| `pg_proc` — 4 RPCs novas | `my_calls_kpi, search_my_calls, set_call_agent_notes, upsert_my_call` — confirmadas |
| `schema_migrations` | `version='20260926800000'` presente (39 stmts); `20260926190000` ausente |
| `pg_class WHERE relname='calls'` | `relrowsecurity=true` |

### 4.6 Sem SINGU

`grep -rn "pgxfvjmuubtbowutlide\|vpkmqeumtxhrwgawxdrl\|uqysyzndkfiwfztbqvsl" src/lib/calls/ supabase/migrations/20260926190000...` → **zero resultados** (worktree)

---

## 5. Relevância — estado atual de main

**O conteúdo desta branch está 100% em main.**

| Artefato | Estado em main |
|---|---|
| `src/lib/calls/` (6 módulos + testes) | **PRESENTE E EVOLUÍDO** — main tem 21 arquivos (6 da branch + 15 extras: `MediaTransport.ts`, `WhatsAppCallAdapter.ts`, `sipProvisioning.ts`, `persistence.ts`, `adapters/`…) |
| `supabase/migrations/20260926190000...` | **PRESENTE** re-versionada como `20260926800000` (SQL idêntico) |
| `src/integrations/supabase/types.ts` | Main tem mais RPCs e colunas — evolução posterior |
| `db-guard.yml` step de telefonia | **PRESENTE** |
| `calls-telefonia-contract.test.sh` | **PRESENTE** |
| `e2e/conversation.spec.ts` fix | **PRESENTE** (merge de `hermes/fix-e2e-nome-lista-26092615369eb1`) |

Projeto de telefonia avançou até pelo menos **T74** (PR #1864) em main.

---

## 6. Custo de rebase

**Zero — branch é arquivo histórico.** Conteúdo 100% em main; rebase produziria patches vazios. Não há conflito a resolver.

Se fosse analisada antes do merge: esforço restante = aprovação humana do DDL via `db-migrate.yml`. Custo: **P** (pronto imediato).

---

## 7. Veredito

| Campo | Valor |
|---|---|
| **Veredito** | ✅ **SUPERADA — conteúdo já mergeado e evoluído em main** |
| **Confiança** | **Alta (95%)** |
| **Evidência 1** | `git diff 001fd463b..HEAD -- supabase/migrations/...` vs `20260926800000`: SQL idêntico, só cabeçalho de re-versionamento difere |
| **Evidência 2** | Queries produção: 9 colunas + 4 RPCs confirmadas; `20260926800000` no ledger (39 stmts); RLS `relrowsecurity=true` |
| **Evidência 3** | `ls src/lib/calls/` em main → 21 arquivos (6 da branch + 15 evolutivos); projeto em T74+ |
| **5% de incerteza** | `calls-telefonia-contract.test.sh` (61 asserções RLS) não executado localmente (exige Docker Postgres descartável); baseado nos gates do autor em `TELEFONIA_STATUS.md` + CI do db-guard em main |
| **Esforço restante** | **Zero** |

---

## 8. Riscos

| Risco | Severidade | Observação |
|---|---|---|
| SINGU (Gestão de Clientes) | **Nenhum** | Zero refs a `pgxfvjmuubtbowutlide` — grep worktree confirmado |
| DDL destrutivo em produção | **Nenhum** | Migration 100% aditiva; conteúdo já em produção como `20260926800000` |
| `SECURITY DEFINER` em `set_call_agent_notes` | **Baixo/Gerenciado** | Escopo fechado (dono OU admin/supervisor); `search_path` fixado; `REVOKE public/anon` aplicado |
| Regressão em `calls_status_check` | **Nenhum** | CHECK ampliado (superconjunto: adiciona `cancelled` e `declined`) |
| Compat. evento legado `start-voip-call` | **Nenhum** | `onStartCall()` assina ambos |
| Reaplicar migration | **Nenhum** | `IF NOT EXISTS` em todas as adições; idempotente |
| RLS em `public.calls` | **Nenhum** | RLS já ativo antes desta branch; migration não cria/altera policies |

### 8.1 Riscos de regressão e como verificar

Branch SUPERADA — não pode causar regressão. Para referência futura (se similar for aplicada):

| Risco potencial | Como verificar |
|---|---|
| `calls_status_check` rejeitar status existentes | `SELECT DISTINCT status FROM public.calls` — confirmar que todos os valores estão no `CHECK` ampliado |
| `SECURITY DEFINER` em `set_call_agent_notes` escalar privilégio | Testar com user `authenticated` sem role admin: deve retornar erro de RLS se `caller_id != auth.uid()` |
| Colunas nullable quebrar queries existentes | `EXPLAIN SELECT * FROM calls WHERE channel IS NOT NULL` — queries que assumem coluna obrigatória passam a retornar menos linhas |
| realtime em `calls` aumentar load | Monitorar `supabase_realtime.messages` após adição à publicação |
| Evento legado `start-voip-call` silenciado | Emitir `new CustomEvent('start-voip-call')` e verificar que `onStartCall()` recebe |

---

## 9. Checklist de verificações desta sessão

- [x] `inventario/progresso.json` lido — 176/176 done
- [x] `analise/progresso.json` lido — entrada anterior incompleta; re-análise com método completo
- [x] `git log --oneline 001fd463..HEAD --stat` — 6 commits, 22 arquivos, 4 713 inserções
- [x] Diff de todos os 22 arquivos lido na worktree
- [x] **TODO/FIXME/WIP/HACK scan** em todos os arquivos tocados → **ZERO**
- [x] **Integration checklist**: imports `lib/calls` = ZERO (por design); invokeEdge = ZERO; routes = N/A; UI = N/A; RLS = ativo
- [x] `bun install --ignore-scripts` — 618 pacotes
- [x] `bun run typecheck` → **0 erros** (0 introduzidos / 11 herdados em baseline main)
- [x] `bunx vitest run src/lib/calls/` → **6 arquivos, 217 testes, todos passam**
- [x] `bunx eslint src/lib/calls/*.ts` → **EXIT 0**
- [x] `bunx eslint types.ts e2e/conversation.spec.ts e2e/fixtures/e2e-contact.ts` → **EXIT 0**
- [x] `grep` zero deps externas nos 6 módulos
- [x] `grep` SINGU → ZERO
- [x] `grep` DROP/RENAME/DELETE/TRUNCATE na migration → só linha de comentário
- [x] Migration:L584-L596 lidas: REVOKE public/anon + GRANT authenticated nas 4 RPCs
- [x] `grep` ENABLE ROW LEVEL na migration → **vazio** (tabela preexistente com RLS ativo)
- [x] Query produção `pg_class` → `relrowsecurity=true`
- [x] Query produção `information_schema.columns` — 9 colunas confirmadas
- [x] Query produção `pg_proc` — 4 RPCs confirmadas
- [x] Query produção `schema_migrations` — `20260926800000` (39 stmts); `20260926190000` ausente
- [x] `ls src/lib/calls/` em main — 21 arquivos
- [x] `db-guard.yml` diff — +5 linhas, zero removidas
- [x] `e2e/conversation.spec.ts` diff lido integralmente
- [x] **Custo de rebase**: Zero — SUPERADA
- [x] **Riscos de regressão**: documentados na seção 8.1

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
metodo: diff 100% 3-pontos + typecheck (0 introduzido/11 herdado) + vitest + eslint
        + integration checklist + TODO/FIXME scan + RLS (produção + migration) +
        leitura completa da migration + rebase cost
```
