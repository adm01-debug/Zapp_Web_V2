Especialista: worker (geral)

## Pontos do cartão ([refazer])
- Ponto 1: partir do commit da entrega com cherry-pick — feito: `git cherry-pick 549f1c375 0105f1f88` sobre a ponta de dia/2026-10-11 (`e36f1e64a`); não recomecei o trabalho da entrega.
- Ponto 2: reproduzir a falha do espelho e corrigir a causa sem afrouxar asserção — reproduzida com `node --test scripts/ci/db-inventory-doc.unit.mjs` → `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` (`'"talkx_segment_fields" está no banco e não aparece no inventário'`, `'a contagem de "tables" é 166; o catálogo tem 167'`). Causa: a entrega registrou a tabela e a RPC em `supabase/schema-catalog.json` sem atualizar `docs/DB-INVENTORY.md`. Corrigi só o documento (`docs/DB-INVENTORY.md`); `scripts/ci/db-inventory-doc.unit.mjs` ficou intacto — não consta em `git diff --name-only e36f1e64a HEAD`.
- Ponto 3: o mesmo comando verde e `zapp-verify . --rapido` verde, fechando citando o sha — `node --test scripts/ci/db-inventory-doc.unit.mjs` → `tests 15 / pass 15 / fail 0`; `zapp-verify . --rapido` verde. Entrega reproduzida (cherry-pick): sha `0105f1f88`.

## O que mudou e por quê
- `docs/DB-INVENTORY.md`: acrescenta a linha `talkx_segment_fields` na seção `## Tabelas` (status `parcial`) e atualiza as contagens de `tables`, `columns`, `functions`, `function_signatures` e `check_constraints` em `## Objetos por tipo`, além da prosa final do documento. Motivo: alinhar o inventário ao catálogo que a entrega t_726ef2b0 acrescentou.
- Status `parcial`: a tabela só é citada por ferramental (`.github/workflows/db-guard.yml`, `scripts/db-audit/talkx-segment-fields.test.sh`), exatamente o que `statusCalculado` mede no próprio teste — nenhum arquivo de produto (`src/`, `supabase/functions/`) a cita.

## Prova
- vermelho antes (workspace com a entrega cherry-pickada, ANTES do ajuste): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` (fail 1).
- verde depois: `node --test scripts/ci/db-inventory-doc.unit.mjs` → `tests 15 / pass 15 / fail 0`.
- espelho (`ci_espelho.sh`, parte node `scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs`): as falhas remanescentes (`lint-ratchet` `--staged` e `talkx-schedule-timezone-contract.test.mjs`) não citam `supabase/schema-catalog.json` nem qualquer arquivo tocado por este cartão, logo são pré-existentes na base.

## O que NÃO fiz e por quê
- A migration `supabase/migrations/20261011003001_talkx_segment_fields.sql` — que traz `DROP POLICY IF EXISTS`/`CREATE POLICY` (RLS) e `REVOKE/GRANT` — NÃO é trabalho deste cartão: entra pelo `git cherry-pick` da entrega t_726ef2b0, cuja prova com papel real (`SET ROLE authenticated`, sem `service_role`) está no handoff dela (ponto 2 da recusa anterior). Este cartão não altera RLS: seu único ajuste é `docs/DB-INVENTORY.md`; todo o diff de migration/permissão vem da entrega reproduzida.
- Os 4 arquivos da entrega t_726ef2b0 entram por `git cherry-pick` (o cartão manda partir dela) apenas para reproduzir a falha; meu ajuste é só `docs/DB-INVENTORY.md`. Por isso o diff do cartão é grande: carrega a entrega reproduzida, não trabalho novo meu.
- Não corrigi a falha pré-existente de `scripts/db-audit/talkx-schedule-timezone-contract.test.mjs` (regex de import defasado em `supabase/functions/talkx-scheduler/index.ts`): arquivo fora dos citados no cartão; fica registrada como observação.
