# PLANO — FUSÃO DO MÓDULO "QUADRO" NO MÓDULO "TAREFAS" — 50 ETAPAS

> **Data:** 2026-10-07 · **Escopo:** front-end · **Sem DDL, sem Edge Function, sem migration, sem dependência nova.**
> **Objetivo:** existir um único módulo de tarefas no produto. O item "Quadro" do menu e tudo que existe só por causa dele
> são removidos; a visão Quadro continua dentro de Tarefas como um dos três modos (Lista / Quadro / Agenda).
>
> Este documento é **plano**. Nenhuma linha de código foi alterada ao escrevê-lo.

---

## 1. O que a análise do código mostrou (verificado em `dia/2026-10-07`, commit `2dd7632be`)

**Não existe um módulo "Quadro" separado.** O item `pipeline` do menu é uma segunda porta de entrada para o mesmo `TasksModule`,
com `{ defaultMode: 'board', forceMode: true }` (`src/pages/viewRouteProps.ts`). O pipeline de vendas antigo (`SalesPipelineView`) já foi removido
e não há tabela, RPC nem Edge Function chamada "quadro": os dados são `conversation_tasks`, os mesmos nas duas entradas.

### 1.1 O que os dois itens NÃO têm em comum (a lista completa)

| Item | `pipeline` ("Quadro") | `tasks` ("Tarefas") |
|---|---|---|
| Rótulo / ícone / atalho | Quadro / Kanban / Alt+P (`navigation.service.ts:57`, `useNavShortcuts.ts:11`) | Tarefas / ListChecks / Alt+K (linha 58) |
| Modo inicial | `board` forçado, ignora `tasks-mode` (`TasksModule.tsx:28-52`) | último modo salvo ou Lista |
| Layout | `layout:'full'`: sem padding nem scroller do `ViewContainer` | com padding e scroller (`--layout-gutter`) |
| ErrorBoundary | `viewId="pipeline"` (`ViewRouter.tsx:104-108`) | padrão |
| Rótulo mobile | "Pipeline" (`MobileHeader.tsx:29`) | genérico (cai no fallback) |
| Badge da sidebar | não | sim (`Sidebar.tsx:136-138`) |

Tudo o mais (dados, componentes, filtros, KPIs, atalhos de Tarefas, arrastar, limites de WIP) é **idêntico** porque é o mesmo componente.
Por isso "integrar a Tarefas o que o Quadro tem de diferente" se resume a duas coisas: a **largura total** do Quadro (E05/E15/E16)
e a **entrada direta no modo Quadro** para links antigos (E03/E07).

### 1.2 Quem ainda aponta para `pipeline` (e quebraria sem tratamento)

- `Crm360Tab.tsx:139, 186, 264` — `navigateToView('pipeline')` ("Ver funil →", "Criar negociação", "Ver pipeline →"). Hoje abrem o Quadro de tarefas, não o funil de vendas.
- `useNavShortcuts.ts:11` (Alt+P), `defaultShortcuts.ts:7` (`TASKS_VIEWS`), `MobileHeader.tsx:29`, `useGmailOAuth.ts:12-15` (`VALID_VIEWS`), `EmptyState.tsx:70-76` (preset órfão), `CommandPalette.tsx:97` (texto).
- O mecanismo de redirect `LEGACY_VIEW_REDIRECTS` (`useNavigationHistory.ts:95-102`) só resolve a **carga da URL**; a navegação programática não passa por ele — por isso o `Crm360Tab` e o atalho precisam ser corrigidos na origem.

### 1.3 O que NÃO se toca (outras coisas que se chamam "pipeline")

`sales_deals`, `sales_pipeline_stages`, `deal_activities`, `useContactCrm360`, `OpenDealsList`, `CRM_PIPELINE_TABS` (`crm360TabsData.ts:233`), `ContactViewSwitcher` ("Pipeline" = kanban de contatos), `externalDB.ts:461`.

### 1.4 O que NÃO precisa de migração

`localStorage`: só `tasks-mode` importa (e não tem nome com `pipeline`). `sidebar-favorites`, `zapp-recent-modules` e `mobile-drawer-recents` filtram ids mortos sozinhos.
Não há `view=pipeline` em notificações nem em `supabase/functions`. Não há atalho Alt+P salvo por usuário.

---

## 2. Decisões (já tomadas — o dono pode revertê-las antes da execução)

