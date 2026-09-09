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



---

## 5. ADENDO DE FIDELIDADE (09/09/2026 — instrução de Joaquim: "o mais semelhante possível às imagens, mantendo o carvão; a versão anterior ficou medíocre")

Este adendo **prevalece** sobre §2 e §3 onde houver conflito. As Fases 1–3 já estão commitadas (`2e672341`, `950b15d2`, `53bc821c`) e pushadas; o PR **não** foi aberto. Sua tarefa agora: (a) sincronizar com `main`, (b) fazer a passada de fidelidade abaixo (Fase 4), (c) QA, (d) abrir o PR.

Leia as referências com `Read` antes de cada etapa: `/workspace/qa/ref/inbox/07-chat.jpg` (painel na aba Contato, layout "Dados principais"), `01-crm360.jpg` (layout "Informações + Status WhatsApp + Tags + Resumo Comercial + Tarefas da Conversa"), `03-ia.jpg` (bloco "Insights da IA" roxo), `05-tarefas.jpg` (lista "Tarefas" no painel). Estado atual de produção: `/workspace/qa/out/prod-inbox-*.jpg`; seu estado atual: `docs/design/painel-0*.png`.

### 5.0 Sincronização (Fase 0 do adendo)
- `git fetch origin && git merge origin/main --no-edit` (branch está 9 commits atrás; `main` inclui o #288 que tocou `ChatPanelHeader.tsx`/`ChatHeader.tsx`/`TicketTabs.tsx`/`InboxFilters.tsx`/`useInboxFilters.ts` — nenhum arquivo seu, conflito improvável; se houver em `ChatPanel.tsx`, mantenha o `useEffect` do `open-transfer-dialog` e o que veio de main). `npm run typecheck` → 0. `bun install --frozen-lockfile` se o lockfile mudou. Push `--no-verify`.
- **Screenshots não vão mais para o repo.** Os 7 PNGs em `docs/design/painel-*.png` já commitados: `git rm --cached docs/design/painel-*.png`, mova para `/workspace/qa/out/`, adicione `docs/design/*.png` ao `.gitignore` (linha única). Commit `chore(painel): screenshots fora do repo`. Daqui em diante todo screenshot vai para `/workspace/qa/out/painel-*.png`.
- **QA shot:** a conta QA abre com lista vazia (chip "Em atendimento" por padrão pós-#288 e "Mostrar Todos" dentro de `InboxFilters`). Copie `/workspace/qa/inbox-shot.mjs` para `/workspace/qa/painel-shot.mjs` e, depois de "Pular tour": abra o painel de filtros (botão "Filtros" — descubra o seletor com `page.content()`), ligue "Mostrar Todos" (`getByLabel(/Mostrar Todos/i)` ou `#show-all`), Escape, clique no chip "Todas", e só então abra a primeira conversa. Sem isso não há painel para fotografar.

### 5.1 Sessão irmã em paralelo
A lista de conversas, o chat header, o input e as 8 abas centrais estão sendo refeitos na branch `redesign/inbox-fidelidade-carvao` (worktree `Zapp_Web_V2-inbox`). **Você não toca**: `ConversationListSidebar`, `conversation-list/**`, `TicketTabs`, `InboxFilters`, `chat/**`, `tabs/**`, `RealtimeInboxView` (exceto se a largura do painel for definida lá — aí só a classe de largura do painel). Seus arquivos: `ContactDetails.tsx`, `ContactDetailsResponsive.tsx`, `contact-details/**`, `ChatPanel.tsx` (só o listener já adicionado).

### 5.2 Mapa navy → carvão (tokens intocados)
fundo card `bg-card` · seção `bg-muted/30 rounded-xl` · borda `border-border` · aba ativa: texto `text-foreground font-semibold` + underline 2px `bg-primary` · botão azul `bg-primary` · tile de ação `bg-muted/40 border border-border` com ícone colorido: Ligar `text-primary`, WhatsApp `text-success`, E-mail `text-primary`, Transferir/Mais `text-foreground` · chips: Cliente `bg-primary/15 text-primary border-primary/40`, VIP `bg-warning/15 text-warning border-warning/40`, Alta prioridade `bg-destructive/15 text-destructive border-destructive/40`, tags neutras `bg-muted text-foreground` · bloco IA `bg-kpi-purple border border-kpi-purple-fg/30` texto `text-kpi-purple-fg` · KPI tile `bg-muted/40 rounded-lg`. Zero cor literal, zero token novo.

### 5.3 Geometria (viewport 1672×941)
| Bloco | Alvo | Tol |
|---|---|---|
| Painel | **w 380** (`w-[380px]`, override do §2.1/`w-[390px] xl:w-[360px]`) `bg-card border-l border-border` | ±4 |
| Abas (topo do painel, **antes** do avatar — na referência as abas ficam acima do header) | h 44; 5 abas `flex-1 text-[13px]`; ativa `font-semibold text-foreground` + underline `h-0.5 bg-primary`; inativa `text-muted-foreground` | ±2 |
| Header do contato | padding 16; avatar **72** (já feito) + badge canal **24** bottom-right (`bg-success` com ícone WhatsApp branco 14, `ring-2 ring-card`); nome 18/700 + `Star` 16 (favorito, clicável, `fill-warning` quando favorito); telefone 14 muted + ícone WhatsApp 16 verde (link `wa.me`); linha "Cliente desde {mês ano}" 13 muted com ícone 14; botão **Editar** à direita `h-9 px-3 rounded-lg border border-border bg-card gap-1.5 text-[13px]` (`Pencil` 14 + "Editar") → `EditContactDialog` existente | ±2 |
| Chips do contato | linha abaixo do header, `h-6 px-2.5 rounded-full text-xs font-semibold`: tipo (via `contactTypeConfig` de `src/components/contacts/contactTypeConfig.tsx`), VIP (se tag), Alta prioridade (se `priority==='high'`) — só com dado real | — |
| 5 tiles de ação (já feitos) | grid-cols-5 gap-2 px-4; tile **h 56** `rounded-xl bg-muted/40 border border-border hover:bg-muted/70 flex-col gap-1`; ícone 18 **colorido** (§5.2); label 11/500 | ±2 |
| Seção | `mx-4 mb-3 rounded-xl border border-border bg-muted/20 p-3`; header: tile 24 `bg-primary/15 text-primary rounded-md` + título 14/600 + ação à direita (`Editar` outline h-7 · `Ver no CRM` link · `Adicionar tag` outline h-7 · `+ Nova tarefa` pill `bg-primary/15 text-primary h-7` · `Reanalisar` outline h-7) | — |
| Linha label/valor | h 28; label 13 muted com ícone 14 (`w-[120px]`); valor 13 foreground; valor vazio → link `text-primary` "Adicionar {campo}" (abre o `EditContactDialog`) | — |
| Resumo comercial | grid 2×2 gap-2; tile `rounded-lg bg-muted/40 p-2.5`: valor 15/700 tabular + label 11 muted | — |
| Tarefas da conversa | lista até 5: `Clock` 14 muted + título 13 truncate + data 11 à direita (`text-destructive` atrasada / `text-warning` hoje / muted) + avatar 18 | — |
| Insights da IA | bloco roxo com até 4 linhas: ícone 14 + texto 12 + `ChevronRight` 14 — só com dado real de `ContactIntelligencePanel`/análises; senão o bloco não aparece | — |

### 5.4 Ordem das seções na aba Contato (referências 07-chat e 01-crm360 combinadas)
1. **Informações** (tile `Info`): E-mail · Empresa · Cargo · Origem (canal) · Responsável (agente) · Cliente desde · CNPJ/CPF (só se houver) — botão "Editar" no header. "Ver mais ▾" mantém o que já faz.
2. **Status WhatsApp** (tile `MessageCircle`): dot `bg-online` + status real + "Última visualização" se houver.
3. **Tags** (tile `Tag`): chips + botão "Adicionar tag" outline h-7.
4. **Resumo Comercial** (tile `BarChart3`, ação "Ver no CRM" → aba CRM 360° central se existir prop para isso — grep `onCenterTabChange`/`setActiveTab` no `ChatPanel`; se não existir, registre pendência e omita a ação).
5. **Tarefas da Conversa** (tile `CheckSquare`, ação "+ Nova tarefa").
6. **Insights da IA** (bloco roxo) — só com dado.
7. **Última atividade** (tile `Activity`, colapsável, fechado): 3 últimos eventos via `useConversationHistoryTimeline`.
8. **Mais detalhes** (Accordion fechado): as seções restantes, **todas** presentes (18/18).

### 5.5 Abas Histórico / Tarefas / Notas / Arquivos do painel
Container `px-4 pb-4`; cards internos no estilo de seção de §5.3 (tile 24 + título 14/600). Só classes — componentes já ligados na Fase 3.

### 5.6 Plano do adendo — FASE 4 (etapas 13–20) → CP4
- [ ] **13.** §5.0 completo (merge main, screenshots fora do repo, `painel-shot.mjs` funcionando: screenshot `painel-04-before.png` com conversa aberta e painel visível). — DoD: 3 commits/ações + screenshot.
- [ ] **14.** Abas para o topo do painel (acima do header) — `ContactDetails.tsx`: ordem `Tabs` → header → chips → tiles → conteúdo. h 44. — DoD: medida.
- [ ] **15.** Header: badge canal 24, estrela favorito (`useConversationActions.isFavorite/toggleFavorite`), telefone com ícone WhatsApp, "Cliente desde", botão Editar h-9. `ContactHeaderSection.tsx` (edição cirúrgica). — DoD: Editar abre `EditContactDialog`.
- [ ] **16.** Chips do contato (tipo/VIP/prioridade) com dado real; tiles com ícone colorido (§5.2). — DoD: screenshot.
- [ ] **17.** Seções da aba Contato reestilizadas (§5.3 "Seção", "Linha label/valor", "Resumo comercial", "Tarefas") + ordem de §5.4 (adicionar "Última atividade" e "Insights da IA" só com dado). `ContactAccordionSections.tsx` (reescrita já autorizada) + `ContactInfoSection.tsx` (cirúrgica). 18/18 seções presentes. — DoD: lista das 18 no ledger.
- [ ] **18.** Abas secundárias: `px-4 pb-4` + estilo de seção. — DoD: 4 screenshots.
- [ ] **19.** Testes de `contact-details/__tests__` verdes; `npx tsc -b --force` 0; lint-ratchet novas=0; `grep -rnE "bg-\[#|text-\[#|hsl\(" src/components/inbox/contact-details src/components/inbox/ContactDetails*.tsx | grep -v "var(--"` = 0; `grep -rn "Joaquim\|Sicoob" src/components/inbox/contact-details` = 0. — DoD: saídas no ledger.
- [ ] **20.** Commit `feat(painel): fase 4 — fidelidade (abas no topo, header, seções, tiles coloridos)`. Push `--no-verify`. Screenshots `painel-04-{contact,history,tasks,notes,files}.png` em 1672×941 + medidas (painel w, abas h, avatar, badge, Editar h, tiles). Abrir PR `feat(inbox): painel direito com 5 abas — fidelidade carvão` para `main` via API (`gh` não está autenticado — use `curl` com o token que o git remote já usa: `git config --get remote.origin.url` mostra se há token embutido; senão use `GH_TOKEN` de `/workspace/.secrets/*.env` se existir; se nenhum, registre "PR pendente: sem token" no ledger e pare). **Não merge.** — DoD: URL do PR na última linha do stdout.

**CP4 — Fidelidade.** Gate: painel 380±4 · abas 44±2 no topo · avatar 72 · badge 24 · Editar 36±2 · 5 tiles 56 · 18/18 seções · 0 cor literal · 0 nome inventado · 5 screenshots · PR aberto (ou pendência registrada). Ledger `docs/design/PAINEL_STATUS.md` com CP4 + 3 linhas honestas "o que ainda difere da referência".
