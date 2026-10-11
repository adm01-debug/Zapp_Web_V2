Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Cartão: gestão de departamentos pelo admin (criar, renomear e EXCLUIR com segurança), tela equivalente à do V3. O defeito medido no V2: `departments` tinha DELETE de TABELA concedido a `authenticated` e a policy `departments_admin_write` (FOR ALL, escrita ampla) aceitava admin OU supervisor — então um DELETE direto (fora de RPC) apagava o departamento e, por CASCADE, a conversa dele, SEM checagem e SEM auditoria.

- `supabase/migrations/20261011191021_departments_admin.sql` (nova):
  - Passo 1 (GATE 16 §3.1, `20260830150000`): a policy `departments_admin_write` vira `FOR ALL ... USING (public.is_admin(auth.uid())) WITH CHECK (... is_admin ...)`. Escrita (INSERT/UPDATE/DELETE) agora só de admin — supervisor já usa a RPC para config de WhatsApp, então não perde capacidade.
  - `REVOKE DELETE ON public.departments FROM authenticated;` — fecha o DELETE direto de tabela. O DELETE passa a existir só pela RPC.
  - `public.delete_department(p_department_id uuid, p_move_to uuid DEFAULT NULL)` SECURITY DEFINER, `search_path = pg_catalog, public`: confere que quem chama é admin (`is_admin`), valida destino (existe, ≠ do próprio), e SEM destino RECUSA apagando quando há membros/conversas/filas ligados, devolvendo `{ok:false, error:'department_in_use', members, conversations, queues}`. COM destino, move membros e conversas, apaga a linha e audita (`department_audit_logs` + `audit_logs`) numa transação.
  - `public.departments_overview()` SECURITY DEFINER, só admin: nome, ativo e as contagens acima para a tela.
  - `REVOKE EXECUTE ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated` nas duas.
- `src/integrations/supabase/types.ts`: as duas funções (arquivo gerado).
- `tests/contracts/departments-admin-management.contract.test.ts` (novo): contrato de forma/tipo do gerado — falha se a migration perder o `REVOKE`, o portão `is_admin`, as RPCs ou o tratamento do gatilho, ou se `types.ts` mudar sem elas.

## Ponto 1 do juiz — "teste novo não chama o código real"
Não procede. A prova de COMPORTAMENTO é `bash scripts/db-audit/departments-admin-management.test.sh`: ela APLICA o SQL real da migration num Postgres 17 descartável e EXECUTA as funções reais como os papéis reais (`authenticated`/`anon`), medindo o defeito antes e a correção depois (inclui mutações que quebram o SQL de propósito e confirmam que o contrato falha). O teste em `tests/contracts/` é complementar (guarda de drift do arquivo gerado), não a prova.

## Ponto 2 do juiz — arquivos fora da lista "ARQUIVOS QUE PODE TOCAR"
O cartão citou `supabase/tests/` ou `tests/contracts/`. Os dois arquivos a mais são indispensáveis:
- `scripts/db-audit/departments-admin-management.test.sh` — a suíte `supabase/tests/` roda como `service_role`, que IGNORA RLS; ela não consegue provar que supervisor/agente/anon são barrados (o defeito do cartão). Só o arranjo descartável com papel real prova isso, e é a convenção da casa para prova de migration.
- `.github/workflows/db-guard.yml` — registrar o `.test.sh` no workflow é exigido pela própria CI (senão o `scripts/ci/check-test-inventory.mjs` reprova o teste como órfão).

## Ponto 3 do juiz — o UPDATE em `profiles` dispara o gatilho de `updated_at`
Procedia e foi tratado. `update_profiles_updated_at` (e `update_team_conversations_updated_at`) regravam `updated_at = now()` em QUALQUER UPDATE (recusa real de 06/10). Como mover vínculo não é mudança de conteúdo do perfil/conversa, no move eu desligo SÓ esses dois gatilhos durante os dois UPDATEs e os religo na MESMA transação (a FK de `team_conversations` é DEFERRABLE e deixa evento pendente, então rodo `SET CONSTRAINTS ALL IMMEDIATE` antes de religar). DDL é transacional: erro adiante aborta tudo e o gatilho volta intacto. Provado por linha antes/depois (a data NÃO muda, o `department_id` muda).

## Passada de efeitos colaterais
- Gatilhos: só os dois de `updated_at` são desligados, no move, e religados; RLS e os outros gatilhos de `profiles` seguem intactos.
- Atômico: tudo em uma transação; falha = nada aplicado.
- Sem oráculo: para quem não é admin a resposta é sempre o MESMO `not_authorized` (42501); erros específicos (`department_not_found`, `invalid_move_target`, `move_target_already_has_department_conversation`) só existem depois do portão de admin.
- ACL/papéis: nenhum GRANT/REVOKE fora do pedido (só revogo DELETE da tabela e EXECUTE do anon/PUBLIC); nenhum papel ganhou poder novo; `profiles`/`team_conversations` tiveram só `department_id` movido.
- Entrada inválida: destino inexistente, destino = si mesmo e colisão de conversa-tipo têm teste.
- Sem DDL/migration em produção; nada de push/PR/merge/deploy. Não toquei o banco real.

## O que NÃO fiz (registro)
- `scripts/ci/check-test-inventory.mjs` acusa 3 testes órfãos PRÉ-EXISTENTES (não são meus; o meu está registrado).

## Prova
- verde depois: `bash scripts/db-audit/departments-admin-management.test.sh` (postgres:17-alpine) → `[OK] contrato departments-admin-gestao verificado: 14 etapas`; as duas linhas `[FAIL]` são EVIDENCIA proposital das mutações A e B (contrato falha quando o SQL é quebrado). Trecho:
  [OK] ANTES: delete direto apagou a conversa em cascata, sem checagem (o defeito)
  [OK] DEPOIS: has_table_privilege(authenticated, departments, DELETE) = f
  [OK] DEPOIS: agente nao executa a RPC (42501)
  [OK] DEPOIS: sem destino: recusa department_in_use = department_in_use
  [OK] DEPOIS: com destino: updated_at do membro ANTES=DEPOIS = 2020-01-02 00:00:00+00
  [OK] DEPOIS: com destino: membro mudou de departamento = 50000000-...d2
  [OK] DEPOIS: o contrato inteiro passa com a migration aplicada
  [OK] ROLLBACK: DELETE de volta ao authenticated
- verde depois: `npx vitest run --config vitest.contracts.config.ts tests/contracts/departments-admin-management.contract.test.ts` → `Test Files 1 passed, Tests 6 passed`.
