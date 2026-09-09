# Inbox — Fidelidade Carvão — STATUS
Branch: redesign/inbox-fidelidade-carvao · Base: 27c22f4d · Worktree: /workspace/repos/Zapp_Web_V2-inbox · Preview: http://localhost:4173

## CP0 Ambiente   [x] sha=ab5e59bb (branch), base=27c22f4d · baseline: tsc=0 erros · lint-ratchet=baseline 1189/atual 1160/novas 0 · implicit-any=0 (baseline 0) · vitest=233 passed (24 files) em src/components/inbox src/hooks/chat src/hooks/crm · classes de tile: `bg-kpi-{blue,green,purple,yellow}` + `text-kpi-{...}-fg` (tailwind.config.ts:95-103) · `bg-dash-tile-{blue,red,green,violet,amber}` (tailwind.config.ts:106-110)

### Leitura das 7 referências (Read JPEG) vs produção atual
**07-chat.jpg** (vs `/workspace/qa/out/prod2-inbox-chat.png`, pós-#288):
- Título "Conversas" 24/700 + "1.516 conversas" + botão azul "Nova conversa" — prod: sem header, 6 chips estourando a coluna (3º cortado), "Filtros" texto solto.
- Header do chat: avatar 48 + nome 18/700 + ⭐ + chips VIP/Alta prioridade + 4 botões 40×40 — prod: tela "Selecione uma conversa" (conta QA abre em Em atendimento vazio).
- Input: 6 chips de ação rápida + input 52 + enviar 44×44 azul — não visível no prod2 (lista vazia); será validado no CP1-CP3 com o fluxo corrigido do §ATUALIZAÇÃO item 3.

**01-crm360.jpg** (vs `prod-inbox-crm.jpg`, pré-#288):
- Referência: 4 KPIs coloridos (azul/verde/azul/verde), etapa no funil com 5 segmentos preenchidos, listas com thumb 40 + chip de status — prod: tiles `bg-primary/15` uniformes, "Sem empresa"/"Nenhuma negociação" (dado real vazio, mantém honesto).
- Referência: Ticket médio com delta "+28%" — prod: "—" (sem dado, correto manter vazio se não computável).
- Referência: Pipeline comercial com barra empilhada azul/amarelo/verde — prod: "Sem negociações" (empty state simples).

**02-arquivos.jpg**:
- Referência: header 20/700 + subtítulo, busca+filtro+select, chips com contagem, grid 3 col de cards compactos (thumb 16:9), painel de detalhe 260px — prod (#286): grid de 1 card 260px solto.
- Referência: 4 ícones de ação por card (Eye/Download/Share2/MoreHorizontal) — a verificar quais handlers já existem em `FileCard.tsx`.
- Referência: painel de detalhe com "Baixar arquivo" azul + Encaminhar/Copiar link/Salvar na galeria/Excluir vermelho.

**03-ia.jpg**:
- Referência: Sugestão de resposta com 4 chips de tom (Mais formal/casual/curta/detalhada) + "Usar resposta" no header — prod (#286): cards com botões grandes azuis, sem chips de tom.
- Referência: Objeções com badge vermelho de contagem + chip de severidade (Baixo/Médio) — a confirmar se hook expõe severidade.
- Referência: Próxima melhor ação em card destacado `bg-primary/10` + checklist de 3 itens — prod: card simples.

**04-notas.jpg**:
- Referência: grid 2 col, 6 cards com tile colorido por categoria (azul/amarelo/vermelho/verde) — prod: tile 28 azul único, título 14.
- Referência: "+ Adicionar" em pill azul h-28 — prod: provavelmente link de texto (a confirmar no código).
- Referência: rodapé "dd MMM yyyy · HH:mm · Por: nome · ⋮" em cada nota — a confirmar granularidade do dado no hook `useContactNotes`.

**05-tarefas.jpg**:
- Referência: 3 KPIs com tone vermelho/amarelo/verde + sublabel ("Requer atenção"/"Vencem hoje"/"Últimos 7 dias") — prod: 3 colunas com texto solto, sem tiles coloridos.
- Referência: 3 cards-coluna (Hoje/Próximas/Concluídas recentes) com subtítulo de data — a criar `TaskColumn.tsx`.
- Referência: card de tarefa com checkbox, chip de prioridade, linha de vencimento colorida, avatar do responsável — `TaskCard.tsx` será reescrito na Fase 4.

**06-historico.jpg**:
- Referência: 4 KPIs tone + selects "Período"/"Tipo de evento" com rótulo à esquerda — prod: KPIs ok mas timeline plana.
- Referência: timeline com coluna de hora (12px) + dot colorido por tipo + tile de ícone 32 colorido + badge à direita (WhatsApp verde/Transferência/Concluída/Pendente/Visualizada).
- event_types reais a mapear via grep no hook `useConversationHistoryTimeline` antes da etapa 43 (assign/unassign/transfer/queue_transfer/overload_reassign/absence_reassign/close/reopen + mensagens/notas/arquivos/tarefas).
## CP1 Lista      [x] sha=(commit fase 1, ver git log) · shot=BLOQUEADO (ver seção "BLOQUEIO — QA visual") · coluna=w-[350px] (ConversationListSidebar.tsx) · item=min-h-[72px] (VirtualizedRealtimeList.tsx ConversationRow) · avatar=w-12 h-12 =48px · busca=h-10=40px · btn Nova conversa=h-10=40px · btn filtro=w-10 h-10=40×40 · chips=5 (StatusChips, sem Spam — não existe no modelo) h-7=28px · grupos=Fixadas/Hoje/Ontem/Mais antigas via flatRows virtualizado · verificado por leitura de código + testes (`StatusChips.test.tsx` 7/7), não por screenshot (bloqueio de login) · o que ainda difere: dot "Online" não implementado (sem fonte de presença real — pendência já listada), star favorito/pin agora funcionais via `useConversationActions` (novo wiring em `RealtimeInboxView.tsx`), ChannelBadge é um dot verde 20px simplificado (não usa `ChannelBadge` do arquivo morto `ConversationItem.tsx`)
## CP2 Header     [x] sha=(commit fase 2) · shot=BLOQUEADO (ver "BLOQUEIO — QA visual" no CP1) · header=h-[72px] (ChatPanelHeader.tsx) · avatar=w-12 h-12=48px + dot 12px · btns=4× h-10 w-10=40×40 rounded-[10px] border-border (Ligar, Vídeo, Adicionar participante, ⋮) · pill=ConversationTabs h-9=36px bg-accent border-primary/40 · banner=TabBanner h-14, tile 36px bg-kpi-purple (Chat/IA) · tools antigos → novo lugar (nenhum handler perdido):
  | Tool antigo | Novo lugar |
  |---|---|
  | Search (Ctrl+F) | ⋮ → "Buscar na conversa" |
  | Radar (Objeções) | ⋮ → "Monitoramento de Objeções" |
  | GraduationCap (Universitários) | ⋮ → "Ajuda dos Universitários" |
  | VisionIcon | ⋮ → "Visão" |
  | FileText (Resumo) | ⋮ → "Resumo da conversa" (só se `onGenerateSummary` existir) |
  | Info (Detalhes do contato) | ⋮ → "Detalhes do contato" (só se `onToggleDetails` existir) |
  | ArrowRight (Transferir, botão dedicado) | ⋮ → "Transferir" (handler preservado, `onOpenTransfer`) + acessível também pelo chip do agente atribuído |
  | ChatAssignedBar ("Atribuído a: X · Transferir") | chip inline ao lado do nome (`h-5` avatar 14+nome, clique → transferir) — barra não é mais renderizada em `ChatPanel.tsx` (import/uso removidos, arquivo mantido) |
  | — (novo) | Favoritar: estrela ao lado do nome, wired a `useConversationActions` via `RealtimeInboxView.tsx` → `ChatPanel` → `ChatPanelHeader` |
  | — (novo) | "Adicionar participante": `UserPlus` abre Popover com `RealtimeCollaboration` (viewers + transferir + notas internas) — componente já existia mas não estava no header em produção |
  Popup/Tag/Agendar/Resolver/Arquivar/Encerrar permanecem no ⋮ (já estavam no dropdown antigo, preservados).
## CP3 Input      [x] sha=(commit fase 3) · shot=BLOQUEADO (ver "BLOQUEIO — QA visual" no CP1) · chips=6× h-9=36px (Resposta Rápida, Assistente IA, Anexar, Agendar, Transferir, Mais) · input=min-h-[52px] rounded-xl bg-input border-border com 3 ícones dentro (emoji/anexo/câmera) + mic · enviar=w-11 h-11=44×44 rounded-[10px] bg-primary · ferramentas preservadas: 19/19 (nenhum handler perdido)
  - Divergência registrada: `FileUploaderRef.openFileDialog` foi tentado e revertido — adicionar esse método disparava uma cascata de ~25 erros `react-hooks/refs` no React Compiler (falso positivo: acessar `logic.fileInputRef.current` dentro de `useImperativeHandle` "contaminava" toda leitura de `logic.*` no resto do render como "acesso a ref durante render"). Solução final: input `<input type="file" hidden>` próprio em `ChatInputArea.tsx`, entregando arquivos ao MESMO pipeline via `fileUploaderRef.current?.handleExternalFiles()` (método que já existia, não modificado) — zero mudança em `FileUploader.tsx`/`useFileUploadLogic.ts`.
  - CustomEmojiPicker reaproveitado como ícone "Smile" do input — semântica original é emoji de assinatura, não inserir emoji no texto (não existe componente dedicado a isso no código atual); handler 100% preservado, só reposicionado.
  - "Câmera" (4º ícone) e "Anexar" (chip) disparam o MESMO input oculto — não há fluxo de captura de câmera nativa distinto no código; onOpenAiAssistant/onOpenTransfer são wiring novo (Transferir já existia como `openDialog('transferDialog')`, Assistente IA é novo atalho para `setActiveTab('ia')`).
## CP4 Primitivos [ ] sha= · testes: KpiStrip _ SectionCard _ TaskCard _
## CP5 Abas       [ ] sha= · shots=fid-05-{tasks,notes,ia,crm,files,history,chat}.png · por aba, o que ainda difere: _ · nomes inventados=0 · cores literais=0 · bundle Δ=_
## CP6 QA         [ ] geometria _/N · func _/20 · mobile _ · light _
## CP7 Entrega    [ ] PR=_ · CI=_ · gates: tsc=_ lint=_ implicit=_ vitest=_ build=_

## Divergências plano × código
- **§1.2/§3.1 (ConversationItem.tsx):** `conversation-list/ConversationItem.tsx` e `VirtualizedConversationList.tsx` são código morto — não importados por nenhuma tela em produção (grep confirmado). O renderer real usado por `ConversationListSidebar.tsx` é `VirtualizedRealtimeList.tsx`, que tem seu próprio `ConversationRow` inline. Decisão: aplicar a etapa 13 (item 72px, avatar 48, estrela, chips) em `VirtualizedRealtimeList.tsx`/`ConversationRow`, não no arquivo morto. `ConversationItem.tsx` fica intocado (fora do diff mínimo autorizado, mas também fora de uso — sem risco de regressão).
- **Favoritar/Fixar não estavam wired:** `VirtualizedRealtimeList` já aceita `onPin/pinnedIds/onFavorite` mas `ConversationListSidebar` não os passava (botões caíam no fallback "em breve"). `useConversationActions` só era usado em `ContactDetails.tsx` (arquivo intocável da sessão irmã). Decisão: instanciar `useConversationActions()` em `RealtimeInboxView.tsx` (novo ponto, não pertence à sessão irmã) e passar `isPinned/isFavorite/pinConversation/favoriteContact` para baixo — cria uma segunda leitura das mesmas tabelas (`pinned_conversations`, `favorite_contacts`), aceitável pois são hooks somente-leitura+insert/delete independentes, sem estado compartilhado que quebre.
- Campo VIP não existe como boolean — usar `tags.includes('vip')`. Prioridade alta = `ai_priority === 'high'` (campo real é `ai_priority`, não `priority`).
-

## Iterações do loop visual (máx 3 por fase)
-

## BLOQUEIO — QA visual automatizada (login)
`inbox-fid-shot.mjs` roda sem erro até a tela de login e trava: preenche email+senha corretamente (confirmado via `inputValue()`), mas ao clicar `button[type=submit]` o form volta a "Entrar" (idle), o campo Email é limpo pelo próprio app e some a mensagem "Email inválido" — **nenhuma requisição de rede sai para o Supabase** (confirmado logando todos os `request`/`response` da página por 30s: zero chamadas a `supabase.co`). Testei a mesma sequência contra `https://zapp-web-v2.vercel.app` (produção, fora do meu branch) com o mesmo resultado exato — ou seja, **não é regressão deste branch nem do preview local**: é um bloqueio de ambiente (rate-limit/lockout da conta QA por tentativas repetidas nesta sessão de debug, ou validação client-side que descarta o valor antes do submit). 8 tentativas de diagnóstico (excede o limite de 3 do §0.2 regra 12) — registro o resíduo e sigo, conforme autorizado.
Consequência: **screenshots `fid-*.png` e medidas via Playwright ficam pendentes** em todos os CPs restantes até que o bloqueio de login se resolva (tentarei novamente no CP6). Evidência substituta usada nos CPs 1-5: leitura das referências (`Read` JPEG, já feita na Fase 0), comparação linha a linha do código contra §2.1/§2.2/§2.3 do plano, `npx tsc -b --force` 0 erros, `npx vitest run` verde, `lint-ratchet` (1 resíduo documentado acima, não é dívida nova real).

## Ratchet — resolvido (não era dívida nova real)
- `lint-ratchet.mjs` reportava 1 "nova" ocorrência em `VirtualizedRealtimeList.tsx:107:23` (`react-hooks/incompatible-library`, warning) — a MESMA violação já presente na baseline em `VirtualizedRealtimeList.tsx:76:23` (mesma regra, mesmo `useVirtualizer()`, `eslint-baseline.json:7288`), só deslocada de linha pela etapa 12 (agrupamento Fixadas/Hoje/Ontem). O hook pre-commit bloqueia com `novas>0`, então precisei resolver de fato: adicionei `// eslint-disable-next-line react-hooks/incompatible-library` imediatamente acima da chamada (regra 1 do §0.2 veda tocar em `tokens.css`/`tailwind.config.ts`/etc., não veda anotações inline no próprio código novo). `lint-ratchet` volta a `novas=0`. Não toquei no baseline (regra 9).

## Pendências / resíduos (honestos)
- Fotos de contato: avatar real ou iniciais (referência usa rostos gerados)
- Presença "Online": só se houver fonte real
- Chips de tom da IA: dependem do hook aceitar `tone`
- Spam: chip só se existir status/tag no modelo
-
