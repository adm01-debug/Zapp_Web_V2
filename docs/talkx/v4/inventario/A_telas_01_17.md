# Inventário mock × código — Telas 01 e 17 (Talk X / Campanhas)

Base: `main` @ `3d09433` (2026-10-01). Somente leitura. Mocks lidos em 1672×941 + recortes 2× (PIL).
Abreviações: `Shared` = `src/components/talkx/talkxShared.tsx` · `Overview` = `src/components/talkx/TalkXOverview.tsx` ·
`View` = `src/components/talkx/TalkXView.tsx` · `useTalkX` = `src/hooks/integrations/useTalkX.ts`.

---

## Tela 01 — Campanhas · Visão geral

### Componente(s) atuais

- **Módulo:** `View:237-310` (cabeçalho + abas) → `Overview:44-348` (KPIs, filtros, tabela/grade, rail, 3 modais).
- **Kit:** `Shared` — `ModuleHeader:208`, `KpiCard:501`, `FilterBarV2:864`, `TalkXPagination:386`, `HeroCard:701`, `RailCard:224`,
  `RailAction:242`, `RecentList:730`, `TipCard:757`, `TalkXConfirmDialog:788`, `TalkXEmptyState:441`, `TalkXSkeletonRows:473`.
- **Dados:** `useTalkX:133-145` (`select * from talkx_campaigns`, tudo em memória; realtime `:148-181`; polling 15 s de fallback).
  Criadores: `View:124-133` (`get_team_profiles`). Segmentos: `useTalkXSegments`.
- **Montagem:** `src/pages/lazyViews.ts:56` → `src/pages/ViewRouter.tsx:97` (`'talkx'`), gutter compacto `:34`; item de menu
  `src/services/navigation.service.ts:71` (grupo "Automação & IA", ícone `Sparkles`, `roles: admin, supervisor`); atalho `Alt+N`
  `src/hooks/ui/useNavShortcuts.ts:12`; bloqueio de rota `ViewRouter.tsx:129,135`.
