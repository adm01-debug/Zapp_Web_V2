Especialista: hugo
Refazer 1 — a entrega anterior (bd9357d3b) foi retirada pelo limpador porque quebrava `InternalNotesPanel.test.tsx` no empilhamento sobre dia/2026-10-14. Aproveitei o trabalho anterior (branch já estava neste workspace, sem cherry-pick novo) e corrigi só o apontado.

Ponto 1 (único) da recusa — selo some quando a lista de nomes ativos está indisponível
Causa conferida no código: `InternalNotesPanel.tsx` passou o selo para `splitMentionText(content, mentionableNames ?? [])`. O teste empilhado (de outro cartão, presente em dia/2026-10-14) mocka `from('profiles')` só com `.eq() -> .single()`; `useMentionableProfileNames` chama `.order().range()` nessa cadeia, a queryFn rejeita, `mentionableNames` fica `undefined` e, sem nomes, nada virava selo — `findByText('@ana')` falhava. Reproduzi o vermelho com o arquivo do teste empilhado copiado de `dia/2026-10-14` (temporário, removido antes do commit, não entra no diff): `Test Files 1 failed (1), Tests 1 failed | 7 passed (8)`, falha em `transforma @menção em destaque` na linha do `findByText('@ana')`.
O que mudei (`src/components/inbox/collaboration/InternalNotesPanel.tsx`, +15/-1): em `renderNoteContent`, quando `mentionableNames === undefined` (lista ainda carregando ou com erro na consulta auxiliar), cai no comportamento anterior byte a byte (`content.split(/(@\w+)/g)`, selo em `part.startsWith('@')`); com a lista carregada (inclusive `[]`), usa `splitMentionText` como antes. Não mexi no teste do outro cartão nem no contrato do selo por nome ativo: segunda passada com `grep` confirmou que `splitMentionText` só tem este chamador e `useMentionableProfiles` só o `MentionInput`; nenhum toast, evento ou escrita duplicado; nenhum arquivo de guarda/manifesto/CI tocado.
Teste que prova (novo, meu, chama o componente real): `src/components/inbox/collaboration/__tests__/InternalNotesPanel.mentionFallback.test.tsx` — caso 1 (nomes `undefined`, nota `Falar com @ana sobre o pedido`) exige o selo `@ana` e o texto em volta: VERMELHO antes (`Tests 1 failed | 1 passed (2)`, mesma falha no `findByText('@ana')`) e VERDE depois; caso 2 (nomes `['Ana Lima']`, nota `Falar com @Ana Lima sobre o pedido`) guarda o pedido original (selo com o nome inteiro) e passa antes e depois.
Sobre t_e8894a7d: a correção proposta lá (mexer no mock/conteúdo do teste do outro cartão) não foi aplicada — o fallback em produção resolve sem tocar em arquivo alheio e sem afrouxar nenhuma asserção. Irmãos verificados em `~/.v2-fila/*.json`: nenhum refaz este selo (PO1/PD-86 cobrem `@` derrubando a tela, caminho não tocado aqui). Item 3 do pedido (aviso ao marcado): mantido o registrado na entrega anterior (sem canal no cliente; proposta de trilha de banco em uma linha, sem criar tabela).

Arquivos (git diff --name-only bd9357d3b2...HEAD, colado do comando):
.tmp/relato.md
src/components/inbox/collaboration/InternalNotesPanel.tsx
src/components/inbox/collaboration/__tests__/InternalNotesPanel.mentionFallback.test.tsx

Verificação:
npx vitest run <5 arquivos: InternalNotesPanel.test (empilhado, temporário) + mentionFallback + mentionText + useMentionableProfiles + MentionInput.a11y> → Test Files 5 passed (5), Tests 27 passed (27)
npx vitest run <os 4 arquivos do meu diff> → Test Files 4 passed (4), Tests 19 passed (19)
npx eslint nos 2 arquivos do diff → 0 errors (1 warning pré-existente em import do client na linha 3, já estava na entrega anterior)
zapp-verify . --rapido → VERIFY: VERDE SEM BANCO (OK db_guard 0s / OK tipos 15s / OK lint 2s / OK migrations 0s; sem banco porque não há migration — front-only)
