Especialista: senior (area-sql-banco)

## Pontos da recusa atual

- Ponto 1: o espelho do CI `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` quebrava porque a entrega adicionou `talkx_segment_fields`, `talkx_compile_segment_rules` e seus objetos ao `supabase/schema-catalog.json`, mas o inventário humano ainda tinha as contagens antigas e não listava a tabela. Corrigi `docs/DB-INVENTORY.md` com a nova linha `talkx_segment_fields` como `parcial` e alinhei as contagens de tabelas, colunas, funções, assinaturas e CHECKs ao catálogo.
  - Vermelho antes: `node --test scripts/ci/db-inventory-doc.unit.mjs` falhava em `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` com `"talkx_segment_fields" está no banco e não aparece no inventário` e contagens `tables 166/167`, `columns 1947/1954`, `functions 251/252`, `function_signatures 253/254`, `check_constraints 157/158`.
  - Verde depois: `node --test scripts/ci/db-inventory-doc.unit.mjs` -> `tests 15`, `pass 15`, `fail 0`.

## Pontos originais preservados do refazer anterior

- Ponto 1: o valor malicioso `30) OR 1=1 --` em `in_last_days` e `not_in_last_days` segue recusado antes da composição de SQL em `supabase/migrations/20261011003001_talkx_segment_fields.sql`; prova: `bash scripts/db-audit/talkx-segment-fields.test.sh` -> `PASS: in_last_days recusa "30) OR 1=1 --" com 22023` e `PASS: not_in_last_days recusa "30) OR 1=1 --" com 22023`.
- Ponto 2: o valor válido de 30 dias segue compilando o predicado correto; prova: o mesmo script -> `PASS: in_last_days 30 compila predicado correto e seleciona so o contato de 10 dias` e `PASS: not_in_last_days 30 seleciona so o contato de 40 dias`.
- Ponto 3: o script continua idempotente e executa a migration duas vezes sem mascarar erro; prova: o mesmo script -> `PASS: migration aplicada e idempotente (2a aplicacao verde na mesma base)`.
- Ponto 4: mantive os comentários da migration já corrigidos na entrega anterior; não alterei esses comentários nesta rodada.
- Ponto 5: `zapp-verify . --rapido` verde depois do ajuste do inventário: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (17s)`.

## Arquivos no diff contra a base

```text
.github/workflows/db-guard.yml
docs/DB-INVENTORY.md
scripts/db-audit/talkx-segment-fields.test.sh
supabase/migrations/20261011003001_talkx_segment_fields.sql
supabase/schema-catalog.json
```

## Verificações executadas

- `zapp-verify full .` antes do ajuste: iniciou e passou por `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`; a execução ficou pendente além da janela útil do terminal, então reproduzi o item exato da recusa pelo teste unitário abaixo.
- `node --test scripts/ci/db-inventory-doc.unit.mjs` antes do ajuste -> falha em `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`, acusando `talkx_segment_fields` ausente e as contagens antigas.
- `node --test scripts/ci/db-inventory-doc.unit.mjs` depois do ajuste -> `tests 15`, `pass 15`, `fail 0`.
- `bash scripts/db-audit/talkx-segment-fields.test.sh` -> `=== TODOS OS TESTES PASSARAM ===`.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (17s)`.

## Avisos do juiz automático

- `docs/DB-INVENTORY.md` não estava na lista original de arquivos do pedido de migration, mas é exatamente o arquivo apontado pela recusa atual (`docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`) e pela correção aprovada em `t_209c1c15`; sem ele o espelho do CI continua vermelho.
- `.github/workflows/db-guard.yml` está na lista original de arquivos permitidos e veio do cherry-pick do trabalho anterior para registrar o teste N-111.
- A migration cria tabela/RLS/grants porque a própria tabela `talkx_segment_fields` precisa leitura por `authenticated` e escrita só por `service_role`; a prova com papel real está em `bash scripts/db-audit/talkx-segment-fields.test.sh` (`PASS: RLS/policies/grants da tabela corretos` e `PASS: authenticated pode EXECUTAR talkx_compile_segment_rules`).

## O que não fiz

- Não toquei em `src/hooks/integrations/useTalkXSegments.ts` nem em produção.
- Não alterei guardas nem afrouxei o teste do inventário; corrigi o documento para refletir o catálogo que o próprio diff adiciona.
