Especialista: iris

## O que mudou e por quê
- src/providers/AppProviders.tsx: a árvore passou a ser envolta em `<MotionConfig reducedMotion="user">` (dentro do ErrorBoundary, acima do QueryClientProvider) — o framer-motion passa a respeitar `prefers-reduced-motion` no app inteiro, sem cada tela ligar o seu.
- src/components/contacts/ContactsView.tsx: removido o `<MotionConfig>` local e o import — sobra exatamente UM na raiz (critério 1).
- src/components/ui/empty-state-illustrations.tsx: as 13 ilustrações passam todas as animações pelo portão `useMotionGate()`; com reduzir movimento o portão devolve `{ initial: false }`, então nenhum `repeat: Infinity` roda (inclusive os de `pathLength`, que o `reducedMotion` da raiz não cobre).
- src/components/ui/empty-state-illustration-art.tsx (NOVO, fora da lista): é a divisão de `empty-state-illustrations.tsx` — a regra da casa `react-refresh/only-export-components` proíbe componente e mapa no mesmo módulo; as artes (só componentes) foram para o `-art.tsx` e o mapa `illustrations` ficou no `.tsx` original. Não é assunto novo, é o mesmo arquivo partido em dois.
- src/components/ui/GenericEmptyState.tsx: o selo pulsante virou `motion-safe:animate-pulse`, então não anima com reduzir movimento ligado.
- src/components/ui/motion/effects.tsx: `AnimatedCounter` guarda o valor anterior num `useRef` estável (anima do valor anterior; não reinicia do zero a cada render) e `Typewriter` mostra o texto completo no modo reduzido, com `onComplete` em ref (trocar a identidade do callback não reinicia o efeito).
- testes novos: src/components/ui/__tests__/emptyStates.movimento.test.tsx, src/components/ui/__tests__/motionEffects.movimento.test.tsx, src/providers/__tests__/AppProviders.motionConfig.test.tsx.

## Prova
- reprodução pedida pela recusa: `zapp-verify full .` → `VERIFY: VERDE SEM BANCO (1958s)` (db_guard OK, tipos OK 160s, lint OK 228s, migrations OK, testes OK 1544s, build OK 24s). O apontamento da recusa era a branch, não uma falha de verificação reproduzível: sobre esta base o full está verde.
- testes novos (verde depois): `npx vitest run src/components/ui/__tests__/motionEffects.movimento.test.tsx src/components/ui/__tests__/emptyStates.movimento.test.tsx src/providers/__tests__/AppProviders.motionConfig.test.tsx` → `Test Files 3 passed (3); Tests 11 passed (11)`.

## Pontos da recusa (refazer 1)
- Ponto 1 — "a branch da tarefa andou depois do fechar": refeito nesta branch. O cartão manda trazer o trabalho anterior por cherry-pick; o cherry-pick do commit do trabalho anterior (5259f64922) sobre a base atual `dia/2026-10-15` (e7d156b8a7) deu o commit f9701940fa, e `git diff --stat e7d156b8a7..HEAD` confere os mesmos 9 arquivos (`588 insertions(+), 166 deletions(-)`). A branch agora é `v2/a11y-motionconfig-raiz-rehacer-2610151731b57c`, com o HEAD no estado novo.
- Ponto 2 — "reproduza a falha com `zapp-verify full .`, corrija e feche de novo": reproduzido; nenhuma falha aparece (ver Prova). Não havia falha a corrigir além da branch desatualizada.

## Arquivo fora da lista (pedido de justificativa)
ARQUIVO FORA DA LISTA — src/components/ui/empty-state-illustration-art.tsx: indispensável. Ele é a divisão do arquivo listado src/components/ui/empty-state-illustrations.tsx: a regra da casa `react-refresh/only-export-components` proíbe um módulo exportar componente e valor (o mapa `illustrations`) ao mesmo tempo, e o lint (etapa `lint` do zapp-verify) reprova com os dois no mesmo arquivo. Por isso as 13 artes, que são só componentes, foram para o `-art.tsx`, e o `empty-state-illustrations.tsx` ficou só com o mapa. Sem esse arquivo o cartão não passa o lint. Não há arquivo de outro assunto aqui: é o mesmo conteúdo do arquivo listado, partido em dois.

## O que NÃO fiz e por quê
- Não alterei nenhuma linha de código/teste além de reproduzir o cherry-pick: o `zapp-verify full .` não reproduziu falha sobre esta base, então não havia o que corrigir.
- FAIXA DO PAI: os commits vieram por `git cherry-pick` do trabalho anterior DESTA MESMA tarefa (branch `v2/a11y-motionconfig-raiz-illustracoes-26101516349aad`, commit 5259f64922) — não são de outro cartão.
