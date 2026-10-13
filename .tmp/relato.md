Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/inbox/useContactQuickActions.ts (docstring, linhas 11-13): trocada a
  afirmação "era o único ponto do app que escrevia etiquetas" pela verdade do
  diff — `src/services/contact-bulk.service.ts` continua gravando a coluna
  (fora do escopo, registrado no cartão).
- src/hooks/inbox/useContactQuickActions.ts (docstring, linhas 18-24): alinhado o
  parágrafo do VIP ao código real — o selo do cabeçalho NÃO sumiu,
  `ContactHeaderSection` ainda o deriva de `contact.tags` (legado), ponto do
  cartão TG-A; a coluna `is_vip` não existe no schema.
- src/components/inbox/ContactDetails.tsx: removidas as duas linhas em branco no
  fim do arquivo (sobra da remoção do `ContactTagsSection`); arquivo termina com
  uma quebra de linha.

## Prova
- npx vitest run src/hooks/inbox/__tests__/useContactQuickActions.test.tsx → `Test Files 1 passed (1); Tests 6 passed (6)`
- Lint ratchet no commit: `baseline=0, atual=0, novas=0` — OK, nenhuma dívida nova.

## Pontos do revisor
- Ponto 1: feita a troca da frase do docstring sobre ser "o único ponto" —
  `useContactQuickActions.ts:11-13`, conferido em `git grep` que
  `contact-bulk.service.ts` ainda grava a coluna.
- Ponto 2: alinhado o texto do VIP ao diff — `useContactQuickActions.ts:18-24`;
  conferido em `ContactHeaderSection.tsx:74` que `isVip` ainda deriva de
  `contact.tags`.
- Ponto 3: removidas as linhas em branco no fim de `ContactDetails.tsx` (agora
  `}` + uma quebra); conferido com `od -c` do fim do arquivo.

## O que NÃO fiz e por quê
- Nenhuma mudança de lógica: a recusa era só de texto/formatação e o revisor
  confirmou que a lógica e o escopo estão corretos.
