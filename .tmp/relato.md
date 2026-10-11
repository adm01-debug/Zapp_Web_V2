Especialista: worker (sql) (area-sql-banco)

## Como resolvi o motivo da retomada
Motivo: a entrega de t_007f8fb0 (v2/anon-truncate-17-tabelas-2610102042c8e0 @ b6f5c02a5) quebrava, empilhada sobre dia/2026-10-11, o item `node: docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`.

Reproduzi na ponta atual de dia/2026-10-11 (616782983) com o cherry-pick dos dois commits da entrega (7e1a91cbb + b6f5c02a5 -> dd633e7a3 + dbb12e45f) e o comando que produz o item:
`node --test --test-reporter=tap scripts/ci/db-inventory-doc.unit.mjs`
-> RED: `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`, com
`"sicoob_contact_mapping" está como "roadmap", mas o repositório diz "parcial"` e `"sicoob_contact_mapping" não lista nenhum consumidor (o repositório cita em 1 arquivo(s))`.

Causa: o teste NOVO que a entrega criou, `scripts/db-audit/anon-privileges-contact-messages.test.sh`, cita `sicoob_contact_mapping` (uma das 17 tabelas revogadas). A guarda lê o repositório por varredura textual; como aquele arquivo cita 17 objetos (abaixo de `LIMITE_ESPELHO` = 30), ele passa a contar como consumidor de ferramental e muda o status medido da tabela de `roadmap` para `parcial`. O documento ficou desalinhado do repositório — o teste e a migration da entrega estão corretos, e nenhuma asserção foi afrouxada.

## O que mudou e por quê
- `docs/DB-INVENTORY.md` (linha do `sicoob_contact_mapping`): `roadmap` / `—` -> `parcial` / `scripts/db-audit/anon-privileges-contact-messages.test.sh`. É a aplicação da regra do próprio documento ao novo consumidor de ferramental; `parcial` significa exatamente "só `scripts/`/`tests/`/`e2e/`/`.github/` citam". Nenhum objeto do banco foi criado ou alterado.

## Prova
- vermelho antes: `node --test --test-reporter=tap scripts/ci/db-inventory-doc.unit.mjs` (sem a mudança) -> `not ok 3 - docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` + `"sicoob_contact_mapping" está como "roadmap", mas o repositório diz "parcial"`
- verde depois: `node --test --test-reporter=tap scripts/ci/db-inventory-doc.unit.mjs` -> nenhum `not ok` (15/15 `ok`, item 3 incluído)
- `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (101s)`; `OK db_guard 0s / OK tipos 100s / OK lint 0s / OK migrations 1s`

## O que NÃO fiz e por quê
- Não rodei o `~/arquitetura-v2/integrador/ci_espelho.sh`: o HERMES-GUARD bloqueia a execução desse script do integrador. Reproduzi o item exatamente como ele é gerado — o mesmo `node --test` sobre o mesmo arquivo — em RED (depois do cherry-pick) e GREEN (depois da correção).
- Não mexi no `.test.sh` da entrega, na migration nem em `LIMITE_ESPELHO`: a causa é só o desalinhamento do documento; baixar o limite ou esconder o nome da tabela no teste seria afrouxar a medida.
- Rodei também a suíte node inteira do espelho (`scripts/ci/*.unit.mjs`, `scripts/edge-deploy/*.unit.mjs`, `scripts/db-audit/*.test.mjs`, `scripts/talkx/*.unit.mjs`): saíram dos 3 do baseline (1 contrato + 2 Talk X) também 5 testes do `lint-ratchet.unit.mjs`, que falham aqui porque o HERMES-GUARD barra os `git` de escrita que eles usam dentro do teste — artefato do meu ambiente, não do diff (no ambiente do integrador, sem guarda, o baseline não os lista).
- Não toquei `supabase/schema-manifest.json` nem `scripts/db-audit/grants-baseline.json` (retratos do banco oficial, regenerados na integração) — segue como pendência registrada pelo cartão pai.
