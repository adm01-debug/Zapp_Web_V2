Especialista: worker (geral)

CONCLUÍDO — o item do ESPELHO DO CI que o cartão aponta não existe mais com este diff.

## O que mudou
- `ESTADO.md:65`: a âncora da edge `batch-fetch-avatars` passou de `src/hooks/inbox/useInboxBulkActions.ts:143`
  para `src/hooks/inbox/useInboxBulkActions.ts:165`. A entrega de t_8016679b mexeu nesse hook (bloco de
  exclusão de contatos) e empurrou a chamada `supabase.functions.invoke('batch-fetch-avatars')` da linha
  143 para a 165; a âncora publicada no ESTADO.md ficou apontando para uma linha que não cita mais a edge.
- Diff próprio do cartão: `93216be6e3`, só `ESTADO.md` (1 inserção / 1 remoção).

## Prova
- vermelho antes (árvore com os commits do pai, sem a correção):
  `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
  `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
  `error: 'âncora desatualizada: src/hooks/inbox/useInboxBulkActions.ts:143 não cita batch-fetch-avatars'`
- verde depois (mesmo comando): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
  `# tests 11`, `# pass 11`, `# fail 0`
- verde depois (testes dos arquivos alterados): `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` →
  `Test Files 1 passed (1); Tests 2 passed (2)`; `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` →
  `Test Files 1 passed (1); Tests 27 passed (28)` (o 1 restante é `test.fails` declarado no próprio arquivo).
- espelho do CI (`ci_espelho.sh .`): o item `node: ESTADO.md cita só âncoras reais, e cada âncora contém a
  própria edge` saiu da lista de falhas. A lista restante bate com a da base `453e6b69f9`
  (`.ci-base-453e6b69f9…txt`): `guarda: scripts/ci/implicit-any-ratchet.mjs` e 3 itens de Talk X/FLAG_CHANGES,
  mais 6 itens de `scripts/ci/lint-ratchet.unit.mjs` que aqui falham por `HERMES-GUARD (git): git init é
  proibido nesta sessão` (fixtures que criam repositório temporário).
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (1003s)`.

## Pontos do cartão (O QUE FAZER)
- Ponto 1: parti da entrega com `git cherry-pick -x` dos dois commits de código dela
  (`647c2890fd` e `845f146ccf`) sobre a ponta atual de `dia/2026-10-13` (`453e6b69f9`) — não recomecei.
- Ponto 2: reproduzi o item no espelho e corrigi a causa em `ESTADO.md:65` (âncora `:143` → `:165`);
  `scripts/ci/docs-estado-registry-convention.unit.mjs` não foi tocado nem afrouxado.
- Ponto 3: prova acima — item fora da lista do espelho, `# tests 11 / # fail 0` no teste de âncora,
  `Test Files 1 passed (1); Tests 2 passed (2)` e `Test Files 1 passed (1); Tests 27 passed (28)` no vitest,
  `VERIFY: VERDE SEM BANCO (1003s)`; sha próprio `93216be6e3`.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` (`fix(inbox): lote marca so mensagens recebidas e transfere via RPC por contato`)
e `845f146ccf` (`fix(inbox): barra de acoes em lote so fecha o dialogo depois do resultado`) do cartão
`t_8016679b`, cherry-pickados do commit de entrega `1400d7071` como o cartão manda — não são deste cartão.