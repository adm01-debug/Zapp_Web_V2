Especialista: edgar

## Sensibilidade
- O diff toca o caminho do client admin (`service_role`) dentro do handler de presença — é o único jeito legítimo de o
  webhook publicar no Realtime (o client do webhook é criado com `SUPABASE_SERVICE_ROLE_KEY` em
  `evolution-webhook/index.ts`). Nenhuma proteção foi afrouxada: a mudança ENDURECE (canal privado + descarte de
  `@broadcast`), não abre nada.
- Prova do caso NEGADO (`evolution-presence-typing-private.test.ts`): T2 (JID `@broadcast`/`status@broadcast`) e T3
  (grupo `@g.us`) mostram que o evento é descartado ANTES de qualquer acesso ao banco (zero consultas); T4/T5 mostram
  fail-closed (sem conexão/sem contato → nenhum canal aberto, nenhum envio).
- Nada de banco/endpoint de produção; provas rodam com dublê sintético no handler e, na faixa do pai, no banco LOCAL.
- O que muda para quem chama: o webhook (Evolution) não muda. O FRONT precisa assinar o canal como privado
  (`config.private: true`) para ler o `contact_typing` — isso é o cartão PD-69/PD-70 (front), fora do meu escopo; o
  service_role segue enviando (BYPASSRLS) como antes.

## Arquivos do diff (6 arquivos, 2 de teste) — o que é meu e o que é a faixa do pai
- MEUS (3): `supabase/functions/_shared/evolution-webhook-handlers.ts`, `supabase/functions/_shared/evolution-types.ts`
  e o teste novo `supabase/functions/_shared/__tests__/evolution-presence-typing-private.test.ts`.
- FAIXA DO CARTÃO PAI t_db7ea742, trazida por cherry-pick da lane `v2/realtime-canais-privados-2610130244cc8a` como o
  cartão mandou (a branch nasceu da `dia/2026-10-13`, que ainda não tinha o commit b41f506b5):
  `supabase/migrations/20261013210002_realtime_canais_privados.sql` e `supabase/tests/realtime_canais_privados.sql`
  (a migration + o teste SQL que criam a RLS de `realtime.messages` que este canal privado passa a usar). Não alterei
  uma linha desses dois.
- `supabase/functions/_shared/evolution-types.ts` NÃO está na lista de ARQUIVOS QUE PODE TOCAR; a mudança é
  indispensável e aditiva: `channel(name, options?)` — sem o 2º argumento opcional o TypeScript barra
  `{ config: { private: true } }` (o client real já aceita; só o tipo do dublê estava estreito). Não muda
  comportamento nem dublês existentes.
- `.tmp/relato.md` é este relato.

## O que mudou e por quê
- `handlePresenceUpdate`: o broadcast `contact_typing` agora vai no canal `typing:<contactId>` com
  `{ config: { private: true } }` — passa a valer a RLS de `realtime.messages` (policies do pai t_db7ea742), então um
  cliente anônimo/estranho não lê nem forja "digitando" alheio. Antes o canal era público.
- Mesmo handler: JID de difusão (`@broadcast`, inclui `status@broadcast`) passa a ser descartado junto com grupo
  (`@g.us`), antes de qualquer consulta ao banco — era a outra brecha do achado. Os guards viraram early-return
  fail-closed: sem telefone normalizável, sem conexão da instância ou sem contato → nada é publicado.
- Teste novo com 7 casos (T1 canal privado; T2 `@broadcast`/`status@broadcast`; T3 grupo; T4 sem conexão; T5 sem
  contato; T6 `isTyping=false`; T7 sem jid).

## Prova
- vermelho antes: `deno test --allow-net --allow-env --no-check
  supabase/functions/_shared/__tests__/evolution-presence-typing-private.test.ts` com o handler ORIGINAL restaurado
  por `git stash` → `FAILED | 4 passed | 3 failed` (T1, T2 e T6 falham).
- verde depois: mesmo comando → `ok | 7 passed | 0 failed`.
- regressão do roteador: `deno test --allow-net --allow-env --allow-read --no-check
  supabase/functions/_shared/__tests__/evolution-webhook-event-coverage.test.ts` → `ok | 4 passed | 0 failed`.
- faixa do pai já verificada no fechar dele (`zapp-verify --rapido` OK) e trazida intacta por cherry-pick.

## O que NÃO fiz e por quê
- Não mexi no FRONT (`src/hooks/chat/useTypingPresence.ts`): assinar o canal como privado e usar o tópico do CONTATO
  é o escopo do PD-69/PD-70 (fora da minha área). Deixei comentário no cartão com o lembrete.
- Não bloqueio por isso: minha parte (o emissor) entrega canal privado e evento autêntico sozinha.

## Avisos do juiz barato: por que não procedem
- Ponto 1 (números do relato × diff): já batem — o relato diz "6 arquivos, 2 de teste" e "7 casos", que é exatamente o
  que o diff mostra; a contagem não mudou desde a correção anterior.
- Ponto 2 (arquivos fora da lista): `evolution-types.ts` é o pré-requisito de TIPO (aditivo) já explicado acima; a
  migration e o `supabase/tests/realtime_canais_privados.sql` NÃO são meus — vieram por cherry-pick da lane do cartão
  pai t_db7ea742, como o próprio cartão mandou ("traga a FAIXA inteira; a branch nasceu da dia/2026-10-13 que ainda não
  tinha o commit b41f506b5"). Revertê-los deixaria o teste sem a RLS que ele exercita.