- **E01 — Fusão = remover a porta de entrada `pipeline`.** O módulo já é o mesmo (`TasksModule`); o item "Quadro" do menu é só uma segunda entrada com modo forçado. Fusão significa remover essa entrada, redirecionar o que apontava para ela e limpar referências.
- **E02 — A visão Quadro continua sendo um MODO de Tarefas.** Lista / Quadro / Agenda (`ModeSwitcher`) permanecem. Nada de `TasksBoardMode`, `BoardColumn`, `MoveToMenu`, `resolveDragEnd`, WIP e arrastar é removido.
- **E03 — Links antigos abrem Tarefas no Quadro, uma vez.** `?view=pipeline` e `#pipeline` redirecionam para `tasks` e gravam `tasks-mode='board'` só nessa entrada legada; quem entra por `tasks` mantém o último modo.
- **E04 — Alt+P deixa de existir.** Tarefas continua em Alt+K; as teclas 1/2/3 trocam o modo. Alt+P é fixo no código (não está em `DEFAULT_SHORTCUTS`), então não há atalho salvo por usuário para migrar.
- **E05 — Layout: `tasks` passa a `layout:'full'`.** Lista e Agenda recebem o gutter internamente (aparência idêntica à de hoje); o Quadro usa a largura total, como o item "Quadro" já fazia.
- **E06 — CRM360 e pipeline de vendas.** Os três botões do CRM360 que chamam `navigateToView('pipeline')` passam a Tarefas, com rótulos corrigidos. O pipeline de vendas (`sales_deals`, `sales_pipeline_stages`), `ContactViewSwitcher` e `CRM_PIPELINE_TABS` NÃO são tocados. Sem banco, sem Edge Function, sem migration.

---

# PLANO EM 50 ETAPAS

Legenda do dono: **hugo** (hooks), **iris** (telas), **designer**, **workertestes**, **vera** (CI/docs), **complexo** (Devin). "Claude" = portões de verificação; "Dono" = Joaquim.

## Fase 0 — Decisões fechadas (E01–E06, sem cartão)

_Já decididas neste documento; o dono pode revertê-las antes da execução._

- **E01** [decisão] **Fusão = remover a porta de entrada `pipeline`.** O módulo já é o mesmo (`TasksModule`); o item "Quadro" do menu é só uma segunda entrada com modo forçado. Fusão significa remover essa entrada, redirecionar o que apontava para ela e limpar referências.
- **E02** [decisão] **A visão Quadro continua sendo um MODO de Tarefas.** Lista / Quadro / Agenda (`ModeSwitcher`) permanecem. Nada de `TasksBoardMode`, `BoardColumn`, `MoveToMenu`, `resolveDragEnd`, WIP e arrastar é removido.
- **E03** [decisão] **Links antigos abrem Tarefas no Quadro, uma vez.** `?view=pipeline` e `#pipeline` redirecionam para `tasks` e gravam `tasks-mode='board'` só nessa entrada legada; quem entra por `tasks` mantém o último modo.
- **E04** [decisão] **Alt+P deixa de existir.** Tarefas continua em Alt+K; as teclas 1/2/3 trocam o modo. Alt+P é fixo no código (não está em `DEFAULT_SHORTCUTS`), então não há atalho salvo por usuário para migrar.
- **E05** [decisão] **Layout: `tasks` passa a `layout:'full'`.** Lista e Agenda recebem o gutter internamente (aparência idêntica à de hoje); o Quadro usa a largura total, como o item "Quadro" já fazia.
- **E06** [decisão] **CRM360 e pipeline de vendas.** Os três botões do CRM360 que chamam `navigateToView('pipeline')` passam a Tarefas, com rótulos corrigidos. O pipeline de vendas (`sales_deals`, `sales_pipeline_stages`), `ContactViewSwitcher` e `CRM_PIPELINE_TABS` NÃO são tocados. Sem banco, sem Edge Function, sem migration.

## Fase 1 — Cada porta de entrada passa a apontar para Tarefas (E07–E13)

_Um cartão por conjunto de arquivos, com código e testes juntos; cada um fica verde sozinho na base atual._

