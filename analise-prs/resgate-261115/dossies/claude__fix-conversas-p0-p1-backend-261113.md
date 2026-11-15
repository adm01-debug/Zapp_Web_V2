# claude/fix-conversas-p0-p1-backend-261113 (PR #3037) — INCORPORADA

- `ref`: `origin/claude/fix-conversas-p0-p1-backend-261113` · tip `7002ba64c` · merge_base `48f9754f7`
- 9 commits, 61 arquivos, +3931/-247. Pré-classificação mecânica: MISTO_CONFLITO (20 arquivos com lacuna, 986 linhas).
- **Veredito: INCORPORADA. `apagar_branch_seguro = true`.**

## Propósito
Auditoria "Conversas P0/P1" de 2026-11-13: (1) envio não cai em conexão de teste/fallback silencioso;
(2) `transfer_conversation` única com compare-and-set (inclui CAS "sem dono"); (3) FSM de
`conversation_status` só por RPC, com `waiting → archived` recusado (decisão do dono); (4) autor do
encerramento em `conversation_closures`; (5) varredura de mensagens presas em `sending` (pg_cron);
(6) agendada em conexão caída vira `conexao_invalida`.

## Por que a pré-classificação deu MISTO_CONFLITO (falso positivo)
As 4 migrations "ausentes" **existem na main renumeradas** (`1302xx/1304xx/1305xx/1306xx` →
`1713xx/1714xx/1715xx/1716xx`), porque nunca foram aplicadas e tiveram de subir acima do max do
ledger/pacote `170000..171200`. O comparador mecânico casa por caminho, não por conteúdo — daí
CONFLICT/ABSENT em cascata: quase toda "linha faltando" nos arquivos TS/SQL/doc é a **string do nome
da migration** (`20261113130200` vs `20261113171300`).

## Arquivo × achado × evidência

