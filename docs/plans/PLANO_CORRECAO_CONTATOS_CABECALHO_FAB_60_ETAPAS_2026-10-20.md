# Auditoria exaustiva da branch `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30` + Plano de correção e melhorias em 60 etapas

**Data da auditoria:** 20/10/2026
**Repo:** `adm01-debug/Zapp_Web_V2`
**Branch auditada:** `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30` — commit único `9da991a72b155681934ab7d2a581736e8dff7366`
**Baseline atual conferido:** `main` em `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (19/10/2026, pós PR #2114)
**Escopo desta entrega:** somente análise + plano. Nenhum código foi alterado. Outro agente executa.

---

## 1. Veredito em 1 página

| Pergunta | Resposta | Evidência |
|---|---|---|
| A branch foi incorporada à `main`? | **NÃO.** | `git merge-base --is-ancestor 9da991a origin/main` = falso. Compare `main...docs/...` = **1 ahead / 707 behind**. Nenhuma PR foi aberta a partir dessa branch (`github_list_pull_requests head=...` = `[]`). O arquivo `docs/plans/PLANO_CONTATOS_CABECALHO_BOTAO_VERDE_50_ETAPAS_2026-09-30.md` retorna **404 na `main`**. |
| O que a branch contém? | **Só documentação.** | 1 commit, 1 arquivo, +688 linhas, 0 código. O próprio plano declara: “todas as 50 etapas permanecem pendentes” e “o commit do plano não significa que qualquer uma das 50 etapas foi executada”. |
| As funcionalidades foram implementadas no sistema? | **SIM, por outra via — e depois regrediram parcialmente.** | PR **#1262** `feat(contatos): substitui cabeçalho por botão verde de cadastro` (merge `e06e526283`, 30/09/2026) executou o núcleo do plano a partir de branch separada (`hermes/contatos-cabecalho-fab-verde-26093008442d78`), citando expressamente o plano de 50 etapas. |
| O estado atual da `main` cumpre o contrato do plano? | **NÃO integralmente.** | Em 16/10/2026 o lote 880 cartões (#1976, revertido em #1982 e reaplicado em `025d0258dc`) **reintroduziu o cabeçalho visual** e **removeu o `MotionConfig`**, sem atualizar os snapshots por decisão consciente registrada. Detalhes nas seções 3 e 4. |
| Existe rastreabilidade interna? | Parcial e **desatualizada**. | `docs/reconciliation/tasks/P053.json` + `PLAN_REGISTRY.json` na `main` reconhecem o plano como `OFF_MAIN_REFERENCE_WITH_SEPARATE_DELIVERIES` (28 implementadas aguardando evidência runtime / 14 parciais / 8 a revalidar), mas o baseline dessa auditoria (`2e7cf81`) é **anterior à regressão de 16/10** — os status das etapas 19, 20 e 25 estão hoje incorretos. |

**Resumo executivo:** o plano de 50 etapas foi ~80% executado via PR #1262 e PRs complementares (#1271, #1277, #1278, #1562, #1578), mas **nunca foi fechado**: o documento não entrou na `main`, a branch de documentação continua aberta e órfã (707 commits atrás), e a regressão de 16/10 devolveu à tela exatamente o elemento que o plano mandava remover. O plano de 60 etapas da seção 5 corrige isso e fecha as lacunas restantes.

---

## 2. Linha do tempo comprovada

| Data | Evento | Commit/PR |
|---|---|---|
| 30/09/2026 08:35 (-03) | Plano de 50 etapas commitado na branch de documentação | `9da991a` (branch nunca mergeada, sem PR) |
| 30/09/2026 | Implementação do núcleo: remove `PageHeader`, cria FAB verde, CRM → toolbar, `ScrollToTop` e `ActiveCallBar` reposicionados, `h1.sr-only` | PR #1262 → `e06e526283` |
| 30/09/2026 | Halo respeita `prefers-reduced-motion`; revalidação ao montar; invalidação de agregados | PRs #1271 (`a6955b16`), #1277, #1278 |
| 02/10/2026 | Contraste AA do verde (`--success`), FAB mobile corrigido (156px → 76px + `MobileFAB` oculto em Contatos), snapshots determinísticos | PR #1578 (`09451b8a`) |
| 07–08/10/2026 | Telefonia redesenha `ActiveCallBar` como barra superior inline (não mais flutuante) | PR #1858 (`7eff0b59`), fix de view `d31b895a` |
| 16/10/2026 | **REGRESSÃO:** lote 880 cartões reintroduz `PageHeader title="Contatos"` em `ContactsView`, remove `h1.sr-only` e remove `<MotionConfig reducedMotion="user">`; snapshots visuais são atualizados no mesmo lote | #1976 (`9c0a82cf`) → revert #1982 (`312bd599`) → reaplicação `025d0258dc` |
| 19/10/2026 | Estado auditado | `main` = `d7af7a67` |

---

## 3. Validação etapa por etapa das 50 etapas originais (estado na `main` atual)

Legenda: ✅ implementado e preservado · 🟡 parcial / divergência aceita ou superseded · 🔴 regredido/quebrado · ⏳ só falta evidência runtime (código ok, aceite visual/fluxo nunca refeito nesta auditoria)

### Fase A — Base e contratos (etapas 01–08)

| Etapa | Estado | Evidência na `main` atual |
|---|---|---|
| 01 Atualizar referência | ⏳ | Feita à época (PR #1262 cita plano e SHAs). Baseline mudou 707 commits desde então — refazer é a etapa 01 do novo plano. |
| 02 Registrar tela anterior | 🟡 | Snapshots determinísticos existem (`e2e/contacts-snapshots.spec.ts`, PR #1578), mas foram **rebased em 16/10 já com o cabeçalho de volta** — a “foto anterior” atual legitima a regressão. |
| 03 Fronteira da remoção | ✅ | Escopo respeitado na implementação: subtítulo, Sincronizar e botão retangular sumiram e **não voltaram** (`git grep Sincronizar` em `src/components/contacts/` = vazio). Só o título/breadcrumbs voltaram (ver etapa 19). |
| 04 Mapear diálogos | ✅ | `ContactDialogs` é instância única, montada fora de condições de lista em `ContactsView.tsx`, com os 4 diálogos (adicionar/editar/sucesso/excluir) e todas as props preservadas. |
| 05 Separar Sincronizar das atualizações | ✅ | `handleSync` removido; `refetch`/`invalidateContactAggregates` seguem usados pelo CRUD, merge, tags e lote. A lacuna apontada no PR #1262 (`contacts-type-counts` só invalidada pelo Sincronizar) foi **fechada depois**: `src/hooks/crm/contactsAggregates.ts` invalida `contacts-type-counts` e há teste (`contactsAggregates.test.ts`). |
| 06 Referência PromoGifts | 🟡 | Aplicada (círculo, `Plus`, halo 3s, tooltip). Sem re-conferência contra a `main` atual do Promo_Gifts_V4 nesta auditoria. |
| 07 Inventário do canto direito | 🟡 | Inventário mudou desde o plano: `ActiveCallBar` não é mais flutuante, surgiram modos Pipeline/Mapa/Analytics com superfícies próprias, e `BulkActionsBar` (`fixed bottom-6`, centrada, `z-50`) disputa a base. Requer re-inventário (novo plano, etapas 15–24). |
| 08 CRM condicional | ✅ | `ContactToolbar` recebe `crmIntegrationEnabled` + `onOpenCRM` e renderiza “CRM 360°” (`Sparkles`) sob a mesma flag; diálogo `ContactCRMDialog` intacto em `ContactsView`. |

### Fase B — Definição do botão (etapas 09–16)

| Etapa | Estado | Evidência |
|---|---|---|
| 09 Círculo e tokens | ✅ | `w-14 h-14 rounded-full bg-success text-success-foreground`, `Plus w-6 h-6`, sombra verde local. Contraste AA corrigido em #1578 (`--success` claro 27% → 5,66:1). |
| 10 Posição acima do microfone | ✅ desktop / 🟡 mobile | Desktop exato: FAB `md:right-6 md:bottom-24` (24/96px) sobre microfone `bottom-6 right-6` 56px (`VoiceCopilotFAB.tsx:14`). Mobile divergiu do proposto (156px → `calc(76px + safe-area)`) por decisão documentada no PR #1578 — ver gap G5. |
| 11 Halo | ✅ | Span 40px `animate-ping` com `animationDuration: 3s`, `opacity-60`, `aria-hidden`, `pointer-events-none`, pausa no hover. Envelope 40→80px = 12px/lado, folga de 4px até o microfone, como especificado. |
| 12 Tooltip e nome | ✅ | `aria-label="Novo contato"`, `TooltipContent side="left" sideOffset={8}`, `data-testid="contact-create-fab"`. |
| 13 Foco e acionamento | 🟡 | Botão real único (`type="button"`) com `DialogTrigger`+`TooltipTrigger asChild` em portal — correto no código. **Retorno de foco após os diálogos nunca foi revalidado em navegador nesta auditoria** (o registro P053 já marcava “runtime not observed”). |
| 14 Movimento reduzido | 🟡→🔴 parcial | O halo tem `motion-reduce:hidden` e há regra global em `accessibility.css`. **Mas** o `<MotionConfig reducedMotion="user">` que cobria os demais `motion.*` da tela foi **removido em 16/10** junto com a regressão do cabeçalho (ver etapa 25). |
| 15 Ancoragem e camadas | 🟡 | Portal para `document.body` ok, desmonta ao sair de Contatos. `z-20` foi **divergência deliberada e documentada** no PR #1262 (plano sugeria `z-30`): mantém o FAB abaixo de backdrop móvel (`z-30`), scroll-top (`z-40`), microfone/diálogos/detalhe (`z-50`). Efeito colateral real: ver gap G3 (hit-test no mobile). |
| 16 Adaptação celular | 🟡 | Solução adotada difere da proposta e é melhor: `MobileFAB` global **não monta em Contatos** (`MobileShell.tsx`: “Hide FAB … on contacts (has its own FAB)”), e o FAB verde desceu para 76px+safe-area. Falta validar teclado virtual aberto e orientação horizontal (etapas 21–22 do novo plano). |

### Fase C — Execução (etapas 17–30)

| Etapa | Estado | Evidência |
|---|---|---|
| 17 Branch e referência | ✅ | Executada à época (branch `hermes/contatos-cabecalho-fab-verde-26093008442d78`, PR #1262). |
| 18 Realocar `ContactDialogs` | ✅ | Fora do cabeçalho e de condições de lista, antes de qualquer conteúdo — preservado até hoje. |
| 19 Retirar o cabeçalho visual | 🔴 **REGREDIDO** | `ContactsView.tsx` atual volta a renderizar `<PageHeader title="Contatos" breadcrumbs={[{label:'Gestão'},{label:'Contatos'}]} />` **sem `variant="plain"`** — ou seja, volta na variante `card` (px-6 py-4, borda, `bg-card`), mais pesada que o cabeçalho original removido. Subtítulo/Sincronizar/botão retangular **não** voltaram. Reintroduzido por `025d0258dc` (lote 880). |
| 20 Espaçamento e semântica | 🔴 **REGREDIDO** | `ContactStatsCards` deixou de ser o primeiro bloco visual; o `<h1 className="sr-only">Contatos</h1>` foi removido no mesmo commit (o `h1` agora é o título visual dentro do `PageHeader`). A faixa voltou a empurrar os indicadores para baixo. |
| 21 Limpar Sincronizar | ✅ | Sem `handleSync`, `RefreshCw`, `useQueryClient` órfãos em `ContactsView`. |
| 22 CRM na toolbar | ✅ | Ver etapa 08. |
| 23 Gatilho circular verde | ✅ | Ver etapas 09–13. Botão retangular do topo não existe mais. |
| 24 Halo, brilho, estados | ✅ | Hover `bg-success/90 hover:scale-105`, `active:scale-95`, foco com ring, halo pausado no hover. |
| 25 Estado, callbacks e ciclo de vida | 🟡→🔴 parcial | Props/callbacks/`handleCancelForm`/sucesso intactos. **Perda:** remoção do `MotionConfig` (16/10) — os descendentes Framer Motion da tela (diálogo de sucesso, scroll-top, cards animados) perderam a governança `reducedMotion="user"` que o plano mandava preservar (“manter `MotionConfig` quando necessário para os descendentes”). |
| 26 Fixar só em Contatos | ✅ | Portal montado apenas dentro de `ContactsView`; some ao trocar de módulo. |
| 27 Voltar ao topo | ✅ | Instância de Contatos com `bottom-[calc(228px+safe)] md:bottom-[168px] md:right-8` — centros alinhados com a pilha (FAB/scroll-top/microfone) em desktop e mobile. Limite de 400px preservado em `scroll-to-top.tsx`. |
| 28 Barra de chamada | 🟡 **SUPERSEDED** | A premissa acabou: `ActiveCallBar` foi redesenhada como barra inline no topo (`flex h-12 border-b`, `data-testid="tel-active-bar"`), sem posicionamento flutuante nem geometria 224/284px. Não há mais conflito com a pilha — mas o teste e a geometria do PR #1262 para essa etapa estão obsoletos e o aceite original (“acima da pilha”) não se aplica mais. Revalidar no novo desenho (novo plano, etapa 44). |
| 29 Coordenar celular | 🟡 | Coordenação resolvida ocultando o `MobileFAB` em Contatos. Pendente: comportamento com teclado virtual aberto (o FAB de Contatos é portal independente e **não** é ocultado pelo `isKeyboardOpen` do shell) e com o painel de detalhes aberto. |
| 30 Prioridade de overlays | 🟡 | Por `z-index`, diálogos/detalhe (`z-50`) cobrem o FAB (`z-20`) — correto. Não revalidado em navegador após as mudanças de telefonia e dos novos modos de visualização. |

### Fase D — Fluxos preservados (etapas 31–42)

| Etapa | Estado | Evidência |
|---|---|---|
| 31 Abertura clique/toque | 🟡 | E2E usa o FAB (`e2e/contacts-crud.spec.ts`, `e2e/contact-address.spec.ts`). **Porém** o spec de acessibilidade registra workaround: “o FAB é `fixed z-20` e no celular os cards da lista passam por cima dele no hit-test, então ele é acionado pelo teclado” (`e2e/a11y-toque-44px.spec.ts`). Toque direto na área coberta por card não está provado — gap G3. |
| 32 Cancelamento e foco | ⏳ | `handleCancelForm` preserva rascunho (não limpa `newContact`) — código ok. Retorno de foco não revalidado. |
| 33 Cadastro com sucesso | ⏳ | Fluxo, protocolo e “Continuar” intactos em `ContactDialogs`; invalidação de agregados hoje cobre KPI + type-counts + lista. Sem evidência runtime nova nesta auditoria. |
| 34 Inválidos e falhas | ⏳ | Validação do `ContactForm` intocada; E2E de e-mail duplicado compatível pelo nome acessível preservado. |
| 35 Edição | ⏳ | 4 diálogos montados; entradas por card/lista/tabela/detalhes inalteradas. |
| 36 Exclusão e permissões | ⏳ | Testes existentes (`ContactDeletePermission`, `ContactDeleteEntryPoints`) seguem no repo. |
| 37 Loading/vazios | ✅ | FAB montado independente de loading/lista; convites do estado vazio abrem o mesmo diálogo (`onAddContact={() => setIsAddDialogOpen(true)}` em `ContactContentArea`). |
| 38 Quatro indicadores | ✅ | Total/Novos (30 dias)/Empresas/Fornecedores em `ContactStatsCards`, com a correção posterior de consistência com o badge “Todos” (mesma fonte `contactCountByType['all']`). |
| 39 Categorias | ✅ | `ContactTypeTabs` + contagens por tipo preservados; toggle “Mostrar legados” posterior não quebrou o contrato. |
| 40 Busca e toolbar | 🟡 | Toolbar funcional; **duplo comportamento novo**: com a flag `contacts.v2.toolbar` ligada, a busca troca para `ContactSearchV2Field` (RPC `search_contacts`). O aceite da etapa 40 precisa cobrir os dois modos. |
| 41 Modos de visualização | 🟡 | Escopo cresceu: hoje são Cards, Lista, Tabela, Pipeline (Kanban), Mapa e Analytics (`ContactViewSwitcher.tsx`). O plano só previa os modos de 30/09. FAB sobre Mapa/Analytics (superfícies com controles próprios no canto) nunca foi conferido. |
| 42 Resumo, paginação, lote | 🟡 | `ContactResultsSummary` e `BulkActionsBar` preservados; `BulkActionsBar` é `fixed bottom-6` centrada `z-50` — colisão potencial com a pilha direita em telas estreitas com seleção ativa não foi revalidada. Sem `padding-bottom` dedicado em `ContactContentArea` para o último item sob a pilha. |

### Fase E — Verificação e entrega (etapas 43–50)

| Etapa | Estado | Evidência |
|---|---|---|
| 43 Desktop e rolagem | ⏳ | Geometria confere por inspeção de classes (etapas 10/27), mas **sem medição em navegador** após a regressão de 16/10. Snapshots atuais foram gerados já com o cabeçalho. |
| 44 Celular/safe-area/teclado | ⏳ | Idem; teclado virtual é o ponto cego conhecido (etapa 29). |
| 45 Temas e contraste | 🟡 | Contraste do verde foi corrigido e medido (#1578, script `scripts/qa/contraste-contatos.mjs`). Halo/tooltip/foco em tema escuro e alto contraste não revalidados. |
| 46 Teclado/leitor de tela/animação | 🟡 | Nome acessível e foco por teclado provados no E2E (via workaround). Movimento reduzido **parcialmente regredido** com a perda do `MotionConfig` (etapa 25). |
| 47 Cobertura existente | 🟡 | Suíte de Contatos extensa e viva, E2Es usam o FAB. **Não existe guarda** que impeça o `PageHeader` de voltar a `ContactsView` — foi assim que a regressão passou pela CI e pelos snapshots. |
| 48 Tipos/lint/build/diff | ⏳ | CI da `main` exige Build, TypeCheck, Unit Tests (3 shards) e Node CI Scripts (branch protection conferida). Não reexecutados nesta auditoria (análise estática). |
| 49 Revisão da entrega | 🔴 | A entrega original foi revisada/mergada (#1262), mas a **regressão posterior não teve revisão contra o plano** — entrou num lote de 880 cartões / 3.103 arquivos. |
| 50 Publicação e reversão | 🟡 | Publicado via merge na época. Hoje não há procedimento registrado que proteja este contrato; a reversão da regressão é justamente o objeto do novo plano. |

**Placar reavaliado nesta auditoria (main `d7af7a67`):** ✅ 15 · 🟡/⏳ 31 · 🔴 4 (etapas 19, 20, 25-parcial, 49) — com 2 etapas adicionais superseded na premissa (16 e 28 resolvidas por desenho diferente do proposto).

---

## 4. Falhas e gaps consolidados

| ID | Severidade | Gap | Origem |
|---|---|---|---|
| G1 | **Alta** | Cabeçalho visual “Contatos” de volta (variante `card`, com breadcrumbs em mobile/zen), empurrando os indicadores — viola o resultado contratado nº 1 do plano | `025d0258dc` (lote 880, 16/10) |
| G2 | Média | `MotionConfig reducedMotion="user"` removido: descendentes Framer Motion de Contatos perderam a governança de movimento reduzido | mesmo commit |
| G3 | **Alta** | FAB `z-20` perde hit-test para cards da lista no mobile; E2E de acessibilidade contorna via teclado em vez de tocar — toque real na região sobreposta não está provado | registrado em `e2e/a11y-toque-44px.spec.ts` |
| G4 | Média | Nenhuma guarda (teste/CI) impede `PageHeader` de voltar a `ContactsView`; snapshots visuais foram rebased com a regressão, legitimando-a | ausência de teste de contrato |
| G5 | Baixa | Geometria mobile (76px) e ocultação do `MobileFAB` divergem da proposta do plano (156px) — decisão correta e documentada (#1578), mas o plano original nunca foi atualizado para registrar a divergência como aceite formal | divergência não consolidada |
| G6 | Média | Etapa 28 (barra de chamada flutuante) superseded: `ActiveCallBar` virou barra de topo; testes/geometria do #1262 obsoletos, aceite antigo sem sentido | PR #1858 e seguintes |
| G7 | Média | Teclado virtual mobile: FAB de Contatos (portal) não participa do `isKeyboardOpen` do shell — pode flutuar sobre teclado/campo com a navegação oculta | `MobileShell` × `ContactDialogs` |
| G8 | Média | Novos modos Pipeline/Mapa/Analytics têm superfícies e controles próprios; permanência do FAB e acesso ao último item sobre essas superfícies nunca foram validados | evolução pós-plano |
| G9 | Baixa | `BulkActionsBar` fixa centrada (`bottom-6 z-50`) pode colidir com a pilha direita em largura estreita com seleção ativa | etapa 42 não revalidada |
| G10 | Baixa | Sem respiro inferior dedicado: último contato da lista pode ficar sob a pilha FAB/microfone de forma permanente em alguns modos | `ContactContentArea` sem `pb-*` |
| G11 | **Alta** (processo) | Documento do plano fora da `main` (404), branch órfã 707 commits atrás sem PR — qualquer limpeza de branches apaga a única cópia do contrato que a PR #1262 referencia | branch nunca mergeada |
| G12 | Média (processo) | Registro P053/`PLAN_REGISTRY` desatualizado (baseline pré-regressão): marca 19/20/25 como implementadas | lote 16/10 não atualizou o registro |
| G13 | Média | Retorno de foco após fechar cadastro/sucesso e comportamento do tooltip no portal nunca foram comprovados em navegador (P053: `runtime: not_observed` em 50/50 etapas) | evidência runtime ausente |
| G14 | Baixa | Busca com flag `contacts.v2.toolbar` cria dois comportamentos da toolbar; aceite da etapa 40 original não cobre o modo v2 | CT-011 posterior |
| G15 | Baixa | Zen mode: `hidePageBreadcrumbs` é falso em zen, então os breadcrumbs do `PageHeader` regredido aparecem também em zen, junto ao toggle flutuante do modo | interação G1 × `AppShell` |

---

## 5. Plano de correção e melhorias em 60 etapas (para o próximo agente)

**Regras de execução (obrigatórias):**
- Branch nova própria com carimbo, a partir da `main` atualizada: `claude/fix-contatos-cabecalho-fab-<AAMMDD-HHMM>`. Nunca commitar em `main`, nunca reutilizar branch alheia. Antes de começar, listar PRs abertas tocando `src/components/contacts/ContactsView.tsx`, `ContactDialogs.tsx`, `ContactToolbar.tsx` — havendo conflito, parar e reportar.
- Diff mínimo: corrigir a causa, sem reformatar arquivos inteiros. Um assunto por PR (correção do cabeçalho/FAB numa PR; incorporação documental pode ir na mesma PR apenas se o diff ficar pequeno — preferir PR separada de docs).
- Merge somente com CI verde (Build, TypeCheck, Unit Tests 1–3, Node CI Scripts). Não envolve DDL, segredos nem infra — squash-merge autorizado após CI verde e verificação em produção.
- “Pronto” = PR mergeada + deploy Vercel confirmado + comportamento verificado em `https://zapp-web-v2.vercel.app` (`?view=contacts`).
- Em cada etapa: registrar evidência (arquivo:linha, screenshot com viewport, ou saída de teste) antes de marcar como feita.

