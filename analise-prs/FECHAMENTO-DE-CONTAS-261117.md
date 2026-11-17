# Fechamento de contas da recuperação — 17/11/2026

Os documentos anteriores desta série adjudicaram bloco por bloco (A1, A2, A3, B, C, D, remoções de
linha, os 58 pares das 71 branches fechadas). O que faltava era a **soma**: a prova de que nenhum
caminho de nenhuma branch ficou fora de alguma classe. Este documento fecha isso, medido contra a
`main` **depois** dos 11 merges desta sessão.

## O fechamento

Cada arquivo que uma branch toca cai em **exatamente uma** destas classes, e a soma tem de dar o
total de arquivos da branch. Medido nas 231 branches remotas (219 de outros agentes + 12 que esta
sessão criou):

| Classe | Arquivos | O que significa para risco de perda |
|---|---|---|
| `iguais` | **921** | mesmo blob **e** mesmo modo que a `main`: já incorporado, byte a byte |
| `movidos` | **177** | mesmo blob em **outro caminho** da `main`: conteúdo lá, de lugar trocado |
| `CONTIDO` | **201** | o arquivo difere, mas **toda** linha da versão da branch existe na da `main`: nada falta |
| `PARCIAL` | **2.953** | falta alguma linha → adjudicado pela cadeia de cinco provas (abaixo) |
| `NOVO` | **738** | a `main` não tem o caminho → adjudicado por categoria (abaixo) |
| `PARCIAL-REMOÇÃO` | **7** | a branch tirou linha que a `main` ainda tem → veredito na #3203 |
| **total** | **4.997** | |

`921 + 177 + 201 + 2.953 + 7 + 738 = 4.997`. E o fechamento vale **por branch**: em nenhuma das
231 a soma das classes diverge do total de arquivos (0 sobras). A tabela por branch está em
`analise-prs/fechamento-261117-por-branch.tsv`.

### As 12 deleções são outro eixo, e não entram nesta soma

Um arquivo que a branch **apagou** não é um arquivo que ela tem numa versão: ele não existe na
árvore dela. Por isso a coluna `delecoes` do TSV fica **fora** de `arquivos`, e somá-la às seis
classes dá 5.009, que não é o total de nada. Em quatro branches isso é visível
(`claude/confident-bardeen-ndq0ch`, `claude/feat-ui-visual-texto-longo-261101-1445`,
`claude/wizardly-ride-dimxnt`, `claude/chore-remove-hook-morto-talksuppression-261024-1541`) — a
última tem `arquivos = 0` e `delecoes = 2`, porque o trabalho dela é inteiro remoção.

As 12 deleções não incorporadas (a branch apagou, a `main` mantém) estão adjudicadas no bloco D,
#3200. Apontado por Devin e por Codex na revisão desta PR: a versão anterior desta tabela trazia
as deleções como se fossem uma sétima classe da mesma soma, o que fazia a tabela impressa somar
5.009 contra um total declarado de 4.997.

## Os 2.953 `PARCIAL`, pela cadeia de provas

Refeita sobre a medição nova:

| Prova | Restam |
|---|---|
| versões distintas de código de produção | **619** |
| com linha de **comportamento** faltando (não comentário/import/tipo/CSS) | **539** |
| direção: a `main` está à frente (tem ≥ comportamento que a branch não tem) | **408** |
| candidatos (a branch tem mais comportamento que a `main` não tem) | **131** |

