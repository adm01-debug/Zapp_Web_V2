Especialista: workersql

## O que mudou e por quê
- supabase/migrations/20261013230008_security_acl_alerts_monitor.sql (novo): cria public.security_acl_alerts (id; alert_type=tipo; object_name=objeto; role_name+privilege=identidade do alerta aberto; severity; details SEM dado pessoal; detected_at=criada_em; resolved_at=resolvida_em; resolved_by), com RLS ligada, REVOKE de PUBLIC/anon/authenticated e GRANT só de SELECT p/ authenticated; a policy de leitura usa public.is_admin(auth.uid()) — nenhuma outra mudança de GRANT, papel ou ACL. Cria public.score_security_acl() SECURITY DEFINER com SET search_path, que vigia as 5 regressões pedidas (SECDEF com EXECUTE p/ anon/PUBLIC; SECDEF sem search_path; tabela sem RLS; policy de escrita USING(true)/WITH CHECK(true) p/ authenticated; bucket de storage público). Grava com índice único PARCIAL (alert_type,object_name,role_name,privilege) WHERE resolved_at IS NULL + INSERT ... ON CONFLICT DO NOTHING (não repete alerta aberto) e resolve sozinho o que voltou ao normal (resolved_by=score_security_acl). Agendada no pg_cron de hora em hora (:23), de forma idempotente. Migration aditiva, com `-- Rollback:` executável no topo.
- scripts/db-audit/pg-cron-jobs-baseline.json: registra o job novo `security-acl-score` ('23 * * * *').
- supabase/tests/security_acl_alerts_monitor.sql (novo): a prova (roda no banco local da tarefa, numa transação que termina em ROLLBACK, sem efeito colateral).

## Prova (banco LOCAL da tarefa, papéis reais anon/authenticated/service_role)
- Aplicação: `hermes-db-migrar supabase/migrations/20261013230008_security_acl_alerts_monitor.sql` → `APLICADA no banco LOCAL 'v2-26101306030666' (produção não foi tocada)`.
- VERDE: `zapp-db-local psql . v2-26101306030666 < supabase/tests/security_acl_alerts_monitor.sql` → linha final `t_9dce259e: TODAS as assercoes passaram.` (exit 0). Cada bloco força UMA violação e lê o alerta: SECDEF_ANON_EXECUTE (papel PUBLIC e papel anon) e SECDEF_SEM_SEARCH_PATH; TABELA_SEM_RLS; POLICY_ESCRITA_LIBERADA; BUCKET_PUBLICO. Idempotência (2ª rodada mantém 1 alerta aberto e o detected_at intacto), resolução automática (resolved_by=score_security_acl) e reincidência (alerta NOVO, id diferente). Controle negativo: SECDEF com search_path e EXECUTE só para papéis comuns NÃO gera alerta (prova que a suíte não é tautológica).
- RLS/papel real na tabela (mesma suíte): anon NÃO lê (ERROR 42501, sem GRANT), authenticated não-admin vê 0, authenticated admin vê os alertas, authenticated NÃO escreve, anon/authenticated NÃO executam score_security_acl, service_role executa.
- Rollback de verdade: dentro da prova, as 3 linhas do cabeçalho derrubam job+função+tabela (asserções H1–H3) e, após o ROLLBACK, tabela/função/job voltam de pé.
- VERMELHO: a mesma suíte com `-v sem_monitor=1` → `ERROR: t_9dce259e FALHOU [T0 tabela existe]: esperado security_acl_alerts, obtido <NULL>` (exit 3).
- Baseline: `node --test scripts/db-audit/pg-cron-jobs-baseline.test.mjs` → `pass 12 / fail 0`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK). As 2 primeiras tentativas morreram no passo tipos por OOM do tsc (exit 137, pool 'pesado' cheio; `jev-juiz falha` classificou como ambiente); na 3ª, com vaga no pool, tipos passou.

## O que NÃO fiz e por quê
- Não criei workflow/CI novo: o cartão limita os arquivos a migration, baseline e supabase/tests; ligar a suíte ao workflow é do worker (ci).
- Não corrigi as violações pré-existentes que o monitor passa a acusar no banco local (buckets públicos e policies de escrita permissivas em public.department_invites): o cartão é o MONITOR, não a correção; mexer em GRANT/ACL de objeto existente exige decisão do dono.
- Nada foi para produção; quem aplica a migration é o Joaquim. O baseline reflete produção — o job novo passa a valer lá quando a migration for aplicada.