- **Shell × módulo:** o app **não tem cabeçalho global** — `src/components/layout/AppShell.tsx:119-153` renderiza só `Sidebar` + `ViewRouter`.
  Tudo que o mock mostra na faixa superior (busca ⌘K, 6 ícones, "Online", lua, sino, avatar) seria do **shell** e não existe como barra;
  as funções equivalentes vivem no rodapé/corpo da `Sidebar` (`src/components/layout/Sidebar.tsx`). Do **módulo** são: cabeçalho
  "Campanhas", abas, KPIs, filtros, tabela, paginação e rail.

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T01-001 | Shell · sidebar | Logo "Z ZAPP" + botão recolher | nav | OK | `Sidebar.tsx:86-98` | — | — |
| T01-002 | Shell · sidebar | "Chat" com badge "24" | dado | PARCIAL | `Sidebar.tsx:128`; `src/pages/Index.tsx:120` (`unreadNotifications={0}` fixo) | não lidas do inbox (não ligado) | front: passar contagem real ao `inboxBadge` (fora do Talk X) |
| T01-003 | Shell · sidebar | "Teams" | nav | OK | `navigation.service.ts:41` | — | — |
| T01-004 | Shell · sidebar | "Email" com badge "5" | dado | PARCIAL | `navigation.service.ts:42`; badge só para `inbox` (`Sidebar.tsx:128`) | SEM FONTE ligada | front: badge de e-mail (fora do Talk X) |
| T01-005 | Shell · sidebar | "Contatos", "Dashboard", "Pipeline" | nav | PARCIAL | `navigation.service.ts:43,47,50` (Pipeline chama-se "Quadro"; ordem diferente; há Multiplix/Catálogo/Telefonia/Tarefas/Conquistas a mais) | — | decisão de produto (shell) |
| T01-006 | Shell · sidebar | "Campanhas" (ativo, ícone foguete, na nav primária) | nav | PARCIAL | `navigation.service.ts:71` (grupo "Automação & IA", ícone `Sparkles`) | — | front: mover para nav primária/trocar ícone (se o mock valer para o shell) |
| T01-007 | Shell · sidebar | "Automações & IA", "Analytics", "Conexões", "Configurações" (itens planos) | nav | PARCIAL | `navigation.service.ts:67-113` (são grupos colapsáveis; Configurações está em "Sistema") | — | decisão de produto (shell) |
| T01-008 | Shell · sidebar | Grupo "VENDAS & CRM": "CRM 360°", "Leads", "Clientes", "Oportunidades" | nav | PARCIAL | `navigation.service.ts:57-65` (CRM 360°, Carteira, Filas, Agendamentos, Grupos) | — | "Leads/Clientes/Oportunidades" não existem como view (ids ausentes em `getGroups`) |
| T01-009 | Shell · sidebar | Rodapé "CONTROLES…" + pill "AO Admin 01 / Administrador" + 2 ícones | visual | PARCIAL | `Sidebar.tsx:202-231`; `SidebarUserPill.tsx:25-56` (5 toggles em vez de 2 ícones) | `profiles`, presença | — (já funcional, layout diferente) |
| T01-010 | Shell · topo | Busca "Buscar campanhas, segmentos, templates… (⌘ + K)" | ação | PARCIAL | Não há barra: `AppShell.tsx:119-153`. Equivalente: botão "Buscar… ⌘K" `Sidebar.tsx:150-158` → `src/components/CommandPalette.tsx:98` ("Buscar módulo…", só módulos) **e** paleta do `GlobalKeyboardProvider.tsx:131-138` com `talkxCommands` (`useTalkXCommandItems.ts:30-58`) | cache react-query `talkx-campaigns/segments/templates` | front: (a) campo no topo; (b) duas paletas escutam o mesmo ⌘K (`CommandPalette.tsx:67-76` e `GlobalKeyboardProvider.tsx:81-85`); (c) itens Talk X só existem se o módulo já foi aberto (`useTalkXCommandItems.ts:26-28`); (d) toda ação só faz `onNavigate('talkx')` (`:37,47,57`), não abre o item; (e) rótulo `running` inexistente (`:13`) → status `sending` aparece cru |
| T01-011 | Shell · topo | 6 botões de ícone (✦ IA, fluxo, gráfico, relógio, pessoas, calendário) | nav | AUSENTE | grep `AppHeader`, `HeaderUserPill`, `GlobalHeader`, `TopHeader` em `src` → só comentário em `DashboardTopBar.tsx:13` | — | front: cabeçalho global não existe (escopo do shell, não do Talk X) |
| T01-012 | Shell · topo | Pill "● Online" | estado | PARCIAL | presença existe só no rodapé: `SidebarUserPill.tsx:29,50`; `AppShell.tsx:61` | presença do agente | front: pill no topo (shell) |
| T01-013 | Shell · topo | Ícone lua (tema) | ação | PARCIAL | `Sidebar.tsx:224-229` (rodapé da sidebar) | — | posição (shell) |
| T01-014 | Shell · topo | Sino com badge "3" | dado | AUSENTE | "Não existe central de notificações no app" `DashboardTopBar.tsx:11-12` | SEM FONTE | front+banco: central de notificações (shell) |
| T01-015 | Shell · topo | Avatar + "Admin 01 / Administrador" | visual | PARCIAL | `SidebarUserPill.tsx:25-56` (rodapé) | `profiles`, `user_roles` | posição (shell) |
| T01-016 | Cabeçalho | Tile raio + título "Campanhas" | visual | OK | `View:239-241`; `Shared:208-221` | — | — |
| T01-017 | Cabeçalho | "Conecte. Engaje. Converta. Comunicação em escala, com resultado real." | visual | OK | `View:242` | — | — |
| T01-018 | Cabeçalho | Botão "ⓘ Ajuda" (ícone + rótulo) | ação | PARCIAL | `View:251-256` (só ícone, `aria-label`), abre `TalkXHelp` (Dialog) `View:261` | — | front: rótulo visível |
| T01-019 | Cabeçalho | Botão "+ Nova campanha" | ação | OK | `View:257` → `openNew` `View:105-109` | — | — |
| T01-020 | Abas | "Visão geral" (ativa) | nav | PARCIAL | `View:267,285`; estado local `View:36` | — | front: deep link `?tab=` (aba some no reload) |
| T01-021 | Abas | "Segmentos" | nav | PARCIAL | `View:268,296` | — | idem deep link |
| T01-022 | Abas | "Templates ▾" (chevron/dropdown) | nav | PARCIAL | `View:269,299` (sem chevron/menu) | — | front: dropdown (Biblioteca/Criar) |
| T01-023 | Abas | "Lista de supressão" | nav | PARCIAL | `View:270,302` | — | idem deep link |
| T01-024 | Abas | "Analytics ▾" (chevron/dropdown) | nav | PARCIAL | `View:271,305` (sem chevron/menu) | — | front: dropdown; `TalkXSettings` não é montada em lugar nenhum (grep `TalkXSettings` fora do próprio arquivo = 0) |
| T01-025 | KPIs | "Total de campanhas 24" + mini-barras | dado | OK | `Overview:100,105,122` | `count(talkx_campaigns)` visíveis por RLS; barras = `created_at` 8 dias | (V41 quer RPC; cálculo hoje é no cliente) |
| T01-026 | KPIs | "Em andamento 3" + mini-barras | dado | PARCIAL | `Overview:101,123` (`sending` + `paused`; sem barras) | `talkx_campaigns.status` | front: barras; decidir se inclui `scheduled`. banco: RPC `talkx_overview_stats` conta `status IN ('running','paused')` — `running` não existe (`supabase/migrations/20260916180000…:49`) |
| T01-027 | KPIs | "Concluídas 18" + "↗ +22%" | dado | PARCIAL | `Overview:102,106,124` (valor OK; barras no lugar do delta) | valor: `status='completed'`. Delta: **SEM FONTE** (RPC não devolve `completed` do período anterior, `…180000:60-72`) | banco: `completed` no bloco `previous`. front: delta só com base |
| T01-028 | KPIs | "Taxa de sucesso 96,4%" (ícone anel) + "↗ +2,1%" | dado | PARCIAL | `Overview:103,125` — `sent/(sent+failed)`, impresso com ponto ("96.4%"), sem delta | mock = entregues/enviados → `delivered_count/sent_count`; RPC tem `delivery_rate_pct` atual e anterior | front: usar RPC, vírgula decimal (`fmtPct`), delta; ícone anel |
| T01-029 | KPIs | "Contatos alcançados 12.842" + "↗ +18%" | dado | FALSO | `Overview:104,126` (rótulo diz contatos, número é soma de `sent_count`: o mesmo contato em 2 campanhas conta 2×) | distinct `talkx_recipients.contact_id` com `sent_at` — RPC hoje soma `total_recipients` (`…180000:43`) | banco: distinct na RPC. front: consumir + delta |
| T01-030 | Filtros | Busca "Buscar campanhas..." | ação | OK | `Overview:131-132,87-90`; debounce `Shared:877-881` | nome/mensagem/descrição em memória | — |
| T01-031 | Filtros | Select "Todos os status" | ação | PARCIAL | `Overview:75,83`; `Shared:895-903` | `talkx_campaigns.status` | front: o gatilho mostra "Todos" (item `all` = "Todos", `Shared:900`), não "Todos os status" |
| T01-032 | Filtros | Select "Todos os canais" | ação | AUSENTE | no lugar há "Todos os objetivos" `Overview:76,84` | **SEM FONTE** (não há coluna de canal; só WhatsApp) | front: select fixo "WhatsApp" desabilitado (V42) ou remover do mock |
| T01-033 | Filtros | Select "Todos os segmentos" | ação | PARCIAL | `Overview:77,85` | `talkx_campaigns.segment_id` → `talkx_segments.name` | front: mesmo rótulo "Todos" (T01-031) |
| T01-034 | Filtros | Select "Todos os criadores" | ação | PARCIAL | `Overview:78,86`; `View:124-133` | `talkx_campaigns.created_by` → `get_team_profiles` | front: mesmo rótulo "Todos" |
| T01-035 | Filtros | Botão "Limpar filtros" | ação | OK | `Shared:906-910`; `Overview:71-72` (só aparece com filtro ativo; mock mostra sempre) | — | — |
| T01-036 | Filtros | Toggle visão lista (ativo) | ação | OK | `Shared:913-916`; `Overview:54,135` | — | preferência não persiste (só filtros vão ao `sessionStorage`, `Overview:58-60`) |
| T01-037 | Filtros | Toggle visão grade | ação | PARCIAL | `Overview:206-209,361-386` | — | front: card sem ⋮, sem checkbox, sem thumb, sem "entregues" |
| T01-038 | Tabela | Checkbox "selecionar todas" no cabeçalho | ação | PARCIAL | `Overview:215,112` | — | front: seleção não faz nada (sem barra de ações em massa); não limpa ao trocar página/filtro; `toggleAll` compara só `size` |
| T01-039 | Tabela | Checkbox por linha | ação | PARCIAL | `Overview:227` | — | idem T01-038 |
| T01-040 | Tabela | Coluna "Campanha": miniatura + nome + descrição ("Lançamento Linha Office / Produtos em destaque para escritórios") | dado | PARCIAL | `Overview:229-235` (IconTile por objetivo no lugar da miniatura) | `name`, `description`; miniatura: `talkx_campaigns.media_url` (só se a campanha tiver imagem; bucket `talkx-media` não existe) | front: thumb com fallback. banco/storage: bucket (V27) |
| T01-041 | Tabela | Coluna "Segmento / Público": chip "Empresas • Escritório" + "1.248 contatos" | dado | OK | `Overview:237-240` | `segment_id→talkx_segments.name`, `total_recipients` | — |
| T01-042 | Tabela | Coluna "Canal": logo WhatsApp | visual | PARCIAL | `Overview:241` (ícone genérico `MessageSquare`, fixo) | SEM FONTE (canal único) | front: logo WhatsApp |
| T01-043 | Tabela | Coluna "Status": pills "Em andamento", "Agendada", "Concluída", "Pausada", "Rascunho" | dado | OK | `Overview:242`; `Shared:25-32,420-423` | `talkx_campaigns.status` | (sem dot pulsante em `sending`) |
| T01-044 | Tabela | Coluna "Progresso": "68%" + barra; agendada "0%" + barra vazia; rascunho "-" | dado | PARCIAL | `Overview:221-223,243-247` | `(sent_count+failed_count)/total_recipients` | front: agendada mostra "0%" sem barra; rascunho com destinatários mostra "0%" em vez de "-" |
| T01-045 | Tabela | Coluna "Resultados": "850 enviados" / "821 entregues (96,6%)" | dado | PARCIAL | `Overview:248-252` (2ª linha = falhas ou "% de sucesso", nunca entregues) | `sent_count`, `delivered_count` (existe) | front: usar `delivered_count` |
| T01-046 | Tabela | Coluna "Agendada em": "Hoje, 10:00" / "Ontem, 16:20" / "15 set. 2026, 09:00" | dado | PARCIAL | `Overview:224,253-255`; `Shared:89-90` (sempre data absoluta) | `scheduled_at ?? started_at` | front: "Hoje/Ontem" relativo |
| T01-047 | Tabela | "por Ana Silva" (criador) | dado | OK | `Overview:254`; `View:124-133` | `created_by` → `get_team_profiles` | — |
| T01-048 | Tabela | Coluna "Ações": botão "⋮" por linha | ação | PARCIAL | `Overview:256-275` (menu à mão; `RowActionsMenu` `Shared:561` sem uso). Itens: Ver/Monitorar/Ver relatório, Editar, Iniciar agora, Pausar, Retomar, Duplicar, Cancelar campanha, Excluir | edge `talkx-send` (start/pause/cancel) `useTalkX:353-386`; delete direto `:291-300` | front: pausar/retomar sem confirmação (`:267-268`); duplicar não persiste (ver T17-037); excluir só em rascunho (`:272`) e `deleteCampaign` sem `onError`; pausar/cancelar daqui não gravam evento (`View:290-291`); "Ver relatório" abre o Monitor (não há tela 14) |
| T01-049 | Tabela | Clique no nome abre a campanha | nav | OK | `Overview:229`; roteamento por status `View:156-160` | — | concluída/cancelada cai no Monitor |
| T01-050 | Tabela | Ordenação por coluna (cabeçalhos) | ação | AUSENTE | grep `aria-sort` e `sort` em `Overview` → só `latest` (`:110`); lista vem `created_at desc` (`useTalkX:139`) | — | front: ordenação (o mock não desenha setas; exigência do V42) |
| T01-051 | Paginação | "Mostrando 1 a 8 de 24 campanhas" | dado | OK | `Shared:393`; `Overview:94,283` | paginação em memória | — |
| T01-052 | Paginação | "‹ 1 2 3 ›" | nav | OK | `Shared:395-402` | — | — |
| T01-053 | Paginação | Select "10 por página" | ação | OK | `Shared:403-406`; padrão 8 `Overview:53` | — | (mock mostra 8 linhas com "10 por página" — incoerência do próprio mock) |
| T01-054 | Rail · hero | "Talk X" + "Campanhas que geram conversas e resultados." | visual | OK | `Overview:289-291`; `Shared:701-713` | — | — |
| T01-055 | Rail · hero | Ilustração (3 tiles flutuantes: WhatsApp, upload, gráfico + estrelas) | visual | AUSENTE | `HeroCard` `Shared:701-726` não tem ilustração; `talkxFloat` (`src/components/ui/motion/variants.ts:74`) sem import | — | front: tiles + motion (V46/V49) |
| T01-056 | Rail · hero | "+32% mais engajamento" | dado | AUSENTE | código mostra "Mensagens enviadas" real `Overview:293` | **SEM FONTE** (V3 Apêndice B: "não implementar") | decisão: manter métricas reais |
| T01-057 | Rail · hero | "-45% tempo de resposta" | dado | AUSENTE | código mostra "Taxa de sucesso" `Overview:294` | **SEM FONTE** | idem |
| T01-058 | Rail · hero | "+28% conversões" | dado | AUSENTE | código mostra "Segmentos salvos" `Overview:295` | **SEM FONTE** (`talkx_conversions` com 0 linhas e sem base de comparação) | idem |
| T01-059 | Rail · ações | Título "Ações rápidas" | visual | OK | `Overview:298` | — | — |
| T01-060 | Rail · ações | "Nova campanha / Criar campanha do zero" | ação | OK | `Overview:300` (subtítulo "Criar do zero") | — | — |
| T01-061 | Rail · ações | "Usar template / Escolher da biblioteca" | nav | OK | `Overview:301`; `View:293` | — | — |
| T01-062 | Rail · ações | "Criar segmento / Definir público-alvo" | ação | PARCIAL | `Overview:302`; `View:293` (só troca de aba, não abre o builder) | — | front: abrir criação direto |
| T01-063 | Rail · ações | "Importar contatos / Adicionar novos contatos" | ação | AUSENTE | grep `Importar` em `src/components/talkx/*.tsx` = 0 | SEM FONTE (não há fluxo de importação; tela 15) | front+edge+banco: V86–V87 |
| T01-064 | Rail · recentes | "Últimas campanhas" + "Ver todas" | nav | PARCIAL | `Overview:305` ("Ver todas" só chama `clear`) | — | front: destino real |
| T01-065 | Rail · recentes | 4 itens: miniatura + nome + "● Em andamento • 68%" / "● Concluída • 96,1%" / "● Pausada • 42%" | dado | PARCIAL | `Overview:110,306-311`; `Shared:730-755` | `talkx_campaigns` (status, contadores) | front: sem miniatura (`thumb` nunca passado); % é sempre progresso (mock usa taxa de entrega nas concluídas); dot de `info`/`violet`/`danger` cai em cinza (`Shared:747`) |
| T01-066 | Rail · recentes | "⋯" por item | ação | AUSENTE | `RecentList` `Shared:730-755` sem menu | — | front: menu de ações |
| T01-067 | Rail · dica | "Dica do dia" + "Campanhas segmentadas por ramo têm 3x mais chances de conversão." | visual | PARCIAL | `Overview:313`; `Shared:757-769` (texto fixo, sem número — retirado de propósito pelo V08) | "3x" **SEM FONTE** | front: dicas rotativas sem número (V46) |
| T01-068 | Rail · dica | Chevron "›" no card (pouco legível no mock) | ação | AUSENTE | `TipCard` `Shared:757-769` sem ação | — | front: próxima dica / link ajuda |

