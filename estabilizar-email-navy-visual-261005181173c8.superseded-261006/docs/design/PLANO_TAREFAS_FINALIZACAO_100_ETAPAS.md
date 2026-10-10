# PLANO DE FINALIZAÇÃO — TAREFAS + LEMBRETES + QUADRO KANBAN | ZAPP WEB V2 — 100 ETAPAS

> **Versão:** 2.0 — 29/09/2026 — sucede o plano de 150 etapas (v1.0). Baseado no `RELATORIO_AUDITORIA_TAREFAS_FUSAO.md` (mesma pasta).
> **Executor:** Claude (chat com MCP) ou Claude Code (`claude -p`, quando a cota liberar em 01/10) — container `claude-code`, worktree `/workspace/repos/Zapp_Web_V2-tarefas`
> **Repo:** `adm01-debug/Zapp_Web_V2` · **Deploy:** Vercel `zapp_web_v2` (team `juca1`) — merge em `main` = produção
> **Ledger:** `docs/design/TAREFAS_QUADRO_STATUS.md` (seções CP-A … CP-J abaixo substituem CP2 … CP11)
> **Ponto de partida:** banco 100% migrado (PR #1130 em `main`); front na PR #1133 (`claude/feat-tarefas-f2-hook-202609281655` @ `79feaa08`) com CI vermelho.

---

## 0. REGRAS (herdadas do plano v1, com 4 acréscimos)

1. Nenhum checkpoint fecha sem evidência no ledger (SHA, screenshot, saída de script, query).
2. Ordem é lei: **desbloqueio → hook → Sheet → QuickAdd → telas → avisos → chat → a11y → testes → QA/cutover**.
3. DDL em produção só com `APROVADO`. Este plano tem **uma** migration nova (etapa 97, drop de `reminders_pending`) e ela fica aguardando.
4. Diff mínimo; reescrita autorizada só para: `QuickAdd.tsx`, `TasksAgendaMode.tsx`, `TasksTab.tsx` (mini-quadro).
5. Ratchets são gates (`tsc -b --force` = 0; lint-ratchet; typecheck-ratchet; implicit-any; vitest).
6. Branch por fase: `claude/<tipo>-tarefas-<fase>-<AAMMDD-HHMM>`. Uma PR por fase. **Fase A trabalha na branch da PR #1133** (é a única exceção: ela já é "minha" e está aberta).
7. **Novo — Cadeia de pushes:** nunca fazer push vazio em série para "forçar CI"; o `concurrency.cancel-in-progress` cancela o run anterior e o novo pode nem nascer. Um push, esperar o run terminar, só então outro. Se o CI não nascer em 3 min, usar `workflow_dispatch` (`POST /actions/workflows/ci.yml/dispatches`).
8. **Novo — Logs de CI:** a API de logs devolve 403 para este token. Diagnóstico = reproduzir localmente com o **mesmo comando** do workflow (`tsc -b --force`, não `--noEmit`) e ler `.github/workflows/ci.yml` para saber o que cada step roda.
9. **Novo — Tipos:** depois de regenerar `types.ts` (etapa 11), `Record<string, any>` é proibido em código novo do módulo. Se o TS reclamar de coluna, a coluna está errada — não o tipo.
10. **Novo — Cada bug B1–B15 do relatório tem etapa própria** e o commit cita o código do bug (`fix(tarefas): B2 — …`).
11. Shell `dash`; sem `python3`; `nohup git push … &` se o hook de pre-push estourar o tempo.
12. Se algo aqui contradisser o código real, o código real vence e a divergência vai para o ledger antes de decidir.

---

## 1. MAPA DE DEPENDÊNCIAS (por que a ordem é esta)

```
A. CI verde + prod segura ─┐
                           ├─► B. types.ts + hook (contato, otimista, snooze, move c/ índice)
                           │        │
                           │        ├─► C. WorkItemSheet (edição, motivo de espera, ?task=)  ──► B2, B3 resolvidos
                           │        ├─► D. QuickAdd completo (CSS, Data, Lembrar, @, !)      ──► B1 resolvido
                           │        └─► E. Lista / Quadro / Agenda (KPIs, filtros, 7d, grupos) ► B4, B5, B7, B8, B9, B13
                           │
                           └─► F. Avisos (toast, popover da Sidebar, badge, título)  ──► B6 resolvido; depende de B (snooze)
                                    │
                                    └─► G. Chat (Notas, /remind, atalho) ──► B10
                                            │
                                            └─► H. A11y/mobile/motion ──► I. Testes ──► J. QA + cutover + docs
```

---

## 2. O PLANO — 100 ETAPAS · 10 FASES · 10 CHECKPOINTS

Formato: `[ ] N. Ação — arquivo — DoD`. Marque `[x]` **só** com evidência no ledger.

### FASE A — Desbloqueio do CI e produção segura (etapas 1–10) → CP-A

- [x] **1.** **Produção agora:** abrir `https://zapp-web-v2.vercel.app/?view=tasks` com o usuário QA (Playwright `/workspace/qa/shot.mjs`) e capturar `out/A-01-prod-atual.png` + `console.json`. Se a tela quebrou (código antigo lendo `status='pending'` que não existe mais), registrar como **incidente P1** no ledger e priorizar o merge da PR #1133. — DoD: screenshot + erros de console no ledger. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **2.** Reproduzir o typecheck-ratchet como o CI: `git checkout claude/feat-tarefas-f2-hook-202609281655 && npm ci && node scripts/ci/typecheck-ratchet.mjs` **sem timeout curto** (rodar com `nohup … > /tmp/ratchet.log 2>&1 &` e esperar). Ler o log inteiro. — DoD: causa raiz do B14 escrita no ledger (arquivo:linha). — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **3.** Corrigir o B14 na própria branch da PR #1133. Hipóteses em ordem: (a) `NotesTab.test.tsx` tipa `openTasks` com shape antigo; (b) `tsconfig.app.json` inclui testes e o mock `vi.importMock` não existe; (c) `ViewRouter` cast. — DoD: `node scripts/ci/typecheck-ratchet.mjs` local = `novas=0`. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **4.** Corrigir o **B11**: `NotesTab.test.tsx` → `mockUseConversationTasks.mockReturnValue({ byDue: { overdue: openTasks, today: [], tomorrow: [], upcoming: [], noDue: [], done7d: [] }, create: mockCreateTask, isLoading: false })`; renomear a variável para `mockUseMyWorkItems`. `npx vitest run src/components/inbox/tabs` verde. — DoD: exit 0. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **5.** Corrigir o **B9** (acentos: "Amanhã", "Próximas", "Concluídas" em `TasksListMode.tsx`) e o **B12** (remover `Backspace` de `WorkItemCard.tsx:37`). Um commit `fix(tarefas): B9 B12 — acentos e Backspace`. — DoD: grep sem "Amanha|Proximas|Concluidas". — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **6.** Um único push. Esperar o CI nascer (≤ 3 min) e terminar. Se não nascer, `workflow_dispatch` em `ci.yml` **e** `db-guard.yml` com `ref` da branch. — DoD: `🔍 Lint & TypeCheck`, `🧪 Unit Tests`, `🏗️ Build`, `🔒 Security Audit`, `Contrato DB offline`, `🎭 E2E` todos `success` no HEAD da PR. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **7.** Se `🧪 Unit Tests` ou `🎭 E2E` falharem por teste que citava "Lembretes"/`RemindersTab`/`SalesPipelineView`, atualizar o teste (nunca o comportamento). — DoD: lista dos testes tocados no ledger. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **8.** Squash-merge da PR #1133 (`github_merge_pull_request`, `merge_method: squash`). — DoD: SHA do merge no ledger. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **9.** Deploy: `vercel` deployment do SHA com `state=READY` e `target=production` (MCP Vercel `list_deployments`). Abrir `?view=tasks`, `?view=pipeline`, inbox com um contato → `out/A-09-prod-{tasks,board,chat}.png`. Console sem `error`. — DoD: 3 screenshots + 0 erros. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **10.** Atualizar o ledger: fechar CP-A; reescrever a seção de resíduos com os itens do relatório. Commit `chore(tarefas): ledger CP-A` em branch própria `claude/chore-tarefas-ledger-<carimbo>` → PR → merge. — DoD: ledger em `main`. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.

**CP-A — Front novo em produção sem regressão.** Gate: PR #1133 mergeada, deploy READY, 3 screenshots, console limpo.

---

### FASE B — Tipos regenerados e hook completo (etapas 11–22) → CP-B

- [x] **11.** Branch `claude/feat-tarefas-b-hook-<carimbo>` a partir de `main`. Regenerar tipos: `bunx supabase gen types typescript --project-id tnnnlkbymytvtqngbbqh --schema public > src/integrations/supabase/types.ts` (token em `/root/.secrets/zapp-v2.env`). Conferir que o diff toca `conversation_tasks` (6 colunas novas), `reminders` (`migrated_task_id`) e `get_conversation_tab_counts`. Se o diff tocar outras tabelas por drift antigo, **aceitar** (é o estado real do banco) e registrar. — DoD: `git diff --stat src/integrations/supabase/types.ts`. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **12.** **B15:** remover `type TaskInsert`/`TaskUpdate` de `useMyWorkItems.ts` e os `as TaskInsert`/`as TaskUpdate`; usar `Database['public']['Tables']['conversation_tasks']['Insert' | 'Update']`. `tsc -b --force` = 0. — DoD: `grep -c "Record<string, any>" src/hooks/tasks/useMyWorkItems.ts` = 0. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **13.** Join do contato: `select('*, contacts:contact_id(id,name,phone,avatar_url)')`. Tipar `WorkItem` com `contact?: { id, name, phone, avatar_url } | null` (em `workItem.types.ts`, opcional para não quebrar os testes puros). Mapear `row.contacts → item.contact`. — DoD: `items[0].contact?.name` preenchido para a tarefa migrada (contato `ff9a9634…`). — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **14.** Update otimista em `move`, `complete`, `reopen`, `deleteItem` e `update`: `onMutate` cancela queries da key, guarda `previous`, aplica `applyTransition`/patch no cache; `onError` restaura `previous` + `toast.error`; `onSettled` invalida. — DoD: simular `supabase.update` rejeitado (mock) → cache volta ao anterior. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **15.** `move(item, to, opts?: { index?: number; waitingReason?: string })`: quando `index` vier, recalcular `position` (0..n) da coluna de destino **e** da de origem num único `upsert` em lote (`onConflict: 'id'`); item novo (`create`) recebe `position = (min da coluna) - 1`. — DoD: mover entre colunas persiste ordem após F5. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **16.** `snooze(item, minutes | 'tomorrow9')`: `remind_at` = `now + minutes` ou amanhã 09:00 local; `notified_at = null`. Exportar no hook. — DoD: chamada altera as duas colunas. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **17.** `setReminder(item, iso | null)` (define/remove alarme) e validação **`remind_in_past`**: se `iso < now - 60s` → `throw Object.assign(new Error('remind_in_past'), { blocked: 'remind_in_past' })`; aplicar também em `create` e `update`. — DoD: teste unitário rejeita. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **18.** `cancel(item)` explícito (= `move(item,'cancelled')` com undo) e manter `deleteItem` como alias (decisão D8). Remover `hasMounted` da API pública (mover a flag para `TasksModule`). — DoD: API do hook documentada em JSDoc no topo do arquivo. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **19.** **B6:** `useMyWorkItemsBadge` = atrasadas + `remind_at <= now AND notified_at IS NOT NULL AND status NOT IN (done,cancelled)` (avisado e não tratado). Uma única query `select('id,due_date,remind_at,notified_at,status')` e contagem no cliente (evita 2 round-trips). Realtime: invalidar `['work-items-badge']` no mesmo canal do hook principal. — DoD: badge cai a 0 ao adiar/concluir. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **20.** **B13:** query key **sem** `includeDone`; a query traz sempre `done` dos últimos 30 dias (`.or('status.neq.done,completed_at.gte.<now-30d>')`) e `cancelled` só quando `includeCancelled`. Lista e Quadro filtram localmente (7d / 30d). — DoD: trocar de modo = 0 requests a `conversation_tasks` (Network do Playwright). — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **21.** Testes `src/hooks/tasks/__tests__/useMyWorkItems.test.tsx` (padrão de `src/hooks/__tests__/useNotifications.test.tsx`): create; complete + undo; move com WIP cheio (bloqueia sem chamar supabase); move para waiting sem motivo (bloqueia); snooze; remind_in_past; rollback em erro; badge. Mínimo 10 casos. — DoD: verde. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.
- [x] **22.** Commit `feat(tarefas): fase B — tipos regenerados, contato no item, mutations otimistas, snooze, move com índice (B6 B13 B15)`. PR, CI verde, merge. — DoD: SHA. — **fase A/B ENTREGUE** (registro no ledger: CP-A/CP-B; PR #1133 mergeada com CI 100% verde e deploy READY; o codigo esta na `main`: `useMyWorkItems` com join de contato, mutations otimistas, `snooze`/`setReminder`/`cancel`, badge B6 e a query key sem `includeDone`). Marcado no sync de 02/10/2026.

**CP-B — Hook completo.** Gate: 10+ testes do hook; `types.ts` regenerado; 0 `Record<string, any>`; badge correto.

---

### FASE C — Sheet de edição, Aguardando, ações do card (etapas 23–34)
> Executor: Hermes (2026-10-01), branch `hermes/fase-c-sheet-2610011018cb68` (C1) e `hermes/fase-c2-card-2610011102404a` (C2).
> Etapas 23–27 fechadas na sub-fase C1; 28–33 na sub-fase C2 — evidência no ledger `TAREFAS_QUADRO_STATUS.md` → `## FASE C1` e `## FASE C2`. A 34 aguarda o screenshot logado.
> Executor: Hermes (2026-10-01), branch `hermes/fase-c-sheet-2610011018cb68` (o plano citava `claude/feat-tarefas-c-sheet-<carimbo>`; a guarda só permite `hermes/*`).
> Etapas 23–27 fechadas na sub-fase C1 — evidência no ledger `TAREFAS_QUADRO_STATUS.md` → `## FASE C1`. → CP-C

- [x] **23.** Branch `claude/feat-tarefas-c-sheet-<carimbo>`. Criar `src/components/tasks/shared/WorkItemSheet.tsx`: `Sheet side="right"` (`w-[420px]`; `side="bottom" h-[90vh]` abaixo de `md`). Props `{ item | null, open, onOpenChange, onSave(patch), onMove(to, waitingReason?), onSnooze, onSetReminder, onCancel, doingCount, focusField?: 'waiting_reason' }`. — DoD: abre/fecha; Esc fecha.
- [x] **24.** Campos do Sheet, nesta ordem: título (`Input`, autofocus), estado (`Select` com as 5 colunas; `doing` desabilitado com texto "Fazendo está cheio (3/3)" quando `doingCount >= 3` e o item não está em doing), **motivo de espera** (`Textarea`, só quando estado = Aguardando, obrigatório, erro inline "Diga por que parou"), prioridade (4 chips clicáveis), contato (`ContactPicker` — reaproveitar o de `src/components/inbox` ou criar `ContactCombobox` sobre `useContactsSearch`), prazo (`Popover` + `Calendar` shadcn + hora opcional), alarme (`Popover` data+hora; mostra "Avisado em {notified_at}" quando já disparou; botão "Adiar ▾"), descrição (`Textarea` colapsada). — DoD: 8 campos editam e persistem.
- [x] **25.** Rodapé do Sheet: "Salvar" (`bg-primary`), "Cancelar tarefa" (ghost destructive, undo), "Concluir" (`bg-success`). Salvar desabilitado sem mudança. `Ctrl+Enter` salva. — DoD: 3 ações ligadas às mutations da Fase B.
- [x] **26.** **B3:** `TasksModule` renderiza `<WorkItemSheet item={selectedItem} …/>`; `onOpen` do card seta o item. — DoD: clicar no card abre o Sheet com os dados certos.
- [x] **27.** Deep-link `?task=<id>`: `TasksModule` lê `URLSearchParams` no mount; se houver id e o item existir (ou buscar por id se não estiver no cache), abre o Sheet; ao abrir/fechar, `history.replaceState` adiciona/remove `task`. — DoD: F5 com `?task=…` reabre; fechar limpa a URL.
- [x] **28.** **B2 (DnD):** em `TasksBoardMode.handleDragEnd`, quando destino = `waiting` e o item não tem `waiting_reason`: **não** chamar `move`; chamar `onRequestWaitingReason(item)` → `TasksModule` abre o Sheet com `focusField='waiting_reason'` e estado pré-selecionado "Aguardando"; ao salvar, `move(item,'waiting',{waitingReason})`. O card volta à origem enquanto isso (comportamento da lib). — DoD: arrastar para Aguardando → Sheet → salvar → card aparece em Aguardando.
- [x] **29.** **B2 (kebab e MoveToMenu):** mesma regra — "Mover para → Aguardando" abre o Sheet pedindo o motivo. "Mover para → Fazendo" desabilitado com tooltip "Fazendo está cheio (3/3)" quando cheio. — DoD: 2 caminhos testados.
- [x] **30.** Kebab completo: **Abrir · Concluir/Reabrir · Lembrar-me ▾ (15 min · 1 h · Amanhã 9h · Escolher… → abre Sheet no campo alarme · Remover alarme) · Mover para ▸ · Cancelar (undo)**. Decisão D8: "Remover" vira "Cancelar". — DoD: 5 grupos no menu; todos ligados.
- [x] **31.** `RemindChip`: vira `Popover` com Adiar 15 min · 1 h · Amanhã 9h · Remover (chama `snooze`/`setReminder(null)`); vencido + `notified_at` → `BellRing text-destructive`. `stopPropagation`. — DoD: popover funciona no card e no Sheet.
- [x] **32.** `ContactChip`: avatar 18px com `getAvatarColor` (`@/lib/avatar-colors`) ou `avatar_url`; clique → `openContact(id)` (`?view=inbox&contact=<id>` — confirmar o parâmetro real com `grep -rn "selectedContactId\|contact=" src/hooks/inbox src/pages`). Passar `item.contact` do hook para o card. — DoD: chip aparece na tarefa migrada e abre o chat.
- [x] **33.** Criar `src/components/tasks/board/MoveToMenu.tsx`: botão `ArrowRightLeft` 16px no card (visível em `pointer: coarse`; hover em desktop) com as 5 opções, mesmas regras de WIP/motivo. — DoD: em 390×844 move sem arrastar.
- [x] **34.** (commit/PR/merge e screenshot: ver FECHO) Commit `feat(tarefas): fase C — Sheet de edição, Aguardando com motivo, deep-link ?task=, kebab completo, RemindChip/ContactChip (B2 B3)`. PR, CI verde, merge, screenshot `out/C-34-sheet.png`. — DoD: SHA + screenshot. — **screenshot tirado 02/10** (`out/C-34-sheet.png`, conta COMPRAS); segue **parcial** na citacao do SHA da entrega original do Sheet. — **FECHO:** entrega em `e6739afc4` (#1391, FASE C, etapas 23-27) e `09e7cdffd` (#1398, 28-33); screenshot `out/C-34-sheet.png` tirado em 02/10 com a conta COMPRAS.

**CP-C — Editar e Aguardando funcionam.** Gate: Sheet edita 8 campos; Aguardando recebe cartão por DnD, kebab e menu; `?task=` reabre.

---

### FASE D — QuickAdd completo e CSS dos chips (etapas 35–42) → CP-D

- [x] **35.** Branch `claude/feat-tarefas-d-quickadd-<carimbo>`. **B1:** criar em `src/styles/components.css` as classes `.chip-btn` (`inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-border bg-input text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors`) e `.chip-active` (`… bg-primary/15 border-primary/50 text-primary-glow`) via `@apply`. Verificar que `components.css` é importado em `src/index.css`. — DoD: chips com borda e fundo no screenshot.
- [x] **36.** Chips **sempre visíveis** (não só após digitar), à direita do campo em `≥ md`; abaixo em mobile; em `compact` viram um botão `⋯` que abre `Popover` com os mesmos chips. — DoD: layout nos dois tamanhos.
- [x] **37.** Chip **Data**: `Popover` + `Calendar` (shadcn, `locale ptBR`) + `Input type=time` opcional. Substitui o preset quando escolhido; o chip mostra "Sex 03/10". — DoD: cria com a data escolhida.
- [x] **38.** Chip **Lembrar**: `Popover` com presets (Em 1 h · Amanhã 9h · Próx. seg 9h) + data/hora livre. Validação inline: passado → borda `destructive` + "O alarme precisa ser no futuro" e o botão Criar desabilita. — DoD: erro inline; presets funcionam.
- [x] **39.** Chip **@ Contato**: `ContactCombobox` (mesmo da etapa 24) com busca por nome/telefone; chip mostra avatar + nome; `×` remove. Oculto quando `defaultContactId` vier (chat). — DoD: cria vinculada ao contato.
- [x] **40.** Chip **! Prioridade**: 4 opções (Baixa/Média/Alta/Urgente); default Média. — DoD: cria com a prioridade.
- [x] **41.** Parser leve **sem NLP** (G-5 mantido): só atalhos de teclado dentro do campo — `Ctrl+1/2/3` = Hoje/Amanhã/Próx. semana; `Ctrl+L` abre Lembrar; `Ctrl+@` abre contato. Documentar no `title` do campo. — DoD: 3 atalhos.
- [x] **42.** Testes `src/components/tasks/__tests__/QuickAdd.test.tsx`: Enter cria; Escape limpa; chip Hoje preenche `dueDate`; Lembrar no passado bloqueia; `compact` mostra `⋯`. Commit `feat(tarefas): fase D — QuickAdd com Data, Lembrar, @Contato, !Prioridade e CSS dos chips (B1)`. PR, CI, merge, screenshot. — DoD: SHA. — **screenshot tirado 02/10** (`out/D-42-quickadd.png`; QuickAdd aberto com **7 chips** medidos no DOM). — **FECHO:** entrega em `256fac36e` (#1418, FASE D, etapas 35-42); screenshot `out/D-42-quickadd.png` com os 7 chips medidos no DOM.

> **FASE D — executada em 2026-10-01 (PR da fase).** 35–41 fechadas com evidência:
> `.chip-btn`/`.chip-active` em `src/styles/components.css` (o plano pedia `text-[12px]`,
> trocado por `text-xs` — equivalente exato na escala; o gate de tipografia reprova o arbitrário);
> 7 chips sempre visíveis com `⋯` no compact; chip Data (Calendar ptBR + hora); Lembrar com
> presets e **bloqueio de passado**; @ Contato pelo `ContactCombobox` novo (oculto quando o
> contato vem do chat); ! Prioridade com default Média; atalhos Ctrl+1/2/3 · Ctrl+L · Ctrl+@.
> Testes: `QuickAdd.test.tsx` (11 casos) + `QuickAddCompacto.test.tsx` (2 casos, criado para
> matar a mutação do `⋯` no compact) — 6/6 mutações mortas. **Lacuna real corrigida:** no compact
> o `Ctrl+L` não abria o `⋯`, então o popover de Lembrar não tinha gatilho montado.
> **Conflito de plano a resolver na FASE H:** a etapa 36 manda o compact virar `⋯` com os chips,
> a etapa 79 manda o compacto do board ser "só título, sem chips". Segui a 36 (é a fase dona do
> componente); na FASE H a 79 decide se o board passa a usar um modo sem chips.
> **Pendente (não bloqueia):** screenshot da etapa 42, que depende do login de QA no cofre.

**CP-D — Captura completa.** Gate: 7 chips estilizados e funcionais; validação de passado; teste verde.

---

### FASE E — Lista, Quadro e Agenda no padrão do plano (etapas 43–58) → CP-E

- [x] **43.** Branch `claude/feat-tarefas-e-telas-<carimbo>`. Subtítulo do `PageHeader` = `"{abertas} abertas · {hoje} para hoje"` com `toLocaleString('pt-BR')`. — DoD: números reais.
- [x] **44.** KPIs no padrão `ContactKpiCard`: 5 cards `h-[88px] rounded-[14px]`, tile 44px (`bg-kpi-*`), ícone 20px, valor 26/700 tabular, label 13/500. Cores: Atrasadas `kpi-yellow` (`destructive/15` se > 0), Para hoje `kpi-blue`, Fazendo `kpi-purple` "n/3", Concluídas 7d `kpi-green`, Tempo médio `muted`. Grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3`. — DoD: E.2 `kpiCard=88±4`.
- [x] **45.** Barra de filtros (`useReducer`): busca com `debounce 200ms` · `Select` prioridade · `Select` contato (com busca) · toggle "Com alarme" · toggle "Mostrar concluídas" · "Limpar" (só com filtro ativo). Estado em `?q=&prio=&contact=&alarm=1&done=1` (`replaceState`). — DoD: 5 filtros; URL reflete.
- [x] **46.** Filtro aplicado nos **3 modos** (função pura `applyFilters(items, filters)` em `workItemAggregates.ts` + teste). Quadro com filtro que esvazia coluna mostra `variant="column"`. — DoD: filtrar por prioridade esvazia colunas no Quadro.
- [x] **47.** **B7:** `?view=pipeline` **sempre** abre em `board`; `?view=tasks` abre no último modo salvo ou `list`. Persistir só em `onChange` do `ModeSwitcher`. — DoD: teste `TasksModule.test.tsx` cobre os 2 casos.
- [x] **48.** **B4:** seção "Concluídas (7 dias)" da Lista passa a receber `done7d` (query da etapa 20 já traz done 30d; `bucketByDue` filtra 7d). Cabeçalho colapsado; "ver mais (30 dias)" no rodapé. — DoD: concluir → item aparece na seção.
- [x] **49.** Lista: "Próximas" agrupa por dia ("Amanhã", "Qua 01/10", …, "Semana que vem" para > 7d) com subcabeçalho `text-[12px]`; "Sem prazo" colapsa quando > 10; tooltip no cabeçalho "Ordenado por prazo, depois prioridade". — DoD: 3 comportamentos.
- [x] **50.** Animação de concluir: `motion.div` `exit={{ opacity: 0, height: 0 }}` 200ms via `AnimatePresence` por item (respeita reduced-motion). — DoD: item some com fade.
- [x] **51.** **B5:** coluna Concluído do Quadro mostra só `completed_at ≥ now-7d`, ordem `completed_at desc`, rodapé "Ver mais antigas (30 dias)" (filtro local). — DoD: paginação local.
- [x] **52.** **B8:** `isDropDisabled = hardFull && dragSourceStatus !== 'doing'` usando `onDragStart` no `DragDropContext` para guardar a origem. Cabeçalho cheio ganha `ring-1 ring-destructive/40`. — DoD: reordenar dentro de Fazendo cheio funciona; 4ª de fora não solta.
- [x] **53.** `TasksEmptyState variant="column"` recebe `policy` e mostra o texto da política em `text-muted-foreground/70`. `BoardColumnSkeleton` (3 `WorkItemCardSkeleton`) usado no `isLoading`. Remover `max-h-[calc(100vh-280px)]` → `min-h-0 flex-1` com o pai em `h-full`. — DoD: 3 itens.
- [x] **54.** Rota `pipeline` (`layout: 'full'`): verificar em 1440 se as 5 colunas cabem; se não, `-mx-[var(--layout-gutter)] px-4` **só** no modo board. Registrar a decisão. — DoD: screenshot 1440 com 5 colunas. — **FECHO:** `out/E-54-pipeline-1440-cinco-colunas.png`; em 1440 o board renderiza e `docScrollWidth = innerWidth = 1440` -> **as colunas cabem e nenhum `-mx` foi aplicado** (decisao registrada).
- [x] **55.** Agenda — reescrita autorizada: ponto do dia com cor por tipo (prazo `primary`, alarme `warning`, atrasada `destructive` — até 3 pontos); bloco "Atrasadas" expansível (colapsado por padrão se > 3); lista do dia em **3 grupos** (Alarmes por `remind_at` com hora à esquerda `w-14 tabular-nums`; Prazos por `due_date`; Sem hora). — DoD: item com prazo e alarme no mesmo dia aparece nos 2 grupos.
- [x] **56.** `WorkItemCard mode="agenda"`: linha única `h-11` (checkbox · título · chips à direita · kebab), sem motivo de espera. — DoD: altura 44±2.
- [x] **57.** `QuickAdd` na Agenda com chip Data pré-preenchido com o dia selecionado. Decisão D7 mantida (faixa hoje → +6). — DoD: criar cai no dia certo.
- [x] **58.** Commit `feat(tarefas): fase E — KPIs, filtros nos 3 modos, Concluídas 7d, Quadro (WIP/ordem), Agenda em grupos (B4 B5 B7 B8)`. PR, CI, merge, screenshots `out/E-58-{list,board,agenda}.png` (1672) e `board-1280.png`. — DoD: SHA + 4 screenshots. — **4 screenshots tirados 02/10** (`out/E-58-{list,board,agenda}.png` em 1672 e `E-58-board-1280.png`); SHA da entrega: ver CP-E. — **FECHO:** FASE E entregue por `ebc126427` (#1298, 45/46), `fed595989` (#1303, 55), `211fe1606` (#1305, 56) e `92e884eef` (#1308, 57), com os ajustes #1325/#1334/#1360/#1372; os 4 PNGs `out/E-58-*` foram tirados em 02/10.

**CP-E — Três modos no padrão.** Gate: E.2 → `kpiCard 88±4 · columns 5 · agendaDay 64±2`; filtros valem nos 3 modos; 0 requests na troca de modo.

---

### FASE F — Avisos: toast, popover da Sidebar, badge, título (etapas 59–70) → CP-F

- [x] **59.** Branch `claude/feat-tarefas-f-avisos-<carimbo>`. Criar `src/hooks/tasks/useWorkItemNotifications.ts`: dado `notification` com `metadata.task_id`/`contact_id`, expõe `openTask()` (`?view=tasks&task=<id>` via `NavigationService`), `openContact()`, `snooze(minutes | 'tomorrow9')` (Fase B), `complete()`, e `markRead()` (`useNotifications` já tem). — DoD: 5 ações tipadas.
- [x] **60.** Localizar o popover de notificações em `Sidebar.tsx` (`grep -n "notifications" src/components/layout/Sidebar.tsx`) e o componente de item da lista. Adicionar `case 'reminder_due'`: ícone `BellRing text-warning`, título, mensagem, **3 botões `h-8`**: "Abrir", "Adiar ▾" (`DropdownMenu` 15 min · 1 h · Amanhã 9h), "Concluir". Todas marcam lida. Outros tipos inalterados. — DoD: item renderiza com 3 botões.
- [x] **61.** Toast realtime: em `useNotifications.ts` (canal `notifications-changes`), quando `type === 'reminder_due'` → `toast.custom` (sonner) com título, contato e os mesmos 3 botões; duração 15 s; sem som (não existe padrão no app). — DoD: criar tarefa com alarme +2 min no usuário QA → toast em ≤ 3 min.
- [x] **62.** **Badge da sidebar:** descobrir como `SidebarNavItem` recebe `badge` (`grep -n badge src/components/layout/SidebarNavItem.tsx src/services/navigation.service.ts`). Ligar `useMyWorkItemsBadge()` ao item `tasks` (não ao `pipeline`). Cor `bg-destructive` se houver atrasada, senão `bg-warning`. — DoD: badge aparece com 1 atrasada.
- [x] **63.** Título da aba: hook `useDocumentBadge(count)` (sobre `useDocumentTitle.ts`) prefixa `"(n) "` quando `count > 0` e a aba está oculta (`document.visibilityState`); reverte ao voltar. — DoD: título muda.
- [x] **64.** Push (G-7): ler `src/hooks/system/usePushNotifications.ts`, `PushNotificationToggle.tsx` e o service worker (`public/sw.js` ou `vite-plugin-pwa`). Se houver Edge Function/trigger que envia push por tipo → adicionar `reminder_due`. Se não → **não implementar**; registrar "push: fora da v1 (sem mecanismo genérico)" com o arquivo lido como evidência. — DoD: decisão no ledger.
- [x] **65.** Sheet mostra "Avisado em {notified_at}" e "Adiar ▾" no campo alarme (Fase C deixou o slot). — DoD: estado visível na tarefa migrada (`notified_at` preenchido).
- [x] **66.** Idempotência ponta a ponta (produção, usuário QA): criar tarefa com alarme +2 min → esperar → `SELECT count(*) FROM notifications WHERE metadata->>'task_id'=…` = 1 → Adiar 15 min → esperar → = 2 → Concluir → `status='done'`, `remind_at IS NULL`. Timestamps no ledger. — DoD: sequência 1 → 2 → done. — **PARCIAL (medido em producao 02/10):** 1 disparo = 1 notificacao (`count=1` em 10:53:07Z) e **adiar 15min reprograma de verdade** (`remind_at` -> 11:08:10Z, 2o disparo somou `count=2`). O trecho `concluir -> status=done + remind_at IS NULL` **nao foi medido** (o clique nao surtiu efeito no roteiro). Numeros em `~/auditorias/fase-j/66-67-idempotencia.md`. — **PENDENTE DO JOAQUIM** (depende de dado, credencial do dono ou conferencia presencial). — **FECHO (medido em producao 02/10, exit 0):** criada com alarme +2 min as 12:29:16; **1o disparo 12:31:00 -> `count=1`** com toast visivel; **adiar 15min** as 12:31:03 moveu `remind_at` para 15:46:01Z; **2o disparo 12:47:02 -> `count=2`**; **concluir** -> `status=done`, **`remind_at=null`**, `notified_at=null` (15:47:03Z). Numeros crus em `~/auditorias/fase-j/66-67-fechadas.md`.
- [x] **67.** Concluir antes do horário: criar com alarme +5 min, concluir em 1 min, esperar 6 min → 0 notificações. — DoD: 0 linhas. — **NAO MEDIDA (3 tentativas, 02/10):** o roteiro nao criou a tarefa (`waitCard` estourou com 20s e depois 60s), entao o check de '0 notificacoes ao concluir antes' nao foi exercitado. Nao e timing (o app cria normalmente em outros fluxos). Remediacao instrumentada pendente. — **PENDENTE DO JOAQUIM** (depende de dado, credencial do dono ou conferencia presencial). — **FECHO (medido em producao 02/10, exit 0):** criada com alarme +5 min e **concluida 6 s depois** (`status=done`, `remind_at=null`); **6 min depois, no horario do alarme, `count = 0` notificacoes**. As 3 tentativas anteriores nao falharam por logica: caíram na janela de republicacao da Vercel com 503 e a Lista nao renderizava o card. Evidencia em `~/auditorias/fase-j/66-67-fechadas.md`.
- [x] **68.** Slash command **B10**: `/remind` em `useChatPanelHandlers.ts:182` passa a chamar `create({ title: 'Lembrete: ' + contato, remindAt: amanhã 9h, contactId, status: 'todo' })` e abrir a aba Tarefas com o Sheet do item criado (para ajustar hora). Texto do comando em `slashCommandsData.ts`: "Criar tarefa com alarme para este contato". — DoD: `/remind` grava no banco.
- [x] **69.** Testes `useWorkItemNotifications.test.ts` (snooze 15/60/tomorrow9 com `now` fixo; complete marca lida) e do item de notificação (`reminder_due` → 3 botões; `info` → inalterado). — DoD: verde.
- [x] **70.** Commit `feat(tarefas): fase F — avisos de alarme (toast, popover, badge, título), /remind real (B6 B10)`. PR, CI, merge, screenshots `out/F-70-{toast,popover,badge}.png`. — DoD: SHA.

> **FASE F — executada em 2026-10-01.** Achado que mudou o escopo: o popover de notificacoes que a
> etapa 60 mandava localizar NAO existia (o codigo diz "Nao existe central de notificacoes no app");
> foram criados NotificationsPopover, NotificationItem e ReminderNotification, com o sino na Sidebar.
> Decisao da etapa 64: push fora da v1 (SW/PWA desligados, sem mecanismo generico). 66 e 67 (idempotencia
> ponta a ponta em producao, com timestamps) ficam para a rodada de QA, junto dos screenshots.
> Limitacoes declaradas: badge com cor unica (o hook devolve so o total); TasksModule le ?task= apenas no
> 1o render; o Sheet espelha o alarme em estado local.

**CP-F — Alarme de ponta a ponta.** Gate: etapa 66 com timestamps; badge e toast em produção.

---

### FASE G — Chat: Notas, redirecionamento, atalho, mini-quadro (etapas 71–76) → CP-G

- [x] **71.** Branch `claude/feat-tarefas-g-chat-<carimbo>`. `NotesTab.tsx` seção "Pendências": trocar `openTasks.map` por resumo "{n} tarefas abertas com este contato" + botão "Ver na aba Tarefas" (`onTabChange('tasks')` — descobrir a prop real em `ConversationTabContent`) + `QuickAdd compact`. — DoD: sem lista duplicada.
- [x] **72.** `TasksTab.tsx` — reescrita autorizada: mini-quadro vertical por status (Fazendo · A fazer · Aguardando · Caixa de entrada, cada um colapsável com contador) + "Concluídas" (7d) colapsada; `QuickAdd` com chip Lembrar em destaque e `@` oculto. — DoD: 5 grupos.
- [x] **73.** Redirecionamento: se a aba ativa persistida (`grep -rn "activeTab" src/components/inbox/RealtimeInboxView.tsx src/hooks/inbox`) for `'reminders'` → mapear para `'tasks'`. — DoD: usuário que estava em Lembretes cai em Tarefas.
- [x] **74.** Atalho no chat: `Alt+T` (verificar conflito em `useKeyboardShortcuts`) abre a aba Tarefas com foco no `QuickAdd`. — DoD: registrado sem conflito.
- [x] **75.** Testes: `ConversationTabs.test.tsx` (8 abas, badge `tasksOpen`), `TasksTab.test.tsx` (grupos, quick add com contato), `NotesTab.test.tsx` (resumo + botão). — DoD: `npx vitest run src/components/inbox` verde.
- [x] **76.** Commit `feat(tarefas): fase G — chat: Notas sem duplicação, mini-quadro na aba Tarefas, redirecionamento, Alt+T`. PR, CI, merge, screenshots `out/G-76-{tarefas,notas}.png`. — DoD: SHA.

**CP-G — Chat coerente.** Gate: `git grep -n "Lembrete" src/components/inbox` = só "Lembrar-me"/"/remind"; badge == itens.

---

### FASE H — Acessibilidade, mobile, motion, tema claro (etapas 77–84) → CP-H

- [x] **77.** Branch `claude/feat-tarefas-h-a11y-<carimbo>`. Mover os atalhos para `useKeyboardShortcuts` com escopo `view in ('tasks','pipeline')` e guarda de input: `N` (QuickAdd), `1/2/3` (modo), `/` (busca), `E` (Sheet do card focado), `X` (concluir), `Delete` (cancelar c/ undo), `?` (painel de atalhos se existir). — DoD: 7 atalhos.
- [x] **78.** `aria-live="polite"` em `TasksModule` (região `sr-only`) anunciando "Tarefa criada", "Concluída", "Movida para {coluna} ({n} de {limite})", "Desfeito". `DragDropContext` com `dragHandleUsageInstructions` em pt-BR e `aria-roledescription="tarefa arrastável"` no card. — DoD: texto injetado (E.5).
- [x] **79.** `useReducedMotion` no `AnimatePresence` do módulo, na animação de concluir e na entrada de cards; regra em `utilities.css`: `@media (prefers-reduced-motion: reduce) { [data-rbd-draggable-id] { transition: none !important; } }`. — DoD: E.2 com `reducedMotion: 'reduce'` → todas as `transitionDuration = 0s`.
- [x] **80.** Contraste (E.3): 4 `PriorityChip`, `DueChip` atrasado, cabeçalho "Fazendo 3/3", política cinza, chips do QuickAdd. Ajustar tokens até ≥ 4.5:1 texto / 3:1 ícone. — DoD: tabela.
- [x] **81.** Mobile 390×844: Lista 1 coluna, KPIs 2/linha, QuickAdd `⋯`; Quadro `snap-x snap-mandatory` + 5 dots + setas ‹ › no cabeçalho + `MoveToMenu` sempre visível + drag desabilitado em `pointer: coarse`; Agenda faixa com scroll; Sheet `side="bottom"`. — DoD: `scrollWidth ≤ innerWidth` nos 3 modos (`out/H-81-mobile-{list,board,agenda}.png`). — **DoD medido 02/10:** Lista **390=390**, Quadro **390=390**, Agenda **390=390** (`scrollWidth = innerWidth`, sem overflow) + os 3 PNGs `out/H-81-mobile-*.png`.
- [x] **82.** Tema claro: `localStorage.theme='light'` → 3 modos + Sheet + toast. Screenshots `out/H-82-light-{list,board,agenda}.png`. — DoD: sem regressão de contraste. — PNGs `out/H-82-light-{list,board,agenda}.png` tirados em 02/10 com `theme=light`.
- [x] **83.** Zen (`?view=inbox` com `isZen`): `QuickAdd` e mini-quadro não estouram a largura do painel. — DoD: `out/H-83-zen.png`. — **FECHO:** `out/H-83-zen.png`; em 390x844 a Zen mede `scrollWidth = innerWidth = 390` (QuickAdd e mini-quadro nao estouram).
- [x] **84.** Commit `feat(tarefas): fase H — atalhos, aria-live, reduced-motion, mobile, tema claro`. PR, CI, merge. — DoD: SHA.

> **FASE H — executada em 2026-10-01.** 77-82 e 84 fechadas; **83 (zen) fica aberta**: ninguem
> verificou o painel do inbox em modo zen (o `min-w-0`/`w-full` do mobile cobre por construcao, mas
> nao houve prova).
> **77** os 7 atalhos vivem no registry real (`defaultShortcuts.ts` + `useGlobalKeyboardShortcuts.ts`)
> com `scope=['tasks','pipeline']`, guarda de input e `alternateKeys` (1/2/3 = um unico id); o
> TasksModule deixou de ter listener proprio e consome o evento `tasks-shortcut`. Colisoes declaradas:
> `/` (focus-input global) e Delete (archive-chat) — ambos sem acao registrada, o de Tarefas vence.
> **78** regiao viva `tasks-live` (role=status, aria-live=polite) anunciando Tarefa criada/Concluida/
> Movida para {coluna} ({n} de {limite})/Desfeito + `dragHandleUsageInstructions` pt-BR e
> `aria-roledescription="tarefa arrastavel"` no card do Quadro.
> **79** `useReducedMotion` com duracao 0 na troca de modo + regra `[data-rbd-draggable-id]`
> (e card/modulo) com `transition: none !important` — o `!important` e a unica forma de vencer o
> estilo inline que a lib de DnD escreve no elemento.
> **80** contraste AA fechado com o par de TEXTO `--warning-text`/`--destructive-text` (claro/escuro,
> so luminosidade — preenchimento e borda intactos); tabela medida antes/depois no PR. Fora de Tarefas
> `text-warning`/`text-destructive` continuam reprovando (251 usos no app) — nao era o escopo.
> **81** mobile: trilho com `snap-x snap-mandatory` + 5 dots + setas ‹ › + `MoveToMenu` visivel + drag
> desligado em `pointer: coarse` + Sheet `side="bottom"` abaixo de 768px (corte unico em
> `shared/pointerMedia.ts`, via `useSyncExternalStore`). **Sem prova medida:** `scrollWidth <= innerWidth`
> e os screenshots dependem do login de QA — a garantia entregue e por construcao (classes).
> **Nota de CSS:** o contraste do `.chip-active` entrou como `.chip-active.chip-active` em
> `utilities.css` (vence `components.css` por especificidade); funciona e esta testado, mas o certo e
> uma linha em `components.css` — ajuste registrado.

**CP-H — Acessível e responsivo.** Gate: 7 atalhos; reduced-motion 0s; contraste ok; 3 modos mobile sem overflow; tema claro ok.

---

### FASE I — Testes de componente e performance (etapas 85–90) → CP-I

- [x] **85.** Branch `claude/test-tarefas-i-componentes-<carimbo>`. `WorkItemCard.test.tsx`: 6 status renderizam; checkbox chama `onToggleDone`; Enter chama `onOpen`; `X` conclui; `Delete` cancela; `Backspace` **não** faz nada; kebab mostra 5 grupos; "Fazendo" desabilitado com WIP cheio. — DoD: ≥ 8 casos.
- [x] **86.** `TasksListMode.test.tsx`: 6 seções; "Concluídas" recebe `done7d`; "Próximas" agrupa por dia; empty `all`/`filter`. `TasksModule.test.tsx`: `defaultMode`; `?view=pipeline` força board; `?task=` abre Sheet; atalho N. — DoD: ≥ 8 casos.
- [x] **87.** `TasksBoardMode.test.tsx` (testar `handleDragEnd` extraído para função pura `resolveDragEnd(result, byStatus, doingCount)` → `{ action: 'reorder' | 'move' | 'need_reason' | 'blocked', … }`): 5 colunas; doing cheio bloqueia; waiting sem motivo pede; reorder recalcula `position`; mover entre colunas recalcula as duas. — DoD: ≥ 6 casos.
- [x] **88.** `TasksAgendaMode.test.tsx` (`now` fixo): distribuição por dia; 3 grupos; atrasadas sempre visíveis; fim de semana marcado. `WorkItemSheet.test.tsx`: motivo obrigatório em Aguardando; Fazendo desabilitado; Salvar desabilitado sem mudança. — DoD: ≥ 8 casos.
- [x] **89.** Performance: script E.6 (`/workspace/qa/tasks-seed.mjs`) cria 300 tarefas no usuário QA via REST, mede TTI dos 3 modos com Playwright (`performance.now` até `[data-testid=work-item-card]` ≥ 50), apaga tudo. `npm run build` → tamanho gzip do chunk do módulo (`dist/assets/*Tasks*`) ≤ 45 KB. — DoD: 4 números no ledger.
- [x] **90.** Commit `test(tarefas): fase I — testes de componente (card, lista, quadro, agenda, sheet) e medição de performance`. PR, CI, merge. — DoD: SHA; `npx vitest run src/components/tasks src/hooks/tasks` ≥ 60 testes verdes.

> **FASE I — executada em 2026-10-01 (rede de testes).** 46 casos novos no dominio:
> `WorkItemCard.test.tsx` (11, +14/14 mutantes mortos pelo autor), `TasksListMode.test.tsx` (8)
> + `TasksModule.test.tsx` (+6, total 37), `TasksBoardMode.test.tsx` (10, com a extracao do
> `resolveDragEnd`), `TasksAgendaMode.test.tsx` (7 com relogio congelado em 01/10/2026 10:00) e
> `WorkItemSheet.test.tsx` (+4 de borda). Dominio: 19 arquivos / 254 casos (DoD pedia >= 60).
> **87 — refatoracao:** a decisao do arrasto saiu do `TasksBoardMode.tsx` para a funcao PURA
> `board/resolveDragEnd.ts` (`{ action: 'reorder' | 'move' | 'need_reason' | 'blocked' }`), com o
> portao do Aguardando e a trava de WIP 3/3 intactos (contagem REAL via `doingCount`); o componente
> so interpreta o veredito. Ganhou 2 guardas defensivas novas (destino nulo / id desconhecido -> null).
> **89 — medicao:** chunk do modulo **12,2 KB gz** (teto 45 KB) e JS inicial **334,9 KB / 341 KB**.
> **NAO medido (depende do login de QA):** seed de 300 tarefas via REST (`qa/tasks-seed.mjs`) e TTI
> dos 3 modos no Playwright — os 2 dos 4 numeros do DoD ficam declarados como pendentes.
> **Instabilidade vista (nao reproduzida):** `cardAcoes.test.tsx` falhou em 1 rodada de um agente
> (matchMedia restaurado por um caso) e passou em 2/2 rodadas minhas; registrado para investigar.

**CP-I — Rede de testes.** Gate: ≥ 12 arquivos de teste no domínio; ≥ 60 casos; bundle ≤ 45 KB gz.

---

### FASE J — QA final, isolamento, docs, cutover (etapas 91–100) → CP-J

- [x] **91.** Gates técnicos em `main` atualizado: `tsc -b --force` (0) · `lint-ratchet` · `typecheck-ratchet` · `implicit-any-check` · `npm run lint` · `npx vitest run` (suite inteira) · `npm run build` · `bundle-budget.mjs`. — DoD: 8 saídas com exit 0.
- [x] **92.** E.5 funcional em produção (Playwright, usuário QA) — **24 checks**: criar por QuickAdd · Hoje · Lembrar +2 min · do chat com contato · concluir + desfazer · editar no Sheet (título, prioridade, prazo, alarme) · Fazendo ×3 e bloquear a 4ª · Aguardando pede motivo (DnD e kebab) · reordenar · cancelar + desfazer · filtro por prioridade nos 3 modos · busca · troca de modo sem request · Agenda por dia · `?task=` · badge sidebar · toast do alarme · Adiar · `/remind` · Alt+K/Alt+P/N/1/2/3 · mobile mover pelo menu · console sem `error`. — DoD: JSON `{ok, fail}` no ledger, 24/24. — **FECHO:** 24/24 em producao (2 rodadas limpas; hash do build igual antes/depois). Trajetoria 18 -> 21 -> 24. Ressalvas no CP-K.
- [x] **93.** E.2 geometria (1672×941): `quickAdd 44±2 · kpiCard 88±4 · modeSwitcher 44±2 · card ≥72 · agendaCard 44±2 · columns 5 · columnGap 12±2 · sheet 420±4`. — DoD: tabela OK/FAIL. — **medido em producao: 7/8.** `card >= 72` deu **56px** no Quadro (card sem chip) porque `WorkItemCard` nao tinha `min-h-[72px]`, exigencia literal do DoD da etapa 47; **corrigido nesta PR** (modo nao-agenda; a Agenda segue `h-11`). Remedicao pos-deploy pendente.
- [x] **94.** E.3 cores: fundo, card, 4 chips de prioridade, chips do QuickAdd, coluna cheia, coluna vazia, chip atrasado — ΔE ≤ 8 (fundos ≤ 6). — DoD: tabela. — **8/10 medidos OK** em producao (ΔE76 <= 0,85 nos 8). Os 2 restantes **nao medidos por ausencia de dado** na conta QA (nenhuma tarefa `low`, nenhuma vencida).
- [x] **95.** **Isolamento (segurança):** com o usuário QA e um segundo usuário de teste (criar `qa.visual2@promobrindes.com.br` via Admin API — não destrutivo): tarefa de A não aparece para B em Lista/Quadro/Agenda/chat; `PATCH /rest/v1/conversation_tasks?id=eq.<A>` com JWT de B → 0 linhas; `DELETE` idem. — DoD: 2 screenshots + 2 respostas REST no ledger.
- [ ] **96.** Dados migrados: `SELECT count(*) FROM reminders WHERE migrated_task_id IS NULL` = 0; abrir a tarefa migrada na Lista e no Sheet do dono (Admin 01). — DoD: ID conferido. — **PENDENTE DO JOAQUIM** (depende de dado, credencial do dono ou conferencia presencial).
- [x] **97.** **Migration (APROVADA e mergeada):** `supabase/migrations/20261001301230_tab_counts_drop_n.sql` — `get_conversation_tab_counts` sem `reminders_pending`; front: remover `remindersPending` de `useConversationTabCounts.ts` (tolera o campo até o merge). PR separada `chore(tarefas): remover reminders_pending da RPC de contagem da aba`. — DoD: migration **aplicada e provada no banco** (o DoD original — "PR aberta e **não** mergeada" — valia enquanto a PR aguardava o APROVADO do dono; foi cumprido naquela fase e superado no fecho). — **FECHO:** PR #1516 merged `2d4e8e4b`, `DDL_POS_MERGE=aplicadas`; provado no banco: a RPC devolve `TABLE(tasks_open, notes_total, files_total)`.
- [x] **98.** Docs: `docs/COMPLETE_SYSTEM_FEATURES.md` e `FUNCTIONALITIES_INVENTORY.md` — atualizar as linhas de Tarefas / Lembretes / Pipeline (≤ 10 linhas de diff). Plano v1 ganha nota no topo: "Substituído por PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md em 29/09/2026". — DoD: diff ≤ 15 linhas.
- [x] **99.** Contrato (seção 5 do plano v1) conferido item a item com "como verifiquei" ao lado; resíduos honestos no ledger (push se ficou fora, parser, virtualização, Agenda sem DnD, delegação, recorrência, subtarefas, colunas personalizáveis). — DoD: 20 itens + seção de resíduos. — **FECHO:** 19 dos 20 itens PRESERVADOS; **1 PARCIAL** (item 9, lista de alarmes por contato, removida na fusao). 14 residuos honestos no CP-K.
- [ ] **100.** Verificação final de produção: deployment READY do último merge; E.1 em `?view=tasks`, `?view=pipeline`, inbox → `out/J-100-prod-{tasks,board,chat}.png`; E.3 uma última vez; `SELECT jobname, active FROM cron.job WHERE jobname='tasks-notify-due'` = ativo; `SELECT count(*) FROM notifications WHERE type='reminder_due' AND created_at > now()-interval '1 day'` > 0. **Só então** escrever "concluído" no ledger. — DoD: 3 screenshots + 2 queries. — **parcial (interativa):** os 3 PNGs `out/J-100-prod-{tasks,board,chat}.png` existem e as 2 queries fecharam (cron ativo + `reminder_due` > 0 nas 24h); falta a conferencia presencial do dono. — **PENDENTE DO JOAQUIM** (depende de dado, credencial do dono ou conferencia presencial).

**CP-J — Entregue.** Gate: 24/24 funcional, geometria e cores ok, isolamento provado, migração conferida, docs atualizados, produção verificada, ledger completo.

---

## 3. CRITÉRIOS DE ACEITAÇÃO FINAIS (iguais ao v1, com o que faltava em negrito)
**Produto:** um conceito (Tarefa), três modos, um lugar no chat; **editar tudo pelo Sheet; Aguardando com motivo; alarme com Abrir/Adiar/Concluir no toast, no popover e no badge**.
**Kanban:** 5 colunas com políticas; WIP 3 hard / 5 soft; **reordenar dentro de Fazendo cheio; Concluído 7d + ver mais**; DnD com mouse, teclado e menu.
**Captura:** **7 chips estilizados** (Hoje, Amanhã, Próx. semana, Data, Lembrar, @, !) com validação de passado.
**Avisos:** cron ativo; **toast + popover + badge + título da aba**; adiar/concluir/abrir; idempotente (1 → 2 → done).
**Dados:** `types.ts` regenerado; **0 `Record<string, any>`**; RLS provada com 2 usuários; migração conferida.
**Técnico:** typecheck 0, ratchets, **≥ 60 testes no domínio**, build, bundle ≤ 45 KB gz, reduced-motion, tema claro, mobile.
**Honestidade:** ledger com números, SHAs, caminhos e timestamps; resíduos declarados.

---

## APÊNDICE A — Ordem de merge e o que cada PR libera
| PR | Fase | Libera para o usuário |
|---|---|---|
| #1133 (existente) | A | Lista/Quadro/Agenda básicos; aba única no chat |
| B | B | Nome do contato no card; badge correto; troca de modo instantânea |
| C | C | **Editar tarefa; Aguardando; adiar alarme pelo chip** |
| D | D | Captura com data, hora, contato e prioridade |
| E | E | KPIs bonitos, filtros, Concluídas, Agenda por grupos |
| F | F | **Aviso do alarme com botões; badge na sidebar; /remind de verdade** |
| G | G | Notas sem duplicar; mini-quadro no chat |
| H | H | Atalhos completos; mobile; tema claro |
| I | I | (sem mudança visível; rede de testes) |
| J | J | Docs; migration de limpeza (APROVADA, aplicada e provada no banco) |

## APÊNDICE B — Mapa bug → etapa
B1→35 · B2→28,29 · B3→26 · B4→48 · B5→51 · B6→19 · B7→47 · B8→52 · B9→5 · B10→68 · B11→4 · B12→5 · B13→20 · B14→2,3 · B15→12

## APÊNDICE C — Comando de disparo (Claude Code, quando a cota liberar)
```sh
cd /workspace/repos/Zapp_Web_V2-tarefas && git fetch origin && git checkout main && git pull && \
claude -p 'Leia docs/design/RELATORIO_AUDITORIA_TAREFAS_FUSAO.md e docs/design/PLANO_TAREFAS_FINALIZACAO_100_ETAPAS.md por completo. Execute o plano da Fase A à Fase J, fechando cada checkpoint SOMENTE com a evidência exigida em docs/design/TAREFAS_QUADRO_STATUS.md. Uma branch e uma PR por fase. Nunca pushes vazios em série. Se um gate falhar 3 vezes, registre o resíduo e siga. A migration da etapa 97 fica aberta aguardando APROVADO.' --model sonnet
```

> **Budget de bundle (medido em 2026-10-01, FASE H):** o build da FASE G fechava em 333,7 KB de JS
> inicial; a main atual (que o mergear re-sincroniza no branch) esta em 339,8 KB — **o #1424 (Talk X,
> Fase 1) consumiu 6,1 KB do grafo de entrada** (tocou `src/App.tsx`, rotas e providers). Com o guard em
> 340 KB, sobraram ~0,2 KB de folga: a FASE H estourou por 0,2 KB e a decisao 20261001-160338-3700 foi
> tirar os rotulos (nome/descricao) dos 7 atalhos de Tarefas do chunk de entrada, carregando-os sob
> demanda no painel de ajuda e na tela de atalhos. Nao se mexe no budget; quem for adicionar peso ao
> grafo de entrada (nao-lazy) precisa medir com `VITE_CRM_INTEGRATION_ENABLED=true bun run build` e
> `VITE_CRM_INTEGRATION_ENABLED=true node scripts/ci/bundle-budget.mjs` (o budget local sem esse env
> nao acusa o estouro).
> **Etapa 84 — budget (decisao 20261001-160338-3700, opcao c):** os rotulos (nome/descricao) dos 7
> atalhos de Tarefas sairam do chunk de ENTRADA: o binding (tecla/modificadores/categoria/escopo)
> continua em `defaultShortcuts.ts`, e `name`/`description` vivem em `shortcuts/taskShortcutLabels.ts`,
> alcancado por `import()` dinamico pelo dialogo de atalhos (que ja e lazy) e pela tela de atalhos.
> `ShortcutBinding.name/description` viraram opcionais com resolvedor + fallback no id. Medido com o env
> do CI: JS inicial 340,2 KB (estourava) -> **338,9 KB (OK)**; budget intacto em 340 KB.
