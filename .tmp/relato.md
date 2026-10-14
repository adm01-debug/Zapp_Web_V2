Especialista: semisenior (area-sql-banco)

[refazer 1] messages sem escrita direta do cliente — resposta ponto a ponto a recusa do revisor (13/10/2026).

Ponto 1 — envio normal pela RPC como agente passa com a migration aplicada.
Mudei: criei supabase/tests/messages_fluxos_legitimos_jwt_agente.sql (provas P0/P1/P2).
Prova: banco local msgwrite261012 (zapp-db-local up, 802 migrations, APLICADA_LOCAL
20261012151936, conjunto reconstruido do zero apos a edicao de comentario),
SET ROLE authenticated + request.jwt.claims com sub de profile agente real
(permissao send_messages, contato assigned_to visivel, conexao connected):
P1-enqueue-agente PASS (linhas=1 status=sending); P0 PASS (enqueue/claim/complete/fail
sao postgres/SECURITY DEFINER, a trigger nova nao as barra); P2-claim-service_role
PASS, P2-complete-service_role PASS, P2-status-sent PASS (status=sent).
Sensibilidade: P1N-enqueue-sem-permissao PASS (42501 send_messages_permission_required
sem a permissao); P1N2-insert-direto PASS (42501, escrita direta segue negada).
Comando: zapp-db-local psql . msgwrite261012 -v ON_ERROR_STOP=1 < supabase/tests/messages_fluxos_legitimos_jwt_agente.sql
Resultado: TODAS AS PROVAS PASSARAM, 14/14 (rodado 2x: antes e depois da reconstrucao do conjunto).

Ponto 2 — suite de testes de RLS existente continua verde.
Mudei: nada no codigo; rodei as suites vigentes que cobrem enqueue/entrega/RLS.
Provas (comando + ultima linha, exit 0 nas tres):
- bash scripts/db-audit/send-messages-permission-authorization.test.sh
  [OK] contrato de autorizacao do send_messages na RPC de enfileiramento verificado
- bash scripts/db-audit/enqueue-connection-scope.test.sh
  [OK] contrato de escopo de conexao no enfileiramento verificado
- bash scripts/db-audit/message-delivery-phase1-behavior.test.sh
  [OK] Message delivery phase 1: authz, structural contracts, token-bound replay, expired leases, concurrency, rollback and compatibility validated on PostgreSQL 17.
Tentativa honesta registrada: scripts/db-tests/run-all.mjs via REST local falha nos
5 arquivos por incompatibilidade previa runner-vs-suite (multi-statement, seed
stale em 02-contacts.phone, sintaxe em 03) — sem relacao com esta migration;
nao usei esse numero no lugar da suite.

Ponto 3 — marcar como lida refeito com claims de agente que enxerga o contato.
Mudei: prova P3 no mesmo arquivo novo (UPDATE is_read com JWT do agente cujo
assigned_to enxerga o contato).
Prova: P3-is_read-com-claims PASS (ROW_COUNT=1, esperado 1); P3R-is_read-sem-claims
PASS (ROW_COUNT=0 sem JWT — a RLS filtra, ou seja, a prova anterior sem claims era
vacua e esta nao e); P3N-update-status-direto PASS (42501).
Mesmo comando do ponto 1, mesmo resultado 14/14.

Ponto 4 — grants anon/PUBLIC auditados; rollback fiel sem devolver o que nunca existiu.
Mudei: comentario no bloco de Rollback de
supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql
(3 linhas, zero mudanca de comportamento).
Prova: catalogo local pos-migration (P4-grants-anon-public PASS,
linhas_de_grant_para_anon_ou_PUBLIC=0) + grep nas 800+ migrations mostra que nenhuma
jamais concedeu anon/PUBLIC em messages (so o comentario de rollback citava
authenticated). Bloco de Rollback executado de verdade no banco local dentro de
transacao com ROLLBACK ao fim: grants=2 (INSERT+UPDATE devolvidos a authenticated),
policy_insert=1 (policy original recriada), trigger_status=0, func_status=0.
Stack confirmado intacto depois (grants indevidos=0, trigger nova=1).
T1-T7 (suite anterior) re-rodada com o arquivo de migration editado em Postgres
descartavel: "messages_sem_escrita_direta_do_cliente: TODAS as assercoes passaram (T1-T7)".

Arquivos (git diff --name-only dia/2026-10-12...HEAD, apos meu commit):
supabase/migrations/20261012151936_messages_sem_escrita_direta_do_cliente.sql
supabase/tests/messages_fluxos_legitimos_jwt_agente.sql
.tmp/relato.md

Verificacao:
- zapp-db-local up . msgwrite261012 (pos-edicao): exit 0, TRAVAS conferidas
  (DNS da producao preso, agendador desligado, pg_net sem envio).
- zapp-verify . msgwrite261012 --rapido: OK db_guard, tipos, lint, migrations,
  travas. banco_local FALHOU pela regra estrita (sem registro da producao legivel
  por agente): 132 diferencas do retrato, todas pre-existentes da base
  (department_invitations, reminders, user_settings, team_messages etc.); desta
  migration, so as intencionais (grants de tabela INSERT/UPDATE ausentes no local,
  7 column-grants e trg_guard_message_status_fields presentes). Minha edicao e
  comentario + arquivo novo de teste: efeito zero no catalogo.
- bun run test:contracts nao se aplica (diff so em supabase/, nenhum contrato de
  front/Edge alterado).
