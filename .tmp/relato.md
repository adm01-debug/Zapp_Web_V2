Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/system/useConnectionAlertPreferences.ts (novo): lê `public.connection_alert_preferences`
  via React Query (chave por usuário), expõe `preferences` com o padrão LIGADO quando não há linha e
  grava com upsert OTIMISTA — `onMutate` cancela a leitura em voo e adianta o valor; `onError` faz
  ROLLBACK do cache e anuncia a falha (`toast.error`), nunca engole. Zero linha devolvida pelo upsert
  (RLS) conta como falha, não como sucesso. Helper puro `shouldNotifyConnectionAlert(prefs, tipo)`.
- src/components/alerts/EvolutionDisconnectBanner.tsx: o GATE. O aviso de conexão caída consulta o TIPO
  `alert_on_disconnected`; desligado, a faixa não renderiza nem com a conexão na lista. O TIPO é o
  interruptor mestre; push/e-mail são CANAL (por onde o aviso sai).
- Testes: useConnectionAlertPreferences.test.tsx (novo, prova padrão, leitura, otimista e rollback);
  EvolutionDisconnectBanner.preferencia.test.tsx (novo, prova o gate ligado/desligado e que desligar
  só o degradado não esconde o aviso caído). Os 3 testes de banner existentes ganharam os provedores
  do app (TestQueryWrapper + useAuth sintético) e o SELECT de preferência no mock do supabase —
  NENHUMA asserção existente mudou: src/components/alerts/__tests__/EvolutionDisconnectBanner.a11y.test.tsx
  e src/components/alerts/__tests__/EvolutionDisconnectBanner.janela-manutencao.test.tsx (reescritos com
  o wrapper e o mock por tabela) e src/components/alerts/__tests__/EvolutionDisconnectBanner.behavior.test.tsx
  (mock por tabela, useAuth falso, `{ wrapper: TestQueryWrapper }` nas 3 montagens).
- Vem do cartão pai (t_e8b312e0), trazido por cherry-pick e NÃO reescrito por mim:
  src/integrations/supabase/types.ts, supabase/migrations/20261013044440_connection_alert_preferences.sql
  e supabase/tests/connection_alert_preferences_rls.sql (a tabela e a RLS do PD-38).

## Prova
- vermelho antes (hook inexistente): `npx vitest run src/hooks/system/__tests__/useConnectionAlertPreferences.test.tsx`
  -> "Failed to resolve import ... useConnectionAlertPreferences" (Test Files 1 failed; no tests)
- vermelho antes (gate ausente): com o banner da base, `npx vitest run src/components/alerts/__tests__/EvolutionDisconnectBanner.preferencia.test.tsx`
  -> "Tests 1 failed | 3 passed (4)" (a faixa aparecia com a preferência desligada)
- verde depois: `npx vitest run src/components/alerts/__tests__/ src/hooks/system/__tests__/useConnectionAlertPreferences.test.tsx`
  -> "Test Files 5 passed (5); Tests 22 passed (22)"
- contratos do banner: `npx vitest run --config vitest.contracts.config.ts tests/contracts/axe-shell-landmarks.contract.test.ts tests/contracts/contraste-aa-componentes.contract.test.ts`
  -> "Test Files 2 passed (2); Tests 29 passed (29)"
- tipos: `npx tsc --noEmit -p tsconfig.json` -> exit 0

## O que NÃO fiz e por quê
- Não dupliquei o hook de aviso do navegador/e-mail (cartão t_c2349019, que está em refazer): o
  `useConnectionAlertPreferences` fica disponível e o t_c2349019 refeito passa a consumi-lo
  (`shouldNotifyConnectionAlert` para o TIPO e push/e-mail para o CANAL).
- Não mexi em migration/DDL: a tabela veio do cartão pai (t_e8b312e0), trazida por cherry-pick.