- **E07** [hugo] **Redirecionar `pipeline` legado para Tarefas no Quadro.** Em `LEGACY_VIEW_REDIRECTS` (hoje só `{tags:'contacts'}`) mapear `pipeline → tasks`. Quando a entrada legada acontecer (`?view=pipeline` ou `#pipeline`), gravar `tasks-mode='board'` uma única vez; entrar por `tasks` não pode sobrescrever a preferência salva. Teste cobrindo os dois formatos de URL e a não sobrescrita.
  *Arquivos:* src/hooks/system/useNavigationHistory.ts; src/hooks/system/__tests__/useNavigationHistory.legacyRedirect.test.tsx.
  *Aceite:* `?view=pipeline` e `#pipeline` abrem `tasks` em modo Quadro; `?view=tasks` retoma o modo salvo; testes novos passam.
- **E08** [hugo] **Remover o atalho Alt+P e criar a cobertura que falta.** Retirar `KeyP: 'pipeline'` de `useNavShortcuts.ts:11`. Hoje não há teste desse hook: criar `useNavShortcuts.test.tsx` provando que Alt+K navega para `tasks` e que Alt+P não navega para lugar nenhum.
  *Arquivos:* src/hooks/ui/useNavShortcuts.ts; src/hooks/ui/__tests__/useNavShortcuts.test.tsx (novo).
  *Aceite:* Alt+P inerte, Alt+K → tasks, teste novo vermelho antes (Alt+P navegava) e verde depois.
- **E09** [hugo] **Atalhos de Tarefas valem só na view `tasks`.** Em `defaultShortcuts.ts:7` trocar `TASKS_VIEWS = ['tasks','pipeline']` por `['tasks']`, ajustar o comentário de `useCustomShortcuts.ts:31` e reescrever em `useGlobalKeyboardShortcuts.test.tsx` os casos das linhas 62-65 e 94-97 (hoje afirmam que valem também em `?view=pipeline`).
  *Arquivos:* src/hooks/shortcuts/defaultShortcuts.ts; src/hooks/ui/useCustomShortcuts.ts; src/hooks/__tests__/useGlobalKeyboardShortcuts.test.tsx.
  *Aceite:* Os 7 atalhos de Tarefas valem em `tasks` e não valem em `pipeline`; testes reescritos passam.
- **E10** [hugo] **Tirar `pipeline` da lista de views válidas do OAuth do Gmail.** `VALID_VIEWS` em `useGmailOAuth.ts:12-15` inclui `'pipeline'`; fora da lista a view cai em `'integrations'`. Remover `pipeline` e provar com teste que um retorno de OAuth com `view=pipeline` cai em `integrations`.
  *Arquivos:* src/hooks/integrations/useGmailOAuth.ts; src/hooks/integrations/__tests__/ (teste do hook).
  *Aceite:* Lista sem `pipeline`; teste do fallback verde.
- **E11** [iris] **Rótulos do cabeçalho mobile.** Em `MobileHeader.tsx:29` remover `viewLabels.pipeline: 'Pipeline'` e garantir que `tasks` mostre "Tarefas" (hoje cai no fallback que capitaliza o id e gera "Tasks" — confirmar no código antes). Teste do rótulo.
  *Arquivos:* src/components/mobile/MobileHeader.tsx; src/components/mobile/__tests__/ (teste do cabeçalho).
  *Aceite:* Cabeçalho mobile mostra "Tarefas" em `tasks`; sem entrada `pipeline`.
- **E12** [iris] **Preset órfão e texto da paleta de comandos.** Remover o preset `pipeline` ("Pipeline vazio / Criar Deal") de `EmptyState.tsx:70-76` — grep confirma que nenhum `variant="pipeline"` o usa — e trocar o placeholder `CommandPalette.tsx:97` ("ex: pipeline, chatbot") por "ex: tarefas, chatbot".
  *Arquivos:* src/components/ui/EmptyState.tsx; src/components/CommandPalette.tsx; testes desses dois componentes.
  *Aceite:* Sem preset `pipeline`; placeholder novo; testes existentes verdes.
- **E13** [iris] **Botões do CRM360 passam a abrir Tarefas.** `Crm360Tab.tsx` linhas 139, 186 e 264 chamam `navigateToView('pipeline')` ("Ver funil →", "Criar negociação", "Ver pipeline →"). Hoje abrem o Quadro de tarefas, não o funil de vendas. Apontar para `tasks` e corrigir os rótulos para o que de fato abre; ler o que "Criar negociação" faz antes de renomear. NÃO tocar `sales_*`, `OpenDealsList`, `useContactCrm360`. Atualizar `Crm360Tab.test.tsx:140-143`.
  *Arquivos:* src/components/inbox/tabs/Crm360Tab.tsx; src/components/inbox/tabs/__tests__/Crm360Tab.test.tsx.
  *Aceite:* Os três botões levam a `tasks` com rótulos coerentes; teste atualizado.

