Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261011125915_message_favorites_pins_reports.sql` (NOVO): favoritar, fixar (máximo 3 por conversa) e reportar mensagem no banco — 3 tabelas com RLS, 4 RPCs `SECURITY DEFINER` com `SET search_path = public, pg_temp` e `REVOKE ... FROM public, anon, authenticated` + `GRANT EXECUTE` só a `authenticated, service_role`; gatilho deriva o `contact_id` do pin. Aplicada no banco local da tarefa via `hermes-db-migrar` (saída: `APLICADA no banco LOCAL 'v2-2610111151630c' (produção não foi tocada)`).
- `scripts/db-audit/inbox-contact-authorization.test.sh` (ESTENDIDO, sem arquivo novo): blocos P1 (search_path nas 4 RPCs, EXECUTE de `authenticated` nas 4, falha real com `ROLE anon`), P2 (igualdade byte a byte do erro entre id existente-oculto e inexistente nas 4 RPCs) e rollback (derruba tudo e reaplica).
- `src/integrations/supabase/types.ts`: tipos regenerados para as 3 tabelas e 4 RPCs (trazido do trabalho anterior, sem edição minha).

## Prova
- verde depois: `bash scripts/db-audit/inbox-contact-authorization.test.sh` → `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS`, com `[PASS] oraculo do toggle`, `[PASS] oraculo do pin`, `[PASS] oraculo do unpin`, `[PASS] oraculo do report`, `[PASS] anon sem EXECUTE nas RPCs novas` e zero falhas no resumo.
- vermelho antes (rollback): a mesma suite, antes do `DROP TRIGGER`, abortou com `ERROR: cannot drop function message_pins_force_contact_id() because other objects depend on it` / `DETAIL: trigger message_pins_force_contact_id on table message_pins depends on function...`; depois do `drop trigger ...` antes dos `drop function`, PASS.
- vermelho antes (sensibilidade das checagens novas, banco descartável `postgres:17-alpine`): função sem `SET search_path` devolve `proconfig_count=0` (a checagem `== '4'` falharia); dois erros distintos (`division by zero` vs `invalid input syntax for type uuid`) saem `DIFERENTES` na comparação — a igualdade só passa quando o erro é o mesmo.

## Pontos do revisor (refazer 2)
- Ponto 1 (search_path + REVOKE/GRANT no banco aplicado): as 5 funções já tinham `SET search_path = public, pg_temp` no arquivo; completei os 4 `REVOKE` com `, authenticated` (padrão da skill: revoga de `public, anon, authenticated` pela assinatura exata e concede só a `authenticated, service_role`) e apliquei o arquivo final no banco local da tarefa com `hermes-db-migrar`. O teste prova no banco descartável com o arquivo real: `proconfig` com `search_path` nas 4 RPCs, zero `EXECUTE` para `PUBLIC`/`anon`, `EXECUTE` de `authenticated` nas 4 e falha real com `ROLE anon`. Nota honesta: revogar-antes-de-conceder torna o `, authenticated` um no-op comportamental frente ao arquivo anterior — é conformidade com o modelo, sem mudança de comportamento.
- Ponto 2 (oráculos distintos): bloco `expect_same_failure` compara a saída de erro completa (texto idêntico) de id existente-mas-oculto (M1 para o estranho U3) vs id inexistente `99999999-...` nas 4 RPCs, e exige o texto `message_not_visible` nos dois. Verde nas 4; a comparação foi provada sensível a erros distintos no banco descartável.
- Ponto 3 (registro/ledger pendente): não há o que registrar — nenhum `.test.sh` novo (estendi o `inbox-contact-authorization.test.sh`, já listado no `db-guard.yml`), nenhum workflow tocado, nenhum ledger de migration referenciado em outro arquivo; a aplicação no banco local foi feita (`hermes-db-migrar`, saída acima). Nada pendente.

## O que NÃO fiz e por quê
- Não mexi em `.github/workflows/db-guard.yml` nem em inventário/ledger: proibir edição de workflow continua valendo e nada novo precisa de registro (Ponto 3 detalha).
- Não reescrevi a migration como arquivo novo: ela nunca foi integrada à base, então o acerto (REVOKE + linha do `DROP TRIGGER` no rollback) foi no próprio arquivo ainda-não-integrado, mantendo um único arquivo novo no diff.
- Não toquei em frontend/Edge: o cartão é só banco + prova.
- `src/integrations/supabase/types.ts` é saída gerada do schema (mesmas 3 tabelas e 4 RPCs da migration, sem lógica): não há teste unitário cabível para código gerado; a prova é o teste comportamental que aplica a migration real no PostgreSQL 17 descartável, mais o typecheck do `zapp-verify --rapido` no fechar.

## Arquivos (`git diff --name-only dia/2026-10-11...HEAD`)
scripts/db-audit/inbox-contact-authorization.test.sh
src/integrations/supabase/types.ts
supabase/migrations/20261011125915_message_favorites_pins_reports.sql
