# Dossiê — claude/fix-pd79-resolve-somente-sending-261112-1005 (PR #2996)

**Ref:** `origin/claude/fix-pd79-resolve-somente-sending-261112-1005` · tip `ef837c4` · merge-base `a49ef4ad5` · 12 commits (7 merges de main + 5 de conteúdo).

## Propósito
PD-79: resolução manual de mensagem não confirmada só vale para mensagem em `sending` (lease vencido, com `delivery_post_started_at`), recusando desfecho NULL; POST carimbado com lease vivo → 409 `in_progress`; 42883 em `mark_outbound_post_started` não tolerado; UI (`SendErrorBanner`, `UnconfirmedMessagesPanel`, `useUnconfirmedMessages`) e migration `20261112170000_resolve_unconfirmed_somente_sending.sql` (RPC `resolve_unconfirmed_message`).

## Arquivo × achado × evidência
| Arquivo | Achado | Evidência |
|---|---|---|
| 14 arquivos `IDENTICAL_TO_MAIN` (src/, edges, testes, migration) | Incorporados byte a byte | JSON do item (`PRESENT_BYTE`); squash `f32855df6` (#3046) em `git log origin/main` |
| `supabase/functions/message-delivery/index.ts` | Incorporado (main já evoluiu além) | `PRESENT_REVERSE_APPLIES`; `origin/main:…/index.ts:533,550-551,703` usam `delivery_claim_expires_at`/`delivery_post_started_at`; main tem +64 linhas posteriores |
| `supabase/functions/_shared/evolution-webhook-messages.ts` | Incorporado | `PRESENT_REVERSE_APPLIES`; main +43 linhas posteriores |
| `supabase/functions/message-delivery/index.test.ts` | Incorporado — os 4 testes PD-79 adicionados existem na main | `origin/main:…/index.test.ts:868,886,904,921` (nomes idênticos); `missing_in_main=0` |
| `ESTADO.md` | Lacuna = **ruído**: só renumeração de âncoras `evolution-webhook-messages.ts:1420→1422` e `1397→1399`; main já aponta para `:1457` e `:1434` (arquivo cresceu depois) | `origin/main:ESTADO.md:52,63`; ESTADO é gerado a partir do código |
| `supabase/deployment-manifest.json` | Lacuna = **ruído**: sha256/bytes gerados; main tem hashes mais novos (`message-delivery` `source_sha256 3b70bdea…`, `whatsapp-webhook` `8f24d241…`) porque os fontes mudaram depois | `git show origin/main:supabase/deployment-manifest.json` l.2218-2221, 2793-2796; `sha256sum` do `index.ts` da main = `275a01a3…` ≠ branch `0e46b3ae…` |

## Banco (produção, somente leitura)
`select version,name from supabase_migrations.schema_migrations where version='20261112170000'` → `20261112170000 resolve_unconfirmed_somente_sending`; `pg_proc` tem `resolve_unconfirmed_message`. Migration aplicada; `docs/prod-readiness.md:136,158` registram aplicação em 14/11 ~00:36Z.

## Veredito
**INCORPORADA** (confiança alta). As únicas 10 linhas "faltando" são artefatos gerados (âncoras de linha do ESTADO.md e hashes do manifest) já superados na main por versões mais novas. Nada a recuperar.

`apagar_branch_seguro = true`.

## Reexame de commits intermediários

**Parecer: REFATORACAO_INTERNA.** As 86 linhas significativas apontadas pela varredura não são trabalho desfeito; `apagar_branch_seguro` continua `true`.

Commits de conteúdo (`a49ef4ad5..ef837c4`, ordem cronológica):
`2c8d11932` → `6639174f5` → `b93ce5fa7` → `41f1a1a1b` → `b101d3ec9` (ponta).

### 1. Migration — 75 linhas (70 de `2c8d11932` + 5 de `6639174f5`) · renomeação de caminho
`41f1a1a1b` é um rename puro: `git show --stat 41f1a1a1b` = `...130000_... => 20261112170000_...sql | 0` (`1 file changed, 0 insertions(+), 0 deletions(-)`). A varredura leu o caminho antigo como "arquivo zerado".
- `git ls-tree origin/main supabase/migrations/` → blob `68fa39370` em `20261112170000_resolve_unconfirmed_somente_sending.sql`; `git diff ponta origin/main -- <esse caminho>` = vazio (idêntico).
- As duas intenções sobrevivem na main: `origin/main:supabase/migrations/20261112170000_...sql:16` (restrição a `status = 'sending'`) e `:65` (`IF p_outcome IS NULL OR p_outcome NOT IN ('sent','not_delivered')` — a guarda de NULL que `6639174f5` adicionou).
- As 4 linhas que `b93ce5fa7` tirou do mesmo arquivo eram `BEGIN;`/`COMMIT;`, removidas de propósito porque o `db_query` recusa comandos de transação (0A000); a main está sem elas.

### 2. `src/components/inbox/ChatPanel.tsx` + teste — 8 linhas · prop morta removida
`b101d3ec9` ("remove prop groupId do ChatPanel que nenhuma tela repassava") desfez a prop que `6639174f5` havia adicionado. Não é reversão de proteção:
- Nenhuma tela passava a prop nem no commit que a criou: `git grep -n groupId 6639174f5 -- src/components/inbox/RealtimeInboxView.tsx src/pages/ChatPopup.tsx src/components/omnichannel/OmnichannelChatPanel.tsx` = vazio. Valor em runtime era sempre `undefined`.
- A capacidade real (filtrar pendências de conversa de grupo) **está na main**: `origin/main:src/components/inbox/chat/UnconfirmedMessagesPanel.tsx:21,38,40` aceita `groupId` e repassa a `useUnconfirmedMessages(contactId, groupId)`; o teste desse repasse está em `origin/main:src/components/inbox/chat/__tests__/UnconfirmedMessagesPanel.test.tsx:75,77`.
- A main bate com a ponta: `git grep -n groupId origin/main -- src/components/inbox/ChatPanel.tsx` = vazio; `origin/main:src/components/inbox/ChatPanel.tsx:503` = `<UnconfirmedMessagesPanel contactId={conversation.contact.id} />`. O teste C110 na main é a versão final (`:315-318`), e o arquivo de teste é idêntico à ponta.

### 3. Três linhas de teste de `2c8d11932` · substituídas por versão mais forte
`6639174f5` trocou `useUnconfirmedMessages: () => hook.value` por um mock que grava os argumentos (`hookArgs`), `import { renderHook, waitFor }` por `import { act, renderHook, waitFor }` e `rpc: vi.fn()` por `rpc: state.rpc` (inspecionável). Tudo isso serviu para cobrir o repasse de `groupId` e o P0002 `message_not_resolvable`. Os dois arquivos de teste estão **idênticos** entre ponta e `origin/main` (`git diff ponta origin/main -- <arquivo>` vazio); main tem `UnconfirmedMessagesPanel.test.tsx:16,19,33` e `useUnconfirmedMessages.test.tsx:2,24,73-74`.

Nada a recuperar.

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei um único hunk de valor fora da `main` (`origin/main` = `dac285f62`).

### Varredura exaustiva, não amostral
Rodei linha a linha: para cada linha adicionada por `git diff a49ef4ad5 origin/claude/fix-pd79-resolve-somente-sending-261112-1005`, um `git grep -F` no mesmo arquivo em `origin/main`. Resultado: **exatamente 10 linhas ausentes**, todas nos dois artefatos gerados — nenhuma em código, teste ou migration. Bate com `gap_lines_total: 10` do JSON.

### Os 3 hunks funcionais do PD-79 estão na main
1. Filtro `status = 'sending'` na busca da linha pendente — `origin/main:supabase/functions/_shared/evolution-webhook-messages.ts:1008` e `:1017` (as duas queries, inclusive o fallback pré-DDL).
2. Exceção do lease vivo em `classifyUnclaimedCause` — `origin/main:supabase/functions/message-delivery/index.ts:533` (`delivery_claim_expires_at` no tipo), `:550-552` (`leaseExpiresAt` + `return IN_PROGRESS_FAILURE`), `:703` (coluna no `select`).
3. Endurecimento do carimbo (`try/catch` + só `PGRST202`, 42883 volta a ser infra) — `origin/main:supabase/functions/message-delivery/index.ts:781,783,785,787,790`.

### Migration: arquivo e função viva conferem
- Blob idêntico na main: `git ls-tree origin/main supabase/migrations/20261112170000_resolve_unconfirmed_somente_sending.sql` → `68fa29370efc0cfad5fdda8281c81a75f8a684e4`.
- Ledger de produção (`tnnnlkbymytvtqngbbqh`): `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('20261111160000','20261112170000')` → **as duas presentes**.
- Corpo vivo da RPC (`pg_get_functiondef`): contém `status = 'sending'` **e** `delivery_claim_expires_at <= statement_timestamp()`. O ledger ao vivo confirma a alegação do comentário de fechamento.

### Painel da UI está integrado, não órfão
`origin/main:src/components/inbox/ChatPanel.tsx:32` (import) e `:503` (`<UnconfirmedMessagesPanel contactId={conversation.contact.id} />`); o painel consome `useUnconfirmedMessages` em `UnconfirmedMessagesPanel.tsx:15,40`. Ponta a ponta.

### Testes: a main está à frente, não atrás
`git diff --stat ponta origin/main -- supabase/functions/message-delivery/index.test.ts` → `94 insertions(+)`, zero remoções. A main tem todos os casos da branch **mais** 94 linhas. O `CONFLICT` do JUNTA é ruído de rebase, não perda.

### As 10 linhas ausentes não têm valor ≥ médio
- `ESTADO.md` (2 linhas): só números de linha de referência (`evolution-webhook-messages.ts:1420→1422` e `:1397→1399`) numa tabela que a guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` **recalcula do código** e faz falhar se divergir. Os valores da branch são de um HEAD antigo; os da main são os que a guarda exige hoje (CI verde na main prova). Recuperá-los quebraria a guarda.
- `supabase/deployment-manifest.json` (8 linhas): `bytes`, `sha256`, `source_sha256` e `manifest_sha256` — hashes do conteúdo das edges naquele HEAD da branch. Já estão obsoletos face à main atual; é artefato derivado.

### Procedência do squash
`f32855df6` = `chore: pacote 2 — login sem 401, linha SIP, Gmail sem 409, Team Chat ?cid=, Talk X e PD79 (#3046)`; `git merge-base --is-ancestor f32855df6 origin/main` → verdadeiro.

**Branch segura para apagar.** Nenhuma lacuna adicional.