### Fase A — Reconciliação e baseline (etapas 01–06)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 01 | Congelar baseline real | `git fetch origin`; registrar SHA da `main`, `git rev-parse` da branch de docs e o compare (ahead/behind). Conferir `graphify-out/GRAPH_REPORT.md` se existir e o frescor contra o HEAD. | SHA e divergência registrados no corpo da futura PR | — |
| 02 | Verificar PRs concorrentes | Listar PRs abertas que toquem os 5 arquivos do plano original; se houver, parar e reportar antes de editar | Nenhuma PR concorrente, ou decisão registrada | 01 |
| 03 | Fotografar o estado regredido | Capturar Contatos em produção (desktop 1440×900 e mobile 390×844, claro/escuro) mostrando `PageHeader` visível, indicadores empurrados e pilha de botões | Evidência “antes” anexada à PR | 01 |
| 04 | Formalizar as divergências aceitas | Registrar como decisão (no corpo da PR e, ao final, no registro P053): mobile 76px + `MobileFAB` oculto em Contatos (G5), `z-20` deliberado (etapa 15 original), `ActiveCallBar` em barra de topo (G6) — nenhuma das três deve ser “corrigida” de volta ao texto de 30/09 | Lista de divergências aceitas explícita; plano novo não reverte decisões posteriores documentadas | 01 |
| 05 | Revalidar o inventário do canto direito | Medir em navegador: microfone, FAB, voltar-ao-topo, `BulkActionsBar`, toggle zen, navegação inferior, painel de detalhes, diálogos — tamanho, `z-index`, condição de montagem, nos 6 modos de visualização | Tabela de inventário atual substitui a da etapa 07 original | 03 |
| 06 | Atualizar o registro P053 (pré-correção) | Marcar 19, 20 e 25 como regredidas e 16/28 como superseded em `docs/reconciliation/tasks/P053.json`, com referência a `025d0258dc` | Registro reflete a `main` real antes da correção | 01, 04 |

