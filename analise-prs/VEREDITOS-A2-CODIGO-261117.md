# Veredito do bloco A2 — código, edge e E2E que não existem na `main` — 17/11/2026

53 caminhos que a prova byte a byte da #3192 achou em branch e **não** na `main`, em caminho
nenhum. Diferente do A1, aqui não há catálogo de banco para consultar: a pergunta é se a
**funcionalidade** existe na `main`, ainda que com outro nome, outro caminho ou outra forma.

## Resultado

| | |
|---|---|
| Já na `main` sob outro nome ou outro caminho | **50** |
| Feature que a `main` **nunca ligou** — decisão do dono | **3** |
| A recuperar como arquivo | **0** |

"A recuperar como arquivo: 0" não quer dizer que não falta nada. Os 3 últimos faltam de
verdade — mas copiar o arquivo da branch não os entrega, e está explicado abaixo por quê.

## Os 50 que já estão na `main`

### Mesmo hook, outro caminho

| Na branch | Na `main` |
|---|---|
| `src/hooks/chat/useCopilotSession.ts` | `src/hooks/copilot/useCopilotSession.ts` — consumido por `RadarBoundary`, `RadarCards`, `RadarLive` e `RadarPanel` |
| `src/hooks/connections/useInstancePauses.ts` | `src/components/monitoring/hooks/useInstancePauses.ts`, mais `src/hooks/connections/useInstancePauseControls.ts` |
| teste de `useTalkXServiceStatus` | o hook está em `src/hooks/integrations/useTalkXServiceStatus.ts` e é usado em `TalkXView.tsx:94` |

### Mesma funcionalidade, outro nome

| Na branch | Na `main` | Prova |
|---|---|---|
| `src/hooks/copilot/useMultimodalAnalysis.ts` | `src/hooks/copilot/useImageAnalysis.ts` | **chamam a mesma edge**: `invokeEdge('ai-multimodal-analysis', …)` nos dois |
| `src/components/copilot/RadarPhase6Panel.tsx` | `src/components/copilot/RadarPhase10Panel.tsx` e `RadarPhase8to15Panel.tsx` | fase 10 e fases 8–15 são posteriores à fase 6 |
| `src/components/dashboard/SentinelAlertPanel.tsx` | `WarRoomDashboard.tsx` + `war-room/WarRoomAlertRow.tsx` | a `main` dispensa alerta em `WarRoomDashboard.tsx:83`, por `useWarRoomAlerts().dismissAlert` (`:45`) — em vez do `supabase.from as any` direto no componente, como na branch |
| `src/hooks/admin/useMediaMigrationData.ts` | `src/components/admin/MediaMigrationTool.tsx` | a ferramenta existe, com testes de progresso e de a11y; busca os dados com `invokeEdge` no próprio componente. O hook da branch era uma extração, não uma funcionalidade |
| `TalkXCampaignReportExport.test.tsx` | `TalkXCampaignReport.tsx:224` `handlePdfExport` + `buildTalkXCampaignPdfBlob` | e o caso "falha ao gerar o PDF avisa o usuário e libera o botão" está entre os 19 testes da suíte da `main` |
| `talkxStates.matrix.test.tsx` | `src/components/talkx/kit/states.tsx` com `kit/__tests__/states.test.tsx` | |
| `VoIPPanel.test.tsx` | `src/components/calls/__tests__/TelefoniaView.test.tsx` | |

### As 17 fixtures de E2E: incorporadas com nome melhor

A branch tinha `e2e/fixtures/talkx-demo/tela-01.json` … `tela-17.json`. A `main` tem **as 17**,
no mesmo diretório, com nome descritivo em vez de ordinal: `01-campanhas-visao-geral.json`,
`02-segmentos-biblioteca-detalhes.json`, `03-segmentos-criar-editar.json`, e assim por diante.
São carregadas por `mockTalkXBackend(page, tela)` de `e2e/fixtures/talkx-demo.ts`, usado pelos
specs de a11y (`a11y-config-admin`, `a11y-contraste`, `a11y-fab-cabecalho`, `a11y-inbox-teams`,
`a11y-tarefas-dashboard`). Zero perda.

