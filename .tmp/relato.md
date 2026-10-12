Especialista: senior (area-sql-banco)

Escopo deste refazer
- O cartão mandou corrigir SÓ O RELATO. Não alterei código nem migrations em relação à entrega recusada `ff72ee82c`; no escopo do cartão, `git diff --name-status ff72ee82c..HEAD -- .tmp/relato.md scripts/db-audit/inbox-contact-authorization.test.sh src/integrations/supabase/types.ts supabase/migrations/20261011125915_message_favorites_pins_reports.sql supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql` retornou só `M .tmp/relato.md`.
- Os arquivos de SQL, teste e types aparecem no diff contra `dia/2026-10-12` porque o trabalho anterior foi cherry-pickado para este workspace, como o cartão pediu. O commit de código/teste/migrations/types da entrega anterior é `a89845885`, cherry-pickado aqui como `91103de72`.
- O teste de banco é permitido pelo cartão em “ARQUIVOS QUE PODE TOCAR” (`testes de banco`) e é indispensável porque prova os pontos de anon/RPC/tabelas em PostgreSQL real.

Ponto 1 — item literal da recusa: “No Ponto 1, troque 'spam/abuse/harassment/improprio/other' pela lista real do diff: 'spam','improprio','urgencia','outro' (CHECK de message_reports.reason e validação em report_message).”
- O que mudei no relato: removi a lista errada `spam/abuse/harassment/improprio/other` e passei a citar a lista real `'spam','improprio','urgencia','outro'`.
- Onde o arquivo final comprova: `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:124` tem o CHECK com `('spam', 'improprio', 'urgencia', 'outro')`; `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:309` valida a mesma lista em `report_message`; `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql:53` mantém a lista na migration corretiva.
- Teste/prova: `scripts/db-audit/inbox-contact-authorization.test.sh:360-376` confere o CHECK, rejeita motivo inválido e insere relato real com `improprio`.

Ponto 2 — item literal da recusa: “Confira cada arquivo:linha citado contra o arquivo final e corrija os que não baterem (:124, :309, :92/:162/:200/:256/:297, :350-355, e as linhas do .test.sh).”
- O que mudei no relato: conferi e atualizei as citações para o arquivo final.
- Linhas conferidas: `20261011125915...sql:124` (CHECK de reason), `:309` (validação de reason em `report_message`), `:92/:162/:200/:256/:297` (`SET search_path = pg_catalog, public` no gatilho e nas 4 RPCs), `:350-355` (REVOKE/GRANT das RPCs), `scripts/db-audit/inbox-contact-authorization.test.sh:44-59` (`expect_failure_matching`), `:301-315` (anon nas 4 RPCs e 3 tabelas), `:360-376` (reason real) e `:370-383` (U5 supervisor).
- Prova adicional: `bash scripts/db-audit/inbox-contact-authorization.test.sh` executou SQL real e terminou verde.

Ponto 3 — item literal da recusa: “Corrija 'git diff --cached | wc -c = 45213 bytes': o diff do cartão tem cerca de 54 mil bytes.”
- O que mudei no relato: removi o valor antigo `45213 bytes` e substituí pela medida real desta rodada.
- Prova medida agora: `git diff dia/2026-10-12...HEAD -- | wc -c` retornou `56627` bytes.
- Observação: esta contagem inclui o relato versionado em `.tmp/relato.md`, por isso fica em torno de 54–56 mil bytes, como a recusa indicou.

Ponto 4 — item literal da recusa: “Declare que scripts/db-audit/inbox-contact-authorization.test.sh foi alterado (o FATO MEDIDO diz 'nenhum arquivo de teste alterado' e o relato precisa explicar a divergência).”
- O que mudei no relato: declarei explicitamente que `scripts/db-audit/inbox-contact-authorization.test.sh` está no diff final e é o único arquivo de teste alterado.
- Por que é permitido/indispensável: o cartão permite “testes de banco”; o arquivo prova em PostgreSQL 17 real as 4 RPCs, as 3 tabelas, `anon`, U5 supervisor, oráculo e rollback.
- Prova medida agora: `git diff --stat dia/2026-10-12...HEAD --` mostra 5 arquivos no diff final, incluindo 1 arquivo de teste (`scripts/db-audit/inbox-contact-authorization.test.sh`).

Ponto 5 — item literal da recusa: “Em 'Ponto 1..5', cite literalmente cada item da recusa anterior que está sendo respondido. Não altere código nem migrations.”
- O que mudei no relato: este relato agora tem Ponto 1 a Ponto 5, cada um começando com o item literal da recusa e respondendo com arquivo:linha e prova.
- Prova de que não alterei código/migrations nesta rodada em relação à entrega recusada: `git diff --name-status ff72ee82c..HEAD -- .tmp/relato.md scripts/db-audit/inbox-contact-authorization.test.sh src/integrations/supabase/types.ts supabase/migrations/20261011125915_message_favorites_pins_reports.sql supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql` retornou só `M .tmp/relato.md`.
- Prova de que o diff final contém só o trabalho deste cartão contra a branch do dia: `git diff --name-only dia/2026-10-12...HEAD --` lista exatamente os cinco arquivos abaixo.

Arquivos no diff final (`git diff --name-only dia/2026-10-12...HEAD --`):
.tmp/relato.md
scripts/db-audit/inbox-contact-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011125915_message_favorites_pins_reports.sql
supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql

Verificações executadas nesta rodada
- `bash scripts/db-audit/inbox-contact-authorization.test.sh` — exit 0; última linha: `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS`.
- `git diff dia/2026-10-12...HEAD -- | wc -c` — `56627`.
- `git diff --stat dia/2026-10-12...HEAD --` — 5 arquivos, incluindo 1 arquivo de teste de banco.
- `git diff --name-status ff72ee82c..HEAD -- .tmp/relato.md scripts/db-audit/inbox-contact-authorization.test.sh src/integrations/supabase/types.ts supabase/migrations/20261011125915_message_favorites_pins_reports.sql supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql` — só `M .tmp/relato.md`.
- Busca no diff pelo identificador do banco real — sem ocorrência.