### Fase B — Correção da regressão do cabeçalho (etapas 07–14)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 07 | Remover o `PageHeader` de Contatos | Em `ContactsView.tsx`: retirar import e instância de `PageHeader` (título + breadcrumbs). Não tocar no componente global `PageHeader` (outros módulos usam) | Primeira dobra de Contatos começa nos indicadores, em desktop, mobile e zen | 02, 06 |
| 08 | Restaurar a identificação semântica | Recolocar `<h1 className="sr-only">Contatos</h1>` como primeiro elemento do módulo, fora de qualquer estrutura que gere lacuna visual | Leitor de tela anuncia “Contatos”; nenhuma faixa visível nova | 07 |
| 09 | Restaurar o `MotionConfig` | Reenvolver o retorno de `ContactsView` em `<MotionConfig reducedMotion="user">`, como estava em `e06e526283` | Descendentes Framer Motion respeitam a preferência do sistema de novo | 07 |
| 10 | Indicadores como primeiro bloco | Garantir `ContactStatsCards` como primeiro bloco visual útil, sem wrappers/espaçamentos órfãos do cabeçalho (`space-y-*` revisado) | Sem faixa vazia no topo; os 4 indicadores sobem | 07, 08 |
| 11 | Confirmar o que não volta | Grep + inspeção: sem “Sincronizar”, sem subtítulo com contagem, sem botão retangular “+ Novo Contato” no topo; `handleSync` continua ausente e CRUD continua invalidando agregados | Contrato de remoção integral, não só do título | 07 |
| 12 | CRM continua acessível | Com `crmIntegrationEnabled` ligado e desligado: “CRM 360°” aparece só na toolbar e abre o mesmo `ContactCRMDialog` | Funcionalidade condicional preservada após a remoção | 07 |
| 13 | Diálogos intactos na realocação | Confirmar instância única de `ContactDialogs` fora de condições de lista, com os 4 diálogos e todas as props — nenhuma mudança de estado | Abrir/fechar os 4 diálogos a partir das entradas existentes | 07 |
| 14 | Teste de contrato anti-regressão | Teste unitário novo (ou extensão do existente) sobre `ContactsView`: asserta ausência de `PageHeader`/título visível, presença de `h1.sr-only`, de `contact-create-fab` e de `ContactStatsCards` como primeiro bloco. Mutation-test: reintroduzir o `PageHeader` deve quebrar o teste | Regressão de 16/10 passaria a quebrar a CI (fecha G4) | 07–10 |