### Comportamentos implícitos

- **Permissão:** só `admin`/`supervisor` (`navigation.service.ts:71`). Fora disso `ViewRouter.tsx:135` mostra `RestrictedView` genérica
  (`:236-256`), não o estado do mock 17. Dentro do módulo não há distinção de papel (qualquer staff vê todas as campanhas que a RLS liberar).
- **Erro de carga:** `useTalkX` não expõe `isError/error` (`:388-407`). Se a query falhar, `campaigns=[]` e a tela mostra
  "Crie sua primeira campanha Talk X" (`Overview:200-203`) — erro vira "vazio". Sem botão de recarregar (`refetchCampaigns` só é usado em `TalkXCampaignRunning.tsx:630`).
- **Loading:** skeleton de KPIs e de linhas existem (`Overview:118-119,198-199`); o rail não tem skeleton.
- **Vazio:** dois vazios (sem campanhas `:202`; filtro sem resultado `:205`, este sem botão "Limpar").
- **Realtime:** UPDATE/INSERT ok (`useTalkX:148-181`); **DELETE não é ouvido** (exclusão em outra sessão só some no próximo refetch). Indicador "Ao vivo" (`View:245-250`) não está no mock.
- **Volume:** tudo em memória, sem paginação no servidor nem virtualização (`useTalkX:136-139`).
- **Conteúdo fora do mock:** "Rascunhos pendentes" (`Overview:139-171`) e "Insights" (`:174-194`). O hook de insights tem regra morta:
  filtra `status='finished'` (`src/hooks/integrations/useTalkXInsights.ts:85`), valor que não existe; `apply` nunca é preenchido.
