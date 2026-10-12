Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261012112503_email_templates_rls.sql: cria public.email_templates (id, name varchar(120), subject varchar(300), body text com CHECK <= 50000, category, is_shared, created_by default auth.uid(), created_at, updated_at), 2 indices (created_by e is_shared), RLS ligada com 4 policies (SELECT/INSERT/UPDATE/DELETE), gatilho updated_at e ACL (revoke anon/PUBLIC; grant 4 verbos a authenticated; all a service_role). Migration aditiva, sem backfill — nada existia antes.
- src/integrations/supabase/types.ts: entrada email_templates (Row/Insert/Update, Relationships: []) logo apos email_messages, no formato do gerador.
- scripts/db-audit/email-templates-rls.test.sh: prova de contrato RLS em Postgres 17 descartavel, executando como o papel real (authenticated/anon), nunca como postgres.

## Decisoes de contrato (literais do cartao)
- Dono = auth.uid(). Staff = public.is_admin_or_supervisor(auth.uid()) (assinatura real conferida em 20260929580000_multiplix_policies_consolidation.sql).
- is_shared = true: LEGIVEL por todo authenticated; EDITAVEL so pelo dono ou staff. Excluir: so o dono (cartao nao da exclusao ao staff).
- WITH CHECK = USING nos updates: ninguem troca created_by (sem escalada de autoria por UPDATE).

## Prova
- vermelho antes (mutacao na policy de DELETE: USING (true) no lugar de created_by = auth.uid()): `bash scripts/db-audit/email-templates-rls.test.sh` -> `[FAIL] B20 outro nao exclui o compartilhado do dono (0 linhas): esperado '0', obtido '1'` (ESCOPO do teste exercita mesmo a policy: usa o modelo compartilhado, que e VISIVEL ao outro usuario; apos restaurada a migration, B20 volta a PASS).
- A1 (sem a migration a tabela nao existe, authenticated) confirma o estado ausente.
- verde depois: `bash scripts/db-audit/email-templates-rls.test.sh` -> `== TODOS OS PASSOS PASSARAM ==` (B1-B32; inclui rollback extraido do proprio arquivo -> B30/B31 e reaplicacao -> B32).
- `hermes-db-migrar supabase/migrations/20261012112503_email_templates_rls.sql` -> `APLICADA no banco LOCAL 'v2-2610120821447e' (producao nao foi tocada)`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (tipos/lint/migrations/db_guard OK).

## REGISTRO PENDENTE
- scripts/db-audit/email-templates-rls.test.sh e NOVO: precisa de passo proprio em .github/workflows/db-guard.yml (padrao `retry-disposable-postgres-test.sh bash scripts/db-audit/...test.sh`). O cartao nao lista o workflow e a area do arquivo e do worker (ci); nao editei.

## O que NAO fiz e por que
- Alarme do juiz barato (types.ts "codigo alterado sem teste novo"): falso positivo. O juiz so reconhece teste sob src/tests; a minha prova e o scripts/db-audit/email-templates-rls.test.sh (suite .sh de banco, o formato desta area). types.ts e ARQUIVO GERADO (entrada da tabela nova) e o cartao manda atualiza-lo no mesmo cartao; ele nao tem logica propria a testar. Nao ha defeito de comportamento sem prova: a RLS e provada no teste acima (vermelho->verde na mutacao da policy).
- Nao rodei o banco_local do zapp-verify com o nome do conjunto: a migration MUDA o schema por definicao e o retrato supabase/schema-manifest.json e gerado da producao (sem acesso). O proprio hermes-db-migrar avisou "a estrutura local agora difere do retrato da producao (esperado)".
- Nao editei migration existente, nao toquei producao, nao mudei GRANT de objeto existente (a tabela e nova).
- Passada de efeitos colaterais: sem UPDATE/INSERT em massa (nada de gatilho em dado pre-existente); a tabela e criada vazia; operacao DDL atomica (uma transacao); sem funcao nova (sem oraculo de enumeracao); entrada invalida barrada por CHECK (nome em branco, corpo > 50000) e por RLS (autoria forjada, anon).