### Fase C — FAB: geometria, hit-test e convivência (etapas 15–24)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 15 | Medir a pilha no desktop | Em 1920×1080, 1440×900 e 1366×768, medir `getBoundingClientRect()` de microfone, FAB, halo e voltar-ao-topo, no topo e após 400px de rolagem | Retângulos sem interseção; centros alinhados (52px da direita no desktop) | 05 |
| 16 | Diagnosticar o hit-test mobile (causa raiz) | Reproduzir em viewport mobile com card sob o FAB: identificar quem intercepta o toque (stacking context do scroller, `z-index` de cards, transformações) usando `document.elementFromPoint` no centro do FAB | Causa raiz escrita na PR — sem ela, não aplicar correção | 05 |
| 17 | Corrigir o hit-test | Ajuste mínimo conforme a causa (camada do portal/`z-index` local ou `pointer-events` da superfície), **mantendo** diálogos, detalhe, backdrop móvel e microfone acima do FAB | Toque no centro do FAB abre o diálogo mesmo com card atrás | 16 |
| 18 | Trocar o workaround do E2E por toque real | Em `e2e/a11y-toque-44px.spec.ts`, substituir o acionamento por teclado pelo toque/clique no FAB e remover o comentário de contorno; manter a prova de teclado como cenário separado | Spec prova toque e teclado, sem contorno | 17 |
| 19 | Validar o envelope do halo | Observar 1 ciclo completo (3s): halo 40→80px não invade o microfone (folga de 4px), não é cortado pela janela nem pelo botão, `pointer-events: none` efetivo | Pulsação visível e contida nas 3 viewports desktop | 15 |
| 20 | Pilha × `BulkActionsBar` | Com seleção ativa em 360px e 1440px: barra de lote não cobre FAB/microfone/voltar-ao-topo e nenhuma ação fica inalcançável | Sem sobreposição de alvos (fecha G9) | 15 |
| 21 | Teclado virtual mobile | Abrir busca e formulário no mobile: FAB não flutua sobre o teclado nem sobre campos; avaliar ocultá-lo com o teclado (paridade com `isKeyboardOpen` do shell) se a medição mostrar conflito | Nenhum alvo coberto com teclado aberto (fecha G7) | 16 |
| 22 | Safe-area e orientação | 390×844, 360×800, horizontal e larguras 767/768px: FAB acima da navegação inferior com `env(safe-area-inset-bottom)`, sem salto ao cruzar o breakpoint | Geometria estável nos 4 cenários | 15 |
| 23 | FAB nos 6 modos | Cards, Lista, Tabela, Pipeline, Mapa, Analytics: FAB visível e tocável; no Mapa, não cobre controles próprios do canto; último item alcançável em cada modo (fecha G8) | Cadastro acessível em todos os modos | 17 |
| 24 | Respiro do último item | Se qualquer modo deixar o último contato sob a pilha, adicionar apenas o `padding-bottom` local necessário naquele contêiner | Último item sempre legível/clicável (fecha G10) | 23 |