- **Filtros:** persistem em `sessionStorage` (`Overview:19-22,58-60`), exceto busca, página e layout. Sem filtro de período.
- **Teclado/a11y:** `Alt+N` abre o módulo (`useNavShortcuts.ts:12`); sem `aria-sort`; `role=status` só no "Carregando campanha…" (`View:197`).
- **Responsivo:** grid `xl:grid-cols-[1fr_320px]` (`Overview:115`) — abaixo de 1280 o rail vai para baixo, sem accordion; tabela com `min-w-[980px]` e scroll horizontal (`:212`).
- **Formato numérico:** taxa de sucesso usa ponto decimal (`Overview:125`), o resto usa `pt-BR`.

### Etapas do V3 que cobrem esta tela

- **V41** (KPIs por RPC): não cobre o bug `running` da RPC, o `completed` do período anterior, nem a vírgula decimal; não define o período padrão (`p_from/p_to`) da tela.
- **V42** (tabela): cobre thumb, entregues, ordenação, massa, canal fixo. Não cobre "Hoje/Ontem" na data, progresso "-"/barra vazia por status, logo WhatsApp, nem o rótulo "Todos" dos selects.
- **V43** (ações de linha): cobre presets, duplicar persistente, optimistic. Não cobre evento de pausar/cancelar a partir da lista nem o DELETE no realtime.
- **V44** (grade): cobre.
- **V45** (abas/deep link): cobre chevrons e breadcrumb. Não cobre o rótulo "Ajuda" do botão.
- **V46** (rail): cobre 4ª ação, 5 recentes, dicas, tiles. Não cobre miniatura e "⋯" dos recentes, destino do "Ver todas", % de entrega nas concluídas, nem a decisão sobre os 3 números do hero (só o Apêndice B diz "não implementar").
- **V47** (FilterBar/⌘K): cobre ⌘K que navega e rótulo `sending`. Não cobre as **duas paletas no mesmo atalho** nem o fato de os itens só existirem após abrir o módulo.
- **V48/V49**: kit e motion; sem lacuna específica desta tela.
- **V50**: estados aplicados + prints. Não cobre expor `isError` em `useTalkX` (pré-requisito).
- **Nenhuma etapa** cobre o cabeçalho global do mock (busca no topo, 6 ícones, Online, sino, avatar) nem a sidebar do mock (Campanhas na nav primária, Leads/Clientes/Oportunidades).

