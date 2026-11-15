# Dossiê — claude__fix-revogar-grants-escrita-anon-261025-2115 (PR #2265)

**Propósito**: migration única `supabase/migrations/20261026220300_revogar_grants_escrita_anon.sql` (commit `eb8e6ad19`, 5 linhas): `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;` + `GRANT INSERT ON public.password_reset_requests TO anon;` (CRITICAL-1 da auditoria 2026-10-25).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261026220300_revogar_grants_escrita_anon.sql` | **INCORPORADA** (mesma intenção, outros arquivos) e **versão colide** | REVOKE INSERT/UPDATE/DELETE + GRANT INSERT em `password_reset_requests`: `origin/main:supabase/migrations/20261016250000_revoke_anon_write_grants_all_tables.sql:21,27` (entrou em `main` via c543c6ade, PR #2054). REVOKE TRUNCATE: `origin/main:supabase/migrations/20261030135126_revoke_public_table_structure_grants.sql:18,23`. Versão `20261026220300` já existe na main como `20261026220300_classificar_rls_sem_policy.sql` e no ledger de produção (`schema_migrations`: `20261026220300 classificar_rls_sem_policy`) — aplicar a desta branch quebraria o ledger. |

## Estado em produção (tnnnlkbymytvtqngbbqh, somente leitura, 2026-11-15)
- Ledger: `20261016250000 revoke_anon_write_grants_all_tables`, `20261030135126 revoke_public_table_structure_grants`, `20261108204000 revoke_anon_select_grants_all_tables` — todas aplicadas.
- `information_schema.role_table_grants` (grantee=anon, schema public, INSERT/UPDATE/DELETE/TRUNCATE): **1 grant** → `password_reset_requests:INSERT`. Exatamente o estado-alvo da migration da branch.
- Policy `Anon can file a password reset request` existe em `pg_policies` (tablename=password_reset_requests).

## Veredito
**INCORPORADA** — o efeito completo da migration já está na `main` e aplicado em produção por `20261016250000` + `20261030135126`; o arquivo da branch não pode ser aplicado (colisão de versão). Nada a recuperar. `apagar_branch_seguro = true`.

Comentários de fechamento da PR #2265 (01-02/11) alegavam o mesmo; verificado agora de forma independente (código na main + ledger + grants ao vivo).

## Verificação adversarial

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei nenhum hunk de valor fora da main.

Diff integral da branch (`git diff 2d97c44 origin/claude/fix-revogar-grants-escrita-anon-261025-2115`) = 1 arquivo novo,
5 linhas, 2 comandos SQL:
- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon;`
- `GRANT INSERT ON public.password_reset_requests TO anon;`

Cobertura na main (`origin/main` = dac285f62dbb96370abb2ca4aa7adbac2c88b7a5):
- `supabase/migrations/20261016250000_revoke_anon_write_grants_all_tables.sql:21` — `REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;` e `:27` — `GRANT INSERT ON public.password_reset_requests TO anon;` (idêntico ao segundo comando da branch).
- `supabase/migrations/20261030135126_revoke_public_table_structure_grants.sql:18-20` — `REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;` cobre o único verbo que faltava (TRUNCATE) e vai além (REFERENCES/TRIGGER + `ALTER DEFAULT PRIVILEGES` nas linhas 22-24).
- `supabase/migrations/20261108204000_revoke_anon_select_grants_all_tables.sql:11` documenta a cadeia e remove até o SELECT — mais restritivo que a branch.

Estado real em produção (`tnnnlkbymytvtqngbbqh`, leitura):
- `information_schema.role_table_grants` para `grantee='anon'`, schema `public`, verbos INSERT/UPDATE/DELETE/TRUNCATE: **1 linha** — `password_reset_requests / INSERT`. É exatamente o estado-alvo da branch, nada mais e nada menos.
- `supabase_migrations.schema_migrations`: `20261016250000 revoke_anon_write_grants_all_tables`, `20261030135126 revoke_public_table_structure_grants`, `20261108204000 revoke_anon_select_grants_all_tables` aplicadas.
- `pg_policies` em `password_reset_requests` contém `Anon can file a password reset request` (INSERT, role anon) — o fluxo "Esqueci a senha" citado no comentário da branch continua íntegro.

Colisão que torna a branch pior que inútil: a versão `20261026220300` já está ocupada na main
(`supabase/migrations/20261026220300_classificar_rls_sem_policy.sql`, confirmado por `git ls-tree origin/main`) e aplicada em
produção com esse nome. Reaplicar o arquivo da branch criaria duas migrations de mesma versão.

Valor residual: apenas o comentário de auditoria (3 linhas) e a referência `src/pages/ForgotPassword.tsx:56` — abaixo de
médio, e a justificativa já existe, mais detalhada, nos cabeçalhos das três migrations da main. Nada a resgatar.

Branch segura para apagar.
