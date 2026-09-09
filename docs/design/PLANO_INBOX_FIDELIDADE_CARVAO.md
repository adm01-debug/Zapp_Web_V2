> ## ⚠️ ATUALIZAÇÃO 09/09/2026 — LEIA PRIMEIRO (prevalece sobre o resto do documento onde houver conflito)
>
> 1. **Base agora é `origin/main @ 27c22f4d`** (não mais `27c22f4d`). Entre os dois entrou o **PR #288** "coluna de conversas (chips) + chat header": `TicketTabs.tsx` virou 5 chips com `ChipTab = 'all'|'unread'|'attending'|'waiting'|'resolved'` (sem Spam — correto, não existe no modelo), `InboxFilters.tsx` ganhou o toggle "Mostrar Todos" (era `#show-all`), `ChatPanelHeader.tsx` ganhou avatar 48/nome 18 e botões Ligar/Vídeo/Transferir 40px, `useInboxFilters.ts` ganhou `chipTab`. **Screenshot real de produção pós-#288:** `/workspace/qa/out/prod2-inbox-chat.png` — os chips estouram a largura da coluna (o 3º já está cortado), o cabeçalho continua `text-xs`, "Filtros" é um link de texto, e o padrão da conta QA abre em "Em atendimento" = lista vazia. Ou seja: **#288 é a base funcional, não a entrega visual.** As Fases 1–2 deste plano continuam valendo integralmente — reaproveite os ids/handlers do #288 e aplique o spec visual de §2. Onde §0.1/§1.2 descrevem "produção hoje" com Abertos/Resolvidos/Busca, leia como "antes do #288"; o alvo (coluna direita da tabela) não muda.
> 2. **Etapa 11 simplifica:** o mapeamento chip→estado já existe em `useInboxFilters` (`chipTab`). Não reimplemente — só garanta que `StatusChips` consome `chipTab`/`setChipTab` (ou o nome real — grep) e que o teste cobre os 5 chips. Contadores: os que `TicketTabs` do #288 já calcula.
> 3. **Etapa 9 (popover de filtro):** o toggle "Mostrar Todos" já está em `InboxFilters.tsx` (#288). Ao mover `InboxFilters` para dentro do popover, o toggle vem junto. **Atualize `/workspace/qa/inbox-shot.mjs`** (copie para `inbox-fid-shot.mjs`): depois de "Pular tour", clique no botão de filtro (`[data-testid="conversation-filter-button"]` — adicione esse testid), depois no switch "Mostrar Todos" (`getByLabel(/Mostrar Todos/i)` ou `#show-all` se ainda existir), feche o popover com Escape, clique no chip "Todas" (`[data-testid="status-chip-all"]` — adicione), e só então abra a primeira conversa. Sem isso a conta QA vê lista vazia e todo screenshot sai sem conversa.
> 4. **Chat header:** `ChatPanelHeader.tsx` é o componente em uso (`ChatHeader.tsx` não é importado em produção — #288 confirmou). Aplique a Fase 2 em `ChatPanelHeader.tsx` + `ChatHeaderToolbar.tsx`; em `ChatHeader.tsx` só paridade mínima. Os botões Ligar/Vídeo/Transferir de 40px do #288 são o ponto de partida: o alvo é exatamente **4 botões** (Ligar · Vídeo · Adicionar participante/Transferir · ⋮) — o que sobrar da toolbar antiga vai para o ⋮.
> 5. **Worktree:** `/workspace/repos/Zapp_Web_V2-inbox` já foi criado para você a partir de `origin/main` na branch `redesign/inbox-fidelidade-carvao`. Confirme com `git branch --show-current && git rev-parse --short HEAD` (esperado `27c22f4d`). Se `node_modules` faltar: `bun install --frozen-lockfile`.
> 6. **Sessão irmã:** o painel direito (`feat/inbox-painel-direito`, worktree `-painel`) está em fase de fidelidade + PR neste exato momento. Continua valendo: **não toque** em `ContactDetails*.tsx` nem em `contact-details/**`.
> 7. **Preview:** use a porta **4173**. Processos vite antigos foram mortos por PID antes de você começar; se a porta estiver ocupada, `ss -ltnp | grep 4173` para achar o PID e matar **só ele**.
> 8. Referências ao SHA `27c22f4d` no ledger/template devem ser trocadas por `27c22f4d`.

# PROMPT DE EXECUÇÃO — INBOX "FIDELIDADE CARVÃO" | ZAPP WEB V2

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR)
> **Repo:** `adm01-debug/Zapp_Web_V2` · **Base:** `main @ 27c22f4d` (PR #286 mergeado)
> **Branch:** `redesign/inbox-fidelidade-carvao` · **Worktree:** `/workspace/repos/Zapp_Web_V2-inbox`
> **Tela alvo:** `https://zapp-web-v2.vercel.app/?view=inbox`
> **Referências:** `/workspace/qa/ref/inbox/07-chat.jpg` (Chat), `01-crm360.jpg`, `05-tarefas.jpg`, `04-notas.jpg`, `02-arquivos.jpg`, `06-historico.jpg`, `03-ia.jpg` — todas 1456×819. **Olhe as imagens** (`Read` na JPEG) antes de cada fase. Elas são a fonte da verdade de layout/geometria/tipografia. A **cor** NÃO é fonte da verdade: a referência é navy, o app é carvão — ver §2.1.
> **Ledger obrigatório:** `docs/design/INBOX_FIDELIDADE_STATUS.md`
> **Instrução literal de Joaquim (08/09/2026):** *"mantenha o design carvão (não vamos mudar o design para azul) — mas deixe o design o mais semelhante possível com as imagens. A versão anterior ficou medíocre."*
> **Sessão irmã em paralelo:** o painel direito (`ContactDetails.tsx` + `src/components/inbox/contact-details/*`) está sendo feito na branch `feat/inbox-painel-direito` (worktree `Zapp_Web_V2-painel`). **Você NÃO toca nesses arquivos.** Nada de `ContactDetails`, nada de `contact-details/`.

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 Por que o PR #286 ficou "medíocre" (diagnóstico real, screenshots em `/workspace/qa/out/prod-inbox-*.jpg`)

O #286 entregou a **estrutura** das 8 abas com dados reais — isso está certo e fica. O que faz a tela parecer inacabada:

| Bloco | Produção hoje | Referência |
|---|---|---|
| Coluna de conversas | `<h2 text-xs>Conversas</h2>` + dot; ícones 28px; chips "Abertos 135 / Resolvidos 429 / Busca" + "Atendendo 0 / Aguardando 1" + select "Todas filas" + toggle "Mostrar Todos" + "Filtros"; item ~100px de altura, avatar 48 sem badge, nome 14, sem estrela, sem chips de tipo | Título **24/700** "Conversas" + subtítulo "1.516 conversas" + botão azul **"+ Nova conversa"** h-40; **6 chips** de status em 2 linhas (Todas 1.516 · Não lidas 28 · Em atendimento 12 / Aguardando 8 · Resolvidas 498 · Spam 4) com contador colorido; busca h-40 + botão filtro 40×40; **grupos** "Fixadas (3)" / "Hoje (8)" / "Ontem (12)"; item **~72px**, avatar 48 com dot online e badge de canal 20px, nome 15/600, hora 12, estrela, preview 13 muted, chips de tipo (Cliente/VIP/WhatsApp/Fornecedor/Lead/Parceiro/Catálogo) 11px, contador azul 22px |
| Chat header | Avatar 40, "Júlio Do Taxi", badge "1ª Resp: Violado", "Online"; 6 ícones ghost 32px; **linha extra** "Atribuído a: Atendente · Transferir" | Avatar **48** com dot online, nome **18/700** + ⭐ (favorito), linha "Online • Cliente" + chips **VIP** (amarelo) / **Alta prioridade** (vermelho); direita **4 botões 40×40 bordados** (Ligar, Vídeo, Adicionar participante, ⋮). Sem linha "Atribuído a" — vai para o menu ⋮ |
| Barra de abas | ok (48px, pill) | pill ativa com fundo `accent` + borda; contadores em pill azul 20px |
| Input | 12 ícones em linha, sem chips | linha de **6 chips de ação rápida** (Resposta Rápida · Assistente IA · Anexar · Agendar · Transferir · ⋯ Mais) h-36 + input h-52 com 4 ícones à direita (emoji, anexo, câmera, mic) + **botão enviar azul 44×44** |
| KPI strips (CRM/Tarefas/Histórico) | tiles todos `bg-primary/15` | tiles **coloridos por semântica**: vermelho (Atrasadas), amarelo (Para hoje), verde (Concluídas/Resoluções), azul, roxo |
| SectionCard | tile 28px azul, título 14 | tile 28px **colorido por seção** (amarelo Fatos relevantes, vermelho Objeções, verde Promessas, azul o resto), botão "+ Adicionar" em **pill azul** h-28, "Ver todas →" azul |
| Tarefas | 3 colunas com texto solto | 3 **cards-coluna** (Hoje 3 / Próximas 3 / Concluídas recentes 2) com subtítulo (data / "Esta semana" / "Últimos 7 dias"); dentro, **cards de tarefa** com checkbox, título 13/600, descrição 12, chip de prioridade (Alta vermelho / Média amarelo / Baixa azul), linha de vencimento com relógio colorido, avatar + nome do responsável, ⋮ |
| IA | cards com botões grandes azuis | Sugestão de resposta com texto + **4 chips de tom** (Mais formal / Mais casual / Mais curta / Mais detalhada) + botão "Usar resposta" pequeno no header; Objeções com badge vermelho de contagem e chips de severidade; Próxima melhor ação com card destacado + checklist; Produtos recomendados em lista com botão "Adicionar" pequeno; Risco/sentimento com gauge + 3 chips |
| Arquivos | grid de 1 card 260px | header com título 20/700 + subtítulo; busca + filtro + select "Mais recentes"; chips com contagem (Todos 5 ativo azul); **grid 3 colunas** de cards compactos (thumb 16:9, nome 13/500, tipo · tamanho, data, avatar remetente 16px, 4 ícones de ação); **painel de detalhe à direita** 260px ao selecionar (thumb, nome, meta, legenda, "Baixar arquivo" azul, Encaminhar / Copiar link / Salvar na galeria / Excluir vermelho) |
| Histórico | KPIs ok, timeline plana | 4 KPIs com tiles coloridos; selects "Período" e "Tipo de evento" com rótulo à esquerda; timeline com hora à esquerda (12px), **dot colorido** por tipo, card do evento com tile de ícone colorido 32px + título 13/600 + descrição 12 + **badge à direita** (WhatsApp verde / Transferência / Concluída verde / Pendente amarelo / Visualizada azul) |

Conclusão: **não é falta de dado, é falta de fidelidade de layout/tipografia/hierarquia.** Este plano corrige isso bloco a bloco, mantendo cada handler ligado.

### 0.2 Regras invioláveis

1. **Paleta carvão intacta.** `src/styles/tokens.css`, `tailwind.config.ts`, `index.html`, `presets.ts`: **proibido tocar**. Nenhum token novo. Nenhuma classe com cor literal (`bg-[#…]`, `hsl(…)` inline) — só tokens: `bg-background/card/muted/input/accent`, `border-border`, `text-foreground/muted-foreground`, `bg-primary`, `text-success/warning/destructive`, `bg-kpi-{blue,green,purple,yellow}` + `text-kpi-{…}-fg` (já existem), `bg-dash-tile-{blue,red,green,violet,amber}` (já existem em `tailwind.config.ts` — confira o nome exato com grep antes de usar).
2. **Nenhum checkpoint fecha sem evidência** (caminho de screenshot + números medidos + SHA) escrita no ledger. Sem adjetivo ("ficou lindo") — só número e caminho.
3. **Diff mínimo por arquivo.** Reescrita autorizada **apenas** para: `ConversationListSidebar.tsx`, `conversation-list/ConversationItem.tsx`, `TicketTabs.tsx`, `chat/ChatHeader.tsx`, `chat/ChatInputToolbars.tsx`, `tabs/KpiStrip.tsx`, `tabs/SectionCard.tsx`, `tabs/TaskCard.tsx`, `tabs/FileCard.tsx`. Todo o resto: edição cirúrgica de classes/props.
4. **Zero regressão funcional** — contrato da §4. Cada handler/prop existente continua no mesmo elemento. Filtros/abas/atalhos/realtime intactos.
5. **Zero backend.** Nada de migration/RLS/RPC/Edge. Zero query nova — os hooks do #286 (`useContactMedia`, `useConversationTasks`, `useContactCrm360`, `useConversationHistoryTimeline`, `useContactNotes`, `useConversationTabCounts`) e os do inbox (`useInboxFilters`, `useConversationActions` com `isPinned/isFavorite`, `useRealtimeInbox`) já têm tudo.
6. **Zero dado inventado.** Nomes/valores das referências (Joaquim, Sicoob Credip, R$ 12.450) são proibidos no código. Sem dado → empty state honesto.
7. **Ordem é lei:** lista → header/abas → input → polish das abas → QA. Não pule.
8. **Ratchets são gates:** `npm run typecheck` (0 erros), `node scripts/ci/lint-ratchet.mjs` (novas=0), `npm run implicit-any-check`, `npx vitest run src/components/inbox src/hooks/chat src/hooks/crm`. `scripts/ci/typecheck-ratchet.mjs` tem bug pré-existente (assume exit 1 do tsc, TS retorna 2) — valide com `npx tsc -b --force` direto e registre.
9. **Armadilha do lint-ratchet:** inserir código *antes* de violação legada acusa dívida nova. Mova a inserção para depois. Não toque no baseline.
10. **Branch e PR, nunca push direto em `main`.** Push sempre com `git push --no-verify origin redesign/inbox-fidelidade-carvao` (o hook pre-push trava a sessão). Um commit por fase: `redesign(inbox): fase N — <o que>`.
11. **Sem bibliotecas novas.** Tudo com o que já está no `package.json`. Instalar com `bun install --frozen-lockfile` (repo usa bun.lock).
12. **Máximo 3 iterações por loop visual.** Na 3ª, registre o resíduo e siga.
13. **Shell `dash`**: sem `[[ ]]`, arrays, `source`. **Sem `python3`** — QA em Node (Playwright já instalado em `/workspace/qa`).
14. **Nunca `pkill -f` com padrão genérico** (vite, node, porta) — mata a própria sessão. Preview: `nohup npx vite preview --port 4173 > /workspace/qa/inbox-fid-preview.log 2>&1 & echo $! > /workspace/qa/inbox-fid-preview.pid`; matar com `kill $(cat /workspace/qa/inbox-fid-preview.pid)`. Se a porta estiver ocupada, use 4174/4175 e registre.
15. **Se o plano contradisser o código real, o código real vence — registre a divergência no ledger antes de decidir.**
16. **Arquivos da sessão irmã são intocáveis:** `src/components/inbox/ContactDetails.tsx`, `ContactDetailsResponsive.tsx`, `src/components/inbox/contact-details/**`. Se precisar de uma prop deles, registre a pendência no ledger e siga sem.
17. **Conta de QA é supervisor com lista vazia por padrão** — o script `/workspace/qa/inbox-shot.mjs` já clica em "Pular tour" (WelcomeModal), ativa `#show-all` e abre a primeira conversa. Reutilize-o (copie para `inbox-fid-shot.mjs` se precisar adaptar seletores).

---

## 1. CONTEXTO VERIFICADO (leitura em 08/09/2026, main 27c22f4d)

### 1.1 Stack e comandos
Vite + React 19 + TS + Tailwind 3.4 + shadcn/Radix + framer-motion + TanStack Query + lucide-react + date-fns. Scripts: `typecheck` (`tsc -b --force`), `build`, `test` (vitest), `implicit-any-check`. Instala com **bun**. Node 20 no container.

### 1.2 Arquivos do módulo (todos em `src/components/inbox/`)
- Lista: `ConversationListSidebar.tsx` (227L — header "Conversas", busca, `ContactTypeFilter`, `TicketTabs`, `InboxFilters`, `VirtualizedRealtimeList`, skeleton, empty), `TicketTabs.tsx` (Abertos/Resolvidos/Busca + Atendendo/Aguardando + select fila + `#show-all`), `InboxFilters.tsx` (330L), `conversation-list/ConversationItem.tsx` (194L — variantes compact/full, `ChannelBadge`, `QuickPeek`, SLA, sentimento), `VirtualizedRealtimeList.tsx`, `ContactTypeFilter.tsx`, `BulkActionsToolbar.tsx`.
- Chat: `ChatPanel.tsx` (292L, orquestrador), `chat/ChatHeader.tsx` (208L), `chat/ChatHeaderToolbar.tsx` (79L — Search/Radar/GraduationCap/Vision/FileText/Info), `chat/ChatPanelHeader.tsx` (128L), `chat/ChatAssignedBar.tsx` (47L — "Atribuído a / Transferir"), `chat/ConversationTabs.tsx` (h-12, pill `layoutId="conversation-tab-pill"`, `data-testid="conversation-tab-{id}"`, ids: chat|ia|crm|orders|tasks|notes|files|history), `chat/ConversationTabContent.tsx`, `chat/ChatMessagesArea.tsx`, `chat/ChatMessageBubble.tsx`, `chat/ChatInputArea.tsx` (246L), `chat/ChatInputToolbars.tsx` (202L — `SecondaryToolbar`, `TertiaryToolsMenu`), `chat/ChatMessageInput.tsx`, `chat/InputExtraTools.tsx`, `chat/CrmBadges.tsx`.
- Abas (#286): `tabs/AiTab.tsx` (184L), `Crm360Tab.tsx` (284L), `OrdersTab.tsx`, `TasksTab.tsx` (127L) + `TaskCard.tsx` (63L), `NotesTab.tsx` (289L), `FilesTab.tsx` (165L) + `FileCard.tsx` (99L) + `FileDetailPanel.tsx` (91L), `HistoryTab.tsx` (201L), `KpiStrip.tsx` (43L — `cells: {icon,label,value,iconClassName?}`), `SectionCard.tsx` (40L — `icon,title,count?,action?`), `TabBanner.tsx` (62L), `OpenDealsList.tsx`.
- Hooks: `src/hooks/inbox/useInboxFilters.ts` (mainTab open|resolved, subTab attending|waiting, `filters.status` inclui 'unread'), `src/hooks/chat/useConversationActions.ts` (`isPinned`, `isFavorite`, pin/favorite toggles), `useConversationTabCounts`.
- Tipos: `src/types/chat.ts` — `Conversation { unreadCount, status, priority: low|medium|high, tags, assignedTo, sentiment }`, `ConversationContact { name, phone, avatar, contact_type, tags, company, conversation_status }`.

### 1.3 Tokens carvão (dark, **não mudam**)
`--background 240 6% 6%` · `--card 240 5% 10%` · `--card-elevated 240 5% 13%` · `--muted 240 4% 18%` · `--border 240 4% 18%` · `--input 240 5% 14%` · `--accent 240 5% 16%` · `--primary 221 83% 53%` · `--success 142 71% 45%` · `--warning 40 91% 60%` · `--destructive 354 100% 68%` · `--whatsapp 142 76% 50%` · `--online 148 100% 42%` · `--radius 0.875rem`. Tiles: `--kpi-tile-{blue,green,purple,yellow}` (+`-fg`) e `--dash-tile-{blue,red,green,violet,amber}`.

### 1.4 QA já pronto em `/workspace/qa`
`inbox-shot.mjs <url> <out.png> <centerTab> <panelTab>` (login QA + Pular tour + show-all + primeira conversa + aba). `node_modules` com playwright/pngjs/pixelmatch. Credenciais em `/workspace/.secrets/zapp-v2.env` (`ZAPP_QA_EMAIL/PASSWORD`). Screenshots "antes" de produção: `/workspace/qa/out/prod-inbox-{chat,ia,crm,tasks,notes,files,history}.jpg` (1672×941).

---

## 2. SPEC VISUAL

### 2.1 Mapa de cores referência (navy) → app (carvão)
| Na referência | No app (classe) |
|---|---|
| fundo de página navy `#08121f` | `bg-background` |
| card navy `#0d1725` | `bg-card` |
| card mais claro / hover | `bg-card-elevated` ou `bg-muted/40` |
| input navy escuro | `bg-input border-border` |
| borda azulada | `border-border` (nunca `border-primary` em repouso) |
| pill/tab ativa navy-azul `#022a6a` | `bg-accent border border-primary/40 text-foreground` |
| botão azul `#1470ff` | `bg-primary text-primary-foreground hover:bg-primary/90` |
| texto azul-claro / link | `text-primary` |
| chip contagem azul | `bg-primary text-primary-foreground` |
| chip contagem vermelho (Não lidas, Spam) | `bg-destructive/20 text-destructive` |
| chip contagem laranja (Aguardando) | `bg-warning/20 text-warning` |
| verde (Online, WhatsApp, Entregue, Concluída, Promessas) | `text-success` / `bg-success/15 text-success` / dot `bg-online` |
| amarelo (VIP, Para hoje, Média, Fatos relevantes) | `bg-warning/15 text-warning border-warning/40` |
| vermelho (Alta prioridade, Atrasadas, Objeções, Excluir) | `bg-destructive/15 text-destructive border-destructive/40` |
| roxo (IA, Empresas) | `bg-kpi-purple text-kpi-purple-fg` |
| tile de ícone azul | `bg-kpi-blue text-kpi-blue-fg` (ou `bg-primary/15 text-primary`) |
| banner IA gradiente azul | `bg-primary/10 border-primary/30` (já é assim no `TabBanner`) |
| glow/sombras azuis | não usar — carvão é plano (`shadow-none`, `card-lift` só onde já existe) |

### 2.2 Tipografia (Plus Jakarta Sans / Outfit já configuradas — não mudar)
| Elemento | Tamanho/peso |
|---|---|
| Título coluna "Conversas" | 24/700 tracking -0.02em |
| Subtítulo "N conversas" | 13/400 muted |
| Chips de status | 12/500; contador 11/700 |
| Grupo (Fixadas/Hoje/Ontem) | 13/600 foreground, ícone 14 |
| Nome no item | 15/600; hora 12 muted; preview 13 muted; chips 11/500 |
| Nome no chat header | 18/700; linha 2 = 13 (Online verde 13/500, "•", tipo em chip 12) |
| Tab | 13/500 (ativa 600); contador 11/700 |
| Chip de ação rápida | 13/500, ícone 15 |
| Placeholder input | 14 muted |
| Título de aba (Arquivos/Histórico) | 20/700 + subtítulo 13 muted |
| SectionCard título | 14/600; contador "(3)" 13 muted |
| KPI valor | 22/700 tabular; label 12 muted; sublabel 11 muted/70 |
| Card de tarefa | título 13/600; descrição 12 muted; chip 11 |
| Timeline | hora 12 muted; título 13/600; descrição 12 muted |

### 2.3 Geometria (viewport 1672×941, sidebar rail 56px como hoje — **não mexa no shell**)
| Bloco | Alvo | Tol |
|---|---|---|
| Coluna de conversas | **w 350** (hoje ~280) | ±6 |
| Header da coluna (título+botão) | h 56; botão "Nova conversa" **h 40** radius 12 | ±2 |
| Chips de status | h 28 radius 8, 2 linhas, gap 6 | ±2 |
| Busca da lista | **h 40** radius 12; botão filtro 40×40 | ±2 |
| Cabeçalho de grupo | h 32 | ±2 |
| Item de conversa | **h 72** (min), padding 12, radius 12; avatar **48**; dot online 12; badge canal 20; contador 22 | ±4 |
| Item selecionado | `bg-accent border border-primary/40` (sem barra lateral) | — |
| Chat header | **h 72**; avatar 48; botões **40×40** radius 10 border-border gap 8 | ±2 |
| Barra de abas | h 48 (mantém); pill ativa h 36 radius 8 | ±2 |
| Banner IA | h 56 radius 12 | ±4 |
| Bolha de mensagem | max-w 68%, radius 14, padding 12/14 | — |
| Chips de ação rápida | h 36 radius 8 bg-muted/60 border-border gap 8 | ±2 |
| Input | h 52 radius 12; ícones 20; botão enviar **44×44** radius 10 bg-primary | ±2 |
| Área central | flex-1 | — |
| Painel direito | (sessão irmã) w 380 | — |
| KPI strip | h 84 (mantém); tile **40** radius 10 | ±2 |
| SectionCard | padding 16 radius 12; tile 28; botão "+ Adicionar" h 28 radius 8 | ±2 |
| Coluna de tarefas | card radius 12 padding 12; card de tarefa radius 10 padding 12 gap 8 | — |
| Grid de arquivos | 3 colunas gap 12; card thumb aspect 16:9; painel detalhe **w 260** | ±4 |
| Timeline | coluna de hora w 44; dot 10; card radius 10 padding 12; badge à direita h 22 | ±2 |

### 2.4 Motion
Só o que já existe (pill `layoutId`, fade de aba). Nada novo. `useReducedMotion` respeitado.

---

## 3. ARQUITETURA DA MUDANÇA

### 3.1 Alterados
| Arquivo | Mudança |
|---|---|
| `ConversationListSidebar.tsx` | **reescrita**: header (título 24 + subtítulo contagem + botão Nova conversa), `StatusChips` (novo), busca 40 + filtro 40, grupos, remove ícones 28px; mantém `BulkActionsToolbar`, `InboxFilters` (atrás do botão filtro), `ContactTypeFilter` (vai para dentro do popover de filtro), skeleton, empty, `VirtualizedRealtimeList`, pull-to-refresh mobile |
| `TicketTabs.tsx` | **reescrita** → `StatusChips`: 6 chips (Todas / Não lidas / Em atendimento / Aguardando / Resolvidas / Spam) mapeados para o estado real de `useInboxFilters` (ver etapa 11); `#show-all` e select de fila **preservados** (movidos para o popover de filtro) |
| `conversation-list/ConversationItem.tsx` | **reescrita** da variante full: avatar 48 + dot online + `ChannelBadge` 20; nome 15/600 + hora + estrela (`isFavorite`) ; preview + contador; linha de chips (tipo via `contactTypeConfig`, VIP se tag/priority, canal); `priority==='high'` → chip "Alta prioridade"; variante compact mantida |
| `VirtualizedRealtimeList.tsx` | inserir cabeçalhos de grupo (Fixadas / Hoje / Ontem / Mais antigas) — só se a virtualização aceitar itens de altura variável; senão, grupo só "Fixadas" fixo acima da lista virtual + rest sem grupo (registrar) |
| `chat/ChatHeader.tsx` | avatar 48 + dot; nome 18/700 + estrela clicável (`toggleFavorite`); linha 2 Online • tipo + VIP + prioridade (`CrmBadges` existente); 4 botões 40×40 |
| `chat/ChatHeaderToolbar.tsx` | os 6 tools viram: Ligar (`Phone` → dropdown existente de call), Vídeo (`Video`), Adicionar participante (`UserPlus` → `RealtimeCollaboration`/convite se existir, senão Transferir), ⋮ (`DropdownMenu` com Buscar na conversa, Objeções, Universitários, Visão, Resumo, Detalhes do contato, Transferir, Atribuir) — **nenhum handler some** |
| `chat/ChatAssignedBar.tsx` | não renderiza mais como barra; conteúdo (agente + Transferir) vai para o menu ⋮ e para um chip pequeno ao lado do nome quando `assignedTo` existe |
| `chat/ConversationTabs.tsx` | pill ativa `bg-accent border border-primary/40`; contador `bg-primary text-primary-foreground h-5 min-w-5 rounded-full text-[11px]`; ícone 16 |
| `chat/ChatInputArea.tsx` + `chat/ChatInputToolbars.tsx` + `chat/InputExtraTools.tsx` | `QuickActionChips` (novo) acima do input; toolbar direita reduzida a emoji/anexo/câmera/mic; demais ferramentas para o chip "⋯ Mais" (dropdown) — **cada ação continua acessível** |
| `chat/ChatMessageBubble.tsx` / `MessageBubble.tsx` | só classes: recebida `bg-muted text-foreground`, enviada `bg-primary text-primary-foreground`, radius 14, hora 11 muted/70 dentro, avatar 32 na recebida |
| `tabs/KpiStrip.tsx` | `KpiCell.tone?: 'blue'|'green'|'purple'|'yellow'|'red'` → tile colorido (mapa em §2.1); tile 40 radius 10; sublabel opcional |
| `tabs/SectionCard.tsx` | `tone?` no tile; `action` vira pill (`variant: 'pill'|'link'`, default `'link'` = comportamento atual); `count` em "(N)" |
| `tabs/TaskCard.tsx` | **reescrita**: checkbox 16, título, descrição, chip prioridade, linha vencimento (Clock 12 + data, cor por atraso), avatar 20 + nome, ⋮ |
| `tabs/TasksTab.tsx` | 3 KPIs com tone red/yellow/green; 3 colunas em `SectionCard` (Hoje / Próximas / Concluídas recentes) com subtítulo; select "Todas as tarefas" mantido |
| `tabs/NotesTab.tsx` | tones por card (Notas privadas blue · Fatos relevantes yellow · Objeções red · Promessas green · Pendências blue · Resumo comercial blue); "+ Adicionar" pill; rodapé "dd MMM yyyy · HH:mm · Por: nome · ⋮" |
| `tabs/AiTab.tsx` | Sugestão: texto + 4 chips de tom + "Usar resposta" no header; Objeções: badge vermelho + chip severidade; Próxima ação: card destacado `bg-primary/10 border-primary/30` + checklist; Produtos: lista com "Adicionar" `h-7`; Risco: gauge + chips |
| `tabs/FilesTab.tsx` + `FileCard.tsx` + `FileDetailPanel.tsx` | header 20/700; grid 3 col; card compacto; detalhe 260 com botões |
| `tabs/HistoryTab.tsx` | KPI tones; selects com rótulo; timeline com dot colorido, tile 32 colorido, badge à direita |
| `tabs/Crm360Tab.tsx` | KPI tones (blue/green/blue/green); Etapa no funil com 5 segmentos + rótulos; Últimas compras/Propostas como lista com thumb 40 + chip status; Ticket médio com delta verde; Pipeline com barra empilhada + legenda |
| `ChatPanel.tsx` | só o que for necessário para passar props novas (favorito, transfer no menu) |
| `RealtimeInboxView.tsx` (ou onde a largura da coluna é definida) | `w-[350px]` |

### 3.2 Novos
| Arquivo | Conteúdo |
|---|---|
| `conversation-list/StatusChips.tsx` | 6 chips + lógica de contagem (substitui `TicketTabs`; `TicketTabs.tsx` passa a reexportar `StatusChips` para não quebrar imports) |
| `conversation-list/ConversationGroupHeader.tsx` | "Fixadas (3)" / "Hoje (8)" / "Ontem (12)" / "Mais antigas" |
| `chat/QuickActionChips.tsx` | 6 chips: Resposta Rápida (abre `ChatQuickRepliesPopover`), Assistente IA (troca para aba `ia`), Anexar (file input existente), Agendar (`ScheduleMessageDialog`), Transferir (`transferDialog`), ⋯ Mais (dropdown com o resto da `SecondaryToolbar`) |
| `tabs/TaskColumn.tsx` | coluna de tarefas (título, contador, subtítulo, lista de `TaskCard`, empty) |
| `docs/design/INBOX_FIDELIDADE_STATUS.md` | ledger (template §7) |

### 3.3 NÃO tocar
`ContactDetails*.tsx`, `contact-details/**` (sessão irmã) · `tokens.css`, `tailwind.config.ts`, `index.html`, `presets.ts` · `supabase/`, `types.ts` do Supabase · `sidebar*`, `AppShell`, `AppHeader`, `ViewRouter` · hooks (exceto adicionar seletor puro em `useInboxFilters` se a etapa 11 exigir — sem mudar defaults) · testes fora de `src/components/inbox` e `src/hooks/{chat,crm,inbox}` (se quebrarem por classe/texto, atualize o teste, nunca o comportamento).

---

## 4. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP7)
Lista: busca por contato · filtro por tipo · abas de status (open/resolved, attending/waiting, `#show-all` supervisor, fila) · filtros avançados (`InboxFilters`) · bulk actions · pull-to-refresh mobile · realtime (novas mensagens reordenam) · QuickPeek · SLA/sentimento no item · nova conversa · atualizar · seleção e navegação por teclado.
Chat: Ligar (dropdown) · busca na conversa (Ctrl+F) · Objeções · Universitários · Visão · Resumo · Detalhes do contato (toggle painel) · Transferir · Atribuir · favoritar/fixar · 8 abas com contadores · banner IA (Ver sugestões → aba IA; X persiste) · envio de texto/áudio/mídia/sticker/localização/template/enquete · quick replies · agendar · menções · comandos `/` · emojis · gravação · anexos · atalhos (Esc, Ctrl+F, etc.) · scroll/virtualização · reações · responder/encaminhar/apagar.
Abas: tudo que o #286 entregou (CRUD notas, tarefas, funil, export CSV, chips de arquivos, filtros de histórico).

---

## 5. O PLANO — 7 FASES · 58 ETAPAS · 8 CHECKPOINTS

Formato: `[ ] N. Ação — DoD`. Marque `[x]` só com evidência no ledger.

### FASE 0 — Preparação (1–6) → CP0
- [ ] **1.** Você já está no worktree `/workspace/repos/Zapp_Web_V2-inbox`, branch `redesign/inbox-fidelidade-carvao` (criada a partir de `origin/main` @ `27c22f4d`). Confirme: `git branch --show-current && git rev-parse --short HEAD`. — DoD: caminho + SHA no ledger.
- [ ] **2.** `bun install --frozen-lockfile` no worktree (se `node_modules/.bin/vite` ainda não existir). — DoD: `node_modules/.bin/vite` existe.
- [ ] **3.** Criar `docs/design/INBOX_FIDELIDADE_STATUS.md` (template §7). Commit `chore(inbox): ledger fidelidade carvão`. Push `--no-verify`. — DoD: commitado.
- [ ] **4.** Baseline: `npx tsc -b --force` (0 erros) · `node scripts/ci/lint-ratchet.mjs` · `npm run implicit-any-check` · `npx vitest run src/components/inbox src/hooks/chat src/hooks/crm`. — DoD: 4 saídas no ledger.
- [ ] **5.** Ler as 7 referências com `Read` (JPEG). Para cada uma, escrever no ledger 3 linhas do que a tela tem e produção não (confronte com `/workspace/qa/out/prod-inbox-*.jpg`). — DoD: 21 linhas no ledger. Isso é obrigatório: quem não olha a imagem entrega medíocre.
- [ ] **6.** `grep -rn "dash-tile\|kpi\." tailwind.config.ts` → anote os nomes exatos das classes de tile disponíveis. — DoD: lista no ledger.

**CP0.** Gate: 1–6 com evidência.

### FASE 1 — Coluna de conversas (7–18) → CP1
- [ ] **7.** Largura da coluna: localizar onde `ConversationListSidebar` recebe largura (grep `w-\[` / `w-80` em `RealtimeInboxView.tsx`, `ConversationListSidebar.tsx`, `InboxLayout*`). Desktop → `w-[350px] shrink-0`. Mobile inalterado. — DoD: `getBoundingClientRect().width` = 350 ±6.
- [ ] **8.** Header da coluna (`ConversationListSidebar.tsx`): `div h-14 px-4 flex items-center justify-between` → esquerda: `<h2 text-2xl font-bold tracking-tight>Conversas</h2>` + `<span text-[13px] text-muted-foreground>{total.toLocaleString('pt-BR')} conversas</span>` (total = `inbox.cachedConversations.length` ou o count que a lista já expõe — nunca invente); direita: `<Button h-10 px-4 rounded-xl bg-primary gap-2><Plus 16/>Nova conversa</Button>` (`inbox.setShowNewConversation(true)`). O botão "Atualizar" vira item do popover de filtro (etapa 9). Dot online vai para junto do subtítulo (8px). — DoD: h-14 medido; botão 40.
- [ ] **9.** Busca: input `h-10 rounded-xl bg-input border border-border pl-10 text-sm placeholder:text-muted-foreground/60` ícone `Search` 16 `left-3.5`; placeholder "Buscar conversas…"; ao lado botão `w-10 h-10 rounded-xl border border-border bg-input` com `SlidersHorizontal` 16 que abre um `Popover` contendo: `ContactTypeFilter`, select de fila, toggle `#show-all` (só supervisor), `InboxFilters` (o painel de filtros avançados atual), botão Atualizar. Badge no botão quando algum filtro ativo. — DoD: busca h 40; popover abre e cada controle funciona.
- [ ] **10.** Criar `conversation-list/StatusChips.tsx` (reescrita de `TicketTabs.tsx`): container `flex flex-wrap gap-1.5 px-4 pb-3`; chip `h-7 px-2.5 rounded-lg text-xs font-medium border` inativo `bg-muted/40 border-border text-muted-foreground hover:bg-muted/70`, ativo `bg-accent border-primary/50 text-foreground`; contador `ml-1.5 h-[18px] min-w-[18px] px-1 rounded-md text-[11px] font-bold` — cor por chip: Todas `bg-primary text-primary-foreground`, Não lidas `bg-destructive/20 text-destructive`, Em atendimento `bg-muted text-foreground`, Aguardando `bg-warning/20 text-warning`, Resolvidas `bg-muted text-foreground`, Spam `bg-destructive/20 text-destructive`. `TicketTabs.tsx` passa a ser `export { StatusChips as TicketTabs } from './conversation-list/StatusChips'` + props compatíveis. — DoD: 6 chips visíveis, 2 linhas em 350px.
- [ ] **11.** Mapeamento dos chips para o estado real (`useInboxFilters`): Todas = `mainTab='open'` sem subTab restritiva (o que hoje "Abertos" faz) · Não lidas = `filters.status=['unread']` sobre open · Em atendimento = `mainTab='open', subTab='attending'` · Aguardando = `mainTab='open', subTab='waiting'` · Resolvidas = `mainTab='resolved'` · Spam = **só renderiza se** existir status/tag de spam no `Conversation` (grep `spam` em `src/types/chat.ts` e hooks); se não existir, o chip **não aparece** (não invente). Contadores = os mesmos `counts` que `TicketTabs` já calcula (+ `unread` = `conversations.filter(c=>c.unreadCount>0).length`). Se precisar de um seletor novo em `useInboxFilters`, adicione **função pura** sem alterar defaults (`mainTab` default continua `'open'`, `subTab` default continua `'attending'`). — DoD: clicar em cada chip filtra igual ao controle antigo; teste unitário em `__tests__/StatusChips.test.tsx` cobrindo os 5 mapeamentos.
- [ ] **12.** Criar `conversation-list/ConversationGroupHeader.tsx`: `div h-8 px-4 flex items-center gap-2 text-[13px] font-semibold` com ícone 14 (`Pin` para Fixadas) e "Título (N)". Agrupamento: Fixadas (via `isPinned`) · Hoje · Ontem · Mais antigas (por `updatedAt`, date-fns `isToday/isYesterday`). Integração em `VirtualizedRealtimeList.tsx`: se a lista virtual suportar `estimateSize` por item (TanStack Virtual — `getItemKey`/`estimateSize(index)`), injete os headers como itens de 32px; senão, renderize só "Fixadas" como bloco não-virtual acima e registre a divergência. Ordem interna de cada grupo = ordem atual (não mude o sort). — DoD: headers visíveis com contagem correta; scroll não quebra.
- [ ] **13.** Reescrever variante full de `ConversationItem.tsx`: `div role=button min-h-[72px] mx-3 my-0.5 px-3 py-2.5 rounded-xl flex gap-3 items-start border border-transparent hover:bg-muted/40` selecionado `bg-accent border-primary/40`. Avatar 48 (`w-12 h-12`) com dot online 12px `bg-online ring-2 ring-card` bottom-right (só se `conversation.contact.conversation_status` ou presença existente indicar online — se não houver fonte, dot **não aparece**) e `ChannelBadge` 20px (`w-5 h-5`) bottom-right sobre o dot quando for WhatsApp. Coluna: linha 1 = nome `text-[15px] font-semibold truncate` + direita `hora text-xs text-muted-foreground` + `Star` 14 (`fill-warning text-warning` se `isFavorite`, senão `text-muted-foreground/40`, clicável → `toggleFavorite`, `stopPropagation`); linha 2 = preview `text-[13px] text-muted-foreground truncate` (`FileText` 14 + "Arquivo: nome" quando `lastMessage.type` for mídia/documento — use o que `messageUtils` já oferece) + contador `min-w-[22px] h-[22px] rounded-full bg-primary text-primary-foreground text-[11px] font-bold` (só se `unreadCount>0`); linha 3 (só se houver algo) = chips 11px: tipo (`contactTypeConfig` de `src/components/contacts/contactTypeConfig.tsx` — reutilize `badgeClass`/`label`), VIP (`tags` inclui 'vip' ou `priority==='high'` → "Alta prioridade" vermelho), canal ("WhatsApp" `bg-success/15 text-success`). Mantém `SLAIndicator`, `SentimentEmoji`, `QuickPeek`, avatar do agente atribuído (16px, ring), `priority` (agora chip, não barra). Variante compact **inalterada**. — DoD: item ≥72; avatar 48; chips renderizam de dado real; `data-testid="conversation-item"` no root.
- [ ] **14.** Skeleton da lista: mesma shape (avatar 48, 2 linhas, chip). — DoD: sem pulo de layout.
- [ ] **15.** Empty state: ícone em tile 56 `bg-kpi-blue text-kpi-blue-fg`, título 15/600, texto 13 muted. — DoD: renderiza.
- [ ] **16.** `BulkActionsToolbar`: só harmonizar (h 40, `bg-accent`). — DoD: seleção múltipla funciona.
- [ ] **17.** Testes: atualizar `__tests__` de `ConversationListSidebar`/`ConversationItem`/`TicketTabs` que quebrarem por texto/classe (comportamento intacto). `npx vitest run src/components/inbox` verde. — DoD: exit 0.
- [ ] **18.** Commit `redesign(inbox): fase 1 — coluna de conversas (título, chips de status, grupos, item 72px)`. Push `--no-verify`. Preview local (`npm run build && vite preview`, regra 14) + `node /workspace/qa/inbox-shot.mjs http://localhost:4173 out/fid-01-lista.png chat`. — DoD: screenshot + medidas (w coluna, h item, h busca, h botão) no ledger.

**CP1 — Lista.** Gate: coluna 350±6 · item ≥72 · avatar 48±2 · busca 40±2 · botão 40±2 · 6 (ou 5) chips · grupos com contagem · console 0 erros. **Olhe o screenshot ao lado de `07-chat.jpg`** e escreva no ledger o que ainda difere.

### FASE 2 — Chat header e barra de abas (19–27) → CP2
- [ ] **19.** `ChatHeader.tsx`: container `h-[72px] px-4 flex items-center gap-3 border-b border-border bg-card`. Avatar `w-12 h-12` + dot online 12 (`bg-online ring-2 ring-card`, mesma regra de fonte da etapa 13). — DoD: h 72; avatar 48.
- [ ] **20.** Bloco de texto: linha 1 = nome `text-lg font-bold leading-tight truncate` + `Star` 16 clicável (`toggleFavorite`; preenchida amarela quando favorito) + (se `assignedTo`) chip `h-5 px-1.5 rounded-md bg-muted text-[11px]` com avatar 14 + nome do agente (substitui a `ChatAssignedBar`). Linha 2 = `Online` `text-[13px] font-medium text-success` (só se houver presença real — senão mostre o `conversation_status` traduzido) · "•" · chip tipo (`CrmBadges` existente) · chip VIP (`bg-warning/15 text-warning border border-warning/40 h-6 px-2 rounded-full text-xs font-semibold`, se tag vip) · chip "Alta prioridade" (`bg-destructive/15 text-destructive border-destructive/40`, se `priority==='high'`). — DoD: chips só com dado real; nenhum "1ª Resp: Violado" perdido — o SLA continua como `SLAIndicator` compacto ao lado da hora ou dentro do ⋮ (decida e registre).
- [ ] **21.** `ChatHeaderToolbar.tsx` → 4 botões `w-10 h-10 rounded-[10px] border border-border bg-card hover:bg-muted text-foreground` gap 2: `Phone` (abre o mesmo dropdown/handler de ligação que existe hoje — grep `onStartCall`/`CallButton` no `ChatHeader`/`ChatPanel`), `Video` (se existir handler de vídeo; senão o botão abre o mesmo dropdown de call com a opção vídeo; se não houver nada, **omitir** e registrar), `UserPlus` (adicionar participante: grep `RealtimeCollaboration`/`invite`/`collab` — se existir, abre; senão → Transferir), `MoreVertical` → `DropdownMenu` com **todos** os tools antigos: Buscar na conversa (Ctrl+F), Monitoramento de Objeções, Ajuda dos Universitários, Visão, Resumo da conversa, Detalhes do contato (toggle), Transferir, Atribuir a mim/agente, Fixar, Favoritar, Arquivar/Resolver (o que já existir). — DoD: 4 botões 40×40; cada item do menu dispara o handler original (teste manual no preview + teste unitário com `fireEvent`).
- [ ] **22.** `ChatAssignedBar.tsx`: deixa de ser renderizada pelo `ChatPanel`/`ChatPanelHeader` (o conteúdo migrou para o chip + menu). Não apague o arquivo (outro lugar pode importar) — só remova o uso e adicione comentário de 1 linha. — DoD: barra ausente; Transferir acessível pelo ⋮ e pelo chip do agente (clique → `transferDialog`).
- [ ] **23.** `ConversationTabs.tsx`: trigger `h-9 px-3 rounded-lg text-[13px] font-medium gap-2`; ícone 16; pill `bg-accent border border-primary/40`; contador `h-5 min-w-[20px] px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold`; container `h-12 px-3 gap-1 bg-card border-b border-border`. — DoD: pill 36±2; contadores azuis.
- [ ] **24.** Banner IA (`TabBanner` na aba Chat): `h-14 rounded-xl` ícone em tile 36 `bg-kpi-purple text-kpi-purple-fg`; botão "Ver sugestões" `h-9 px-4 rounded-lg bg-primary`; X 32×32. — DoD: h 56±4.
- [ ] **25.** Bolhas (`ChatMessageBubble.tsx`/`MessageBubble.tsx`, só classes): recebida `bg-muted rounded-2xl rounded-tl-md px-3.5 py-2.5 max-w-[68%]` com avatar 32 à esquerda; enviada `bg-primary text-primary-foreground rounded-2xl rounded-tr-md`; hora `text-[11px] opacity-70` no rodapé da bolha à direita; chip de data centralizado `h-7 px-3 rounded-full bg-muted text-xs`. Anexos/áudio/produto mantêm componentes. — DoD: screenshot mostra as duas bolhas.
- [ ] **26.** Testes de `chat/__tests__` atualizados. `npx vitest run src/components/inbox/chat` verde. — DoD: exit 0.
- [ ] **27.** Commit `redesign(inbox): fase 2 — chat header 72px, 4 ações, abas pill, bolhas`. Push. Screenshot `fid-02-header.png`. — DoD: medidas no ledger.

**CP2 — Header.** Gate: header 72±2 · avatar 48±2 · botões 40±2 (4) · pill 36±2 · banner 56±4 · 0 handler perdido (lista no ledger: tool antigo → onde está agora).

### FASE 3 — Input e ações rápidas (28–33) → CP3
- [ ] **28.** Criar `chat/QuickActionChips.tsx`: `div flex items-center gap-2 px-4 pt-2 overflow-x-auto scrollbar-none`; chip `h-9 px-3 rounded-lg bg-muted/60 border border-border text-[13px] font-medium gap-2 hover:bg-muted whitespace-nowrap` ícone 15. Chips: **Resposta Rápida** (`MessageSquareText` → abre `ChatQuickRepliesPopover`/quick replies existente), **Assistente IA** (`Sparkles` → `onTabChange('ia')` — descubra como a aba é trocada: prop do `ChatPanel`), **Anexar** (`Paperclip` → dispara o mesmo file input do anexo atual), **Agendar** (`CalendarClock` → `ScheduleMessageDialog`), **Transferir** (`ArrowLeftRight` → `transferDialog`), **⋯ Mais** (`MoreHorizontal` → `DropdownMenu` com **todas** as ferramentas da `SecondaryToolbar`/`TertiaryToolsMenu`/`InputExtraTools` que não estão em chip nem na toolbar do input: sticker, localização, enquete, template, contato, áudio-meme, TTS, tradução, IA rewrite/enhance, markdown, etc. — liste todas no ledger). — DoD: 6 chips h 36; cada chip aciona a função original.
- [ ] **29.** `ChatInputArea.tsx`: `QuickActionChips` acima; wrapper do input `mx-4 mb-3 min-h-[52px] rounded-xl bg-input border border-border flex items-center gap-1 pl-4 pr-2`; textarea auto-grow mantida (`ChatMessageInput`), placeholder "Digite uma mensagem… (/ para comandos, @ para mencionar)". Direita: 4 botões ghost 36×36 ícone 20 — `Smile` (emoji picker existente), `Paperclip` (anexo), `Camera` (se existir captura/upload de imagem; senão `Image` → mesmo anexo filtrado por imagem), `Mic` (gravação existente) — e botão enviar `w-11 h-11 rounded-[10px] bg-primary hover:bg-primary/90` com `Send` 18 (`disabled` quando vazio, igual hoje). Botão "+" da esquerda some (suas funções estão em "⋯ Mais"). — DoD: input 52±2; enviar 44±2; enviar texto funciona; gravação funciona.
- [ ] **30.** `SecondaryToolbar`/`TertiaryToolsMenu`: passam a alimentar o dropdown "⋯ Mais" (exportar a lista de itens como array `{icon,label,onClick}` para reutilizar). Nada é removido. — DoD: contagem de itens antes == depois (registre N).
- [ ] **31.** Menções, comandos `/`, preview de link, reply-quote, drag overlay: verificar que continuam ligados ao textarea. — DoD: `/` abre `SlashCommands`; `@` abre `MentionAutocomplete`.
- [ ] **32.** Testes `chat/__tests__` (input) verdes. — DoD: exit 0.
- [ ] **33.** Commit `redesign(inbox): fase 3 — chips de ação rápida e input 52px`. Push. Screenshot `fid-03-input.png`. — DoD: medidas.

**CP3 — Input.** Gate: chips 36±2 (6) · input 52±2 · enviar 44±2 · N ferramentas preservadas (todas no menu) · console 0.

### FASE 4 — Primitivos das abas (34–37) → CP4
- [ ] **34.** `KpiStrip.tsx`: `KpiCell.tone?: 'blue'|'green'|'purple'|'yellow'|'red'`; tile `w-10 h-10 rounded-[10px]` com mapa: blue `bg-kpi-blue text-kpi-blue-fg`, green `bg-kpi-green text-kpi-green-fg`, purple `bg-kpi-purple text-kpi-purple-fg`, yellow `bg-kpi-yellow text-kpi-yellow-fg`, red `bg-destructive/15 text-destructive`; `iconClassName` continua aceito (prioridade sobre tone); `sublabel?: ReactNode` 11px muted/70 abaixo do valor; valor `text-[22px] font-bold tabular-nums`. Default sem tone = comportamento atual. — DoD: teste unitário dos 5 tones.
- [ ] **35.** `SectionCard.tsx`: `tone?` (mesmo mapa) no tile 28; `action.variant?: 'link'|'pill'` — pill = `h-7 px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25` (usado para "+ Adicionar"); `subtitle?: string` (13 muted abaixo do título — usado nas colunas de tarefas); `headerRight?: ReactNode` (badge de contagem vermelho, botão "Usar resposta"). Default inalterado. — DoD: snapshot do default idêntico.
- [ ] **36.** `TaskCard.tsx` reescrito: `div rounded-[10px] bg-muted/30 border border-border p-3 flex gap-3` → `Checkbox` 16 (`toggleDone` existente) · coluna: título `text-[13px] font-semibold` (riscado se done) + descrição `text-xs text-muted-foreground line-clamp-2` + linha de chips: prioridade (`alta` → `bg-destructive/15 text-destructive`, `media` → `bg-warning/15 text-warning`, `baixa` → `bg-primary/15 text-primary`; rótulos "Alta prioridade"/"Média"/"Baixa") · linha vencimento `Clock` 12 + `format(due,'EEE, dd/MM, HH:mm')` (`text-destructive` se atrasada, `text-warning` se hoje, senão muted) · linha responsável: avatar 20 + nome 12 muted · `MoreVertical` 16 ghost à direita (menu existente: editar/excluir). Só campos que existem em `useConversationTasks` — cheque o tipo antes; o que não existir, omita. — DoD: teste unitário (atrasada/hoje/futura/concluída).
- [ ] **37.** Commit `redesign(inbox): fase 4 — KpiStrip/SectionCard/TaskCard com tones`. Push. — DoD: vitest verde.

**CP4 — Primitivos.** Gate: 3 componentes com testes; consumidores atuais sem diff visual (default intocado).

### FASE 5 — Fidelidade das 7 abas (38–51) → CP5
Antes de cada aba: `Read` da referência correspondente. Depois de cada aba: screenshot `fid-05-<aba>.png` e 3 linhas no ledger "o que ainda difere".
- [ ] **38.** **Tarefas** (`05-tarefas.jpg`): banner mantém; KPIs tone red/yellow/green com sublabels ("Requer atenção" / "Vencem hoje" / "Últimos 7 dias"); select "Todas as tarefas" `h-9 rounded-lg bg-input border-border` à direita da strip. Criar `tabs/TaskColumn.tsx` = `SectionCard` com `subtitle` e lista de `TaskCard` gap 2; 3 colunas `grid-cols-3 gap-3` (Hoje "<dia da semana, d de mês>" · Próximas "Esta semana" · Concluídas recentes "Últimos 7 dias"). Empty por coluna: texto 13 muted. — DoD: 3 colunas; cards com checkbox/chip/vencimento.
- [ ] **39.** **Notas** (`04-notas.jpg`): grid `grid-cols-2 gap-3`; tones: Notas privadas blue · Fatos relevantes yellow (`Lightbulb`) · Objeções red (`ShieldAlert`/`XCircle`) · Promessas feitas green (`Handshake`) · Pendências blue (`Clock`) · Resumo comercial blue (`BarChart3`) com ação "Editar" link; "+ Adicionar" `variant:'pill'`; item de nota: texto 13 + rodapé `text-[11px] text-muted-foreground` "dd MMM yyyy · HH:mm · Por: {autor}" + ⋮; Fatos = lista com bullet; Objeções = card interno com chip (categoria se existir); Promessas/Pendências = checkbox + texto + data à direita; banner inferior mantém. — DoD: 6 cards com tiles coloridos; CRUD funciona.
- [ ] **40.** **IA** (`03-ia.jpg`): banner com status à direita ("Analisando…" / "Sem análise ainda" — dado real). Grid 2 col: Sugestão de resposta (`headerRight` = botão "Usar resposta" `h-7 px-3 rounded-lg bg-primary/15 text-primary`; corpo = texto 13 em `bg-muted/30 rounded-lg p-3`; rodapé = 4 chips de tom `h-7 px-2.5 rounded-lg border border-border bg-muted/40 text-xs` → cada chip re-gera com o tom (se o hook aceitar `tone`; senão os chips ficam **desabilitados com tooltip "em breve"** — registre); Resumo da conversa (`headerRight` = "Copiar" com `Copy` 14; corpo = lista `•` 13); Objeções detectadas (`headerRight` = badge `bg-destructive text-white h-5 min-w-5 rounded-full text-[11px]`; itens = dot vermelho + título 13/600 + citação 12 muted + chip severidade à direita verde/amarelo/vermelho); Próxima melhor ação (`headerRight` "Ver todas" link; card destacado `bg-primary/10 border border-primary/30 rounded-lg p-3` com tile 32 `bg-kpi-purple` + título + descrição + `ChevronRight`; abaixo checklist 3 itens com círculo 16); Produtos recomendados (`headerRight` "Ver catálogo"; lista thumb 40 + nome 13/600 + marca 11 + preço `text-primary font-bold` + botão "Adicionar" `h-7 px-3 rounded-lg bg-primary text-[11px]`); Risco/sentimento (`headerRight` chip Positivo/Neutro/Negativo; corpo = ícone `Smile` 40 em círculo `border-2 border-success` + título 13/600 + texto 12 + 3 chips). Tudo com dado real dos hooks já existentes (`useNextBestAction`, `useRecommendedProducts`, objeções, sentimento). — DoD: 6 cards; nenhum texto inventado.
- [ ] **41.** **CRM 360°** (`01-crm360.jpg`): strip 4 KPIs tones blue/green/blue/green (Cliente desde · Lead score com sublabel "Score N" · Última interação · Status com dot verde). Empresa: avatar 40 + nome 15/600 + subtítulo "CNPJ/CPF" + 3 mini-colunas (Segmento/Porte/Localização) **só se houver dado** (senão card mostra só o que existe + "Adicionar empresa" link). Etapa no funil: 5 segmentos `h-1.5 rounded-full` (`bg-primary` até a etapa atual, `bg-muted` depois) com rótulos 11 abaixo; linha "Proposta enviada · Aguardando retorno" + botão "Avançar etapa" `h-8 rounded-lg bg-primary` (handler `useAdvanceDealStage` existente); "Última atualização" 11 muted. Últimas compras / Propostas em aberto: lista thumb 40 `rounded-lg bg-muted` + nome 13/600 + "qtd · R$" 12 muted + data 11 + chip status (Entregue verde / Aguardando retorno amarelo / Em análise azul); "Ver todas →". Ticket médio: valor 22/700 + chip delta verde `+N%` (só se computável) + "vs. últimos 6 meses". Produtos de interesse: chips `bg-muted` + "+N". Próxima melhor ação: texto + botão "Criar tarefa" `h-8 bg-primary` (→ aba tasks). Pipeline comercial: 3 valores (Em propostas / Em negociação / Ganhos) + barra empilhada `h-2 rounded-full` (`bg-primary` / `bg-warning` / `bg-success`) + legenda com %. Últimas interações comerciais: lista hora 11 + dot + texto 12. — DoD: screenshot; empty states honestos onde não há dado.
- [ ] **42.** **Arquivos** (`02-arquivos.jpg`): header `h1 text-xl font-bold` + subtítulo 13 muted; linha: busca `h-9 rounded-lg bg-input` flex-1 + botão filtro 36 + select "Mais recentes" `h-9 w-[180px]`; chips `h-8 px-3 rounded-lg` com contador (ativo `bg-primary text-primary-foreground`, inativo `bg-muted/40 border-border`; contador `bg-white/15` no ativo, `bg-muted` no inativo). Grid: `grid-cols-3 gap-3` (2 col quando o painel de detalhe está aberto). `FileCard`: `rounded-xl border border-border bg-card overflow-hidden`; thumb `aspect-video bg-muted` (imagem/ícone de tipo centrado 32; overlay play em vídeo com duração `bottom-2 right-2 h-5 px-1.5 rounded bg-black/60 text-[10px]`); corpo p-3: nome `text-[13px] font-medium truncate` + tipo · tamanho 11 muted + data 11 muted + avatar 16 + remetente 11; rodapé 4 ícones ghost 28×28 (`Eye`, `Download`, `Share2`, `MoreHorizontal`) — handlers existentes. `FileDetailPanel`: `w-[260px] shrink-0 rounded-xl border border-border bg-card p-3` (thumb `aspect-[4/3] rounded-lg`, nome 14/600, meta 12 muted, "Enviado por" + avatar, legenda em `bg-muted/30 rounded-lg p-2.5 text-xs` se houver, botão "Baixar arquivo" `h-9 bg-primary w-full`, 4 botões `h-8 w-full bg-muted/40 border-border justify-start gap-2 text-xs` (Encaminhar / Copiar link / Salvar na galeria / Excluir `text-destructive`) — só os que têm handler). Selecionado: `ring-2 ring-primary`. — DoD: grid 3 col; detalhe 260±4.
- [ ] **43.** **Histórico** (`06-historico.jpg`): header `h1 text-xl font-bold` + subtítulo + botão "Exportar histórico" `h-9 rounded-lg border border-border bg-card gap-2` (`Download` 14); linha de filtros: `<span text-xs text-muted-foreground>Período</span>` + select `h-9 w-[180px]` · "Tipo de evento" + select; KPIs tones blue/green/blue/green com sublabels ("Mensagens, ligações e ações" / "Há N horas" / chip verde `+N%` se computável / "Conversas finalizadas"); chip de data `h-7 px-3 rounded-full bg-muted text-xs`; timeline: `grid grid-cols-[44px_20px_1fr] gap-x-2`, hora `text-xs text-muted-foreground pt-3`, coluna do dot: linha vertical `w-px bg-border` + dot 10 colorido (mensagem azul / nota roxo / transferência verde / ligação azul / arquivo azul / tarefa amarelo / proposta verde), card `rounded-[10px] border border-border bg-card p-3 flex gap-3`: tile 32 colorido (mesma cor do dot) + título 13/600 + descrição 12 muted + badge à direita `h-[22px] px-2 rounded-md text-[11px] font-medium` (WhatsApp `bg-success/15 text-success` com ícone / Transferência `bg-muted` / Concluída verde / Pendente amarelo / Visualizada azul). Mapa event_type real → cor/ícone/badge no ledger (event_types reais: assign, unassign, transfer, queue_transfer, overload_reassign, absence_reassign, close, reopen + mensagens + notas + arquivos + tarefas — grep no hook). — DoD: timeline com 3 colunas; badges de dado real.
- [ ] **44.** **Pedidos** (`OrdersTab`): harmonizar com CRM (lista de compras igual à etapa 41). — DoD: coerente.
- [ ] **45.** **Chat** (`07-chat.jpg`): confirmar banner + bolhas + input das fases 2–3; card de produto na mensagem (se existir componente de produto): `bg-primary/10 border-primary/30 rounded-xl p-3` thumb 56 + nome 13/600 + marca 11 + preço `text-primary font-bold` + 2 botões `h-8` (Ver detalhes / Adicionar ao carrinho) — só se o componente já existir; senão registre. — DoD: screenshot.
- [ ] **46.** Testes das abas (`tabs/__tests__`) atualizados; `npx vitest run src/components/inbox` verde. — DoD: exit 0.
- [ ] **47.** `grep -rn "Joaquim\|Sicoob\|Ana Souza\|12.450\|2.450" src/components/inbox` = 0. — DoD: 0.
- [ ] **48.** `grep -rnE "bg-\[#|text-\[#|hsl\(" src/components/inbox --include=*.tsx | grep -v "var(--"` = 0 (nenhuma cor literal nova). — DoD: 0.
- [ ] **49.** Reduced motion: nada novo animado. — DoD: n/a.
- [ ] **50.** `npm run build` — verificar tamanho do chunk `RealtimeInboxView` (era 86KB) — registrar Δ. — DoD: número no ledger; se >+15KB, registre o motivo.
- [ ] **51.** Commit `redesign(inbox): fase 5 — fidelidade das 7 abas (tones, colunas de tarefas, grid de arquivos, timeline)`. Push. — DoD: 7 screenshots `fid-05-*.png`.

**CP5 — Abas.** Gate: 7 screenshots; por aba, ledger com "o que ainda difere" (máx 3 linhas honestas); 0 nome inventado; 0 cor literal; vitest verde.

### FASE 6 — QA visual + funcional (52–55) → CP6
- [ ] **52.** Screenshots finais das 7 abas no preview local em 1672×941: `fid-06-<aba>.png`. Script de medida (`/workspace/qa/inbox-fid-measure.mjs`, adaptado de `inbox-measure.mjs`): coluna w, item h, avatar, busca h, botão nova conversa h, chips count, header h, botões header (4×40), pill 36, banner 56, chips input (6×36), input 52, enviar 44, kpi tile 40, grid arquivos cols=3, detalhe 260. Assert cada um com tolerância §2.3; corrigir e repetir (máx 3). — DoD: tabela no ledger.
- [ ] **53.** Funcional (`/workspace/qa/inbox-fid-func.mjs`): 20 checks — busca filtra; cada chip de status filtra; popover de filtro abre e `ContactTypeFilter` muda a lista; grupo Fixadas aparece ao fixar; estrela favorita; clicar item abre chat; Ligar abre dropdown; ⋮ abre menu com ≥8 itens; Transferir abre dialog; cada aba renderiza sem erro; banner "Ver sugestões" troca para IA; chip "Assistente IA" troca para IA; chip "Agendar" abre dialog; "⋯ Mais" abre menu com ≥N itens; digitar e enviar (**não envie** para cliente real: só verificar que `disabled` some ao digitar); gravação inicia/cancela; `/` abre comandos; `@` abre menções; Arquivos: clicar card abre detalhe 260; Histórico: mudar período filtra; Tarefas: criar tarefa aparece em coluna; Notas: adicionar nota aparece. Console sem `error`. — DoD: JSON `{ok:[],fail:[]}` no ledger.
- [ ] **54.** Mobile 390×844 (`fid-06-mobile.png`): lista em tela cheia, sem overflow horizontal (`scrollWidth <= innerWidth`); chips rolam; abrir conversa → header + abas rolam. — DoD: screenshot + assert.
- [ ] **55.** Light mode (`localStorage.theme='light'`, `fid-06-light.png`): nada quebrado (contraste dos chips coloridos legível). — DoD: screenshot.

**CP6 — QA.** Gate: geometria N/N OK · func 20/20 (ou lista honesta de falhas) · mobile ok · light ok.

### FASE 7 — Gates, PR (56–58) → CP7
- [ ] **56.** Gates completos: `npx tsc -b --force` 0 · `node scripts/ci/lint-ratchet.mjs` novas=0 · `npm run implicit-any-check` · `npx vitest run` (suite inteira; falhas pré-existentes conhecidas registradas) · `npm run build`. — DoD: 5 saídas.
- [ ] **57.** Abrir PR `redesign(inbox): fidelidade carvão — lista, header, input, 7 abas` para `main` (`gh pr create` ou API). Corpo = seção "Entrega" do ledger (resumo por bloco, arquivos, handlers preservados com tabela "antes → depois", gates, screenshots `prod-inbox-*.jpg` vs `fid-06-*.png`, pendências). **Não merge.** — DoD: URL do PR no ledger.
- [ ] **58.** Matar o preview (`kill $(cat /workspace/qa/inbox-fid-preview.pid)`). Ledger com as 8 seções de CP preenchidas e "Pendências/resíduos" honesto. — DoD: ledger completo; última linha do stdout = URL do PR.

**CP7 — Entregue.** PR aberto, CI verde, ledger completo.

---

## 6. CRITÉRIOS DE ACEITAÇÃO
**Visual:** lado a lado com a referência, a diferença é **só cor de superfície** (carvão vs navy), fonte e conteúdo real. Layout, hierarquia, tamanhos, tiles coloridos, chips, badges e botões batem com §2.3.
**Funcional:** §4 integralmente verde; tabela "tool antigo → onde está agora" sem linha vazia.
**Técnico:** typecheck 0, ratchets, testes, build, 0 cor literal, 0 nome inventado, 0 token alterado, 0 diff em `contact-details/**`.
**Honestidade:** ledger com números e caminhos; pendências declaradas.

---

## 7. TEMPLATE DO LEDGER `docs/design/INBOX_FIDELIDADE_STATUS.md`
```md
# Inbox — Fidelidade Carvão — STATUS
Branch: redesign/inbox-fidelidade-carvao · Base: 27c22f4d · Worktree: /workspace/repos/Zapp_Web_V2-inbox · Preview: http://localhost:4173

## CP0 Ambiente   [ ] sha= · baseline: tsc=_ lint-ratchet=_ implicit=_ vitest=_ · classes de tile disponíveis: _ · leitura das 7 refs: (21 linhas abaixo)
## CP1 Lista      [ ] sha= · shot=fid-01-lista.png · coluna=_ item=_ avatar=_ busca=_ btn=_ chips=_ grupos=_ · o que ainda difere: _
## CP2 Header     [ ] sha= · shot=fid-02-header.png · header=_ avatar=_ btns=_ pill=_ banner=_ · tools antigos → novo lugar: (tabela)
## CP3 Input      [ ] sha= · shot=fid-03-input.png · chips=_ input=_ enviar=_ · ferramentas preservadas: N/N (lista)
## CP4 Primitivos [ ] sha= · testes: KpiStrip _ SectionCard _ TaskCard _
## CP5 Abas       [ ] sha= · shots=fid-05-{tasks,notes,ia,crm,files,history,chat}.png · por aba, o que ainda difere: _ · nomes inventados=0 · cores literais=0 · bundle Δ=_
## CP6 QA         [ ] geometria _/N · func _/20 · mobile _ · light _
## CP7 Entrega    [ ] PR=_ · CI=_ · gates: tsc=_ lint=_ implicit=_ vitest=_ build=_

## Divergências plano × código
-
## Iterações do loop visual (máx 3 por fase)
-
## Pendências / resíduos (honestos)
- Fotos de contato: avatar real ou iniciais (referência usa rostos gerados)
- Presença "Online": só se houver fonte real
- Chips de tom da IA: dependem do hook aceitar `tone`
- Spam: chip só se existir status/tag no modelo
-
```
