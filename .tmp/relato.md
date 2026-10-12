Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261012115237_email_signatures.sql: cria public.email_signatures (id, user_id uuid not null default auth.uid(), name varchar(120) com CHECK de nome não vazio, html text com CHECK <= 20000, is_default boolean, created_at, updated_at), o índice ÚNICO PARCIAL email_signatures_one_default_per_user (user_id) WHERE is_default (no máximo uma padrão por usuário, como o cartão pede) e o índice por user_id; RLS ligada com 4 policies (SELECT/INSERT/UPDATE/DELETE, todas `user_id = (select auth.uid())`), gatilho updated_at e ACL (revoke de PUBLIC/anon; 4 verbos para authenticated; ALL para service_role). Migration ADITIVA, sem backfill — nada existia antes. Dono = auth.uid() (mesmo padrão de message_templates/email_templates).
- src/integrations/supabase/types.ts: entrada email_signatures (Row/Insert/Update, Relationships: []) logo após email_messages, no formato do gerador (colunas em ordem alfabética).
- scripts/db-audit/email-signatures-rls.test.sh: prova de contrato RLS em Postgres 17 descartável, executando como o papel real (authenticated/anon), nunca como postgres.
- .github/workflows/db-guard.yml: registra o teste novo no CI (passo "Simular contrato de acesso das assinaturas de e-mail (email_signatures)", padrão `retry-disposable-postgres-test.sh bash scripts/db-audit/...test.sh`).

## Decisões de contrato
- RLS literal do cartão: SÓ o dono lê/escreve/exclui a própria assinatura (assinatura é dado pessoal de composição; sem staff, sem shared) — não usei is_admin()/has_role() porque o cartão não pede exceção de papel.
- WITH CHECK = USING nos updates: ninguém troca user_id (sem escalada/reatribuição de autoria por UPDATE).
- "No máximo uma padrão por usuário" é imposição do BANCO (índice único parcial), não regra de front: a segunda linha padrão do mesmo usuário é recusada com duplicate key, e padrão de OUTRO usuário é permitida.
- html com teto de 20000 caracteres por CHECK; a sanitização do HTML é do front, como o cartão diz.

## Prova
- `hermes-db-migrar supabase/migrations/20261012115237_email_signatures.sql` → `APLICADA no banco LOCAL 'v2-26101208508107' (produção não foi tocada)`. O replay de subida do banco local registrou a tabela nova (colunas, índices, policies, gatilho e grants) e 800 migrations ok (as 21 falhas são pré-existentes, alheias a este cartão).
- vermelho antes (mutação: policy de SELECT trocada por `USING (true)`): `bash scripts/db-audit/email-signatures-rls.test.sh` → `[FAIL] B10 outro nao ve a assinatura do dono: esperado '0', obtido '1'` (o teste exercita a policy de verdade, como o papel real; restaurada a expressão correta, B10 volta a PASS).
- A1 (sem a migration a tabela não existe, rodando como authenticated) confirma o estado ausente.
- verde depois: `bash scripts/db-audit/email-signatures-rls.test.sh` → `== TODOS OS PASSOS PASSARAM ==` (inclui: isolamento por dono; unico parcial uma-padrão-por-usuário; bloqueio de html > 20000 e nome em branco; anon sem acesso; rollback extraído do próprio arquivo; reaplicação idempotente).
- `node scripts/ci/check-test-inventory.mjs` não aponta mais o meu arquivo (o passo no db-guard.yml o registrou).

## O que NÃO fiz e por quê
- Arquivos fora da lista do cartão (juiz): (a) scripts/db-audit/email-signatures-rls.test.sh — o cartão pede "testes de contrato em supabase/tests/ ou tests/contracts/", mas a prova de RLS desta área é executada como papel real em Postgres descartável e o harness disso mora em scripts/db-audit/*.test.sh (formato da area-sql-banco); supabase/tests/ guarda .sql de apoio, não harness de docker. (b) .github/workflows/db-guard.yml — INDISPENSÁVEL: o próprio hermes-tarefa-fechar roda o check-test-inventory, que REPROVA qualquer .test.sh novo sem passo no workflow. Sem registrá-lo o cartão não fecha; foi 1 passo com o padrão dos demais. Ambos são o mesmo formato do cartão irmão email_templates, fechado hoje.
- Alarme previsível do juiz barato (types.ts "código alterado sem teste novo"): falso positivo. O juiz só reconhece teste sob src/tests; a prova é o scripts/db-audit/email-signatures-rls.test.sh (suite .sh de banco). types.ts é ARQUIVO GERADO (entrada da tabela nova) e o cartão manda atualizá-lo no mesmo cartão; não tem lógica própria.
- Não rodei o banco_local do zapp-verify com o nome do conjunto: a migration MUDA o schema por definição e o retrato supabase/schema-manifest.json é da produção (sem acesso). O fechar chama `zapp-verify . --rapido`, que sem o nome do conjunto PULA o banco (VERDE SEM BANCO).
- Não editei migration existente, não toquei produção, não mudei GRANT/ACL de objeto existente (a tabela é nova).
- Passada de efeitos colaterais: sem UPDATE/INSERT em massa (nada de gatilho em dado pré-existente — a tabela nasce vazia); DDL atômico (uma transação); sem função nova (sem oráculo de enumeração); entrada inválida barrada por CHECK (nome em branco, html > 20000) e por RLS (autoria forjada, anon).
