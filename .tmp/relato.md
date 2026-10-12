Especialista: hugo

## O que mudou e por quê

- `src/hooks/system/useSupabaseConnectivity.ts` (novo): sonda periódica de
  disponibilidade do backend Supabase. Estados `checking | online | degraded |
  offline`; intervalo base de 30 s; recuo exponencial a cada falha (dobra o
  intervalo, teto de 5 min); pausa com a aba oculta (`visibilitychange`) e
  retomada com sonda imediata; reage a `online`/`offline` do navegador;
  descarta resposta obsoleta (corrida) por geração; `retryNow()` força sonda
  imediata; timer e respostas em voo limpos no desmonte.
- Sonda leve: `supabase.functions.invoke('health', { method: 'GET', signal })`
  no cliente existente (`src/integrations/supabase/client.ts`). O endpoint `health`
  é a Edge de saúde do projeto (paridade do `health-check` do V3: um HEAD/select de
  banco). NÃO consulta tabela de dados de usuário. `FunctionsFetchError` (nada
  respondeu: rede/DNS/timeout) = inacessível; qualquer outra resposta — inclusive
  HTTP não-2xx — prova que o backend está de pé e conta como alcançável.
- Por que NÃO `connection-health-check`: apesar de ser o endpoint que a V2 já usa no
  painel de diagnóstico, ele é job de cron/admin que chama a Evolution API por
  conexão e grava em `connection_health_logs`/`warroom_alerts` — carga e efeitos
  colaterais incompatíveis com a regra "a sonda não pode gerar carga relevante" e com
  o intervalo de 30 s. Deixei o porquê escrito no próprio docstring do hook.
- `src/hooks/system/__tests__/useSupabaseConnectivity.test.ts` (novo): 11 casos com
  temporizadores falsos, exercitando o hook REAL junto do `useNetworkStatus` REAL
  (só o cliente Supabase é dublado). Nomes dos casos:
  1. parte em checking e marca online quando o backend responde (sonda leve, sem tabela de usuário)
  2. resposta HTTP não-2xx (servidor respondeu) ainda conta como online
  3. uma falha marca degraded e a próxima tentativa espera o dobro do intervalo (recuo)
  4. três falhas seguidas marcam offline
  5. resposta lenta (acima do limite) marca degraded mesmo com sucesso
  6. pausa o ciclo com a aba oculta e sonda de novo ao voltar
  7. navegador offline fica offline sem sondar e volta a sondar ao reconectar
  8. retryNow força uma sonda imediata e zera as falhas
  9. descarta a resposta de uma sonda obsoleta (corrida) sem apagar o estado novo
  10. não sonda mais depois de desmontar
  11. nextBackoffDelay dobra por falha e respeita o teto
- Lacuna confirmada no código ATUAL (ponta `dia/2026-10-12`): `git grep -i connectivity -- src`
  não devolve nenhum hook/sonda (só uma menção não relacionada em
  `src/components/inbox/LocationPicker.tsx`); existia apenas o `useNetworkStatus`
  (navegador online/offline), sem detecção de backend fora com navegador online.

## Prova

- vermelho antes (hook renomeado para fora do caminho, teste intacto):
  `npx vitest run src/hooks/system/__tests__/useSupabaseConnectivity.test.ts` →
  `Test Files 1 failed (1)` / `Tests no tests` (falha ao importar
  `@/hooks/system/useSupabaseConnectivity`).
- verde depois: `npx vitest run src/hooks/system/__tests__/useSupabaseConnectivity.test.ts`
  → `Test Files 1 passed (1)` / `Tests 11 passed (11)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint e
  migrations OK).

## O que NÃO fiz e por quê

- Não exportei o hook no barril `src/hooks/system/index.ts`: os arquivos que o
  cartão autoriza são só o hook e o teste; o consumidor (banner, `t_bc279fb5`)
  pode importar direto do caminho. Se o barril for desejado, entra em outro cartão.
- Não toquei no `connection-health-check`, em nenhuma Edge Function, migration,
  guarda, `useNetworkStatus` nem em qualquer teste existente.
- Não usei banco remoto, credencial real, sessão salva nem chamada de rede real:
  o cliente Supabase é dublado nos testes.
