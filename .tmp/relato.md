Especialista: semisenior (area-front-hooks)

Refazer 1 do arquivamento em lote pela RPC: parti da versão do pai (t_70d06027,
commit 45de2ff3ca — UPDATE direto com melhorias) e troquei o caminho de
gravação pela RPC set_conversation_status, preservando as melhorias dele. Diff
contra a entrega anterior (9305240ff): só 2 arquivos, +97/-2, 7.540 chars.

Ponto 1 — Conflito com a ponta (rebase): RESOLVIDO SEM REBASE. O workspace já
estava no branch da entrega (v2/arquivar-grava-estado-arquivada-rebase-26101301191d6d,
HEAD 9305240ff, mesma base 96dd72dc5f do pai). Não havia divergência para
reconciliar via rebase: reconstruí o bulkArchive sobre o HEAD (que já contém o
RPC aprovado em t_56e8f367) incorporando as melhorias do pai. Nenhum commit
estranho no caminho — `git log dia/2026-10-14..HEAD` tem só os 3 commits da
entrega (a47e79c571 + 2 docs). Arquivo: nenhum (decisão documentada aqui).

Ponto 2 — waiting→archived recusado pela FSM: TOLERADO COMO FALHA PARCIAL.
Confirmei na base: a RPC aceita waiting→archived, mas o trigger
20260905090000_contacts_fsm_trigger.sql recusa (waiting→open|resolved); o
t_c2b3c613 que abriria a transição NÃO integrou (commits ea56ca831e/c6ccd5a82b
fora de HEAD e da dia/2026-10-14). Como cada contato vai numa RPC própria com
erro isolado, um waiting recusado cai em `falhas` ("X arquivadas, Y falharam"),
mantém a seleção da falha e não abre desfazer sobre o que não mudou.
Arquivo: src/hooks/inbox/useInboxBulkActions.ts (caminho já existia no HEAD;
nenhuma mudança nova para este ponto). Teste que prova:
"falha parcial: informa X arquivadas, Y falharam..." (existente, verde).

Ponto 3 — bulkArchive ANTES de bulkTransfer + desfazer só estados válidos:
OK. bulkArchive já está antes de bulkTransfer no arquivo (linhas ~126/191) e o
desfazer reabre SOMENTE via RPC p_next='open' — o único retorno válido de
'archived' na FSM (trigger: archived→open). O "agrupamento por status" do pai
perde o sentido na RPC e foi documentado no código em vez de copiado.
Arquivo: src/hooks/inbox/useInboxBulkActions.ts (comentário + undo).
Teste que prova: "arquiva cada contato pela RPC e o desfazer reabre só as
arquivadas" (verde; RED anterior: undo ignorava falha de reabertura).

Ponto 4 — assigned_to intocado: JÁ VALE NO HEAD (a RPC nunca tocou
assigned_to). Preservado: nenhum SELECT/UPDATE de assigned_to no diff.
Teste que prova: "Nada de update direto em contacts" (contactUpdates vazio).

Reconciliação com o pai, ponto a ponto (coordenação t_70d06027):
(a) erro do SELECT conferido: bulkArchive agora lê `id` dos selecionados
antes das RPCs; erro de leitura/RLS cai no catch → "Erro ao arquivar
contatos", sem arquivar ninguém, seleção mantida;
(b) zero linhas lidas → erro "nenhum contato lido" (mesmo aviso, nada muda);
(c) só arquiva quem foi lido (alvos = interseção lidos∩seleção);
(d) falha de REABERTURA no desfazer agora avisa
("N conversa(s) não puderam ser reabertas") em vez de silenciosa (observação 1
do revisor no pai).
Arquivo: src/hooks/inbox/useInboxBulkActions.ts (+19/-2).
Testes que provam (4 novos, RED no HEAD sem a correção, GREEN com ela):
- "erro de leitura/RLS no SELECT: avisa em pt-BR, não chama a RPC e mantém a seleção"
- "SELECT sem linhas: avisa, não arquiva ninguém e mantém a seleção"
- "só arquiva quem foi lido: id fora do SELECT não recebe RPC"
- "desfazer com falha de reabertura: avisa quantas não puderam ser reabertas"
Saída RED (hook do HEAD + testes novos): 4 failed | 6 passed. Saída GREEN
(com a correção): 31/31 no arquivo; 25/25 nos relacionados
(useConversationActions.test.ts + ContactDetails.quickActions.test.tsx).

Item 3 do pedido (genérico useBulkActions.ts): JÁ FEITO na entrega anterior e
aprovado — o ramo `tableName === 'contacts'` chama a RPC (linhas 138-146),
sem UPDATE direto. Nenhuma mudança necessária; não tocado.

Fora de escopo revertido: cheguei a puxar ContactDetails.tsx/ContactDetails.quickActions.test.tsx
da dia/2026-10-14 e useConversationActions.ts de commit antigo — detectado na
autorrevisão (diff alheio: ContactIntelligencePanel etc.) e revertido para o
HEAD antes de fechar. O diff final NÃO contém esses arquivos.

Arquivos (git diff --name-only HEAD):
- src/hooks/inbox/useInboxBulkActions.ts
- src/hooks/inbox/__tests__/useInboxBulkActions.test.ts

Comandos de verificação:
- bunx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts → 31 passed
- bunx vitest run src/hooks/chat/__tests__/useConversationActions.test.ts src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx → 25 passed
- hermes-tarefa-fechar (zapp-verify --rapido): CONGELADO (modo V1 suspenso pela
  Arquitetura V2) — rodei direto: `zapp-verify . --rapido` → VERDE SEM BANCO
  (13s; db_guard OK, tipos OK, lint OK, migrations OK; banco_local N/A: sem
  DDL neste cartão).