## Fase 2 — O interruptor atômico (E14)

_Remove o item de menu, a rota e o contrato B7 numa entrega só, porque o código e os testes dele são acoplados._

- **E14** [complexo] **Remover o item de menu `pipeline`, a rota e o contrato B7 (cartão atômico).** Num único commit: (a) `navigation.service.ts:57` apagar o item `pipeline` e dar `layout:'full'` ao item `tasks` (linha 58); (b) `ViewRouter.tsx:104-108` apagar `SPECIAL_VIEWS.pipeline` e o import de `TASKS_ROUTE_PROPS` (linha 15); (c) apagar `viewRouteProps.ts`; (d) `TasksModule.tsx:22-34` remover as props `defaultMode`/`forceMode` e a lógica que as lê, mantendo `tasks-mode` salvo; (e) comentário de `ViewContainer.tsx:6`; (f) testes acoplados: `navigation.service.test.ts` (linha 33 `fullLayoutIds`, 38 `PRIMARY_IDS`, 40 "11 agreed items" → 10), `TasksModule.test.tsx` (204-235 e 619-633: contrato B7 e deep link `?view=pipeline&task=`, reescrever para `?view=tasks&task=`). Confirmar que menu lateral, drawer mobile e paleta (derivam de `NavigationService`) não mostram mais "Quadro" como item.
  *Arquivos:* src/services/navigation.service.ts; src/services/__tests__/navigation.service.test.ts; src/pages/ViewRouter.tsx; src/pages/viewRouteProps.ts (apagar); src/components/tasks/TasksModule.tsx; src/components/tasks/__tests__/TasksModule.test.tsx; src/components/layout/ViewContainer.tsx.
  *Aceite:* Nenhuma ocorrência de `pipeline` como id de view fora de Crm360/legado; menu com 10 itens primários; Tarefas abre no último modo; testes verdes.

## Fase 3 — Layout e visual (E15–E16)

_A única diferença visual real entre os dois itens é o `layout:'full'`._

- **E15** [iris] **Gutter interno em Lista e Agenda.** Com `tasks` em `layout:'full'` o `ViewContainer` deixa de aplicar `overflow-y-auto p-[var(--layout-gutter)]`. Dar às raízes de Lista e Agenda o mesmo espaçamento e scroll, para a aparência delas não mudar. Teste de renderização das classes.
  *Arquivos:* src/components/tasks/list/TasksListMode.tsx; src/components/tasks/agenda/TasksAgendaMode.tsx; testes desses dois.
  *Aceite:* Lista e Agenda com o mesmo padding/scroll de hoje; teste das classes verde.
- **E16** [designer] **Quadro em largura total: colunas, foco e contraste.** Garantir que em 1440 as 5 colunas cabem sem rolagem horizontal, que ≤1024 vira carrossel (já existe, `pointerMedia.ts`), e que foco visível e contraste do `WorkItemCard` e das colunas passam no padrão do design system. Mexer só em `TasksBoardMode.tsx`, `BoardColumn.tsx` e `WorkItemCard.tsx`.
  *Arquivos:* src/components/tasks/board/TasksBoardMode.tsx; src/components/tasks/board/BoardColumn.tsx; src/components/tasks/shared/WorkItemCard.tsx; testes desses.
  *Aceite:* Sem rolagem horizontal em 1440; foco visível; testes verdes.

## Fase 4 — Testes que faltam (E17–E23)

_Só arquivos novos de teste, para não colidir com os cartões das fases 1 e 2._

- **E17** [hugo] **Provar que favoritos e recentes ignoram ids mortos.** Teste novo: `sidebar-favorites`, `zapp-recent-modules` e `mobile-drawer-recents` com um id que não existe mais (`quadro-legado`) são filtrados sem erro (comportamento já existente em `Sidebar.tsx:79-84`). Só arquivo de teste novo.
  *Arquivos:* src/components/layout/__tests__/idsMortosNaNavegacao.test.tsx (novo).
  *Aceite:* Id morto filtrado nos três lugares, sem lançar.
