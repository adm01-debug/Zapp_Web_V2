Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- docs/DB-INVENTORY.md: a linha de `sicoob_contact_mapping` passou de `roadmap | —` para `parcial | scripts/db-audit/inbox-contact-authorization.test.sh`. Motivo: o teste NOVO que a própria entrega de t_6207b23f criou cita a tabela ao montar a fixture das 17 tabelas do achado -05 (linhas 310 e 324 do .test.sh), e o guard `scripts/ci/db-inventory-doc.unit.mjs` conta arquivo de `scripts/` como consumidor (citante) — então o status correto virou `parcial` e a coluna de consumidores deixou de ser `—`.
- Cherry-pick da entrega já aplicado: 697fa256d -> 1dbe38ab4 e c68425913 -> 5490e3b9f, sem tocar no conteúdo das 3 migrations nem do teste.

## Prova
- vermelho antes: `node --test --test-reporter=tap scripts/ci/db-inventory-doc.unit.mjs` -> `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` com `"sicoob_contact_mapping" está como "roadmap", mas o repositório diz "parcial"` e `"sicoob_contact_mapping" não lista nenhum consumidor (o repositório cita em 1 arquivo(s))`.
- verde depois: mesmo comando -> `# tests 15 / # pass 15 / # fail 0`.
- grupo node do espelho (os MESMOS arquivos que o ci_espelho.sh roda): `node --test --test-reporter=tap $(ls scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs)` -> o item `node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` NÃO aparece entre os `not ok`. Os demais `not ok` são falhas pré-existentes da base dia/2026-10-11; o espelho só reprova falha NOVA trazida pelo cartão.
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO` (dependencias/db_guard/tipos/lint/migrations OK).

## Pontos do revisor (refazer)
- Ponto 1: a quebra do ESPELHO DO CI era o inventário desalinhado ao teste da entrega. Corrigido em docs/DB-INVENTORY.md e provado vermelho->verde acima. Nenhuma asserção foi afrouxada: nenhum arquivo de guarda/teste foi tocado.

## O que NÃO fiz e por quê
- Não alterei as 3 migrations nem o `.test.sh` da entrega: a fixture precisa mesmo citar `sicoob_contact_mapping` (é uma das 17 tabelas do achado -05); reescrever o teste para esconder a citação seria afrouxar a prova.
- `bash ~/arquitetura-v2/integrador/ci_espelho.sh .` foi BLOQUEADO pelo HERMES-GUARD (ferramenta do integrador, execução protegida). Rodei o grupo node equivalente do jeito que ele roda e o item do cartão desapareceu.