### Riscos e dependências

- Banco tem **0 campanhas**: KPIs, tabela, recentes e deltas não são verificáveis com dado real; QA visual exige fixture.
- `talkx_overview_stats` (arquivo `20260916180000`) precisa de migration antes do V41 (`running`, distinct, `completed` anterior).
- Miniaturas dependem de mídia (bucket `talkx-media` inexistente, V27).
- "Importar contatos" depende da tela 15 (V86–V87); 3 números do hero e "3x" não têm fonte.
- `Shared` (988 linhas) é ponto de colisão entre V42/V43/V46/V47/V48/V50/V92.
- Cabeçalho global é mudança de shell (afeta todos os módulos) — fora do escopo do Talk X; precisa de decisão.
- Duas paletas de comando concorrentes no ⌘K afetam qualquer trabalho do V47.

---

## Tela 17 — Estados do sistema e modais

### Componente(s) atuais

- **Estados (kit):** `Shared:429-485` — `StateShell:429`, `TalkXEmptyState:441`, `TalkXErrorState:449`, `TalkXDataUnavailableState:457`,
  `TalkXWhatsAppDisconnectedState:461`, `TalkXNoPermissionState:469`, `TalkXSkeletonRows:473`, `KpiCardSkeleton:552`.
- **Modal (kit):** `TalkXConfirmDialog` `Shared:788-857` (sem presets). Usado só em `Overview:317-345` (excluir, cancelar, iniciar) e `TalkXSegments.tsx:181`.
- **Modais fora do kit:** 11 `<AlertDialog>` diretos — `TalkXLiveMonitor.tsx:224,228,232`; `TalkXCampaignRunning.tsx:727,783,799`;
  `TalkXCampaignScheduled.tsx:348,365`; `TalkXSuppression.tsx:173(vazio),246`; `TalkXTemplates.tsx:167`. Mais 1 `<Dialog>` de disparo
  (`TalkXWizardDelivery.tsx:257-281`) e 5 `window.confirm` (`TalkXTemplateEditor.tsx:111,168,253,459,509`).
- **A prancha em si** (página de referência) não existe no app: sem `TalkXKit`/`__dev__` (`ls src/components/talkx/__dev__` → inexistente), sem `?talkxState=`, sem `docs/talkx/ESTADOS.md`.

**Uso real de cada estado por tela do módulo** (grep em `src/components/talkx`):

| Estado | Overview | Segmentos | Templates | Supressão | Analytics | Wizard | Agendada | Monitor | Em andamento |
|---|---|---|---|---|---|---|---|---|---|
| Vazio | sim `:202,205` | sim `:109-110` | sim `:126-127,135-136` | sim `:147-148` | sim `:198` | não | não | não | ad hoc `:282` |
| Skeleton | sim `:119,199` | sim `:84,108` | sim `:125,134` | sim `:146` | não | não | não | não | não |
| Erro | não | não (`isError` desestruturado e ignorado `:27`) | não | não | não | só autosave `:162` | não | não | ad hoc `:277-281` |
| CRM 360 indisponível | não | não | não | não | não | não (badge fixo `:255`) | não | não | não |
| WhatsApp desconectado | não | — | — | — | — | texto ad hoc `:248` | não | rótulo de status `:52` | não |
| Sem permissão | não (shell: `ViewRouter.tsx:236`) | não | não | não | não | não | não | não | não |

### Inventário

