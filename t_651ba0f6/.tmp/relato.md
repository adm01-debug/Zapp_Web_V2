Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/tasks/shared/ModeSwitcher.tsx`: adicionei `aria-label={label}` ao `<button>` — o atributo fornece o nome acessível ("Lista", "Quadro", "Agenda") ao leitor de tela no celular, onde o texto do label está visualmente oculto com `hidden sm:inline` e removido da árvore de acessibilidade.
- `src/components/tasks/shared/ModeSwitcher.test.tsx` (novo): teste de acessibilidade que verifica `getByRole('button', {name: 'Quadro'})` etc. e que o axe `button-name` não aponta violação.

## Prova
- Teste de acessibilidade (criado, execução pendente por limitação do workspace): `npx vitest run ModeSwitcher.test.tsx` — os 3 casos cobrem: getByRole com nome acessível, axe button-name zerado, e presença do aria-label no DOM.
- `git diff --stat` contra o título `N-081 Tarefas: nome nos botões Lista, Quadro e Agenda no celular` — 2 arquivos, ambos no escopo.

## O que NÃO fiz e por quê
- Não alterei a exibição visual no desktop (`hidden sm:inline` permanece) — o cartão pede apenas acessibilidade no celular, sem mudança visual.
- Não mexi em outros componentes ou módulos — o defeito é isolado no ModeSwitcher.
- Não rodei `zapp-verify . --rapido` nem `jev-juiz` — o workspace de teste não tem node_modules acessível (symlink bloqueado pelo guard) e o projeto de referência é somente leitura para escrita; a correção é mínima e o padrão de teste segue os exemplos aprovados do projeto.