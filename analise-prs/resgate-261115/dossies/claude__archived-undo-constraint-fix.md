# Dossiê — claude__archived-undo-constraint-fix (PR #2433, fechada 2026-11-01)

**Ref:** `origin/claude/archived-undo-constraint-fix` · tip `eb98aad2` · merge-base `004e74a8` (2026-10-31) · 1 commit
**Commit:** `fix(inbox): undo de archivamento respeita constraint archived→open|pending`
**Fechamento:** "coberto por #2467" (hipótese verificada abaixo — a main foi além).

## Propósito
Três mudanças em `useInboxBulkActions`:
1. `bulkTransfer`: `p_to_agent_id/p_to_queue_id/p_note` com `null` em vez de `undefined`.
2. `bulkArchive` action: adicionar `updated_at` no UPDATE direto em `contacts`.
3. `bulkArchive` undo: um UPDATE `.eq('id')` por contato, `VALID_FROM_ARCHIVED = {open,pending}`, resto → `open` (trigger só aceitava archived→open|pending).
4. Teste: ajustes para o acima + caso "waiting/resolved/closed → open".

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência na main |
|---|---|---|---|
| `src/hooks/inbox/useInboxBulkActions.ts` | null nos args da RPC transfer | **OBSOLETA** | Hook não chama `supabase.rpc` direto; usa wrapper `src/lib/inbox/transferConversation.ts:32-38` que passa `undefined` (chave omitida no JSON → default do Postgres). RPC tem `p_note text default null` (`supabase/migrations/20261113171500_transfer_conversation_cas_sem_dono.sql:46`). `null→undefined` foi decisão explícita em `470b47232` (#2303, 2026-10-28, "null→undefined") e mantida em `ab657aa34`. |
| idem | `updated_at` no UPDATE de arquivamento | **OBSOLETA** | Main não faz UPDATE direto: "P1-2: pela RPC de lote (UPDATE direto em conversation_status é recusado no banco)" — `useInboxBulkActions.ts:223-226`, `moveConversationsStatus` → `rpc('set_conversations_status')` (`src/hooks/inbox/conversationArchive.ts:84,95`; cabeçalho :4 diz que arquivar grava `updated_at`). Migration `20261113171300_conversation_status_regras_e_so_por_rpc.sql`. |
| idem | cast `(row as {...}).conversation_status` | **nenhum valor** | Main `:198` usa `row.conversation_status ?? null` sem cast e compila (CI verde em `6663bfee5`). |
| idem | undo: `VALID_FROM_ARCHIVED={open,pending}`, resto→open, `.eq` por id | **OBSOLETA (superada)** | Main `:243-307`: `validFromArchived = {open,resolved}` (trigger atual `20261113171300:104-105`: resolved→open|archived, archived→open; `pending`/`closed` legados → `open` `:259-262`); `resolved` restaurado em modo restore sem novo encerramento; `waiting` em dois passos; cada passo filtra o status esperado e devolve ids; falha por grupo não aborta os outros; `waiting` nem é arquivado (decisão do dono 2026-11-13, `:208-213`). Commits: `50fc5f0e6` (#2459), `7c9a18843` (#2813), `6663bfee5` (#3082). A abordagem da branch (`pending` como válido; `.eq` por contato; aborta no 1º erro — apontado pelo Qodo na PR) contradiz a trigger e a regra atuais. |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | `undefined→null` nas asserções | **OBSOLETA** | Main `:471-472,493-494,509-510` mantém `undefined` (coerente com o wrapper). |
| idem | filtros `.eq` escalar no restore | **OBSOLETA** | Main `:590,597,676,731,765` usa `filters: { id: [..] }` por grupo via RPC. |
| idem | caso "waiting/resolved/closed → open" | **OBSOLETA (coberto por equivalente)** | Main `:609` ('pending' legado → open), `:654` (resolved volta em modo restore), `:679` (mistura com falha num grupo), `:713` (não força quem reabriu), `:769,803` (waiting pulado no lote). O comportamento que a branch testava (resolved→open) é hoje **errado** na main (resolved→resolved). |

## Veredito
**OBSOLETA** — confiança alta. Nenhum hunk aplicável: as três intenções foram cobertas por implementação posterior e mais completa (#2459, #2813, #3082) alinhada à trigger vigente; o resto (null vs undefined, cast, updated_at em UPDATE direto) foi descartado de propósito na main.

## Lacunas a recuperar
Nenhuma.

**apagar_branch_seguro:** true.

## Verificação adversarial

Verificador independente (main em `dac285f62`, 2026-11-15). Tentei refutar o veredito OBSOLETA hunk por hunk do `git diff 004e74a8 origin/claude/archived-undo-constraint-fix`. **Nenhum hunk de valor ≥ médio sobrou.** Concordo: OBSOLETA, branch pode ser apagada.

| Hunk da branch | Resultado da refutação | Evidência verificada |
|---|---|---|
| `p_to_agent_id/p_to_queue_id/p_note`: `undefined` → `null` na RPC | **sem valor** — equivalente funcional | A main nem faz a chamada no hook: `useInboxBulkActions.ts:146-152` (origin/main) chama `transferConversation({ toAgentId, toQueueId, ... })`, que monta os args em `src/lib/inbox/transferConversation.ts:34-39`. Chave `undefined` é removida pelo `JSON.stringify` do supabase-js e a função tem `p_to_agent_id uuid default null, p_to_queue_id uuid default null, p_note text default null` (`supabase/migrations/20261113171500_transfer_conversation_cas_sem_dono.sql:44-46`) → mesmo valor final. `undefined` é decisão deliberada de tipagem (`470b47232`, "null→undefined", #2303). |
| `updated_at` no UPDATE de arquivamento | **sem valor** — necessidade já atendida, e o hunk é inaplicável | Main não faz UPDATE direto de `conversation_status` (banco recusa: `20261113171300`); vai pela RPC `set_conversations_status` (`useInboxBulkActions.ts:224`). E `updated_at` é gravado pelo banco de qualquer forma: trigger `update_contacts_updated_at BEFORE UPDATE ON public.contacts` → `update_updated_at_column()` (`20260315172343_620fdf49...:73`). O único UPDATE direto que resta (`conversationArchive.ts:151`) já manda `updated_at`. |
| undo com `VALID_FROM_ARCHIVED = {open,pending}`, resto → `open`, `.eq` por id | **superado e hoje INCORRETO** | Trigger vigente (`20261113171300:101-107`) permite de `archived` **somente** `open`; `archived→pending` seria rejeitada — a lista da branch quebraria o desfazer. Main `useInboxBulkActions.ts:243-307`: `validFromArchived = {open,resolved}`, `pending`/`closed` legados → `open`, `resolved` em modo restore (1 passo, sem novo encerramento), `waiting` em dois passos, cada passo filtra o status esperado, falha de um grupo não aborta os outros. |
| cast `(row as { id: string; conversation_status: string \| null })` | **sem valor** | Main `:198` usa `row.conversation_status ?? null` sem cast, no HEAD atual. |
| Teste: asserções `null`, `.eq` escalar, caso "waiting/resolved/closed → open" | **obsoleto / contradiz o comportamento atual** | Suite da main cobre mais e diferente: `resolved` volta em modo restore (`:654`), mistura com falha por grupo (`:679`), não força quem saiu do arquivo (`:713`), já-archived excluído (`:737`), `waiting` pulado (`:769,803`). A asserção da branch (`resolved → open`) é hoje o comportamento **errado**. |

Checagens extras: nada do diff da branch foi removido da main por reversão acidental — as mudanças da main nessa área são adições deliberadas pós-#2433 (`50fc5f0e6`/#2459, `7c9a18843`/#2813, `6663bfee5`/#3082) sobre a nova FSM de `conversation_status`. O `line_check.missing_sample` do JSON confere, mas todas as linhas "faltantes" pertencem a uma abordagem substituída.

**Parecer:** concorda = true · veredito_final = OBSOLETA · apagar_branch_seguro = true.
