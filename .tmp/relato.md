Especialista: senior (area-testes-do-produto)

## Contexto do refazer
- O trabalho recusado era o commit `c93235039` com o teste de regressão de integração do Ctrl+2.
- Trouxe a base atual com `hermes-tarefa-iniciar` (`BASE=dia/2026-10-12`) e tentei reaplicar `c93235039` com `git cherry-pick`.
- O cherry-pick conflitou porque a branch do dia já contém uma versão equivalente do teste em `src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx`; resolvi mantendo a versão já presente na branch do dia e o cherry-pick ficou vazio, portanto não criei commit de código.

## Pontos da recusa
- Ponto 1: refazer sobre a ponta da branch do dia atual. Feito: workspace criado em `dia/2026-10-12`; `git status --short --branch` mostrou `## v2/regressao-ctrl2-dashboard-view-26101217496e57` antes do fechamento.
- Ponto 2: preservar o que já entrou na branch do dia. Feito: o conflito do `git cherry-pick c93235039` foi resolvido com `git checkout --ours -- src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx`, mantendo a versão já presente na branch do dia; o resultado do cherry-pick ficou vazio e foi pulado.
- Ponto 3: garantir que o teste de regressão continue provando o bug real, não apenas o aviso/toast. Feito: o teste atual lê a view entregue ao `AppShell` e a URL canônica. Prova vermelha: mutação temporária em `src/hooks/ui/useGlobalKeyboardShortcuts.ts` trocando `navigateToView('dashboard')` por `navigate('/')` fez `npx vitest run src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` sair com `mutacao_exit=1` e falhar em `expected 'inbox' to be 'dashboard'`. Prova verde: restaurado o arquivo, o mesmo comando saiu com `Test Files  1 passed (1)` e `Tests  3 passed (3)`.

## Arquivos no diff deste refazer
- `.tmp/relato.md` — relato versionado do fechamento.

Não há diff de código contra `dia/2026-10-12`. A resolução correta foi preservar a versão já presente na branch do dia e não duplicar nem afrouxar o teste.

## Verificações executadas
- `bun install` — concluiu com dependências instaladas.
- `git cherry-pick c93235039` — conflito no teste existente; resolvido preservando a versão da branch do dia; `git cherry-pick --continue` informou cherry-pick vazio e o fluxo foi finalizado com skip.
- Prova vermelha: mutação temporária de `navigateToView('dashboard')` para `navigate('/')` + `npx vitest run src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` — `mutacao_exit=1`, falha esperada em `expect(viewNoShell()).toBe('dashboard')`.
- Prova verde: `npx vitest run src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` — `Test Files  1 passed (1)`; `Tests  3 passed (3)`.
- `git diff --stat dia/2026-10-12...HEAD -- ':!.tmp/relato.md'` e `git diff --name-only dia/2026-10-12...HEAD -- ':!.tmp/relato.md'` — sem saída, confirmando diff final de código vazio.
