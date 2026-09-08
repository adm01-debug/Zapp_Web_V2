# PROMPT DE EXECUÇÃO — INBOX 360°: ABAS DA CONVERSA + PAINEL DO CONTATO | ZAPP WEB V2

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR) · **Worktree:** `/workspace/repos/Zapp_Web_V2-inbox` · **Branch:** `feat/inbox-360` (base `origin/main` @ `249501ae`, já contém o commit `a03541b0` com `ConversationTabs`/`ConversationTabContent`/`useConversationTabCounts`)
> **Deploy:** Vercel `zapp_web_v2` (`prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp`, team `juca1`) — preview automático por branch. Push **sempre** com `git push --no-verify origin feat/inbox-360` (o hook pre-push trava a sessão).
> **Tela alvo:** `https://zapp-web-v2.vercel.app/?view=inbox` com uma conversa aberta.
> **Referências visuais (7 JPEG 1672×941, LEIA TODAS com a ferramenta Read antes de codar):** `/workspace/qa/ref/inbox/01-crm360.jpg` · `02-arquivos.jpg` · `03-ia.jpg` · `04-notas.jpg` · `05-tarefas.jpg` · `06-historico.jpg` · `07-chat.jpg` (aba Chat: banner IA + aba Pedidos)
> **Ledger obrigatório:** `docs/design/INBOX_360_STATUS.md` (template no Apêndice F)
> **Instrução literal de Joaquim:** *"MANTENHA AS CORES CARVÃO RECÉM CRIADA E IMPLEMENTE O RESTANTE."*

---

## ⚠️ REESCOPO 08/09/2026 — PREVALECE SOBRE TUDO ABAIXO

Instrução literal de Joaquim (08/09/2026, com 7 prints): **"FAÇA UMA ANÁLISE EXAUSTIVA NAS IMAGENS EM ANEXO E IMPLEMENTE ESSAS MELHORIAS NO SISTEMA — MANTENHA O DESIGN SYSTEM ATUAL CARVÃO — IMPLEMENTE APENAS OS SUB MÓDULOS."**

**Sub-módulos = a barra de abas da conversa e o conteúdo de cada aba.** Nada mais.

### R.1 O que ENTRA (escopo desta execução)
- Fase 3 reduzida: etapas **22, 23, 24** + as novas **23a** e **23b** abaixo. A etapa 21 (chat header) **sai**.
- Fases **4, 5, 6** integrais, **exceto a etapa 35** (Insights da IA no painel direito — sai; o card "Risco / sentimento" da aba IA já cobre os fatos derivados).
- Fase 8 e Fase 9 com os ajustes da R.4.
- **23a. Banner "Assistente IA" no topo da aba Chat** (`07-chat.jpg`): renderizado por `ConversationTabContent` **acima** de `children` (o chat), só quando `activeTab === 'chat'`: `rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 flex items-center gap-3` · tile `Sparkles` 32 `bg-primary text-white` · "Assistente IA" 14/600 + "Sugestões de resposta, identificação de intenção e próximos passos." 13 muted · direita: botão **"Ver sugestões"** `h-9 bg-primary text-primary-foreground` → `onTabChange('ia')` · `X` fecha e grava `localStorage['inbox-ai-banner-dismissed']='1'` (por navegador, não por contato). Sem chamada a edge function — é só atalho. `data-testid="chat-ai-banner"`. DoD: aparece na aba Chat, some ao fechar, "Ver sugestões" abre a aba IA.
- **23b. Aba "Pedidos"** (`07-chat.jpg` mostra `Pedidos 3` entre CRM 360° e Tarefas): `ConversationTabs` ganha `{ id: 'orders', label: 'Pedidos', icon: ShoppingBag }` na posição 4 (Chat · IA · CRM 360° · **Pedidos** · Tarefas · Notas · Arquivos · Histórico); tipo `ConversationTab` inclui `'orders'`. Conteúdo = novo `tabs/OrdersTab.tsx`: cabeçalho ("Pedidos" 18/700 + "Compras e propostas deste contato." 13 muted) + o **`ContactPurchasesPanel` existente** (reaproveitado, sem duplicar) + lista "Propostas em aberto" do `useContactCrm360` (mesmo bloco da aba CRM, extraído para um subcomponente compartilhado `tabs/OpenDealsList.tsx` para não duplicar). Badge da aba = `contact_purchases` count do `useContactCrm360` (client-side; **a RPC `get_conversation_tab_counts` não muda**) — para isso `ConversationTabs` aceita `extraCounts?: { orders?: number }` opcional (default nada). Empty state honesto "Nenhum pedido registrado". `data-testid="conversation-tab-orders"`. DoD: aba renderiza, badge some quando 0, sem query duplicada.
- Da `07-chat.jpg`, **NÃO replicar**: barra de ações com rótulos acima do composer (Resposta Rápida/Assistente IA/Anexar/Agendar/Transferir/Mais) — as mesmas ações já existem como ícones em `InputExtraTools`/`ChatInputToolbars` e `ChatInputArea` é congelado; card de produto dentro da bolha (não existe tipo de mensagem "produto" em `messages` — só o fluxo de envio `onSendProduct`); placeholder do input (já é igual); painel direito da imagem 1 (Dados principais / Resumo comercial / Última atividade / Intenções detectadas) — painel está fora do escopo. Registrar os 3 primeiros em "Pendências / resíduos" do ledger.

### R.2 O que SAI (não tocar nesta execução)
- **Fase 2 inteira** (coluna de conversas): `ConversationListSidebar.tsx`, `ConversationList.tsx`, `VirtualizedConversationList.tsx`, `VirtualizedRealtimeList.tsx`, `InboxFilters.tsx`, `TicketTabs.tsx`, `ContactTypeFilter.tsx`, `src/hooks/inbox/useInboxFilters.ts` — **zero diff**. (Um começo de Fase 2 foi descartado com `git checkout --` em 08/09; o worktree está limpo.)
- **Etapa 21** (chat header): `chat/ChatHeader.tsx`, `ChatPanelHeader.tsx`, `ChatHeaderToolbar.tsx`, `CrmBadges.tsx` — zero diff.
- **Fase 7 inteira** (painel direito): `ContactDetails.tsx`, `contact-details/*`, `contactDetailSections.ts`, `ContactDetailsResponsive` — zero diff. Etapa 35 sai junto.
- `RealtimeInboxView.tsx`: **sem mudar larguras**; só se for imprescindível passar `onUseSuggestion`/`onTabChange` até `ConversationTabContent` (diff de poucas linhas). Estado de aba continua ancorado no `contactId`.
- As referências continuam valendo **só para o miolo** (barra de abas + conteúdo). Ignore lista, header e painel ao ler as imagens.

### R.3 Estado de partida (não refaça)
- CP0 e CP1 **fechados** no ledger: commits `a250b8b8` (fase 0) e `2d54c038` (fase 1 — hooks `useContactMedia`, `useContactNotes`, `useConversationTasks`, `useContactCrm360`, `useConversationHistoryTimeline`, `useNextBestAction`, 21 testes). Não recrie hooks; consuma-os.
- Baselines do CP0 valem: typecheck = 6 erros herdados em `settings/theme`; `typecheck-ratchet.mjs` tem bug pré-existente (exit 2 do tsc) — registre e siga, não "conserte" o script.
- **Comece na Fase 3 (etapa 22).** Ordem: 3 → 4 → 5 (sem 35) → 6 → 8 → 9.

### R.4 Ajustes de QA e entrega
- E.1: screenshots só das **8 abas do centro** (`chat`, `ia`, `crm`, `orders`, `tasks`, `notes`, `files`, `history`) → `out/inbox-11-<aba>.png`; o argumento `<panelTab>` fica sem uso.
- E.2: asserts válidos = `tabBar 48±2 · tabActive 36±2 · kpiStrip 84±6 · scrollW ≤ innerW` + reduced-motion. Os de lista/header/painel (`listCol`, `chip`, `search`, `listItem`, `listAvatar`, `chatHeader`, `headerBtn`, `rightCol`, `rightAvatar`, `actionTile`) **não se aplicam** — registre "fora de escopo".
- E.3: manter as 6 amostras (fundo, coluna esquerda, card do centro, painel direito, chip ativo, botão primário) — coluna e painel devem sair **iguais ao `00-before`** (prova de zero diff).
- E.4: checks válidos = 1, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 22 + novos **23** (banner IA: "Ver sugestões" abre aba IA; X esconde) e **24** (aba Pedidos renderiza e badge some com 0). Os checks 2, 4, 5, 19, 20, 21 viram "não regrediu": lista carrega e painel abre/fecha como antes. Total: **18 checks**.
- Fase 9: PR `feat(inbox): sub-módulos da conversa — Chat/IA/CRM 360°/Pedidos/Tarefas/Notas/Arquivos/Histórico (paleta carvão mantida)`. Corpo lista explicitamente o que ficou de fora (Fase 2, etapa 21, Fase 7, etapa 35, resíduos da R.1).
- Ledger: CP2 e CP7 já estão marcados `FORA DE ESCOPO`. Não os reabra.

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 O que "manter as cores" significa (regra número 1)
As referências são **navy**. Produção é **carvão** (`--background: 240 6% 6%`, `--card: 240 5% 10%`, `--border: 240 4% 18%`, `--primary: 221 83% 53%`) desde o PR #275. **Nenhum token de cor, fonte, radius ou sombra muda.** Proibido: editar `src/styles/tokens.css`, `src/index.css`, `tailwind.config.ts`, `index.html`, `src/components/settings/theme/presets.ts`, qualquer classe `bg-[hsl(...)]`/`text-[#...]` com cor literal. A paleta navy das imagens é traduzida assim: fundo de página → `bg-background`; card → `bg-card border-border`; superfície secundária → `bg-muted/40`; azul → `primary`; verde → `success`; amarelo/laranja → `warning`; vermelho → `destructive`; roxo dos tiles → `bg-primary/15 text-primary` (não existe token roxo — não invente). Chips de destaque: `bg-primary/15 text-primary border border-primary/30`; item ativo de lista: `bg-primary/10 border-primary/40`. O que muda é **layout, hierarquia, componentes e dados** — não a tinta.

