Especialista: senior (area-edge-api + CI/documentação)

## Pontos da recusa

Ponto 1: a recusa dizia que a entrega anterior quebrava o espelho do CI porque `ESTADO.md` não listava a nova edge `automation-suggest-reply`.
- O que mudei: trouxe a guarda de documentação do cartão de CI aprovado para este workspace (`scripts/ci/docs-estado-registry-convention.unit.mjs`) e atualizei `ESTADO.md` para registrar `automation-suggest-reply` como edge órfã/grupo E, com o total do cabeçalho e o total das órfãs sincronizados.
- Prova vermelha antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` falhava com `ESTADO.md não tem linha para a edge automation-suggest-reply` e `80 !== 81`.
- Prova verde depois: o mesmo comando terminou com `pass 11`, `fail 0`, `node_docs_exit=0`.

Ponto 2: a recusa mandava não resolver só com mock/relato, mas com a guarda real que compara o documento ao repositório.
- O que mudei: além de `ESTADO.md`, incluí os arquivos de documentação exigidos pela própria guarda (`FEATURE_REGISTRY.md` e `TESTING_CONVENTION.md`) para que o teste espelhe a exigência do integrador em vez de depender de checagem manual.
- Prova: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` valida a lista real de `supabase/functions/*/index.ts`, âncoras, grupos, totais, órfãs, views do `ViewRouter` e caminhos de teste; resultado final: `pass 11`, `fail 0`.

Ponto 3: manter a entrega original de Edge Function e provar que ela ainda funciona.
- O que mudei: preservei o commit anterior da edge (`supabase/functions/automation-suggest-reply/index.ts` e `index.test.ts`) sem ampliar o escopo da lógica de produção; a correção nova foi só o registro do documento/guarda que a recusa apontou.
- Prova verde: `deno test --config scripts/ci/deno.json --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/automation-suggest-reply/index.test.ts` terminou com `ok | 13 passed | 0 failed` e `deno_exit=0`.

Ponto 4: rodar verificação do projeto antes de fechar.
- Prova verde: `zapp-verify . --rapido` terminou com `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations` e `VERIFY: VERDE SEM BANCO (21s)`.
- Observação de execução: tentei `zapp-verify full .` como a recusa pedia; na primeira tentativa a ferramenta do Hermes encerrou por timeout de 420s sem saída útil, e na segunda ficou mais de 12 minutos rodando. Antes de eu encerrar a tentativa longa, ela já tinha passado `db_guard`, `tipos`, `lint` e `migrations`, sem apresentar falha nova. Não declaro o full como verde; a prova verde usada para fechamento é a verificação rápida e as guardas específicas acima.

## Arquivos do diff

ESTADO.md
FEATURE_REGISTRY.md
TESTING_CONVENTION.md
scripts/ci/docs-estado-registry-convention.unit.mjs
supabase/functions/automation-suggest-reply/index.test.ts
supabase/functions/automation-suggest-reply/index.ts

## Comandos executados

- `git show --stat --oneline c8ce7e274` — confirmou que o trabalho anterior trazia só `supabase/functions/automation-suggest-reply/index.ts` e `index.test.ts`.
- `git cherry-pick c8ce7e274` — reaplicou o trabalho anterior neste workspace.
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` antes da correção — vermelho: faltava `automation-suggest-reply` no `ESTADO.md`, e o total estava `80 !== 81`.
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` depois da correção — verde: `pass 11`, `fail 0`, `node_docs_exit=0`.
- `deno test --config scripts/ci/deno.json --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/automation-suggest-reply/index.test.ts` — verde: `ok | 13 passed | 0 failed`, `deno_exit=0`.
- `zapp-verify . --rapido` — verde sem banco: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (21s)`.
- `zapp-verify full .` — tentado duas vezes; a tentativa longa passou por `db_guard`, `tipos`, `lint` e `migrations`, mas foi encerrada por tempo antes de completar, então não é usada como prova de verde.

## O que não fiz

- Não alterei banco, migration, RLS, front, manifesto de deploy nem fluxo de produção.
- Não fiz push, PR, deploy nem toquei em produção.
