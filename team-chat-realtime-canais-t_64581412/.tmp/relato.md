Especialista: hugo

REFazer 1 — canais realtime + sem escrita redundante. Diagnóstico completo e correção pronta; FALTA aplicar + rodar prova (workspace não provisionado nesta sessão — ver item 4).

Ponto 1 (recusa: quebra no empilhamento em team-chat-comprehensive.test.ts) → CAUSA ISOLADA, correção pronta.
O teste `useSendTeamMessage persiste conteúdo e mídia e toca o updated_at da conversa`
(src/components/team-chat/__tests__/team-chat-comprehensive.test.ts:215, base dia/2026-10-14)
fixava o comportamento que o cartão manda remover (criterio 3 "Sem update redundante"):
- :243 `expect(f.updates).toHaveLength(1)` — com o update removido por d715ed464, `f.updates` fica `[]` e esta linha quebra: é a falha do empilhamento.
- :244-245 fixavam `table team_conversations` + `payload.updated_at` string.
Correção (fix-comprehensive.patch, 1 hunk, só neste teste): nome passa a `... e NÃO escreve o updated_at da conversa` e as 3 linhas viram `expect(f.updates).toHaveLength(0)` com comentário citando o trigger. NÃO é afrouxamento: comprimento zero é asserção estrita (qualquer `update` futuro no envio volta a quebrar) e as asserções do `insert` em team_messages (:231-242) ficam intactas, assim como o teste de edição (:283-285, update em team_messages). É o mesmo contrato que o teste novo de d715ed464 prova (só `.from('team_messages')` no envio).

Ponto 2 (itens 1 e 3 do pedido: nome único por instância + ressincronização) → JÁ NA BASE, provado por citação (não refeito).
- `src/hooks/team-chat/useTeamMessages.ts:86` (dia/2026-10-14): `.channel('team-messages-<id>' + uniqueRealtimeTopic(''))`, cleanup `removeChannel` (:95), revalidação na RE-inscrição após a primeira (:91-94, `jaInscrito`).
- `src/hooks/team-chat/useTeamMessageReactions.ts:73`: `.channel('team-reactions-<id>' + uniqueRealtimeTopic(''))`, cleanup (:91).
- Ambos vieram do irmão 6b99219159 (cartão 2610130522ddc1), ancestral da base — igual ao que o pai t_d91ff71a já havia constatado.

Ponto 3 (item 2 do pedido: remover update redundante + trigger cobre) → MANTIDO de d715ed464, trigger confirmado na base.
- Trigger `after_team_message_insert_bump_conversation` existe em `supabase/migrations/20260927270001_team_chat_e10_bump_conversation_updated_at_trigger.sql` (dia/2026-10-14). O cherry-pick de d715ed464 deve aplicar limpo: a linha removida é idêntica na base (`useTeamChatMutations.ts:33`).

O que NÃO consegui fazer (dito abertamente): aplicar o cherry-pick + patch e rodar `bun run test ...comprehensive...` / `zapp-verify`. Nesta sessão WSL o `hermes-tarefa-iniciar` sai 75 (CONGELADO, modo V1 suspenso, sem marcador MODO_V2) e a guarda bloqueia `git worktree add`, `git clone`, `git archive` e cópia da referência/outros workspaces — o mesmo bloqueio de infra já registrado em t_5b4da800. Não contornei a guarda; não afirmo verde que não rodei.

Para a próxima sessão (com workspace): `git cherry-pick d715ed464` sobre dia/2026-10-14, aplicar fix-comprehensive.patch, rodar `bun run test src/components/team-chat/__tests__/team-chat-comprehensive.test.ts` (deve ficar verde) e `zapp-verify . --rapido`.

Arquivos desta entrega (sem git disponível, lista manual — 2 arquivos no meu dir):
- fix-comprehensive.patch
- .tmp/relato.md
