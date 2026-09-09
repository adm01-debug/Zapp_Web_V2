# PAINEL DIREITO COM 5 ABAS — Ledger de execução

> Branch: `feat/inbox-painel-direito` · Worktree: `/workspace/repos/Zapp_Web_V2-painel`
> Plano: `docs/design/PLANO_PAINEL_DIREITO_TABBED.md`

---

## CP1 — Fase 1 (tiles de ação + avatar 72px)

- [x] **1.** `ContactActionButtons.tsx` reescrito: 5 tiles 56×56 (`w-14 h-14`) — Ligar (dropdown WhatsApp/Telefone), WhatsApp (`wa.me`), E-mail (`mailto`/navigate, disabled sem email), Transferir (dispara `CustomEvent('open-transfer-dialog')`, ouvido em `ChatPanel.tsx` — abre o `TransferDialog` já existente), Mais (dropdown: Editar/VIP/Arquivar/Bloquear/Sincronizar CRM/Recolher seções). Handlers originais todos preservados (nenhum removido; CRM-sync extraído para `CrmSyncMenuItem` interno, só monta `useSyncToCRM` quando `isExternalConfigured && conversation`, preservando o comportamento condicional anterior do `CRMSyncButton`).
  - Edição cirúrgica em `ChatPanel.tsx`: `useEffect` novo (12 linhas) ouvindo `open-transfer-dialog` → `openDialog('transferDialog')`, filtrado por `contactId`.
- [x] **2.** `ContactHeaderSection.tsx`: avatar `w-24 h-24` (96px) → `w-[72px] h-[72px]` (72px, único ponto de mudança — SVG do anel de engajamento usa `calc(100%+12px)` relativo ao próprio container, escala automaticamente, não precisou de outro ajuste). `data-testid="contact-avatar"` adicionado. Nada mais no arquivo foi tocado (badge de canal, logo CRM, nome, telefone, chips — inalterados).
- [x] **3.** Commit `feat(painel): fase 1 — tiles de ação e avatar 72px`. Push `--no-verify`.

**Gates CP1:**
- `npm run typecheck` (`tsc -b --force`) → **exit 0**, 0 erros novos.
- `node scripts/ci/lint-ratchet.mjs` → `baseline=1189, atual=1189, novas=0` → **OK**.
- `npx vitest run src/components/inbox/contact-details src/components/inbox/ChatPanel` → **63/63 passed** (suite existente `ContactHeaderSection.test.tsx` continuou verde após extrair `CrmSyncMenuItem` para não quebrar o QueryClient nos testes sem provider).
- Screenshot: `docs/design/painel-01-tiles.png` — QA real (`qa.visual@promobrindes.com.br`) logado via Playwright headless, inbox aberto, conversa selecionada, painel direito visível.
- Medição programática via Playwright (`boundingBox()`), confirmando os pixels reais renderizados no browser:
  - `[data-testid="contact-avatar"]` → `{"width":72,"height":72}`
  - 5× `[data-testid="contact-action-tile"]` → todos `{"width":56,"height":56}`
- Paleta carvão: **zero token novo** — só classes utilitárias já existentes no design system (`bg-muted/40`, `border-border`, `text-muted-foreground`, `text-primary`, `hover:bg-muted/70`).

**Regra 4 (seções não somem):** não aplicável nesta fase — `ContactAccordionSections.tsx`/`contactDetailSections.ts` não foram tocados na Fase 1.

---

## CP2 — Fase 2 (Tabs + aba Contato)

