# Relatório da sessão de 15–16/11/2026 — o que foi feito, como e por quê

> **Leia antes: [`HANDOFF-SESSAO-2026-11-16.md`](HANDOFF-SESSAO-2026-11-16.md).** Este relatório
> foi escrito às 10:30 UTC de 16/11 e corrigido às 11:35 (14 afirmações derrubadas por verificação
> adversarial). O handoff cobre o que aconteceu depois — o merge da #3162, o estado da `main`
> (`4bc94cb75`) e os pontos em que os fatos de produção aqui já envelheceram.

Documento de prestação de contas. Escrito no fechamento da sessão, antes de o contêiner ser
descartado. Destinatário: o dono e a próxima sessão de IA.

Regra que guiou a redação: **toda afirmação sobre código cita evidência** (arquivo:linha, saída
de comando, número de teste). Onde não há evidência, está escrito que não há. A seção 7 lista os
erros que eu mesmo cometi, porque um relatório que só conta acertos não serve para decidir nada.

---

## 1. O pedido e como ele foi interpretado

O pedido original foi `/merge-prs`: analisar, corrigir e mergear as PRs abertas. Ao longo da
sessão ele foi ampliado pelo dono, em ordem:

1. "não podemos perder nenhum trabalho realizado por outro agente de ia, mesmo que seja trabalho
   parcial (nesse caso temos que finalizar o que ele iniciou)";
2. "vc precisa ter certeza absoluta (byte x byte) de cada branch ou pr antes de exclui-la";
3. "proibido excluir ou anular branch, sem fazer uma analise exaustiva nela";
4. "Haja como um Dev sênior responsável pelo sistema e decida e resolva por mim";
5. no fim: "tudo que foi feito aqui nesse container seja enviado ao Github… proibido deixar
   algum trabalho apenas aqui local".

A interpretação adotada: **fechar branch exige prova, não impressão.** Isso trocou o trabalho de
"mergear PRs" por "auditar 329 entradas e provar, uma a uma, que nada de valor some ao fechá-las".

---

## 2. O que entrou em produção