| ID | Região | Elemento do mock (texto literal do mock) | Tipo | Hoje | Evidência | Fonte do dado | Falta |
|---|---|---|---|---|---|---|---|
| T17-001 | Moldura | Breadcrumb "TalkX › Campanhas › Estados do Sistema e Modais" | nav | AUSENTE | grep `breadcrumb` em `talkx/*.tsx` → só Wizard `:102` e Agendada `:165`; nenhum nas abas | — | front: breadcrumb do módulo (V45) |
| T17-002 | Moldura | Topo direito: 2 sinos (um com badge) + "Admin 01 ●" | visual | AUSENTE | sem cabeçalho global (`AppShell.tsx:119-153`) | SEM FONTE (sem central de notificações) | shell — fora do Talk X |
| T17-003 | Moldura | Cabeçalho "Campanhas - Talk X" (tile WhatsApp) + "Estados do sistema e modais • Referência para implementação e QA" | visual | AUSENTE | página de referência não existe (sem `TalkXKit`) | — | front: `TalkXKit` DEV (V48/V92) |
| T17-004 | Moldura | Chip de data "Hoje / Sex, 06 de set de 2026" | ação | AUSENTE | grep `Calendar` e `date` em `Overview` → nenhum filtro de período | `talkx_campaigns.created_at` | front: date range (V47) |
| T17-005 | Moldura | Select "Todas as segmentações" | ação | PARCIAL | `Overview:77,85` (rótulo "Todos") | `segment_id` | ver T01-033 |
| T17-006 | Moldura | Select "Todos os status" | ação | PARCIAL | `Overview:75,83` (rótulo "Todos") | `status` | ver T01-031 |
| T17-007 | Moldura | Botão atualizar (⟳) | ação | AUSENTE | `refetchCampaigns` (`useTalkX:406`) só usado em `TalkXCampaignRunning.tsx:630` | — | front: botão na listagem |
| T17-008 | Moldura | Card "● Em andamento ▾ / Talk X / Iniciada às 14:28" | dado | AUSENTE | grep `Iniciada às` em `talkx/` = 0; só há "Ao vivo" (`View:245-250`, estado do canal, não da campanha) | `talkx_campaigns.status='sending'`, `started_at` | front: indicador de campanha ativa |
| T17-009 | Moldura | Abas "Visão Geral", "Campanhas" (ativa), "Segmentos", "Templates", "Supressão", "Analytics" | nav | PARCIAL | `View:266-272` (5 abas: sem aba "Campanhas" separada; "Lista de supressão") | — | mock 17 (6 abas) contradiz mock 01 (5 abas) — decidir |
| T17-010 | Moldura | Sidebar da prancha (grupos VENDAS & CRM, AUTOMAÇÃO & IA, ANALYTICS, CONEXÕES, SISTEMA; "Controles rápidos"; "Admin 01 / Online") | nav | PARCIAL | `navigation.service.ts:57-116`; `Sidebar.tsx:202-231` (bate com o código, salvo "Campanhas" na nav primária) | — | shell |
| T17-011 | Moldura | Títulos "Estados do Sistema / Principais estados da interface da listagem de campanhas" e "Modais Críticos / Principais modais de ação utilizados no módulo de campanhas" | visual | AUSENTE | sem `TalkXKit` | — | front: prancha DEV |
| T17-012 | Moldura | Rodapé "Estes estados e modais seguem o padrão visual do ZAPP…" + "ZAPP Talk X • Campanhas • Estados do Sistema e Modais" + "v1.0.0" | visual | AUSENTE | idem | — | idem |
| T17-013 | Estado vazio | Ícone + "Nenhuma campanha encontrada" | estado | PARCIAL | componente `Shared:441-447`; uso `Overview:202` com título "Crie sua primeira campanha Talk X" (o texto do mock aparece no vazio **filtrado** `:205`) | `talkx_campaigns` (0 linhas) | front: título/ícone do mock |
| T17-014 | Estado vazio | "Crie sua primeira campanha no Talk X e comece a se conectar com seus clientes." | estado | PARCIAL | `Overview:202` (descrição diferente, fala de variáveis) | — | front: texto |
| T17-015 | Estado vazio | Botão "+ Nova Campanha" | ação | PARCIAL | `Overview:202` ("Criar campanha") → `onNew` | — | front: rótulo |
| T17-016 | Skeleton | "Carregando (Skeleton)": 4 linhas (quadrado + 2 barras + ⋮) | estado | PARCIAL | `Shared:473-485` (pill no lugar do ⋮); usos na tabela acima | — | front: aplicar em Analytics, Monitor, Em andamento, Agendada e rail; `aria-busy` |
| T17-017 | Erro | Triângulo vermelho + "Não foi possível carregar as campanhas" | estado | PARCIAL | componente `Shared:449-455` (título fixo "Não foi possível carregar", sem prop); **0 usos** (grep `TalkXErrorState` fora do Shared = 0) | `useTalkX` não expõe erro (`:388-407`) | front: expor `isError/error/refetch` e usar em todas as telas; título por entidade |
| T17-018 | Erro | "Ocorreu um erro inesperado. Tente novamente em alguns instantes." | estado | PARCIAL | texto idêntico `Shared:451`; sem uso | — | idem |
| T17-019 | Erro | Botão "⟳ Tentar novamente" | ação | PARCIAL | `Shared:452` (`onRetry`); sem uso | — | idem |
| T17-020 | Erro | Botão "Ver detalhes" | ação | AUSENTE | grep `Ver detalhes` → só menu de segmento `TalkXSegments.tsx:146` | mensagem do erro da query | front: prop + detalhe do erro |
| T17-021 | CRM 360 | Ícone banco + alerta + "CRM 360 indisponível" | estado | PARCIAL | componente genérico `Shared:457-459` ("Dados indisponíveis"); único uso é no Catálogo (`src/components/catalog/ExternalProductCatalog.tsx:313`); 0 usos no Talk X | **SEM FONTE**: o módulo não consulta disponibilidade do CRM (`crm_contact_links` com 0 linhas; opção CRM 360° desabilitada com badge fixo `TalkXCampaignWizard.tsx:255`) | front: título/ícone; edge/banco: sinal de saúde do `external-db-proxy` (V88–V89) |
| T17-022 | CRM 360 | "Os dados de contatos e segmentações estão temporariamente indisponíveis." | estado | PARCIAL | `Shared:458` (`${what} estão temporariamente indisponíveis.`) | — | passar `what` certo |
| T17-023 | CRM 360 | Botão "Ver status dos serviços" | nav | AUSENTE | grep `status dos servi` em `src` = 0 | SEM FONTE (não há página de status) | front: ação + destino |
| T17-024 | WhatsApp | Ícone WhatsApp vermelho + "Conexão WhatsApp desconectada" | estado | PARCIAL | componente `Shared:461-467` (texto idêntico; ícone `MessageSquare`); **0 usos**. Hoje: texto âmbar no wizard `TalkXCampaignWizard.tsx:248`, linha da revisão `TalkXWizardDelivery.tsx:214`, banner global `src/components/alerts/EvolutionDisconnectBanner.tsx` | `whatsapp_connections.status` (`useCampaignEditor.ts:260-270`; `useTalkXConnectionStatus.ts:17-38`) | front: aplicar na Visão geral/wizard quando não há conexão `connected` |
| T17-025 | WhatsApp | "Conecte sua conta para criar e enviar campanhas pelo Talk X." | estado | PARCIAL | `Shared:463` (idêntico); sem uso | — | idem |
| T17-026 | WhatsApp | Botão "Conectar WhatsApp" | nav | PARCIAL | `Shared:464` (`onConnect`); sem uso | view `connections` (`navigation.service.ts:100`) | front: ligar ao `navigateToView('connections')` |
| T17-027 | Sem permissão | Cadeado + "Você não tem permissão para acessar Campanhas" | estado | PARCIAL | componente `Shared:469-471` (idêntico); **0 usos**. O que aparece é `RestrictedView` "Acesso restrito" (`ViewRouter.tsx:236-256`) | `user_roles` via `useUserRole` | front: usar o estado do módulo (ou aceitar o do shell) |
| T17-028 | Sem permissão | "Solicite acesso ao seu administrador para utilizar este módulo." | estado | PARCIAL | `Shared:470` (idêntico); sem uso. Shell diz "Seu perfil não tem permissão para acessar esta área." | — | idem |
| T17-029 | Sem permissão | Botão "Falar com o administrador" | ação | AUSENTE | grep `Falar com o administrador` em `src` = 0 (shell tem "Voltar ao Chat") | SEM FONTE (sem contato do admin; `talkx_settings.support_phone` não existe) | front: ação + destino |
| T17-030 | Modal Excluir | Barra de título "Excluir Campanha" + "✕" | visual | PARCIAL | `Shared:810-821` (AlertDialog centralizado, sem barra/✕) | — | front: layout do mock |
| T17-031 | Modal Excluir | Tile vermelho lixeira + "Excluir campanha" | visual | OK | `Overview:321-322` | — | — |
| T17-032 | Modal Excluir | "Tem certeza que deseja excluir a campanha “Promoção Setembro”?" | visual | PARCIAL | `Shared:817` renderiza `"<nome>" — <descrição>`; `Overview:323-324` | `talkx_campaigns.name` | front: frase do mock |
| T17-033 | Modal Excluir | "Esta ação não pode ser desfeita." | visual | OK | `Overview:323` | — | — |
| T17-034 | Modal Excluir | Botões "Cancelar" / "Excluir" (vermelho) | ação | PARCIAL | `Overview:320,325` (rótulo "Excluir campanha"); `useTalkX:291-300` | `delete talkx_campaigns` — trigger só permite rascunho (`supabase/migrations/20260930420000…:74-76`) | front: rótulo; `onError`; sem loading. banco: decidir exclusão de `cancelled/completed` (V43). Excluir template usa `AlertDialog` cru (`TalkXTemplates.tsx:167`) e variante usa `window.confirm` |
| T17-035 | Modal Duplicar | Barra "Duplicar Campanha" + "✕"; tile azul copiar + "Duplicar campanha" | visual | AUSENTE | grep `Duplicar campanha` em `talkx/` = 0; "Duplicar" age direto (`Overview:269`) | — | front: preset de confirmação |
| T17-036 | Modal Duplicar | "Deseja criar uma cópia da campanha “Lançamento Produto X”?" + "Uma nova campanha será criada com todas as configurações desta." | visual | AUSENTE | idem | — | idem |
| T17-037 | Modal Duplicar | Botões "Cancelar" / "Duplicar" (azul) | ação | PARCIAL | ação sem modal: `View:135-141`; `talkxCampaignDraft.ts:7-26` (`id:''`, abre o wizard; nada é gravado até o autosave; destinatários zerados) | RPCs `save_talkx_campaign_draft` + `replace_talkx_draft_recipients` (existem, `useTalkX:240-265,331-351`) | front: persistir a cópia na confirmação |
| T17-038 | Modal Remover supressão | Barra "Remover da Supressão" + "✕"; tile violeta + "Remover da supressão" | visual | PARCIAL | `TalkXSuppression.tsx:246-251` (AlertDialog cru, sem ícone; título "Remover da lista de supressão?") | — | front: preset; tom violeta — `toneStyle` do kit é calculado e nunca aplicado (`Shared:797,847`) |
| T17-039 | Modal Remover supressão | "Deseja remover este contato da lista de supressão?" | visual | PARCIAL | `TalkXSuppression.tsx:248` (só o título em forma de pergunta) | — | front: texto |
| T17-040 | Modal Remover supressão | "O contato poderá receber mensagens nas próximas campanhas." | visual | OK | `TalkXSuppression.tsx:248` ("<nome> poderá receber mensagens do Talk X nas próximas campanhas.") | `talkx_blacklist` → `contacts.name` | — |
| T17-041 | Modal Remover supressão | Botões "Cancelar" / "Remover" (violeta) | ação | PARCIAL | `TalkXSuppression.tsx:249` (rótulos iguais; cor padrão; sem loading) | `talkx_blacklist.removed_at/removed_by` | front: preset + tom |
| T17-042 | Modal Cancelar | Barra "Cancelar Campanha" + "✕"; tile vermelho stop + "Cancelar campanha" | visual | PARCIAL | kit: `Overview:327-332` (sem barra/✕). Outras 2 versões cruas: `TalkXLiveMonitor.tsx:228-231`, `TalkXCampaignRunning.tsx:799-812` | — | front: um preset para os 3 lugares |
| T17-043 | Modal Cancelar | "Tem certeza que deseja cancelar a campanha “Black Friday 2026”?" | visual | PARCIAL | `Shared:817`; `Overview:333-334`. Monitor e Em andamento não citam o nome | `talkx_campaigns.name` | front: frase do mock |
| T17-044 | Modal Cancelar | "O envio será interrompido imediatamente e os contatos pendentes não receberão as mensagens." | visual | PARCIAL | idêntico em `Overview:333`; diferente em `TalkXLiveMonitor.tsx:229` e `TalkXCampaignRunning.tsx:804` ("Esta ação é irreversível…") | — | front: unificar |
| T17-045 | Modal Cancelar | Botões "Voltar" / "Cancelar" (vermelho) | ação | PARCIAL | `Overview:335` ("Cancelar campanha"); Monitor `:230` ("Cancelar campanha"); Em andamento `:809` ("Confirmar cancelamento") | edge `talkx-send` `action:'cancel'` (`useTalkX:379-386`) | front: rótulo único; pela lista não grava evento (`View:291`) enquanto o Monitor grava (`TalkXLiveMonitor.tsx:230`). "Cancelar agendamento" (`TalkXCampaignScheduled.tsx:348-363`) é outro fluxo (volta a rascunho) |
| T17-046 | Modal Confirmar disparo | Barra "Confirmar Disparo" + "✕"; tile verde avião + "Confirmar disparo" | visual | PARCIAL | `TalkXWizardDelivery.tsx:257-261` (`Dialog` próprio, círculo azul, "Confirmar disparo?") | — | front: preset do kit, tom verde |
| T17-047 | Modal Confirmar disparo | "Deseja iniciar o envio da campanha “Boas-vindas - Novos Leads”?" | visual | PARCIAL | `TalkXWizardDelivery.tsx:262-264` (texto diferente; nome vai na lista de detalhes) | `ed.name` | front: frase |
| T17-048 | Modal Confirmar disparo | Linha "Segmento — Novos Leads" | dado | PARCIAL | `TalkXWizardDelivery.tsx:267` (rótulo "Público") | `talkx_segments.name` | front: rótulo |
| T17-049 | Modal Confirmar disparo | Linha "Destinatários — 1.250 contatos" | dado | OK | `TalkXWizardDelivery.tsx:267` (`ed.eligibleCount`) | estimativa de audiência do editor | — |
| T17-050 | Modal Confirmar disparo | Linha "Mensagens — 2 variações" | dado | AUSENTE | grep `variaç` em `TalkXWizardDelivery.tsx` = 0 | `talkx_template_variants` por `template_id` | front: contar variantes do template escolhido |
| T17-051 | Modal Confirmar disparo | Linha "Envio — Imediato" | dado | OK | `TalkXWizardDelivery.tsx:267` | `ed.isScheduled/scheduledAt` | — |
| T17-052 | Modal Confirmar disparo | Botões "Cancelar" / "Confirmar envio" (verde) | ação | PARCIAL | `TalkXWizardDelivery.tsx:277-278` ("Confirmar lançamento"/"Confirmar agendamento", azul) | `handleSave('launch' ou 'schedule')` → edge `talkx-send` | front: rótulo/tom. Há mais 2 confirmações de início com textos próprios: `Overview:337-345` ("Iniciar campanha?"/"Iniciar envio", sem detalhes) e `TalkXCampaignScheduled.tsx:365-381` ("Confirmar e iniciar") |

