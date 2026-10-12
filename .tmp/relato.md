Especialista: iris (telas e componentes) — código executado pela iris em 11/10, verificado agora pelo Claude Code via comando fixo, orquestrado pelo complexo.

## O que mudou e por quê
- `src/components/tasks/list/TasksListTable.tsx` (NOVO, commit 66a5dead7): a Lista vira `<table>` — 6 colunas do contrato do plano 301/302 (Tarefa, Contato, Prioridade, Prazo, Lembrete, Estado), `<thead>` fixo, grupos como linhas de seção com ícone circular, contador e subtítulo de data no Hoje; célula Tarefa com TaskCheckbox + motivo âmbar; célula Contato com avatar que abre a conversa.
- `src/components/tasks/list/TasksListMode.tsx`: passa a renderizar a tabela; montagem no TasksModule inalterada.
- Testes próprios: `TasksListTable.test.tsx` (casos 1, 2, 2b, 4, 4b, 5, 5b, 6, 3) e `TasksListMode.test.tsx` (8 casos, 6 seções na ordem, Concluídas recolhida, vazios).
- Mapeamento do critério 1 (etapas 050/051/053/054 contra plano e imagens): provado no relato anterior, commit 05b9fbaf7.
- Faixa dos 3 pais (t_a332243d, t_17bbbc0f, t_2a65fbc1) por cherry-pick da base do próprio pai, conforme correção do revisor — já estava na branch, nada a trazer.

## Prova
- verde depois (agora, Claude Code): `npx vitest run src/components/tasks src/hooks/tasks` → 34 arquivos, 395 testes passando, 1 todo.
- verde depois (agora, Claude Code): `zapp-verify . --rapido` → passou db_guard, tipos, lint e migrations; `banco_local` NÃO VERIFICADO (sem nome de conjunto; cartão front-only, sem migration).
- vermelho antes (sessão anterior, registrado no cartão): Lista antiga restaurada → par isolado da Lista com 3 failed | 13 passed; suite de tarefas/inbox 809 passed | 2 todo após a correção.
- Conferência minha no diff: sem IDs de outros cartões no meu trecho; sem cor literal (só `hsl(var(--...))`); framer-motion com `useReducedMotion`.

## O que NÃO fiz e por quê
- Não reescrevi código: pronto e provado; o Claude Code confirmou e não alterou nada.
- O Claude Code não abriu skill de área iris (inexistente no ambiente dele); a comparação linha a linha com as imagens ficou no relato anterior (05b9fbaf7).
