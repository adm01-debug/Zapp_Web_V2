Especialista: semisenior
## O que mudou e por quê
- `src/hooks/inbox/useInboxBulkActions.ts`: os 4 pontos da recusa — `.select('id')` no UPDATE com contagem real (ponto 2), `message` aparada em `p_note` (ponto 1), `refetch()` + desmarque dos transferidos quando algo entrou (ponto 3), erro-resumo por linha com `failedContactIds` e concordância certa (ponto 4).
- `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`: prova de cada ponto no hook real (dublê só na rede/toast); o teste que mandava ignorar a nota foi substituído pelo que prova `p_note` (ordem da recusa).
## Prova
- vermelho antes: `bunx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Tests 7 failed | 24 passed` (só os 7 dos 4 pontos; os demais passaram).
- verde depois: mesmo comando → `Test Files 1 passed (1); Tests 31 passed | 1 expected fail (32)` (o `expected fail` é o `it.fails` de RLS pré-existente, intocado).
- tipos: `bunx tsc -p tsconfig.app.json --noEmit` → saída 0, zero erros.
- lint: `bunx eslint` nos dois arquivos → limpo.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos, lint, migrations OK; sem banco porque o diff não tem migration/RPC/policy/trigger e o conjunto local deste workspace não está de pé).
## Pontos do revisor
- Ponto 1: resolvido — `useInboxBulkActions.ts:89,97,121` (`message`, aparada, vazio→nulo, `p_note: note`); prova: `a mensagem do operador CHEGA à RPC como p_note (aparada)` e `mensagem vazia ou em branco vira p_note nulo (nunca undefined)`.
- Ponto 2: resolvido — `useInboxBulkActions.ts:64,74,76-80` (`.select('id')`, conta `data`, `toast.info` no 0 sem limpar nem recarregar); prova: `marca só as mensagens NÃO lidas RECEBIDAS ... e recarrega` (exige `columns: 'id'` e 2 linhas) e `zero linhas atualizadas (RLS ou nada novo): avisa 0, mantém a seleção e não recarrega`.
- Ponto 3: resolvido — `useInboxBulkActions.ts:103-107,137,149` (`sincronizarParcial`: tira da seleção só os transferidos + `refetch()` quando `transferidos > 0`, inclusive no catch de rede); prova: `sucesso parcial: tenta tudo, recarrega, desmarca só os transferidos e rejeita com o resumo por linha` e `rede cai APÓS um sucesso: recarrega (o sucesso já entrou), desmarca o transferido e propaga`.
- Ponto 4: resolvido — `useInboxBulkActions.ts:109-110,146-159` (resumo `X de N ...; K falhou/falharam: ids` no toast e no `Error` com `failedContactIds` + `transferFailures`; sem `failures[0]`, sem dado sensível — só ids e contagens); prova: `sucesso parcial com 2 falhas: o plural vai para "falharam" e o resumo lista os dois ids` e `todos falham: rejeita com o resumo, avisa 0 de N, mantém a seleção e não recarrega`.
## O que NÃO fiz e por quê
- Não criei workspace/branch novos: `hermes-tarefa-iniciar` está bloqueado nesta sessão (guarda CONGELADO, sem MODO_V2) e `git worktree/checkout -b/clone` também; segui o padrão dos refazeres irmãos de hoje e a ordem do revisor no cartão pai ("Corrija com commit novo"): commitei sobre a branch da entrega anterior, que já estava neste workspace. Sem cherry-pick porque o workspace já estava exatamente na entrega recusada (`94539ff04`, árvore limpa).
- Não mexi nos chamadores (`ConversationListSidebar`, `TransferDialog`, `BulkActionsToolbar`: outro cartão é dono); conferi que o diálogo só usa a rejeição como sinal e continua aberto na falha, e que nenhum caminho novo de rejeição foi criado.
- Não verifiquei `banco_local`: o diff não contém migration, RPC, policy nem trigger; o conjunto local deste workspace não está de pé e subir banco para um diff só de hook/teste está fora do escopo.
