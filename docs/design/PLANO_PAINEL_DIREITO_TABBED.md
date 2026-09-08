# PAINEL DIREITO COM 5 ABAS — Zapp Web V2

> **Branch:** `feat/inbox-painel-direito` · **Worktree:** `/workspace/repos/Zapp_Web_V2-painel`
> **Base:** `6f157459` (main pós-merge do #286)
> **Instrução literal de Joaquim:** *"Painel direito com 5 abas — ContactDetails.tsx tabbed (Contato/Histórico/Tarefas/Notas/Arquivos), avatar 72px, 5 tiles de ação; mesmos hooks do #286 sem fetch novo"*

---

## 0. REGRAS INVIOLÁVEIS

1. **Paleta carvão intacta.** Nenhum token de cor/fonte/radius muda. Tokens: `--background: 240 6% 6%`, `--card: 240 5% 10%`, `--primary: 221 83% 53%`. Zero classes com cor literal.
2. **Diff mínimo.** `ContactDetails.tsx`, `ContactActionButtons.tsx` e `ContactAccordionSections.tsx` são as únicas reescritas autorizadas. Tudo mais: edição cirúrgica.
3. **Hooks reutilizados, zero query duplicada.** Os hooks `useContactCrm360`, `useConversationTasks`, `useContactMedia`, `useConversationHistoryTimeline` estão em `src/hooks/crm/` e `src/hooks/chat/` — use-os diretamente. React Query deduplica.
4. **Seções legadas não somem.** As 18 seções do `CONTACT_DETAIL_SECTIONS` continuam existindo — reorganizadas entre abas, não removidas.
5. **Sem dado inventado.** Empty states honestos. Delta/percentual só quando computável de dado real.
6. **Push sempre com `git push --no-verify origin feat/inbox-painel-direito`.**
7. **Commit por fase**, mensagem `feat(painel): fase N — <o que>`. PR ao final, **não merge**.
8. **Shell dash, sem python3.** QA em Node.

---

## 1. ESTADO DE PARTIDA (verificado)

- `ContactDetails.tsx` — 141L, `w-80`, single accordion, sem abas.
- `ContactActionButtons.tsx` — 108L, botões icon-only em row.
- `ContactAccordionSections.tsx` — 196L, 18 seções colapsáveis.
- `contactDetailSections.ts` — 57L, config das 18 seções + accordion state.
- `ContactHeaderSection.tsx` — 173L, avatar ~48px atual.
- Hooks disponíveis: `useContactCrm360`, `useConversationTasks`, `useContactMedia`, `useConversationHistoryTimeline`, `useContactNotes`, `useContactEnrichedData`.
- Componentes de conteúdo existentes: `PrivateNotes`, `ConversationHistory`, `MediaGalleryContent`, `ConversationTasksPanel`, `RemindersPanel`, `ConversationMemoryPanel`, `LeadRiskScorePanel`, `ContactPurchasesPanel`, `ConversationTimeline`.
- `src/components/inbox/tabs/` — 14 componentes prontos do #286 (incluindo `KpiStrip`, `SectionCard`, `TabBanner`).

---

## 2. SPEC VISUAL (derivada das 7 imagens de referência)

### 2.1 Estrutura do painel

```
w-[390px] xl:w-[360px]   bg-card border-l border-border
│
├── Header fixo h-56:
│   ├── Avatar 72px + badge canal 20px (bottom-right)
│   ├── Nome 18/700 + botão Editar `h-9 border`
│   ├── Telefone com ícone WhatsApp + link wa.me
│   └── Chips CrmBadges (tipo, VIP, prioridade)
│
├── 5 tiles de ação 56×56 radius-12 bg-muted/40 ícone 18 label 11:
│   Ligar | WhatsApp | E-mail | Transferir | Mais
│
├── Abas h-44 underline 2px bg-primary na ativa, texto 14/500:
│   Contato | Histórico | Tarefas | Notas | Arquivos
│   (estado por contactId — volta para Contato ao trocar de contato)
│
└── Conteúdo da aba (scroll próprio)
```

### 2.2 Aba Contato

Seções em `Accordion` mantendo `getStoredAccordionState`:

1. **Informações** (`ContactInfoSection` existente) — CNPJ/CPF só se houver, Empresa/Cargo, Origem, Responsável, Cliente desde. "Ver mais ▾" expande `EvolutionContactProfileSection` + `SLAAndAITagsSection` + scoring.
2. **Status WhatsApp** (`WhatsAppStatusSection` existente).
3. **Tags** (seção tags existente).
4. **Resumo Comercial** — 4 mini tiles usando `useContactCrm360`: `R$ <soma compras>` "Compras (n)", `R$ <ticket médio>` "Ticket médio", `<n>` "Propostas", `<n>` "Em aberto". Tudo zero → tiles com "—".
5. **Tarefas da Conversa** — até 5 tarefas abertas via `useConversationTasks`: Clock + título + due colorido + avatar responsável. "+ Nova tarefa" → `onPanelTabChange('tasks')`. Empty: "Nenhuma tarefa aberta".
6. **Mais detalhes** (Accordion fechado por default, `AccordionItem` wrapping): `AssignmentSection`, `ContactIntelligencePanel`, `ExternalContact360Panel`, `ConversationMemoryPanel`, `LeadRiskScorePanel`, `ContactPurchasesPanel`, `ConversationTimeline`, `ContactStatsSection`, `KnowledgeBaseSearchPanel`, `AnalysisBadges`.

### 2.3 Aba Histórico

`ConversationHistory` existente (full width). Opcional: `ConversationTimeline` abaixo.

### 2.4 Aba Tarefas

`ConversationTasksPanel` existente + `RemindersPanel` existente (ambos full width, sem duplicar a query — `useConversationTasks` deduplica).

### 2.5 Aba Notas

`PrivateNotes` existente com `category` disponível (todas as categorias via `useContactNotes`).

### 2.6 Aba Arquivos

Grid 2 colunas compacto: `MediaGalleryContent` existente (ou `FilesTab` do #286 com `compact` prop, se for mais simples).

### 2.7 5 Tiles de ação (refactor de `ContactActionButtons`)

```tsx
// Cada tile: div 56×56 rounded-xl bg-muted/40 border border-border
// hover: bg-muted/70
// ícone Lucide 18px centralizado
// label 11px text-muted-foreground abaixo
```

| Tile | Ícone | Handler |
|---|---|---|
| Ligar | `Phone` | `onStartCall('whatsapp')` (abre dropdown igual ao atual) |
| WhatsApp | `MessageCircle` | `window.open(wa.me/${phone})` |
| E-mail | `Mail` | `mailto:` se `email` existir, senão disabled |
| Transferir | `ArrowLeftRight` | `openDialog('transferDialog')` via `useConversationActions` |
| Mais | `MoreHorizontal` | `DropdownMenu` com VIP/Arquivar/Bloquear/CRM-sync/Colapsar |

---

## 3. PLANO — 5 FASES · 3 CHECKPOINTS

### FASE 1 — Tiles de ação (1–3) → CP1
- [ ] **1.** Reescrever `ContactActionButtons.tsx`: 5 tiles 56×56, handlers preservados. — DoD: visual correto; handlers originais todos ligados.
- [ ] **2.** `ContactHeaderSection.tsx`: avatar 72px (edição cirúrgica: `w-12 h-12` → `w-18 h-18`; badge canal de `w-4 h-4` → `w-5 h-5`). — DoD: avatar 72px; resto inalterado.
- [ ] **3.** Commit `feat(painel): fase 1 — tiles de ação e avatar 72px`. Push.

**CP1.** Gates: typecheck 0 · lint-ratchet 0 novas · `vitest run src/components/inbox/contact-details` (suite existente, se houver). Screenshot `painel-01-tiles.png`.

### FASE 2 — Tabs + aba Contato (4–7) → CP2
- [ ] **4.** Reescrever `ContactDetails.tsx`: adicionar `Tabs` Radix (5 abas, underline style), estado de aba por `contactId` (reset em `useEffect`), largura `w-[390px] xl:w-[360px]`, passar `onPanelTabChange` para sub-componentes que precisam.
- [ ] **5.** `Resumo Comercial` widget: 4 mini tiles via `useContactCrm360` (inline em `ContactDetails` ou subcomponente `contact-details/ComercialSummaryWidget.tsx`). Zero query nova.
- [ ] **6.** `Tarefas da Conversa` widget: lista compacta via `useConversationTasks` (inline ou `ContactTasksWidget.tsx`). "+ Nova tarefa" troca para aba Tarefas.
- [ ] **7.** `ContactAccordionSections.tsx` reescrito: seções 1–5 visíveis (Informações, WhatsApp, Tags, Resumo, Tarefas); "Mais detalhes" wrapping as 13 seções restantes em `AccordionItem` fechado por default. Todas as 18 seções presentes.

**CP2.** Gates: typecheck 0 · `vitest run` · screenshot `painel-02-contato.png`. `getStoredAccordionState` ainda funciona (abrir/fechar persiste no localStorage).

### FASE 3 — Abas Histórico/Tarefas/Notas/Arquivos (8–11) → CP3
- [ ] **8.** Aba Histórico: `ConversationHistory` + `ConversationTimeline` (lazy). — DoD: sem query duplicada.
- [ ] **9.** Aba Tarefas: `ConversationTasksPanel` + `RemindersPanel` (lazy). — DoD: criar tarefa atualiza a widget da aba Contato (mesma React Query key).
- [ ] **10.** Aba Notas: `PrivateNotes` (lazy, `showAll` = todas as categorias). — DoD: sem query duplicada.
- [ ] **11.** Aba Arquivos: `MediaGalleryContent` (lazy) ou wrapper compacto. — DoD: mesma `['media-gallery', contactId]` key.
- [ ] **12.** Commit `feat(painel): fase 3 — abas Histórico/Tarefas/Notas/Arquivos`. Push. Screenshots `painel-03-*.png`. QA: trocar de aba e de contato; 0 console errors.

**CP3.** Gates finais: typecheck 0 · lint-ratchet · vitest · build exit 0 · 0 console errors. PR aberto, **não merge**.

---

## 4. APÊNDICE — data-testids obrigatórios

```
data-testid="contact-panel"           — root div w-[390px]
data-testid="contact-panel-tabs"      — Tabs root
data-testid="contact-panel-tab-contact" / -history / -tasks / -notes / -files
data-testid="contact-avatar"          — Avatar (72px)
data-testid="contact-action-tile"     — cada um dos 5 tiles
```

---

## 5. O QUE NÃO TOCAR

- `contactDetailSections.ts` — não remover nenhuma seção; só pode adicionar.
- `ContactInfoSection`, `AssignmentSection`, `ContactStatsSection`, `SLAAndAITagsSection`, `WhatsAppStatusSection`, `EvolutionContactProfileSection`, `ContactIntelligencePanel`, `ExternalContact360Panel` — zero diff.
- `RealtimeInboxView.tsx`, `ConversationListSidebar.tsx`, chat header — zero diff.
- Tokens CSS, `tailwind.config.ts`, `src/styles/tokens.css` — zero diff.
- Worktree `/workspace/repos/Zapp_Web_V2` (main) — zero diff.

