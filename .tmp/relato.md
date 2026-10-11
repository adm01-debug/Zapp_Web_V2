Especialista: workersql (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261011181949_warroom_alerts_resolve.sql (nova): colunas `resolved_at` (timestamptz), `resolved_by` (uuid references profiles) e `resolution_note` (limite 500 via CHECK `warroom_alerts_resolution_note_len`); índices `idx_warroom_alerts_created_at` e `idx_warroom_alerts_active` (parcial, `where resolved_at is null`); RPCs `resolve_warroom_alert(uuid,text)` e `warroom_alerts_summary(interval)`, ambas SECURITY DEFINER, `search_path = pg_catalog, public`, com checagem de `auth.uid()`; `REVOKE ... FROM public, anon` e `GRANT EXECUTE` só para `authenticated`; auditoria por `log_audit_event` SEM o texto da nota (grava só `note_length`). Motivo direto do cartão: o War Room só marcava `is_read`; faltava "resolver" e histórico (lacuna de paridade V3→V2, AdminAlertHistoryPage.tsx).
- supabase/tests/warroom_alerts_resolve.sql (nova): suíte de contrato que aplica a migration VERBATIM (`\i`) num Postgres descartável e exercita as RPCs sob os papéis REAIS (`set_config('role', ...)` + JWT), nunca como postgres.
- src/integrations/supabase/types.ts: tipos gerados atualizados (3 colunas em warroom_alerts + as 2 RPCs).
- Efeitos colaterais conferidos: nada de DML/UPDATE em massa na migration (logo, nenhum gatilho de `updated_at` é disparado); a resolução é um único UPDATE (falha = nada aplicado); resolver duas vezes NÃO reescreve quem/quando nem duplica auditoria (idempotente); nenhum GRANT/papel mudou fora do pedido.

## Prova
- verde depois: `bash .tmp/run-warroom-suite.sh` → `OK: warroom_alerts_resolve (estrutura, permissao, resolucao com auditoria, idempotencia, contagens)` e `SUITE_OK`.
- vermelho antes: a MESMA suíte sem aplicar a migration → `FALHOU: faltam colunas de resolucao em warroom_alerts`.
- permissão (pedido do cartão): `anon` sem EXECUTE (has_function_privilege=false e a chamada dá `insufficient_privilege`); `authenticated` sem papel de staff (atendente) → `not_authorized`; admin e supervisor resolvem.
- limite de 500: nota com 500 passa, com 501 viola a constraint.
- rollback executado de verdade: `bash .tmp/prova-rollback.sh` → antes `antes_colunas = 3`, depois `NOTICE: nada sobrou` + `ROLLBACK_OK`.
- banco local: `hermes-db-migrar supabase/migrations/20261011181949_warroom_alerts_resolve.sql` → `APLICADA no banco LOCAL`; consulta no banco local mostra as 3 colunas, os 2 índices novos e as 2 funções com `prosecdef = t`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias, db_guard, tipos, lint, migrations OK).

## O que NÃO fiz e por quê
- Não criei nenhum `scripts/db-audit/*.test.sh`. REGISTRO PENDENTE: supabase/tests/warroom_alerts_resolve.sql — ligar a suíte a um runner (`scripts/db-audit/*.test.sh` + passo em .github/workflows/db-guard.yml) exige arquivo fora da minha área; o runner descartável que usei está em .tmp (não versionado).
- Classificação: a substância é aditiva (coluna nullable nova, índice novo, `create function` de função NOVA); o único statement que o classificador V1 (`sql_classe.py`) lê como "contrato" é o `REVOKE` que o PRÓPRIO cartão exige ("REVOKE do público"). Em MODO_V2 a aplicação é local e direta, sem essa classificação — a migration aplicou no banco local sem ressalva. Por isso não há "PENDENTE_POS_MERGE" no .hermes-tarefa.
- Não toquei `is_read` ao resolver (o cartão não pede): a resolução grava só `resolved_at`/`resolved_by`/`resolution_note`.
- `resolved_by` ganha a FK no próprio ADD COLUMN (`references public.profiles(id)`), validada e aditiva — sem um ALTER CONSTRAINT separado.
- Alarme do fechar "há código alterado sem nenhum teste novo/alterado": falso positivo — o teste ESTÁ no commit (`supabase/tests/warroom_alerts_resolve.sql`), mas a heurística do fechar só reconhece `*.test.*`/`__tests__`; e `src/integrations/supabase/types.ts` é tipo GERADO (sem lógica), apenas acompanhando o contrato do banco. Repito o MESMO comando de fechar sem mudar nada.