*(Registro de honestidade: a primeira leitura desta medição listou o diretório de fixtures com
`head -8` e concluiu que a `main` não tinha o `talkx-demo/`. Era corte da listagem, não ausência.
Conferido com `git ls-tree -r`: 17 arquivos.)*

### Obsoleto por abordagem diferente

| Na branch | Por quê |
|---|---|
| `src/hooks/useMotionSeguro.ts` | Centralizava `useReducedMotion` num hook. A `main` consulta `useReducedMotion` **direto nos componentes** (`AutoTicketClassifier`, `ChurnPredictionDashboard`, `EvolutionDisconnectBanner` e outros), usa `motion-safe:` do Tailwind no CSS, e tem **dois testes de aceite** do requisito: `CT70_reduzirMovimentoAutomacaoIa.test.tsx` e `reduzirMovimentoInboxCrmConexoes.test.tsx`. O requisito está cumprido e coberto; o hook é estilo, não funcionalidade. |
| `src/components/inbox/copilot/index.ts` | Barrel. A pasta existe na `main` com 13 componentes, importados direto. |
| `src/components/campaigns/__tests__/CampaignsView.test.tsx` | O diretório `src/components/campaigns/` **tem zero arquivos na `main`**: campanhas passaram a viver no módulo Talk X (`src/components/talkx/`). O teste é de um componente substituído. |
| conjunto de carteira e conexão WhatsApp de `claude_pink/nice-hypatia-iikl82` | Já adjudicado: são stubs e recuperar seria regressão. Ver `analise-prs/VEREDITOS-RECUPERACAO-261116.md`. |

## As 3 lacunas que este bloco apontou — reavaliadas em 17/11

**Correção de 17/11.** A versão original desta seção dizia que as três "faltam de verdade" e que
cada uma era decisão do dono. Estava errada em dois pontos, apontados na revisão da #3199 e
conferidos no código: a primeira não é lacuna — é remoção que o dono já decidiu — e as duas
outras foram entregues nesta mesma sessão. Fica o estado real de cada uma.

### 1. Compras do contato — NÃO é lacuna: é remoção que o dono decidiu

A branch `claude/fix-logger-vitest-mock-261017-1000` trazia três testes:
`ContactPurchasesPanel.erro-gravacao.test.tsx`, `ContactPurchasesPanel.total-erro-data.test.tsx`
e `useContactPurchases.criar.test.tsx`.

**O veredito original aqui estava errado.** Ele leu a ausência da tabela como feature nunca
ligada e pediu DDL em produção. Na verdade o módulo foi **removido por decisão do dono em
2026-11-03**, e os três testes da branch são estado **pré-remoção**:

- `supabase/migrations/20261103201500_remove_pagamentos_e_special_agent.sql:2-4` registra a
  decisão: *"Decisao do dono em 2026-11-03 (...): o modulo de pagamentos/compras saiu do front na
  #2690"*.
- a mesma migration, `:63-64`, derruba as tabelas:
  `DROP TABLE IF EXISTS public.contact_purchases CASCADE;` e
  `DROP TABLE IF EXISTS public.payment_links CASCADE;` — com `:8` registrando **0 linhas** nas
  duas antes do drop. Aplicada pela PR #2693 (commit `bd25801a2`).
- o front saiu na PR #2690 (commit `bd4c4bd7a`), que deletou `ContactPurchasesPanel.tsx`,
  `ContactPurchaseHistory.tsx`, `useContactPurchases.ts` e **justamente os três testes** que a
  branch carregava.
- nenhuma migration posterior a `20261103201500` recria as tabelas, e
  `grep -rn -E "contact_purchases|payment_links" src/` devolve **zero linhas**.
- a regra vigente é explícita: `docs/contexto/regras/manual/regras.md:99` (branch `contexto`) —
  *"Pagamentos (`payment_links`, `contact_purchases`) será removido do sistema (decisão
  2026-11-03). Nenhum agente corrige, estende ou constrói sobre esse módulo."*