- **E18** [workertestes] **Contrato: Tarefas expõe Lista, Quadro e Agenda e os limites do WIP.** Contrato novo em `tests/contracts/` provando que `ModeSwitcher` oferece os 3 modos e que `WIP_LIMITS`/`KANBAN_COLUMNS` (`workItem.types.ts`) mantêm doing=3, todo=15, waiting=5. Garante que a fusão não remove o Quadro de dentro de Tarefas.
  *Arquivos:* tests/contracts/tarefas-modos-e-wip.contract.test.ts (novo).
  *Aceite:* Contrato verde e vermelho se um modo ou limite for removido (provar por mutação).
- **E19** [workertestes] **Teste: `?task=<id>` abre a folha em qualquer modo.** Novo arquivo de teste de `TasksModule`: `?view=tasks&task=<id>` abre `WorkItemSheet` em Lista, Quadro e Agenda; sem `task`, retoma o modo salvo em `tasks-mode`. NÃO editar `TasksModule.test.tsx` (é do cartão E14).
  *Arquivos:* src/components/tasks/__tests__/TasksModule.entrada.test.tsx (novo).
  *Aceite:* Cobre os 3 modos e a retomada do modo salvo.
- **E20** [workertestes] **Teste: atalhos 1/2/3 e persistência do modo.** Novo arquivo: as teclas 1/2/3 (evento `tasks-shortcut`) trocam o modo, gravam `tasks-mode` e trocar de modo não dispara request novo (B13). NÃO editar `TasksModule.test.tsx`.
  *Arquivos:* src/components/tasks/__tests__/TasksModule.atalhosDeModo.test.tsx (novo).
  *Aceite:* Troca, persistência e ausência de request novo cobertas.
- **E21** [workertestes] **E2E: Tarefas e o modo Quadro.** Hoje nenhum spec de `e2e/` cobre Tarefas. Criar `e2e/tarefas-quadro.spec.ts`: abrir Tarefas, alternar Lista/Quadro/Agenda, criar tarefa pelo QuickAdd, arrastar entre colunas e ver o limite "Fazendo 3/3" bloquear. Seguir o padrão dos specs existentes; validar tipos e lint; rodar contra a pré-visualização local só se o ambiente permitir e dizer no relato se rodou.
  *Arquivos:* e2e/tarefas-quadro.spec.ts (novo).
  *Aceite:* Spec compila, passa em lint e tipos; relato diz se foi executado.
- **E22** [workertestes] **Teste de acessibilidade do modo Quadro.** Novo arquivo: região `aria-live` anuncia a movimentação, `MoveToMenu` funciona só com teclado, colunas têm nome acessível. Só arquivo novo.
  *Arquivos:* src/components/tasks/__tests__/TasksBoardMode.a11y.test.tsx (novo).
  *Aceite:* Os três comportamentos verificados.
- **E23** [workertestes] **Teste dos limites do arrasto (`resolveDragEnd`).** Novo arquivo de teste de tabela para `resolveDragEnd.ts`: mover para `doing` com 3 itens é bloqueado; `todo` com 15 e `waiting` com 5 avisam sem bloquear; mover para `waiting` exige motivo; soltar na mesma coluna não muda nada.
  *Arquivos:* src/components/tasks/board/__tests__/resolveDragEnd.limites.test.ts (novo).
  *Aceite:* Tabela de casos verde; vermelho se um limite mudar.

## Fase 5 — Documentação (E24–E29)

_Um arquivo por cartão._

- **E24** [vera] **Atualizar `docs/design/TAREFAS_QUADRO_STATUS.md`.** Registrar que a fusão foi concluída: o item de menu e a rota `pipeline` foram removidos, o Quadro é um modo de Tarefas, a Etapa 47 (B7) está superada e o achado do CRM360 foi resolvido.
  *Arquivos:* docs/design/TAREFAS_QUADRO_STATUS.md.
  *Aceite:* Estado final correto e datado; nada mais citando o item de menu como existente.
- **E25** [vera] **Atualizar `docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md`.** Acrescentar a seção "Fechamento da fusão (07/10/2026)" apontando para este plano; não reescrever o histórico.
  *Arquivos:* docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md.
  *Aceite:* Seção de fechamento adicionada.
