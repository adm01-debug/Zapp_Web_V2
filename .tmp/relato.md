Especialista: senior (area-sql-banco)

Escopo deste refazer final
- O SQL aprovado pelo revisor foi preservado da branch indicada (`v2/refazer-2-message-favoritos-fixar-report-26101116467292`, commit 6f92fff6d2e4).
- A única correção adicional depois do juiz barato foi reforçar o teste de `anon` em `scripts/db-audit/inbox-contact-authorization.test.sh`; esse arquivo é indispensável porque o próprio Ponto 3 da recusa exige prova nas 4 RPCs e nas 3 tabelas, e sem mudar o teste a entrega continuava só provando “falhou” sem provar o motivo.
- O arquivo extra `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql` permanece porque é parte do trabalho aprovado no parecer anterior: ele corrige `report_message` já aplicada em ambiente que recebeu a migration original e torna o rerun seguro.

Ponto 1 — `report_message` deve aceitar e documentar o motivo exato do cartão (`improprio`).
- O que ficou no diff: `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:124` inclui `improprio` no CHECK; `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:309` testa `spam/abuse/harassment/improprio/other`; `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql:40` mantém `improprio` na validação da RPC corretiva.
- Prova verde: `bash scripts/db-audit/inbox-contact-authorization.test.sh` retornou 0 e passou por `relato com motivo invalido (22023)`, `oraculo do report` e contrato completo de `report_message`.

Ponto 2 — travar `search_path` e permissões das 4 RPCs e do gatilho, sem deixar `PUBLIC/anon` executar.
- O que ficou no diff: `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:92`, `:162`, `:200`, `:256` e `:297` definem `SET search_path = pg_catalog, public`; `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql:27-41` reaplica o travamento das 4 RPCs, do gatilho `message_pins_force_contact_id` e de `report_message`; `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:350-355` concede EXECUTE só para `authenticated, service_role`.
- Prova verde: o teste executa SQL real em PostgreSQL 17 e valida `pg_proc.proconfig`, `routine_privileges`, `has_function_privilege` e falhas de `anon`.

Ponto 3 — `anon` deve ser testado nas 4 RPCs e nas 3 tabelas provando o motivo da falha.
- O que mudei agora: `scripts/db-audit/inbox-contact-authorization.test.sh:44-59` adiciona `expect_failure_matching`; `scripts/db-audit/inbox-contact-authorization.test.sh:301-307` usa esse helper nas 4 RPCs (`toggle_message_favorite`, `pin_message`, `unpin_message`, `report_message`) e nas 3 tabelas (`message_favorites`, `message_pins`, `message_reports`) conferindo `permission denied for function/table`.
- Prova verde: `bash scripts/db-audit/inbox-contact-authorization.test.sh` retornou 0 e mostrou `[PASS] anon sem EXECUTE ...` para as 4 RPCs e `[PASS] anon sem SELECT ...` para as 3 tabelas.

Ponto 4 — prova de supervisor/admin (`U5`) deve passar pelo modelo real de papéis.
- O que ficou no diff: `scripts/db-audit/inbox-contact-authorization.test.sh:132-141` define `is_admin_or_supervisor` consultando `public.user_roles`; `scripts/db-audit/inbox-contact-authorization.test.sh:162-164` dá a `U5` o papel real `supervisor`; `scripts/db-audit/inbox-contact-authorization.test.sh:369-372` prova resolver relato como supervisor sem depender de coluna inexistente `is_admin`.
- Prova verde: `bash scripts/db-audit/inbox-contact-authorization.test.sh` retornou 0 e passou por `resolver carimbando outro revisor` e `resolver sem carimbar resolved_by`.

Ponto 5 — relato precisa estar por ponto, com arquivo/linha e prova, não só “passei”.
- O que mudei: este relato foi reescrito no formato ponto a ponto da recusa, com arquivo/linha e prova real por ponto.
- Observação sobre o aviso do juiz barato: ele disse que “o relato não consta no diff”; deixei a justificativa explícita aqui e mantive `.tmp/relato.md` no commit final para o revisor enxergar o texto.
- Prova verde do texto: `git diff --name-only dia/2026-10-12...HEAD --` lista a entrega final abaixo, incluindo `.tmp/relato.md`.

Arquivos no diff final (`git diff --name-only dia/2026-10-12...HEAD --`):
.tmp/relato.md
scripts/db-audit/inbox-contact-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011125915_message_favorites_pins_reports.sql
supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql

Verificações executadas
- `bash scripts/db-audit/inbox-contact-authorization.test.sh` — exit 0; última linha: `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS`.
- `git diff --stat dia/2026-10-12...HEAD --` — diff do cartão, sem arquivo de outro cartão.
- `git diff --cached -- | wc -c` antes do commit inicial — 45213 bytes, abaixo do limite de 90000.
- Busca no diff pelo identificador do banco real — sem ocorrência.
- `hermes-tarefa-fechar "fix(db): favoritar fixar reportar mensagem com relato ponto a ponto" .tmp/relato.md` será rodado em seguida e é a verificação de saída (`zapp-verify --rapido`).
