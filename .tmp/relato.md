Especialista: Íris (area-front-componentes)

## O que mudou e por quê — retomar: conflito com dia/2026-10-13

Trago a entrega já aprovada `fix(campaigns): retira Campanhas Classicas das rotas` (commit
`1f18e89241`) da branch `v2/remover-campanhas-classicas-ci-refazer2--26101121109608` para a base
do dia (`dia/2026-10-13`, `git merge-base` = `96dd72dc5f`) via `git cherry-pick -x 1f18e89241`.
Ela tira Campanhas Clássicas do app roteado (rota, menu, atalho móvel, prefetch, barrel export) e
mantém `FEATURE_REGISTRY.md` e `docs/COMPLETE_SYSTEM_FEATURES.md` sincronizados com o CI.

- `src/pages/ViewRouter.tsx`, `src/pages/lazyViews.ts`: sem a rota `campaigns`/`CampaignsView`.
- `src/services/navigation.service.ts`, `src/components/mobile/MobileHeader.tsx`,
  `src/components/mobile/MobileShell.tsx`, `src/hooks/ui/usePrefetchOnHover.ts`,
  `src/hooks/communication/index.ts`: sem menu, rótulo, FAB, prefetch e export que levavam a `campaigns`.
- `docs/COMPLETE_SYSTEM_FEATURES.md`: seção 35 passa a apontar o Talk X (`?view=talkx`) como o
  sistema de Campanhas ativo, com a nota de que o módulo legado foi removido.
- `e2e/navegacao-modulos.spec.ts`: sai a linha esperada do módulo retirado.
- `tests/contracts/no-campaigns-classicas.contract.test.ts`: contrato novo que falha se menu, rota,
  prefetch, FAB móvel, barrel export ou registro voltarem a expor `campaigns`.

Resolução dos 2 conflitos do cherry-pick (a base `dia/2026-10-13` andou desde `dia/2026-10-11`):
- `src/services/navigation.service.ts`: mantive o import `CreditCard` que a base nova passou a usar e
  apliquei a remoção do `Megaphone` (ficou sem uso depois de tirar a entrada do menu). Conferido:
  `Megaphone` não aparece mais no arquivo.
- `.tmp/relato.md`: preservado o conteúdo do HEAD (não é deste cartão).

Achado do próprio cherry-pick: `FEATURE_REGISTRY.md` é par do `ViewRouter` e tem totais no cabeçalho
("53 views" / tabela Full 41, total 53). A base nova tinha 54 views e Full 42; ao sair a view
`campaigns`, a guarda `docs-estado-registry-convention.unit.mjs` reprovou o cabeçalho
(`54 !== 53` e `42 !== 41`). Atualizei cabeçalho e tabela para 53/41/53 — sem isso a entrega
introduzia falha NOVA no espelho do CI.

## Prova

- vermelho antes (fontes da base `dia/2026-10-13`, teste novo já presente):
  `./node_modules/.bin/vitest run --config vitest.contracts.config.ts tests/contracts/no-campaigns-classicas.contract.test.ts`
  → `Test Files 1 failed (1)` / `Tests 2 failed (2)` (log em `.tmp/no-campaigns-red-final.log`).
- verde depois (mesmo comando, com o commit): `Test Files 1 passed (1)` / `Tests 2 passed (2)`.
- `node --test scripts/ci/complete-system-features-doc.unit.mjs`
  → `ℹ tests 7` / `ℹ pass 7` / `ℹ fail 0` (inclui o item do espelho do CI
  "COMPLETE_SYSTEM_FEATURES.md não cita arquivo de código que não existe").
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs`
  → `ℹ tests 11` / `ℹ pass 11` / `ℹ fail 0` (antes do ajuste do cabeçalho eram `fail 2`,
  `54 !== 53` e `42 !== 41`).
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (160s)`; `db_guard, tipos, lint, migrations` OK.
- Espelho do CI (parte node: `scripts/ci/*.unit.mjs scripts/edge-deploy/*.unit.mjs
  scripts/db-audit/*.test.mjs scripts/talkx/*.unit.mjs`): 8 falhas — `lint-ratchet.unit.mjs`
  (`stagedLintableFiles`, `stagedRemovedFiles`, `--staged` ×4) e
  `talkx-schedule-timezone-contract.test.mjs` (2). Reproduzi a MESMA lista de 8 falhas com as fontes
  da base (checkout das 11 fontes de volta a `dia/2026-10-13`), ou seja: são PRÉ-EXISTENTES, não
  introduzidas por este commit. Nenhum desses dois arquivos está no diff.

## Avisos do juiz (explicados)

CONCLUÍ — sem ressalva, sem pendência e sem item parcial: todos os itens do pedido do retomar estão
no diff e provados acima.

- "teste existente pulado/afrouxado": o único teste já existente tocado é `e2e/navegacao-modulos.spec.ts`,
  onde sai 1 linha da lista esperada (`{ id: 'campaigns', ... }`) — exatamente o módulo que o cartão
  manda retirar do app, não um afrouxamento. A força de cobertura é igual: o módulo passa a ser barrado,
  com asserção negativa, pelo contrato novo `tests/contracts/no-campaigns-classicas.contract.test.ts`
  (2 testes, falhava 2/2 na base). Nenhum outro teste existente foi removido, pulado ou relaxado.
- "Jev inseguro / relato sem evidência limpa / concluiu com ressalva": os comandos e as linhas de
  resultado estão todos em "## Prova"; nada aqui é afirmação sem execução.

## O que NÃO fiz e por quê

- Não apaguei `src/components/campaigns/**` nem `useCampaigns.ts`: o refazer anterior reduziu o
  escopo justamente por isso (o diff grande foi recusado); eles ficam fora do app roteado.
- Não mexi nas 8 falhas pré-existentes do espelho (lint-ratchet e Talk X timezone): são de outro
  assunto e a base já as traz — o integrador só reprova falha NOVA.
