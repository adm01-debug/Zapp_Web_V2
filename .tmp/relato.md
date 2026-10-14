Especialista: worker (geral)

CONCLUÍDO — o item do ESPELHO DO CI que o cartão aponta não existe mais com este diff.

## O que mudou
- `ESTADO.md:65`: a âncora da edge `batch-fetch-avatars` passou de
  `src/hooks/inbox/useInboxBulkActions.ts:143` para `src/hooks/inbox/useInboxBulkActions.ts:165`.
  A entrega de t_8016679b mexeu nesse hook (bloco de exclusão de contatos) e empurrou a chamada
  `supabase.functions.invoke('batch-fetch-avatars')` da linha 143 para a 165; a âncora publicada no
  ESTADO.md ficou apontando para uma linha que não cita mais a edge, e foi isso que derrubou o teste.
- SHA do diff próprio do cartão: `93216be6e3` (só `ESTADO.md`, 1 inserção / 1 remoção).

## Prova
- vermelho antes (árvore com os commits do pai, sem a correção):
  `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
  `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
  `error: 'âncora desatualizada: src/hooks/inbox/useInboxBulkActions.ts:143 não cita batch-fetch-avatars'`
- verde depois (mesmo comando): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
  `# pass 11` / `# fail 0`
- espelho do CI (`/home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh .`): o item
  `node: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` NÃO aparece na lista.
  A lista restante é exatamente a da base `453e6b69f9` (4 itens, registrados em
  `.ci-base-453e6b69f9cabf1a293492139de5520a29f576fe.txt`) mais 6 itens de `scripts/ci/lint-ratchet.unit.mjs`
  que falham apenas nesta sessão por `HERMES-GUARD (git): git init é proibido nesta sessão` (o guard
  desta sessão bloqueia as fixtures; não é regressão do diff).
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`,
  `VERIFY: VERDE SEM BANCO (1003s)` (saída padrão do modo --rapido, que não inclui o banco local).

## Pontos do cartão (O QUE FAZER)
- Ponto 1: parti da entrega com `git cherry-pick -x` dos dois commits de código dela
  (`647c2890fd` e `845f146ccf`) sobre a ponta atual de `dia/2026-10-13` (`453e6b69f9`) — não recomecei.
- Ponto 2: reproduzi o item no espelho e corrigi a causa em `ESTADO.md:65` (âncora `:143` → `:165`);
  nenhuma asserção foi afrouxada — `scripts/ci/docs-estado-registry-convention.unit.mjs` ficou intacto.
- Ponto 3: provei com o mesmo comando do cartão (`ci_espelho.sh .`, item ausente da lista), com
  `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `# pass 11 / # fail 0` e com
  `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (1003s)`; sha do diff próprio `93216be6e3`.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` (`fix(inbox): lote marca so mensagens recebidas e transfere via RPC por contato`)
e `845f146ccf` (`fix(inbox): barra de acoes em lote so fecha o dialogo depois do resultado`) do cartão
`t_8016679b`, cherry-pickados do commit de entrega `1400d7071` como o cartão manda — não são deste cartão.