- **E26** [vera] **Nota de superação em `PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md`.** Acrescentar no topo uma nota curta de que a decisão dos dois itens de menu foi superada por este plano. Não mexer no restante.
  *Arquivos:* docs/design/PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md.
  *Aceite:* Nota no topo; restante intacto.
- **E27** [vera] **Fechar a decisão G-3 em `PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md`.** A decisão G-3 ("2 itens na sidebar por 30 dias, depois avaliar") foi executada: registrar a conclusão e o link para este plano (linha ~294).
  *Arquivos:* docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md.
  *Aceite:* G-3 marcada como concluída.
- **E28** [vera] **Corrigir `docs/tasks/README.md`.** O texto diz "atalho Alt+T" mas o código usa Alt+K (erro anterior à fusão). Corrigir, descrever os 3 modos e remover qualquer menção a dois itens de menu.
  *Arquivos:* docs/tasks/README.md.
  *Aceite:* Atalho correto (Alt+K) e descrição dos 3 modos.
- **E29** [vera] **Entrada no `CHANGELOG.md`.** Uma entrada: "Quadro e Tarefas viram um módulo só; links `?view=pipeline` redirecionam; atalho Alt+P removido; Alt+K abre Tarefas".
  *Arquivos:* CHANGELOG.md.
  *Aceite:* Entrada no formato do arquivo.

## Fase 6 — Portões de verificação (E30–E47, executados pelo Claude)

_Dependem de tudo estar integrado em `dia/`; por isso não são cartões da fábrica._

- **E30** [Claude] **Confirmar que os cartões E07–E29 estão integrados em `dia/`.** git log + conferência cartão a cartão
- **E31** [Claude] **Varredura final: nenhum `pipeline` como id de view nem "Quadro" como item de menu.** git grep com a lista de exceções legítimas (Crm360, sales_*, ContactViewSwitcher, redirect legado)
- **E32** [Claude] **TypeScript e `implicit-any ratchet` em 0.** tsc -p tsconfig.app.json --noImplicitAny
- **E33** [Claude] **Lint sem erro.** eslint
- **E34** [Claude] **Suíte de testes unitários completa.** vitest run
- **E35** [Claude] **Suíte de contratos completa.** vitest --config vitest.contracts.config.ts
- **E36** [Claude] **Build e orçamento de bundle; medir a queda e devolver os 2 KB emprestados ao teto.** vite build + scripts/ci/bundle-budget.mjs
- **E37** [Claude] **Verificação guiada na pré-visualização: menu sem Quadro, Tarefas abre, 3 modos, WIP, arrastar.** localhost:5500
- **E38** [Claude] **Links antigos `?view=pipeline` e `#pipeline` na pré-visualização.** abre Tarefas no Quadro
- **E39** [Claude] **Mobile (390 px): menu, drawer e cabeçalho.** pré-visualização em viewport estreito
- **E40** [Claude] **Atalhos: Alt+K, 1/2/3 e Alt+P inerte.** manual + teste do E08
- **E41** [Claude] **CRM360: os três botões.** manual
- **E42** [Claude] **Acessibilidade: teclado, foco e leitor.** teste do E22 + passada manual
- **E43** [Claude] **Rodar localmente o spec E2E do E21.** playwright
- **E44** [Claude] **Confirmar escopo: 0 migrations, 0 Edge Functions, 0 dependências novas.** git diff --stat contra a base
- **E45** [Claude] **Guardar a evidência (saídas e capturas) em `docs/evidencias/plano-quadro-tarefas/`.** arquivos
- **E46** [Claude] **Atualizar este plano com o estado de execução (§ final).** commit
- **E47** [Claude] **Reconciliar com a `main` e deixar o CI do PR verde.** mesmo método do PR #1900

## Fase 7 — Entrega (E48–E50, dono do produto)

_A fábrica nunca abre PR, faz merge nem publica._

- **E48** [Dono] **Abrir o PR.** Branch a partir da `main` atualizada, commits em PT-BR, PR com os 6 checks obrigatórios verdes.
- **E49** [Dono] **Merge e deploy (decisão do dono).** Merge normal; o deploy do front é o da Vercel.
- **E50** [Dono] **Pós-deploy e fechamento.** Confirmar em produção que o menu não tem "Quadro", que Tarefas abre nos 3 modos e que um link antigo redireciona; registrar e apagar as branches.

---

## 3. Mapa de cartões do Kanban do Hermes

