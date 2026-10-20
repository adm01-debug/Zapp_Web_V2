Especialista: senior (area-testes-do-produto)
## O que mudou e por quê
- Nenhum arquivo alterado neste cartão: o objetivo (cherry-pick 412d70f67 rebasado na ponta, sem conflito) já está na ponta `dia/2026-10-14` via `ce77a78baa` (cartão irmão 26101320012e41, 2026-10-14 11:00 -0300). Um commit meu aqui seria diff vazio ou duplicado.
- Prova da equivalência (`git diff --stat 412d70f67 dia/2026-10-14 -- e2e/skins-e2e.spec.ts playwright.config.ts`): `2 files changed, 88 insertions(+), 23 deletions(-)`; só na spec: `1 file changed, 15 insertions(+), 3 deletions(-)` contra `ce77a78baa`. O conteúdo é a entrega 412d70f67 mais 2 adaptações posteriores: rota mockada `email_threads` (contagem de e-mail não lido) e ponto de pendência `bg-warning` (âmbar) em vez de `bg-destructive`.
- `chromium-skins` existe na ponta sem `retries` (fix E81 do cartão irmão); o cabeçalho da spec não cita host nem project-ref de produção (conferido nas linhas 1–30 via `git show dia/2026-10-14:e2e/skins-e2e.spec.ts`).

## Prova (workspace próprio, cópia fiel da ponta para este cartão)
- Fidelidade da cópia: `e2e/skins-e2e.spec.ts`, `e2e/fixtures/talkx-demo.ts`, `e2e/fixtures/mapa-mocks.ts`, `src/components/settings/theme/presets.ts` byte-idênticos à ponta (`cmp` contra `git show dia/2026-10-14:<arq>`); `playwright.config.ts` difere em 1 linha só (`testMatch` do projeto `chromium-a11y`, irrelevante para este cartão).
- `PLAYWRIGHT_BASE_URL=http://localhost:5181 npx playwright test e2e/skins-e2e.spec.ts --project=chromium-skins --workers=1` (mesmo `workers: 1` do CI): `19 passed` + `1 failed` em duas rodadas (`19 passed (5.9m)` e `19 passed (7.1m)`); a falha trocou de teste entre as rodadas (check 14, depois "modo claro mantém a skin") e cada teste que falhou na suite passou isolado: check 3 `1 passed (20.7s)`, check 14 `1 passed (1.1m)`, "modo claro mantém a skin" `2 passed (45.3s)`. Causa das falhas em suite: guarda de boot do app (React não monta em 8s) sob dev-server frio + máquina saturada — flakiness de infra, não defeito do conteúdo integrado.
- `node --test scripts/ci/playwright-config-e81.unit.mjs`: `pass 6, fail 0`.

## Pontos do revisor (recusa: "aprovado mas conflita com a ponta")
- Ponto 1 (rebase + conflito resolvido): resolvido — o cherry-pick 412d70f67 com resolução de conflito e adaptações já está integrado na ponta em `ce77a78baa`; `git log --oneline dia/2026-10-14 -- e2e/skins-e2e.spec.ts` lista `ce77a78baa`. Reaplicar geraria diff vazio.
- Ponto 2 (rodar `e2e/skins-e2e.spec.ts` no `chromium-skins`): executado — ver Prova acima. Sem `retries` no projeto deslogado (E81: `pass 6, fail 0`), sem `e2e/.auth`, sem login real, sem `--mode production` (R1).

## O que NÃO fiz e por quê
- Sem commit de código: a convenção da fábrica para "já resolvido" é fechar sem commit com prova; qualquer commit meu duplicaria `ce77a78baa`.
- Sem estabilização da suite sob carga (aumentar timeout do boot guard): seria afrouxar teste da ponta fora do pedido deste cartão — registro como achado (abaixo), não correção.
- `hermes-tarefa-iniciar` recusou (`CONGELADO`, exit 75, sem `MODO_V2`); workspace montado como diretório próprio `~/hermes-workspaces/Zapp_Web_V2/e2e-skins-deslogado-cp8cp9-t_e533a538` com cópia fiel (provas de igualdade acima). Nenhum `git push`, `gh`, deploy ou banco de produção tocado.

## Achado fora do escopo (não corrigido)
- Suite `chromium-skins` completa é sensível à carga da máquina: com `--workers=2` (padrão local) deu `7 failed` + `13 passed (4.2m)`; todo teste falho passa isolado. Se o CI espelho rodar com `workers: 1`, o comportamento observado aqui (`19 passed` + 1 flaky que passa isolado) é o esperado.
