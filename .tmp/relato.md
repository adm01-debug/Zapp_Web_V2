Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/dashboard/overview/GamificationSection.tsx`: o widget "Conquistas" passa a renderizar o painel REAL (`<AchievementsSystem showCompact />`, que lê `agent_achievements`/`agent_stats` da conta); qualquer outro widget segue igual. Antes caía no `DashboardWidgetRenderer`, cujo `case 'achievements'` devolvia o `DemoAchievements` — painel de demonstração que depende de um `GamificationProvider` que o dashboard não monta (o provider devolve um NOOP), por isso os botões "Resposta < 30s", "Streak 5" etc. não faziam nada. Alvo do escopo: `src/components/dashboard/overview/GamificationSection.tsx`.
- `src/components/leaderboard/LeaderboardHelpers.tsx`: o `RankBadge` deixa de receber `previousRank` e de renderizar a variação (seta `TrendingUp`/`TrendingDown` + número, e o traço `Minus` de "sem mudança"). O dado vem de `useLeaderboard`, que preenche `previousRank = row.rank` — não existe histórico de posição, então qualquer seta/traço era variação fabricada. O badge mostra só a posição atual. Alvo do escopo: `src/components/leaderboard/LeaderboardHelpers.tsx` (o cartão citou o caminho com `dashboard/` a mais; o real é `src/components/leaderboard/`).
- Testes NOVOS: `src/components/dashboard/overview/__tests__/GamificationSection.test.tsx` e `src/components/leaderboard/__tests__/LeaderboardHelpers.rank.test.tsx`.

Critério de pronto — item por item:
1. "Nenhum controle sem efeito": o teste renderiza a TELA real (`GamificationSection` → `AchievementsSystem`) e afirma que as frases/botões da demonstração NÃO estão no DOM (`Teste as conquistas clicando nos botões abaixo:`, `Resposta < 30s`, `Streak 5`, `Level Up!`) — `GamificationSection.test.tsx:128-135`.
2. "Nenhuma seta falsa": `LeaderboardHelpers.rank.test.tsx` renderiza `LeaderboardRow` (componente real) com `rank:5, previousRank:1` e afirma `container.querySelector('.lucide-trending-up'/'trending-down'/'minus') === null`, mostrando só o número `5`.
3. Conquista real: o teste confirma que a leitura vai ao banco (`mockFrom` chamado com `'agent_achievements'`) e que a conquista da conta ("Resposta Relâmpago") aparece na tela.

## Prova
- vermelho antes: `npx vitest run src/components/dashboard/overview/__tests__/GamificationSection.test.tsx src/components/leaderboard/__tests__/LeaderboardHelpers.rank.test.tsx` → `Test Files 2 failed (2); Tests 3 failed (3)` (o painel real não aparecia/no DOM estava o `DemoAchievements`; o badge ainda tinha a seta).
- verde depois: mesmo comando → `Test Files 3 passed (3); Tests 6 passed (6)` (inclui o teste vizinho `LeaderboardHelpers.random.test.tsx`).
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (258s)` com `OK tipos`, `OK lint`, `OK migrations`, `OK db_guard`.

## O que NÃO fiz e por quê
- Não toquei em `DashboardWidgetRenderer.tsx` (não está nos arquivos do cartão). O `case 'achievements'` virou código morto e a limpeza ficou em `kanban_comment` junto com outros 2 achados (`Leaderboard.tsx` botão sem `onClick`; duplo toggle do cabeçalho da seção).
- Não mexi no `CelebrationParticles` do ranking: ele só dispara se `previousRank !== rank`, o que nunca ocorre com o dado atual — não é controle, e o cartão pediu só as setas.
