- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 120s;OK lint 5s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (11/10 10:38, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/chat/useChatPanelHandlers.ts  |  14 +-
 src/hooks/chat/__tests__/snoozeDurations.test.ts   |  71 ++++++++++
 .../useConversationActions.snooze.test.ts          | 143 +++++++++++++++++++++
 src/hooks/chat/snoozeDurations.ts                  |  65 ++++++++++
 src/hooks/chat/useConversationActions.ts           |  56 ++++----
 5 files changed, 326 insertions(+), 23 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 11 passed (11)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:\.delete\(\)|\bDELET, padrão:requireRole|isAdmin|

# Adiar conversa para a próxima semana no dia certo + gravação que preserva o adiamento anterior

Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/chat/snoozeDurations.ts (novo): função pura `snoozeDurationToDate(duration, now)` com a regra única do adiamento. "Próxima semana" = PRÓXIMA segunda às 09:00:00.000 (domingo → +1, segunda → +7, sexta → +3). "Amanhã" = amanhã às 09:00:00.000 (zera minuto/segundo/ms). Antes o cálculo de "nextweek" era `7 - getDay() + 1` e, no domingo, somava 8 dias (pulava a segunda seguinte) e ainda mantinha o minuto atual.
- src/hooks/chat/useConversationActions.ts: passa a usar a função compartilhada (a regra sai de dentro do hook) e troca a ORDEM da gravação: lê a linha atual do par, INSERE a nova e só remove a anterior depois de a inserção ser aceita. Antes o `delete` vinha primeiro e uma inserção recusada (RLS/rede) apagava o adiamento que já existia — a conversa sumia do adiamento por causa de uma gravação que falhou. A falha agora avisa com `toast.error('Erro ao adiar conversa. Tente novamente.')` e mantém o adiamento anterior; o estado otimista continua só no caminho de sucesso.
- src/components/inbox/chat/useChatPanelHandlers.ts (só a linha do comando /snooze): sem período, avisa com toast destrutivo "Informe o período: 1h, 3h, amanhã ou semana." em vez de não fazer nada.
- Testes novos em src/hooks/chat/__tests__/: snoozeDurations.test.ts (domingo, segunda, sexta, virada de mês, 1h/3h, default 1h) e useConversationActions.snooze.test.ts (ordem insert→delete; falha na inserção avisa e NÃO remove a linha anterior; sem linha anterior não chama delete).

## Por que a gravação não é um upsert literal
Não existe índice único em conversation_snoozes(contact_id, snoozed_by) nem policy de UPDATE na tabela (conferido nas migrations e no schema-manifest), então `upsert(...onConflict: 'contact_id,snoozed_by')` seria recusado pelo PostgREST e o UPDATE seria filtrado pelo RLS. A única forma, sem migration (trilha de banco), de preservar o adiamento anterior é inserir antes de remover. Deixei a recomendação do índice único em comentário no cartão.

## Prova
- vermelho antes: fórmula antiga no domingo (27/09/2026) → `Mon Oct 05 2026 09:37` (8 dias, minuto 37) em vez de 28/09 às 09:00.
- verde depois: `npx vitest run src/hooks/chat/__tests__/ src/components/inbox/chat/__tests__/useChatPanelHandlers.assinatura-retry.test.tsx` → ver bloco FATOS MEDIDOS (0 falhas).

## O que NÃO fiz e por quê
- Não toquei no rótulo/valor de VirtualizedRealtimeList.tsx:51 nem em slashCommandsData.ts: o componente só repassa o `value` ("nextweek") e o cálculo inteiro vive no hook; nada ali consome a função.
- Não criei migration nem RPC (fora da trilha de front do cartão): por isso a gravação é insert-antes-do-delete, não upsert.
- QuickAdd.tsx:89 já usa a fórmula correta de próxima segunda — fora do escopo, não alterado.