| Arquivo (branch) | Achado | Evidência na main |
|---|---|---|
| `supabase/migrations/20261113130200_conversation_status_regras_e_so_por_rpc.sql` | Na main como `20261113171300_*`, e **evoluída** (superset): `set_conversations_status` ganha 6º arg `p_restore`, revalida permissão depois da trava, nota sobre origem legada | `git show origin/main:supabase/migrations/20261113171300_conversation_status_regras_e_so_por_rpc.sql`; diff contra a branch = 67 linhas, todas adições da main (linhas 61-66, 187-190, 246, 251-252, 304-313, 320-330) |
| `.../20261113130400_varredura_mensagens_presas_em_enviando.sql` | Na main como `20261113171400_*`, **idêntica** fora do cabeçalho | diff = 2 linhas (só o comentário "Era 20261113130400 na PR #3037; nunca aplicada — renumerada…") |
| `.../20261113130500_transfer_conversation_cas_sem_dono.sql` | Na main como `20261113171500_*`, **idêntica** fora do cabeçalho | diff = 2 linhas |
| `.../20261113130600_agendadas_conexao_do_contato_caida.sql` | Na main como `20261113171600_*`, **idêntica** fora do cabeçalho | diff = 2 linhas |
| **Produção (ledger ao vivo)** | As 4 estão **aplicadas** nas versões renumeradas; as `1302xx/1304xx/1305xx/1306xx` nunca existiram | `select version,name from supabase_migrations.schema_migrations where version in (…)` → `20261113171300`, `20261113171400`, `20261113171500`, `20261113171600` (4 linhas; nenhuma `1302xx…`) |
| `.../20261113130000`, `130100`, `130300`, `_foreign/seed-talkx-connection.sql` | IDENTICAL_TO_MAIN | `git ls-tree origin/main supabase/migrations/` |
| `src/components/inbox/VirtualizedRealtimeList.tsx` | Gate `!== 'waiting'` no botão Arquivar: main usa `canArchiveConversation(...)` — mesma intenção, mais forte (também esconde em `archived`) | `origin/main:…:27` (import) e `:758` `{canArchiveConversation(conversation.contact.conversation_status) && (` |
| `src/components/inbox/chat/ChatPanelHeader.tsx` | idem | `origin/main:…:26` e `:219` |
| `src/components/inbox/contact-details/ContactActionButtons.tsx` | idem | `origin/main:…:20` e `:226` |
| `src/hooks/inbox/conversationArchive.ts` | Main é **superset**: `canArchiveConversation` (`:35`), `isWaitingArchiveError` (`:40`), `WAITING_CANNOT_ARCHIVE_*` (`:30-31`), `moveConversationsStatus` (`:84`) + caminho legado (`:138`), `movedBeforeError` (`:80`), `restoreConversationStatuses` com restore em 1 passo (`:256`). As 6 "linhas faltando" são comentários apontando `20261113130200` → main diz `20261113171300` (`:27`, `:71`, `:102`, `:134`) | `git show origin/main:src/hooks/inbox/conversationArchive.ts` |
| `src/hooks/inbox/useInboxBulkActions.ts` | Main é superset: `canArchiveConversation` no filtro (`:206`), aviso "N conversa(s) aguardando atendimento não foram arquivadas", contagem real da RPC (`arquivadasIds`/`movidas.size`), parcial acima de 500 via `movedBeforeError` | `git show origin/main:src/hooks/inbox/useInboxBulkActions.ts` linhas 195-240; import em `:10` |
| `src/hooks/chat/useConversationActions.ts` | Import e uso presentes | `origin/main:…:8-10` e `:285` `toast.error(isWaitingArchiveError(error) ? WAITING_CANNOT_ARCHIVE_MESSAGE : …)` |
| `src/lib/inbox/transferConversation.ts` | Só a referência à migration mudou | `origin/main:…:7` e `:9` citam `20261113171500` |
| `src/services/outbound-message.service.ts` | `surfaceWhatsAppDisconnected` presente, via import dinâmico (mesmo comportamento) | `origin/main:…:507-508`; `src/lib/whatsapp/sendConnection.ts:92` |
| `supabase/functions/_shared/evolution-webhook-messages.ts` | Só a referência à migration | `origin/main:…:369` cita `20261113171400` |
| `src/components/inbox/chat/useChatPanelHandlers.ts` | IDENTICAL_TO_MAIN; trata o erro de waiting | `origin/main:…:572` |
| `supabase/tests/db-audit/conversas-p0-p1-20261113.test.sh` | Main é superset: `F3/F5/F6/F7` apontam para os nomes renumerados (`:35-39`) **e** a main tem +57 linhas de prova nova (revisão Codex #3037 P2 — restore sem novo encerramento; revisão Devin #3064 B — restore com transferência concorrente → `not_authorized`) | `diff` branch×main do arquivo: só as 4 linhas `F*` mudam; resto é adição da main (linhas 351-407) |
| Testes `conversationArchive.waiting.test.ts`, `useInboxBulkActions.test.ts`, `VirtualizedRealtimeList.test.tsx`, `ContactDetails.quickActions.test.tsx`, `message-delivery/index.test.ts` | `missing_in_main = 0`: tudo que a branch adiciona está na main. As `removed_still_in_main` do `useInboxBulkActions.test.ts` são o cenário antigo de desfazer em 2 passos, **substituído de propósito** pelo `p_restore` em 1 passo | item JSON `line_check`; commit `cc6d111fd` "fix(inbox): desfazer de encerrada antes da 171300 vai em dois passos" e `461850460` "set_conversations_status revalida a permissão depois da trava" |
| `docs/adr/ADR-005-conversation-state-machine.md` | Nota "Superada neste ponto (2026-11-13, decisão do dono)" presente, citando `20261113171300` | `git show origin/main:docs/adr/ADR-005-…md` (bloco após a tabela de transições) |
| `docs/contexto/regras/manual/regras.md` | Linha da regra presente na íntegra | `origin/main:…:32` |
| `docs/audits/edge-functions-authz-coverage.md` | Main tem medição **mais nova** que a da branch: `evolution-control-authz.ts` 158/209 = 75.6%, total 294/441 = 66.7% (branch: 155/206 = 75.2%, 291/438 = 66.4%) | `git show origin/main:docs/audits/edge-functions-authz-coverage.md` linhas 6-12 |
| `ESTADO.md` | Artefato gerado (números de linha dos chamadores das edges); regenerado a cada push na main | diff da branch = só `:1420→:1455`, `:143→:146` etc. |
| `supabase/deployment-manifest.json` | Artefato gerado (bytes/sha256 das edges); a main tem os hashes do seu próprio código | item JSON: 62 "linhas faltando" são todas `"bytes"`/`"sha256"`/`"source_sha256"` |
| Demais 20 arquivos | IDENTICAL_TO_MAIN / PRESENT_REVERSE_APPLIES (código já na main, em versão igual ou mais nova) | item JSON `hunk` |

## Lacunas a recuperar
Nenhuma. Não há hunk para portar: o conteúdo entrou pela PR #3064 (pacote 5, merge `ab657aa34`,
2026-11-14) e recebeu revisões posteriores na própria main (`cc6d111fd`, `461850460`, `c6e383a89`,
`1c4c711f5`, `732936826`, `6663bfee5`). As únicas diferenças de texto são (a) a renumeração das 4
migrations, (b) artefatos gerados (`ESTADO.md`, `deployment-manifest.json`) e (c) código que a main
tem em versão **mais nova** que a da branch — portar qualquer coisa daqui seria regressão.

## Conclusão
`closure_comment` do #3037 ("entrou integralmente na #3064") confere com o código e com o ledger ao
vivo. Branch somente leitura, pode ser apagada.

## Verificação adversarial
Parecer: **CONCORDO com INCORPORADA.** Tentei refutar hunk por hunk; nenhum hunk de valor ≥ médio
ficou fora da `main` (`origin/main` em `dac285f62`).

