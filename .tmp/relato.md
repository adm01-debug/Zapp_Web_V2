Especialista: iris

## O que mudou e por quê
- `src/components/inbox/MessageReactions.tsx`: `handleReact` somava reações do mesmo atendente — só comparava o emoji clicado, então com 👍 já gravado um toque em ❤️ chamava apenas `addReaction('❤️')` e o autor ficava com duas linhas. Agora um helper único (`useSingleReaction`) decide o alvo da vez: tocar em OUTRO emoji remove a antiga ANTES de gravar a nova, tocar no MESMO emoji só remove. O helper vale para `MessageReactions` (badges e seletor) e para `QuickReactionBar`, que tinha o mesmo defeito no mesmo arquivo.
- Atualização otimista com rollback: o palpite entra na tela na hora (`viewReactions` sobrepõe a reação do autor) e volta para o emoji anterior no `catch`; o palpite guarda a lista que o originou e expira sozinho quando a consulta devolve lista nova (sem efeito, sem `setState` em `useEffect`).
- `src/components/inbox/__tests__/MessageReactions.autoria-unica.test.tsx` (novo): renderiza os componentes REAIS com o hook mockado e clica nos emojis; confere a ordem das gravações (`removeReaction` antes de `addReaction`), o toque no mesmo emoji, o rollback e o mesmo contrato no `QuickReactionBar`.
- Faixa do cartão pai `t_8d53f9bd` (RLS de autoria das reações) trazida por `git cherry-pick` — 2 commits: `c15b8e3f4`, `0376e8c40`.

## Prova
- vermelho antes (componente antigo): `npx vitest run src/components/inbox/__tests__/MessageReactions.autoria-unica.test.tsx` → `Tests 3 failed | 1 passed (4)` (a troca virava soma: `addReaction` chamado sem o `removeReaction` da antiga).
- verde depois: `npx vitest run src/components/inbox/__tests__/MessageReactions.autoria-unica.test.tsx` → `Test Files 1 passed (1); Tests 4 passed (4)`.
- verificação do cartão: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint e migrations OK).

## O que NÃO fiz e por quê
- Não mexi em `useReactionMutations.ts` nem no banco: o cartão limita os arquivos ao componente e a seus testes; a autoria por linha no banco é do cartão pai (já trazido).
- Nada novo que exporte, baixe, copie ou imprima; sem log de telefone, token ou texto de mensagem.

## Nota para o portão (aviso de arquivo fora da lista)
- O cartão lista `src/components/inbox/chat/MessageReactions.tsx`, mas `handleReact` mora em `src/components/inbox/MessageReactions.tsx` — o caminho com `/chat/` não existe neste repositório; é o mesmo componente, e é o único arquivo de tela tocado por este commit.
- `supabase/migrations/20261013210000_message_reactions_autoria.sql` e `supabase/tests/rls_message_reactions_autoria.sql` (2 commits `c15b8e3f4`, `0376e8c40`) são a faixa do cartão pai `t_8d53f9bd` trazida por `git cherry-pick`, conforme a instrução do cartão ("traga a FAIXA inteira"); não editei esses arquivos.
