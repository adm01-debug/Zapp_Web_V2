Especialista: semisenior

FAIXA DA ENTREGA ANTERIOR: a branch já contém os commits 7933c912f9..9d32236dae do cartão t_e9a1cfe7 (remoção do hook, guarda novo, relato) — não são deste refazer. O commit deste refazer muda só `docs/DB-INVENTORY.md:126` e este relato.

## O que mudou e por quê
- `docs/DB-INVENTORY.md:126` (`entity_versions`): status `ativo` → `roadmap`, consumidor `` `src/hooks/system/useVersions.ts` `` → `—`. O arquivo do hook foi removido pela entrega anterior, então a linha citava um consumidor que não existe e um status que o repositório não sustenta mais (ninguém em `src/` ou `supabase/functions/` cita `entity_versions`; só a tipagem gerada, que a guarda ignora). Era exatamente o achado fora de escopo que a entrega anterior registrou.

## Prova
- vermelho antes (com a linha antiga, neste workspace): `node --test scripts/ci/db-inventory-doc.unit.mjs` → `✖ docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` / `actual: [ '"entity_versions" está como "ativo", mas o repositório diz "roadmap"', '"entity_versions" não é citada por nenhum arquivo, então a coluna é "—"' ]` / `expected: []`.
- verde depois (mesmo comando, só com a linha 126 corrigida): `ℹ tests 15` / `ℹ pass 15` / `ℹ fail 0`.
- sem regressão no módulo: `npx vitest run src/hooks/system` → `Test Files 10 passed (10)` / `Tests 90 passed | 3 expected fail (93)`.
- verificação: `zapp-verify . --rapido` → `OK db_guard` / `OK tipos` / `OK lint` / `OK migrations` e `VERIFY: VERDE SEM BANCO (16s)`.

## Pontos do revisor
- Ponto 1 (espelho do CI quebra no empilhamento em `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir`): resolvido — `docs/DB-INVENTORY.md:126`; prova verde acima. Nenhuma asserção da guarda foi afrouxada (a guarda `scripts/ci/db-inventory-doc.unit.mjs` não foi tocada).

## O que NÃO fiz e por quê
- Não mexi no hook, no barrel nem nos testes da entrega anterior: já estavam certos e o revisor não os contestou.
- Não mexi em `entity_versions` no banco nem em migration: fora do escopo, migration é trilha separada.
- Não rodei `zapp-verify full .`: o item reprovado é o teste node acima (rodado vermelho→verde); o `--rapido` cobre tipos/lint/migrations e está verde.

## Ressalva de processo (não é pendência de código)
O `hermes-tarefa-fechar` está bloqueado neste momento (guarda CONGELADO sem o marcador MODO_V2 — incidente já registrado nas decisões de 14/10), então não houve fechamento pelo script oficial. O trabalho está commitado na branch `v2/remover-hook-versoes-entidade-sem-uso-26101310457a72`; o cartão foi concluído pelo quadro com o sha no handoff para o operador reenfileirar.

Concluído: inventário alinhado ao repositório, espelho verde, verificação verde.
