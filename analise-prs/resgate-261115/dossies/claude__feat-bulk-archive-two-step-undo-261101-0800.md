# Dossiê — claude__feat-bulk-archive-two-step-undo-261101-0800 (PR #2467)

**Branch:** `origin/claude/feat-bulk-archive-two-step-undo-261101-0800` · tip `873ba948` · merge-base `1252bb5a` (2026-11-01)
**Commits úteis:** `908760d0e feat: undo do bulkArchive restaura waiting/resolved/closed em dois passos` · `873ba9480 fix: rollback two-step undo quando passo 2 falha` (+3 merges de main).

## Propósito
No desfazer do arquivamento em lote (`useInboxBulkActions.bulkArchive → undoAction`), restaurar conversas cujo status original era `waiting/resolved/closed` em dois passos (`archived→open→original`), porque a FSM `enforce_conversation_status_transition` só aceita `archived→open|pending` direto. Antes, caíam todas em `open`. Segundo commit: se o passo 2 falha, voltar os contatos para `archived` (rollback).

## Veredito: OBSOLETA (abordagem superada na main — mesma necessidade coberta por PR #2813)

A main já resolve o mesmo problema desde `7c9a18843 fix(inbox): toast neutro em RLS e undo dois passos no bulk archive (#2813)` (2026-11-13), com abordagem diferente e **incompatível com a da branch**:

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/inbox/useInboxBulkActions.ts` | **Superado.** Main faz `directGroups`/`twoStepGroups` (`origin/main:…:255-256`), passo 1 `archived→open` e passo 2 `open→original` (`:288-296`). Diferenças deliberadas: (a) usa a RPC `moveConversationsStatus` em vez de `supabase.from('contacts').update(...)` — comentário `:223` "P1-2: pela RPC de lote (UPDATE direto em conversation_status é recusado no banco)" → o código da branch (UPDATE direto) **falharia em produção**; (b) `resolved` volta em UMA chamada em modo `restore` (`:244-247`, `:273-275`) porque o 2º passo pela RPC comum gravaria outro encerramento e daria 23505; (c) `pending/closed` são legados → voltam a `open` (`:260-262`); (d) rollback da branch (volta para `archived` se passo 2 falha) foi substituído por "restauro parcial contado": cada passo filtra pelo status esperado, grupo que falha não bloqueia os outros, `toast.warning('X de Y restaurados')` + `throw` (`:270-305`). | `git log -S'twoStepGroups' origin/main -- src/hooks/inbox/useInboxBulkActions.ts` → `7c9a18843`; `git show origin/main:src/hooks/inbox/useInboxBulkActions.ts` linhas 223, 244-305 |
| idem — `waiting` | Regra de negócio nova na main: "Decisão do dono (2026-11-13): conversa 'waiting' não é arquivada — o lote pula" (`origin/main:…:207-212`). O caso central da branch (restaurar `waiting` em 2 passos) perdeu o alvo; main mantém o caminho 2 passos só para `waiting` legado. | `origin/main:src/hooks/inbox/useInboxBulkActions.ts:207-212` |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | Os 4 testes da branch (waiting/resolved 2 passos; closed 2 passos; misto; rollback para archived) não cabem no comportamento atual (UPDATE direto, `closed→closed`, rollback). Main tem cobertura própria do mesmo tema: `:654` resolved em 1 chamada restore; `:679` falha num grupo → segue os outros, "1 de 3 restaurados"; `:713` filtra por status esperado; `:737` já-archived excluído; `:769` waiting pulada. | `git grep -n "it(" origin/main -- src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` |
| `ESTADO.md` | Só atualizava o número de linha de `batch-fetch-avatars` em `useInboxBulkActions.ts:252→295`; main já está em `:323` (gerado). Ruído. | `origin/main:ESTADO.md:58` |

## Lacunas a recuperar
Nenhuma. Portar o código da branch regrediria a main (UPDATE direto recusado no banco; `closed` não é mais estado de entrada; rollback contradiz o restauro parcial contado). Trabalho da branch ficou OBSOLETO, não perdido.

## apagar_branch_seguro: true

## Verificação adversarial

**Parecer: CONCORDO com OBSOLETA.** `apagar_branch_seguro = true`. Tentei refutar hunk por hunk; nenhum sobrevive ao estado atual do banco.

Prova nova (não estava na triagem) — li o banco oficial `tnnnlkbymytvtqngbbqh` ao vivo, só leitura:

1. **O código da branch é recusado pelo banco, não "apenas diferente".** Existe o gatilho
   `trg_contacts_conversation_status_rpc_only BEFORE UPDATE OF conversation_status ON public.contacts … EXECUTE FUNCTION guard_conversation_status_direct_update()`
   (consulta: `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgrelid='public.contacts'::regclass`). A branch inteira é
   `supabase.from('contacts').update({ conversation_status: … })` (diff `1252bb5a..873ba948`, `src/hooks/inbox/useInboxBulkActions.ts`, todos os 4 UPDATEs) → o desfazer falharia em produção em 100% dos casos. A main passa pela RPC `moveConversationsStatus` (`origin/main:src/hooks/inbox/useInboxBulkActions.ts:223,271-276`). Portar qualquer hunk seria regressão garantida.
2. **A FSM viva invalida os dois alvos exclusivos da branch.** `pg_get_functiondef('enforce_conversation_status_transition')` não tem NENHUMA transição que ENTRE em `pending` ou `closed`, e `archived` só sai para `open` (não `pending`). Logo:
   - `directFromArchived = new Set(['open','pending'])` da branch → `archived→pending` é inválido;
   - `twoStepFromOpen` incluindo `'closed'` → `open→closed` é inválido.
   O mapeamento da main (`pending`/`closed` legados voltam a `open`, `origin/main:…:260-262`) é o único correto. Nada a resgatar aqui.
3. **O rollback do 2º commit (`873ba948`) também é inválido hoje.** Ele devolve `twoStepIds` para `archived`; a FSM proíbe `waiting→archived` explicitamente (`RAISE 'conversation_waiting_cannot_be_archived'`, decisão do dono 2026-11-13). Numa falha do passo 2 com conversa já em `waiting`, o rollback estouraria. O "restauro parcial contado" da main (`:283-305`, filtra pelo status esperado e conta por conversa) é estritamente mais seguro — cobre também a conversa reaberta por mensagem nova na janela do desfazer, caso que a branch não trata.
4. **Testes:** os 4 testes da branch asseveram exatamente o comportamento inválido acima (sequência de `.update()` diretos, `closed→closed`, rollback para `archived`). Main tem cobertura própria equivalente e mais ampla: `origin/main:src/hooks/inbox/__tests__/useInboxBulkActions.test.ts:654` (resolved em 1 chamada restore), `:679` (falha num grupo → "X de Y"), `:713` (filtra status esperado), `:737` (já archived excluído), `:769` (waiting pulada). Nenhuma asserção da branch adiciona cenário não coberto.
5. **ESTADO.md:** confirmado ruído gerado. Branch muda `useInboxBulkActions.ts:252→295`; main já está em `:323` (`origin/main:ESTADO.md:58`). Arquivo é regenerado por automação.

Nenhum hunk de valor ≥ médio fora da main. Veredito final: **OBSOLETA**.
