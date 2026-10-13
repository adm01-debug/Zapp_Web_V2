Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
Cartão t_a631f82f. As duas RPCs que recebem `send_weekdays` convertiam o campo com
`(p_payload -> 'send_weekdays')::smallint[]` e `(p_limits -> 'send_weekdays')::smallint[]`
(linhas 106 e 345 da base 20261009203548). Não existe cast `jsonb -> smallint[]` no
Postgres: o cast estoura **42846** ("cannot cast type jsonb to smallint[]") tanto para um
valor VÁLIDO (`[1,2,3]`) quanto para um inválido — a coluna era inutilizável pela API e o
contrato de erro 22023 nunca saía.

- `supabase/migrations/20261013230014_talkx_n102_window_fixes.sql` (novo): `CREATE OR
  REPLACE` de **public.save_talkx_campaign_draft(uuid,bigint,uuid,jsonb)** e
  **public.update_talkx_campaign_limits(uuid,bigint,jsonb)** trocando só o cast por uma
  conversão elemento a elemento (`jsonb_array_elements_text` + `WITH ORDINALITY`), que
  exige que todo elemento seja número JSON inteiro que caiba em smallint. Qualquer outro
  valor (texto, booleano, objeto, `null`, fração, expoente, overflow) vira **22023**
  (`invalid_talkx_campaign_draft` / `invalid_talkx_limits_values`). O intervalo 0..6 segue
  no corpo original de cada função. NÃO editei 20261009203548.
- Assinatura, LANGUAGE, SECURITY DEFINER, `search_path` e os REVOKE/GRANT são idênticos aos
  da base — nenhuma ACL mudou (conferido com `has_function_privilege`).
- `-- Rollback:` executável (recria as duas funções com o corpo ANTERIOR, uma linha cada),
  no formato que os `.test.sh` de `scripts/db-audit/*` leem.

## Prova (Postgres 17 descartável, papéis reais)
Frente de RED aplicando SÓ a base 20261009203548 e, depois, a migration nova:

- vermelho antes (base): `set role authenticated; perform save_talkx_campaign_draft(..., '{"send_weekdays":[1,2,3]}')`
  → `sqlstate=42846 msg=cannot cast type jsonb to smallint[]` (idem para `["abc"]` e para
  `update_talkx_campaign_limits(..., '{"send_weekdays":[1,2,3]}')`).
- verde depois (com a migration nova), 10 casos como `authenticated`:
  `GREEN save valido [1,2,3] -> OK send_weekdays={1,2,3}`
  `GREEN save ["abc"] -> sqlstate=22023 msg=invalid_talkx_campaign_draft`
  `GREEN save [7] -> sqlstate=22023`
  `GREEN save [1.5] -> sqlstate=22023`
  `GREEN save "x" (nao-array) -> sqlstate=22023`
  `GREEN save [null] -> sqlstate=22023`
  `GREEN update valido [1,2,3] -> OK send_weekdays={1,2,3}`
  `GREEN update [9] -> sqlstate=22023 msg=invalid_talkx_limits_values`
  `GREEN update "nope" -> sqlstate=22023`
  `GREEN update [null] -> sqlstate=22023`
- ACL: `acl save auth=true anon=false upd auth=true upd anon=false`.
- Rollback: extraí as 2 linhas `--   ...` do cabeçalho, apliquei e o 42846 voltou — prova
  que ele restaura o estado anterior. `rollback stmts: 2`.
- `hermes-db-migrar supabase/migrations/20261013230014_talkx_n102_window_fixes.sql`
  → `BEGIN / CREATE FUNCTION / REVOKE / GRANT / CREATE FUNCTION / REVOKE / GRANT / COMMIT`
  e `APLICADA no banco LOCAL 'v2-2610130850d1a4' (produção não foi tocada)` (transação única).

## O que NÃO fiz e por quê
- O critério cita `talkx_campaign_window_open`, mas o cast `jsonb -> smallint[]` NÃO mora
  nela: ela lê `v_campaign.send_weekdays`, já `smallint[]`. As linhas ~106 e ~345 (citadas
  no cartão) são destas duas RPCs. Então o `CREATE OR REPLACE apropriado` do critério são
  essas duas funções — não toquei em `talkx_campaign_window_open` (é dos cartões-irmãos
  t_59210b33 / t_24edcc38). Scheduler, hook e teste Deno também não foram tocados.
- `REGISTRO PENDENTE: scripts/db-audit/talkx-n102-window.test.sh` + passo em
  `.github/workflows/db-guard.yml` — é o cartão-irmão t_5d0f8628 (não crio teste novo).
- hotspot: `supabase/migrations/2026101*_talkx_n102_window_fixes.sql` — os cartões-irmãos
  t_59210b33, t_7fa3929d e t_24edcc38 pedem o MESMO nome de arquivo; o integrador precisa
  combinar as 4 contribuições (aqui vão só as duas RPCs do cast).
- Achado fora do escopo (não corrigido): `talkx_campaign_window_open` tem o mesmo tipo de
  cast inválido em `(v_dnd_hours -> 'holidays')::date[]` (linha ~511 da base) — `jsonb ->
  date[]` também não existe. Fica para um cartão próprio.