Os números batem com a medição anterior (531 / 404 / 127); a diferença são as branches desta
sessão. **Os 408 do lado "a `main` evoluiu depois" foram abertos um a um** — 405 pares lidos por
diff contra a `main` atual, com 398 obsoletos por prova nomeada e **7 recuperações reais**, que
entraram por PR própria (#3206, #3208, #3209). O veredito está em
`analise-prs/VEREDITOS-BLOCO-C-261117.md` e nas três PRs.

### Dois pares que só existiram depois do meu próprio merge

Ao mergear o painel X048 (#3201), a `main` ganhou
`src/components/talkx/kit/ServiceStatusSheet.tsx`. Duas branches que também têm esse arquivo
saíram de `NOVO` (caminho inexistente) para `PARCIAL`, e por isso não estavam em nenhum veredito
anterior. Adjudicados aqui:

| Branch | Veredito |
|---|---|
| `claude/feat-talkx-x048-estados-servico-261101-2100` | **obsoleto** |
| `claude_juca/practical-rubin-8xnw0u` | **obsoleto** |

Prova: as duas desenham um estado de CRM a partir de um campo `status.crm`
(`crmOk = crmStatus === 'ok' ? …`), e o hook da `main` **não produz esse campo** —
`src/hooks/integrations/useTalkXServiceStatus.ts:59` devolve `{ whatsapp: { connected } }`, e o
cabeçalho do próprio hook (`:20`) registra que `crm` dependeria de um sinal de disponibilidade que
não existe. É a mesma razão do veredito já publicado para `useTalkXServiceStatus.ts` no bloco C: a
branch devolvia `crm: 'ok'` fixo no código, e recuperar seria **afirmar "CRM operacional" sem
medir**. A outra diferença é a API do componente (`onClose` contra o `onOpenChange` do `Sheet` do
projeto), forma e não função.

## Os 738 `NOVO` — 567 caminhos distintos

| Tipo | Caminhos | Situação |
|---|---|---|
| documento de análise | **381** | texto que agentes escreveram **sobre** o trabalho (`analise-prs/baseline/`, `dossies/`…). Não é funcionalidade do sistema |
| nomeados em veredito | **160** | migrations (33), scripts (32), `src/` (18), testes (18), outros (11), workflows (7), documentos (41) |
| fixtures `talkx-demo` | **15** | **obsoletos**: a `main` tem os 17 equivalentes **renomeados** — `e2e/fixtures/talkx-demo/01-campanhas-visao-geral.json` … `17-estados-sistema-modais.json`, usados por `e2e/talkx-demo.spec.ts`. A branch usava `tela-NN.json` |
| testes desta sessão | **10** | ainda não na `main` porque estão nas PRs abertas #3197, #3204, #3208 e #3209 |
| script órfão | **1** | adjudicado abaixo |

`381 + 160 + 15 + 10 + 1 = 567`. **Zero caminhos sem conta em `src/`, migrations, edge functions e
workflows** — as categorias que carregam funcionalidade.

### O script órfão

`scripts/db-audit/check-ddl-deployments.mjs`, de `claude_pink/cool-dijkstra-xk9ek2`:
**obsoleto**. A `main` tem o mesmo guarda, melhor feito, em
`scripts/db-audit/check-deployments-ledger.mjs`: mesma regra GA25, mesmo `Deployment`
`producao-ddl`, mesmo corte em `20261016000000` — e, ao contrário do da branch, recebe as entradas
por arquivo (`--ledger`, `--deployments`), o que permite rodar offline com fixture, e tem teste
próprio (`check-deployments-ledger.test.mjs`).

## O que foi verificado de verdade

- o gate (blob + modo, do ponto de bifurcação) e a contenção linha a linha foram **refeitos
  inteiros** contra a `main` atual, com os 11 merges desta sessão dentro
- o fechamento por branch é aritmético e checado: **0 das 231** tem sobra entre total e classes
- os três itens que faltavam veredito individual (2 `ServiceStatusSheet`, 1 script) foram lidos por
  diff e nomeados acima, com o arquivo:linha da `main` que cumpre o papel
- **NÃO VERIFICADO:** os **381 documentos de análise** não foram lidos um a um. Eles não são
  funcionalidade do sistema: são o registro que outros agentes fizeram do próprio trabalho, e boa
  parte foi superada pelos vereditos já mergeados nesta série. Eles continuam existindo enquanto a
  branch existir — **só se perderiam se a branch fosse apagada**, e nenhuma foi.
- **NÃO VERIFICADO:** os 201 `CONTIDO` não foram abertos por dentro. Por definicção da classe, toda
  linha da branch existe na `main`; o que a classe não cobre é remoção de linha, e esse ponto cego
  foi medido à parte (`PARCIAL-REMOÇÃO`, 7 pares, #3203).
- **nenhuma branch foi fechada, apagada ou alterada** em nenhum momento desta sessão.

## O que falta para poder fechar branch

Com este fechamento, apagar branch deixa de ser decisão no escuro. Mas continua sendo **deleção de
dado**, que por regra é do dono. Para cada branch, a prova necessária já existe na tabela por
branch: ela pode ser apagada sem perda quando `NOVO = 0`, `PARCIAL = 0`, `PARCIAL-REMOÇÃO = 0` e
`deleções = 0` — hoje **5 branches** estão nesse estado — ou quando todo o seu `NOVO`/`PARCIAL`
estiver nomeado como obsoleto nos vereditos desta série, que é o caso da grande maioria. Os 381
documentos de análise são a única coisa que a deleção levaria embora de fato, e são registro
histórico, não sistema.
