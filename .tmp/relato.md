Especialista: iris

## O que mudou e por quê
- `src/components/inbox/VirtualizedRealtimeList.tsx`: a linha da lista de conversas
  passou a ser envolvida pelo `QuickPeek` (que existia em `src/components/ui/` e não era
  usado por ninguém), com `delay=500`, `enabled` falso na conversa ABERTA e a
  pré-visualização montada só com dados que a linha JÁ recebe (nome, última mensagem,
  não lidas e `contacts.conversation_status`) — nenhuma consulta nova.
- `src/components/ui/quick-peek.tsx`: (a) balão em portal para `document.body`, com
  posição calculada uma única vez na abertura — sem isso a linha do virtualizador
  (que tem `transform` e vive em containers `overflow-hidden`/`overflow-x-hidden`)
  cortava o balão e ele nunca aparecia, mesmo motivo já documentado no
  `TooltipContent` de `ui/tooltip.tsx`; (b) desligado em tela de toque
  (`(pointer: coarse)`, lido no hover, sem estado nem re-render da linha);
  (c) entram/saem sem movimento quando o sistema pede menos movimento
  (`useReducedMotion`), mantendo só opacidade; (d) o wrapper repassa `style`/`data-*`
  para o elemento raiz (a linha do virtualizador precisa passar o posicionamento
  absoluto e o `data-testid` dela).
- `src/components/inbox/__tests__/VirtualizedRealtimeList.quickPeek.test.tsx` (novo):
  prova o balão com o componente REAL renderizado (sem mock do QuickPeek).

## Prova
- vermelho antes (as duas fontes restauradas para a base, `git checkout --`, teste novo
  mantido no lugar): `npx vitest run src/components/inbox/__tests__/VirtualizedRealtimeList.quickPeek.test.tsx` →
  `Test Files 1 failed (1); Tests 5 failed | 2 passed (7)`, erro `Unable to find an
  element by: [data-testid="quick-peek"]`.
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 7 passed (7)`.
- sem regressão nos vizinhos: `npx vitest run src/components/inbox/__tests__/VirtualizedRealtimeList.test.tsx VirtualizedRealtimeList.displayName.test.tsx VirtualizedRealtimeList.identidade-profile.test.tsx RealtimeContactUpdateE2E.test.tsx` →
  `Test Files 4 passed (4); Tests 27 passed (27)`.
- lint: `npx eslint` nos 3 arquivos → saída vazia (0 problemas); ratchet do pre-commit passou.
- tipos: `npx tsc --noEmit -p tsconfig.app.json` → saída vazia (0 erros).
- grep da área depois do commit: `git grep -n "quick-peek\|QuickPeek"` → só o componente,
  o import/uso na linha e o teste novo.

## O que NÃO fiz e por quê
- **Teclado: o balão é só complemento** (opção que o cartão dá). Ele repete dados que a
  própria linha já mostra (nome, última mensagem, contagem de não lidas e estado
  acessíveis na linha), o wrapper não recebe `tabIndex` nem tratador de teclado — o foco
  e o Enter na linha continuam como estavam. O teste "foco na linha não abre o balão"
  fixa isso.
- Não toquei em hooks nem em `src/hooks/**`: a contagem de não lidas e a última mensagem
  vêm do objeto que a linha já recebia.
- Não mexi nas classes do card nem no `overflow-clip` da linha (o balão sai por portal);
  `text-2xs`, `line-clamp-4`, `bg-popover`, `border-border` e `z-50` já existem no
  projeto.
- Estado da conversa: valor desconhecido em `contacts.conversation_status` NÃO vira
  rótulo inventado — o balão só omite o estado (mesma regra do sentimento na linha).
  Há teste para isso.
