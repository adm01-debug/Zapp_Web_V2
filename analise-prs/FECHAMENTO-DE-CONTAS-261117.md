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
sessão. **Os 408 do lado "a `main` evoluiu depois" estão todos adjudicados.** Primeiro por diff
contra a `main` atual, com 398 obsoletos por prova nomeada e **7 recuperações reais**, que
entraram por PR própria (#3206, #3208, #3209) — veredito em
`analise-prs/VEREDITOS-BLOCO-C-261117.md`. Depois, para fechar sem depender de contagem de
leitura, os 408 foram submetidos a um filtro automático e o resto foi lido um a um; ver a seção
seguinte.

### Como os 408 foram fechados sem depender de "quantos eu li"

Dois testes automáticos foram tentados como substitutos da prova de direção, e **os dois
falharam** — vale registrar, porque explicam por que a prova de direção continua sendo a válida:

| Teste | Quantos dos 408 ele acusa | Por que não serve |
|---|---|---|
| a linha de comportamento não existe em **nenhum** arquivo da `main` | **379** | acusa todo arquivo que a `main` reescreveu: a reescrita descarta a formulação antiga da branch por construção |
| a linha foi **adicionada pela própria branch** (contra o ponto de bifurcação) e não existe em nenhum arquivo da `main` | **291** | mesmo problema: a branch e a `main` mexeram na mesma região em momentos diferentes |

O segundo filtro, ainda assim, é útil como **triagem**: os 117 pares que ele descarta estão
provados limpos (toda linha que a branch escreveu está na `main`), e os 291 que sobram colapsam
em **135 caminhos distintos** — porque o veredito mora no arquivo, não no par: a mesma versão
antiga de `useTalkXSegments.ts` aparece em 11 branches.

Desses 135, **39 já estavam nomeados** nos vereditos publicados desta série. Os **96 restantes
foram lidos um a um** — diff da branch contra o ponto de bifurcação, depois a versão da `main`,
com grep de símbolo e de chamadores para não repetir os falsos positivos de extração:

| Veredito | Caminhos |
|---|---|
| **obsoleto**, com `arquivo:linha` da `main` que cumpre o papel | **95** |
| **recuperar** (`AvatarUpload.handleRemove`, PR #3212) | **1** |
| **dúvida** | **0** |

Os 96 vereditos, um por caminho, estão em `analise-prs/vereditos-96-caminhos/lote-1.md` a
`lote-6.md` (16 cada): cada seção traz a branch representativa, o veredito e a prova com
`arquivo:linha` da `main`. Cada arquivo termina com a contagem do próprio lote, e 6 x 16 = 96.
O `lote-6.md` fecha com 15 obsoletos + 1 recuperado; os outros cinco, com 16 obsoletos cada.

Em 11 dos 96 a `main` é **superset estrito**: mesmo símbolo, mesmo nome, mais casos tratados
(`useReacaoUnica` em `MessageReactions.tsx:40-110` ainda devolve ao servidor a reação removida no
rollback; `moveConversationsStatus` em `conversationArchive.ts:84-138` tem fallback para banco sem
a RPC; `useConnectionOptions:6-21` ganhou `onlyConnected`).

Em **9 deles o sentido é o inverso**: recuperar a branch seria **regressão**, e a cadeia de provas
teria errado se tivesse mandado aplicar. Os casos nomeados:

| Arquivo | O que a branch faria |
|---|---|
| `src/components/catalog/WhatsAppTemplatesManager.tsx` | esconderia os botões de **supervisores**: a branch gatilha por `isAdmin` alegando RLS admin-only, mas a RLS real é `is_admin_or_supervisor(auth.uid())` (`20260315123034_*.sql:25`, `20260317222534_*.sql:52`) e a `main` usa `isSupervisor` (`:39`) |
| `src/components/inbox/CRMAutoSync.tsx` | perderia o `CRMSyncButton` e os estados "CRM não configurado" / "contato não encontrado" |
| `src/components/settings/SettingsView.tsx` | perderia o **salvamento** da aparência, hoje em `:225` via `saveAppearanceSettings` |
| `src/components/dashboard/SentimentAlertsDashboard.tsx` | perderia o aviso de leitura incompleta (`:51-55`) |
| `src/hooks/integrations/useWhatsAppStatus.ts` | perderia o cache de indisponibilidade de stories por instância |
| `src/components/inbox/chat/ChatMessagesArea.tsx` | perderia o `cancelScroll` com distinção de rolagem programática |
| `src/hooks/team-chat/useTeamMessages.ts` | reintroduziria o DELETE lendo `payload.new` em vez de `payload.old` |
| `src/components/talkx/TalkXTemplates.tsx` | reintroduziria `overwrite` criando duplicata em vez de UPDATE pelo id |
| `src/components/dashboard/DashboardView.tsx` | mandaria janela de período aos KPIs até em "hoje" (`:115-120`) e apagaria o aviso sobre `p_until` (`:225-229`) |

As três armadilhas de extração previstas apareceram de novo e foram resolvidas por símbolo, não
por caminho: `ai-response-contracts.ts` → `copilot-tick.ts:59-79` (`CopilotTier1Schema`, superset);
`outbound-message.service.ts` → `src/lib/authenticatedUserId.ts` + `pertenceAoUsuarioAtual`
(`:372-404`); `useMotionSeguro` → guarda global `<MotionConfig reducedMotion="user">` em
`src/App.tsx:83-88`, com comentário dizendo que dispensa `MotionConfig` por tela. E o painel
B·R·I·N·D·E de `CopilotPanel.tsx`/`InsightCard.tsx` virou o RADAR, ligado em
`ChatInputArea.tsx:37,245` → `RadarLive.tsx` → `RadarPanel.tsx:380-441`.

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
| testes desta sessão | **10** | eram desta sessão; entraram na `main` pelas PRs #3197, #3204, #3208 e #3209, todas mergeadas (a medição é do ponto em que elas ainda estavam abertas) |
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
  (as 12 deleções são outro eixo e não entram nessa soma — ver a seção acima)
- os três itens que faltavam veredito individual (2 `ServiceStatusSheet`, 1 script) foram lidos por
  diff e nomeados acima, com o arquivo:linha da `main` que cumpre o papel
- os **96 caminhos** que ainda não tinham veredito nominal foram lidos um a um: **95 obsoletos,
  1 a recuperar, 0 em dúvida**, cada um com o `arquivo:linha` da `main` que cumpre o papel. O
  único a recuperar é `src/components/settings/AvatarUpload.tsx`: o `handleRemove` da `main`
  (`:125-128`) só chama `refreshProfile()`, que não invalida `team-profiles-rpc`, logo remover a
  foto deixava a equipe vendo a foto apagada até recarregar. **Recuperado na PR #3212**, com
  teste que falha sem o fix. (Correção de 17/11: a primeira versão desta linha dizia 96/0/0 e
  chamava essa diferença de "troca". Apontado por Devin na revisão desta PR.)
- o **ponto cego da classe `CONTIDO` foi medido**, e está vazio. A classe garante que toda linha
  da branch existe na `main`, mas não cobre remoção; medindo contra o **ponto de bifurcação** (não
  contra a `main`), e exigindo que a linha esteja ausente do arquivo **inteiro** da branch:
  **0 dos 201** removeram linha de comportamento que a `main` ainda tem. As 7 remoções reais da
  série são outros arquivos, adjudicados na #3203
- os **381 documentos de análise** foram varridos por referência, não lidos por inteiro. Citam
  **36** caminhos que a `main` não tem, e os 36 fecham assim:

  | | Caminhos | Situação |
  |---|---|---|
  | existem na `main` em **outro caminho** | **16** | renomeado/movido; conteúdo lá |
  | estão em alguma branch, classe `NOVO` | **9** | já cobertos pelos vereditos desta série |
  | não estão na `main` **nem em branch nenhuma** | **11** | detalhado abaixo |
  | **total** | **36** | |

  Dos 11: **10 nunca existiram em commit nenhum** do repositório — eram plano, não código — e
  **1** (`src/hooks/team-chat/__tests__/departmentInviteCode.random.test.tsx`) existiu de fato
  (commit `d45033e8`, PR #2570) e foi substituído quando a geração do código de convite virou a
  RPC `create_department_invite` no servidor, o que torna um teste de aleatoriedade no cliente sem
  objeto.

  Dos 10 que nunca existiram, a `main` cumpre **8** por outro nome (`src/lib/offlineQueue.ts` +
  `useOfflineSendQueueDrain`, `src/hooks/auth/useAuth.tsx`,
  `src/components/copilot/VoiceDictation.tsx` + `useAudioTranscription`,
  `ConversationTabs.navegacao.test.tsx`, `AdminView.avatarRevogaUrl.test.tsx`, edge
  `message-delivery` com as constraints `message_delivery_*`) e **2** vêm das PRs fechadas #2079 e
  #2464, cujas branches não existem mais: não há o que recuperar de git, só a descrição.

  **Correção de 17/11:** a primeira versão deste bullet dizia "16 + 4 + 10", que soma 30 e deixava
  6 caminhos sem classe. O erro foi de método: conferi só 16 dos 20 caminhos ausentes e contei a
  divisão a partir dessa lista parcial. Apontado por Codex na revisão desta PR; a medição refeita
  sobre os 36 inteiros dá 16 + 9 + 11.
- o **conteúdo dos 381 documentos foi lido por inteiro** (510.494 bytes, 381 de 381), depois que
  esta linha dizia o contrário. A varredura por referência a arquivo, acima, não pegava uma
  classe: pendência ou regra de negócio descrita em prosa sem citar arquivo. Dos **87**
  candidatos extraídos, **58 já estão na `main`** com `arquivo:linha`, **8 não são
  funcionalidade** e **21 estão ausentes** — destes, **1** é trabalho parcial, **11** são
  DDL/cron/env (regra 8), **6** são endurecimento de edge e **3** não se sustentaram na
  conferência (1 + 11 + 6 + 3 = 21). O trabalho parcial é este:
  `src/hooks/copilot/useDataMasking.ts:40` (CV-114, mascara CPF/CNPJ/e-mail/telefone/cartão/CEP),
  `useLgpdFilter.ts:20`, `usePIIDetector.ts:41` e `src/components/copilot/TransparencyLabel.tsx:22`
  estão prontos e testados com **zero consumidores**, enquanto doze pontos do front mandam texto
  de conversa para a IA sem máscara. Detalhe e vereditos em
  `analise-prs/VARREDURA-CONTEUDO-381-DOCS-261117.md`
- **nenhuma branch foi fechada, apagada ou alterada** em nenhum momento desta sessão.

## O que falta para poder fechar branch

Com este fechamento, apagar branch deixa de ser decisão no escuro. Mas continua sendo **deleção de
dado**, que por regra é do dono. Para cada branch, a prova necessária já existe na tabela por
branch: ela pode ser apagada sem perda quando `NOVO = 0`, `PARCIAL = 0`, `PARCIAL-REMOÇÃO = 0` e
`deleções = 0` — hoje **5 branches** estão nesse estado — ou quando todo o seu `NOVO`/`PARCIAL`
estiver nomeado como obsoleto nos vereditos desta série, que é o caso da grande maioria. Os 381
documentos de análise são a única coisa que a deleção levaria embora de fato, e são registro
histórico, não sistema.
