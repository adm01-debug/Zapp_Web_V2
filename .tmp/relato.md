Especialista: iris

Refazer 1 do cartão de editar/fixar nota na ficha do contato. Os 4 pontos da
recusa estão resolvidos em 2 arquivos, todos dentro da lista do cartão
(`ContactNotes.tsx` + testes). Nenhum outro arquivo foi tocado.

Ponto 1 — fixada antiga sumia: em `src/components/contacts/ContactNotes.tsx`
(`fetchNotes`), a consulta passou a ordenar no servidor antes do limite:
`.order('is_pinned', { ascending: false }).order('created_at',
{ ascending: false }).order('id', { ascending: false }).limit(20)`. Antes era
só `.order('created_at').limit(20)` com reordenação no cliente, e a fixada mais
antiga que as 20 recentes caía do `select`. Teste que prova:
`ContactNotes.ordemFoco.test.tsx >
fixada mais antiga que as 20 recentes segue visível no topo` (mock honra
`.order()` + `.limit()` como o PostgREST, 21 recentes + 1 fixada antiga):
vermelha antes (`Unable to find an element with the text: Nota fixada antiga`,
5 failed), verde depois (fixada no topo com `data-pinned="true"`, 5 passed).

Ponto 2 — foco gerenciado: adicionados refs por id do botão `Editar nota`
(`refBotaoEditar`, com `pendingEditFocusRef` que foca o botão ao remontar),
`refContinuarEditando` (foca `Continuar editando` ao abrir a confirmação via
`confirmAbertaRef`), `continuarEditando` (fecha a confirmação e foca a
textarea) e `fecharEdicaoComFoco` (salvar, esc-sem-alteração e descartar
devolvem o foco ao `Editar nota` da mesma nota). Testes que provam (mesmo
arquivo, `document.activeElement`): `salvar devolve o foco ao Editar nota`,
`esc sem alteração fecha e devolve o foco ao Editar`, `esc com alteração foca
Continuar editando; continuar volta à textarea; descartar volta ao Editar`.
Vermelha antes (`expected <body> to be <button>`, foco caía no body), verde
depois (5 passed).

Ponto 3 — desempate por id: `orderNotes` ganhou o desempate final por `id`
desc, igual ao `compareContactNotes` do hook, e o comentário acima dela registra
a ordem do servidor. Teste que prova: `empate de created_at rende ordem
determinística por id desc` (duas notas no mesmo instante, inseridas [A, B]):
vermelha antes (primeiro cartão com `Texto A`), verde depois (`Texto B`
primeiro, `Texto A` depois). Sem `export` no componente: a primeira versão
exportava `orderNotes` e o lint acusou `react-refresh/only-export-components`;
voltei a função para privada e o teste virou ponta a ponta via render.

Ponto 4 — prova do verde com os testes novos (comando e linha de resultado):
`bun x vitest run src/components/contacts/__tests__/ContactNotes.ordemFoco.test.tsx`
→ `Test Files 1 passed (1)` + `Tests 5 passed (5)` (antes: `1 failed (1)` /
`5 failed (5)`).

Arquivos desta entrega (commit c451d8e27c):
- src/components/contacts/ContactNotes.tsx
- src/components/contacts/__tests__/ContactNotes.ordemFoco.test.tsx

Verificações reais, todas verdes:
- `bun x vitest run src/components/contacts src/hooks/crm` →
  `Test Files 54 passed (54)` + `Tests 378 passed | 1 expected fail (379)`
- `bun x tsc --noEmit -p tsconfig.json` → sem saída (limpo)
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (9s)` (exit 0; sem
  banco porque o cartão não tem migration minha)
- hook de commit (lint ratchet): `OK: nenhuma nova divida de lint foi introduzida.`
