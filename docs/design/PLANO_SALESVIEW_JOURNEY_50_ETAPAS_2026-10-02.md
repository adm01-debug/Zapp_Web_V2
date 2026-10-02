# Inbox — Plano SalesView + Journey: 50 etapas

**Gerado em:** 2026-10-02 · **Base do levantamento:** `main` `e6fd391` (`fix(inbox): destaque do HighlightedText…`, #1594)
**Estado:** proposto — nenhuma etapa executada. Revisado em 02/10 após o Codex review na PR #1603: fases passam a ser seriais (2 e 3 tocam `ConversationTabContent.tsx`, `ConversationTabs.tsx` e `ContactAccordionSections.tsx`) e a SalesView mantém o botão "+ Novo" montado também no estado vazio (S14). Segunda rodada do Codex (mesmo dia): "+ Novo" invalida o cache do CRM 360° (S15), a grade de 4 colunas fica só nas abas centrais enquanto o sidebar ainda renderiza os widgets (S14/S24) e a varredura de vocabulário exclui os rótulos de pedido do CRM externo (S45). Passa a ser o plano vigente para o painel central e o painel direito do inbox quando a etapa S01 for executada.
**Pedido de Joaquim (literal, 02/10):** *"mesclar a função 'pedidos' com a função 'resumo comercial', deixar todas essas informações juntas somente no topo da página do chat panel e deixar apenas o nome de 'salesview' — o nome pedidos vai desaparecer, mas a função continua integrada à função resumo comercial; no sidebar do contato excluir o 'resumo comercial' para liberar espaço e não ficar redundante. Fazer algo semelhante com a função 'estatísticas' do sidebar: excluir dali e integrar ao 'histórico' da barra superior com o nome 'Journey'."*

Entendimento confirmado em sessão (02/10): nomes em inglês mesmo (**SalesView**, **Journey**); a duplicata "Estatísticas" e "Compras & Propostas" dentro de "Mais detalhes" também saem do sidebar; os KPIs por período que a aba Histórico já tem continuam, lado a lado com as Estatísticas gerais do contato.

---

## 1. Retrato em 02/10/2026 — o que existe hoje, com arquivo e linha

### 1.1 Barra superior do chat (painel central)

| Elemento | Onde | Observação |
|---|---|---|
| Lista de abas e rótulos | `src/components/inbox/chat/ConversationTabs.tsx:20-28` | `{ id: 'orders', label: 'Pedidos', icon: ShoppingBag }` e `{ id: 'history', label: 'Histórico', icon: History }` |
| Tipo `ConversationTab` | `ConversationTabs.tsx:10` | união literal `'chat' \| 'ia' \| 'crm' \| 'orders' \| 'tasks' \| 'notes' \| 'files' \| 'history'` |
| Badge da aba Pedidos | `ConversationTabs.tsx:57` + `src/components/inbox/RealtimeInboxView.tsx:132-134` | conta `crm360.purchases.length` client-side, fora da RPC `get_conversation_tab_counts` |
| `data-testid` das abas | `ConversationTabs.tsx:64` | `conversation-tab-${tab.id}` — os ids são contrato de teste |
| Montagem do conteúdo | `src/components/inbox/chat/ConversationTabContent.tsx:98-101` (Pedidos) e `:123-126` (Histórico) | `<Panel name="Pedidos">` / `<Panel name="Histórico">` — `name` vai para o `SectionErrorBoundary` |
| Aba persistida | `src/hooks/inbox/useInboxUIState.ts:10-15` | `VALID_TABS` lista os 8 ids; `TAB_REDIRECTS` já tem o precedente `reminders → tasks` (fusão Lembretes→Tarefas, etapa 73); chave `zapp:inbox:conversation-tab` |
| Conteúdo da aba Pedidos | `src/components/inbox/tabs/OrdersTab.tsx` (46 linhas) | `<h2>Pedidos</h2>` + "Compras e propostas deste contato." + empty state "Nenhum pedido registrado" **ou** dois `SectionCard` (`ContactPurchasesPanel` + `OpenDealsList`) |
| Conteúdo da aba Histórico | `src/components/inbox/tabs/HistoryTab.tsx` | `<h2>Histórico da Conversa</h2>`, filtros Período/Tipo, `KpiStrip` de 4 células por período (`metrics` do `useConversationHistoryTimeline`) e timeline por dia |
| Atalhos de outras abas | `src/components/inbox/tabs/Crm360Tab.tsx:193` ("Ver todas →" → `'orders'`) e `:283` ("Ver histórico →" → `'history'`) | são os únicos pontos que navegam para essas abas por código |

### 1.2 Painel direito (sidebar do contato)

| Elemento | Onde | Observação |
|---|---|---|
| Catálogo de seções | `src/components/inbox/contact-details/contactDetailSections.ts:12-32` | `commercial-summary` (linha 20), `purchases` (24), `stats` (28). `DEFAULT_OPEN_SECTIONS` (linha 34) inclui `commercial-summary` |
| Limpeza de localStorage | `contactDetailSections.ts:38-52` | `getStoredAccordionState` já filtra valores que saíram do catálogo ("localStorage antigo pode ter secao que nao existe mais") — remover do catálogo basta |
| Card "Resumo Comercial" | `src/components/inbox/contact-details/ContactAccordionSections.tsx:83-85` | `<Section index={3} value="commercial-summary">` → `ComercialSummaryWidget` |
| Widget Resumo Comercial | `src/components/inbox/contact-details/ComercialSummaryWidget.tsx` (34 linhas) | 4 tiles: Compras (n) / Ticket médio / Propostas / Em aberto — tudo de `useContactCrm360(contactId).resumo` + `ticketMedio`. Só usado aqui |
| "Compras & Propostas" em Mais detalhes | `ContactAccordionSections.tsx:122-124` | `ContactPurchasesPanel contactId profileId` — **duplicata** do que a aba Pedidos mostra |
| "Estatísticas" em Mais detalhes | `ContactAccordionSections.tsx:128-130` | `ContactStatsSection` |
| Widget Estatísticas | `src/components/inbox/contact-details/ContactStatsSection.tsx` (130 linhas) | 4 tiles com sparkline: Mensagens / Tempo médio / Conversas / CSAT, de `useContactStats`. Só usado aqui |
| Fonte das estatísticas | `src/hooks/crm/useContactStats.ts` → `src/services/contact.service.ts:195-236` | 4 queries diretas em `messages` (count + 500 datas + 200 com sender) e `csat_surveys` |
| Índices de animação do accordion | `ContactAccordionSections.tsx:30-36` (`sectionVariants`, `custom={index}`) | `Section index={3}` é o Resumo Comercial; Última atividade é `index={6}`, Mais detalhes `custom={7}` |

### 1.3 Testes que fixam o estado atual

| Teste | O que afirma hoje | Vai mudar? |
|---|---|---|
| `src/components/inbox/chat/__tests__/ConversationTabs.test.tsx:9-20, 45-55, 82-87` | ordem contratada com `conversation-tab-orders`/`-history`; badge "de Pedidos" via `extraCounts.orders`; "Histórico nunca renderiza badge" | só nomes de teste e rótulos; os ids ficam |
| `src/components/inbox/__tests__/ConversationTabs.test.tsx:35, 96-100, 118-128` | `ABAS` com `orders`/`history`; badge de Pedidos; `normalizeConversationTab` (`reminders → tasks`, lixo → `chat`) | só nomes de teste e rótulos (S08); `normalizeConversationTab` não muda porque os ids ficam (D1) |
| `src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx:129-137` | "Ver todas →" chama `onTabChange('orders')`; "Ver histórico →" chama `'history'` | só o nome do `it` |
| `src/components/inbox/tabs/__tests__/HistoryTab.test.tsx` | 5 casos: eventos por dia, KPIs do hook (`kpi-strip`), troca de período, empty state, "Carregar mais" | ganha mocks de `useContactStats` e casos novos (S29) |
| `OrdersTab`, `ComercialSummaryWidget`, `ContactStatsSection`, `contactDetailSections` | **sem teste** hoje | ganham teste nas etapas S18, S30, S36 |
| E2E (`e2e/*.spec.ts`) | nenhum spec toca `conversation-tab-*` nem o sidebar do contato (grep vazio) | nada a mudar; S41 e S42 cobrem a validação em produção com print e query |

### 1.4 Quatro achados que mudam o plano

1. **Os "↗12%", "−8%" e "5%" das Estatísticas são inventados.** `ContactStatsSection.tsx:57-90` define `change: 12`, `change: -8`, `change: 0`, `change: 5` como constantes, e `sparkData` com séries fixas (`[3, 5, 2, 8, 6, 4, …]`) onde só o último ponto é real. O print do Joaquim mostra exatamente o "↗12%" em Mensagens. Mover isso para a Journey sem corrigir seria carregar um número falso para uma aba de maior destaque. O plano **remove** a variação e o sparkline falsos (S25) — não há série histórica disponível no hook para substituí-los por dado real sem query nova, e abrir query nova está fora do pedido.
2. **"Conversas" não conta conversas.** `contact.service.ts:208,234`: `totalConversations = uniqueDays.size` — número de **dias distintos com mensagem** (das últimas 500). O rótulo vai continuar sendo o que o Joaquim já vê, mas o plano troca o `sublabel` para dizer o que o número é (S26), em vez de deixar o leitor supor.
3. **`ContactPurchasesPanel` na aba Pedidos não recebe `profileId`.** `OrdersTab.tsx:36` chama `<ContactPurchasesPanel contactId={contactId} />`; o insert do botão "+ Novo" grava `created_by: profileId` (`ContactPurchasesPanel.tsx:74`) — na aba central isso entra como `NULL`, no sidebar entra com o usuário. Como a SalesView vira o **único** lugar com esse botão, o plano passa o `profileId` (S15), senão a remoção do sidebar piora a rastreabilidade de quem registrou a compra.
4. **A aba Pedidos tem dois caminhos de empty state que divergem.** `OrdersTab.tsx:17` esconde tudo quando `crm360` não tem compras nem deals; mas `ContactPurchasesPanel` faz **sua própria query** em `contact_purchases` (`:56-60`) e tem seu próprio empty state ("Nenhum registro de compra/proposta"). Na fusão, o Resumo Comercial (que lê `crm360.resumo`) precisa aparecer **sempre**, inclusive no estado vazio — zero compras é informação comercial, não ausência de informação. E o `ContactPurchasesPanel` precisa ficar **montado** no estado vazio: é ele que tem o botão "+ Novo"; com o `isEmpty` atual escondendo o painel e a Fase 4 tirando a cópia do sidebar, um contato sem compras ficaria sem lugar para registrar a primeira (S14).

---

## 2. Regras deste plano

- **Só front.** Nenhuma migration, nenhuma RPC nova, nenhuma edge function. Os hooks `useContactCrm360`, `useContactStats` e `useConversationHistoryTimeline` ficam como estão; os dados mudam de lugar, não de origem.
- **Ids internos não mudam.** `'orders'` e `'history'` continuam sendo os ids de `ConversationTab`, dos `data-testid` (`conversation-tab-orders`, `conversation-tab-history`, `orders-tab`, `history-tab`) e da chave persistida em localStorage. Renomear id é churn: tocaria `useInboxUIState`, 3 arquivos de teste, `Crm360Tab` e o `TAB_REDIRECTS` só para o código "combinar" com o rótulo. O que o usuário vê é o **rótulo**; o id é contrato interno. Registrado como decisão D1 na seção 6.
- **Arquivos ganham nome novo só quando o conteúdo muda de responsabilidade.** `OrdersTab.tsx` → `SalesViewTab.tsx` e `HistoryTab.tsx` → `JourneyTab.tsx` porque os dois passam a hospedar blocos que não hospedavam. Os dois widgets removidos do sidebar **mudam de pasta** (`contact-details/` → `tabs/`) porque deixam de pertencer ao painel direito. Rename = `git mv` em commit próprio para o diff de conteúdo ficar legível.
- **Um PR por fase, 5 PRs no total** (seção 3). Cada PR fecha verde nos 6 required checks antes do próximo começar, para não acumular três renames em revisão ao mesmo tempo. **Fases 2 e 3 são seriais, não paralelas**: as duas editam `ConversationTabContent.tsx` (S12/S22), o import de ícones de `ConversationTabs.tsx` (S17/S28) e os imports de `ContactAccordionSections.tsx` (S13/S23). Duas PRs abertas sobre esses três arquivos conflitariam no merge da segunda — exatamente o que a conferência de sobreposição (S01/S11/S21) existe para impedir.
- **Diff mínimo.** Nada de reestilizar `KpiStrip`, `SectionCard`, `ContactPurchasesPanel` ou `OpenDealsList`. Onde a fusão precisa de layout novo, o novo bloco usa os componentes que já existem.
- **Nome de branch** segue o fluxo Git do Joaquim: `claude/feat-salesview-journey-f<N>-<AAMMDD-HHMM>`; nome sem carimbo de hora não é aceito. Antes de abrir cada PR, listar PRs abertas e conferir se outra sessão toca `ConversationTabs.tsx`, `ContactAccordionSections.tsx`, `OrdersTab.tsx` ou `HistoryTab.tsx` — se tocar, parar e avisar.
- **Gates por PR** (os mesmos do CI, rodados antes do push): `bun run typecheck`, `bun run lint`, `bun run test` (ou `bunx vitest run <pasta>` na pasta tocada, depois a suíte inteira), `bun run build`, `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/implicit-any-ratchet.mjs`, `node scripts/qa/medir-tipografia.cjs --check`. O guard de tipografia reprova `text-[Npx]` cru — os blocos novos usam só tokens da escala (`text-2xs`, `text-3xs`, `text-xs`…), como os vizinhos.

---

## 3. Fases e PRs

| Fase | PR | Etapas | Entrega visível para o Joaquim |
|---|---|---|---|
| 1 · Rótulos | `feat(inbox): abas SalesView e Journey no lugar de Pedidos e Histórico (S01–S10)` | S01–S10 | Barra superior já mostra **SalesView** e **Journey**. Conteúdo ainda o antigo. Sidebar intacto. |
| 2 · SalesView | `feat(inbox): SalesView absorve o Resumo Comercial (S11–S20)` | S11–S20 | Topo da SalesView com os 4 números do Resumo Comercial + compras + propostas. Sidebar ainda com o card (sai na Fase 4). |
| 3 · Journey | `feat(inbox): Journey absorve as Estatísticas do contato (S21–S31)` | S21–S31 | Topo da Journey com Mensagens/Tempo médio/Conversas/CSAT (sem os % inventados), depois filtros, KPIs por período e timeline. |
| 4 · Sidebar | `feat(inbox): sidebar do contato sem Resumo Comercial, Estatísticas e Compras & Propostas (S32–S40)` | S32–S40 | Sidebar mais curto. Nada some do sistema: tudo já está nas abas das fases 2 e 3. |
| 5 · Fechamento | `docs(inbox): fechamento do plano SalesView + Journey (S41–S50)` | S41–S50 | Prints antes/depois, docs e status atualizados, graphify, placar do plano. |

Ordem obrigatória: 1 → 2 → 3 → 4 → 5, cada fase a partir de `main` com a anterior mergeada. A Fase 4 **só** começa com 2 e 3 mergeadas: remover do sidebar antes de o destino existir deixaria o Joaquim sem o dado em lugar nenhum por um deploy inteiro (Vercel sobe `main` sozinho).

---

## 4. As 50 etapas

Formato: **Hoje** (o que o código faz, com linha) · **Fazer** (a mudança exata) · **Aceite** (como provar que ficou pronto). Uma etapa = um commit, salvo onde indicado "mesmo commit de".

### Fase 1 — Rótulos SalesView e Journey (PR 1)

**S01 · Branch e verificação de sobreposição**
Hoje: `main` em `e6fd391`; sem PR aberta tocando os 4 arquivos centrais (conferir de novo no dia).
Fazer: `git fetch origin main && git checkout -b claude/feat-salesview-journey-f1-<AAMMDD-HHMM> origin/main`. `github_list_pull_requests` (state=open) e grep de `ConversationTabs.tsx`, `ConversationTabContent.tsx`, `OrdersTab.tsx`, `HistoryTab.tsx`, `ContactAccordionSections.tsx` nos arquivos de cada PR.
Aceite: branch criada; lista de PRs abertas registrada no corpo do PR como "sem sobreposição em <data/hora>" ou plano pausado com aviso ao Joaquim.

**S02 · Rótulo SalesView na barra**
Hoje: `ConversationTabs.tsx:25` → `{ id: 'orders', label: 'Pedidos', icon: ShoppingBag }`.
Fazer: `label: 'SalesView'`. Ícone fica `ShoppingBag` nesta fase (troca de ícone é decisão de design separada — D3).
Aceite: `bunx vitest run src/components/inbox` verde (nenhum teste afirma o texto "Pedidos" como `getByText`; só nomes de `it`).

**S03 · Rótulo Journey na barra**
Hoje: `ConversationTabs.tsx:26` → `{ id: 'history', label: 'Histórico', icon: History }`.
Fazer: `label: 'Journey'`. Ícone `History` fica.
Aceite: idem S02. Mesmo commit de S02.

**S04 · Nome do painel no error boundary**
Hoje: `ConversationTabContent.tsx:99` `<Panel name="Pedidos">`, `:124` `<Panel name="Histórico">` — `name` aparece na mensagem "Erro ao carregar <name>" do `SectionErrorBoundary`.
Fazer: `name="SalesView"` e `name="Journey"`.
Aceite: grep `name="Pedidos"\|name="Histórico"` em `src/components/inbox/chat/` vazio.

**S05 · Comentário do badge em `RealtimeInboxView`**
Hoje: `RealtimeInboxView.tsx:132` comenta "Badge da aba Pedidos vem do CRM 360°".
Fazer: trocar "Pedidos" por "SalesView" no comentário; `crm360ForOrdersBadge` e `tabExtraCounts.orders` ficam (id interno, D1).
Aceite: grep `aba Pedidos` em `src/components/inbox/RealtimeInboxView.tsx` vazio.

**S06 · Título e subtítulo da aba (conteúdo antigo, nome novo)**
Hoje: `OrdersTab.tsx:22-23` `<h2>Pedidos</h2>` / "Compras e propostas deste contato."; `HistoryTab.tsx:94-95` `<h2>Histórico da Conversa</h2>` / "Acompanhe toda a jornada de relacionamento com este contato."
Fazer: `<h2>SalesView</h2>` com subtítulo "Resumo comercial, compras e propostas deste contato." e `<h2>Journey</h2>` com subtítulo "Estatísticas e toda a jornada de relacionamento com este contato." — os subtítulos já anunciam o que as fases 2 e 3 entregam, para o rótulo não mudar duas vezes.
Aceite: `HistoryTab.test.tsx` continua verde (não afirma o h2).

**S07 · Rótulos dos atalhos no CRM 360°**
Hoje: `Crm360Tab.tsx:193` ação "Ver todas →" (vai para `'orders'`); `:283` "Ver histórico →" (vai para `'history'`).
Fazer: "Ver todas →" → "Ver no SalesView →"; "Ver histórico →" → "Ver na Journey →". `onTabChange('orders')`/`('history')` ficam.
Aceite: `Crm360Tab.test.tsx:129-137` atualizado para os textos novos (`getByText('Ver no SalesView →')`), nomes dos `it` com os nomes novos; suíte verde.

**S08 · Nomes de teste e comentários que dizem "Pedidos"/"Histórico"**
Hoje: `chat/__tests__/ConversationTabs.test.tsx:10, 45, 51, 82`; `inbox/__tests__/ConversationTabs.test.tsx:96`.
Fazer: comentário da ordem contratada vira "Chat → Arquivos → IA → CRM 360° → SalesView → Journey → Tarefas → Notas"; `it('badge de SalesView vem de extraCounts…')`, `it('Chat, IA, CRM e Journey nunca renderizam badge')`. Ids e `ORDEM_CONTRATADA` **inalterados**.
Aceite: grep `Pedidos\|Histórico` em `src/components/inbox/**/__tests__/ConversationTabs.test.tsx` vazio; suíte verde.

**S09 · Teste de contrato dos rótulos**
Hoje: nenhum teste afirma o texto visível das abas (o `<span>` do rótulo é `hidden 2xl:inline`, por isso os testes usam `data-testid`).
Fazer: em `chat/__tests__/ConversationTabs.test.tsx`, um `it('rotula orders como SalesView e history como Journey')` que lê `within(getByTestId('conversation-tab-orders')).getByText('SalesView')` e o par `history`/`Journey` — o texto existe no DOM mesmo escondido por breakpoint, `getByText` encontra.
Aceite: teste verde; e vermelho se alguém voltar o rótulo para "Pedidos".

**S10 · Fechamento da Fase 1: gates, PR, merge**
Fazer: rodar os 7 gates da seção 2; push; PR com corpo "por quê" (pedido do Joaquim) + "verificado" (saída resumida dos gates); esperar os 6 required checks; squash-merge; apagar branch local e remota; conferir deploy Vercel (`github_list_workflow_runs` + deployment da Vercel para o commit de merge).
Aceite: PR mergeada, deploy `READY`, print da barra superior em produção com "SalesView" e "Journey" guardado em `docs/design/salesview-journey/01-barra.png` (entregue de verdade no S42; aqui basta o print na sessão).

### Fase 2 — SalesView absorve o Resumo Comercial (PR 2)

**S11 · Branch da Fase 2 a partir de `main` com a Fase 1 mergeada**
Fazer: `claude/feat-salesview-journey-f2-<AAMMDD-HHMM>` de `origin/main`; repetir a conferência de PRs abertas de S01 (agora para `OrdersTab.tsx`, `ComercialSummaryWidget.tsx`, `ContactAccordionSections.tsx`).
Aceite: `git log -1` da branch = merge commit da Fase 1.

**S12 · Rename `OrdersTab.tsx` → `SalesViewTab.tsx` (só o rename)**
Hoje: `src/components/inbox/tabs/OrdersTab.tsx` exporta `OrdersTab`.
Fazer: `git mv` e renomear export para `SalesViewTab`; `ConversationTabContent.tsx:12-13` passa a importar `../tabs/SalesViewTab` / `m.SalesViewTab`. Nenhuma outra mudança neste commit.
Aceite: typecheck verde; `git show --stat` mostra `rename` com similaridade ≥ 90 %.

**S13 · Mover `ComercialSummaryWidget` para `tabs/` (só o move)**
Hoje: `contact-details/ComercialSummaryWidget.tsx`, importado só por `ContactAccordionSections.tsx:17`.
Fazer: `git mv` para `src/components/inbox/tabs/CommercialSummaryStrip.tsx` (o original mistura português e inglês em `ComercialSummaryWidget`; o nome novo fica inteiro em inglês como os vizinhos `KpiStrip`/`SectionCard`); export `CommercialSummaryStrip`; `ContactAccordionSections.tsx:17` importa do caminho novo **temporariamente** (o sidebar só perde o card na Fase 4).
Aceite: typecheck verde; o sidebar continua renderizando o Resumo Comercial (nada muda na tela nesta etapa).

**S14 · Resumo comercial sempre visível no topo da SalesView**
Hoje: `SalesViewTab.tsx` (ex-`OrdersTab`) esconde tudo no empty state (`isEmpty` na linha 17).
Fazer: apagar o `isEmpty ? … : …` e o `EmptyState` de nível de aba (`OrdersTab.tsx:17, 25-31`). A aba passa a renderizar **sempre** três blocos, nesta ordem: (1) `SectionCard icon={CircleDollarSign} title="Resumo comercial" tone="blue"` com `<CommercialSummaryStrip contactId={contactId} className="xl:grid-cols-4" />` — a strip mantém `grid-cols-2` por padrão e só **aceita** um `className` extra (`cn('grid grid-cols-2 gap-2', className)`); as 4 colunas são pedidas pela aba, não embutidas no componente, porque até a Fase 4 o sidebar de 323 px ainda renderiza a mesma strip e `xl:` é breakpoint de viewport, não de container; (2) `SectionCard` "Compras e propostas" com `ContactPurchasesPanel` — que já traz o botão "+ Novo" e o próprio empty state "Nenhum registro de compra/proposta" (`ContactPurchasesPanel.tsx:97-105`); (3) `SectionCard` "Propostas em aberto" com `OpenDealsList`, que já tem `emptyMessage` padrão "Nenhuma proposta em aberto" (`OpenDealsList.tsx:19`). Motivo: o painel de compras precisa ficar montado no estado vazio, senão depois da Fase 4 um contato sem compras não tem onde registrar a primeira (achado 4). A palavra "pedido" sai do vocabulário da aba, como o Joaquim pediu; o import de `EmptyState` e `isEmpty`/`hasPurchases`/`hasOpenDeals` somem. Os comentários de `OpenDealsList.tsx:10,16` que dizem "aba Pedidos" passam a dizer "SalesView" (só comentário).
Aceite: contato sem compras mostra os 4 tiles com "—"/"0", o botão "+ Novo" e os dois empty states internos; contato com compras mostra os 4 tiles com valores + a lista + as propostas. `data-testid="commercial-summary-strip"` no container da grade; grep `Nenhum pedido` em `src/` vazio.

**S15 · `profileId` e atualização do resumo após "+ Novo" (achado 3)**
Hoje: `SalesViewTab` não recebe `profileId`; `ContactPurchasesPanel` grava `created_by: NULL` quando chamado dali. `ConversationTabContent` não tem `profileId`; `RealtimeInboxView` tem via `useConversationActions()` (como `ContactDetails.tsx:26`). Além disso, `addPurchase` (`ContactPurchasesPanel.tsx:67-82`) só reexecuta o `loadPurchases()` privado: a strip do resumo e o badge da aba leem `useContactCrm360` (`staleTime: 60_000`, `useContactCrm360.ts:219`) e ficariam com o total antigo até remontar a aba — na SalesView os dois ficam lado a lado, então a divergência seria visível na hora.
Fazer: `SalesViewTabProps` ganha `profileId: string | null`; `ConversationTabContent` ganha prop `profileId` e repassa; `RealtimeInboxView` passa `inbox.profile?.id ?? null` (`RealtimeInboxView.tsx:93` já usa `inbox.profile?.id` para os filtros). No `ContactPurchasesPanel`, após o insert sem erro, `queryClient.invalidateQueries({ queryKey: contactCrm360Key(contactId) })` (`useQueryClient` do `@tanstack/react-query`; `contactCrm360Key` já é exportada em `useContactCrm360.ts:173`) — dentro do painel, e não na aba, para valer também para o sidebar enquanto ele ainda existir.
Aceite: inserir uma compra pela SalesView em ambiente de teste e `SELECT created_by FROM contact_purchases ORDER BY created_at DESC LIMIT 1` ≠ NULL (via `db_query` no banco oficial `tnnnlkbymytvtqngbbqh`, registro de teste apagado em seguida pelo mesmo turno — é dado de teste, não DDL). Teste novo `src/components/inbox/__tests__/ContactPurchasesPanel.test.tsx`: com `supabase.from('contact_purchases').insert` mockado sem erro, `invalidateQueries` é chamado com `contactCrm360Key('c1')`; com erro no insert, não é chamado. Em produção: criar uma compra pela SalesView e ver "Compras (n)" e o badge subirem sem recarregar a página.

**S16 · Badge da SalesView passa a contar compras + propostas em aberto**
Hoje: `RealtimeInboxView.tsx:134` `orders: crm360.purchases.length` — propostas em aberto não contam no badge, mas aparecem na aba.
Fazer: `orders: (crm360.purchases.length ?? 0) + (crm360.openDeals.length ?? 0)`. Comentário na linha explica a soma.
Aceite: teste novo em `inbox/__tests__/ConversationTabs.test.tsx` não cabe (o cálculo é no `RealtimeInboxView`); aceite por leitura + print de um contato com 1 proposta e 0 compras mostrando badge 1. (Se o Joaquim não quiser a soma, esta etapa é a única a reverter — D4.)

**S17 · Ícone da SalesView**
Hoje: `ShoppingBag` (sacola) — remete a "pedido".
Fazer: `CircleDollarSign` (o mesmo que o catálogo do sidebar já usava para `commercial-summary` em `contactDetailSections.ts:20`). `ConversationTabs.tsx:3` troca o import; `SalesViewTab` usa o mesmo ícone no empty state.
Aceite: sem teste (ícone); print no S42.

**S18 · Teste unitário de `SalesViewTab`**
Hoje: `OrdersTab` nunca teve teste.
Fazer: `src/components/inbox/tabs/__tests__/SalesViewTab.test.tsx` mockando `useContactCrm360` (padrão de `Crm360Tab.test.tsx`): (a) com `resumo` zerado mostra os 4 tiles, o botão "+ Novo" e os empty states internos de compras e propostas (nunca um empty state de aba); (b) com 2 compras e 1 deal mostra "Compras (2)", seção "Propostas em aberto" e **não** mostra o empty state; (c) `profileId` chega ao `ContactPurchasesPanel` (mock do painel que ecoa a prop, como `NotesTab` faz no teste de `inbox/__tests__/ConversationTabs.test.tsx:25-33`); (d) nunca renderiza o texto "Pedidos".
Aceite: 4 casos verdes; cobertura não cai (o piso do `test:coverage` é só `src/lib` + `src/services`, mas o arquivo novo entra no relatório).

**S19 · Atualizar `INBOX_360_STATUS.md` (CP3)**
Hoje: `docs/design/INBOX_360_STATUS.md:6` descreve "aba Pedidos ok=sim (`orders-tab` renderiza; empty state 'Nenhum pedido registrado'…)".
Fazer: nota datada de 02/10 no topo do CP3: a aba virou SalesView, o empty state mudou de texto, o `data-testid` `orders-tab` ficou; link para este plano.
Aceite: doc commitado no mesmo PR.

**S20 · Fechamento da Fase 2**
Fazer: gates, PR, merge, deploy, print `02-salesview-vazio.png` e `03-salesview-cheio.png` (contato "[E2E] Contato de teste" serve para o vazio; para o cheio, usar um contato com compra real ou o registro criado e apagado no S15).
Aceite: PR mergeada, deploy `READY`, prints na sessão.

### Fase 3 — Journey absorve as Estatísticas (PR 3)

**S21 · Branch da Fase 3**
Fazer: `claude/feat-salesview-journey-f3-<AAMMDD-HHMM>` de `origin/main` (Fases 1 **e 2** mergeadas — a Fase 3 edita `ConversationTabContent.tsx`, `ConversationTabs.tsx` e `ContactAccordionSections.tsx`, os mesmos arquivos da Fase 2).
Aceite: idem S11.

**S22 · Rename `HistoryTab.tsx` → `JourneyTab.tsx` (só o rename)**
Hoje: `tabs/HistoryTab.tsx` exporta `HistoryTab`; teste `tabs/__tests__/HistoryTab.test.tsx`.
Fazer: `git mv` dos dois; export `JourneyTab`; `ConversationTabContent.tsx:20-21` importa `../tabs/JourneyTab` / `m.JourneyTab`; `describe('JourneyTab')`.
Aceite: typecheck + o teste renomeado verde, sem mudança de conteúdo.

**S23 · Mover `ContactStatsSection` para `tabs/` (só o move)**
Hoje: `contact-details/ContactStatsSection.tsx`, importado só por `ContactAccordionSections.tsx:11`.
Fazer: `git mv` para `tabs/ContactStatsStrip.tsx`; export `ContactStatsStrip`; `ContactAccordionSections.tsx:11` importa do caminho novo temporariamente (sai na Fase 4).
Aceite: typecheck verde; sidebar inalterado na tela.

**S24 · Estatísticas no topo da Journey**
Hoje: `JourneyTab` renderiza cabeçalho → filtros → `KpiStrip` por período → timeline.
Fazer: entre o cabeçalho e os filtros, `<SectionCard icon={BarChart3} title="Estatísticas do contato" subtitle="Desde o início do relacionamento" tone="blue"><ContactStatsStrip contactId={contactId} /></SectionCard>`. Os filtros, o `KpiStrip` por período e a timeline ficam **abaixo**, sem mudança. Mesma regra de grade do S14: a strip mantém `grid-cols-2` e aceita `className`; a Journey passa `className="xl:grid-cols-4"`, o sidebar (até a Fase 4) não passa nada. `data-testid="contact-stats-strip"`.
Aceite: as duas faixas coexistem: a de cima não reage ao `Select` de período (é do contato inteiro), a de baixo reage — provado no S29.

**S25 · Remover variação e sparkline inventados (achado 1)**
Hoje: `ContactStatsStrip.tsx:52-90` `change: 12 / -8 / 0 / 5` e `sparkData` fixo; `:97-99` `MiniSparkline` com `opacity-40`; `:108-116` renderiza `TrendingUp/Down` + `%`.
Fazer: apagar `MiniSparkline`, `sparkData`, `change` e o bloco de `%`; imports `TrendingUp`, `TrendingDown`, `BarChart3` (não usado) saem. Tile fica: ícone + rótulo em cima, valor embaixo, `subtitle` quando houver. Nada de número que o hook não devolve.
Aceite: grep `change:\|sparkData\|MiniSparkline` no arquivo vazio; teste do S30 afirma que o texto `%` não aparece.

**S26 · Rótulos honestos nas estatísticas (achado 2)**
Hoje: "Conversas" = dias distintos com mensagem; "Tempo médio" = média do intervalo contato→agente nas 200 primeiras mensagens; "Mensagens" = `count` total.
Fazer: manter os 4 rótulos que o Joaquim conhece, mas acrescentar `subtitle` curto por tile: Mensagens → "Total trocado"; Tempo médio → "Resposta ao cliente"; Conversas → "Dias com mensagens"; CSAT → já tem (`N avaliações`) ou "Sem avaliações" quando `csatCount` = 0 (hoje o `subtitle` some e o tile fica só com "—").
Aceite: os 4 subtítulos renderizados; teste no S30.

**S27 · `KpiStrip` por período ganha rótulo de contexto**
Hoje: as duas faixas (contato inteiro e período) mostram "Tempo médio" e "Tempo médio de resposta" lado a lado sem dizer o recorte.
Fazer: o `SectionCard` do S24 já diz "Desde o início do relacionamento"; o `KpiStrip` existente ganha um `<p className="text-xs text-muted-foreground">` imediatamente acima: "No período selecionado" (texto fixo; o `Select` já mostra qual). Sem mudar `KpiStrip.tsx`.
Aceite: os dois textos no DOM; print no S42 mostra as duas faixas distinguíveis.

**S28 · Ícone e empty state da Journey**
Hoje: ícone `History` na barra e `Clock` no cabeçalho da aba; empty state "Nenhum evento neste período."
Fazer: barra passa a `Route` (lucide `^0.577.0`, já usado em `ChannelRoutingRules.tsx:12` e `SuggestionList.tsx:2`); cabeçalho da aba usa o mesmo. Empty state fica — já é honesto.
Aceite: ícone trocado nos dois lugares; sem teste.

**S29 · Testes do `JourneyTab` (estatísticas + período)**
Hoje: `JourneyTab.test.tsx` mocka só `useConversationHistoryTimeline`.
Fazer: mock de `useContactStats` (mesmo padrão `vi.mock` + `mockReturnValue`); casos novos: (a) estatísticas do contato aparecem em `contact-stats-strip` com os 4 valores mockados; (b) trocar período **não** chama `useContactStats` de novo com argumento diferente (continua `('c1')`) e chama `useConversationHistoryTimeline` com `7`; (c) com `isLoading` das estatísticas, a timeline ainda renderiza (as duas cargas são independentes).
Aceite: 8 casos verdes (5 antigos + 3 novos).

**S30 · Teste unitário de `ContactStatsStrip`**
Hoje: sem teste.
Fazer: `tabs/__tests__/ContactStatsStrip.test.tsx`: (a) valores do hook nos 4 tiles; (b) `avgResponseTimeMinutes: 90` → "1h30m"; (c) `csatAverage: null` → "—" + "Sem avaliações"; (d) `queryByText(/%/)` ausente (trava o achado 1); (e) skeleton com 4 blocos em `isLoading`.
Aceite: 5 casos verdes.

**S31 · Fechamento da Fase 3**
Fazer: gates, PR, merge, deploy, prints `04-journey.png`.
Aceite: PR mergeada, deploy `READY`.

### Fase 4 — Sidebar sem Resumo Comercial, Estatísticas e Compras & Propostas (PR 4)

**S32 · Branch da Fase 4 — pré-condição: Fases 2 e 3 mergeadas e no ar**
Fazer: confirmar em produção (print ou DOM via Playwright MCP) que `commercial-summary-strip` e `contact-stats-strip` existem nas abas antes de apagar qualquer coisa do sidebar. Branch `claude/feat-salesview-journey-f4-<AAMMDD-HHMM>`.
Aceite: as duas confirmações registradas no corpo do PR.

**S33 · Remover o card "Resumo Comercial" do accordion**
Hoje: `ContactAccordionSections.tsx:83-85` (`Section index={3} value="commercial-summary"`), import na linha 17.
Fazer: apagar o `<Section>` e o import. `AIInsightsWidget` e "Última atividade" (`index={6}`) e "Mais detalhes" (`custom={7}`) **mantêm** os índices — o delay de animação é `0.08 * index`, pular o 3 só encurta a cascata em 80 ms; reindexar tudo seria churn.
Aceite: typecheck verde; o card some do sidebar.

**S34 · Remover "Compras & Propostas" de Mais detalhes**
Hoje: `ContactAccordionSections.tsx:122-124` (`MoreDetailsBlock` com `ContactPurchasesPanel`), import `ContactPurchasesPanel` na linha 22, `ShoppingBag` no import de ícones (linha 6).
Fazer: apagar o bloco e os dois imports (conferir que `ShoppingBag` não é usado em outro ponto do arquivo — hoje só ali).
Aceite: grep `ContactPurchasesPanel\|ShoppingBag` em `ContactAccordionSections.tsx` vazio.

**S35 · Remover "Estatísticas" de Mais detalhes**
Hoje: `ContactAccordionSections.tsx:128-130`, import na linha 11, `BarChart3` no import de ícones (usado também no Resumo Comercial, que já saiu no S33 — depois do S33 sobra só este uso).
Fazer: apagar o bloco e os dois imports.
Aceite: grep `ContactStatsStrip\|BarChart3` em `ContactAccordionSections.tsx` vazio; `bunx vitest run src/components/inbox/contact-details` verde.

**S36 · Catálogo de seções e defaults**
Hoje: `contactDetailSections.ts:20` (`commercial-summary`), `:24` (`purchases`), `:28` (`stats`); `DEFAULT_OPEN_SECTIONS:34` inclui `commercial-summary`; ícones `CircleDollarSign`, `ShoppingBag`, `BarChart3` importados na linha 2.
Fazer: apagar as 3 entradas e os 3 ícones do import; `DEFAULT_OPEN_SECTIONS = ['info', 'whatsapp-status', 'tags']`. **Não** mexer em `getStoredAccordionState` — ela já descarta valores que saíram do catálogo (linhas 44-46), então quem tinha `commercial-summary` aberto no localStorage cai no filtro sem erro.
Aceite: teste novo `contact-details/__tests__/contactDetailSections.test.ts`: (a) `getStoredAccordionState()` com `['info','commercial-summary','stats']` no localStorage devolve `['info']`; (b) com só valores removidos devolve `DEFAULT_OPEN_SECTIONS`; (c) o catálogo não contém `commercial-summary`, `purchases` nem `stats`.

**S37 · Fim dos imports temporários**
Hoje: após S33/S35, `ContactAccordionSections.tsx` não importa mais nada de `tabs/`.
Fazer: `grep -rn "from '../tabs/\|from '@/components/inbox/tabs/" src/components/inbox/contact-details/` deve voltar vazio — o painel direito não depende do painel central. Se sobrar algo, é bug desta fase.
Aceite: grep vazio; `node scripts/ci/lint-ratchet.mjs` sem "novas".

**S38 · Botão "Recolher tudo" e estado vazio do accordion**
Hoje: `ContactDetails.tsx:128` `onCollapseAll` zera o accordion; com 3 seções a menos a lista raiz fica: Informações, Status WhatsApp, Tags, Insights IA, Última atividade, Mais detalhes.
Fazer: nada de código — só conferir que o painel não fica com buraco visual (o `AIInsightsWidget` renderiza fora de `Section`; conferir que não dependia da altura do card removido). Print.
Aceite: print do sidebar recolhido e expandido sem espaço morto; se houver, ajuste de `mb-3` no lugar certo (uma linha) no mesmo commit.

**S39 · Documentar no `PAINEL_STATUS.md`**
Hoje: `docs/design/PAINEL_STATUS.md:36, 88` descrevem a ordem do accordion com Resumo Comercial e Mais detalhes com Compras & Propostas e Estatísticas.
Fazer: nota datada no cabeçalho (já há uma de 24/09 no mesmo formato): "02/10 — Resumo Comercial, Compras & Propostas e Estatísticas saíram do painel; vivem nas abas SalesView e Journey do painel central (plano: link)". Não reescrever o histórico.
Aceite: doc no mesmo PR.

**S40 · Fechamento da Fase 4**
Fazer: gates, PR, merge, deploy, print `05-sidebar.png`.
Aceite: PR mergeada, deploy `READY`; em produção, `queryByText('Resumo Comercial')` e `('Estatísticas')` no DOM do sidebar ausentes (Playwright MCP ou snapshot).

### Fase 5 — Fechamento (PR 5)

**S41 · Verificação de comportamento em produção**
Fazer: com usuário real, abrir uma conversa: (1) barra mostra SalesView/Journey; (2) SalesView: 4 tiles + compras + propostas; (3) "+ Novo" grava `created_by` (consulta `db_query` no registro criado, depois `DELETE` do registro de teste); (4) Journey: estatísticas gerais + período; trocar período muda só a faixa de baixo; (5) sidebar sem os 3 blocos; (6) recarregar a página com `zapp:inbox:conversation-tab=orders` no localStorage abre a SalesView; (7) 0 erros de console em todo o fluxo.
Aceite: os 7 itens com evidência (print ou query) no corpo do PR 5.

**S42 · Prints antes/depois no repo**
Fazer: `docs/design/salesview-journey/` com `00-antes-barra.png`, `00-antes-sidebar.png` (os prints do Joaquim desta sessão servem de "antes"), `01-barra.png`, `02-salesview-vazio.png`, `03-salesview-cheio.png`, `04-journey.png`, `05-sidebar.png`. Resolução 1280 px de largura, tema escuro (o que o Joaquim usa) **e** um par claro (`01-barra-claro.png`, `04-journey-claro.png`) — lição de 25/09 (`bg-black` fixo quebrou o light mode).
Aceite: 9 arquivos, cada um < 400 KB.

**S43 · Contraste no tema claro e alto-contraste**
Fazer: nos blocos novos (S14, S24, S26, S27) só há tokens (`text-muted-foreground`, `bg-muted/40`, `tone="blue"` do `SectionCard`); confirmar visualmente no tema claro e no alto-contraste (`e2e/theme-alto-contraste.spec.ts` é o precedente de como alternar) que nada ficou invisível.
Aceite: 2 prints extras em `docs/design/salesview-journey/`; se algum token falhar, correção de 1 linha em PR próprio (não neste).

**S44 · `graphify update .`**
Fazer: no container `claude-code` (ou localmente onde o graphify estiver instalado), `graphify update . --force`; conferir `grep "Built from commit" graphify-out/GRAPH_REPORT.md` = HEAD da `main`. `graphify-out/` não é versionado — a etapa só garante que o grafo da VPS reflita os renames (`OrdersTab`→`SalesViewTab`, `HistoryTab`→`JourneyTab`, dois widgets de pasta nova).
Aceite: `graphify explain "SalesViewTab"` devolve o nó com as arestas para `CommercialSummaryStrip`, `ContactPurchasesPanel`, `OpenDealsList`.

**S45 · Varredura final de vocabulário**
Fazer: `grep -rn "Pedidos\|aba Histórico\|Resumo Comercial" src/components/inbox src/hooks/inbox src/hooks/chat` — o que sobrar precisa ser (a) rótulos de **pedido como métrica do CRM externo**, que não têm nada a ver com a aba: `CrmBadges.tsx:56` ("Pedidos: {total_pedidos}") e `Contact360Helpers.tsx:145` (tile "Pedidos" com `customer.total_pedidos`) — ficam como estão; `crm360TabsData.ts:181` é o mesmo caso, mas fora das pastas varridas; (b) comentários históricos que citem PR antiga, ou (c) bug. Em 02/10 a varredura devolve, além de (a), só o que as Fases 1–4 já apagam (`ConversationTabs.tsx:25`, `ConversationTabContent.tsx:99`, `OrdersTab.tsx:12,22`, `OpenDealsList.tsx:10,16`, `contactDetailSections.ts:20`, `ContactAccordionSections.tsx:83`, `RealtimeInboxView.tsx:132`). Listar o que sobrou no PR 5.
Aceite: lista explícita no corpo do PR; zero ocorrência da categoria (c).

**S46 · `CLAUDE.md` — uma linha no bloco de lições de UI**
Fazer: abaixo da "Lição de UI (2026-09-25)", um parágrafo curto: "SalesView/Journey (2026-10-02): os ids internos `orders`/`history` ficaram; só rótulo, conteúdo e pasta mudaram. Quem for renomear id precisa de `TAB_REDIRECTS` em `useInboxUIState.ts` (precedente `reminders → tasks`). Estatísticas do contato não têm série histórica — não reintroduzir % de variação sem query real." Link para este plano.
Aceite: parágrafo no mesmo PR.

**S47 · Placar deste plano**
Fazer: seção 7 deste arquivo preenchida com `[x]`/`[ ]` por etapa, SHA do merge de cada fase e data.
Aceite: 50 linhas marcadas; as não executadas com motivo (nunca "ficou para depois" sem dizer por quê).

**S48 · Remover `docs/design/inbox-03-orders.png` se existir**
Hoje: `INBOX_360_STATUS.md:6` cita `/workspace/qa/out/inbox-03-orders.png` (fora do repo); em 02/10 `ls docs/design | grep -i orders` está vazio — a etapa é só a conferência final, depois dos prints novos entrarem.
Fazer: se houver print com o rótulo "Pedidos" versionado, substituir pelo `02-salesview-*.png` ou apagar, para a documentação não mostrar uma aba que não existe mais.
Aceite: `git ls-files docs/design | grep -i orders` vazio ou justificado.

**S49 · Fechamento da Fase 5**
Fazer: gates (docs não quebram CI, mas o `check-test-inventory` e o `medir-tipografia` rodam sempre), PR, merge, apagar branch.
Aceite: PR mergeada.

**S50 · Reporte ao Joaquim**
Fazer: mensagem única com: links das 5 PRs e estado; os 7 itens do S41 com evidência; o que **não** foi feito (D3/D4 se recusadas); e o bloco "Próximos passos" com 3 itens derivados do que foi visto (candidatos já vistos nesta sessão: série histórica real para as estatísticas via RPC; `ContactPurchasesPanel` ler compras do `useContactCrm360` em vez de fazer uma segunda query em `contact_purchases` (hoje a mesma tabela é lida duas vezes por aba); "Conversas" contar `conversations` de verdade em vez de dias).
Aceite: mensagem enviada; sessão encerrada sem PR aberta.

---

## 5. Cobertura do pedido

| Pedido do Joaquim | Etapas |
|---|---|
| "Pedidos" vira "SalesView" | S02, S04, S06, S07, S08, S09, S17 |
| Resumo Comercial junto, no topo da aba | S13, S14 |
| Função de pedidos continua integrada | S14 (lista de compras e propostas abaixo da strip), S15, S16, S18 |
| Sidebar sem Resumo Comercial | S33, S36 |
| "Estatísticas" sai do sidebar | S35, S36 |
| Estatísticas integradas ao Histórico com nome "Journey" | S03, S22–S29 |
| Nada redundante | S34 (Compras & Propostas duplicado), S37 |
| Verificado de verdade, não só mergeado | S10, S20, S31, S40, S41 |

---

## 6. Decisões tomadas por mim (tech lead) — e o que precisa do Joaquim

| # | Decisão | Por quê | Precisa do Joaquim? |
|---|---|---|---|
| D1 | Ids `orders`/`history` ficam; só rótulo e arquivo mudam | zero risco de quebrar aba persistida em localStorage, testes de ordem e atalhos; renomear id não muda nada para o usuário | Não |
| D2 | Os "↗12%", "−8%", "5%" e sparklines saem (S25) | são constantes no código, não dado; na Journey ficariam mais visíveis que hoje | Não — mas é bom saber que o "12%" do print nunca foi real |
| D3 | Ícones: SalesView = `CircleDollarSign`, Journey = `Route` | "sacola" e "relógio" remetem a pedido e histórico, os nomes que saem | **Opcional**: se quiser manter os ícones atuais, S17 e S28 são puladas |
| D4 | Badge da SalesView soma compras + propostas em aberto (S16) | hoje só compras contam, mas a aba mostra as duas coisas | **Opcional**: se quiser badge só de compras, S16 é pulada |
| D5 | Rename de arquivo em commit separado do diff de conteúdo | o guard `db-guard` reprova "edição de migration existente" por similaridade — não se aplica aqui, mas o mesmo princípio deixa a revisão legível | Não |
| D6 | 5 PRs seriais, não 1 nem paralelas | cada fase é deployável sozinha; 2 e 3 tocam os mesmos três arquivos; a Fase 4 (remoção) só pode ir ao ar com 2 e 3 já no ar | Não |

Decisão de negócio que **não** cabe neste plano e vai para "Próximos passos" do S50: estatísticas com série real (precisa de RPC nova ou view materializada = DDL).

---

## 7. Placar

| Etapa | Estado | Evidência |
|---|---|---|
| S01–S10 (Fase 1) | [ ] | — |
| S11–S20 (Fase 2) | [ ] | — |
| S21–S31 (Fase 3) | [ ] | — |
| S32–S40 (Fase 4) | [ ] | — |
| S41–S50 (Fase 5) | [ ] | — |

*Atualizar esta tabela a cada merge (S47).*
