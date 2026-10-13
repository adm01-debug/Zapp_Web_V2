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

## Sobre os avisos do juiz
- Teste removido/afrouxado: SIM, e foi o cartão que mandou. O card pede "hook sem
  referência a tags de contato"; a função de tags saiu do app (ordem do Joaquim,
  12/10), então os casos de teste que escreviam/líam `contact.tags` saíram junto
  com o código (`ab6a87cacf`). Os testes que cobrem o bloqueio REAL na Evolution
  e a resolução de instância seguem no arquivo e passam: 6 verdes.
- Critério de pronto: o hook não cita mais `tags` (conferível em
  `useContactQuickActions.ts`); a lógica de bloqueio fica pela Evolution, sem a
  coluna de tags; o VIP NÃO tem coluna dedicada (`is_vip` não existe no schema,
  reconhecimento de 13/10), então não há onde persistir e as ações de VIP saíram
  — o selo do cabeçalho continua derivado de `contact.tags` (legado) e está
  registrado como ponto do cartão TG-A.

## O que NÃO fiz e por quê
- Nenhuma mudança de lógica: a recusa era só de texto/formatação e o revisor
  confirmou que a lógica e o escopo estão corretos.
