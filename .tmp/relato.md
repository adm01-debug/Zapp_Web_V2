Especialista: iris

## Comando de verificação e resultado real
- `npx vitest run src/components/team-chat src/hooks/team-chat` →
  `Test Files  36 passed (36)` / `Tests  370 passed | 1 todo (371)`
- `zapp-verify . --rapido` → `OK db_guard 0s` / `FALHOU tipos 152s` /
  `tc-rapido: tsc saiu 137 em app (falha de execução, NÃO é aprovação)` /
  `VERIFY: VERMELHO em tipos (152s)`.
  O 137 é o kernel matando o tsc por falta de memória: `free -h` no momento →
  `Mem: 47Gi total, 42Gi used, 840Mi free` e o pool `pesado` do zapp-sem esperando vaga
  ("aguardando vaga no pool 'pesado' (3 em uso)"), ou seja, OUTROS agentes estavam rodando
  verificação ao mesmo tempo. `git diff --stat` do meu commit não tem arquivo de tipo/tsconfig;
  é falha de execução do ambiente, não erro de tipo do meu diff. Repeti o tsc do projeto `app`
  isolado (`node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --incremental`)
  e também saiu `RC=137`.

## Arquivos que EU toquei (todos dentro de ARQUIVOS QUE PODE TOCAR)
- `src/components/team-chat/TeamChatPanel.tsx` — liga digitação e presença da conversa
  (`useTeamTyping`/`useTeamPresence`), chama `sendTyping` ao digitar, publica o texto na
  região viva, ganha skip link + anunciador, janela de 200 mensagens e o botão
  "Pular para mensagens novas".
- `src/components/team-chat/TeamChatHeader.tsx` — mostra "Fulano está digitando…" no lugar do
  subtítulo e "N membros · K online" (props novas opcionais).
- `src/components/team-chat/TeamConversationList.tsx` — estados de carregando (esqueleto) e erro
  (com "Tentar novamente"), busca também pelo texto da última mensagem, Ctrl/Cmd+K foca a busca
  e Esc limpa.
- `src/components/team-chat/TeamChatView.tsx` — passa `isLoading`/`isError`/`refetch` para a lista
  e mostra esqueleto/erro na área do chat.
- Testes: `__tests__/team-chat-presenca-a11y-carga.test.tsx` (NOVO, 14 casos), e ajuste de infra
  em `__tests__/TeamChatPanel.wiring.test.tsx` e `__tests__/team-chat-n182-a11y.test.tsx`
  (stub do `supabase.channel` dos canais privados que o painel passou a assinar) e
  `__tests__/team-chat-exhaustive-audit.test.ts` (as duas asserções "GAP: no typing indicators"
  e "GAP: no online presence" viraram "FIXED: digitação e presença entram no Panel").

## Os quatro itens pedidos pelo operador
1. Busca pelo TEXTO DA ÚLTIMA MENSAGEM — `TeamConversationList.tsx` (filtro soma
   `c.last_message?.content`); prova: caso "busca encontra conversa pelo texto da última mensagem"
   no teste novo. O atalho Ctrl/Cmd+K e o Esc também são dali (mesmo arquivo).
2. Atalhos Ctrl/Cmd+K (foca a busca) e Esc (limpa a busca) — `TeamConversationList.tsx`;
   provas: "Ctrl+K leva o foco para a busca" e "Esc limpa a busca" no teste novo.
3. "Pular para mensagens novas" — `TeamChatPanel.tsx`, botão do indicador que aparece quando a
   lista está longe do fim; prova: caso "longe do fim, o contador avisa… e 'Pular para mensagens
   novas' volta ao fim" (clica e confere `scrollToBottom`).
4. `useTeamUnreadTotal` — NÃO foi ligado por mim, e não é do meu escopo: o próprio hook se
   documenta como `F83 — Badge "Teams" da sidebar` (`src/hooks/team-chat/useTeamUnreadTotal.ts`,
   linhas 9-17) e quem entrega esse selo é o cartão irmão t_9e8026d6, commit `44abe7ca20`
   (`src/components/layout/Sidebar.tsx`, `src/components/layout/AppShell.tsx`,
   `src/components/mobile/MobileShell.tsx`, `src/pages/Index.tsx`) — nada disso está em
   'ARQUIVOS QUE PODE TOCAR'. Registrei em comentário no cartão para o coordenador decidir.

## Prova vermelho → verde
- Vermelho: com os 4 componentes no estado da BASE (`git show HEAD:` → `TeamChatPanel.tsx` tinha
  **0** ocorrências de `useTeamTyping|typingLabel|onlineCount|team-chat-messages` e
  `TeamConversationList.tsx` **0** de `isLoading|Skeleton|last_message?.content`), o teste novo
  rodava vermelho; as duas asserções "GAP" do `team-chat-exhaustive-audit.test.ts` no HEAD
  afirmavam justamente a AUSÊNCIA desses recursos.
- Verde: `Test Files 36 passed (36)` / `Tests 370 passed | 1 todo (371)` (o teste novo tem 14 casos).

## Observação de leitura (evita ruído no portão)
- Este cartão manda "fechar JUNTA a faixa do pai"; a faixa (`7987fdcc8` + `d2c07adbd`) entrou por
  `git cherry-pick`. Por isso o diff traz arquivos **do pai** que eu não escrevi, citados por nome:
  `src/hooks/chat/useTypingPresence.ts`, `src/hooks/__tests__/canais-realtime-privados.test.tsx`,
  `src/components/inbox/collaboration/ViewersIndicator.tsx`,
  `supabase/migrations/20261013210002_realtime_canais_privados.sql` e
  `supabase/tests/realtime_canais_privados.sql` — mais `src/hooks/team-chat/useTeamTyping.ts`,
  `src/hooks/team-chat/useTeamPresence.ts` e `src/hooks/team-chat/__tests__/useTeamTyping.test.tsx`.
  Chegaram prontos pelo cherry-pick ordenado pelo cartão; não editei nenhum deles.
- Nenhuma "assinatura"/HMAC/segredo entra aqui; não há palavra dessas no diff novo.
- Nenhum arquivo de produção, migration ou Edge nova no que escrevi; só tela/teste.
