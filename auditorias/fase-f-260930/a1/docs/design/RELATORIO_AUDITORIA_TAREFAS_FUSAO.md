# RELATÓRIO DE AUDITORIA — FUSÃO TAREFAS + LEMBRETES + QUADRO KANBAN | ZAPP WEB V2

> **Data:** 29/09/2026 · **Auditor:** Claude (sessão de revisão) · **Plano auditado:** `docs/design/PLANO_TAREFAS_QUADRO_FUSAO_150_ETAPAS.md` (v1.0)
> **Código auditado:** branch `claude/feat-tarefas-f2-hook-202609281655` @ `79feaa08` (PR #1133, aberta, CI vermelho) + `main` @ `a0002bb2` (PR #1130 mergeada)
> **Banco auditado:** projeto `tnnnlkbymytvtqngbbqh` (produção), leitura via MCP em 29/09
> **Método:** leitura integral do plano (678 linhas) → inventário de arquivos → leitura do conteúdo de cada componente/hook → grep de consumidores → consultas ao banco. Nada aqui é "achismo": cada item cita arquivo e linha ou query.

---

## 1. RESUMO EXECUTIVO (para quem não é dev)

| Fase | O que era | Estado real | % |
|---|---|---|---|
| 0 Preparação | ambiente, decisões G-1…G-8 | ✅ concluída | 100 |
| 1 Banco | migration, RLS, cron, tipos puros | ✅ aplicada em produção e mergeada (PR #1130) | 95 |
| 2 Dados (hook) | `useMyWorkItems`, realtime, mutations | ⚠️ existe, mas sem contato, sem otimista, sem snooze, sem testes | 60 |
| 3 Componentes | card, chips, quick add, sheet, colunas | ⚠️ card/chips ok; **Sheet de edição não existe**; chips sem CSS | 55 |
| 4 Lista | KPIs, filtros, seções | ⚠️ funciona, mas KPIs simplificados, filtros só busca, seção Concluídas nunca aparece | 55 |
| 5 Quadro | 5 colunas, WIP, DnD | ⚠️ DnD ok; **mover para Aguardando é impossível pela UI** | 60 |
| 6 Agenda | 7 dias + lista do dia | ⚠️ básico; sem grupos Alarmes/Prazos, sem quick add no dia | 50 |
| 7 Avisos | toast, central, adiar, badge | ❌ **nada na UI** (só o cron do banco funciona) | 10 |
| 8 Chat | aba única, Notas sem duplicar | ⚠️ aba Lembretes removida; Notas ainda duplica; `/remind` é fake | 70 |
| 9 A11y/mobile | atalhos, aria-live, reduced-motion, mobile | ⚠️ parcial (N/1/2/3, foco no card) | 25 |
| 10 QA | funcional, geometria, cores, isolamento | ❌ não executado | 15 |
| 11 Cutover | remover legado, docs, produção | ⚠️ legado removido; PR não mergeada; produção não verificada | 60 |

**Frase-resumo:** o banco está pronto e correto; o front tem a "casca" dos três modos funcionando, mas faltam as peças que fazem o sistema ser usável no dia a dia — **editar uma tarefa, mover para Aguardando, receber o aviso do alarme com botões de ação, e o badge na sidebar**. Além disso, o CI da PR #1133 está vermelho e há **15 bugs** encontrados nesta auditoria que não estavam no plano.

**Contagem:** das 150 etapas, **62 concluídas**, **41 parciais**, **47 não iniciadas**.

---

## 2. O QUE ESTÁ CERTO (para não refazer)

### 2.1 Banco de dados (produção, verificado por query em 29/09)
- 6 colunas novas em `conversation_tasks` (`remind_at`, `notified_at`, `waiting_reason`, `position`, `started_at`, `status_changed_at`).
- `status` com CHECK dos 6 valores; `waiting_reason` obrigatório em `waiting`; default `backlog`; `created_by NOT NULL`.
- `current_profile_id()` criada; 4 policies `tasks_*_own` por dono (+ admin/supervisor).
- Triggers `trg_task_state_change` (started_at, completed_at, limpa remind_at ao concluir) e `trg_task_set_assignee` (BEFORE INSERT). O trigger legado `trg_prevent_conversation_task_field_forgery` continua e é compatível (só barra mudança de `assigned_to`/`created_by`/`contact_id` cruzado).
- `REPLICA IDENTITY FULL` + tabela na publicação `supabase_realtime`.
- `notify_due_tasks()` + cron `tasks-notify-due` (jobid 16, a cada minuto, **ativo**); cron antigo `notify-due-reminders` removido.
- 1 lembrete migrado → 1 tarefa; **1 notificação `reminder_due` já gerada em produção** (prova de que a cadeia banco→cron→notifications funciona).
- `get_conversation_tab_counts` filtra `tasks_open` por dono; `reminders_pending` = 0.
- 3 registros em `schema_migrations` (`20260928140000/140100/140200`); arquivos SQL em `main` com bloco `ROLLBACK` comentado.

### 2.2 Código puro (testado)
- `workItem.types.ts` (58 linhas), `workItemMachine.ts` (95), `workItemAggregates.ts` (127) — 31 testes verdes.

### 2.3 Front (existe e funciona no básico)
- `useMyWorkItems`: query por dono, realtime, create/update/move/reorder/complete(undo)/reopen/deleteItem(soft-cancel + undo), `useMyWorkItemsBadge`.
- `TasksModule` (3 modos com `AnimatePresence`, atalhos N/1/2/3, estado de erro), `ModeSwitcher` (pill com `layoutId` + reduced-motion), `TasksEmptyState` (3 variantes), `WorkItemCard` (role/aria/tabIndex/foco, kebab, chips, motivo de espera, memo), `PriorityChip`, `DueChip`, `AgingDot`, `WorkItemCardSkeleton`, `TasksListMode` (6 seções colapsáveis), `TasksBoardMode` + `BoardColumn` (5 colunas, DnD, WIP, tooltip de política, quick add no backlog), `TasksAgendaMode` (7 dias, fim de semana, atrasadas).
- Chat: aba Lembretes removida (8 abas), `TasksTab` reescrita sobre `useMyWorkItems`, `Crm360Tab`/`NotesTab` migrados.
- Navegação: `?view=tasks` e `?view=pipeline` → `TasksModule`; label "Quadro".
- Legado removido: `TasksView`, `SalesPipelineView`, `DealCard`, `PipelineKPICards`, `RemindersPanel`, `RemindersTab`, `TaskCard`, `TaskColumn`, `useReminders`, `useConversationTasks` (+ testes deles).
- Guards de CI: `realtime-publication-baseline.json` e `runtime-config.test.sh` já incluem `conversation_tasks`.

---

## 3. BUGS ENCONTRADOS NA AUDITORIA (não previstos no plano)

Ordenados por impacto no usuário. **Todos entram no novo plano.**

| # | Bug | Evidência | Efeito para o usuário | Gravidade |
|---|---|---|---|---|
| **B1** | Classes `chip-btn` e `chip-active` do `QuickAdd` **não existem em nenhum CSS** | `grep -rn chip-btn src/styles src/index.css` = 0 | Chips "Hoje / Amanhã / Próx. semana / Lembrar" aparecem como texto solto, sem borda nem fundo | Alta (visual) |
| **B2** | **Mover para Aguardando é impossível pela UI** | `TasksBoardMode.tsx:47-53` mostra toast de erro e desiste; kebab chama `onMoveTo` sem motivo → `move` rejeita com toast | A coluna "Aguardando" nunca recebe cartão | **Crítica (funcional)** |
| **B3** | **Editar tarefa é impossível** — `WorkItemSheet` não existe | `TasksModule.tsx:23` seta `selectedItem` e nunca o renderiza | Clicar no card não faz nada; não dá para mudar título, descrição, prioridade, prazo, alarme, contato | **Crítica (funcional)** |
| **B4** | Seção "Concluídas" da Lista **nunca aparece** | `TasksModule.tsx:31` só passa `includeDone` no modo board; `byDue.done7d` sempre vazio na Lista | Usuário não vê o que concluiu hoje; undo funciona mas o item some | Alta |
| **B5** | Coluna "Concluído" do Quadro **acumula tudo desde sempre** | `BoardColumn` não filtra `completed_at ≥ now-7d`; sem "ver mais" | Em semanas a coluna fica com centenas de cartões | Média (cresce) |
| **B6** | Badge conta o contrário do plano | `useMyWorkItems.ts:301` usa `.is('notified_at', null)`; etapa 39 pedia `notified_at != null` (avisado e não dispensado) | Badge sobe 1 minuto antes do aviso e some quando o aviso chega (lógica invertida) | Média |
| **B7** | `?view=pipeline` pode abrir em Lista | `TasksModule.tsx:20` lê `localStorage['tasks-mode']` antes de `defaultMode` | Quem clicou em "Quadro" na sidebar vê a Lista se tinha escolhido Lista antes | Média |
| **B8** | Reordenar dentro de "Fazendo" cheio é bloqueado | `BoardColumn.tsx:68` `isDropDisabled={hardFull}` sem exceção para origem = doing | Com 3 em Fazendo, não dá para trocar a ordem deles | Baixa |
| **B9** | Títulos de seção sem acento | `TasksListMode.tsx`: "Amanha", "Proximas", "Concluidas" | Erro de português visível | Baixa (1 min) |
| **B10** | Comando `/remind` do chat é **fake** (pré-existente) | `useChatPanelHandlers.ts:182` só mostra toast "Lembrete Criado" e não grava nada | Usuário acha que criou um lembrete e não criou | Alta (confiança) |
| **B11** | Teste `NotesTab.test.tsx` mocka o shape antigo | `mockReturnValue({ open, createTask })` mas o componente lê `byDue.overdue` | `vitest` do inbox quebra → CI "Unit Tests" vermelho quando chegar lá | Alta (CI) |
| **B12** | `Backspace` apaga tarefa com o card focado | `WorkItemCard.tsx:37` trata `Backspace` igual a `Delete` | Apagar sem querer (há undo, mas é armadilha) | Baixa |
| **B13** | Trocar de modo refaz a consulta ao banco | query key inclui `includeDone`, que muda entre Lista e Quadro | Spinner/skeleton a cada troca; plano exigia 0 requests | Baixa |
| **B14** | CI da PR #1133: step "TypeScript debt ratchet" vermelho | run `36485976242`, step 16; `tsc -b --force` local = 0 erros; log não acessível pela API | PR não pode ser mergeada | **Crítica (bloqueio)** |
| **B15** | `src/integrations/supabase/types.ts` não regenerado | hook usa `type TaskInsert = Record<string, any>` para calar o TS | Erro de nome de coluna passa silencioso até bater no banco | Média (dívida) |

Outros achados menores (vão como etapas): sem `aria-roledescription` nos cartões arrastáveis; `ContactChip` nunca renderiza (hook não traz o contato); `RemindChip` sem popover de adiar; `TasksEmptyState variant="column"` não mostra a política; `max-h-[calc(100vh-280px)]` hardcoded na coluna; `hasMounted` exposto como `ref` na API pública do hook.

---

## 4. AUDITORIA ETAPA POR ETAPA (150 → status real)

Legenda: ✅ feito · ⚠️ parcial · ❌ não feito · ➖ superado (decisão posterior tornou desnecessário)

### FASE 0 — Preparação (1–12)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 1–6 | ✅ | ledger CP0 fechado com SHA `1b85cb43`, gates baseline verdes |
| 7 | ✅ | login QA redefinido 28/09 |
| 8–10 | ✅ | inventário: tasks=0, órfãs=0, reminders=1, deals=0; divergências D1–D6 registradas |
| 11 | ✅ | Playwright ok |
| 12 | ⚠️ | screenshots "antes" não encontradas em `/workspace/qa/out/tasks-00-before.png` |

### FASE 1 — Banco (13–28)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 13–19 | ✅ | 3 migrations aplicadas e registradas (verificado por query em 29/09) |
| 20 | ✅ | bloco `ROLLBACK` presente nos 3 arquivos |
| 21 | ❌ | não houve teste local (sem stack); aplicado direto em produção com 0 linhas — risco aceito |
| 22 | ❌ | `types.ts` **não** regenerado (ver B15) |
| 23–26 | ✅ | 3 arquivos puros + 31 testes |
| 27–28 | ✅ | PR #1130 mergeada em `2845e242` |

### FASE 2 — Dados (29–40)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 29 | ❌ | tipos não regenerados |
| 30 | ⚠️ | `select('*')` sem `contacts(id,name,phone,avatar_url)` → `contactName` nunca chega ao card; `includeDone/includeCancelled` ok |
| 31 | ✅ | realtime por `created_by` |
| 32 | ⚠️ | mutations existem **sem** `onMutate`/rollback otimista; sem `snooze()`; `move` não aceita `toIndex` nem recalcula `position` dos vizinhos |
| 33 | ⚠️ | `canTransition` antes de mover ✅; validação `remind_in_past` ❌ |
| 34 | ✅ | `useMyTasks.ts` = re-export |
| 35–36 | ➖ | adaptadores nunca precisaram existir: hooks legados foram removidos na Fase 11 |
| 37 | ❌ | `useWorkItemNotifications.ts` não existe (openTask/openContact/snooze/complete) |
| 38 | ❌ | `?task=<id>` não é lido em lugar nenhum |
| 39 | ⚠️ | `useMyWorkItemsBadge` existe, lógica invertida (B6) e **sem consumidor** |
| 40 | ❌ | zero testes de `useMyWorkItems` |

### FASE 3 — Componentes base (41–56)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 41 | ✅ | tokens navy reaproveitados (`bg-card`, `border-border/70`, `rounded-[14px]`, `bg-kpi-blue`) |
| 42 | ✅ | `PriorityChip` 4 níveis |
| 43 | ✅ | `DueChip` 4 estados |
| 44 | ⚠️ | `RemindChip` só exibe; **sem popover Adiar (15 min · 1 h · Amanhã 9h · Remover)** |
| 45 | ⚠️ | `ContactChip` sem `getAvatarColor`/`avatar_url`; nunca renderizado (30) |
| 46 | ✅ | `AgingDot` 3 estados |
| 47 | ⚠️ | sem borda esquerda de prioridade (`border-l-[3px]`); `mode="agenda"` não é linha compacta `h-11` |
| 48 | ⚠️ | kebab: Abrir · Mover para · Remover. Faltam **Lembrar-me** (popover) e a distinção **Cancelar / Apagar**; "Mover para" não desabilita `doing` cheio |
| 49 | ⚠️ | `QuickAdd`: Enter/Escape/ref ok; chips só aparecem depois de digitar; faltam **Data** (calendário), **Lembrar** com data+hora livre, **@ Contato**, **! Prioridade**; classes sem CSS (B1); sem erro inline para alarme no passado |
| 50 | ❌ | **`WorkItemSheet` não existe** (B3) |
| 51 | ✅ | `ModeSwitcher` com pill + reduced-motion; persistência em `localStorage` (mas ver B7) |
| 52 | ⚠️ | `variant="column"` mostra "Coluna vazia" em vez da política da coluna |
| 53 | ⚠️ | `BoardColumn`: sticky, contador, tooltip ✅; `isDropDisabled` sem exceção (B8); `ring-destructive/40` quando cheio ❌ |
| 54 | ❌ | `MoveToMenu` não existe (mobile depende do kebab escondido no hover) |
| 55 | ⚠️ | `WorkItemCardSkeleton` ✅ (5 linhas); `BoardColumnSkeleton` ❌ |
| 56 | ❌ | **zero** testes de componente (`src/components/tasks/__tests__/` vazia) |

### FASE 4 — Lista (57–72)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 57 | ⚠️ | `PageHeader variant="plain"` ✅; subtítulo fixo "Suas tarefas pessoais" (plano: "{n} abertas · {m} para hoje") |
| 58 | ⚠️ | `defaultMode` ✅; `?view=pipeline` não força board (B7); `?task=` ignorado |
| 59 | ⚠️ | 5 KPIs ✅ mas cards simples (sem tile 44px, sem ícone, sem `kpi-*`, sem `h-[88px]`) |
| 60 | ✅ | `QuickAdd` + atalho N |
| 61 | ⚠️ | só busca por título, sem debounce; faltam Select prioridade, Select contato, toggle "Com alarme", toggle "Mostrar concluídas", botão "Limpar"; filtro não vale no Quadro/Agenda |
| 62 | ⚠️ | 6 seções ✅; sem acento (B9); "Próximas" sem agrupar por dia; "Sem prazo" não colapsa >10; "Concluídas" nunca aparece (B4) |
| 63 | ⚠️ | undo ✅; sem animação de 200ms ao concluir |
| 64 | ✅ | sem DnD na Lista |
| 65 | ❌ | clique no card → nada (B3); sem `?task=` |
| 66–68 | ✅ | empty states, skeleton, bloco de erro com "Tentar novamente" |
| 69–70 | ✅ | `ViewRouter` |
| 71 | ❌ | testes `TasksListMode`/`TasksModule` inexistentes |
| 72 | ⚠️ | PR #1133 aberta, CI vermelho (B14) |

### FASE 5 — Quadro (73–92)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 73–74 | ✅ | 5 colunas, `snap-x`, `min-w-[232px]` |
| 75 | ⚠️ | `wip_full` ✅ toast; `waiting` → **toast em vez de abrir Sheet pedindo motivo** (B2) |
| 76 | ⚠️ | cabeçalho vermelho ✅; `isDropDisabled` sem `sourceStatus !== 'doing'` (B8) |
| 77 | ✅ | waiting > 5 → âmbar (tooltip genérico) |
| 78 | ❌ | done sem 7 dias / "ver mais antigas" (B5) |
| 79–80 | ✅ | quick add só no backlog; drag no card inteiro; estilo `isDragging` |
| 81 | ❌ | sem `dragHandleUsageInstructions` pt-BR, sem `aria-roledescription`, sem anúncio |
| 82 | ❌ | mobile: sem `MoveToMenu` visível, sem dots, sem setas, drag não desabilitado em `pointer: coarse` |
| 83 | ⚠️ | reorder só dentro da mesma coluna; mover entre colunas não recalcula `position`; item novo não vai ao topo |
| 84 | ✅ | `AgingDot` por `status_changed_at` |
| 85 | ⚠️ | KPIs e QuickAdd compartilhados ✅; **busca não filtra o Quadro** |
| 86–87 | ✅ | rota e label "Quadro" |
| 88 | ❌ | `layout: 'full'` da rota pipeline não verificado (gutter) |
| 89 | ⚠️ | fade 120ms ✅; refetch na troca (B13) |
| 90 | ⚠️ | skeleton 2 cards/coluna; erro ✅; coluna vazia sem política |
| 91 | ❌ | testes `TasksBoardMode` inexistentes |
| 92 | ⚠️ | PR aberta; screenshots 1672/1280/mobile não existem |

### FASE 6 — Agenda (93–100)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 93 | ⚠️ | faixa 7 dias ✅; ponto do dia só `bg-primary` (sem cor por prazo/alarme/atrasada) |
| 94 | ❌ | lista do dia é plana; faltam grupos **Alarmes / Prazos / Sem hora** com hora à esquerda; card não é compacto |
| 95 | ⚠️ | atrasadas visíveis ✅; não expansível |
| 96 | ✅ | sem DnD |
| 97 | ❌ | sem `QuickAdd` com o dia pré-selecionado |
| 98 | ➖ | plano se contradiz (93 = "hoje → +6"; 98 = "começa na segunda"). Código segue 93. **Decisão registrada: manter hoje → +6.** |
| 99 | ❌ | testes inexistentes |
| 100 | ⚠️ | PR aberta; screenshot inexistente |

### FASE 7 — Avisos (101–112) — a fase mais atrasada
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 101 | ✅ | cron ativo (jobid 16); 1 notificação `reminder_due` em produção |
| 102 | ⚠️ | descoberto: `useNotifications` é consumido por `Sidebar.tsx`; não há `NotificationCenter` dedicado — a lista é um popover na Sidebar |
| 103 | ❌ | nenhum `case 'reminder_due'` com botões Abrir / Adiar ▾ / Concluir |
| 104 | ❌ | sem `toast.custom` com 3 ações no realtime |
| 105 | ❌ | push (G-7) não avaliado; existe `usePushNotifications.ts` e `PushNotificationToggle.tsx` a inspecionar |
| 106 | ❌ | badge da sidebar em "Tarefas" não ligado (`useMyWorkItemsBadge` sem consumidor) |
| 107 | ❌ | `document.title` "(n) " não implementado; existe `useDocumentTitle.ts` para integrar |
| 108 | ❌ | "Avisado em {notified_at}" — depende do Sheet |
| 109 | ✅ | trigger limpa `remind_at` ao concluir/cancelar; front também limpa no `move` |
| 110 | ❌ | idempotência/adiar não testável (sem snooze) |
| 111–112 | ❌ | testes e PR |

### FASE 8 — Chat (113–124)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 113 | ⚠️ | `TasksTab` reescrita com `QuickAdd` + `WorkItemCard`; lista plana (plano: mini-quadro por status Fazendo/A fazer/Aguardando/Caixa) |
| 114–115 | ✅ | 8 abas; sem import morto |
| 116 | ❌ | mapeamento `reminders → tasks` para aba persistida não verificado |
| 117 | ⚠️ | `NotesTab` migrou para `useMyWorkItems` mas **mantém a lista duplicada** (`openTasks.map`); plano pedia resumo + "Ver na aba Tarefas" |
| 118 | ❌ | `/remind` continua fake (B10) |
| 119 | ✅ | `contact-details` sem menção a lembrete (grep = 0) |
| 120 | ➖ | `RemindersPanel`/`RemindersTab` já removidos |
| 121 | ✅ | `tasksOpen` por dono na RPC |
| 122 | ❌ | atalho `Ctrl+Shift+T`/`Alt+T` no chat |
| 123 | ⚠️ | `TasksTab.test` (3) ✅; `NotesTab.test` quebrado (B11); `ConversationTabs.test` não verificado |
| 124 | ⚠️ | PR aberta |

### FASE 9 — Acessibilidade/mobile (125–134)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 125 | ⚠️ | N/1/2/3 no `TasksModule` (listener local, não no `useKeyboardShortcuts`); faltam `E`, `X`, `Delete` globais, `/`, `?` |
| 126 | ✅ | `tabIndex`, ring, Enter/X/Del no card |
| 127 | ❌ | `aria-live` |
| 128 | ❌ | contraste não auditado |
| 129 | ⚠️ | `useReducedMotion` só no `ModeSwitcher`; falta no `AnimatePresence` do módulo, na Lista e regra CSS para `[data-rbd-draggable-id]` |
| 130 | ❌ | mobile não validado; Sheet bottom (sem Sheet) |
| 131 | ❌ | Zen |
| 132 | ❌ | tema claro |
| 133 | ⚠️ | `React.memo` no card ✅, `useMemo` nos buckets ✅; bundle não medido |
| 134 | ❌ | commit/PR |

### FASE 10 — QA (135–142)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 135 | ⚠️ | local: typecheck 0, lint-ratchet ok, vitest tasks 31/31; **CI vermelho** (B14) |
| 136 | ❌ | E.5 (24 checks) não rodado |
| 137 | ❌ | E.2 geometria |
| 138 | ❌ | E.3 cores |
| 139 | ❌ | isolamento entre 2 usuários (RLS) |
| 140 | ⚠️ | 1 reminder migrado, `migrated_task_id` preenchido; amostra não aberta na UI |
| 141 | ❌ | contrato da seção 5 não conferido item a item |
| 142 | ⚠️ | resíduos no ledger, incompletos |

### FASE 11 — Cutover (143–150)
| Etapa | Status | Evidência / o que falta |
|---|---|---|
| 143 | ➖ | pré-condição de 2 dias úteis dispensada por ordem do Joaquim em 28/09 |
| 144–146 | ✅ | 12 arquivos legados removidos; `lazyViews.ts` limpo |
| 147 | ❌ | `remindersPending` ainda no tipo `ConversationTabCounts`; migration de drop não criada |
| 148 | ❌ | `docs/COMPLETE_SYSTEM_FEATURES.md` / `FUNCTIONALITIES_INVENTORY.md` não atualizados |
| 149 | ⚠️ | PR #1133 aberta, CI vermelho |
| 150 | ❌ | produção não verificada (não deployou) |

---

## 5. CONTRATO DE FUNCIONALIDADES PRESERVADAS (seção 5 do plano) — situação

| Funcionalidade | Situação |
|---|---|
| Criar tarefa (com e sem contato) | ✅ (contato só pelo chat; sem `@` no QuickAdd) |
| Concluir / reabrir | ✅ |
| Apagar (com undo) | ✅ (soft-cancel) |
| **Editar título/descrição/prioridade/prazo** | ❌ **B3** |
| Buscar por título | ✅ (só na Lista) |
| Atrasadas / Hoje / Próximas / Concluídas 7d | ⚠️ Concluídas nunca aparece (B4) |
| KPIs | ✅ (visual simplificado) |
| Criar alarme por contato (ex-lembrete) | ✅ (só "amanhã 9h"; sem hora livre) |
| Listar alarmes pendentes | ⚠️ só via chip no card |
| Dispensar / adiar alarme | ❌ (sem snooze) |
| Aviso na hora do alarme | ⚠️ notificação criada no banco; **nada visível na UI** |
| Aba Tarefas do chat | ✅ |
| Contagem da aba | ✅ |
| Atalhos Alt+K / Alt+P | ✅ (mantidos na navegação) |

---

## 6. DECISÕES REGISTRADAS NESTA AUDITORIA
- **D7** — Agenda: manter "hoje → +6" (etapa 93) e ignorar "começa na segunda" (etapa 98); contradição do plano resolvida a favor do uso diário.
- **D8** — "Apagar" = cancelar (soft) com undo; não haverá hard-delete na v1. O kebab passa a ter "Cancelar" (soft, some das vistas) e "Apagar" some como opção separada. Dado nunca é destruído.
- **D9** — `useConversationTasks`/`useReminders`: removidos em vez de virarem adaptadores (etapas 35–36 superadas).
- **D10** — Notificações: não existe "NotificationCenter"; o ponto de render é o popover de notificações da `Sidebar`. As 3 ações entram lá e no toast.

---

## 7. RISCOS ABERTOS (ordem de gravidade)
1. **PR #1133 com CI vermelho** por causa não identificada no typecheck-ratchet (B14). Enquanto não fechar, nada do front vai para produção; o banco já está migrado e o front em produção **ainda usa o código antigo** (que lê `status='pending'` — hoje inexistente). **Produção pode estar quebrada na tela Tarefas agora.** Verificar imediatamente (etapa 1 do novo plano).
2. Sem Sheet e sem "Aguardando", o Quadro entrega 3 de 5 colunas úteis.
3. Sem UI de aviso, o alarme "toca" só no banco — usuário não vê nada além do sino genérico (se a Sidebar renderizar tipos desconhecidos).
4. `types.ts` desatualizado + `Record<string, any>`: erro de coluna só aparece em produção.
5. Zero testes de componente: qualquer ajuste de layout pode regredir sem aviso.

---

## 8. PRÓXIMO PASSO
Executar `docs/design/PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md` (criado junto com este relatório).