### Comportamentos implícitos

- **Bloqueio por checks:** corrigido desde a auditoria — `Shared:848` passa `disabled={!allChecked || loading}` e `TalkXPrimaryButton` honra (`:612`). Porém **nenhum chamador passa `checks`** (grep `checks=` em `talkx/` = 0) e não há teste do kit (grep em `*.test.*` = 0).
- **Loading no botão:** kit aceita `loading` (`Shared:793`), ninguém passa; modais fecham antes de a ação terminar (`Overview:320,330,340`).
- **Erro da ação:** excluir não tem `onError` (`useTalkX:291-300`); cancelar/pausar pela lista tratam com toast (`View:290-291`).
- **Foco/teclado:** foco e `Esc` vêm do Radix; sem foco inicial definido, sem `Enter` para confirmar, sem retorno de foco testado.
- **a11y dos estados:** `StateShell` sem `role=status`/`aria-live` (`Shared:429-439`).
- **Modais que o mock não desenha e existem:** pausar (2 versões: `TalkXLiveMonitor.tsx:224`, `TalkXCampaignRunning.tsx:783`), retomar (`TalkXLiveMonitor.tsx:232`), editar limites (`TalkXCampaignRunning.tsx:727`), excluir segmento (`TalkXSegments.tsx:181`), excluir template, cancelar agendamento. Pausar/retomar pela lista não têm confirmação.
- **Permissão por ação:** nenhum modal checa papel; a barreira é só a rota (staff) + RLS/trigger.
- **Estados forçáveis para QA:** não há `?talkxState=`.

