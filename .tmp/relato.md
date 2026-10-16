Especialista: senior (area-testes-do-produto)

# Refazer 2 — retomada por rebase das capturas da linha de base (etapa 003)

## Resumo em 4 linhas
Os commits desta entrega saíram da base antiga (32c68d56a3) para a ponta viva de
`dia/2026-10-11` (9372aeb6a4) e viraram um commit só — bb1a5209af — como manda a
arquitetura (um cartão, um commit). Nenhum arquivo de outro cartão entrou no diff, e a
árvore entregue é **byte a byte** a entrega aprovada no mérito (prova por diff vazio mais
abaixo). Depois do rebase rodei o teste do cartão na árvore nova: **1 passed (1.3m)**, com as
30 imagens regravadas no diretório de assets — caminhos e tamanhos no fim deste relato.

## Ponto 1 — "traz dia/2026-10-11 atual para o workspace (merge/rebase), resolve o conflito preservando o que já entrou nela" (único ponto da recusa)

O que mudou: `e2e/tarefas-linha-de-base.spec.ts` e `playwright.config.ts`, reempilhados na
ponta do dia. O conflito original era com a ponta de `dia/2026-10-12`, que já tinha recebido
o mesmo conteúdo por outro cartão (commit 92968706ce, "Cartão V2: 26101121116511"). Na ponta
de `dia/2026-10-11` esses dois arquivos **não** tinham sido tocados por ninguém (conferido em
`git ls-tree` e no diff da ponta), então o rebase deles foi limpo; o único conflito foi em
`.tmp/relato.md`, arquivo da fábrica, que o próprio `hermes-tarefa-fechar` tira do commit
(regra B1 de 13/10). Preservar "o que já entrou" foi resolvido assim: a versão carregada da
spec é a **corrigida** pelo refazer anterior (sem o fallback que escrevia PNG dentro do
repositório e sem o helper morto `uuid`), e não a primeira versão da minha branch.

Prova (saídas reais, coladas):

  $ git merge-base dia/2026-10-11 HEAD
  9372aeb6a48bd79f25970e15f58d319dbee9052f
  $ git rev-parse dia/2026-10-11
  9372aeb6a48bd79f25970e15f58d319dbee9052f      # a base do meu commit É a ponta do dia

  $ git diff --stat 01ab08e010 HEAD -- e2e/tarefas-linha-de-base.spec.ts playwright.config.ts
  (vazio)                                        # a árvore entregue é idêntica à entrega aprovada

  $ git log --oneline -1
  bb1a5209af test(tarefas): linha de base visual em 30 capturas Playwright (etapa 003)
     (pai: 9372aeb6a4 fix(hooks): mantém mock de snooze alinhado ao insert select)

  $ git diff --name-only dia/2026-10-11...HEAD
  .tmp/relato.md
  e2e/tarefas-linha-de-base.spec.ts
  playwright.config.ts

Diferença de método, dita com todas as letras: não usei `git cherry-pick` da branch
`v2/t-43cc5f04-26101121116511` (o ref dela já não existe no repositório; o objeto do commit
01ab08e01 sim). Minha branch de workspace já carregava os mesmos commits, feitos em 11/10
sobre a base antiga; reempilhei esses commits na ponta do dia e igualei a árvore ao commit
aprovado (`git checkout 01ab08e010 -- <os dois arquivos>`). O resultado é o mesmo que o
cherry-pick pediria, e a igualdade não é afirmação minha: é o `git diff` vazio acima.

## Teste do cartão, rodado na árvore rebaseada

  $ PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 bun run test:e2e -- \
        --project=chromium-tarefas-linha-de-base e2e/tarefas-linha-de-base.spec.ts
  ...
  1 passed (1.3m)

O próprio teste prova a completude do artefato: ele monta os 30 nomes esperados
(5 superfícies × 3 larguras × 2 modos), afirma `toHaveLength(30)` e, para cada nome,
`existsSync` e `size > 5_000` (linhas 354-368 da spec). Sessão FALSA (`installFakeSession`),
`storageState` vazio explícito, `conversation_tasks` mockado em memória e rede real barrada —
deslogado, sem banco, sem segredo e sem sessão salva (é a regra R1 de E2E).
Estabilidade: 1 execução, 1 verde — taxa de falha medida 0/1. Não houve retry nem flake.

## PROVA — as 30 imagens (contagem, tamanhos e hashes)

Diretório (fora do repositório, como o cartão manda; o ponteiro `.tmp/captura-dir.txt` aponta
para ele): `/home/joaquim_ataides/hermes-workspaces/.assets/tarefas/linha-de-base-2026-10-11`

