Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261012231400_notifications_goal_dedupe.sql` (nova, aditiva): trigger BEFORE INSERT `notifications_goal_dedupe` que, quando o escritor não informa `notifications.dedupe_key`, calcula a chave estável do aviso de meta (`goal:v1:<goal_id>:<period>:<dia em America/Sao_Paulo>`) e PULA a inserção quando o mesmo aviso já existe. Duas gravações iguais do mesmo usuário/meta/período/dia → 1 linha, sem erro; o índice parcial `ux_notifications_user_dedupe_key` (IA-047) segue como backstop da corrida (23505). Não toca GRANT, policy nem tabela; o rollback (drop trigger + drop function) fica no cabeçalho.
- `supabase/tests/notifications_goal_dedupe.sql` (novo): suíte que cria à mão a superfície real de `public.notifications` (roles anon/authenticated/service_role, `auth.uid()/auth.role()`, dedupe_key, o índice IA-047, RLS e as policies reais, inclusive "Block authenticated notification inserts" WITH CHECK false) e aplica o ARQUIVO REAL da migration.

Motivo: o aviso de meta era gravado sem trava nenhuma no banco (o hook só deduplica no useRef — recarregar/2ª aba reenvia). A coluna `dedupe_key` e o índice já existiam, mas nenhum escritor preenchia a chave, então o índice nunca pegava nada.

## Prova
- vermelho antes: `docker exec -i … psql -v sem_migration=1 < supabase/tests/notifications_goal_dedupe.sql` → `ERROR: T1 FALHOU: 2 insercoes iguais gravaram 2 linha(s), esperado 1` (EXIT=3).
- verde depois: mesmo comando com `-v mig=/repo/supabase/migrations/20261012231400_notifications_goal_dedupe.sql` →
  `T1 OK: 2 insercoes iguais = 1 linha; dedupe_key=goal:v1:g-abc:daily:2026-10-12`
  `T2 OK: meta/período diferentes = linhas diferentes (3 no total)`
  `T3 OK: dia diferente => chave diferente (goal:v1:g-abc:daily:2026-10-11); 4 no total`
  `T4 OK: type<>goal sem dedupe_key nao e deduplicado (2 linhas)`
  `T5 OK: dedupe_key explicita repetida recusada pelo indice (23505)`
  `T6 OK: authenticated segue recusado na escrita (42501 / WITH CHECK false)`
  `T7 OK: funcao da trigger fechada para anon/authenticated`
  `notifications_goal_dedupe: TODAS as assercoes passaram (T1-T7)`
- banco LOCAL real (migration aplicada por `hermes-db-migrar`, todas as migrations reais): `zapp-db-local psql . v2-26101220090beb` com 2 INSERTs de meta idênticos como `service_role` → `INSERT 0 1` / `INSERT 0 0` e `linhas=1 | chave=goal:v1:g-probe:daily:2026-10-12` (transação com ROLLBACK) — confirmado.
- rollback executável: probe roda as 2 linhas do cabeçalho → `ROLLBACK OK: trigger e funcao removidas, indice IA-047 intacto`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (110s)` (sem nome de conjunto o banco é pulado — é assim que o fechar chama).
- Gatilhos da tabela no banco real: só `notifications_goal_dedupe` (`pg_trigger`), nenhum outro — não há `updated_at` a reescrever.

## Passada de efeito colateral
1. Gatilhos: nenhum outro em `notifications`; a trigger só muta `NEW`/faz SELECT, sem gravar evento.
2. Tudo ou nada: é um INSERT de uma linha; não há UPDATE/backfill. Nada fica pela metade.
3. Permissão: diff sem GRANT/policy; o único ACL é `REVOKE ALL ON FUNCTION public.notifications_goal_dedupe_key() FROM public, anon, authenticated` (endurecimento do objeto NOVO). T6 prova que a policy de escrita herdada não foi afrouxada.
4. Entrada inválida: metadata sem `goal_id`/`period` → não inventa chave e grava como antes (fail-open, T4); `dedupe_key` explícita é respeitada (T5).
5. Teste provado por comportamento com papel real, sem depender de deparse.

## O que NÃO fiz e por quê
- Não mexi no hook `src/hooks/analytics/useGoalNotifications.ts` (área de telas/hooks). O contrato de banco fica pronto para o escritor do servidor: a policy "Block authenticated notification inserts" (WITH CHECK false, desde 20260404174629) torna a escrita server-only, então o INSERT do navegador continua negado — inclusive o mesmo aviso duplicado. Quem for ligar o aviso (RPC/Edge/service_role) já tem dedupe e `23505` como sucesso.
- A suíte de prova é `supabase/tests/*.sql` (arquivo permitido pelo cartão, mesmo molde de `supabase/tests/r2_db_022_provenance_trigger.sql`), que não precisa de passo no `db-guard.yml`. Não criei `.test.sh` novo para não reprovar em `check-test-inventory.mjs`.
