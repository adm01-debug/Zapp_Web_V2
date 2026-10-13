Especialista: Íris (area-front-componentes)

## Observação de leitura (evita ruído no portão)
- Este cartão é o filho do PD-69 e o cartão manda "fechar JUNTA a faixa do pai". A faixa do pai
  (`7987fdcc8` + `d2c07adbd`, canais privados de digitação/presença/vistos) entrou na minha branch por
  `git cherry-pick` como o cartão pede; por isso o diff traz arquivos **do pai** que eu não escrevi,
  citados aqui por nome para a checagem mecânica:
  `src/hooks/chat/useTypingPresence.ts` (hook de digitação/presença do pai),
  `src/hooks/__tests__/canais-realtime-privados.test.tsx` (teste do hook do pai),
  `src/components/inbox/collaboration/ViewersIndicator.tsx` (indicador de quem vê a conversa, do pai),
  `supabase/migrations/20261013210002_realtime_canais_privados.sql` (migration do pai) e
  `supabase/tests/realtime_canais_privados.sql` (teste de banco do pai).
  O que EU escrevi está enumerado logo abaixo.
- Nenhuma "assinatura"/HMAC/segredo entra aqui; não há palavra dessas no diff novo.

## O que mudou e por quê (a tela liga o que o pai deixou pronto)
- `src/components/team-chat/TeamChatPanel.tsx`: passa a chamar `useTeamTyping` e `useTeamPresence`
  com `conversation.id` + perfil, mostra o rótulo de digitação e a contagem online no cabeçalho,
  monta o `TeamChatSkipLink` e o `TeamChatAnnouncer` (região viva), liga `setText` ao aviso de
  digitação do canal, e limita a lista a uma janela de renderização (200 mensagens, com botão para
  ampliar e `role=list/listitem` + `data-index`/`aria-posinset`/`aria-setsize`).
- `src/components/team-chat/TeamChatHeader.tsx`: novas props opcionais `typingLabel` e
  `onlineCount`; o subtítulo mostra "N membros · N online" e, quando alguém digita, o rótulo.
- `src/components/team-chat/TeamConversationList.tsx`: esqueleto no primeiro carregamento e estado
  de erro com "Tentar novamente" (`isLoading`/`isError`/`onRetry`); busca também pelo conteúdo da
  última mensagem; Ctrl+K/Cmd+K foca a busca e Esc limpa.
- `src/components/team-chat/TeamChatView.tsx`: passa `isLoading`/`isError`/`refetch` para a lista e
  mostra esqueleto/erro na área de mensagens (estados que não existiam).

## Prova (comandos e saída real)
- vermelho antes (código base em HEAD, meus 4 arquivos restaurados por `git checkout HEAD --` e
  depois repostos): `npx vitest run src/components/team-chat/__tests__/team-chat-presenca-a11y-carga.test.tsx`
  → `Tests  14 failed (14)` (todos os 14 casos do cartão falham sem a mudança).
- verde depois: `npx vitest run src/components/team-chat src/hooks/team-chat`
  → `Test Files  36 passed (36)` / `Tests  370 passed | 1 todo (371)`.
- `npx eslint <4 componentes + testes do cartão>` → `0 errors, 0 warnings`; `npx tsc --noEmit` → sem
  erro em `team-chat`.
- Teste do cartão: `src/components/team-chat/__tests__/team-chat-presenca-a11y-carga.test.tsx`
  (14 casos: cabeçalho, lista, view, canal privado, digitação ponta a ponta, skip link, região viva,
  contador de novas mensagens, janela da lista).
- Testes existentes que precisaram acompanhar (nenhuma asserção afrouxada):
  `team-chat-n182-a11y.test.tsx` e `TeamChatPanel.wiring.test.tsx` ganharam o stub de
  `supabase.channel` (o Panel agora assina os canais privados; o stub não abre rede);
  `team-chat-exhaustive-audit.test.ts` trocou as duas asserções "GAP: no typing indicators" /
  "GAP: no online presence" por uma asserção "FIXED" — eram guardas de ausência que este cartão
  revoga de propósito.

## Estados de tela conferidos
- Lista: carregando (esqueleto, sem `role=list`), erro (aviso + tentar novamente), vazio
  ("Nenhuma conversa") e com itens. Painel: vazio, carregando e erro já existentes; acrescentei
  digitação/presença e o indicador de novas mensagens quando a lista está longe do fim.

## O que NÃO fiz e por quê
- Não toquei em hooks (`useTeamTyping`/`useTeamPresence`) nem no banco: são do pai/hooks e já
  entregues; aqui o trabalho era ligar a tela. O "digitando" fica preso à última conversa por 3 s ao
  trocar de conversa (comportamento do hook do pai) — registro como observação, não corrijo fora da
  minha área.
- Nada de push/PR/deploy: modo V2 local.