Medido agora por script (`.tmp/checar-capturas.py`, que lê o ponteiro — o caminho literal
não pode aparecer na linha de comando): **count: 30**, **bytes_totais: 2.825.524**,
**menor_png: 41.500 bytes**. Tamanho e sha256 (16 primeiros dígitos):

  01-lista-1280-dark.png 111443 2a25b119142a49bf     01-lista-1280-light.png 108763 242c2a933ed8880f
  01-lista-360-dark.png   60295 693ad75c262c783c     01-lista-360-light.png   56613 becba9dff9340ff0
  01-lista-768-dark.png   99705 cc4358062f840b88     01-lista-768-light.png   96267 34db5ea7a3961e3d
  02-quadro-1280-dark.png 166199 c586de8665491b0a    02-quadro-1280-light.png 167418 4ee65a688d2b03c9
  02-quadro-360-dark.png   60293 bc9368066ecba273    02-quadro-360-light.png   56852 bd02b207e1a95580
  02-quadro-768-dark.png  121140 4b21e0764edbe217    02-quadro-768-light.png  118635 00cf06e9fd0c7065
  03-agenda-1280-dark.png 116110 9d32a31467d5c16e    03-agenda-1280-light.png 112276 687abdfd97694cc3
  03-agenda-360-dark.png   56128 58060d8a48d29f75    03-agenda-360-light.png   52270 56deb2bec9299c7c
  03-agenda-768-dark.png  117256 cb8fce2d61c1c7c8    03-agenda-768-light.png  113349 4c113c7055f3c696
  04-quickadd-1280-dark.png 111813 1d6946c7a0cf3ab5  04-quickadd-1280-light.png 109473 3017ba164ebaa85e
  04-quickadd-360-dark.png  59139 d63c5a2e1062fd61  04-quickadd-360-light.png  56531 5be1b4f432f1bc4c
  04-quickadd-768-dark.png 100292 3aa6717a3e079241  04-quickadd-768-light.png  97351 921fb2fd2b76fd84
  05-painel-edicao-1280-dark.png 111866 a19ebe7d7ac53a5f  05-painel-edicao-1280-light.png 110768 c8e25961d5bfd96e
  05-painel-edicao-360-dark.png  41500 ecf8726bf35828c3   05-painel-edicao-360-light.png  41645 af4a617596c3185e
  05-painel-edicao-768-dark.png  96546 0d06e148f24e5720   05-painel-edicao-768-light.png  97588 a6c92c910e2e225b

Aviso honesto sobre o diretório: ele é o mesmo que a entrega de 11/10 usou (o ponteiro do
cartão aponta para ele), então a rodada de hoje **regravou** os arquivos ali. Comparando
antes/depois, 24 dos 30 mudaram de bytes e 6 ficaram idênticos
(01-lista-1280-dark/light, 01-lista-768-light, 04-quickadd-1280-dark, 04-quickadd-768-dark,
04-quickadd-768-light). O motivo é esperado: a captura de 11/10 saiu da base antiga
(32c68d56a3) e a de hoje sai da ponta do dia (9372aeb6a4), que traz os commits finais de
11/10. Não existe cópia em git do conjunto de 11/10 (nunca foi commitado); o que resta dele
são os tamanhos registrados no relatório do refazer anterior. Feito o rebase, a linha de base
passa a corresponder à árvore que o integrador recebe — que é o que o cartão pede ("rode o
teste do cartão" depois de trazer a ponta). Não criei diretório novo nem exportei nada para
fora do sistema.

## `zapp-verify full .` (como o cartão pede)

Rodado na árvore rebaseada, com a saída real colada:

  $ zapp-verify full .
  OK      db_guard        0s
  OK      tipos          29s
  OK      lint          232s
  OK      migrations      1s
  AVISO   banco_local  NÃO VERIFICADO: sem nome de conjunto (passe o nome como terceiro argumento)
  OK      testes       1748s
  OK      build          20s
  VERIFY: VERDE SEM BANCO (2050s) — o banco NÃO foi verificado; registros em
  /home/joaquim_ataides/.local/state/zapp-verify/128767f145dd

  (dentro do passo testes: Test Files 1221 passed (1221) — Tests 11077 passed |
   25 expected fail | 14 todo; o passo rodou lento por concorrência com os outros chats,
   29 min, não por retry.)

O aviso do banco é o esperado para este cartão e não é verde escondido: a linha de comando
do próprio cartão não passa nome de conjunto, e o conjunto local deste workspace
(v2-26101114266880) já não existe em `~/.local/share/zapp-local/stacks/`. Este cartão não tem
migration nem SQL: o que ele entrega é spec de E2E e a entrada do projeto no Playwright.

## Justificativa de escopo do `playwright.config.ts` (o cartão não cita o arquivo)

Ele é indispensável e são só as linhas desta etapa: a spec da linha de base roda **deslogada**
e por isso precisa de um projeto próprio (`chromium-tarefas-linha-de-base`, com
`storageState: { cookies: [], origins: [] }` explícito) e do `testIgnore` na suíte que usa
sessão salva — sem essas 13 linhas o comando do cartão não tem projeto para rodar e a spec
seria adotada por um projeto que exige sessão. Nada de outro cartão entrou no arquivo.

## Arquivos no diff (colado de `git diff --name-only dia/2026-10-11...HEAD`)

  .tmp/relato.md
  e2e/tarefas-linha-de-base.spec.ts
  playwright.config.ts

São 372 linhas de spec (nova), 13 de config (o projeto `chromium-tarefas-linha-de-base` e o
`testIgnore` da suíte que usa sessão salva) e 3 linhas de `.tmp/relato.md`. Nada de banco,
Edge Function, migration, CI, guarda ou dependência. Nenhum arquivo de outro cartão:
`playwright.config.ts` e `e2e/` não foram tocados na ponta de `dia/2026-10-11` (o único
cartão que mexeu nos mesmos arquivos foi integrado em 12/10, com conteúdo igual).

## O que eu não fiz (dito sem rodeio)

1. A captura continua **hermética** (sessão falsa + `conversation_tasks` em memória), e não
   pelo banco local com usuário sintético como o pedido original descrevia. Esse desvio é o
   da entrega aprovada no mérito: o revisor aceitou a hermeticidade e pediu apenas que ela
   ficasse explícita — é o que faço aqui. Não mudei esse comportamento, porque mudá-lo não é
   um ponto da recusa.
2. Não toquei em banco (não há migration neste cartão), não rodei push/PR/deploy e não subi
   dev server em modo de produção nem em `0.0.0.0`.
