Especialista: iris

## O que mudou e por quê
- `src/components/gamification/AchievementToast.tsx:355`: novo export `AchievementCelebrationToaster`, o host do toast no topo do app, alimentado por `useAgentCelebrations` (o hook do cartão pai PE-36, t_8e0d9185 — nada simulado: a fila vem do cadastro de conquista e da subida de nível que o servidor grava). Mostra UMA celebração por vez: conquista nova (nome, descrição e XP) ou subida de nível (nível anterior, novo e XP).
- `src/components/gamification/AchievementToast.tsx:369`: a região `<div role="status" aria-live="polite" aria-atomic="true">` já existe no primeiro render, antes de qualquer celebração (leitor de tela anuncia o que chega). Não bloqueia a tela: o overlay não tem camada de tela cheia — só o cartão (`AchievementToast.tsx:171`, `top-6`, `pointer-events-auto` no próprio cartão) e ele sai sozinho pelo `duration` (`AchievementToast.tsx:154`) ou pelo botão "Fechar aviso de conquista" (`AchievementToast.tsx:284`, agora com `aria-label` e alcançável pelo teclado — antes era `opacity-0` até o hover).
- `src/components/gamification/AchievementToast.tsx:149`: `useReducedMotion()` desliga confete, brilho pulsante, giro do ícone e shimmer; com movimento reduzido a entrada/saída vira só opacidade. O toast ganhou `title`/`description` opcionais (o tipo de conquista do banco vira visual por mapa, com cabeçalho neutro para o que não tem visual próprio).
- `src/components/gamification/AchievementToast.tsx:150`: a lista de partículas passou a ser derivada — saiu o `setState` dentro do `useEffect`, o que também apaga o erro `react-hooks/set-state-in-effect` que o arquivo trazia.
- `src/App.tsx:64` e `src/App.tsx:92`: montagem no bloco de overlays `DeferredProviders`, em `lazy()` no mesmo padrão do Sonner (nada dele na primeira pintura).
- `src/components/gamification/__tests__/AchievementToast.test.tsx`: 8 testes novos.
- `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts`: +1 mock do overlay novo (mesmo tratamento que esse arquivo já dá a `Toaster`, `Sonner` e `LiveRegion`); nenhuma asserção existente foi alterada. Sem isso o teste do listener montava o App com o toast real e caía por causa do mock parcial de `lucide-react` dele.

## Prova
- verde (teste novo): `npx vitest run src/components/gamification/__tests__/AchievementToast.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`
- verde (conjunto da área + o teste de App afetado): `npx vitest run src/components/gamification src/hooks/gamification src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` → `Test Files 8 passed (8); Tests 45 passed (45)`
- verde (guardas do app): `npx vitest run src/__tests__` → `Test Files 7 passed (7); Tests 68 passed | 3 todo (71)`
- lint dos arquivos tocados: `npx eslint src/components/gamification/AchievementToast.tsx src/App.tsx` → `1 problem (0 errors, 1 warning)`; o warning é o `react-refresh/only-export-components` que o arquivo já tinha (ele já exportava componente e hook antes deste cartão).
- vermelho antes: `AchievementCelebrationToaster` não existia antes deste commit — o arquivo era só o toast de apresentação, sem nenhum consumidor no app; o teste novo não compila nem passa na base (o fechar mede abaixo).

## Como os 8 testes provam (renderizam a tela real, com o hook real; só o canal do Supabase é simulado)
- `existe antes de qualquer celebração e anuncia em aria-live polite` — região `role=status`, `aria-live=polite`, `aria-atomic=true`, vazia.
- `conquista nova aparece com nome, descrição e XP` — "Marco de 500 mensagens", "Você chegou a 500 mensagens", "+50 XP".
- `conquista que já existia antes de assinar não vira toast` — a linha antiga do banco vira semente, não festa (é o que evita repetir conquista velha a cada recarga).
- `subida de nível mostra nível anterior, novo e XP` — "Nível 4!", "Você subiu do nível 3 para o nível 4", "+240 XP".
- `mostra uma por vez; fechar traz a próxima e não volta` — a segunda fica na fila e aparece só depois do fechar.
- `sai sozinho depois do tempo, sem clique` — com `duration` curto o cartão some sem interação.
- `com movimento reduzido não traz confete` e `sem movimento reduzido o confete aparece` — os dois lados do `prefers-reduced-motion`.

## CRITÉRIO DE PRONTO
1. Feedback de conquista sem atrapalhar o trabalho — uma por vez, o que já existia no banco não vira festa, sai sozinho e é dispensável (testes acima); nenhuma camada que cubra a tela (`AchievementToast.tsx:171`); subida de nível é a mesma celebração discreta, com o número do nível no texto.
2. `zapp-verify . --rapido` verde — medido pelo fechar (bloco FATOS MEDIDOS).

## NÃO FEITO
- "captura" (print do toast): NÃO FEITO — o projeto não tem rota de harness para overlay e o print exigiria subir o app com conquista real gravada no banco local (violaria a regra de E2E local autenticado, que proíbe sessão/real de produção e não tem como forjar o evento do banco no navegador). A prova de tela é o teste, que renderiza a tela real e conferiu o DOM: nome, descrição, XP, nível anterior/novo, política de anúncio, fechar, auto-saída e confete sob movimento reduzido. Se o print for obrigatório, precisa de cartão com rota de harness (fora dos arquivos deste cartão).

## Nota sobre o tamanho do diff
O diff contra a `dia` inclui a FAIXA do cartão pai (PE-36, t_8e0d9185), trazida por `git cherry-pick` como o próprio cartão manda. Arquivos dessa faixa (3 commits: `c26046478`, `48a627a2a`, `f037b539b`), que NÃO são deste cartão:
- `src/hooks/gamification/useAgentCelebrations.ts` (novo — o hook que este cartão consome)
- `src/hooks/gamification/index.ts`, `src/hooks/gamification/useAgentGamification.ts`
- `src/hooks/gamification/mutations.ts` (removido), `src/components/gamification/GamificationProvider.tsx` (removido)
- `src/components/gamification/DemoAchievements.tsx`
- `src/hooks/gamification/__tests__/useAgentCelebrations.test.tsx` (novo)
- `src/hooks/gamification/__tests__/gamificacaoSemEscritaNoCliente.test.ts` (novo)
- `src/hooks/gamification/__tests__/mutations.test.tsx` (removido)
- `src/hooks/__tests__/useAgentGamification.test.tsx`
- `.tmp/relato.md` (o relato herdado, reescrito aqui)

A minha parte é o commit `f4e8dfc13` (`src/App.tsx`, `src/components/gamification/AchievementToast.tsx`, `src/components/gamification/__tests__/AchievementToast.test.tsx`), o ajuste de mock em `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` (`22ea56af5`) e este relato (`7c38f34f0`).

Especialista: iris (area-front-componentes)