### 0.2 Regras invioláveis
1. **Evidência ou não aconteceu.** Cada checkpoint fecha com screenshot (caminho), saída de script e SHA no ledger. Nunca escreva "pixel-perfect", "idêntico", "validado" — escreva o número.
2. **Diff mínimo.** Componentes existentes são reaproveitados; reescrita de arquivo inteiro só onde a seção 3.4 autoriza.
3. **Zero regressão.** A seção 4 é contrato. Cada handler existente continua ligado.
4. **Zero dado inventado.** Os nomes/valores das imagens (Joaquim, Ana Souza, R$ 12.450,00, "+28%", "Score 92", "Segmento Varejo") são **proibidos** no código. Bloco sem fonte no banco → empty state honesto ("Nenhuma compra registrada") ou omissão do campo. Delta/percentual só quando computável de dado real.
5. **Backend congelado.** As duas migrations já estão aplicadas no projeto `tnnnlkbymytvtqngbbqh` e registradas em `schema_migrations`: `20260907200000` (RPC `get_conversation_tab_counts`) e `20260907230000` (`contact_notes.category/is_done/due_date`). Você só cria o arquivo `.sql` da segunda em `supabase/migrations/` (Apêndice A) e atualiza `src/integrations/supabase/types.ts` à mão. **Nenhuma outra migration, RLS, RPC ou tabela.**
6. **Ratchets são gates:** após cada fase `npm run typecheck` (**baseline = 6 erros pré-existentes**, todos em `src/components/settings/theme/{presets.ts,PresetCard.tsx}` e `ThemeCustomizer.tsx` — herdados do PR #275; não toque nesses arquivos; qualquer erro fora deles = FAIL) · `node scripts/ci/lint-ratchet.mjs` · `node scripts/ci/typecheck-ratchet.mjs` · `npm run implicit-any-check` · `npx vitest run src/components/inbox src/hooks/chat`. Baseline só muda seguindo `scripts/ci/README.md`.
7. **Armadilha do lint-ratchet:** ele casa violações legadas por `contextHash`; inserir código *antes* de uma violação antiga acusa dívida nova → mova a inserção para depois.
8. **Sessão `claude -p`:** nunca `pkill -f` com padrão genérico (mata a própria sessão). Preview local: `npm run build && npx vite preview --port 4180 & echo $! > /workspace/qa/inbox-preview.pid`; matar com `kill $(cat /workspace/qa/inbox-preview.pid)` ou `fuser -k 4180/tcp`.
9. **Shell `dash`, sem `python3`.** QA em Node (Playwright já instalado em `/workspace/qa`).
10. **Máximo 3 iterações por loop visual.** Na 3ª, registre o resíduo e siga.
11. **Um commit por fase**, mensagem `feat(inbox): fase N — <o que>`. Branch `feat/inbox-360`, PR para `main`, nunca push direto em `main`.
12. **Sem biblioteca nova.** Stack: React 19, Tailwind 3.4, shadcn/Radix, framer-motion 12, TanStack Query 5, lucide-react, date-fns.
13. **Chat sempre montado.** A aba Chat é escondida, nunca desmontada (perderia scroll, rascunho, gravação, realtime). Já está assim em `ConversationTabContent`. Composer de mensagem só existe na aba Chat — decisão registrada (as imagens 3/4/6 mostram composer em outras abas; não replicar).
14. **Se o plano contradiz o código real, o código real vence — registre a divergência no ledger.**

---

## 1. CONTEXTO VERIFICADO (07/09/2026)

### 1.1 Stack e comandos (`package.json`)
Vite + React 19 + TS + Tailwind 3.4 + shadcn + framer-motion 12 + TanStack Query 5. Scripts: `typecheck` (= `tsc -b --force`), `test` (vitest), `lint`, `implicit-any-check`, `build`. Node ≥ 24.

### 1.2 Layout atual do inbox (`src/components/inbox/RealtimeInboxView.tsx`, 167 linhas + patch das abas)
`<div flex h-full>` → `ConversationListSidebar` (320px, `bg-card border-r`) · centro (`flex-1`: `ConversationTabs` + `ConversationTabContent` que envolve `ChatPanel`) · `ContactDetailsResponsive` (quando `inbox.showDetails`; desktop = `ContactDetails`, mobile = `Sheet`). Estado de aba ancorado no `contactId` (volta para `chat` ao trocar de conversa). Hook `useConversationTabCounts(contactId)` → RPC.

### 1.3 Componentes existentes que serão REAPROVEITADOS (não reescreva o que funciona)
| Área | Arquivo | O que já faz |
|---|---|---|
| Lista | `ConversationListSidebar.tsx` (227) · `ConversationList.tsx` (312) · `VirtualizedConversationList.tsx` · `InboxFilters.tsx` (330) · `ContactTypeFilter.tsx` | header "Conversas", filtros Abertos/Resolvidos/Atendendo/Aguardando com contagens, "Todos os tipos", "Todas filas", "Mostrar Todos", busca, bulk actions, pull-to-refresh |
| Chat header | `chat/ChatHeader.tsx` (208) · `chat/ChatPanelHeader.tsx` (128) · `chat/ChatHeaderToolbar.tsx` (79) · `chat/CrmBadges.tsx` (70) · `chat/ChatAssignedBar.tsx` | avatar, nome, status, badges CRM, ações (ligar, busca, IA, detalhes, mais) |
| IA | `AIConversationAssistant.tsx` (301) · `AISuggestions.tsx` · `ConversationSummary.tsx` (110) · `ObjectionDetector.tsx` (233) · `NextBestActionEngine.tsx` (212) · `LeadRiskScorePanel.tsx` (143) · `SentimentIndicator.tsx` · `AnalysisBadges.tsx` · `hooks/chat/useConversationAnalyses.ts` · `useLatestAnalysis.ts` | edge functions de análise, sugestão, resumo, objeções, NBA, risco |
| CRM | `ContactPurchasesPanel.tsx` (156) · `contact-details/ContactStatsSection.tsx` · `Contact360Helpers.tsx` · `ContactIntelligencePanel.tsx` · `hooks/crm/useContactEnrichedData.ts` | compras, stats, helpers 360 |
| Tarefas | `ConversationTasksPanel.tsx` (197) · `RemindersPanel.tsx` | CRUD de `conversation_tasks` (title, priority, status, due_date, assigned_to) |
| Notas | `PrivateNotes.tsx` (164) · `ConversationMemoryPanel.tsx` | CRUD de `contact_notes` |
| Arquivos | `MediaGallery.tsx` (200, `MediaGalleryContent`) · `MediaPreview.tsx` · `ImagePreview.tsx` · `VideoFullscreen.tsx` · `AudioMessagePlayer.tsx` · `ForwardMessageDialog.tsx` | query `['media-gallery', contactId]`, preview, forward |
| Histórico | `ConversationHistory.tsx` (273) · `ConversationTimeline.tsx` (142, `conversation_events`) | sessões e eventos |
| Painel direito | `ContactDetails.tsx` (141) → `contact-details/{ContactHeaderSection, ContactActionButtons, ContactAccordionSections, ContactInfoSection, WhatsAppStatusSection, EvolutionContactProfileSection, SLAAndAITagsSection, AssignmentSection, ContactStatsSection, ContactIntelligencePanel, ExternalContact360Panel, EditContactDialog, contactDetailSections.ts}` · `KnowledgeBaseSearchPanel.tsx` | accordion com 18 seções (info, whatsapp-status, evolution-profile, sla-ai, crm-360, intelligence, tags, assignment, tasks, reminders, memory, scoring, purchases, notes, timeline, history, stats, media) com estado persistido em localStorage |

### 1.4 Dados reais disponíveis (Supabase `tnnnlkbymytvtqngbbqh`, verificado via SQL)
- `contacts`: id, name, phone, email, avatar_url, assigned_to, company, job_title, nickname, tags (array), notes (text), contact_type, ai_priority, ai_sentiment, channel_type, lead_score, risk_score, lead_origin, consent_status, conversation_status, conversation_status_changed_at, created_at, updated_at, queue_id, is_lid_legacy. **1.517 linhas; 963 com mensagens.**
- `messages` (17.642): contact_id, sender, content, created_at, is_read, status, media_url, media_type, media_mimetype, media_filename, media_size, media_meta, caption, ptt, transcription, agent_id, reply_to_id, is_deleted.
- `conversation_events` (3.232): event_type, from/to_agent_id, from/to_queue_id, metadata, performed_by, created_at.
- `conversation_tasks` (0): title, description, assigned_to, created_by, due_date, priority, status, completed_at.
- `contact_notes` (0): content, author_id, **category** (`note|fact|objection|promise`, default `note`), **is_done**, **due_date**.
- `contact_purchases` (0): title, description, amount, currency, status, purchase_type, deal_id, purchased_at.
- `sales_deals` (0): title, value, currency, stage_id, contact_id, assigned_to, priority, expected_close_date, status, won_at, lost_at. `sales_pipeline_stages` (0): name, color, position, is_active. `deal_activities` (0).
- `products` (0): name, price, currency, image_url, category, is_active. `reminders` (0). `tags`/`contact_tags` (0).
- RPCs: `get_conversation_tab_counts(p_contact_id)` → `tasks_open, notes_total, files_total`; `mark_first_response`; `get_last_message_dates`.
- **Não existe:** tabela de propostas separada (usar `sales_deals` com `status='open'`), "produtos de interesse" (usar `contact_tags`→`tags.name` e `contacts.tags`), "segmento/porte/localização" (não há — omitir), "última visualização WhatsApp" (só se `WhatsAppStatusSection` já obtiver da Evolution).
- Usuário de QA (supervisor): `ZAPP_QA_EMAIL`/`ZAPP_QA_PASSWORD` em `/workspace/.secrets/zapp-v2.env`. A lista vem vazia por padrão para ele — clique **"Mostrar Todos"** no script de QA antes de abrir uma conversa.

---

## 2. SPEC VISUAL (medida nas 6 imagens; cores traduzidas para tokens carvão)

### 2.1 Geometria geral (viewport 1672×941, sidebar do shell 232px)
| Bloco | Medida alvo | Tol. |
|---|---|---|
| Coluna de conversas | **340px** (≥1536px); 320 abaixo | ±8 |
| Painel direito (contato) | **390px** (≥1536px); 360 abaixo | ±8 |
| Header da lista ("Conversas" + badge + Nova conversa) | h 56 | ±4 |
| Chips de status da lista | h 32, radius 8, gap 8, 2 linhas com wrap | ±2 |
| Busca da lista | h 40, radius 10; botão filtro 40×40 | ±2 |
| Item de conversa | h 78–84, avatar **44**, padding 12, radius 12; selecionado `bg-primary/10 border border-primary/40` | ±6 |
| Chat header (avatar 48, nome 18/700, linha status+badges, 4 botões 40×40) | h 72 | ±4 |
| Barra de abas do centro | h 48; aba h 36 radius 8 px-14, ícone 16, texto 14/500 (ativa 600) | ±2 |
| Conteúdo das abas | padding 20, grid gap 16, cards radius 14 `bg-card border-border` | ±4 |
| KPI strip (CRM/Histórico/Tarefas) | h 84, 4 (ou 3) células com divisória `border-border/60` | ±6 |
| Abas do painel direito | h 44, underline 2px `bg-primary` na ativa, texto 14/500 | ±2 |
| Avatar do painel direito | 72 com badge WhatsApp 20 no canto | ±2 |
| Ações rápidas (Ligar/Vídeo/E-mail/Transferir/Mais) | 5 tiles 56×56 radius 12 `bg-muted/40`, ícone 18, label 11 | ±2 |
| Seções do painel direito | cabeçalho h 40 (ícone tile 24 + título 14/600 + chevron), corpo p-4 | ±4 |

Tipografia: a do app (PJS/Outfit já em tokens). Escala usada: título de aba 18/700; subtítulo 14 muted; título de card 14/600; texto 13; meta 12 muted; KPI valor 24/700 `tabular-nums`; badge 11/600.

### 2.2 Coluna de conversas (todas as imagens)
- Linha 1: **"Conversas"** 22/700 + badge total (`bg-muted text-foreground` h-6 px-2 rounded-full, `toLocaleString('pt-BR')`) · direita: botão **"+ Nova conversa"** `h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold` (handler `inbox.setShowNewConversation(true)`).
- Linha 2–3: chips de status **derivados dos filtros que já existem** em `useInboxFilters`/`ConversationListSidebar` (hoje: Abertos, Resolvidos, Atendendo, Aguardando + contagens): `Todas <total>` · `Não lidas <n>` (só se houver contagem de não lidas no hook; senão omitir) · `Em atendimento <n>` (= Atendendo) · `Aguardando <n>` · `Resolvidas <n>`. **Spam** só se existir status `spam` em `conversation_status` (grep no tipo); senão omitir. Chip: `h-8 px-3 rounded-lg text-[13px] font-medium bg-muted/40 border border-border/60`; ativo `bg-primary/15 text-primary border-primary/40`; contagem em pill `h-5 px-1.5 rounded-full text-[11px] bg-muted` (ativa `bg-primary text-white`; Aguardando `bg-warning/20 text-warning`; Não lidas `bg-destructive/20 text-destructive`).
- Linha 4: busca `h-10 rounded-[10px] bg-input border-border pl-9` ("Buscar conversas...") + botão filtro `w-10 h-10 rounded-[10px] border border-border` (abre `InboxFilters` — hoje "Filtros"). "Todos os tipos", "Todas filas", "Mostrar Todos" migram para **dentro** do popover de filtros (mesmos handlers). Bulk actions e pull-to-refresh intactos.
- Item (`ConversationList`/`VirtualizedConversationList` — só classes e um sub-bloco novo): avatar 44 + badge canal 16 (`bg-success` com ícone WhatsApp) · nome 15/600 truncado · hora 12 muted à direita · preview 13 muted truncado · linha de chips 11/500 (`CrmBadges` já existe: tipo do contato, VIP, canal) · direita embaixo: badge de não lidas `w-5 h-5 rounded-full bg-primary text-[11px]` ou `Star` outline 14 muted. Hover `bg-muted/40`.

### 2.3 Chat header (centro, todas as imagens)
Reaproveitar `ChatPanelHeader`/`ChatHeader`: avatar 48 com dot online · nome 18/700 + `Star` (favorito — se já existir toggle de favorito use-o; senão só ícone sem handler **não** — omita) · linha 2: `● Online` (só se `WhatsAppStatusSection` fornecer presença; senão o status de atendimento atual) + badges (`CrmBadges`: tipo, VIP, prioridade `ai_priority`) · direita: 4 botões `w-10 h-10 rounded-lg border border-border bg-card` (`Phone` → `onStartCall`, `Video` → só se já houver handler de vídeo, senão omitir, `UserPlus` → transferir (`openDialog('transferDialog')`), `MoreVertical` → menu existente). Manter `ChatAssignedBar`, busca no chat, modo zen, `onToggleDetails`.

### 2.4 Abas do centro (`ConversationTabs` — já existe; ajustar)
Ordem e rótulos: **Chat · IA · CRM 360° · Tarefas · Notas · Arquivos · Histórico**. Aba h-9 → manter; classes da ativa `bg-primary/15 border border-primary/40 text-foreground font-semibold` (hoje `bg-primary/10 border-primary/30 text-primary`). Badges já vêm da RPC. Adicionar `data-testid` já presentes.

### 2.5 Aba CRM 360° (`01-crm360.jpg`)
Grid `grid-cols-1 xl:grid-cols-2 gap-4`, scroll próprio.
1. **KPI strip** (full width, 4 células): `Cliente desde <created_at dd MMM yyyy>` (`Calendar`) · `Lead score <lead_score>` (`BarChart3`; rótulo "Alto potencial" só se `lead_score ≥ 80`, "Médio" 50–79, "Baixo" < 50; sem score → "Sem score") · `Última interação <última msg, relativa>` (`MessageSquare`) · `Status <conversation_status pt-BR>` (`Circle` colorido).
2. **Empresa** (`Building2`; botão "Adicionar empresa" → abre `EditContactDialog` no campo empresa): avatar + `contacts.company` (ou "Sem empresa"), `job_title` como cargo, CNPJ/CPF **só se existir campo** (não há → omitir linha). Segmento/Porte/Localização **não existem → não renderizar**.
3. **Etapa no funil** (`Target`; "Ver funil →" → `onViewChange('pipeline')` via `NavigationService`/`useNavigation` já existente): stepper horizontal com `sales_pipeline_stages` (is_active, order position); etapa atual = `stage_id` do `sales_deals` mais recente com `status='open'` do contato. Sem deal → stepper cinza + "Nenhuma negociação aberta" + botão "Criar negociação" (abre o diálogo de deal que o Pipeline já usa — `grep -rn "CreateDealDialog\|NewDealDialog" src/components/pipeline`; se não houver diálogo reutilizável, navegar para o pipeline). Caixa "Última atualização" = `sales_deals.updated_at`. "Avançar etapa" só com deal aberto (update `stage_id` → próxima `position`, mesma mutation que o Pipeline usa).
4. **Últimas compras** (`ShoppingBag`; "Ver todas →" abre a seção `purchases` do painel direito): até 3 de `contact_purchases` (title, amount pt-BR, purchased_at, status pill com o mapa de `ContactPurchasesPanel`). Vazio → "Nenhuma compra registrada".
5. **Propostas em aberto** (`FileText`): até 3 de `sales_deals` `status='open'` (title, value, expected_close_date, pill "Em aberto" `bg-warning/15 text-warning`). Vazio → "Nenhuma proposta em aberto".
6. **Ticket médio**: `avg(amount)` de `contact_purchases` com `status in ('completed','approved')`; delta vs. 6 meses anteriores só se houver ≥ 1 compra em cada janela; senão sem delta. Vazio → "—".
7. **Produtos de interesse**: chips de `tags.name` via `contact_tags` + `contacts.tags` (dedup, até 3 + "+N"). Vazio → "Nenhum interesse marcado".
8. **Próxima melhor ação** (`Zap`): primeira ação de `NextBestActionEngine` (extraia a lógica de cálculo para um hook `useNextBestAction(contactId, contactName)` se estiver acoplada ao JSX; **não duplique**); botão "Criar tarefa →" cria `conversation_tasks` com o título da ação (mutation de `ConversationTasksPanel`).
9. **Pipeline comercial** (`TrendingUp`; "Ver pipeline →"): soma de `sales_deals.value` por grupo — Em propostas (`status='open'` e estage cujo nome contém "propost"), Em negociação (`open` restante), Ganhos (`status='won'`); contagens; barra empilhada proporcional (3 cores: `bg-primary`, `bg-warning`, `bg-success`) + legenda com %. Tudo zero → "Sem negociações".
10. **Últimas interações comerciais** (`History`; "Ver histórico →" troca para aba Histórico): 4 itens mais recentes de `deal_activities` ∪ `contact_purchases` ∪ `conversation_events` (transfer/close/reopen) com dot colorido, data `dd MMM, HH:mm`, texto. Vazio → "Nenhuma interação comercial".
Hook novo: `src/hooks/crm/useContactCrm360.ts` (uma `useQuery(['contact-crm-360', contactId])` que faz **em paralelo** os selects de `contact_purchases`, `sales_deals` + `sales_pipeline_stages`, `contact_tags(tags(name))`, `deal_activities`; `staleTime 60_000`). Teste unitário das agregações (ticket médio, grupos do pipeline) com dataset sintético.

### 2.6 Aba Arquivos (`02-arquivos.jpg`)
- Cabeçalho: "Arquivos compartilhados" 18/700 + "Todos os arquivos, mídias e documentos desta conversa." 13 muted.
- Toolbar: busca `h-10` "Buscar arquivos..." (filtra `media_filename`/`caption`) · botão filtro 40×40 (abre popover com faixa de data) · `Select` "Mais recentes / Mais antigos / Maiores".
- Chips de tipo com contagem real: `Todos <n>` · `Imagens` · `Vídeos` · `Áudios` · `Docs` (classificar por `media_type`/`media_mimetype`: `image/*`, `video/*`, `audio/*` ou `ptt`, resto = doc). Chip ativo `bg-primary text-white`.
- Grid `grid-cols-2 2xl:grid-cols-3 gap-3`: card `rounded-xl border border-border bg-card` com miniatura 16:10 (`img` para imagem; vídeo = primeiro frame indisponível → `bg-muted` + `Play` 32 + duração de `media_meta.duration` se existir; áudio = `bg-muted` + `Play` + duração; doc = ícone por extensão + nome) · nome 13/600 truncado · "<Tipo> · <tamanho>" 12 muted (`media_size` formatado; sem tamanho → só tipo) · data `format(created_at, "dd MMM yyyy, HH:mm")` ("Hoje, HH:mm" se hoje) · remetente (mini avatar 16 + "Você" quando `sender='agent'` senão nome do contato) · rodapé com 4 botões ghost 28×28: `Eye` (abre `MediaPreview`/`ImagePreview`/`VideoFullscreen` existentes), `Download` (`<a download>`), `Share2` (`ForwardMessageDialog`), `MoreVertical` (menu: Copiar link, Excluir mensagem — usa `MessageContextActions` existente se aplicável).
- Painel de detalhe **dentro da aba** (coluna direita `w-[220px]`, aparece ao selecionar um card, botão X fecha): miniatura grande, nome, "Tipo · tamanho", data completa, "Enviado por X", caption em bolha `bg-muted/40` se houver, botões: **Baixar arquivo** (`bg-primary` full), Encaminhar, Copiar link, Salvar na galeria (só se já existir handler; senão omitir), Excluir (`text-destructive`, só para mensagens do agente e com a confirmação já existente).
- Fonte: reutilizar a query `['media-gallery', contactId]` de `MediaGalleryContent` — **estender o select** para `media_type, media_mimetype, media_filename, media_size, media_meta, caption, sender, created_at` e mover a query para `src/hooks/chat/useContactMedia.ts` para ser compartilhada com o painel direito (aba Arquivos). `MediaGalleryContent` passa a consumir o hook (sem mudar comportamento).

### 2.7 Aba IA (`03-ia.jpg`)
- Banner `rounded-xl border border-primary/30 bg-primary/10 p-4`: tile `Sparkles` 40 `bg-primary text-white`, "Assistente IA" 15/600 + "Seu copiloto para conversas mais produtivas" 13 muted; direita: `● <status>` — "Analisando a conversa..." enquanto a análise (`useConversationAnalyses`/`useLatestAnalysis`) estiver carregando, "Análise atualizada às HH:mm" depois.
- Grid 2 colunas × 3 linhas (cada card `rounded-xl border bg-card p-4`, título com ícone 16 + ação à direita):
  1. **Sugestão de resposta** ("Usar resposta" `bg-primary/15 text-primary`): texto da sugestão de `AISuggestions`/`AIConversationAssistant`; chips "Mais formal / Mais casual / Mais curta / Mais detalhada" → `AIRewriteButton`/rewrite existente com o modo correspondente. "Usar resposta" → `onUseSuggestion(text)`: coloca o texto no input do chat e troca para a aba Chat (descubra o mecanismo de draft em `chat/useChatInputLogic.ts`/`ChatMessageInput`; se não houver API, dispare o `CustomEvent` que `MessageTemplates`/`QuickRepliesManager` já usam — `grep -rn "insert-text\|setInputValue\|CustomEvent" src/components/inbox/chat`).
  2. **Resumo da conversa** ("Copiar" → clipboard): bullets de `ConversationSummary` (reutilize o componente com um prop `variant="card"` novo, default = atual).
  3. **Objeções detectadas** (badge com contagem): linhas de `ObjectionDetector` (objeção, citação, pill de confiança Baixo/Médio/Alto por `confidence`).
  4. **Próxima melhor ação** ("Ver todas"): caixa destaque `bg-primary/10 border-primary/30` com a 1ª ação + descrição + `ChevronRight`; abaixo até 3 sub-passos como checklist (só se o engine fornecer sub-passos; senão lista as demais ações).
  5. **Produtos recomendados** ("Ver catálogo" → `onViewChange` para a view de catálogo/produtos se existir; senão omitir link): até 3 `products` (`is_active`, por `category` que case com tags do contato; fallback: 3 mais recentes) com imagem 40, nome, `retailer_id`/categoria, preço pt-BR verde, botão "Adicionar" (`catalogDirect` do `ChatPanel` já existe — reaproveite o mesmo fluxo; se não for reutilizável sem o `ChatPanel`, o botão insere o nome+preço no input). Sem produtos → "Nenhum produto cadastrado".
  6. **Risco / sentimento** (pill Positivo/Neutro/Negativo por `contacts.ai_sentiment`): ícone `Smile`/`Meh`/`Frown` 40, título e descrição de `LeadRiskScorePanel`/`SentimentIndicator`; chips de fatores só quando vierem da análise (sem análise → "Sem análise recente" + botão "Analisar agora" que dispara a análise existente).
- **Insights da IA no painel direito** (só nesta aba, seção acima de Tags): até 4 fatos **derivados**: "Já comprou Nx (R$ total)" (contact_purchases), "Lead score N" (lead_score), "Canal preferido: <channel_type>", "Sentimento <ai_sentiment>". Sem dado → seção não renderiza.

### 2.8 Aba Notas (`04-notas.jpg`)
- Banner `bg-primary/10 border-primary/30` com `Sparkles`: "Suas notas, mais resultados" + "Registre informações, compromissos e aprendizados para um atendimento cada vez melhor." + X (fecha; `localStorage['inbox-notes-banner-dismissed']`).
- Grid 2 colunas, 6 cards; cada card: tile ícone 28, título 14/600 + "(n)", botão "+ Adicionar" `bg-primary/15 text-primary h-8` (abre um `Textarea` inline no topo do card; Enter/Ctrl+Enter salva; Esc cancela), lista com scroll interno `max-h-[240px]`:
  1. **Notas privadas** (`FileText`, `category='note'`): texto 13, rodapé "dd MMM yyyy · HH:mm · Por: <autor>" 12 muted + kebab (Editar/Excluir — só do próprio autor, RLS).
  2. **Fatos relevantes** (`Lightbulb`, `category='fact'`): bullets.
  3. **Objeções** (`XCircle`, `category='objection'`): texto entre aspas + pill opcional (primeira palavra entre colchetes `[Preço]` vira a pill — convenção documentada no placeholder "Ex.: [Preço] Acha o valor alto").
  4. **Promessas feitas** (`Handshake`, `category='promise'`): checkbox (`is_done`) + texto + `due_date` `dd/MM/yyyy` à direita; input aceita data via `DatePicker` existente (se houver) ou campo `type="date"`.
  5. **Pendências** (`Clock`): = `conversation_tasks` com `status<>'completed'` (título + due_date; vermelho se vencida/hoje); "+ Adicionar" cria tarefa (mesma mutation da aba Tarefas). Sem pendências → "Nenhuma pendência".
  6. **Resumo comercial** (`BarChart3`; "Editar"): `contacts.notes` (texto livre existente), edição inline, salva com a mutation de update de contato já usada por `EditContactDialog`.
- Rodapé: banner `Sparkles` "Transforme conversas em resultados — Mantenha suas notas sempre atualizadas e tenha todo o contexto na hora de falar com o cliente." (estático, sem composer).
- Hook: `src/hooks/chat/useContactNotes.ts` (`useQuery(['contact-notes', contactId])` select `*` order `created_at desc`; mutations insert/update/delete que invalidam `['contact-notes']` **e** `conversationTabCountsKey(contactId)`). `PrivateNotes.tsx` passa a consumir o hook filtrando `category='note'` (sem mudar UI). Migration SQL no repo (Apêndice A) + `types.ts` atualizado à mão.

### 2.9 Aba Tarefas (`05-tarefas.jpg`)
- Banner: tile `ListTodo` 40, "Tarefas desta conversa" + "Organize e acompanhe todas as ações relacionadas a este cliente." · direita "+ Nova tarefa" `bg-primary h-10` (abre o formulário de `ConversationTasksPanel` — extraia `TaskForm` se estiver inline).
- KPI row: 3 cards h-84 `Atrasadas <n>` (`AlertCircle` em tile `bg-destructive/15 text-destructive`, "Requer atenção"), `Para hoje <n>` (`Clock` `bg-warning/15 text-warning`, "Vencem hoje"), `Concluídas <n>` (`CheckCircle2` `bg-success/15 text-success`, "Últimos 7 dias") + `Select` "Todas as tarefas / Minhas / Atribuídas a outros".
- 3 colunas `grid-cols-1 xl:grid-cols-3 gap-4`: **Hoje** (due hoje ou atrasadas; subtítulo = data de hoje por extenso pt-BR) · **Próximas** (due > hoje; "Esta semana" se todas na semana) · **Concluídas recentes** (`completed_at` ≥ 7 dias). Cada coluna: título 14/600 + badge contagem; cards `rounded-xl border bg-card p-3`: checkbox (marca concluída → update `status='completed', completed_at=now()`), título 14/600 (riscado se concluída), descrição 13 muted, pill prioridade (`high` "Alta prioridade" destructive/15 · `medium` "Média" warning/15 · `low` "Baixa" primary/15), linha data (`Clock` vermelho se hoje/atrasada; `Calendar` cinza se futura; formato "Hoje, HH:mm" / "EEE, dd/MM, HH:mm"), responsável (avatar 20 + nome via `profiles`), kebab (Editar/Excluir/Reatribuir — handlers já existentes). Concluída: pill "Concluída" success + "Hoje, HH:mm".
- Hook: `src/hooks/chat/useConversationTasks.ts` — mover a query e as mutations de `ConversationTasksPanel` para o hook (o painel passa a consumir; UI dele inalterada); invalidar `conversationTabCountsKey`.

### 2.10 Aba Histórico (`06-historico.jpg`)
- Cabeçalho: tile `Clock` 40, "Histórico da Conversa" + "Acompanhe toda a jornada de relacionamento com este contato." · direita "Exportar histórico" (`Download`; gera `.txt`/`.csv` client-side com os eventos filtrados — sem backend) + kebab (só se houver ações; senão omitir).
- Filtros: `Período` `Select` (Últimos 7 dias / 30 dias / 90 dias / Tudo; default 30) · `Tipo de evento` `Select` (Todos / Mensagens / Notas / Tarefas / Transferências / Arquivos / Ligações / Propostas).
- KPI row (4): **Total de interações** (mensagens + eventos no período; sub "Mensagens, ligações e ações") · **Último contato** (`dd MMM yyyy` + relativo "Há 2 horas") · **Tempo médio de resposta** (média dos deltas entre mensagem do contato e a próxima do agente no período; pill de delta vs. período anterior só se ambos computáveis; sub "Mais rápido que a média" **só** se houver média global — senão sub vazio) · **Resoluções** (`conversation_events` `event_type in ('close','resolve','resolved')` — confirme os valores reais com `SELECT DISTINCT event_type` via `grep` no código; sub "Conversas finalizadas").
- Timeline: agrupamento por dia com pill de data "Hoje, d 'de' MMMM 'de' yyyy" (`bg-muted/40 border`); linha vertical `bg-border` à esquerda; cada evento: hora 12 muted (coluna 44px), dot 10 colorido na linha, card `rounded-xl border bg-card p-3` com tile ícone 32 + título 14/600 + subtítulo 13 muted + pill à direita. Tipos e cores: mensagem recebida/enviada (`MessageSquare`, primary; pill canal `WhatsApp` success), nota adicionada (`FileText`, roxo→`bg-primary/15`), transferência (`ArrowLeftRight`, success; "De: X · Para: Y"), ligação (`Phone`; só se houver registro — `messages` com `message_type='call'` ou evento; senão o tipo não aparece), arquivo enviado (`Paperclip`; nome + tamanho), tarefa criada (`CheckSquare`, warning; pill Pendente/Concluída), proposta/negociação (`DollarSign`, success; de `sales_deals`/`deal_activities`). **Mensagens:** agrupar rajadas — mensagens consecutivas do mesmo remetente em ≤ 10 min viram 1 evento "N mensagens recebidas/enviadas" com o primeiro texto truncado; limite 200 eventos por carga + "Carregar mais".
- Hook: `src/hooks/chat/useConversationHistoryTimeline.ts` — `useQuery(['conversation-history', contactId, period, type])` unindo `messages` (select mínimo, limit 500 no período), `conversation_events`, `contact_notes`, `conversation_tasks`, `sales_deals`, `deal_activities`; merge e agrupamento em função pura `buildTimeline(rows, opts)` com teste unitário (rajada, agrupamento por dia, filtro por tipo, métricas).

### 2.11 Painel direito (todas as imagens) — `ContactDetails` vira tabbed
- Abas (h-44, underline): **Contato · Histórico · Tarefas · Notas · Arquivos** (`Tabs` Radix; `data-[state=active]:bg-transparent` como GmailInbox faz para preservar o estilo underline). Estado por contato como no centro (volta para Contato ao trocar de conversa).
- **Contato**: `ContactHeaderSection` reestilizado (avatar 72 + badge canal, nome 18/700, telefone com ícone WhatsApp e link `wa.me`, botão "Editar" `h-9 border` → `EditContactDialog`; badges `CrmBadges`) · **ações rápidas** 5 tiles (`ContactActionButtons` → refatorar para tiles com label: Ligar, Vídeo (omitir se sem handler), E-mail (`mailto:` só com email; senão desabilitado), Transferir, Mais (menu com o resto: VIP, arquivar, bloquear, atribuir…)) · seções colapsáveis (Radix `Accordion` que já existe, mantendo `getStoredAccordionState`): **Informações** (`ContactInfoSection`: CNPJ/CPF só se existir, Empresa/Cargo com link "Adicionar …" → editar, Origem = `lead_origin`/`channel_type`, Responsável = `assigned_to` nome, Cliente desde = `created_at`; "Ver mais ▾" expande `EvolutionContactProfileSection` + `SLAAndAITagsSection` + `scoring`) · **Status WhatsApp** (`WhatsAppStatusSection` — pill `● Online` só com presença real; "Última visualização" só se a seção já tiver) · **Insights da IA** (só quando a aba do centro é IA — ver 2.7) · **Tags** (seção `tags` existente: chips + "Adicionar tag") · **Resumo Comercial** (4 mini tiles: `R$ <soma compras>` "Compras (n)", `R$ <ticket médio>` "Ticket médio", `<n>` "Propostas", `<n>` "Em aberto" — do `useContactCrm360`; tudo zero → tiles com "—") · **Tarefas da Conversa** (até 5 tarefas abertas: `Clock` + título + due colorido + avatar responsável; "+ Nova tarefa" → aba Tarefas) · **Mais detalhes** (accordion fechado por default com as seções legadas que não têm lugar acima: `assignment`, `intelligence`, `crm-360` helpers, `memory`, `stats`, `KnowledgeBaseSearchPanel`, `AnalysisBadges`) — **nenhuma seção legada some.**
- **Histórico** (aba): `ConversationHistory` + timeline compacta (mesmo hook 2.10, `variant="compact"`). **Tarefas**: lista compacta (mesmo hook 2.9) + `RemindersPanel`. **Notas**: `PrivateNotes` (todas as categorias, compacto). **Arquivos**: grid 2 colunas compacto do hook 2.6.
- Largura: `w-[390px] 2xl:w-[390px] xl:w-[360px]`; mobile continua `Sheet`.

---

## 3. ARQUITETURA DA MUDANÇA

### 3.1 Arquivos alterados (diff cirúrgico)
| Arquivo | Mudança |
|---|---|
| `RealtimeInboxView.tsx` | larguras; passa `onUseSuggestion`, `activeTab`/`setActiveTab` também para o painel direito (prop `centerTab`) |
| `ConversationListSidebar.tsx` | header novo (título+badge+Nova conversa), chips de status, busca+filtro; filtros secundários movidos para o popover |
| `ConversationList.tsx` / `VirtualizedConversationList.tsx` | classes do item (avatar 44, badge canal, chips, não-lidas/estrela) |
| `chat/ChatPanelHeader.tsx` / `ChatHeader.tsx` / `ChatHeaderToolbar.tsx` | avatar 48, nome 18, linha de badges, 4 botões 40×40 |
| `chat/ConversationTabs.tsx` | classes da aba ativa |
| `chat/ConversationTabContent.tsx` | passa a renderizar as 6 abas novas (`crm/Crm360Tab`, `files/FilesTab`, `ai/AiTab`, `notes/NotesTab`, `tasks/TasksTab`, `history/HistoryTab`) |
| `ContactDetails.tsx` | vira tabbed (5 abas) mantendo `EditContactDialog`, `useConversationActions`, toasts, accordion state |
| `contact-details/ContactHeaderSection.tsx`, `ContactActionButtons.tsx`, `ContactInfoSection.tsx`, `ContactAccordionSections.tsx`, `contactDetailSections.ts` | reorganização das seções (mapa na 2.11), tiles de ação |
| `MediaGallery.tsx`, `PrivateNotes.tsx`, `ConversationTasksPanel.tsx`, `ContactPurchasesPanel.tsx` | passam a consumir os hooks novos (UI inalterada) |
| `ConversationSummary.tsx`, `ObjectionDetector.tsx`, `NextBestActionEngine.tsx`, `LeadRiskScorePanel.tsx` | prop `variant?: 'card'` (default = atual) ou extração da lógica para hook — nunca duplicar |
| `src/integrations/supabase/types.ts` | `contact_notes` + `category/is_done/due_date` |

### 3.2 Arquivos novos
`src/components/inbox/tabs/{Crm360Tab,FilesTab,AiTab,NotesTab,TasksTab,HistoryTab}.tsx` (+ subcomponentes pequenos na mesma pasta: `KpiStrip.tsx`, `TabBanner.tsx`, `SectionCard.tsx`, `TimelineList.tsx`, `FileCard.tsx`, `FileDetailPanel.tsx`, `TaskCard.tsx`, `NoteCard.tsx`) · `src/hooks/crm/useContactCrm360.ts` · `src/hooks/chat/{useContactMedia,useContactNotes,useConversationTasks,useConversationHistoryTimeline}.ts` · testes em `src/components/inbox/tabs/__tests__/` e `src/hooks/chat/__tests__/` · `supabase/migrations/20260907230000_contact_notes_category_done_due.sql` · `docs/design/INBOX_360_STATUS.md` · `/workspace/qa/inbox-*.mjs` (fora do repo).

### 3.3 O que NÃO tocar
Tokens/tema/fonte (0.1) · `AppShell`, `AppHeader`, `Sidebar*`, `BreadcrumbBar`, `ViewRouter` · `supabase/` além do arquivo `.sql` novo · `ChatMessagesArea`, `ChatInputArea`, `MessageBubble*`, realtime hooks (`useRealtimeMessages`, `useRealtimeInbox`, `messageSender`) · os outros worktrees (`Zapp_Web_V2`, `-abas`, `-dashboard`, `-promogifts`) · testes fora de `src/components/inbox` e `src/hooks/chat|crm` (se quebrarem por classe/texto, atualize o teste, nunca o comportamento).

### 3.4 Reescrita autorizada (arquivo inteiro)
`ContactDetails.tsx`, `contact-details/ContactActionButtons.tsx`, `contact-details/ContactAccordionSections.tsx`, `chat/ConversationTabContent.tsx`. Todos os outros: edição cirúrgica.

---

## 4. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP9)
Lista: busca, filtros Abertos/Resolvidos/Atendendo/Aguardando, "Todos os tipos", "Todas filas", "Mostrar Todos", filtros avançados (status/tags/agente/período), bulk actions (seleção múltipla, toolbar), pull-to-refresh mobile, Nova conversa, atualizar, contagens · Chat: enviar texto/áudio/mídia/localização/sticker/emoji, quick replies, slash commands, templates, agendar, transferir, encerrar, ligar, busca no chat, IA (assistente, rewrite, enhance), modo zen, whisper, transcrição, reações, responder/encaminhar/editar/apagar mensagem, atalhos de teclado, typing/presence, PiP mobile, `ChatAssignedBar`, `NextBestActionEngine` no chat · Painel direito: todas as 18 seções (em nova posição), editar contato, VIP/arquivar/bloquear com undo, atribuição, lembretes, memória viva, scoring & LGPD, base de conhecimento, perfil Evolution, stories · Abas: Chat sempre montado; contagens da RPC; volta para Chat ao trocar de conversa · Responsivo: mobile abre detalhes em `Sheet`, lista full-screen, sem overflow horizontal em 390×844.

---

## 5. O PLANO — 9 FASES · 58 ETAPAS · 10 CHECKPOINTS
Formato: `[ ] N. Ação — DoD`. Marque `[x]` só com evidência no ledger.

### FASE 0 — Preparação (1–6) → CP0
- [ ] **1.** `cd /workspace/repos/Zapp_Web_V2-inbox && git status && git log --oneline -3` (esperado: `a03541b0` sobre `249501ae`). Ler os 6 JPEGs de referência com `Read`. Se `graphify-out/GRAPH_REPORT.md` existir e estiver fresco, `graphify explain "ContactDetails"` e `"RealtimeInboxView"`. — DoD: SHA + divergências no ledger.
- [ ] **2.** Deps já instaladas com `bun install --frozen-lockfile` (o repo usa `bun.lock`; `npm ci` falha). `npm run typecheck` deve listar **exatamente 6** erros, todos em `settings/theme` — registre a contagem como baseline. — DoD: contagem no ledger.
- [ ] **3.** Criar `docs/design/INBOX_360_STATUS.md` (Apêndice F). Commit `chore(inbox): ledger inbox 360`. — DoD: commitado.
- [ ] **4.** Criar `supabase/migrations/20260907230000_contact_notes_category_done_due.sql` (Apêndice A) e atualizar `types.ts` (Row/Insert/Update de `contact_notes`). Confirmar no banco que já está aplicada: `curl` na REST `contact_notes?select=category&limit=1` com o anon key + JWT do QA (login em `/auth/v1/token?grant_type=password`) retorna 200. — DoD: 200 + typecheck 0.
- [ ] **5.** QA: `/workspace/qa/inbox-shot.mjs` já faz login e vai para `?view=inbox`. Ajuste-o para clicar **"Mostrar Todos"** e abrir a 1ª conversa; salvar `out/inbox-00-before.png`. Criar `inbox-measure.mjs` (Apêndice E.2) e `inbox-func.mjs` (E.4) como esqueletos. — DoD: `out/inbox-00-before.png` existe e mostra uma conversa aberta.
- [ ] **6.** Baseline dos gates: `npm run typecheck && node scripts/ci/lint-ratchet.mjs && node scripts/ci/typecheck-ratchet.mjs && npm run implicit-any-check && npx vitest run src/components/inbox src/hooks/chat`. — DoD: 5 × exit 0.

**CP0.** Gate: 1–6 com evidência; `00-before.png`.

### FASE 1 — Hooks de dados (7–14) → CP1
- [ ] **7.** `useContactMedia.ts` (2.6): mover a query de `MediaGalleryContent` e estender o select; classificação `kind: 'image'|'video'|'audio'|'doc'`; contagens por tipo; `MediaGalleryContent` consome o hook. — DoD: galeria atual funciona igual; teste de classificação.
- [ ] **8.** `useContactNotes.ts` (2.8): query + mutations (insert com `category`, toggle `is_done`, update, delete); invalida `['contact-notes']` e `conversationTabCountsKey`. `PrivateNotes` consome (filtro `note`). — DoD: criar nota pela UI atual continua funcionando.
- [ ] **9.** `useConversationTasks.ts` (2.9): mover query/mutations de `ConversationTasksPanel`; `complete/reopen/update/delete/create`; derivados `overdue/today/upcoming/completed7d`; invalida `conversationTabCountsKey`. — DoD: painel atual igual; teste dos derivados.
- [ ] **10.** `useContactCrm360.ts` (2.5): selects paralelos + agregações puras `aggregateCrm360(rows)`; teste unitário (ticket médio, delta 6m, grupos do pipeline, últimas interações). — DoD: `vitest` verde.
- [ ] **11.** `useConversationHistoryTimeline.ts` (2.10): união + `buildTimeline` pura + métricas; teste (rajada ≤10 min, agrupamento por dia, filtro tipo, tempo médio de resposta). Descobrir `event_type` reais: `grep -rn "event_type" src/hooks src/components/inbox/ConversationTimeline.tsx`. — DoD: `vitest` verde; valores de `event_type` anotados no ledger.
- [ ] **12.** `useNextBestAction.ts`: extrair de `NextBestActionEngine` só se a lógica estiver acoplada ao JSX (o componente passa a usar o hook). — DoD: `NextBestActionEngine` no chat inalterado visualmente.
- [ ] **13.** `useConversationTabCounts`: manter; adicionar `refetch` nas mutations dos hooks 8/9 (já via invalidate). — DoD: badge Notas incrementa ao criar nota.
- [ ] **14.** Commit `feat(inbox): fase 1 — hooks de mídia, notas, tarefas, CRM 360 e histórico`. Push `--no-verify`. — DoD: preview READY (URL no ledger).

**CP1.** Gate: 5 gates verdes; testes novos verdes; `git diff --stat` sem tocar arquivos da 3.3.

### FASE 2 — Coluna de conversas (15–20) → CP2
- [ ] **15.** Header (2.2 linha 1) em `ConversationListSidebar`. — DoD: "Conversas" + badge com o total real + botão Nova conversa abre o modal.
- [ ] **16.** Chips de status (2.2 linhas 2–3) ligados aos filtros existentes; "Não lidas" só com contagem real. — DoD: clicar em Resolvidas filtra igual ao botão antigo.
- [ ] **17.** Busca h-10 + botão filtro; "Todos os tipos", "Todas filas", "Mostrar Todos" dentro do popover de filtros. — DoD: os 3 continuam funcionando.
- [ ] **18.** Item da lista (2.2 último bullet). — DoD: E.2 → `listItem 78–84`, `listAvatar 44`.
- [ ] **19.** Larguras `w-[340px]` (≥ 2xl) / 320. — DoD: sem overflow em 1280.
- [ ] **20.** Commit `feat(inbox): fase 2 — coluna de conversas`. Push. Screenshot `02-after.png`.

**CP2.** Gate: E.2 `listCol=340±8`, `chip=32±2`, `search=40±2`, `listAvatar=44±2`; bulk actions ok.

### FASE 3 — Chat header + abas (21–24) → CP3
- [ ] **21.** Chat header (2.3). — DoD: E.2 `chatHeader=72±4`, `headerBtn=40±2`; ligar/transferir/menu funcionam.
- [ ] **22.** `ConversationTabs` classes (2.4). — DoD: aba ativa com `bg-primary/15`.
- [ ] **23.** `ConversationTabContent` reescrito para as 6 abas novas (lazy) mantendo o Chat sempre montado; recebe `onUseSuggestion`. — DoD: trocar de aba e voltar mantém o scroll do chat.
- [ ] **24.** Commit `feat(inbox): fase 3 — chat header e abas`. Push. Screenshot `03-after.png`.

**CP3.** Gate: E.2 ok; chat intacto (enviar mensagem no preview com a conta QA para um contato de teste **não** — só verificar que o input aceita texto e o botão habilita).

### FASE 4 — Abas CRM 360° e Arquivos (25–31) → CP4
- [ ] **25.** `Crm360Tab` KPI strip + Empresa + Etapa no funil (2.5 itens 1–3). — DoD: sem deal → empty state; com stages → stepper.
- [ ] **26.** Últimas compras + Propostas + Ticket médio + Produtos de interesse (itens 4–7). — DoD: empty states honestos.
- [ ] **27.** Próxima melhor ação + Pipeline comercial + Últimas interações (itens 8–10). — DoD: "Criar tarefa" cria tarefa real (verificar no banco via REST com o JWT do QA e apagar depois).
- [ ] **28.** `FilesTab` toolbar + chips + grid (2.6). — DoD: contagens dos chips = contagem real das mensagens com mídia do contato.
- [ ] **29.** `FileDetailPanel` + ações (ver, baixar, encaminhar, copiar link, excluir). — DoD: cada ação chama o componente existente.
- [ ] **30.** Testes: `Crm360Tab.test.tsx` (empty states, com dados mockados) e `FilesTab.test.tsx` (chips/filtro). — DoD: verde.
- [ ] **31.** Commit `feat(inbox): fase 4 — abas CRM 360° e Arquivos`. Push. Screenshots `04-crm.png`, `04-files.png`.

**CP4.** Gate: E.2 `kpiStrip=84±6`, cards `rounded-xl`; screenshots; 0 console errors.

### FASE 5 — Abas IA e Notas (32–38) → CP5
- [ ] **32.** `AiTab` banner + Sugestão + Resumo (2.7 itens 1–2) com "Usar resposta" funcionando. — DoD: texto aparece no input e a aba muda para Chat.
- [ ] **33.** Objeções + Próxima melhor ação (3–4). — DoD: componentes reutilizados via prop/hook, não duplicados (`grep` de funções duplicadas = 0).
- [ ] **34.** Produtos recomendados + Risco/sentimento (5–6). — DoD: sem produtos → empty state.
- [ ] **35.** Insights da IA no painel direito (só na aba IA). — DoD: some ao sair da aba.
- [ ] **36.** `NotesTab` (2.8) 6 cards com CRUD por categoria; Pendências = tarefas; Resumo comercial = `contacts.notes`. — DoD: criar "Fato" salva `category='fact'` (verificar via REST) e o badge Notas incrementa.
- [ ] **37.** Testes `AiTab.test.tsx`, `NotesTab.test.tsx`. — DoD: verde.
- [ ] **38.** Commit `feat(inbox): fase 5 — abas IA e Notas`. Push. Screenshots `05-ai.png`, `05-notes.png`.

**CP5.** Gate: screenshots; `grep -rn "Joaquim\|Ana Souza\|12.450\|Score 92" src/components/inbox/tabs` = 0.

### FASE 6 — Abas Tarefas e Histórico (39–44) → CP6
- [ ] **39.** `TasksTab` banner + KPIs + select (2.9). — DoD: KPIs batem com o hook.
- [ ] **40.** 3 colunas + `TaskCard` com checkbox/kebab. — DoD: concluir tarefa move para "Concluídas recentes" sem reload.
- [ ] **41.** `HistoryTab` cabeçalho + filtros + KPIs (2.10). — DoD: trocar período recalcula.
- [ ] **42.** Timeline agrupada por dia + "Carregar mais" + Exportar. — DoD: export gera arquivo com N linhas = N eventos filtrados.
- [ ] **43.** Testes `TasksTab.test.tsx`, `HistoryTab.test.tsx`. — DoD: verde.
- [ ] **44.** Commit `feat(inbox): fase 6 — abas Tarefas e Histórico`. Push. Screenshots `06-tasks.png`, `06-history.png`.

**CP6.** Gate: screenshots; 0 console errors.

### FASE 7 — Painel direito (45–50) → CP7
- [ ] **45.** `ContactDetails` tabbed (2.11) com estado por contato; mobile `Sheet` intacto. — DoD: 5 abas; Esc/X fecha.
- [ ] **46.** Aba Contato: header 72 + Editar + badges + 5 tiles de ação. — DoD: E.2 `rightAvatar=72±2`, `actionTile=56±2`; cada tile chama o handler existente.
- [ ] **47.** Seções Informações / Status WhatsApp / Tags / Resumo Comercial / Tarefas da Conversa / Mais detalhes (mapa 2.11). — DoD: `contactDetailSections.ts` continua com as 18 entradas (nenhuma removida) e cada uma renderiza em alguma aba/seção (tabela no ledger).
- [ ] **48.** Abas Histórico/Tarefas/Notas/Arquivos do painel com os mesmos hooks (variantes compactas). — DoD: nenhuma query duplicada (React Query devtools/`queryCache.getAll()` no console: uma key por hook).
- [ ] **49.** Largura 390/360; `RealtimeInboxView` passa `centerTab`. — DoD: E.2 `rightCol=390±8`.
- [ ] **50.** Commit `feat(inbox): fase 7 — painel do contato com abas`. Push. Screenshot `07-right.png`.

**CP7.** Gate: E.2 ok; tabela de mapeamento das 18 seções no ledger.

### FASE 8 — QA visual + funcional (51–55) → CP8
- [ ] **51.** `inbox-shot.mjs` para cada aba do centro (7) + painel (5) → `out/inbox-11-<aba>.png` a 1672×941. — DoD: 12 arquivos.
- [ ] **52.** E.2 (`inbox-measure.mjs`): todos os asserts OK (máx 3 iterações; registrar). — DoD: tabela no ledger.
- [ ] **53.** E.3 cores: amostrar fundo de página, card, coluna esquerda, painel direito, chip ativo, botão primário → **devem ser carvão** (`#0e0e10`-ish para `bg-background`, card `hsl(240 5% 10%)`), primary `#2563eb`-ish. Qualquer amostra navy (matiz 215–218 com sat > 40%) = FAIL. — DoD: tabela.
- [ ] **54.** E.4 funcional (Apêndice E.4, 22 checks) no preview. — DoD: JSON `{ok:[22], fail:[]}` no ledger.
- [ ] **55.** Mobile 390×844 (lista, chat, detalhes em Sheet) e light mode: `inbox-11-mobile-*.png`, `inbox-11-light.png`; `scrollWidth ≤ innerWidth`. Reduced-motion: pills/abas com `transitionDuration '0s'`. — DoD: screenshots + asserts.

**CP8.** Gate: E.2 100%, E.3 100% carvão, E.4 22/22, mobile/light ok.

### FASE 9 — Gates, PR, produção (56–58) → CP9
- [ ] **56.** Gates completos: `typecheck` (só os 6 erros herdados) · `lint-ratchet` · `typecheck-ratchet` · `implicit-any-check` · `npm run lint` (sem erro novo) · `npx vitest run` (suite inteira) · `npm run build` · `node scripts/ci/bundle-budget.mjs` (se existir). Bundle Δ do chunk do inbox vs `origin/main` ≤ +40KB gz (6 abas lazy). — DoD: 8 saídas no ledger.
- [ ] **57.** PR `feat(inbox): Inbox 360° — abas da conversa e painel do contato (paleta carvão mantida)` → `main`, corpo = seção "Entrega" do ledger (resumo, arquivos, hooks, migration, contrato §4, gates, `00-before.png` vs `11-*.png`, resíduos honestos). Criar via `curl` na API do GitHub com o token de `/workspace/.git-credentials`. — DoD: URL do PR + status dos checks (ignorar o check "Contrato DB offline" se for o pré-existente).
- [ ] **58.** **NÃO faça merge.** Joaquim revisa e mergeia. Registrar no ledger "PR aberto, aguardando revisão" e listar o que ficou de fora. — DoD: ledger completo.

**CP9.** Gate: PR aberto com CI verde (exceto pré-existente), ledger com 10 CPs preenchidos e "Pendências/resíduos" honesto.

---

## 6. CRITÉRIOS DE ACEITAÇÃO FINAIS
**Visual:** paleta carvão intacta (E.3); 3 colunas 340 / flex / 390; chips de status; chat header 72; 7 abas no centro com badges reais; 6 abas novas com layout das referências; painel direito com 5 abas, avatar 72, 5 tiles de ação, seções colapsáveis. **Dados:** nada inventado; empty states honestos; contagens iguais às do banco. **Funcional:** §4 verde (22 checks). **Técnico:** typecheck sem erro novo (baseline 6 herdados), ratchets, testes, build, bundle, reduced-motion, light, mobile. **Honestidade:** ledger com números e caminhos.

---

## APÊNDICE A — `supabase/migrations/20260907230000_contact_notes_category_done_due.sql` (JÁ APLICADA no banco — só versionar)
```sql
-- Notas categorizadas para a aba Notas do inbox (note | fact | objection | promise).
-- Pendências usam conversation_tasks; Resumo comercial usa contacts.notes.
ALTER TABLE public.contact_notes
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'note',
  ADD COLUMN IF NOT EXISTS is_done boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE public.contact_notes DROP CONSTRAINT IF EXISTS contact_notes_category_check;
ALTER TABLE public.contact_notes
  ADD CONSTRAINT contact_notes_category_check CHECK (category IN ('note','fact','objection','promise'));
CREATE INDEX IF NOT EXISTS idx_contact_notes_contact_category ON public.contact_notes (contact_id, category);
```

## APÊNDICE B — Padrões de UI (classes prontas, todas em tokens)
```tsx
// Card de seção
<section className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3">
  <header className="flex items-center justify-between">
    <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center"><Icon className="w-4 h-4"/></span><h3 className="text-sm font-semibold">Título</h3>{count>0 && <span className="text-xs text-muted-foreground">({count})</span>}</div>
    <button className="h-8 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25">+ Adicionar</button>
  </header>
  {children}
</section>
// KPI strip
<div className="rounded-xl border border-border bg-card grid grid-cols-4 divide-x divide-border/60 h-[84px]">
  <div className="flex items-center gap-3 px-4"><span className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center"><Icon className="w-5 h-5"/></span><div><p className="text-xs text-muted-foreground">Label</p><p className="text-lg font-bold tabular-nums leading-tight">Valor</p></div></div>
</div>
// Pill de status
const pill = { success: 'bg-success/15 text-success border-success/30', warning: 'bg-warning/15 text-warning border-warning/30', destructive: 'bg-destructive/15 text-destructive border-destructive/30', primary: 'bg-primary/15 text-primary border-primary/30', muted: 'bg-muted text-muted-foreground border-border' };
<span className={`h-6 px-2.5 rounded-full border text-[11px] font-semibold inline-flex items-center ${pill.success}`}>Entregue</span>
// Empty state
<div className="flex flex-col items-center justify-center py-8 text-center"><Icon className="w-8 h-8 text-muted-foreground/60 mb-2"/><p className="text-sm text-muted-foreground">Nenhuma compra registrada</p></div>
```

## APÊNDICE C — Esqueleto dos hooks
```ts
// useContactCrm360.ts
export type Crm360 = { purchases: Purchase[]; openDeals: Deal[]; stages: Stage[]; currentStage: Stage | null; ticketMedio: number | null; ticketDeltaPct: number | null; interesses: string[]; pipeline: { propostas: Money; negociacao: Money; ganhos: Money }; interacoes: Interacao[]; resumo: { comprasTotal: number; comprasCount: number; propostas: number; emAberto: number } };
export function aggregateCrm360(input: { purchases: PurchaseRow[]; deals: DealRow[]; stages: StageRow[]; tags: string[]; activities: ActivityRow[]; events: EventRow[] }, now = new Date()): Crm360 { /* puro, testável */ }
export function useContactCrm360(contactId: string | null) { return useQuery({ queryKey: ['contact-crm-360', contactId], enabled: !!contactId, staleTime: 60_000, queryFn: async () => { const [p, d, s, t, a, e] = await Promise.all([...]); return aggregateCrm360({...}); } }); }
```
```ts
// useConversationHistoryTimeline.ts
export type TimelineEvent = { id: string; at: string; kind: 'message_in'|'message_out'|'note'|'transfer'|'call'|'file'|'task'|'deal'|'close'|'reopen'|'assign'; title: string; subtitle?: string; pill?: { label: string; tone: 'success'|'warning'|'primary'|'muted'|'destructive' }; count?: number };
export function buildTimeline(rows: RawRows, opts: { period: 7|30|90|0; type: TypeFilter; burstMinutes?: number }): { days: { date: string; events: TimelineEvent[] }[]; metrics: { total: number; lastContactAt: string | null; avgResponseMin: number | null; avgResponsePrevMin: number | null; resolutions: number } }
```

## APÊNDICE D — data-testid obrigatórios
`conversation-list-col`, `conversation-status-chip-<id>`, `conversation-search`, `conversation-item`, `conversation-avatar`, `chat-header`, `chat-header-btn`, `conversation-tabs` (existe), `conversation-tab-<id>` (existe), `tab-panel-<id>`, `kpi-strip`, `kpi-cell`, `file-card`, `file-detail-panel`, `task-card`, `note-card`, `timeline-event`, `contact-panel`, `contact-panel-tab-<id>`, `contact-avatar`, `contact-action-tile`, `contact-section-<id>`.

## APÊNDICE E — Scripts de QA (`/workspace/qa`, fora do repo; Playwright já instalado)
### E.1 `inbox-shot.mjs` — já existe; estender com argumentos `<url> <out> <centerTab> <panelTab>`: após login, `?view=inbox`, clicar "Mostrar Todos" se a lista estiver vazia, clicar o 1º `[data-testid="conversation-item"]`, clicar `[data-testid="conversation-tab-<centerTab>"]` e `[data-testid="contact-panel-tab-<panelTab>"]`, `waitForTimeout(1500)`, screenshot. Guardar erros de console em `<out>.console.json`.
### E.2 `inbox-measure.mjs` — geometria
```js
const m = await page.evaluate(() => { const q=s=>document.querySelector(s); const r=el=>el?el.getBoundingClientRect():null; return {
  listCol: r(q('[data-testid="conversation-list-col"]'))?.width, chip: r(q('[data-testid^="conversation-status-chip-"]'))?.height, search: r(q('[data-testid="conversation-search"]'))?.height,
  listItem: r(q('[data-testid="conversation-item"]'))?.height, listAvatar: r(q('[data-testid="conversation-avatar"]'))?.width,
  chatHeader: r(q('[data-testid="chat-header"]'))?.height, headerBtn: r(q('[data-testid="chat-header-btn"]'))?.height, tabBar: r(q('[data-testid="conversation-tabs"]'))?.height,
  tabActive: r(q('[role="tab"][aria-selected="true"]'))?.height, kpiStrip: r(q('[data-testid="kpi-strip"]'))?.height, rightCol: r(q('[data-testid="contact-panel"]'))?.width,
  rightAvatar: r(q('[data-testid="contact-avatar"]'))?.width, actionTile: r(q('[data-testid="contact-action-tile"]'))?.width,
  bg: getComputedStyle(document.body).backgroundColor, card: q('[data-testid="kpi-strip"]') ? getComputedStyle(q('[data-testid="kpi-strip"]')).backgroundColor : null,
  scrollW: document.documentElement.scrollWidth, innerW: innerWidth }; });
```
Asserts: `listCol 340±8 · chip 32±2 · search 40±2 · listItem 78–84 · listAvatar 44±2 · chatHeader 72±4 · headerBtn 40±2 · tabBar 48±2 · tabActive 36±2 · kpiStrip 84±6 · rightCol 390±8 · rightAvatar 72±2 · actionTile 56±2 · scrollW ≤ innerW`. Reduced-motion: `ctx.emulateMedia({reducedMotion:'reduce'})` → `transitionDuration==='0s'` nas abas.
### E.3 `inbox-colors.mjs` — amostras (mediana 9×9 via `pngjs`) em: página (900,500), coluna esquerda (400,600), card do centro (900,300), painel direito (1500,600), chip ativo, botão Nova conversa. Converter para HSL: **FAIL** se `sat > 0.35 && hue entre 200 e 230` em fundos/cards/colunas (navy); botão/chip devem ter hue ≈ 221 (primary carvão). Registrar os 6 valores.
### E.4 `inbox-func.mjs` — 22 checks
1 lista carrega · 2 chip Resolvidas filtra · 3 busca "a" filtra · 4 popover de filtros abre com "Todos os tipos/Todas filas/Mostrar Todos" · 5 Nova conversa abre modal · 6 abrir conversa · 7 input do chat aceita texto e botão enviar habilita (não enviar) · 8 aba CRM renderiza KPI strip · 9 aba Arquivos: chips com contagens numéricas · 10 clicar arquivo abre painel de detalhe · 11 aba IA renderiza 6 cards · 12 "Usar resposta" (se houver sugestão) troca para Chat com texto no input · 13 aba Notas: criar "Fato" → aparece na lista e badge Notas +1 · 14 excluir o fato criado · 15 aba Tarefas: criar tarefa → coluna Hoje/Próximas · 16 concluir → Concluídas · 17 excluir · 18 aba Histórico: trocar período recalcula KPIs · 19 painel direito 5 abas trocam · 20 tile Transferir abre diálogo (fechar com Esc) · 21 Editar abre `EditContactDialog` (Esc) · 22 console sem `error`. Imprimir JSON `{ok, fail, consoleErrors}`.

## APÊNDICE F — Template do ledger `docs/design/INBOX_360_STATUS.md`
```md
# Inbox 360° — STATUS
Branch: feat/inbox-360 · Base: 249501ae · Worktree: /workspace/repos/Zapp_Web_V2-inbox · Preview: <url>
## CP0 Ambiente   [ ] sha= · before=out/inbox-00-before.png · gates baseline: typecheck=0 lint-ratchet=ok tc-ratchet=ok implicit=ok vitest=ok
## CP1 Hooks      [ ] sha= · testes novos: N · event_type reais: [...]
## CP2 Lista      [ ] sha= · shot=02-after.png · listCol=_ chip=_ search=_ listItem=_ listAvatar=_
## CP3 Header/Abas[ ] sha= · shot=03-after.png · chatHeader=_ headerBtn=_ tabBar=_ tabActive=_
## CP4 CRM/Files  [ ] sha= · shots=04-crm.png,04-files.png · kpiStrip=_ · consoleErrors=0
## CP5 IA/Notas   [ ] sha= · shots=05-ai.png,05-notes.png · grep nomes inventados=0
## CP6 Tarefas/Hist[ ] sha= · shots=06-tasks.png,06-history.png
## CP7 Painel     [ ] sha= · shot=07-right.png · rightCol=_ rightAvatar=_ actionTile=_ · mapa das 18 seções: info→_, whatsapp-status→_, ...
## CP8 QA         [ ] shots=11-*.png (12) · geometria N/N · cores 6/6 carvão · func 22/22 · mobile ok · light ok · reduced-motion ok
## CP9 Entrega    [ ] PR=<url> · CI=_ · bundle Δ=_ KB gz · aguardando revisão de Joaquim
## Divergências plano × código
-
## Iterações do loop visual (máx 3 por fase)
-
## Pendências / resíduos (honestos)
- Composer só na aba Chat (as imagens 3/4/6 mostram composer em outras abas)
- Sem dados de segmento/porte/localização/CNPJ, "última visualização" e ligações → campos omitidos
- Tabelas comerciais vazias no banco → empty states em produção até haver dados
-
```
