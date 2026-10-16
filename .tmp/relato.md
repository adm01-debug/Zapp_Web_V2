Especialista: senior (area-sql-banco)

## Pontos da recusa
- Ponto 1: o cartão anterior foi recusado porque a entrega aprovada não foi realmente rebaseada/fechada na ponta atual. Corrigi reaplicando o commit de código aprovado (`78c7ba2a56`) sobre `dia/2026-10-13` no workspace novo; o commit `8c2595862030` citado no cartão era só relato, então não trouxe relato velho como base do código.
- Ponto 2: comportamento aprovado preservado. O diff de código continua restrito aos arquivos do trabalho aprovado (tipos Supabase, migration de SLA e teste SQL de SLA); o outro arquivo do commit é este relato `.tmp/relato.md`, exigido pelo fechamento. Não mexi em tela, Edge Function, CI, manifesto, nem em outro módulo.
- Ponto 3: conflito/rebase na ponta atual. O cherry-pick aplicou sem conflito textual sobre a ponta atual; conferi `git diff --cached --name-only` antes do commit e mantive só os arquivos do cartão + relato.
- Ponto 4: verificação full. Rodei `zapp-verify full .`; `db_guard`, `tipos`, `lint` e `migrations` passaram, mas a etapa geral de testes ficou vermelha por falha preexistente fora do diff em `src/components/talkx/__tests__/RuleValueInput.test.tsx` (`Unable to find role="button" and name "Novo segmento"`). Confirmei isso com o meu diff stashed: o mesmo teste falha na base atual (`Test Files 1 failed (1); Tests 1 failed | 4 passed (5)`). Não corrigi porque é front/Talk X e fora do escopo deste refazer de banco.

## O que mudou e por quê
- `supabase/migrations/20261011180337_sla_alert_events_and_preferences.sql`: cria `sla_alert_events`, `sla_alert_preferences` e as funções `record_sla_alert` / `resolve_sla_alert`, com RLS/GRANTs para histórico por visibilidade de contato e preferências por usuário.
- `supabase/tests/sla_alert_events_and_preferences.sql`: executa as migrations reais num PostgreSQL descartável, aplica papeis reais (`authenticated`, `anon`, `service_role`) e prova leitura, bloqueios de escrita direta, idempotência, resolução/auditoria e preferências próprias.
- `src/integrations/supabase/types.ts`: atualiza os tipos gerados para as duas tabelas/RPCs novas.
- `.tmp/relato.md`: relato deste refazer.

## Prova executada agora
- Teste SQL real (arquivo de teste do commit): `docker exec ... psql ... < supabase/tests/sla_alert_events_and_preferences.sql` -> `green_exit=0` e `=== SLA ALERT: TODAS AS ASSERCOES PASSARAM ===`.
- Prova vermelha do mesmo teste sem a proteção: mesmo comando com `-v sem_guarda=1` -> `red_exit=3` e falha esperada em `SLA FALHOU [A3 agente B ... ve 3 alertas]: esperado 3, obtido 4`.
- Rollback executado no PostgreSQL descartável: `.tmp/rollback_sla_alert_events.sql` -> `NOTICE:  PASS rollback SLA removeu tabelas e funcoes novas`.
- Verificação rápida: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (28s)` com `db_guard`, `tipos`, `lint` e `migrations` OK.
- Verificação full: `zapp-verify full .` -> `db_guard`, `tipos`, `lint` e `migrations` OK; `testes` vermelho por falha preexistente em Talk X, confirmada também na base com o meu diff guardado em stash.

## Arquivos do diff
.tmp/relato.md
src/integrations/supabase/types.ts
supabase/migrations/20261011180337_sla_alert_events_and_preferences.sql
supabase/tests/sla_alert_events_and_preferences.sql

## O que NÃO fiz
- Não alterei a falha preexistente de `RuleValueInput.test.tsx` porque é fora do escopo e não é causada pelo diff deste cartão.