### Fase D — Acessibilidade e movimento (etapas 25–32)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 25 | Foco na abertura | Abrir o cadastro pelo FAB (mouse, toque, Enter, Espaço): foco vai para o formulário, um único diálogo, sem disparo de gravação | Comportamento idêntico nas 4 formas de acionamento | 17 |
| 26 | Foco no fechamento | Fechar por Cancelar, Escape e X, a partir do FAB e do estado vazio: foco retorna ao gatilho de origem; rascunho digitado é preservado ao reabrir (comportamento atual de `handleCancelForm`) | Retorno de foco correto nos 6 cenários (fecha parte de G13) | 25 |
| 27 | Foco após sucesso | Cadastrar fixture de teste: sucesso abre, “Continuar” fecha, foco retorna ao FAB e lista/indicadores atualizam | Sem foco perdido para o `body` na cadeia de diálogos | 26 |
| 28 | Tooltip no portal | Hover e foco mostram “Novo contato” à esquerda (offset 8px); no toque, o primeiro toque abre o formulário (sem toque prévio de tooltip) | Tooltip correto sem bloquear toque | 17 |
| 29 | Movimento reduzido completo | Com `prefers-reduced-motion` do sistema **e** com a classe `.reduced-motion` do produto: halo some, `MotionConfig` restaurado governa os demais movimentos, botão continua visível/funcional | Zero pulsação residual nos dois mecanismos (fecha G2) | 09, 19 |
| 30 | Contraste e temas | Rodar `scripts/qa/contraste-contatos.mjs --check`; conferir FAB, halo, tooltip e anel de foco em claro, escuro e alto contraste | 0 pares abaixo de 4,5:1; verde identificável nos 3 modos | 19 |
| 31 | Leitor de tela | Percurso com leitor (ou árvore de acessibilidade do Playwright): `h1` anuncia a página, FAB anuncia “Novo contato”, halo/`Plus` decorativos ignorados, nenhum anúncio repetido do `ping` | Árvore limpa, sem ruído de animação | 08, 28 |
| 32 | Alvo e zoom | Alvo de 56px confirmado (spec 44px mantida) e layout íntegro com zoom de 200% e texto ampliado no mobile | Sem corte de alvo nem de tooltip | 22, 28 |

