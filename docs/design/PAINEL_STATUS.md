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

_pendente_