Provas (repo local, git somente leitura):

1. **As 4 migrações "ausentes" estão na main renumeradas, e a main é superset.**
   `git ls-tree origin/main supabase/migrations/` → `20261113171300_conversation_status_regras_e_so_por_rpc.sql`,
   `20261113171400_varredura_mensagens_presas_em_enviando.sql`, `20261113171500_transfer_conversation_cas_sem_dono.sql`,
   `20261113171600_agendadas_conexao_do_contato_caida.sql`.
   Diffs branch→main: 171400/171500/171600 = **1 linha cada** (só o comentário "Era 2026111313xxxx na PR #3037;
   nunca aplicada — renumerada acima do max do ledger e do pacote 170000..171200"). 171300 = **só adições da
   main**: `p_restore boolean` como 5º parâmetro de `set_conversations_status`, ramo `archived→open→resolved`
   sem novo `conversation_closures`, revalidação de `require_contact_edit_permission` DEPOIS da trava, nota
   sobre origem legada `pending/closed`. Nada da branch foi descartado.

2. **Ledger ao vivo (MCP `SUPABASE - ZAPP WEB V2 - MCP`, SELECT):** `20261113171300/171400/171500/171600`
   aplicadas; nenhuma `20261113130200/130400/130500/130600` (nunca aplicadas) — confirma a renumeração como
   correta e o `MISTO_CONFLITO` como falso positivo.

3. **Gate de arquivar (o único comportamento que a branch tinha e a main "não"):** a main substituiu
   `conversation_status !== 'waiting'` por `canArchiveConversation(...)` — mesma regra, agora centralizada:
   `origin/main:src/components/inbox/VirtualizedRealtimeList.tsx:27,758`,
   `src/components/inbox/chat/ChatPanelHeader.tsx:26,219-220`,
   `src/components/inbox/contact-details/ContactActionButtons.tsx:20,226-228`, com
   `canArchiveConversation` definido em `src/hooks/inbox/conversationArchive.ts:35`.

4. **`conversationArchive.ts`:** main tem `WAITING_CANNOT_ARCHIVE_CODE/MESSAGE` (:30-31),
   `canArchiveConversation` (:35), `isWaitingArchiveError` (:40), `movedBeforeError` (:80),
   `moveConversationsStatus` (:84, com `p_restore` em :65/:99), caminho legado (:138) e restauração
   `archived→resolved` em UM passo (:256) além do de dois passos (:259-264). A única linha da branch
   realmente diferente — `confirmadas.set(id, anteriores.get(id) ?? anteriorNoBanco)` (branch :160) — foi
   **mudada de propósito** na main para `confirmadas.set(id, anteriorNoBanco)` com comentário em
   `origin/main:src/hooks/inbox/conversationArchive.ts:223-225` ("o anterior que vale é o que a RPC confirmou
   sob lock"): portar a linha da branch seria **regressão** de corrida.

5. **Demais chamadores:** `origin/main:src/hooks/chat/useConversationActions.ts:8-10,285` usa
   `isWaitingArchiveError`/`WAITING_CANNOT_ARCHIVE_MESSAGE`; `src/hooks/inbox/useInboxBulkActions.ts:10,206,226,254-275`
   usa `canArchiveConversation` + `moveConversationsStatus` + `validFromArchived`/`twoStepGroups`;
   `src/services/outbound-message.service.ts:507-508` chama `surfaceWhatsAppDisconnected` (import dinâmico);
   `src/lib/inbox/transferConversation.ts:5-10,44` tem `p_expect_unassigned` + fallback PGRST202.

6. **Lacunas alegadas, todas sem valor:** `supabase/tests/db-audit/conversas-p0-p1-20261113.test.sh:35-39` na
   main aponta para 171300/171400/171500/171600 (as 4 "linhas faltando" eram só o número antigo); idem
   `docs/adr/ADR-005-conversation-state-machine.md:57` e `docs/contexto/regras/manual/regras.md:32` (regra do
   `waiting` presente, citando 171300); `supabase/functions/_shared/evolution-webhook-messages.ts:369` cita
   171400. `docs/audits/edge-functions-authz-coverage.md` na main é **mais novo** (158/209, total 294/441 =
   66.7%) que na branch (155/206, 291/438 = 66.4%). `ESTADO.md` e `supabase/deployment-manifest.json` são
   artefatos gerados por automação a cada push na `main`.

7. **Rastro do merge:** `ab657aa34e9642d2992cb8fc813548edeb69b1bf` — "pacote 5 — #3037, #3034, #3033, #2971,
   #2943, #2838 e #2894 … (#3064)", 2026-11-14; melhorias posteriores em `6663bfee5` (#3082),
   `732936826` (#3081) e `20261114120000_set_conversations_status_encerramento_repetido.sql`.

Veredito final: **INCORPORADA**. Apagar `origin/claude/fix-conversas-p0-p1-backend-261113` é seguro.
