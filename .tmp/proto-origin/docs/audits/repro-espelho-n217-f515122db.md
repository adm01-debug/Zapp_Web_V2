# Repro do nó N217 do espelho do CI — entrega f515122db (cartão t_ad300348)

Diagnóstico. Não altera asserção, doc medido nem código — apenas registra a reprodução.

## Como reproduzir

    base:  dia/2026-10-15 @ e7d156b8a7        (ponta do dia)
    passo: git cherry-pick -x f515122db      (3 conflitos; ver "Conflitos" abaixo)
    prova: bash ci_espelho.sh .              (cópia local; a guarda do Hermes bloqueia executar o original de ~/arquitetura-v2)

## Resultado

`ci_espelho.sh` na base e com o cherry-pick (lista ordenada, `sort -u`):

    base  (e7d156b8a7)           : 13 falhas (12 node + 1 guarda)
    base + f515122db (45975e3dac): 18 falhas (13 node + 1 guarda + 4 deno)

Novas (só aparecem com o cherry-pick):

    node: N217: docs bate com medição fresca e segunda execução é idêntica
    deno: R2EXT-AGENDA: instance-info (v2) não devolve token/apikey/hash  => ./supabase/functions/evolution-api/index.test.ts
    deno: R2EXT-AGENDA: instance-info (GO) não devolve token/apikey/hash  => ./supabase/functions/evolution-api/index.test.ts
    deno: R2EXT-AGENDA: list-instances (v2) não devolve token/apikey/hash => ./supabase/functions/evolution-api/index.test.ts
    deno: R2EXT-AGENDA: list-instances (GO) não devolve token/apikey/hash => ./supabase/functions/evolution-api/index.test.ts

Nenhuma falha da base desapareceu.

## Causa raiz do N217 (o nó que o cartão aponta)

A entrega cresce `supabase/functions/_shared/evolution-control-authz.ts`
(222 → 307 linhas: +`send-status` no `CONTROL_ACTIONS`, lista R2EXT-AGENDA e
`sanitizeStatusPayload`), mas não regenera o relatório medido
`docs/audits/edge-functions-authz-coverage.md`. O nó N217 mede a cobertura do
zero e compara com o arquivo em disco:

    documento : docs/audits/edge-functions-authz-coverage.md:10  | evolution-control-authz.ts | 137 | 137 | 100.0% |
                docs/audits/edge-functions-authz-coverage.md:12  | **Total** | **255** | **305** | **83.6%** |
    medido    : evolution-control-authz.ts | 127 | 178 | 71.3%   (Total 245/346 = 70.8%)

Asserção que falha: `scripts/ci/edge-coverage-authz.unit.mjs:389`
(`docs/audits/edge-functions-authz-coverage.md desatualizado: regenere com REGENERAR_EDGE_AUTHZ_COV=1`).
Determinístico: as duas medições internas do próprio nó são idênticas (linhas 383-387) e
duas execuções seguidas do arquivo de teste dão exatamente a mesma saída.

## Os 4 nós deno (por que também são novos)

Vêm do `supabase/functions/evolution-api/index.test.ts`, que o commit leva de 645 para 964
linhas e passa a conter os testes `R2EXT-AGENDA` (0 → 7 menções). A base não tem nenhum teste `R2EXT-AGENDA` nesse arquivo
(`git show e7d156b8a7:supabase/functions/evolution-api/index.test.ts | grep -c R2EXT-AGENDA` = 0)
e o diff de `index.ts` do commit só toca o handler de `send-status` (hunks em `@@ -4,7` e
`@@ -892,7`), sem nenhuma mudança em `instance-info`/`list-instances`. Ou seja: são artefato
de aplicar o commit sem a sua corrente empilhada (o pai `5c64da82da` traz a implementação),
não uma inconsistência interna do commit.

## Conflitos do cherry-pick

`git cherry-pick -x f515122db` conflita em 3 arquivos (`evolution-control-authz.ts`,
`evolution-control-authz.test.ts`, `evolution-api/index.test.ts`) e em `.tmp/relato.md`
(modify/delete). Resolvidos tomando o lado do commit (`git checkout --theirs`) — a base é
de outra linhagem e o commit é a referência para a reprodução.

## Referência cruzada

`91d3dec255 docs(edge): atualiza ESTADO.md e cobertura N217 apos send-status restrito` já
registrava a mesma regeração de cobertura (+ âncoras do ESTADO.md) no empilhamento da
ponta de dia/2026-10-14. Na ponta de 2026-10-15 as duas falhas de ESTADO.md são
pré-existentes (apontam `src/hooks/integrations/useKnowledgeBase.ts:99` e o grupo de
`create-user`, arquivos fora do diff do commit).