### Fase E — Fluxos funcionais preservados (etapas 33–44)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 33 | Criar com sucesso | No ambiente de validação, criar contato-fixture pelo FAB: envio, sucesso, protocolo, “Continuar”, lista e indicadores atualizados (inclusive com filtro ativo que não casa com o novo contato) | Fluxo idêntico ao anterior à correção | 27 |
| 34 | Cancelar sem salvar | Digitar e cancelar pelos 3 fechamentos: nada é gravado e o rascunho reaparece ao reabrir | Nenhuma limpeza introduzida pela correção | 26 |
| 35 | Inválidos e falha | Campos obrigatórios, telefone/e-mail duplicado e falha simulada: mensagens atuais, campos preservados, nova tentativa possível | Validações intocadas | 33 |
| 36 | Edição pelas 4 entradas | Card, lista, tabela e detalhes abrem a edição com dados certos, salvam e cancelam | Diálogo de edição íntegro após a realocação | 13 |
| 37 | Exclusão e permissões | Confirmar abertura da exclusão por cada entrada e cancelar; suíte existente cobre `can_delete` verdadeiro/falso/ausente — exclusão efetiva só com fixture | Permissões inalteradas | 13 |
| 38 | Loading e vazios | Tela carregando, base vazia, busca sem resultado e filtro vazio: FAB montado e funcional; convites dos estados vazios abrem o mesmo diálogo | Nenhum estado perde nem duplica o cadastro | 23 |
| 39 | Indicadores consistentes | Os 4 indicadores batem com badge “Todos” e contagens, com toggle de legados ligado e desligado, antes/depois de criar fixture | Mesmos números e fontes da etapa 38 original | 33 |
| 40 | Categorias e contagens | Percorrer todas as categorias: seleção, contagens e resultados mantidos, inclusive em tela estreita | Sem vínculo com o cabeçalho removido | 10 |
| 41 | Busca e toolbar nos 2 modos | Com a flag `contacts.v2.toolbar` desligada (busca atual) e ligada (`ContactSearchV2Field`): buscar, limpar, ordenar, filtros, presets, CRM on/off e quebra de linha | Os dois modos funcionam após a correção (fecha G14) | 12, 40 |
| 42 | Visualizações e preferências | Alternar os 6 modos, ajustar colunas e agrupar por empresa: preferências persistem e o FAB não depende da quantidade de itens | Preferências e modos preservados | 23, 41 |
| 43 | Resumo, paginação e lote | Selecionar tudo/parcial, paginar, aplicar tags, comparar e mesclar (com permissão): callbacks e seleção entre páginas intactos; barra de lote sem cobrir a pilha | Ações em lote íntegras (com G9 fechado na etapa 20) | 20, 42 |
| 44 | Chamada ativa no desenho novo | Com chamada simulada (discando, recebendo, ativa): a barra de topo atual não conflita com FAB/indicadores, atender/silenciar/encerrar funcionam e o clique leva à Telefonia; atualizar/remover as expectativas de geometria flutuante herdadas do #1262 | Aceite reescrito para o desenho vigente (fecha G6) | 05 |