Portanto: **não é lacuna, não pede decisão do dono e não entra em nenhuma PR.** Os três testes da
branch são descartados por remoção deliberada. As medições originais ("nenhum arquivo com
`purchas`/`compra` no nome", "nenhuma tabela com `purchase` ou `compra`") continuam corretas — o
erro foi atribuí-las a ausência de implementação em vez de remoção.

### 2. Painel de status dos serviços do Talk X (X048 / TL-106) — ENTREGUE nesta sessão

A `main` **tem** as peças: o hook `useTalkXServiceStatus` e o estado
`TalkXCrmUnavailableState`, que aceita uma prop `onViewStatus` e, quando ela vem, mostra o botão
"Ver status dos serviços" (`src/components/talkx/kit/states.tsx:175`).

Medido: **ninguém passa `onViewStatus`** no código de produção da `main`. As únicas menções
estão na própria definição (`:163`, `:165`, `:175`), nos testes do kit e no `__dev__/TalkXKit`.
E `TalkXCrmUnavailableState` só é renderizado em `states.tsx:358`, no caminho de estado forçado
(`forced === 'crm'`), sem a prop.

Consequência prática: **o botão não aparece** na UI real — não há botão morto, há caminho não
ligado. O `ServiceStatusSheet.tsx` da branch é o painel que abriria; sozinho ele não entrega
nada. Entregar pede: usar o estado de indisponibilidade no fluxo real, passar `onViewStatus` e
abrir o painel. Feature, não arquivo.

**Entregue em 17/11 pela PR #3201, já mergeada.** `ServiceStatusSheet.tsx` foi escrito sobre o
`Sheet` do projeto e `TalkXWhatsAppDisconnectedState` passou a abrir o painel por conta própria
quando ninguém passa `onViewStatus` — então o botão deixou de ser caminho morto. `TalkXView.tsx`
não mudou nenhum byte.

### 3. Defesa contra instrução embutida no copiloto — ENTREGUE no lugar certo (PR #3202)

A branch trazia `src/hooks/copilot/usePromptInjectionGuard.ts` (CV-113): 12 expressões
regulares em PT-BR e EN (`ignore suas instruções`, `aja como`, `você é agora`, `[system]`,
`jailbreak`, `dan mode`…) e um resultado `{ isSafe, suspiciousPattern }`.

Medido: a `main` **não tem defesa nenhuma** contra instrução embutida no copiloto. As
ocorrências de "injection" na `main` são de **CSV injection** (`talkxCsv.ts`,
`talkxTemplateFile.ts`), assunto diferente, e o único `sanitiz` em `copilot-tick.ts:472` é
"sanitiza deadline inválida".

A lacuna é real. Mas o arquivo da branch **não a fecha**: ele mesmo se descreve como
"pure client-side heuristic layer", e o prompt do copiloto é montado **na edge**, a partir do
que está no banco. Uma heurística no navegador do operador avisa o operador; não impede que a
mensagem do contato chegue ao modelo. Recuperá-lo como está poria defesa no lugar errado e daria
sensação de cobertura onde não há.

O lugar certo é `supabase/functions/_shared/copilot-tick.ts`, onde o prompt é montado — e isso é
mudança de arquitetura de segurança, decisão do dono.

**Feito em 17/11 na PR #3202**, exatamente nesse lugar: `copilot-tick.ts` passou a neutralizar,
no conteúdo de cada turno, a quebra de linha e o marcador `[VENDEDOR]`/`[CONTATO]` que abriria um
turno falso dentro do prompt — defesa no formato, não em lista de frases suspeitas. 7 testes Deno
novos cobrem o caso, e o arquivo de teste original ficou byte a byte igual ao da `main`.

## O que foi verificado de verdade

- cada um dos 53 caminhos foi julgado por **símbolo exportado** e por **funcionalidade**, com o
  arquivo da `main` nomeado quando existe
- as duas consultas ao banco (tabelas de compras, tabelas de presença) foram **somente leitura**
- **NÃO VERIFICADO:** se o comportamento de cada equivalente da `main` é linha a linha o da
  branch. A prova é de existência e de destino (mesma edge, mesmo hook, mesmo requisito coberto
  por teste), não de equivalência textual.
- nada foi fechado, apagado nem alterado em código por esta PR.
