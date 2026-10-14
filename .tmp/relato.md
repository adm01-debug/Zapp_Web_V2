Especialista: worker (geral)

## O que mudou e por quê
- `ESTADO.md:65`: a âncora da edge `batch-fetch-avatars` no hook da barra de ações em lote passou de
  `src/hooks/inbox/useInboxBulkActions.ts:143` para `:165`. A entrega de t_8016679b mexeu nesse hook
  (bloco de exclusão de contatos) e empurrou a chamada de `supabase.functions.invoke('batch-fetch-avatars')`
  da linha 143 para a 165; a âncora publicada ficou apontando para uma linha que não cita mais a edge.
- Nenhuma asserção foi afrouxada: o teste `ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
  continua exigindo arquivo existente e linha que cite a edge.

## Prova
- vermelho antes (árvore com os commits do pai cherry-pickados, sem a correção):
  `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` →
  `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
  `error: 'âncora desatualizada: src/hooks/inbox/useInboxBulkActions.ts:143 não cita batch-fetch-avatars'`
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `# pass 11` / `# fail 0`
- Espelho do CI (`ci_espelho.sh .`): o item do cartão
  (`node: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`) NÃO aparece mais na lista.
  A lista restante é a da base `453e6b69f9` (4 itens, arquivo `.ci-base-453e6b69f9…txt`) mais 6 itens
  `scripts/ci/lint-ratchet.unit.mjs` que falham SÓ nesta sessão: o erro é
  `HERMES-GUARD (git): git init é proibido nesta sessão` nas fixtures, artefato do guard e não do diff.
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`,
  `VERIFY: VERDE SEM BANCO (1003s)`.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` (`fix(inbox): lote marca so mensagens recebidas e transfere via RPC por contato`)
e `845f146ccf` (`fix(inbox): barra de acoes em lote so fecha o dialogo depois do resultado`) do cartão
`t_8016679b` — cherry-pickados do commit de entrega `1400d7071` como o cartão manda (partir da entrega, não
recomeçar) — não são deste cartão. O diff próprio deste cartão é só `ESTADO.md`.

## O que NÃO fiz e por quê
- Não mudei o teste de âncora nem o relaxei: o defeito era a âncora do documento, não a guarda.
- Não mexi nos 6 itens de `lint-ratchet.unit.mjs`: são o guard desta sessão bloqueando `git init` nas fixtures
  (já conhecido local), não regressão da entrega — a base do integrador não os lista.
