Especialista: senior (area-front-componentes)
## O que mudou e por quê
- `src/components/settings/CSATAutoConfig.tsx`: a descrição da regra agora diz o mecanismo ("o id do encerramento vai no convite e o banco impede duplicar") em vez de só prometer "uma vez por conversa"; comentário do "Último envio" cita o contrato exato (`p_client_message_id` = id do encerramento, unicidade `(contact_id, client_message_id)`) e o escopo real (remetente automático, qualquer conversa; a tela não tem contexto de conversa para filtrar por contato).
- `src/components/settings/__tests__/CSATAutoConfig.test.tsx`: teste do último envio renomeado para o contrato + teste novo que exige o mecanismo na tela.
- Reaproveitados sem alteração os commits anteriores do cartão na branch `v2/csat-auto-fechamento-2610130228bfac`: `85fdafd1dd` (disparo + ajuste da tela + `CloseConversationDialog`) e `41e02aa97` (erro de leitura do último envio). Meu fix vai por cima como patch (`.tmp/fix-refazer1.patch`); `hermes-tarefa-iniciar`/`hermes-tarefa-fechar` estão congelados nesta sessão (CONGELADO sem MODO_V2), então não há commit novo em branch.

## Prova
- Verde depois: `npx vitest run src/components/settings/__tests__/CSATAutoConfig.test.tsx` → `Test Files  1 passed (1)` / `Tests  10 passed (10)`.
- Vermelho antes (componente original do commit `41e02aa97` + testes novos): `Test Files  1 failed (1)` / `Tests  1 failed | 9 passed (10)` — falha `diz que o id do encerramento vai no convite e o banco impede duplicar`.
- Sem regressão ao lado: `npx vitest run src/components/settings/__tests__/` → `Test Files  26 passed (26)` / `Tests  426 passed (426)`.

## Pontos do revisor
- Ponto 1: resolvido em `src/components/settings/CSATAutoConfig.tsx` (descrição cita id do encerramento no convite + unicidade no banco); prova: teste novo `diz que o id do encerramento vai no convite e o banco impede duplicar` (vermelho antes, verde depois, acima).
- Ponto 2: procede em parte. Conferi o contrato no código: `supabase/functions/csat-auto-send/index.ts:380` (`p_client_message_id: String(atual.id)`, onde `atual` é o encerramento) e unicidade `(contact_id, client_message_id)` na migration da fila. O "Último envio" continua global (a tela de configuração não tem conversa/contato para filtrar), mas agora o comentário e o teste documentam o mecanismo e o escopo; prova: teste `mostra a data do último envio, com o convite achado pelo id do encerramento` (filtro `['closure-9', 'closure-8']` por `client_message_id`).
- Ponto 3: título e descrição conferidos em `src/components/settings/CSATAutoConfig.tsx:117-146` — ambos dizem "encerra a conversa"; nenhum texto promete atraso aplicado (o aviso "O envio automático é imediato: este atraso ainda não é aplicado." continua); prova: teste `descreve o envio real e NÃO promete o atraso` (verde nos 10).
- Ponto 4: o link de conversa não foi adicionado porque a consulta não retorna conversa (só a data do convite) e o cartão só permite os 2 arquivos acima; registrado abaixo como não feito.

## O que NÃO fiz e por quê
- Não filtrei por contato nem mostrei link de conversa no "Último envio": a tela não tem contexto de conversa/contato e o cartão limita aos 2 arquivos acima; a consulta retorna só a data.
- Não alterei `CloseConversationDialog.*` nem a Edge: vieram no commit anterior, fora dos pontos da recusa, e o comportamento deles foi conferido (não mudado).

## Arquivos (fix deste refazer; anteriores inalterados)
- `src/components/settings/CSATAutoConfig.tsx`
- `src/components/settings/__tests__/CSATAutoConfig.test.tsx`
- `.tmp/fix-refazer1.patch` (patch destes 2 arquivos contra o estado do commit `41e02aa97`)