### Etapas do V3 que cobrem esta tela

- **V08** (feito): bloqueio real dos checks — conferido no código.
- **V43**: 7 presets (`excluir, duplicar, removerSupressao, cancelar, confirmarDisparo, pausar, retomar`) e duplicar persistente. Não cobre: barra de título + "✕" do mock, aplicação do tom violeta/verde (`toneStyle` morto), linha "Mensagens — N variações".
- **V50**: aplicar os 4 estados nunca usados + "Ver detalhes". Não cobre: expor `isError` em `useTalkX`; botões "Ver status dos serviços" e "Falar com o administrador" (sem destino definido); de onde vem o sinal "CRM 360 indisponível"; conflito com a `RestrictedView` do shell (o módulo nem monta para quem não é staff).
- **V92**: trocar os 11 `<AlertDialog>` por presets, `ESTADOS.md`, `?talkxState=`, prancha no `TalkXKit`. Não cobre: o `<Dialog>` de disparo do wizard nem os 5 `window.confirm` do editor de templates (o aceite só conta `<AlertDialog`); textos literais do mock; skeleton nas telas que não têm.
- **V48**: `TalkXKit` (a própria prancha). **V88–V89**: CRM 360 (pré-requisito do estado T17-021).
- **Nenhuma etapa** cobre os elementos de moldura da prancha (chip de data → só V47 de forma genérica; botão atualizar; card "Em andamento ▾"; aba "Campanhas" separada).

### Riscos e dependências

- 4 dos 6 estados dependem de sinal que o módulo não tem hoje: erro (hook não expõe), CRM (sem verificação), WhatsApp (só no wizard), permissão (resolvida no shell antes de montar o módulo).
- "Ver status dos serviços" e "Falar com o administrador" não têm destino no produto — precisam de decisão antes de virar botão.
- Excluir campanha fora de rascunho é barrado por trigger no banco; o modal do mock não distingue status.
- Três textos diferentes para "cancelar" e três para "iniciar" em produção; unificar toca `Overview`, `LiveMonitor`, `Running`, `Scheduled`, `WizardDelivery` e `Shared` ao mesmo tempo (colisão com V42/V43/V50).
- Mock 17 mostra 6 abas e mock 01 mostra 5 — referência contraditória.
- Sem campanhas no banco, os modais de cancelar/disparo não foram exercitados em produção.
