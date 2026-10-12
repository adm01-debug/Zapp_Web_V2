Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261012134705_qr_attempts.sql: cria `public.qr_attempts` (uma linha por tentativa de pareamento por QR), com `connection_id` FK -> `whatsapp_connections` ON DELETE CASCADE, `created_at` default now(), `expires_at`, `status` com domínio FECHADO ('pendente','conectado','expirado','erro', default 'pendente') e `reason`; índice (`connection_id, created_at desc`) e índice por `created_at` (retenção); RLS LIGADA com uma policy FOR ALL para STAFF (`is_admin_or_supervisor`), `revoke` de `anon`, grants para `authenticated` e `service_role`; função `public.qr_attempts_purge()` (security definer, 30 dias, só `service_role`). Sem isso não há onde auditar o QR (scan, tentativas, motivo da falha) nem onde fechar o ciclo do pareamento no banco.
- scripts/db-audit/qr-attempts-contract.test.sh: prova o defeito (ausência) e o contrato, com papel real (`SET ROLE authenticated`/`anon`), nunca como `postgres`.
- scripts/ci/check-test-inventory.mjs: registra o teste novo na ALLOWLIST (o passo de uma linha em `db-guard.yml` é promovido pelo dono do workflow) — sem isso o check-test-inventory reprova o teste como órfão.

## Prova
- vermelho antes: BLOCO A (`bash scripts/db-audit/qr-attempts-contract.test.sh`) -> `[PASS] A.1 (DEFEITO) public.qr_attempts NAO existe: nao ha onde auditar um QR` (o defeito é ausência: nada de QR auditável no banco).
- verde depois: `bash scripts/db-audit/qr-attempts-contract.test.sh` -> `A.1` + `B.1..B.23` + `C.1..C.2` todos `[PASS]`, linha final `PASS: TC qr_attempts — tabela com contrato do cartao, FK CASCADE, dominio de status fechado, RLS staff-only (usuario comum e anon barrados), retencao de 30 dias so por service_role, e rollback executavel.` Container `postgres:17-alpine` descartável.
- Bloco A versa o mesmo script em container novo com a migration real `supabase/migrations/20261012134705_qr_attempts.sql`; a migration também foi aplicada no banco LOCAL da tarefa: `hermes-db-migrar supabase/migrations/20261012134705_qr_attempts.sql` -> `APLICADA no banco LOCAL`.
- rollback EXECUTADO (BLOCO C): as duas instruções `--   drop ...` da 1ª linha do arquivo rodam de verdade e, ao fim, tabela e função não existem (`to_regclass`/`to_regprocedure` NULL).

O que o teste cobre: B.2 contrato do cartão (conexão/criado_em/expira_em/status/motivo); B.3/B.4 FK ON DELETE CASCADE; B.5 `connection_id` NOT NULL; B.6 RLS ligada; B.7 status fora do domínio recusado; B.8 default 'pendente'; B.9 `reason` NULL; B.10/B.11 staff (admin via user_roles) lê e escreve; B.12/B.13 usuário comum não lê e não escreve; B.14/B.15 `anon` sem grant; B.16-B.18 CASCADE leva o histórico ao apagar a conexão; B.19-B.21 retenção de 30 dias apaga a antiga (31 dias) e PRESERVA a recente; B.22/B.23 só `service_role` executa a purga.

## O que NÃO fiz e por quê
- `src/integrations/supabase/types.ts`: fora da minha área (`src/`). A tabela é nova e não mudei RETURNS existente; quem consumir (Edge/front, cartões próprios) regenera os tipos.
- Agendamento do cron da retenção (`cron.schedule`): aqui fica o mecanismo (`qr_attempts_purge`); o agendamento é do dono da infra/workflow, não deste cartão (documentado no COMMENT da função).
- `node scripts/ci/check-test-inventory.mjs` ainda acusa 4 testes órfãos PRÉ-EXISTENTES (department-invite-contract-audit-vocabulary, talkx-conversion-defaults, team-chat-media-contract, team-direct-conversation-race) — são de outros cartões, não deste diff; não os toquei (meu teste não aparece na lista).