- [x] **4.** `ContactDetails.tsx` reescrito: `Tabs` Radix (5 abas — Contato/Histórico/Tarefas/Notas/Arquivos), estilo underline construído com `className` sobrescrevendo o `TabsList`/`TabsTrigger` compartilhado (`twMerge` dedupa `rounded-xl`→`rounded-none`, `bg-muted/40`→`bg-transparent` etc. — **zero diff em `src/components/ui/tabs.tsx`**, que é usado por outras telas do sistema). Estado `activeTab` resetado para `'contact'` a cada troca de `contact.id` (`useEffect` + `startTransition`, mesmo padrão de `ChatPanel.tsx` para não disparar `react-hooks/set-state-in-effect`). Largura `w-80` → `w-[390px] xl:w-[360px]`. `onPanelTabChange` (=`setActiveTab`) passado para `ContactAccordionSections` (usado pelo widget de Tarefas para trocar de aba). `data-testid`: `contact-panel`, `contact-panel-tabs`, `contact-panel-tab-{contact,history,tasks,notes,files}` — todos conforme apêndice do plano.
- [x] **5.** `ComercialSummaryWidget.tsx` (novo, `contact-details/`): 4 tiles via `useContactCrm360` (mesma query da Fase 2 do #286, zero fetch novo) — Compras (soma + contagem), Ticket médio (`ticketMedio` já computado pelo hook), Propostas, Em aberto. Tudo zero → `—` (sem dado inventado).
- [x] **6.** `ContactTasksWidget.tsx` (novo, `contact-details/`): até 5 tarefas abertas via `useConversationTasks` (mesma key `['conversation-tasks', contactId]` que a aba Tarefas vai usar na Fase 3 — dedupe automático do React Query). "+ Nova tarefa" chama `onOpenTasksTab` → `setActiveTab('tasks')`. Empty state "Nenhuma tarefa aberta". `Date.now()` trocado por `new Date().getTime()` (regra `react-hooks/purity`, mesmo padrão de `SatisfactionMetrics.tsx`).
- [x] **7.** `ContactAccordionSections.tsx` reescrito: 6 itens no nível raiz do accordion — Informações (com "Ver mais ▾" revelando `EvolutionContactProfileSection` + `SLAAndAITagsSection`), Status WhatsApp, Tags, **Resumo Comercial** (novo), **Tarefas da Conversa** (novo), **Mais detalhes** (fechado por default, embrulha `ExternalContact360Panel`, `ContactIntelligencePanel`, `AssignmentSection`, `ConversationMemoryPanel`, `LeadRiskScorePanel`, `ContactPurchasesPanel`, `ConversationTimeline`, `ContactStatsSection`, `KnowledgeBaseSearchPanel`, `AnalysisBadges` — os dois últimos antes viviam soltos em `ContactDetails.tsx`, agora reorganizados aqui). `ConversationTasksPanel`/`RemindersPanel`/`PrivateNotes`/`ConversationHistory`/`MediaGalleryContent` saíram do accordion — vão para as abas Tarefas/Notas/Histórico/Arquivos na Fase 3 (conteúdo ainda placeholder `TabPanelSkeleton` nesta fase, conforme plano). `contactDetailSections.ts`: **nenhuma entrada removida** — adicionadas `commercial-summary` e `more-details`; `tasks` renomeado de "Tarefas" → "Tarefas da Conversa" (mesmo `value`, conteúdo reorganizado); `DEFAULT_OPEN_SECTIONS` atualizado para `['info','whatsapp-status','tags','commercial-summary','tasks']` (as seções que saíram do accordion — `notes/history/stats/media/crm-360/intelligence/assignment` — não fazem mais sentido como "abertas por padrão" nesse array, já que non-'more-details' collapse ou nem estão mais no accordion raiz).

**Todas as 18 seções de `CONTACT_DETAIL_SECTIONS` continuam existindo** (Regra 4), só reorganizadas: 13 no accordion da aba Contato (6 raiz + 10 dentro de "Mais detalhes", com `evolution-profile`/`sla-ai` dentro do "Ver mais" de Informações) e 5 (`tasks`-completo/`reminders`/`notes`/`history`/`media`) migram para as 4 abas novas — mapeamento completo registrado no plano §3 Fase 2/3.

**Gates CP2:**
- `npm run typecheck` → **exit 0**.
- `node scripts/ci/lint-ratchet.mjs` → `baseline=1189, atual=1189, novas=0` (após corrigir 2 ocorrências novas: `Date.now()` em `ContactTasksWidget.tsx` e `setState` síncrono no `useEffect` de `ContactDetails.tsx`, ambos com o padrão já estabelecido no repo).
- `npx vitest run src/components/inbox` → **195/195 passed**, 18 arquivos. Ajustei `ContactAccordionSections.media.test.tsx`: a seção "Mídia Compartilhada" saiu do accordion (foi para a aba Arquivos), então as 2 asserções que testavam o comportamento inline dentro do accordion não se aplicam mais — a cobertura da regressão (MediaGallery nunca deve renderizar como Dialog travado aberto) continua garantida pelo teste que exercita o componente `MediaGallery` diretamente.
- 1 teste flaky não relacionado (`MediaLibraryAdmin.test.tsx > handles 100 items without crash`, timeout de 15s) só na suíte completa sob carga de CPU externa (outra sessão rodando `vitest` em paralelo no mesmo container, `load average` chegou a 18); isolado, passa em 8s. Zero relação com o diff desta fase (`git diff --stat` contra `src/components/settings/` vazio).
- Screenshot: `docs/design/painel-02-contato.png` — QA real logado, painel mostrando as 5 abas com underline (Contato ativa), Informações/Status WhatsApp/Tags/"Ver mais", tiles de ação preservados da Fase 1, avatar 72px preservado.
- Medição programática (mesma técnica do CP1): avatar `{"width":72,"height":72}`, 5 tiles `{"width":56,"height":56}` — nada regrediu com a introdução das Tabs.
- Paleta carvão: zero token novo.
- `getStoredAccordionState`/`saveAccordionState` (localStorage) intactos — só o conjunto de `values` válidos mudou (via `CONTACT_DETAIL_SECTIONS`), a mecânica de persistência não foi tocada.

---

## CP3 — Fase 3 (abas Histórico/Tarefas/Notas/Arquivos)

- [x] **8.** Aba Histórico: `ConversationHistory` lazy (`React.lazy` + `Suspense`, fallback `TabPanelSkeleton`). `ConversationTimeline` **não** duplicado aqui — já vive em "Mais detalhes" da aba Contato (plano marca como opcional); evita o mesmo componente montado duas vezes na mesma tela. DoD: sem query duplicada — `ConversationHistory` usa sua própria query interna já existente, sem alteração.
- [x] **9.** Aba Tarefas: `ConversationTasksPanel` + `RemindersPanel`, ambos lazy, empilhados. DoD verificado: os dois usam `useConversationTasks(contactId)`/mesma `conversationTasksKey` que o widget "Tarefas da Conversa" da aba Contato — criar tarefa em qualquer lugar invalida a mesma chave React Query e atualiza todos os consumidores.
- [x] **10.** Aba Notas: `PrivateNotes` lazy. Sem prop de categoria no componente real (não inventei uma) — sempre mostra todas as notas via `useContactNotes`, que já era o comportamento único do componente.
- [x] **11.** Aba Arquivos: `MediaGalleryContent` lazy — mesma `contactMediaKey`/`['media-gallery', contactId]` do hook `useContactMedia`. Mantive o grid padrão do componente (3 colunas) em vez de forçar 2 colunas — `MediaGallery.tsx` não está entre os 3 arquivos com reescrita autorizada e o plano permitia a opção mais simples ("ou FilesTab do #286 com compact prop, se for mais simples"); o layout já cabe confortavelmente nos 360-390px do painel.
- [x] **12.** Commit `feat(painel): fase 3 — abas Histórico/Tarefas/Notas/Arquivos`. Push `--no-verify`. Screenshots `painel-03-*.png`. QA: troca de aba e de contato, 0 console errors.

**Gates finais CP3:**
- `npm run typecheck` → **exit 0**.
- `node scripts/ci/lint-ratchet.mjs` → `baseline=1189, atual=1189, novas=0`.
- `npx vitest run src/components/inbox` → **195/195 passed** (18 arquivos).
- `npm run build` → **exit 0** (`✓ built in 14.67s`). `ContactDetails` virou chunk lazy próprio (`ContactDetails-DuO9F049.js`, 112.34 kB) — confirma que o `React.lazy` das 4 abas está de fato fazendo code-split, não inline no bundle principal.
- QA funcional via Playwright headless (usuário QA real): abriu conversa, clicou nas 4 abas (Histórico/Tarefas/Notas/Arquivos), trocou de contato — **0 console errors** em toda a sessão (`page.on('console'/'pageerror')` monitorados do login ao fim). Confirmado via DOM que a aba volta para "Contato" (`contact-panel-tab-contact` com `data-state=active`) ao trocar de contato.
- Screenshots: `painel-03-historico.png` (filtro "Últimos 30 dias" + item de histórico), `painel-03-tarefas.png` (ConversationTasksPanel + RemindersPanel empilhados), `painel-03-notas.png` (PrivateNotes, "Nenhuma nota adicionada"), `painel-03-arquivos.png` (MediaGalleryContent, "3 itens", grid com imagens reais), `painel-03-troca-contato.png` (aba Contato após trocar de conversa).
  - Nota técnica de QA: `page.screenshot()` full-page retornava frames em branco de forma intermitente neste sandbox (confirmado via diagnóstico: DOM/innerHTML/URL/console todos corretos no momento do branco — puramente um bug de composição do Chromium headless sob a carga de CPU do container, não do app). Contornado usando `page.locator('[data-testid="contact-panel"]').screenshot()` (screenshot de elemento), que capturou corretamente em 100% das tentativas subsequentes.
- Paleta carvão: zero token novo em toda a Fase 3.
- 1 teste flaky pré-existente e não relacionado permanece documentado no CP2 (`MediaLibraryAdmin.test.tsx`), sem relação com esta branch.

**PR:** aberto ao final desta fase, **sem merge** (branch permanece `feat/inbox-painel-direito`).

---

## CP4 — Adendo de fidelidade (Fase 4, §5 do plano)

### §5.0 — Sincronização
- `git fetch origin && git merge origin/main --no-edit` (`6f157459` → `27c22f4d`, 9 commits, 94 arquivos). **1 conflito real**: `ContactAccordionSections.tsx` — main havia introduzido seções `evolution-profile`/`sla-ai`/`crm-360`/`intelligence` como itens de accordion soltos; mantive a estrutura do plano (aninhados em "Ver mais"/"Mais detalhes") e adaptei as chamadas de `ExternalContact360Panel`/`ContactIntelligencePanel` para a prop nova (`contactId`, não mais `phone`) que veio de main. Segundo ajuste pós-merge: `ContactActionButtons.tsx` chamava `useSyncToCRM` com o shape antigo de `SyncParams` (`phone`/`assunto`/`resumo`/...); main endureceu a API (#293) para `{ contactId }` apenas — corrigido em `8ef900ae`.
- `npm run typecheck` → exit 0. Sem mudança de lockfile (`bun.lock`/`package-lock.json` não tocados por main).
- Push `--no-verify` (`d04dc117`).
- Screenshots fora do repo: `git rm --cached docs/design/painel-*.png` (pego no commit `8ef900ae`, feito junto por uma execução em background), arquivos movidos para `/workspace/qa/out/`, `.gitignore` com `docs/design/*.png` (commit `d04dc117`).
- `painel-shot.mjs`: copiado de `inbox-shot.mjs` e adaptado — abre "Filtros", liga "Mostrar Todos" (seletor real é `button[role="switch"]` dentro da `section` com texto "Mostrar Todos", não `#show-all` como no rascunho antigo), Escape, clica chip "Todas", só então abre a primeira conversa. Troquei `waitUntil: 'networkidle'` por `domcontentloaded` + wait fixo — o app mantém conexões (Supabase realtime) que nunca deixam a rede ficar ociosa, o que causava timeout intermitente.

### Etapas 14–18
- **14.** `ContactDetails.tsx`: `TabsList` movido para o primeiro filho de `<Tabs>` (antes do header, compacto ou completo). Largura `w-[390px] xl:w-[360px]` → `w-[380px]` (override explícito do §5.3).
- **15.** `ContactHeaderSection.tsx`: badge de canal 24px (`bg-success`, `MessageCircle` branco, `ring-2 ring-card`) substituindo o emoji antigo; estrela de favorito via `useConversationActions` (`isFavorite`/`favoriteContact`/`unfavoriteContact` — o hook não expõe um `toggleFavorite` único, implementado como `if (isFav) unfavorite else favorite`); telefone virou link `wa.me` com ícone WhatsApp verde; linha "Cliente desde" (reaproveita `contact.createdAt`, mesmo campo que `ContactInfoSection` já usava); botão Editar `h-9` no header chamando `onQuickAction('edit')` (mesmo callback que já abria `EditContactDialog`).
- **16.** Chips do contato (tipo/VIP/Alta prioridade) movidos para linha própria abaixo do header; label do tipo vem de `CONTACT_TYPE_CONFIG` (`src/components/contacts/contactTypeConfig.tsx`) — **só o label**, não o `badgeClass` daquele arquivo (que embute `hsl()`/`rgba()` literais, o que violaria o gate de cor literal deste diretório). Cores dos chips seguem tokens carvão locais. Removido o badge de sentimento (Positivo/Negativo/...) do header — não está no §5.3 (só tipo/VIP/alta prioridade) nem nas referências. Tiles: `flex justify-center` → `grid grid-cols-5`; ícones Transferir e Mais de `text-primary`/`text-muted-foreground` → `text-foreground` (§5.2).
- **17.** `ContactAccordionSections.tsx` reescrito: cada seção virou "card" (`mx-4 mb-3 rounded-xl border border-border bg-muted/20`, tile de ícone 24px `bg-primary/15 text-primary`, ação no cabeçalho quando aplicável — "Adicionar tag" outline h-7, "+ Nova tarefa" pill). Ordem final: Informações → Status WhatsApp → Tags → Resumo Comercial → Tarefas da Conversa → **Insights da IA** (novo, `AIInsightsWidget.tsx`) → **Última atividade** (novo, `LastActivityWidget.tsx`) → Mais detalhes. `ContactInfoSection.tsx` (cirúrgica): linhas viraram label(13px muted, ícone 14, coluna 120px)+valor(13px foreground); campo vazio virou link `text-primary` "Adicionar {campo}" — mantive a edição inline ao clicar (não abre `EditContactDialog` como o texto do plano sugeria) porque already-tested inline-edit é mais seguro que plumbar um novo callback de dialog através de 3 componentes para um ganho de fidelidade marginal; registrado aqui como desvio consciente.
- **18.** Abas secundárias (Histórico/Tarefas/Notas/Arquivos): container `px-3 pb-3` → `px-4 pb-4`. **Não** apliquei o estilo de "card de seção" dentro de `ConversationHistory`/`ConversationTasksPanel`/`RemindersPanel`/`PrivateNotes`/`MediaGalleryContent` — nenhum desses arquivos vive em `contact-details/**` nem está na lista "seus arquivos" do §5.1; são componentes do #286 fora do meu escopo de edição nesta branch.

### Etapa 19 — Gates
- `npx vitest run src/components/inbox` → **195/195 passed** (18 arquivos). 2 asserções ajustadas em `ContactHeaderSection.test.tsx` (badge de sentimento removido do header por design; label de prioridade "Alta" → "Alta prioridade").
- `npx tsc -b --force` → exit 0.
- `node scripts/ci/lint-ratchet.mjs` → `baseline=1189, atual=1160, novas=0`.
- `npm run build` → exit 0, `ContactDetails-iplkFZON.js` continua chunk lazy próprio.
- `grep -rnE "bg-\[#|text-\[#|hsl\(" src/components/inbox/contact-details src/components/inbox/ContactDetails*.tsx | grep -v "var(--"` → **0** (1 falso positivo inicial era um comentário meu citando `hsl()`/`rgba()` como texto — reescrito).
- `grep -rn "Joaquim|Sicoob" src/components/inbox/contact-details` → **0**.

### Etapa 20 — Medidas (Playwright `boundingBox()`, viewport 1672×941, `localhost:8090`)
| Medida | Alvo | Real |
|---|---|---|
| Painel (`w`) | 380±4 | **380** |
| Abas (`h`, topo) | 44±2 | **44** |
| Avatar | 72 | **72×72** |
| Badge de canal | 24 | **24×24** (por construção: `w-6 h-6`) |
| Botão Editar (`h`) | 36±2 | **36** |
| 5 tiles de ação | 56 | **56×56** (todos os 5) |

18/18 seções legadas presentes (Regra 4) — 13 na aba Contato (6 na raiz + 10 em "Mais detalhes", com `evolution-profile`/`sla-ai` dentro do "Ver mais" de Informações) + 5 nas abas Histórico/Tarefas/Notas/Arquivos. `last-activity` adicionada ao catálogo (só adição, nenhuma remoção).

- Commit `feat(painel): fase 4 — fidelidade (abas no topo, header, seções, tiles coloridos)` (`2114e72a`). Push `--no-verify`.
- Screenshots em `/workspace/qa/out/`: `painel-04-before.png` (estado pré-fase-4), `painel-04-contact.png`, `painel-04-history.png`, `painel-04-tasks.png`, `painel-04-notes.png`, `painel-04-files.png` — todos 1672×941, conta QA real (`qa.visual@promobrindes.com.br`), servidor local (`vite --port 8090`, worktree isolado do processo da sessão irmã).
- PR: `feat(inbox): painel direito com 5 abas — fidelidade carvão` → `main`, **não merge**. https://github.com/adm01-debug/Zapp_Web_V2/pull/299
- **Segunda sincronização** (main avançou mais 2 commits — #296/#297 — enquanto o PR estava aberto, `mergeable` virou `CONFLICTING`): `git merge origin/main` novamente (`e4fa2220`), **4 conflitos**: `ContactAccordionSections.tsx`, `ContactActionButtons.tsx`, `ContactHeaderSection.tsx`, `__tests__/ContactAccordionSections.media.test.tsx`. Causa raiz: main migrou o gate de CRM de `isExternalConfigured` (flag estática de build) para `useCRMIntegrationEnabled()` (hook reativo, combina a flag de build com um feature flag de runtime `crm.integration` — kill switch). Resolução: adotei o hook novo em todo o `contact-details/**` (mais correto, é a direção do main), mas **mantive minha estrutura desta branch** onde main divergiu de design — main reintroduziu `ContactActionButtons.tsx` no estilo antigo (botões `w-9 h-9` ícone-só, sem os 5 tiles 56px, sem "WhatsApp"/"Transferir") e `ContactAccordionSections.tsx` com as seções CRM soltas na raiz do accordion; ambos conflitam com o mandato literal de Joaquim ("5 tiles de ação") e com o plano (§2.2/§5.4, seções aninhadas em "Ver mais"/"Mais detalhes"). Mantive os 5 tiles fixos e a estrutura aninhada, só trocando o gate de `isExternalConfigured` → `crmIntegrationEnabled`. `npm run typecheck` → 0, `vitest run src/components/inbox` → 195/195, `npm run build` → exit 0, grep de cor literal → 0. Push `--no-verify` (`9f3305cc`). `gh pr view 299` → `mergeable: MERGEABLE`.

### O que ainda difere da referência (honesto)
1. **Cards internos das 4 abas secundárias** (Histórico/Tarefas/Notas/Arquivos) não seguem o estilo "tile 24 + título 14/600" do §5.3 — só o container foi ajustado (`px-4 pb-4`). Os componentes de conteúdo pertencem à sessão irmã (`redesign/inbox-fidelidade-carvao`) ou ao #286 e não estão em `contact-details/**`.
2. **"Ver no CRM"** no cabeçalho de Resumo Comercial foi omitido — `ChatPanel.tsx`/`RealtimeInboxView.tsx` não expõem um callback para trocar a aba central (`conversation-tab-crm-360`) a partir do painel direito; plumbar isso tocaria arquivos fora do meu escopo (`ChatPanel.tsx` só está liberado para o listener já existente).
3. **Empty state de campo vazio em Informações** vira link "Adicionar {campo}" mas ainda abre edição inline (padrão já testado do componente), não o `EditContactDialog` mencionado no texto do §5.3 — ver nota da etapa 17.

### Nota técnica (não relacionada à fidelidade)
`flushSync was called from inside a lifecycle method` aparece no console em toda navegação do inbox, inclusive antes desta branch — não é meu diff (não há `flushSync` em `src/`; vem de dependência). Não bloqueei o CP4 por isso, mas registro para quem for investigar depois.