### Fase F — Testes, guardas e qualidade (etapas 45–52)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 45 | Unitários do módulo | `bun run test` nos testes de Contatos (indicadores, CRUD, validação, endereço, permissões, toolbar, `ActiveCallBar`) — todos verdes sem enfraquecer asserções | Suíte pertinente verde | 07–44 |
| 46 | Unitário do FAB | Garantir cobertura do gatilho: `type="button"`, `aria-label`, `data-testid`, halo com `motion-reduce:hidden`, composição `DialogTrigger`/`TooltipTrigger` sem botão aninhado | Quebra se o gatilho regredir para `div`/botão retangular | 14 |
| 47 | E2E de CRUD pelo FAB | `e2e/contacts-crud.spec.ts` e `e2e/contact-address.spec.ts` verdes usando o FAB, sem `force: true` nem acionamento indireto novo | Fluxo real pelo botão verde | 17, 18 |
| 48 | Snapshots visuais conscientes | Regenerar `e2e/contacts-snapshots` **somente** após as etapas 07–10, revisando pixel a pixel que a única mudança intencional é a saída do cabeçalho; projeto `chromium-contacts-visual` verde | Baseline novo prova a tela sem cabeçalho (desfaz o rebase de 16/10) | 07–10, 43 |
| 49 | E2E de acessibilidade | `chromium-a11y` (toque 44px) verde já com o toque real da etapa 18 | Sem workaround documentado restante | 18 |
| 50 | Ratchets e build | `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `bun run build`, `git diff --check` — registrar SHA + resultado de cada um | 0 falhas novas; build ok | 45–49 |
| 51 | Alcance do diff | `git diff --stat` confinado a: `ContactsView.tsx`, `ContactDialogs.tsx` (se o hit-test exigir), teste de contrato, spec de a11y, snapshots e registro P053. Qualquer arquivo fora disso precisa de justificativa no corpo da PR | Diff mínimo, sem refactor oportunista | 50 |
| 52 | Guarda permanente | O teste da etapa 14 roda na suíte unitária da CI (não só local); confirmar que ele executa num dos 3 shards de Unit Tests da branch protection | Regressão futura do cabeçalho quebra a CI automaticamente | 14, 50 |

### Fase G — Entrega, incorporação da branch e encerramento (etapas 53–60)

| # | Etapa | Ação e detalhe | Aceite | Depende de |
|---|---|---|---|---|
| 53 | Abrir a PR de correção | Título `fix(contatos): remove cabeçalho regredido e restaura contrato do FAB verde`; corpo com: causa (`025d0258dc`), divergências aceitas (etapa 04), evidências antes/depois e resultados reais dos testes | PR revisável com evidência do mesmo SHA | 52 |
| 54 | CI verde completa | Build, TypeCheck, Unit Tests (1/3, 2/3, 3/3) e Node CI Scripts verdes; se vermelha, ler o resumo da falha antes de qualquer novo patch | 6/6 checks verdes | 53 |
| 55 | Merge e limpeza da branch de implementação | Squash-merge e apagar a branch `claude/fix-contatos-...` criada nesta execução | PR mergeada, branch de trabalho removida | 54 |
| 56 | Incorporar a documentação à `main` | Em PR de docs separada (`claude/docs-contatos-planos-<AAMMDD-HHMM>`): trazer `docs/plans/PLANO_CONTATOS_CABECALHO_BOTAO_VERDE_50_ETAPAS_2026-09-30.md` da branch órfã (cherry-pick de `9da991a` ou cópia fiel com nota de origem) junto com este plano de 60 etapas | Os dois documentos existem na `main` (fecha G11) | 55 |
| 57 | Encerrar a branch órfã | Após a etapa 56 mergeada, confirmar que o arquivo existe na `main` e apagar `docs/plano-contatos-cabecalho-botao-50-etapas-2026-09-30` | Branch deletada sem perda documental | 56 |
| 58 | Confirmar deploy em produção | Aguardar o deploy Vercel da `main` e abrir `https://zapp-web-v2.vercel.app/?view=contacts`: sem cabeçalho, indicadores no topo, FAB verde acima do microfone abrindo o cadastro | Comportamento verificado na URL pública (não só CI) | 55 |
| 59 | Fechar o registro | Atualizar P053/`PLAN_REGISTRY`: etapas 19/20/25 como corrigidas com referência à nova PR, 43–50 com a evidência runtime coletada nas etapas 15–52 deste plano, e status final do plano de 50 etapas como encerrado/superseded por este | Registro conta a história real, ponta a ponta (fecha G12 e G13) | 58 |
| 60 | Reversão preparada | Registrar na PR o procedimento: `git revert` do squash da correção restaura o estado anterior sem tocar em dados (não há migração); se o FAB quebrar em produção, reverter só essa PR, nunca o lote alheio | Rollback de 1 comando documentado e testável | 55 |

---

## 6. O que NÃO fazer (limites deste plano)

- Não reverter as decisões posteriores documentadas: geometria mobile de 76px, ocultação do `MobileFAB` em Contatos, `z-20` do FAB e `ActiveCallBar` como barra de topo. Quem quiser mudá-las abre plano próprio.
- Não tocar no componente global `PageHeader`, no microfone (`VoiceCopilotFAB`), em banco/RLS, em flags `contacts.v2.*` nem em outros módulos.
- Não aproveitar para redesenhar indicadores, toolbar ou modos novos. Achado fora do escopo vira item separado, não entra no diff.
- Não regenerar snapshots visuais antes de corrigir o cabeçalho — snapshot novo só depois das etapas 07–10, com revisão consciente.

## 7. Critério de encerramento

O plano de 50 etapas só pode ser declarado encerrado quando, simultaneamente: (a) a tela em produção começa pelos indicadores, sem cabeçalho; (b) o FAB verde é tocável em desktop e mobile, em todos os modos; (c) existe teste quebrando a CI se o cabeçalho voltar; (d) os dois documentos estão na `main` e a branch órfã foi apagada; (e) o registro P053 reflete esse estado com evidência runtime.