Cada cartão é **autossuficiente e fica verde sozinho na base atual**: código e testes do mesmo conjunto de arquivos vão juntos, e nenhum
cartão toca arquivo de outro. É isso que evita o erro mais comum de recusa ("diff maior que o título") e os conflitos de integração.
Os 23 cartões abaixo (E07–E29) correm em paralelo; E30–E47 não são cartões porque dependem de tudo estar integrado.

| Etapa | Agente | Título |
|---|---|---|
| E07 | hugo | Redirecionar `pipeline` legado para Tarefas no Quadro |
| E08 | hugo | Remover o atalho Alt+P e criar a cobertura que falta |
| E09 | hugo | Atalhos de Tarefas valem só na view `tasks` |
| E10 | hugo | Tirar `pipeline` da lista de views válidas do OAuth do Gmail |
| E11 | iris | Rótulos do cabeçalho mobile |
| E12 | iris | Preset órfão e texto da paleta de comandos |
| E13 | iris | Botões do CRM360 passam a abrir Tarefas |
| E14 | complexo | Remover o item de menu `pipeline`, a rota e o contrato B7 (cartão atômico) |
| E15 | iris | Gutter interno em Lista e Agenda |
| E16 | designer | Quadro em largura total: colunas, foco e contraste |
| E17 | hugo | Provar que favoritos e recentes ignoram ids mortos |
| E18 | workertestes | Contrato: Tarefas expõe Lista, Quadro e Agenda e os limites do WIP |
| E19 | workertestes | Teste: `?task=<id>` abre a folha em qualquer modo |
| E20 | workertestes | Teste: atalhos 1/2/3 e persistência do modo |
| E21 | workertestes | E2E: Tarefas e o modo Quadro |
| E22 | workertestes | Teste de acessibilidade do modo Quadro |
| E23 | workertestes | Teste dos limites do arrasto (`resolveDragEnd`) |
| E24 | vera | Atualizar `docs/design/TAREFAS_QUADRO_STATUS.md` |
| E25 | vera | Atualizar `docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md` |
| E26 | vera | Nota de superação em `PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md` |
| E27 | vera | Fechar a decisão G-3 em `PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md` |
| E28 | vera | Corrigir `docs/tasks/README.md` |
| E29 | vera | Entrada no `CHANGELOG.md` |

## 4. Critérios de aceite do conjunto

1. O menu lateral, o drawer mobile e a paleta de comandos não têm mais "Quadro" como item; Tarefas continua e tem os modos Lista, Quadro e Agenda.
2. `?view=pipeline` e `#pipeline` abrem Tarefas no modo Quadro; `?view=tasks` retoma o último modo.
3. Alt+K abre Tarefas; Alt+P não faz nada; 1/2/3 trocam o modo.
4. Lista e Agenda têm a mesma aparência de hoje; o Quadro usa a largura total.
5. Nenhum `navigateToView('pipeline')` nem `'pipeline'` como id de view sobra (exceto o redirect legado).
6. Sem migration, sem Edge Function, sem dependência nova; `sales_*` intactas.
7. Bundle inicial não cresce (o código removido deve devolver os 2 KB emprestados ao teto de 343 KB).

## 5. Riscos

- **`TasksModule.tsx` (380 linhas) e seu teste (662 linhas) são acoplados.** Por isso a remoção das props `defaultMode`/`forceMode` fica no cartão atômico E14, feito pelo Devin, e os novos testes de `TasksModule` vão em arquivos novos (E19, E20).
- **O redirect não cobre navegação programática.** Mitigado em E13 (CRM360) e E08 (atalho).
- **`layout:'full'` muda o padding de Lista/Agenda se o gutter não for repassado.** Mitigado em E15; conferido visualmente em E37.
- **Não há cobertura E2E de Tarefas hoje.** E21 a cria; a verificação manual de E37–E42 cobre a lacuna.
- **Favoritos de usuário** que apontavam para "Quadro" somem sem aviso (filtro silencioso). Impacto considerado baixo.

## 6. Fora de escopo (deliberado)

Apagar `sales_*`; mexer no pipeline de vendas, em `ContactViewSwitcher` ou `CRM_PIPELINE_TABS`; qualquer migration; qualquer Edge Function; renomear a tabela `conversation_tasks`.

## 7. Estado de execução

_Preenchido na etapa E46._
