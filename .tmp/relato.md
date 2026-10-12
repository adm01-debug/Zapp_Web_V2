Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011181949_warroom_alerts_resolve.sql`: mantive a entrega anterior, mas fechei os pontos da recusa: a RPC `warroom_alerts_summary` agora exige `auth.uid()` e `is_admin_or_supervisor`, as colunas `resolved_at/resolved_by/resolution_note` foram blindadas por gatilho contra `UPDATE` direto, e o rollback documentado remove também gatilho/função de blindagem.
- `supabase/tests/warroom_alerts_resolve.sql`: acrescentei prova SQL real para o gatilho, para o bloqueio de `UPDATE resolved_*` direto, para `warroom_alerts_summary` negando atendente/anônimo, e para `search_path` fixo nas funções novas.
- `src/integrations/supabase/types.ts`: atualizei apenas os tipos das colunas/RPCs novas de warroom, sem trazer a alteração alheia de `toggle_team_reaction`/`transfer_conversation` que existia no commit anterior.

## Pontos do revisor
- Ponto 1: `warroom_alerts_summary` estava exposta para qualquer `authenticated`. Corrigi em `supabase/migrations/20261011181949_warroom_alerts_resolve.sql` com a mesma checagem de `resolve_warroom_alert`: sem sessão lança `not_authenticated`; não-admin/supervisor lança `not_authorized`. Teste: `supabase/tests/warroom_alerts_resolve.sql` cobre atendente e anônimo na seção `warroom_alerts_summary (janela)`.
- Ponto 2: a entrega anterior permitia `UPDATE` direto de `resolved_at/resolved_by/resolution_note`, forjando resolução sem auditoria. Corrigi com `public.prevent_direct_warroom_alert_resolution_update()` e trigger `trg_prevent_direct_warroom_alert_resolution_update`; a RPC liga o marcador local só durante o `UPDATE` dela. Teste: seção `update direto de resolved_* e recusado` executa `UPDATE` como admin autenticado e exige erro `resolution_update_not_allowed`.
- Ponto 3: os testes não provavam os buracos de segurança. Ampliei `supabase/tests/warroom_alerts_resolve.sql` para executar o SQL no Postgres descartável, checar `search_path`, existência do gatilho/função, negação de `UPDATE` direto e negação de summary para atendente/anônimo.
- Ponto 4: rollback incompleto. A linha `-- Rollback:` agora lista `drop trigger`, `drop function public.prevent_direct_warroom_alert_resolution_update()`, as duas RPCs, índices, constraint e colunas novas. Provei com `.tmp/test_rollback_warroom_alerts_resolve.sql`, que aplica a migration, roda o rollback e valida que o schema basal voltou.
- Ponto 5: diff alheio/tipos. Não trouxe `.tmp/relato.md` do commit anterior e removi a alteração alheia em `types.ts`; o diff final ficou só em migration, teste SQL e tipos correspondentes às colunas/RPCs de warroom.

## Prova vermelho → verde
- Vermelho antes: `bash .tmp/run-warroom-sql-test.sh /repo/.tmp/red-migrations` executando os testes novos contra a migration anterior (`61b76fe16`) falhou em `ERROR: function "public.prevent_direct_warroom_alert_resolution_update()" does not exist`, provando que a blindagem não existia.
- Verde depois: `bash .tmp/run-warroom-sql-test.sh` retornou `OK: warroom_alerts_resolve (estrutura, permissao, resolucao com auditoria, idempotencia, contagens)`.
- Rollback verde: `bash .tmp/run-warroom-sql-test.sh /repo/supabase/migrations /repo/.tmp/test_rollback_warroom_alerts_resolve.sql` retornou `OK: rollback warroom_alerts_resolve restaurou schema basal`.
- Typecheck verde: `bun run typecheck` retornou `tsc -b --force` com exit code 0.

## Arquivos do diff
- `.tmp/relato.md`
- `src/integrations/supabase/types.ts`
- `supabase/migrations/20261011181949_warroom_alerts_resolve.sql`
- `supabase/tests/warroom_alerts_resolve.sql`

## Verificações executadas
- `git diff --check` / `git diff --cached --check`: sem saída e exit code 0 antes do commit.
- `git diff --stat dia/2026-10-11...HEAD` e `git diff --name-only dia/2026-10-11...HEAD`: conferidos antes de fechar; só os arquivos listados acima ficaram no diff.
- `git log --oneline dia/2026-10-11..HEAD`: só o commit deste refazer.

## O que NÃO fiz
- Não rodei produção, push, PR, deploy nem banco remoto.
- `hermes-db-migrar supabase/migrations/20261011181949_warroom_alerts_resolve.sql` não foi usado como prova porque a chamada local ficou presa no `zapp-db-local` compartilhado e estourou timeout; substituí por Postgres descartável em Docker, executando a migration e os testes reais de SQL.