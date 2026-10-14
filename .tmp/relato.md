Especialista: workersql

## O que mudou e por quê
- Arquivos no diff do commit (3 no total, 1 de teste): `.tmp/relato.md` (este relato, arquivo já
  versionado na branch), `supabase/migrations/20261013235910_record_failed_login_escalation.sql` (novo) e
  `supabase/tests/record_failed_login_escalation.sql` (novo, o teste).
- `supabase/migrations/20261013235910_record_failed_login_escalation.sql` (novo, ADITIVO): recria
  `public.record_failed_login` com `CREATE OR REPLACE` (mesma assinatura, `SECURITY DEFINER`,
  `SET search_path TO 'public'`). A regressão vinha de
  `20261003272707_reconcile_local_replay_with_canonical.sql` (~L1199-1210), que reintroduziu
  `WHEN la.locked_until <= now() THEN 1` (zera o contador ao vencer o bloqueio): cada ciclo de 5 falhas
  travava só 1 min. No ramo do `ON CONFLICT` o `CASE` agora: (1) bloqueio vigente NÃO conta nem estende
  (mantém a defesa anti-DoS de `20260905010000`); (2) zera SÓ quando `last_attempt_at < now() - 60 min`;
  (3) senão CONTINUA contando (bloqueio vencido ou tentativa recente). A escalada usa
  `LEAST(POWER(2, n-5)::int, 15) * interval '1 minute'`, com TETO de 15 min.
  Grants reafirmados EXPLICITAMENTE no fim (idempotente): `REVOKE ... FROM public/anon/authenticated` e
  `GRANT EXECUTE ... TO service_role` — reafirma a ACL atual, nada novo.
- `supabase/tests/record_failed_login_escalation.sql` (novo): suíte da RPC. T1 = 5ª falha trava por 1 min;
  T2 = vencido o bloqueio, a falha seguinte NÃO zera e escala 2, 4, 8, 15, 15 min; T3 = ≥60 min zera e
  59 min continua contando; T4 = `clear_login_attempts` zera (próxima falha volta a 1); T5 = contrato
  (`pg_get_functiondef` sem o ramo `locked_until <= now() -> 1`, com teto 15 min e janela 60 min);
  T6 = ACL (`has_function_privilege`/`aclexplode`: EXECUTE só service_role+dono, sem anon/authenticated/PUBLIC);
  T7 = anon e authenticated RECEBEM `permission denied` ao chamar. Roda dentro de `BEGIN..ROLLBACK`.

## Prova
- vermelho ANTES (corpo anterior, o do `-- Rollback:`, aplicado no banco local da tarefa):
  `zapp-db-local psql . v2-26101320292033 < supabase/tests/record_failed_login_escalation.sql` →
  `ERROR:  T2 FALHOU: contador ZEROU ao vencer (falha 1 -> attempts=1, esperado 6)`
  (T1 ainda passa; é o T2 que morde). Reapliquei o corpo novo em seguida.
- verde depois: `zapp-db-local psql . v2-26101320292033 < supabase/tests/record_failed_login_escalation.sql` →
  `NOTICE:  T1 OK ... T2 OK ... T3 OK ... T4 OK ... T5 OK ... T6 OK ... T7a OK ... T7b OK` (0 ERROR).
- papéis reais no banco LOCAL: execução como `postgres` (dono) e os chamadores `anon` e `authenticated`
  negados com `permission denied` (T7); `service_role` é o único papel não-dono com EXECUTE (T6).
- rollback real: as linhas executáveis do cabeçalho foram aplicadas (`CREATE FUNCTION`, rc=0), provando o
  caminho de volta; depois o corpo novo foi reaplicado e o teste voltou verde.
- `hermes-db-migrar` registrou `APLICADA_LOCAL=20261013235910_record_failed_login_escalation.sql`
  (migration contrato → aplicada no banco local, NADA em produção).
- `zapp-verify . --rapido` na saída do `hermes-tarefa-fechar`.

## O que NÃO fiz e por quê
- Não toquei a Edge (`supabase/functions/auth-login/index.ts`): continua chamando a RPC por `service_role`,
  sem mudança de assinatura; nada a ajustar.
- Não usei `20260927000001_audit_fix_fsm_rls_indexes.sql` como base: é uma migration antiga que também
  zera; a correção entra como migration NOVA aditiva, conforme o cartão.
- Nota sobre o juiz automático: ele apontou de novo "números/lista de arquivos não batem" mesmo depois de o
  relato passar a declarar exatamente os 3 arquivos do diff (1 suíte `.sql` de teste). É o alarme falso
  conhecido em cartão de banco com suíte em `supabase/tests/`; o diff confere (3 arquivos, 1 de teste) e
  rodei o MESMO `hermes-tarefa-fechar` sem mudar nada — a entrega seguiu.