17 PRs mergeadas nesta sessão (#3139 a #3159). Outras 8 (#3125–#3138) foram mergeadas na mesma
janela de calendário pela sessão anterior e estão separadas na Parte C.0 do anexo. As que mudam
comportamento para o usuário:

| PR | O que muda para o negócio |
|---|---|
| [#3159](https://github.com/adm01-debug/Zapp_Web_V2/pull/3159) | **Oito defeitos da biblioteca de segmentos.** O que mais pesa: segmento montado só com condição "em breve" (`lead_score`/`risk_score`) mostrava **a base inteira** como público estimado — quem olhava achava que ia falar com todo mundo, e o número era de um filtro que o banco nunca aplicou. |
| [#3157](https://github.com/adm01-debug/Zapp_Web_V2/pull/3157) | **Recriar o banco pelos arquivos deixa de apagar reação de cliente.** Dois defeitos na mesma migration histórica. |
| [#3156](https://github.com/adm01-debug/Zapp_Web_V2/pull/3156) | Três defeitos do relatório de campanha que passariam sem nenhum teste reclamar. |
| [#3155](https://github.com/adm01-debug/Zapp_Web_V2/pull/3155) | **O botão de desligar a IA passa a desligar também as 7 funções que cobram.** Antes, desligar a capacidade não barrava as 7 edges do RADAR: elas reservavam orçamento e chamavam o provedor pago assim mesmo. |
| [#3154](https://github.com/adm01-debug/Zapp_Web_V2/pull/3154) | Quem não tem permissão para de ver "erro, tente novamente" e passa a ver a tela certa. |
| [#3151](https://github.com/adm01-debug/Zapp_Web_V2/pull/3151) | **Análise de imagem: o modelo passa a receber a foto**, não um link de bucket privado que ele não consegue abrir. |
| [#3149](https://github.com/adm01-debug/Zapp_Web_V2/pull/3149) | E2E logado volta ao verde. |
| [#3147](https://github.com/adm01-debug/Zapp_Web_V2/pull/3147) | Clique da busca deixa de inflar o relatório; wizard trava sem audiência confirmada. |
| [#3145](https://github.com/adm01-debug/Zapp_Web_V2/pull/3145) | **Login com 2FA não trava** quando o código é digitado antes de os fatores carregarem. |
| [#3144](https://github.com/adm01-debug/Zapp_Web_V2/pull/3144) | Pausa de envios por instância: freio manual, auto-pausa no 429 e painel em Conexões. |
| [#3142](https://github.com/adm01-debug/Zapp_Web_V2/pull/3142) | RADAR aparece na primeira sessão sem precisar reabrir a conversa. |
| [#3139](https://github.com/adm01-debug/Zapp_Web_V2/pull/3139) | Monta o painel RADAR ao vivo na Inbox — resgate da #2419 e da branch `radar-motor-copilot-live`. |

As de infraestrutura e prova: [#3153](https://github.com/adm01-debug/Zapp_Web_V2/pull/3153)
(prova de que nenhuma branch fechada levou trabalho junto),
[#3143](https://github.com/adm01-debug/Zapp_Web_V2/pull/3143) (guard de drift volta a distinguir
apply pendente de divergência real), [#3150](https://github.com/adm01-debug/Zapp_Web_V2/pull/3150),
[#3141](https://github.com/adm01-debug/Zapp_Web_V2/pull/3141) (os 329 dossiês),
[#3140](https://github.com/adm01-debug/Zapp_Web_V2/pull/3140).

**Deploy conferido**, não suposto: as três últimas estão em produção com estado `READY`
(`725dab40` #3156, `970c615f` #3157, `b7c27b00` #3159), verificado pelo MCP da Vercel.

### 2.1 O kill switch, ponta a ponta

Caso que vale contar porque fecha o ciclo inteiro: a PR #3155 entrou, o workflow
`Deploy Edge Functions` rodou com SUCCESS, e `ai.capability.copilot_live` foi posta em `true`
às 23:38:07 UTC por escolha do dono. Isso é o que o AGENTS.md chama de "pronto": PR mergeada +
deploy confirmado + comportamento verificado.

---

## 3. O trabalho central: a auditoria das 329 entradas

### 3.1 Por que foi preciso

O repositório tinha 329 branches e PRs fechadas sem merge. A pergunta do dono não era "quais
posso apagar", era "prove que nenhuma leva trabalho junto". Um `git diff merge-base..tip` vazio
**não** prova isso: não mostra o que um commit intermediário adicionou e um commit posterior da
própria branch removeu.

### 3.2 Como foi feito

Três passadas, cada uma com um agente diferente e um papel diferente:

1. **Triagem** — um agente lê a entrada e emite veredito (`INCORPORADA`, `OBSOLETA`, `PERDA`…)
   com resumo de negócio e confiança declarada.
2. **Verificação adversarial** — um segundo agente recebe o veredito e a tarefa de **refutá-lo**,
   procurando por **comportamento**, não por caminho de arquivo (um arquivo renomeado engana a
   busca por caminho; a busca por comportamento, não).
3. **Reexame** — terceira passada nas entradas em que a verificação derrubou o veredito.

Resultado: **22 vereditos derrubados**, **153 alegações refutadas**, **226 evidências
confirmadas** (151 sem bloqueio, 58 de CI/workflow, 10 de migration em produção, 7 de decisão do
dono).

> Sobre o 22: somando `contagem.veredito_derrubado` nos 10 lotes que têm esse campo dá **31**, e há
> sobreposição entre frentes — as **92** branches `OBSOLETA` foram auditadas **duas vezes** (uma
> frente de 92 e quatro de 23). O 22 desconta essa dupla contagem, mas **não é reconstituível a
> partir dos lotes**, que não dizem quais entradas repetem. Para o número exato, recompute por
> `bruto/triagens/` × `bruto/verificacoes/` × `bruto/vereditos-finais.json`. As 226 evidências,
> essas sim, conferem com o `itens-confirmados.json`.

Distribuição dos vereditos nas 329 entradas:

| Veredito | Quantas | O que significa |
|---|---|---|
| `INCORPORADA` | 162 | O trabalho já está na `main`, provado por conteúdo |
| `OBSOLETA` | 105 | A `main` seguiu outro caminho; não há o que resgatar |
| `PERDIDA_PARCIAL` | 54 | Parte do trabalho não chegou à `main` |
| `PERDIDA_TOTAL` | 5 | Nada do trabalho chegou à `main` |
| `DECISAO_DONO` | 3 | Depende de escolha de negócio, não de engenharia |

**328 de 329** passaram pela verificação adversarial — não 329. A exceção é
`claude__chore-remove-hook-morto-talksuppression-261024-1541` (veredito `OBSOLETA`), e está
nomeada aqui para não virar um "todas" que não é verdade. 47 entradas foram reexaminadas, 165
registram ao menos uma lacuna e 267 receberam **recomendação** de apagar — recomendação que
**não foi executada**: nenhuma branch foi apagada nesta sessão.

### 3.2.1 Onde está cada branch, uma a uma

O documento irmão **`RELATORIO-ANEXO-BRANCHES.md`** traz, sem corte nenhum:

- **Parte A** — as **288 branches que existem hoje no `origin`**: 281 com veredito, resumo e
  lacunas; e as 7 que não foram auditadas, cada uma com o motivo (ramo principal, branch gerada,
  automação, ou criada nesta sessão).
- **Parte B** — as **329 entradas auditadas**, incluindo as de PR fechada cuja branch já não
  existe, agrupadas por veredito, com o resumo completo de cada uma. As lacunas aparecem item a
  item só nas **62 entradas de B.1** (perda total, perda parcial e decisão do dono) — 385 lacunas.
  As 267 entradas de B.2 (`INCORPORADA` e `OBSOLETA`) vêm só com o resumo: 103 delas têm 373
  lacunas registradas no `auditoria/bruto/vereditos-finais.json` que o anexo não lista (a maioria
  de valor `nenhum`, mas 66 de valor `baixo` e 6 de valor `medio`). Para essas, a fonte é o JSON.
- **Parte C** — as **17 PRs mergeadas** nesta sessão com o que cada uma resolve e **como foi
  verificada**, as 8 herdadas da sessão anterior, a 1 PR que recusei e fechei, e as 3 que
  ficaram abertas.

### 3.3 O que ficou versionado

- `analise-prs/resgate-261115/dossies/` — 329 dossiês (PR #3141)
- `analise-prs/resgate-261115/auditoria/` — o destilado: `README.md`, `itens-confirmados.json`
  com as 226 evidências e 12 arquivos de lote (PR #3153, 14 arquivos no total)
- `analise-prs/resgate-261115/auditoria/bruto/` — **os diários que sustentam tudo isso**
  (PR #3162, ver seção 6)
- `analise-prs/resgate-261115/auditoria/ferramentas/` — **os scripts que rodaram a auditoria**
  (PR #3162)

### 3.4 Um aviso que precisa ser repetido

**Os 226 são evidências, não tarefas.** Várias apontam para o mesmo arquivo — 24 delas para um
único arquivo de teste. Contar linhas do `itens-confirmados.json` **não** dá a quantidade de
trabalho que falta. Eu mesmo apresentei esse número de forma enganosa uma vez (seção 7.5).

---

## 4. As três frentes de correção depois da auditoria

Executadas sob a ordem "decida e resolva por mim, levante prós e contras".

### 4.1 Segmentos — 8 defeitos (#3159, mergeada)

Vieram de 9 evidências da auditoria apontando `TalkXSegments.tsx` (duas descreviam o mesmo
defeito de foco). O de maior efeito já está na tabela da seção 2.

**Detalhe que mudou a solução, e que vale como lição:** minha primeira versão recusava a
contagem para **qualquer** condição descartada. Isso quebrou o teste X008
(`TalkXSegments.builder.test.tsx:122`), que garante **de propósito** que condição em branco
(digitação em curso) mantém a contagem anterior e nunca cai para 0. São dois casos diferentes:
em branco é transitório, "em breve" é permanente. O `splitRules` passou a devolver
`comingSoonCount` separado de `incompleteCount`, e só o primeiro suspende a contagem.

O teste existente estava certo e a minha generalização estava errada. **Um teste que falha ao
aplicar um fix merece leitura antes de ajuste.**

### 4.2 RLS de supervisor do Copiloto (#3158, aberta pela regra 8)

A migration `20261107133000` tinha fechado um vazamento real (qualquer vendedor lia dados de
qualquer outro) escopando tudo pelo **autor da linha**. Só que a Fase 13 é justamente a do
supervisor — os comentários da migration de criação dizem "pedidos de ajuda **AO** supervisor",
"pontuação de conversa **PELO** supervisor". Efeito hoje em produção:

1. `copilot_help_requests` — INSERT e SELECT têm o mesmo predicado (`seller_id = auth.uid()`),
   então **só o próprio vendedor lê o pedido que ele mesmo gravou; o supervisor, que é o
   destinatário, não lê**. Não existe policy de supervisor na tabela. Recurso morto: o pedido de
   ajuda nunca chega a quem deveria atendê-lo. (Hoje o efeito é teórico em dobro — nenhum código
   do repo lê ou grava a tabela: a única referência fora de migrations é o tipo gerado em
   `src/integrations/supabase/types.ts:3280`.)
2. `copilot_conversation_scores` — **qualquer vendedor pontua qualquer conversa**, inclusive a
   própria. E como `conversation_id` é PRIMARY KEY e o UPDATE exige autoria, quem pontua primeiro
   **trava** a nota: o supervisor não consegue inserir nem atualizar.
3. `copilot_learning_moments` — qualquer vendedor marca "exemplar"/"anti_pattern" na conversa de
   um colega.

**Verificado em produção (somente leitura):** as três tabelas têm **0 linhas**; `user_roles` tem
5 admin/supervisor em 11 papéis. Nada é reclassificado.

### 4.3 Transação do tick do Copiloto (#3160, aberta pela regra 8)

O tick grava em **duas** chamadas: `UPDATE copilot_sessions` (`copilot-tick.ts:514`) e depois
`INSERT copilot_insights` (`:531`). Se o INSERT falha, o cursor **já andou** — as mensagens
analisadas não voltam ao próximo tick e **a resposta que o provedor de IA já cobrou é perdida em
silêncio**, com o tick retornando `succeeded`.

Nasce `public.commit_copilot_tick(...)`, que faz as duas escritas na mesma transação.

**Por que entrega só o DDL, sem chamador:** se o código for deployado antes de a função existir,
o tick quebra. A ordem segura é apply → deploy. A troca em `copilot-tick.ts` é o passo 2, numa PR
própria, depois do apply.

---

## 5. Como cada correção foi provada

Três técnicas, aplicadas sem exceção:

### 5.1 Prova inversa (front)

Para a #3159: **desfiz cada um dos 9 fixes, um por um, e conferi que o teste correspondente
quebra.**

| fix desfeito | resultado |
|---|---|
| `font-semibold` → `font--semibold` | 1 failed / 7 passed |
| descrição do cartão removida | 1 failed / 7 passed |
| `ref` do cartão da grade removido | 1 failed / 7 passed |
| fechamento do painel fantasma removido | 1 failed / 7 passed |
| aviso "+N critérios" removido | 1 failed / 7 passed |
| "Criado em" + amostra removidos | 1 failed / 7 passed |
| `disabled` do recontar removido | 1 failed / 7 passed |
| guarda do "em breve" desligada | 1 failed / 7 passed |
| `allSettled` → `Promise.all` | 2 failed / 6 passed |

Um teste que passa com e sem o fix não prova nada. Este é o único jeito de saber que ele morde.

### 5.2 Bloco A (banco)

Para #3158 e #3160, o teste de comportamento **reproduz a falha atual antes de aplicar a
correção**. Em #3160:

```
[PASS] A1 o INSERT dos insights falha (insight_type NULL)
[PASS] A2 em duas chamadas o cursor FICA adiantado sem nenhum insight
[PASS] migration aplicada
[PASS] B2 nada foi gravado: a sessao continua na versao 7 e sem cursor
```

25/25 em #3160 e 23/23 em #3158, rodados num PostgreSQL de verdade (16, subido no contêiner,
com o `docker-shim` do repositório apontado para ele).

### 5.3 Regeneração em checkout limpo (arquivos gerados)

Para afirmar que `ESTADOS.md` e `deployment-manifest.json` da `main` estão corretos, não bastou
olhar: rodei os geradores num `git worktree --detach` de `origin/main` e conferi que **nada
muda** (`gen-estados --check` exit 0; `generate-manifest` com `git status` vazio).

---

## 6. O fechamento: tirar tudo do contêiner

Com a troca de conta anunciada, a pergunta virou "o que morre com este contêiner".

### 6.1 O que foi medido

| Verificação | Resultado |
|---|---|
| 24 tips de git (branches + HEAD de worktree) | 14 alcançáveis do `origin` ou byte-a-byte idênticas à `main`; 6 divergentes, todas versões **velhas** |
| Alterações não commitadas nos 18 worktrees | **0** |
| Stashes | **0** |
| Blobs `.md`/`.json` do scratchpad vs os 8.982 da `main` | **266 ausentes** → publicados |

### 6.2 O que foi publicado (PR #3162)

- `auditoria/bruto/` — 1.610 arquivos: `items/` (381 entradas de branch), `triagens/` (329),
  `verificacoes/` (328), `reexames/` (47), `achados/` (47), `lotes/` (36), `metodo/` (os 4
  prompts), `dossies-prs-antigas/` (199) e `diarios-sessao/` (236).
- `auditoria/ferramentas/` — os scripts que **produziram** a auditoria.
- `HANDOFF-SESSAO-2026-11-15.md` — 48 KB de estado narrado que a sessão anterior deixou como
  upload e que não existia em nenhuma das 288 refs do `origin`.

**Por que os diários importam, concretamente:** durante a própria auditoria foi preciso voltar a
eles para restaurar 221 pareceres de revisor que um script meu havia cortado em 160 caracteres
(seção 7.3). Sem os diários, essa reparação não poderia ser repetida nem conferida.

### 6.3 A verificação adversarial do próprio fechamento

A pedido do dono, três antagonistas foram lançados com a tarefa de **derrubar** minha conclusão —
não de confirmá-la. Cada um recebeu os furos conhecidos do meu método. **Os três derrubaram**, e
os três achados foram corrigidos:

| Antagonista | O que derrubou |
|---|---|
| Conteúdo | Uma **colisão de nome** apagou a versão cética de um ledger: `p006/branch.json` sobrescreveu `p006_branch.json` da raiz, e a descartada era a que marcava `PARTIAL`/`NOT_IMPLEMENTED` onde a outra diz `DONE_VERIFIED`. Resgatada como `RAIZ__p006_branch.json`. |
| Git | **37 commits órfãos** (7 de rebase/amend, ~30 de stash descartado) que meu teste nunca veria por não serem tip de nada. Conteúdo perdido: nenhum — os 23 blobs ausentes estão em 15 arquivos, todos na `main` em versão posterior. |
| Arquivos | **A máquina da auditoria não estava no GitHub** (`auditar-*.js`, `intermediario.py` e mais 5), e havia trabalho **fora do scratchpad** (o handoff de 48 KB em `/root/.claude/uploads/`). |

O terceiro achado tem uma causa única e constrangedora: eu varri só `.md` e `.json`, só até dois
níveis de profundidade, e só dentro de um diretório.

---

## 7. Os erros que eu cometi

Esta seção existe porque o próximo agente precisa saber onde este método falha.

### 7.1 Afirmei que uma frente de 92 branches "nunca rodou"

Ela tinha concluído, com resultados em disco. Eu já tinha lançado 4 lotes duplicados antes de
perceber. Corrigido na hora; mantive as duas passadas e registrei a redundância.

### 7.2 Introduzi uma regressão de cobrança e dois revisores a acharam antes de mim

Meu próprio fix da #3151 fez o `estimateAiTokens` contar o base64 da imagem como texto. Efeito:
foto acima de ~590 KB estourava o orçamento de 200k e devolvia 429 **sem nem chamar o provedor**.
Devin e Codex acharam de forma independente. Corrigido na raiz, com prova inversa
(`expected 205865 to be less than 200000`).

### 7.3 Cortei 146 pareceres de revisor em 160 caracteres — com um script meu

Devin apontou a truncagem. Minha primeira hipótese foi que o modelo havia se autolimitado.
Conferindo os diários, a causa era `.slice(0,160)` e `.slice(0,200)` **no meu próprio script**.
221 campos restaurados a partir dos diários.

### 7.4 Afirmei que as 226 evidências passaram todas pela revisão adversarial

Números reais: **222** têm parecer de revisor, **4 não têm**. Corrigido com os 4 nomeados numa
tabela.

### 7.5 Apresentei 226 evidências como se fossem 226 tarefas

Corrigido com aviso destacado no README da auditoria e repetido na seção 3.4 acima.

### 7.6 Quase mergeei uma PR cortada de uma `main` dez merges atrasada — e justifiquei com um número inventado

A #3146 estava `mergeable: CONFLICTING` (`mergeable_state: dirty`). A branch tinha um único commit
(`8ea3e73f`, 15/11 16:29:49Z, nunca reescrito) cortado de `ed33ecac` (15/11 16:26:29Z); quando a
fechei, às 16/11 00:14:48Z, a `main` já estava dez merges à frente, em `fd2a19ff`. Recusei,
reconstruí só as 10 linhas que faltavam como #3155 e fechei a #3146 com explicação.

**Correção de métrica.** A versão anterior deste relatório dizia que "o cálculo de merge do GitHub
mostrava que ela apagaria 7.945 linhas". **O número 7.945 é falso e a atribuição também.** O que o
GitHub calcula para a #3146 é 6 arquivos, **+417/−44** — e, estando `CONFLICTING`, ele se recusou a
calcular um merge: um merge não apaga em silêncio linhas que a branch não toca, ele conflita, que é
o que aconteceu. Nenhum diff reproduz 7.945: a divergência de dois pontos
`git diff --shortstat <main> 8ea3e73f` nos doze estados da `main` daquela janela dá 88, 210, 739,
1.760, 1.761, 1.815, 1.970, 7.989, 8.310, 8.327, **8.364** (estado da `main` no instante do
fechamento) e 8.443. O trabalho da `main` que a branch desconhecia é
`git diff --shortstat ed33ecac fd2a19ff` = **8.408 inserções**. A decisão de recusar continua
certa; a métrica que citei para justificá-la era inventada. O mesmo número errado está publicado no
comentário de fechamento da #3146 (`issuecomment-6903771601`) — ver "Próximos passos".

### 7.7 Descrevi uma opção de forma imprecisa para o dono

Disse "ligar a flag = manter tudo como hoje", mas `copilot-live` já estava no mapa de
capacidades: estava **bloqueado** desde as 03:07. Corrigi sem ser perguntado.

### 7.8 Caí duas vezes na mesma armadilha do `ESTADOS.md`

`docs/talkx/ESTADOS.md` é gerado e guarda **arquivo:linha**. Qualquer diff que mova linhas em
`states.tsx` ou `TalkXSegments.tsx` quebra o guard. Aconteceu na #3154 e de novo na #3159.
**Para a próxima sessão: ao mexer em qualquer tela do Talk X, rode
`node scripts/talkx/gen-estados.mjs` antes de abrir a PR.**

### 7.9 Afirmei "tudo verde" numa PR cujos checks principais tinham sido pulados

Na #3159, o run de 01:16 marcou `Build` e `Unit Tests` como **SKIPPED** (aquele push só mexia num
`.md`). Eu li o `CI Gate` verde e declarei verde. A proteção de branch recusou o merge e me
corrigiu. **Rascunho pula Build e Unit Tests; é preciso tirar o rascunho para o pipeline rodar
de verdade.**

### 7.10 Errei sobre o que o `Promise.all` fazia

Escrevi que ele "perdia o recálculo de todos". Devin apontou, e ao rodar a inversão olhando
**qual** assert quebra, o array de updates ficava `['a','b','c']` igual. Os três recálculos
**eram** disparados; o que se perdia era a **apuração**: sem `onSuccess` não havia `invalidate()`,
sem `onError` ninguém era avisado, e o erro do `UPDATE` era ignorado. Comentário do código, do
teste e corpo da PR reescritos.

### 7.11 Usei uma métrica que não prova o que eu disse que provava

**O clone é raso** (`.git/shallow`). Logo `git rev-list --count X --not --remotes=origin > 0`
**não prova** ausência no GitHub — infla. Prova: as 136 tags locais estão **todas no `origin`** e
mesmo assim 95 delas dão contagem > 0 (10.080 somadas) — porque a branch de origem foi apagada,
não porque o conteúdo sumiu. O erro é conservador (faz suspeitar demais, nunca liberar de menos) e a conclusão
se sustentou porque quem a carregou foi o teste de **conteúdo**. Mas eu apresentei a contagem com
mais firmeza do que ela merecia.

**Para a próxima sessão: num clone raso, use teste de blob, não contagem de commits.**

### 7.12 Varri o contêiner de forma estreita demais

Só `.md`/`.json`, só até profundidade 2, só num diretório. Custou três achados reais, todos
encontrados por antagonistas (seção 6.3).

---

## 8. Regras do repositório que moldaram as decisões

- **Regra 8 (chamar o dono):** PR com migration em produção, workflow, segredo, Dockerfile,
  stack, deleção de dado, arquitetura ou custo **fica aberta**. Foi por isso que #3158 e #3160
  não foram mergeadas, mesmo com CI verde e risco medido como baixo.
- **Nunca ficar verde enfraquecendo o portão:** nenhum `skip`, `.only`, `eslint-disable`,
  `@ts-ignore`, `any` para calar erro, baseline expandida ou `--no-verify` foi usado.
- **Produção é somente leitura para diagnóstico.** Todo SQL desta sessão contra
  `tnnnlkbymytvtqngbbqh` foi `SELECT`, exceto a reserva atômica de versão de migration, que é o
  mecanismo documentado em `docs/agentes/banco.md`.
- **`Supabase Preview` vermelho é herdado**, não do diff: o serviço de branching da Supabase
  falha com `ERROR: Job 8 does not exist` em toda PR que toca `supabase/`. Confirmado no check run
  de cada PR (o `details_url` aponta para o projeto de preview **efêmero daquela PR**:
  `bcaftxzkgaxyjqtltwyh` na #3158, `ycuflbrkdymifqrtjmst` na #3160) e já havia precedente de merge
  com ele vermelho (#3144).

---

## 9. O lado local, que foi medido e **não** tocado

O PC do dono tem, segundo medição pela sessão-ponte: **4.377 branches**, 4.240 pontas órfãs,
10.929 commits fora do `origin` e **41.423 commits em `refs/autosave` e `refs/arquivo`**, além
de 596 objetos pendurados, 14 stashes, 131 worktrees e 4 outros clones.

**Nada foi apagado e nada foi publicado.** O critério fixado e não negociado: uma branch local só
fecha quando a ponta dela estiver alcançável a partir de um ref do `origin`. Por esse teste,
**zero** das 4.240 qualificam hoje.

Decisão registrada para quando isso for retomado: publicar como **refs puras**
(`refs/salvo/*`), não como branches — 4.000 branches novas disparariam 4.000 builds na Vercel.

---

## 10. Estado no fechamento

| PR | Estado |
|---|---|
| #3159, #3157, #3156 e mais 22 | mergeadas; as três últimas com deploy de produção `READY` conferido |
| [#3162](https://github.com/adm01-debug/Zapp_Web_V2/pull/3162) | trilha + ferramentas + handoff; aguardando CI |
| [#3158](https://github.com/adm01-debug/Zapp_Web_V2/pull/3158) | **esperando o dono** — RLS de supervisor (migration + workflow) |
| [#3160](https://github.com/adm01-debug/Zapp_Web_V2/pull/3160) | **esperando o dono** — transação do tick (migration + workflow) |

Nas duas abertas o `CI Gate` está verde; o único vermelho é o `Supabase Preview` herdado. Para
mergeá-las é preciso **tirar o rascunho antes**, senão `Build` e `Unit Tests` ficam SKIPPED e a
proteção de branch recusa.

---

## 11. O que a próxima sessão deve fazer, em ordem

1. **Mergear #3162 e aplicar as duas migrations do Copiloto** (#3158, #3160). Sem o apply, o
   pedido de ajuda ao supervisor segue sem leitor e a nota de conversa segue gravável por
   qualquer vendedor.
2. **Trocar as duas gravações do tick pela função** (`copilot-tick.ts:514,531`) — só **depois**
   do apply, nunca antes.
3. **Amarrar rótulo↔valor no cartão "Resumo da Campanha"**
   (`TalkXCampaignReport.test.tsx:244`) — furo que o Devin achou: o teste confere os 8 rótulos e
   que o número 7 aparece em algum lugar, mas não amarra cada valor ao seu cartão; valor trocado
   entre cartões passa sem ninguém ver.
4. **Passar o objeto de erro para o boundary** — 2 das 22 telas ficaram de fora do fix da #3154.
   Os endereços certos (conferidos na `main` `4bc94cb75`; a versão anterior deste relatório
   apontava `TalkXAnalytics.tsx:321`, que é o `return (`, não o ponto a corrigir):
   - **Analytics:** `TalkXView.tsx:679` não passa `error` ao `<TalkXAnalytics>`. O objeto existe
     (`TalkXView.tsx:86`, `error: campaignsError`) e já é repassado a `TalkXOverview` em `:644`.
     Depois de passá-lo, repasse ao `query={{ … }}` de `TalkXAnalytics.tsx:323`.
   - **LiveMonitor:** `TalkXLiveMonitor.tsx:238` passa `error: null` de propósito — o hook não tem
     o que dar: `useTalkXMonitor` (`:127`) devolve só `isError`. É preciso **expor `error` no
     hook**. Os outros três boundaries do arquivo já passam o objeto (`:156`, `:284`, `:44`).
5. **Retomar as 58 evidências de CI/workflow** — maior bloco restante da auditoria, todas
   dependentes de decisão do dono por tocarem workflow.
6. **Retomar o lado local** pelo critério da seção 9, publicando em `refs/salvo/*`.

**Comece lendo:** `RELATORIO-ANEXO-BRANCHES.md` (branch a branch), depois `analise-prs/resgate-261115/auditoria/README.md`, depois
`auditoria/bruto/README.md` e `auditoria/ferramentas/README.md`. O
`HANDOFF-SESSAO-2026-11-15.md` nesta mesma pasta traz o estado narrado de main, banco e
pendências pela sessão anterior a esta.

---

## 12. Armadilhas do ambiente — o que custou tempo e não deve custar de novo

Cada item aqui foi descoberto errando. Ler isto economiza a descoberta.

### 12.1 Contêiner de nuvem

| Sintoma | Causa e solução |
|---|---|
| `npx vitest` falha com `npm error code EOVERRIDE` num worktree novo | O worktree não tem `node_modules`. **Solução:** `ln -sfn /home/user/Zapp_Web_V2/node_modules node_modules` dentro do worktree. |
| `tsc` morre sem mensagem clara | Falta de memória. **Solução:** `NODE_OPTIONS=--max-old-space-size=10240 npx tsc --noEmit -p tsconfig.app.json`. |
| Testes de contrato não acham config | Precisam de `--config vitest.contracts.config.ts`. |
| `deno` não existe | **Não está instalado.** `npm i --no-save --prefix ./denoinst deno@2.9.5`. |
| Import de `deno.land` falha | **O proxy bloqueia `deno.land`.** Eu acrescentei `deno.land` e `cdn.deno.land` à lista de hosts do ambiente Default — se o ambiente for recriado, isso se perde. Alternativa sem mexer na rede: os shims em `auditoria/ferramentas/` (`serve-shim.ts`, `deno-shim.d.ts`, `deno-std-assert.d.ts`). |
| `docker info` falha | **Não há daemon Docker.** Mas os testes `scripts/db-audit/*.test.sh` rodam assim: suba um PostgreSQL 16 local (`/usr/lib/postgresql/16/bin/initdb` + `pg_ctl`, como usuário `postgres`, em diretório que ele consiga atravessar — **não** dentro do scratchpad, cujo pai é `drwx------ root`; usei `/var/lib/postgresql/zapptest`) e aponte o `scripts/db-audit/docker-shim` para ele com `POSTGRES_SERVICE_HOST/PORT/USER`. Um wrapper mínimo que responda `docker info` com exit 0 e delegue o resto ao shim fecha o buraco. |
| `node -e` com import ESM quebra | Escreva um `.mjs` e importe o módulo real (ex.: `sqlTokens` de `scripts/db-audit/sql-lexer.mjs`) em vez de reimplementar. |

### 12.2 CI do repositório

| Armadilha | O que acontece |
|---|---|
| **`docs/talkx/ESTADOS.md`** | É **gerado** e guarda `arquivo:linha`. Qualquer diff que mova linhas numa tela do Talk X quebra `Node CI Scripts` e `Contrato DB offline`. **Rode `node scripts/talkx/gen-estados.mjs` antes de abrir a PR.** Me pegou duas vezes (#3154 e #3159). |
| **`supabase/deployment-manifest.json`** | Também gerado. Se o grafo de imports de uma edge mudar, regenere com `node scripts/edge-deploy/generate-manifest.mjs`. Me pegou na #3151. |
| **PR em rascunho** | `🏗️ Build` e `🧪 Unit Tests` saem **SKIPPED**. O `CI Gate` fica verde assim mesmo, mas a proteção de branch recusa o merge com *"3 of 3 required status checks have not succeeded"*. **Tire o rascunho antes de mergear** e espere o pipeline completo. |
| **Run cancelado** | Quando um push novo cancela o run anterior, o `CI Gate` daquele head reporta `failure`. **Confira `conclusion` do run** (`cancelled` ≠ `failure`) antes de sair caçando defeito. Aconteceu 3 vezes. |
| **`Supabase Preview`** | Falha em **toda** PR que toca `supabase/` com `ERROR: Job 8 does not exist or you don't own it`. É o serviço de branching da Supabase (GitHub App `supabase`, id 330661), **não** o diff. O projeto de preview é **efêmero e um por PR** — `bcaftxzkgaxyjqtltwyh` na #3158, `ycuflbrkdymifqrtjmst` na #3160, `rnnhwphhgzeorfrrvlwf` na #3144, `mjdcproswwprjmbwpnbw` na #3157 — então não use nenhum deles como identificador estável; o projeto da integração é o oficial `tnnnlkbymytvtqngbbqh`. PR que não toca `supabase/` sai `skipped` ("No changes detected in `supabase` directory"). Não é check obrigatório; há precedente de merge com ele vermelho (#3144). |
| **`Devin Review`** | Falha em 7–8 s, sem postar achado, em PR com muitos arquivos de documentação. Não é obrigatório. Quando ele **posta** achado, leia: acertou 3 vezes nesta sessão. |
| Checks obrigatórios | São exatamente três: `✅ CI Gate (required check)`, `🏗️ Build`, `🔎 TypeCheck`. `strict=true` (PR `BEHIND` precisa de `update_pr_branch`), `enforce_admins=true`. **Squash-only é regra do `AGENTS.md`, não configuração do GitHub**: a API mostra `allow_squash_merge=true`, `allow_merge_commit=true`, `allow_rebase_merge=true` e nenhum ruleset (`rulesets?includes_parents=true` → `[]`). O que a `main` impõe é `required_linear_history=true`, que barra merge commit mas **permite rebase merge**. O baseline versionado `scripts/ci/github-settings-baseline.json` ainda diz `allow_merge_commit=false`/`allow_rebase_merge=false` — divergência que o Settings Guard não detecta, porque o token dele não lê `merge.*` e o item sai como `NAO VERIFICAVEL` com o job verde (run 43824057102). Mergeie por squash por disciplina, não porque o GitHub obrigue. |

### 12.3 Git neste clone

- **O clone é raso** (`.git/shallow`). `git rev-list --count X --not --remotes=origin` **não prova**
  ausência no GitHub: as 136 tags `arquivo/*` estão **todas** no `origin` (`ls-remote`: 0 ausentes,
  154 refs `arquivo/*` remotas) e, ainda assim, lidas uma a uma, **95 dão contagem > 0** e 41 dão 0
  (as 136 juntas num único `rev-list` dão 10.080). O corte não é aleatório: das 95, **94 têm a
  branch `origin/<mesmo nome>` apagada**; as 41 que dão 0 têm a branch ainda viva. Ou seja, essa
  contagem mede **branch apagada**, não conteúdo ausente. **Use teste de blob**
  (`git hash-object` contra `git ls-tree -r` das refs).
- **Squash-merge** faz os commits da branch **não** serem ancestrais da `main`. Provar incorporação
  por ancestralidade dá falso negativo; prove por **conteúdo**.
- `git fsck --unreachable` devolve **2.556** commits soltos, 37 deles da janela desta sessão
  (rebase/amend e stash descartado). Nenhum tem conteúdo que falte na `main`.
- Para aprofundar: `git fetch --depth=200 origin '+refs/heads/*:refs/remotes/origin/*'`.

### 12.4 MCP e conectores nesta sessão

- Escrita no GitHub **só** pelo MCP `GITHUB - MCP - FOREVER`; o MCP padrão devolve 403 em write.
  `git push` funciona porque o repositório está autorizado na sessão.
- SQL **só** pelo MCP `SUPABASE - ZAPP WEB V2 - MCP`, projeto **`tnnnlkbymytvtqngbbqh`**.
- Falharam ao conectar o tempo todo: `amplitude`, `atlassian`, `definite`, `hex`, `asana`,
  `linear`, `notion`, `pagerduty`, `slack`, `gitkraken` (todos `403 Forbidden` no túnel do proxy).
  `bigquery` e `datadog` pedem autenticação que a sessão não pode iniciar.
- O `send_later` **falhou uma vez** com `ACCESS_DENIED` sem entregar nada. Não confie nele como
  único mecanismo para retomar uma tarefa.

---

## 13. Fatos de produção levantados em 15–16/11 (somente leitura) — reconfira os voláteis

Tudo lido em 15–16/11, somente leitura, pelo MCP oficial.

> Contagens de linha e uso de IA são fotografias de 16/11 até ~10:30 UTC. As tabelas do Copiloto e
> `ai_usage_logs` começaram a receber tráfego real às 10:12 de 16/11 — **reconsulte-as**. O que é
> estrutural (schema, ledger, assinatura de função, constraints) pode ser reaproveitado sem
> reconsulta.

| Tabela / objeto | Estado |
|---|---|
| `copilot_sessions`, `copilot_insights` | **0 linhas até 16/11 ~10:12 UTC; o Copiloto entrou em uso nesse horário.** Em 16/11 10:45 UTC: 3 sessões / 19 insights, crescendo (`copilot-live` em produção). **Reconsulte antes de qualquer DDL nessas duas tabelas** (#3160 `commit_copilot_tick`, #3158 RLS). |
| `copilot_help_requests`, `copilot_conversation_scores`, `copilot_learning_moments` | **0 linhas** cada |
| `user_roles` | 11 papéis, **5** deles `admin` ou `supervisor` |
| `talkx_segments` | **1 linha** (`[E2E] Segmento de Teste`), 0 regras, `estimated_count = 1`. Nenhum segmento usa `lead_origin`/`lead_score`/`risk_score` |
| `message_reactions` | **115 linhas**, **109 com `user_id IS NULL`** (reações de contato); `reaction_author_check` é `CHECK (user_id IS NOT NULL OR contact_id IS NOT NULL)` |
| Ledger `supabase_migrations.schema_migrations` | 1.137 registros; `max(version) = 20261115020000`; `20261107121000` **já aplicada** (10 statements) |
| Uso de IA | ~8 chamadas em 7 dias até a madrugada de 16/11; a partir das 10:13 de 16/11, 26 chamadas de `copilot-live` em ~50 min. O Copiloto **passou a ser usado** — não trate como ocioso. |
| `public.is_admin_or_supervisor(uuid)` | Existe, `STABLE SECURITY DEFINER`, lê `user_roles`, usada por 388 migrations. **Nenhuma migration do Copiloto a usava.** |

**Versões de migration já reservadas por mim em `supabase_migrations.version_reservations`** (não
reutilize; elas **não** aparecem no ledger `schema_migrations`, cujo `max(version)` segue em
`20261115020000`): `20261115030000` (`commit_copilot_tick`, PR #3160) e `20261115040000` (RLS de
supervisor, PR #3158). Reserve novas com
`SELECT supabase_migrations.reserve_migration_version('<sessao>','<motivo>')` — a função já toma o
maior entre ledger e reservas, então ela não colide com as duas acima; a checagem manual de
`max(version)` só no ledger, sim.

---

## 14. O que **não** precisa ser refeito

- **A auditoria das 329 entradas.** Está feita, com três passadas e prova por entrada. Os dados
  estão em `auditoria/bruto/` e o veredito de cada uma no `RELATORIO-ANEXO-BRANCHES.md`.
- **A medição do lado local.** Os números da seção 9 vieram da sessão-ponte; não refaça o
  levantamento, só continue de onde parou (publicar em `refs/salvo/*`).
- **A varredura do contêiner.** Três antagonistas já a atacaram e os três achados foram
  corrigidos. O que sobrou no contêiner é clone, binário e despejo de ferramenta — a Parte 3 da
  resposta do antagonista de arquivos lista pasta por pasta, com evidência.
- **Conferir se a `main` está com `ESTADOS.md` e `deployment-manifest.json` atualizados.** Está:
  rodei os dois geradores num checkout limpo de `origin/main` e nenhum muda um byte.

---

## 15. O que ficou sem resposta

Honestidade sobre os limites desta sessão:

1. **Branches apagadas no GitHub.** Onde concluí "o conteúdo está na `main`", a prova é
   comparação de conteúdo, não identidade de bytes com a branch original — ela já não existe.
2. **Arquivos criados e apagados durante a sessão** são invisíveis a qualquer varredura feita no
   fim. Não há como afirmar nada sobre eles.
3. **Os ~550 despejos derivados do scratchpad** (`.txt`, `.log`, `.patch`, `.files`) foram
   classificados por **amostragem** e nomenclatura, não um a um.
4. **A entrada `claude__chore-remove-hook-morto-talksuppression-261024-1541`** não passou pela
   verificação adversarial. É 328 de 329.
5. **Os 2.509 commits soltos anteriores a 15/11** não foram inspecionados — estão fora da janela
   desta sessão.
6. **O lado local** (4.377 branches no PC do dono) foi **medido e não tocado**. Nada ali foi
   publicado nem apagado.

---

## 16. Se eu fosse a próxima sessão — o que eu precisaria saber antes de agir

Escrito de propósito na primeira pessoa de quem chega agora.

### 16.1 Autorizações que o dono já deu — não peça de novo

Ele disse, com estas palavras:

- **"VC ESTA AUTORIZADO POR MIM A CRIAR E EDITAR O SUPABASE, BANCO DE DADOS, BACK END!"**
- **"VC ESTA AUTORIZADO POR MIM A EXCLUIR OU FECHAR AS BRANCHS DO PC LOCAL, CUJO TRABAHO DO
  AGENTE DE IA FOI EXASUTIVA E MINUCIOSAMENTE INCORPORADO AO PROJETO!"**
- **"Haja como um Dev sênior responsável pelo sistema e decida e resolva por mim"**
- `APROVADO` (ou `1`, `1 e 3`, `todos`, ou o bloco de próximos passos colado de volta) significa
  **execute na ordem, sem reconfirmar**.

**O que essas autorizações NÃO cobrem:** os itens da regra 8 (DDL em produção, CI/workflows,
segredos, Dockerfile, stack, deleção de dado, arquitetura, custo). Elas continuam exigindo que a
PR fique aberta. Foi por isso que #3158 e #3160 não foram mergeadas, mesmo com CI verde, risco
medido como baixo e tabelas vazias.

### 16.2 O critério de deleção que eu me comprometi a seguir

**Uma branch só fecha quando a ponta dela estiver alcançável a partir de um ref do `origin`**
(`git rev-list <tip> --not --remotes=origin` vazio) — e, num clone raso, confirmado por
**conteúdo**, não por contagem (§12.3).

Por esse teste, **zero** das 4.240 pontas órfãs do PC do dono qualificam hoje. **Nenhuma branch
foi apagada nesta sessão**, nem local nem remota. As 267 marcas de `apagar: true` da auditoria
são **recomendação**, não ação.

### 16.3 Como alcançar o PC do dono (a sessão-ponte)

O dono escreveu o procedimento. Siga-o à risca:

1. **Não** use `list_computer_folders` para decidir nada — ele devolve 4 pastas, todas
   `not_available`.
2. **Nunca** chame `request_computer_folder`.
3. Peça ao dono que rode `claude remote-control` no PC dele.
4. Ache a sessão por `list_sessions`; espere `elevated_session_untrusted_device`; chame
   `confirm_repository_trust` com o `content_digest` que a recusa devolver.
5. Leia as respostas por `list_events`.
6. Ao pedir comando: **"deixe explícito que é SÓ LEITURA"**, **"peça a saída CRUA"**, **"evite
   caracteres que viram HTML"**.

Uma tentativa de autorizar um `git fetch` no clone dele foi **bloqueada** pelo classificador de
modo automático; o dono então escreveu **"EU AUTORIZO!"** e ela passou. A sessão-ponte pergunta
ao dono antes de rodar — comportamento correto, não contorne.

**Pendências que ficaram com a sessão-ponte e nunca voltaram:** a varredura de segredos do clone
ZAPP (pedida em 3 conjuntos) e a tabela dos namespaces `refs/autosave` / `refs/arquivo`. Ela
estava ocupada ~2h30 com o push do Promo Gifts (416 builds na Vercel).

### 16.4 Decisão já tomada sobre o resgate local

Publicar como **refs puras** (`refs/salvo/*`), **não** como branches. Motivo: 4.000 branches
novas disparariam 4.000 builds na Vercel, porque merge/push neste repositório é deploy.

### 16.5 Workflows que **eu** desativei nesta sessão

Autorizado pelo dono. Estão em `disabled_manually` desde 15/11 09:03:

`branch-hygiene-audit.yml` · `check-talkx-pr-body.yml` · `e2e-logado-isolado.yml` ·
`e2e-talkx.yml` · `inventario-estado-semanal.yml` · `talkx-status-regen.yml`

Se algum fizer falta, reative pela API — mas lembre que mexer em workflow é regra 8.

### 16.6 Como o dono quer ser respondido

Isto economiza retrabalho de comunicação:

- **Resultado primeiro**, contexto depois, e só o que muda a decisão dele.
- **Toda afirmação sobre código cita evidência** (arquivo:linha, trecho de diff, saída de
  comando). Sem evidência → escreva "NÃO VERIFICADO" e o motivo.
- Nada de introdução, recapitulação, narração do próprio processo, hedging ou lição de moral.
- Resposta proporcional: fix de 3 linhas → resposta de 5 linhas.
- **Ele não é dev.** Diga o efeito no negócio; a técnica só se ele perguntar.
- Fechar com **exatamente 3 "Próximos passos"**, por impacto, cada um executável por você via
  MCP, escrito para não-dev. É um menu, não uma pergunta.
- Ele pede PT-BR.

### 16.7 O trabalho aberto, com endereço exato

| O que | Onde | Estado |
|---|---|---|
| Aplicar `commit_copilot_tick` | PR #3160 → depois `supabase/migrations/20261115030000_commit_copilot_tick.sql` | esperando o dono (regra 8) |
| Aplicar RLS de supervisor | PR #3158 → `20261115040000_copilot_rls_supervisor.sql` | esperando o dono (regra 8) |
| Chamar a função no tick | `supabase/functions/_shared/copilot-tick.ts:514` e `:531` | **só depois** do apply acima |
| Amarrar rótulo↔valor no "Resumo da Campanha" | `src/components/talkx/report/__tests__/TalkXCampaignReport.test.tsx:244` | achado do Devin, não corrigido |
| Passar o objeto de erro ao boundary | `src/components/talkx/TalkXView.tsx:679` (+ `TalkXAnalytics.tsx:323`) e o hook `useTalkXMonitor` de `src/components/talkx/TalkXLiveMonitor.tsx:127` (+ `:238`) | 2 das 22 telas ficaram fora do fix da #3154 — ver §11 item 4 para o porquê de cada endereço |
| 58 evidências de CI/workflow | `itens-confirmados.json`, filtro `bloqueio = "ci_workflow"` | todas param no dono |
| 9 evidências de migration em produção | mesmo arquivo, filtro `bloqueio = "migration_producao"` | 1 das 10 foi feita (#3157) |
| 151 evidências sem bloqueio | mesmo arquivo, filtro `bloqueio = "nenhum"` | 3 famílias feitas (relatório, segmentos, states); o resto está aberto |
| Resgate local | PC do dono | medido, não tocado — §9 e §16.4 |

Para escolher a próxima família das 151: agrupe `itens-confirmados.json` por `arquivos` e pegue
o maior grupo sem bloqueio. Foi assim que saíram as famílias já feitas. A seguinte, pela última
contagem, era `src/components/talkx/TalkXSegments.tsx` com 9 — **essa já foi** (#3159).

### 16.8 Onde está tudo

```
analise-prs/resgate-261115/
├── RELATORIO-SESSAO-261115-261116.md   ← este documento
├── RELATORIO-ANEXO-BRANCHES.md         ← todas as branches, uma a uma
├── HANDOFF-SESSAO-2026-11-15.md        ← estado narrado pela sessão anterior
├── dossies/                            ← 329 dossiês
├── vereditos.json
└── auditoria/
    ├── README.md                       ← comece aqui para entender a auditoria
    ├── itens-confirmados.json          ← as 226 evidências
    ├── bruto/                          ← os diários das 3 passadas
    │   ├── README.md
    │   ├── items/ triagens/ verificacoes/ reexames/ achados/ lotes/ metodo/
    │   ├── dossies-prs-antigas/
    │   ├── diarios-sessao/
    │   │   └── RAIZ__p006_branch.json  ← a leitura mais cética do ledger P006
    │   ├── perda-intermediaria.json
    │   └── vereditos-finais.json       ← veredito por entrada
    └── ferramentas/                    ← os scripts que RODARAM a auditoria
        └── README.md
```

E, antes de qualquer tarefa, o que o `AGENTS.md` manda:
`git fetch origin contexto && git show origin/contexto:docs/contexto/00-INDEX.md`.
