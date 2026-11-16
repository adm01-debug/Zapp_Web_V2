# Relatório da sessão de 15–16/11/2026 — o que foi feito, como e por quê

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

25 PRs mergeadas na janela da sessão. As que mudam comportamento para o usuário:

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

Resultado: **31 vereditos derrubados**, **153 alegações refutadas**, **226 evidências
confirmadas** (151 sem bloqueio, 58 de CI/workflow, 10 de migration em produção, 7 de decisão do
dono).

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
  existe, agrupadas por veredito, com o resumo completo e as lacunas item a item.
- **Parte C** — as **25 PRs mergeadas** nesta sessão com o que cada uma resolve e **como foi
  verificada**, a 1 PR que recusei e fechei, e as 3 que ficaram abertas.

### 3.3 O que ficou versionado

- `analise-prs/resgate-261115/dossies/` — 329 dossiês (PR #3141)
- `analise-prs/resgate-261115/auditoria/` — o destilado: `itens-confirmados.json` com as 226
  evidências + 13 arquivos de lote (PR #3153)
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

1. `copilot_help_requests` — o vendedor grava o pedido e **ninguém consegue ler**. Recurso morto.
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

### 7.6 Quase mergeei uma PR que apagaria 7.945 linhas

A #3146 estava `mergeable: false, dirty`, e o cálculo de merge do GitHub mostrava que ela
**apagaria 7.945 linhas** de trabalho do mesmo dia (a pausa por instância da #3144 e meu próprio
fix do estimador). Recusei, reconstruí só as 10 linhas que faltavam como #3155 e fechei a #3146
com explicação.

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
**não prova** ausência no GitHub — infla. Prova: 136 tags locais dão contagem > 0 e **todas estão
no `origin`**. O erro é conservador (faz suspeitar demais, nunca liberar de menos) e a conclusão
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
  falha com `ERROR: Job 8 does not exist` em toda PR que toca `supabase/`. Confirmado pelo app
  (`project mjdcproswwprjmbwpnbw`) e já havia precedente de merge com ele vermelho.

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
4. **Passar o objeto de erro para o boundary** em `TalkXAnalytics.tsx:321` e
   `TalkXLiveMonitor.tsx:238` — 2 das 22 telas ficaram de fora do fix da #3154.
5. **Retomar as 58 evidências de CI/workflow** — maior bloco restante da auditoria, todas
   dependentes de decisão do dono por tocarem workflow.
6. **Retomar o lado local** pelo critério da seção 9, publicando em `refs/salvo/*`.

**Comece lendo:** `RELATORIO-ANEXO-BRANCHES.md` (branch a branch), depois `analise-prs/resgate-261115/auditoria/README.md`, depois
`auditoria/bruto/README.md` e `auditoria/ferramentas/README.md`. O
`HANDOFF-SESSAO-2026-11-15.md` nesta mesma pasta traz o estado narrado de main, banco e
pendências pela sessão anterior a esta.
