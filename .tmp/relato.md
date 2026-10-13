Especialista: Íris (area-front-componentes)

ARQUIVO FORA DA LISTA DO CARTÃO (explicação pedida): o cartão lista `src/components/dashboard/leaderboard/LeaderboardHelpers.tsx`, mas esse caminho não existe; o arquivo real das setas do ranking é `src/components/leaderboard/LeaderboardHelpers.tsx` (confirmado por `git grep -n "RankBadge\|previousRank"`, que só aponta para `src/components/leaderboard/`). Como o item 2 do cartão é "remova as setas de variação do ranking", editei o arquivo REAL — o mesmo arquivo que já tem o teste vizinho `LeaderboardHelpers.random.test.tsx`.

## O que mudou e por quê
- `src/components/dashboard/overview/GamificationSection.tsx`: o widget "Conquistas" passa a renderizar o painel REAL (`<AchievementsSystem showCompact />`, que lê `agent_achievements`/`agent_stats` da conta); os demais widgets seguem iguais. Antes caía no `DashboardWidgetRenderer`, cujo `case 'achievements'` devolvia o `DemoAchievements` — painel de demonstração que usa um `GamificationProvider` que o dashboard NÃO monta (o provider devolve um NOOP), por isso os botões "Resposta < 30s", "Streak 5" etc. não faziam nada.
- `src/components/leaderboard/LeaderboardHelpers.tsx`: o `RankBadge` não recebe mais `previousRank` nem renderiza a variação (seta `TrendingUp`/`TrendingDown` + número e o traço `Minus` de "sem mudança"). O dado vem de `useLeaderboard`, que preenche `previousRank = row.rank` — não existe histórico de posição, então qualquer seta/traço era variação fabricada. O badge mostra só a posição atual.
- Testes NOVOS: `src/components/dashboard/overview/__tests__/GamificationSection.test.tsx` e `src/components/leaderboard/__tests__/LeaderboardHelpers.rank.test.tsx`.

CRITÉRIO DE PRONTO — item por item:
1. Nenhum controle sem efeito: `GamificationSection.test.tsx` renderiza a TELA real (`GamificationSection` → `AchievementsSystem`) e afirma que a demonstração NÃO está no DOM (`Teste as conquistas clicando nos botões abaixo:`, `Resposta < 30s`, `Streak 5`, `Level Up!`) — linhas 128-135.
2. Nenhuma seta falsa: `LeaderboardHelpers.rank.test.tsx` renderiza `LeaderboardRow` real com `rank:5, previousRank:1` e afirma `querySelector('.lucide-trending-up'/'trending-down'/'minus')` = null, mostrando só o número `5`.
3. Conquista real: o teste confirma a leitura no banco (`mockFrom` chamado com `'agent_achievements'`) e a conquista da conta ("Resposta Relâmpago") na tela.

CONCLUÍ.

## Prova
- vermelho antes: `npx vitest run src/components/dashboard/overview/__tests__/GamificationSection.test.tsx src/components/leaderboard/__tests__/LeaderboardHelpers.rank.test.tsx` → linha final `Test Files 2 failed (2) | Tests 3 failed (3)`.
- verde depois: `npx vitest run src/components/dashboard/overview/__tests__/GamificationSection.test.tsx src/components/leaderboard/__tests__/LeaderboardHelpers.rank.test.tsx src/components/leaderboard/__tests__/LeaderboardHelpers.random.test.tsx` → `Test Files 3 passed (3)`, `Tests 6 passed (6)`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (258s)`, com `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard`.

## O que NÃO fiz e por quê
- Não toquei em `DashboardWidgetRenderer.tsx` (não está na lista do cartão). O `case 'achievements'` virou código morto; a limpeza e outros 2 achados (`Leaderboard.tsx` botão "Ver ranking completo" sem `onClick`; duplo toggle do cabeçalho da seção) ficaram no `kanban_comment` do cartão.
- Não mexi no `CelebrationParticles` do ranking: só dispara se `previousRank !== rank`, o que nunca ocorre com o dado atual — não é controle, e o cartão pediu só as setas.
