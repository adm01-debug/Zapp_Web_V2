Especialista: senior (area-sql-banco)

Escopo deste refazer final
- Rebaseei o ponto de partida obrigatório (`ff72ee82c90f`) na ponta atual da branch do dia e preservei o código SQL, o teste de banco e `src/integrations/supabase/types.ts` do trabalho anterior.
- A única alteração feita por mim nesta rodada final é este relato: removi a lista antiga incorreta de motivos e conferi as demais afirmações contra o diff atual.

Ponto 1: corrigir só o relato, removendo a afirmação de motivos que o diff não mostra.
- O que mudou: `.tmp/relato.md` agora declara a lista real aceita por `report_message`: `spam`, `improprio`, `urgencia` e `outro`; não toquei em SQL, teste de banco nem `src/integrations/supabase/types.ts` nesta rodada.
- Prova no diff: `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:124` define o CHECK com `('spam', 'improprio', 'urgencia', 'outro')`; `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:309` valida a mesma lista na RPC; `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql:53` reaplica a mesma validação na migration corretiva.
- Teste que prova: `scripts/db-audit/inbox-contact-authorization.test.sh:360-376` confere o CHECK com `improprio`, rejeita motivo inválido e insere `improprio` de ponta a ponta; `scripts/db-audit/inbox-contact-authorization.test.sh:382` executa `urgencia`; `bash scripts/db-audit/inbox-contact-authorization.test.sh` retornou `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS`.

Ponto 2: reler o relato linha por linha contra `git diff` e remover afirmação que o diff não mostre.
- O que mudou: mantive no relato apenas afirmações conferidas contra os arquivos do diff final e registrei as linhas exatas abaixo; a lista antiga incorreta não aparece mais no texto.
- Prova no diff: `git diff --name-only dia/2026-10-13...HEAD --` lista só `.tmp/relato.md`, `scripts/db-audit/inbox-contact-authorization.test.sh`, `src/integrations/supabase/types.ts`, `supabase/migrations/20261011125915_message_favorites_pins_reports.sql` e `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql`.
- Teste que prova: `search_files` pela lista antiga incorreta em `.tmp/relato.md` retornou 0 ocorrências; `zapp-verify . --rapido` retornou `VERIFY: VERDE SEM BANCO (99s)`.

Pontos do trabalho preservado que continuam cobertos pelo diff
1. `report_message` aceita o motivo do cartão (`improprio`) e rejeita motivo inválido.
   - Arquivos/linhas: `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:124,309`; `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql:53`; `scripts/db-audit/inbox-contact-authorization.test.sh:360-376`.
2. As RPCs e a função do gatilho ficam com `SET search_path = pg_catalog, public`, e `anon`/`PUBLIC` não mantêm EXECUTE.
   - Arquivos/linhas: `supabase/migrations/20261011125915_message_favorites_pins_reports.sql:162,200,256,297,347-355`; `supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql:26-41`; `scripts/db-audit/inbox-contact-authorization.test.sh:303-315`.
3. O teste de `anon` prova o motivo da falha nas 4 RPCs e nas 3 tabelas.
   - Arquivos/linhas: `scripts/db-audit/inbox-contact-authorization.test.sh:44-59` cria `expect_failure_matching`; `scripts/db-audit/inbox-contact-authorization.test.sh:309-315` confere `permission denied for function/table`.
4. A prova de supervisor usa o modelo real de papéis, sem depender de coluna `is_admin`.
   - Arquivos/linhas: `scripts/db-audit/inbox-contact-authorization.test.sh:132-141` consulta `public.user_roles`; `scripts/db-audit/inbox-contact-authorization.test.sh:162-164` dá a `U5` o papel `supervisor`; `scripts/db-audit/inbox-contact-authorization.test.sh:370-383` prova leitura e resolução como supervisor.

Aviso do juiz barato
- O primeiro fechamento avisou que `src/integrations/supabase/types.ts` é código alterado sem teste novo. Neste cartão final, esse arquivo é gerado e veio do ponto de partida obrigatório; a rodada atual não alterou tipos nem SQL. A prova de comportamento do diff preservado está em `scripts/db-audit/inbox-contact-authorization.test.sh`, executado contra PostgreSQL real e verde nesta rodada.
- O segundo fechamento avisou que `scripts/db-audit/inbox-contact-authorization.test.sh` não estaria em “ARQUIVOS QUE PODE TOCAR”. Não procede: o corpo do cartão libera “testes de banco”, e este arquivo é exatamente o teste de banco preservado do ponto de partida, com execução verde nesta rodada.

Arquivos no diff final (`git diff --name-only dia/2026-10-13...HEAD --`)
.tmp/relato.md
scripts/db-audit/inbox-contact-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011125915_message_favorites_pins_reports.sql
supabase/migrations/20261011151736_message_reports_reason_searchpath_fix.sql

Verificações executadas
- `bash scripts/db-audit/inbox-contact-authorization.test.sh` — exit 0; última linha: `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS`.
- `zapp-verify . --rapido` — `VERIFY: VERDE SEM BANCO (99s)`; banco local não verificado por falta de nome de conjunto, conforme saída do comando.
- `search_files` pela lista antiga incorreta em `.tmp/relato.md` — 0 ocorrências.
