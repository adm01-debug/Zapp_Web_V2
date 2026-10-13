Especialista: iris
## O que mudou e por quê
- src/components/gamification/AchievementToast.tsx: o `AchievementToast` (cabeçalho por tipo, XP, ícone, fechar acessível, `aria-live`) passa a ser hospedado por `AchievementCelebrationToaster`, que lê o dado vivo pelo hook do PE-36 (`useAgentCelebrations`) e mostra UMA celebração por vez; movimento reduzido remove o confete (`useReducedMotion`); o toast não bloqueia a tela e o fechar só tira o item da frente da fila.
- src/App.tsx: monta `<AchievementCelebrationToaster />` no mesmo bloco `lazy`/`Suspense` do Sonner (overlay, nada dele na primeira pintura).
- src/components/gamification/__tests__/AchievementToast.test.tsx: 8 testes que chamam o componente real (aria-live desde o 1º render, conquista nova, conquista pré-existente não vira toast, subida de nível, uma por vez + fila, saída automática, confete presente/ausente).
- src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts: neutraliza o overlay de gamificação como os outros overlays do App (o assunto do teste é o listener do Team Chat).
- src/hooks/gamification/useAgentCelebrations.ts: hook trazido do cartão pai PE-36 (dependência do componente; arquivo ainda não integrado na base do dia).
## Prova
- verde depois: `npx vitest run src/components/gamification/__tests__/AchievementToast.test.tsx src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` → `Test Files 2 passed (2); Tests 10 passed (10)`
## Pontos do revisor ([refazer 1])
- Ponto 1 (diff grande demais): resolvido; a entrega anterior trazia a faixa inteira do cartão pai (t_8e0d9185: DemoAchievements, remoção do GamificationProvider e das mutações de XP, useAgentGamification, testes) somada ao toast, dando 94.487 caracteres. Agora o commit traz só os arquivos deste cartão mais o hook `useAgentCelebrations.ts` de que o componente depende: 5 arquivos, 645 inserções, ~32 mil caracteres — abaixo do teto de 90 mil. A limpeza de mutações/XP e do provider fica no cartão dela (branches v2/gamificacao-conquistas-nivel-ao-vivo-2610130437ef89 e v2/gamificacao-remover-mutacoes-xp-cliente-2610122131af5e), fora deste título.
## O que NÃO fiz e por quê
- Não toquei src/hooks/gamification/index.ts, DemoAchievements.tsx, GamificationProvider.tsx, mutations.ts nem useAgentGamification.ts: são a faixa do cartão pai; mantê-los intactos deixa a base do dia consistente e o diff restrito ao toast.
- Sem migration, sem dependência nova, sem exportar/baixar/imprimir nada e sem cor fora dos tokens do design system.
