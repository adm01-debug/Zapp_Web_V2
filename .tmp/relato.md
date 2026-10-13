Especialista: worker (geral)

Cartão [refazer]: a entrega anterior (commit f4e4ece10, `feat(edge): cria Edge publica request-password-reset`) quebrava o ESPELHO DO CI no empilhamento — item `node: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`. Aqui a entrega é retomada sobre a base `dia/2026-10-13` sem recomeçar: o commit original foi trazido por cherry-pick e o registro foi posto em dia.

## O que mudou e por quê
- `supabase/functions/request-password-reset/index.ts` + `index.test.ts` + o bloco `[functions.request-password-reset]` de `supabase/config.toml`: preservados exatamente como a entrega original (cherry-pick de f4e4ece10). A Edge é o produto do cartão; sem ela não há linha a registrar.
- `ESTADO.md`: registro recalculado pela guarda, que é o que o cartão manda fechar —
  - linha nova `| \`request-password-reset\` | D | \`supabase/config.toml:45\` |`: a Edge não tem `invoke`/rota no front nem chamada de outra Edge (o `/forgot-password` ainda grava direto), só a entrada em `config.toml`; logo o primeiro chamador é externo (grupo D).
  - totais: grupo **D** de 6 para 7 e **total** de 81 para 82 (a tabela agora tem a linha nova).
  - cabeçalho `N edges`: 81 para 82.
  - âncoras `supabase/config.toml:<linha>` que ficaram para trás porque este mesmo cartão inseriu o bloco da Edge nova no `config.toml` (esse trecho empurra as linhas seguintes): `crm-integration`, `message-delivery`, `promogifts-catalog`, `csp-report`, `talkx-link`, `searchbox-budget-alert`, `sync-call-records`, `get-call-recording`, `talkx-ai`. Cada âncora passou a apontar para a linha do próprio `[functions.<nome>]`.
  - âncora de `classify-sticker`: `src/components/sticker-picker/useStickerPicker.ts:147` → `src/hooks/sticker-picker/useStickerPicker.ts:147` (mesma linha 147; o arquivo mudou de pasta na base e a âncora estava morta antes deste cartão — a guarda acusa em `existsSync`).

## Prova
- vermelho antes (`node --test scripts/ci/docs-estado-registry-convention.unit.mjs` na base + cherry-pick): `✖ ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` → `AssertionError: âncora desatualizada: supabase/config.toml:55 não cita \`crm-integration\`` (e, removendo esse primeiro erro, `AssertionError: ESTADO.md cita \`src/components/sticker-picker/useStickerPicker.ts:147\` para \`classify-sticker\`, arquivo que não existe`).
- verde depois (mesmo comando): `ℹ tests 11` / `ℹ pass 11` / `ℹ fail 0`.
- Edge preservada e funcional: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read supabase/functions/request-password-reset/index.test.ts` → `ok | 9 passed | 0 failed (88ms)`.

## Pontos do cartão (o cartão é um [refazer] do limpador; os pontos são o "O QUE FAZER")
- Ponto 1: parti do commit da entrega por cherry-pick de `f4e4ece10` (não recomecei); o commit original virou `097bc9ecf` nesta branch, preservado sem alteração de conteúdo.
- Ponto 2: reproduzi o item sobre a ponta atual do dia (`dia/2026-10-13`) e corrigi a causa que a própria entrega deixou desalinhada — ela adicionou a Edge nova e um bloco em `supabase/config.toml`, e o `ESTADO.md` não acompanhou (falta a linha da Edge, totais/cabeçalho com um a menos, âncoras do `config.toml` deslocadas). Nenhuma asserção foi afrouxada: nenhum teste do repositório foi tocado neste diff (só `ESTADO.md` + relato).
- Ponto 3: prova verde no mesmo comando do item (`node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `ℹ tests 11 / ℹ pass 11 / ℹ fail 0`) e `zapp-verify . --rapido` verde no `hermes-tarefa-fechar`; sha da entrega: `05b5e8797` (sobre `097bc9ecf`).

## O que NÃO fiz e por quê
- Não toquei em `src/` nem no front do `/forgot-password`: fora do escopo do cartão (a migração do front para a Edge é outro cartão).
- Não regenerei o manifesto de deploy de Edge nem rodei deploy/push: não é deste cartão e não faço push/deploy.
- A data do cabeçalho do `ESTADO.md` (`Base: dia/2026-10-11`) ficou como estava: a guarda só confere a contagem de edges; mudar a referência de dia é outro cartão.
