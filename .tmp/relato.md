Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261013033159_profile_deactivate_ban.sql` (NOVO): desativar o perfil (`public.profiles.is_active = false`) passa a BANIR o usuário no Auth real, gravando `auth.users.banned_until` no futuro; reativar limpa o ban. Trigger próprio `trg_profile_deactivate_ban`, no MESMO evento do trigger de revogação de sessões já existente (PD-02), então as duas metades da aceitação rodam na mesma transação do UPDATE de `is_active`. Função `SECURITY DEFINER` com `search_path` fixo, `REVOKE ... FROM PUBLIC, anon, authenticated`, idempotente (`CREATE OR REPLACE` + `DROP TRIGGER IF EXISTS`) e só age quando `is_active` MUDA de valor. `-- Rollback:` com SQL executável dropa só o que este arquivo cria; o trigger de revogação de sessões fica intacto.
- `scripts/db-audit/revoke-auth-sessions.test.sh`: a suíte descartável (que já provava o PD-02) ganhou o caso do ban — trigger vermelho antes / verde depois, desativar bane E revoga junto, repetir não reescreve o ban, reativar libera, rollback remove função e trigger. A fixture `auth.users` ganhou `banned_until`.

## Por que um trigger novo e não editar o existente
Migration já aplicada não se edita. Estender a função existente exigiria rollback que "recria o corpo antigo" (fachada). Um trigger novo, no mesmo evento e idempotente, tem rollback de verdade (DROP do que criei) e não toca o PD-02.

## Prova
- Harness (PostgreSQL 17 descartável, papéis reais authenticated/anon): `bash scripts/db-audit/revoke-auth-sessions.test.sh` → `[OK] RED: trigger de ban nao existia antes` → `[OK] GREEN: desativar perfil bane no Auth e revoga as sessoes` → `[OK] GREEN: repetir a operacao nao reescreve o ban e a migration e idempotente` → `[OK] GREEN: reativar perfil limpa o ban` → `[OK] GREEN: rollback remove a funcao e o trigger de ban` → `[OK] rollback remove função e coluna (volta ao estado medido)`; termina `[OK] revoke_auth_sessions — ... ban/unban provados`.
- Banco LOCAL da tarefa (`hermes-db-migrar` aplicou; prova rodada por `zapp-db-local psql`): `[OK] LOCAL: antes de desativar — sem ban e 1 sessão` → `[OK] LOCAL: desativar perfil bane no Auth e revoga as sessões` → `[OK] LOCAL: repetir a desativação não reescreve o ban` → `[OK] LOCAL: reativar perfil limpa o ban` → `NEGADO: authenticated nao altera auth.users` → `[OK] LOCAL: prova de ban/unban concluída` (usuário sintético, nada de produção).

## O que NÃO fiz e por quê
- Não mexi no portão automático (`revoke-auth-sessions.steps.json`): o cartão diz que este lote não exige entrada de checklist e que o aceite fica mantido.
- Não alterei a migration do PD-02 (não se edita migration já aplicada).
- Nenhum GRANT/RLS/papel de objeto existente mudou; só o REVOKE do EXECUTE padrão da função nova deste arquivo.
