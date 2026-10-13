Especialista: hugo

## O que mudou e por quê
- `src/components/monitoring/hooks/useMonitoringData.ts`: o painel agora assina `public.messages` via `useSupabaseRealtime` num tópico único (`monitoring-messages`) e relê a agregação no banco assim que uma mensagem entra ou muda — antes só existia o canal `monitoring-status` (em `useEvolutionMonitoring`), sobre `whatsapp_connections`, então mensagem nova só aparecia no ciclo de 30 s do polling.
  - `refreshFromRealtime`: rajada de mensagens não vira uma consulta por mensagem. A primeira releitura sai imediatamente (o painel não espera) e o resto da rajada cabe em uma única releitura no fim da janela de 4 s (mesmo desenho de throttle do reconnect do próprio wrapper).
  - Ressincronia: `onReconnect` do wrapper cobre SUBSCRIBED após CHANNEL_ERROR/TIMED_OUT, `online` da janela e volta de foco — todos relêem o painel.
  - `lastPeriodRef`: a releitura ao vivo relê a MESMA janela que a tela mostra. Sem isto ela cairia no default `'12h'` do próprio `fetchData` e trocaria o gráfico sob o usuário (regressão que o teste cobre).
  - `generationRef`: evento ao vivo e troca de período podem se sobrepor; a resposta da releitura mais antiga é descartada para não sobrescrever a mais nova. O `loading` é solto pela releitura mais recente (o `finally` só o limpa quando ela é a atual).
- `src/components/monitoring/__tests__/useMonitoringData.realtime.test.ts`: teste novo com o cliente Supabase mockado, canal controlável (payload/status) e timers falsos. Roda o hook REAL e prova a inscrição em `public.messages` no tópico único, a releitura imediata, a janela preservada, o throttle da rajada, a ressincronia na reconexão, a ordem invertida (resposta atrasada descartada) e a devolução do tópico no unmount.

## Arquivos
- Escritos por mim (o par hook + teste do cartão): `src/components/monitoring/hooks/useMonitoringData.ts` e `src/components/monitoring/__tests__/useMonitoringData.realtime.test.ts`.
- `src/components/monitoring/__tests__/useMonitoringData.buckets.test.ts` aparece alterado no diff da branch: foi reescrito pelo cartão PAI `t_c3c48a64` (ele provava o caminho removido) e chegou aqui pela FAIXA DO PAI trazida por `git cherry-pick -x` (`abf8e9bc50`, `3314412cc1`, `7cb4c4b220`, `fb3924c6f7`, `de98c7f0b1`, `b07413c8d0`), como o cartão manda em DEPENDÊNCIA ("traga a faixa inteira do pai").
- O diff da branch também mostra `src/integrations/supabase/types.ts`, `supabase/migrations/20261013230006_monitoring_message_buckets.sql` e `supabase/tests/monitoring_message_buckets.sql` — nenhum foi escrito por mim: vêm da mesma FAIXA DO PAI. A RPC `get_monitoring_message_buckets` e o `supabase/tests/monitoring_message_buckets.sql` são o dado que o painel relê; o `types.ts` é só a tipagem da RPC e o `20261013230006_*` é a migração dela. Sem essa faixa o hook deste cartão nem compila (`supabase.rpc('get_monitoring_message_buckets', ...)` não existiria no cliente).
- Sobre publicação/realtime: a baseline canônica do guard (`scripts/db-audit/realtime-publication-baseline.json`) já contém `public.messages`; não criei migração nem mexi no guard.

## Prova
- vermelho antes: com o hook na versão do pai (sem a assinatura), `npx vitest run src/components/monitoring/__tests__/useMonitoringData.realtime.test.ts` → `Test Files 1 failed (1); Tests 7 failed (7)`.
- verde depois (testes alterados neste cartão): `npx vitest run src/components/monitoring/__tests__/useMonitoringData.realtime.test.ts src/components/monitoring/__tests__/useMonitoringData.buckets.test.ts` → `Test Files 2 passed (2); Tests 13 passed (13)`.
- sem regressão no módulo: `npx vitest run src/components/monitoring src/hooks/__tests__/useSupabaseRealtime.test.tsx src/hooks/realtime` → `Test Files 10 passed (10); Tests 68 passed (68)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (533s)` — `OK db_guard 0s; OK tipos 528s; OK lint 4s; OK migrations 1s`.

## O que NÃO fiz e por quê
- "privado quando aplicável": no V2 não há canal privado nenhum no front (não existe `config.private` em `src/`). O acesso já é limitado pela RLS de `public.messages` nos `postgres_changes`; um canal privado exigiria política em `realtime.messages` — mudança de banco, fora dos arquivos deste cartão e do escopo de hooks. Não inventei canal privado.
- Saúde/SLA não ganharam assinatura própria: o cartão pede a assinatura de mensagens e a mensagem já relê o painel inteiro (`fetchData`), incluindo logs de saúde.
