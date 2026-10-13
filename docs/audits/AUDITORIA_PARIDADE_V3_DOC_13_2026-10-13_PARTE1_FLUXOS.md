# Paridade UI, 2ª passada, fatia U1: fluxos funcionais transversais (doc 13, seções 2, 3, 5 e 6)

> Escrito em 13/10/2026. Fonte: `~/projetos/Zapp_Web_V3/docs/estado/13-components-ui.md` (seções 2, 3, 5, 6) contra o código V3 (`~/projetos/Zapp_Web_V3/src`) e a V2 viva (`~/hermes-workspaces/Zapp_Web_V2/.integrador`, branch `dia/*`).
> Somente leitura: grep, diff, sed, sqlite do quadro (cópia) e `zapp-db-local psql` (stack `v2-integrador`, uma consulta de catálogo). Não rodei vitest, tsc, playwright nem build.
> Cartões: busquei no quadro (`kanban.db`, todos os status menos arquivado) por termos; a lista do que usei está no fim. Cartão "done" significa feito mas talvez ainda não integrado em `.integrador`.
> Fora de escopo respeitado: tags, exportar/importar, edição em massa, `/design-system`, scroll-fade, SLA de Resolução.

## 0. Resumo executivo

| Id | Classe | Sev. | Assunto | Cartão |
|---|---|---|---|---|
| U1-01 | MELHORIA | A | Ctrl+K: 4 defeitos já medidos no E2E (`test.fixme`) e nenhum cartão corretivo; paleta rica nunca abre por Ctrl+K no Windows/Linux | nenhum |
| U1-02 | MELHORIA | M | Toast: `useToast()` (56 arquivos) usa o Radix legado com limite de 1 e disputa o canto com o sonner; V3 manda tudo para o sonner | nenhum |
| U1-03 | MELHORIA | M | Preferências lidas/gravadas sem `try/catch` no provedor raiz (tema, alto contraste, atalhos da paleta, emoji) | nenhum |
| U1-04 | MELHORIA | M | Sonner sem `mobileOffset`: o aviso cobre a barra inferior e o FAB no celular | nenhum |
| U1-05 | MELHORIA | M | Cabeçalho mobile mostra o id cru ("Team-chat", "Email-chat", "Omni-inbox") em 36 telas | nenhum |
| U1-06 | MELHORIA | B | Sem tela de abertura (`#root-loading`): branco até o React montar | nenhum |
| U1-07 | MELHORIA | M | Login: bloqueio por política de rede (403) aparece como "Login temporariamente indisponível" | parcial |
| U1-08 | MELHORIA | M | Cartão `t_6a9e1f03` sugere `auth.getSession()` como sonda; isso não detecta backend fora | alterar cartão |
| U1-09 | DECISÃO/ERRO NA 1ª PASSADA | M | UI-08 pedia "Nova conversa"/"Respostas rápidas" na paleta: na V3 os dois itens eram decorativos | `t_2bf96975` (done) |
| U1-10 | MELHORIA | B | Paleta `ui/command-palette`: sem nome acessível no campo e no botão limpar, sem papéis listbox/option | nenhum |
| U1-11 | MELHORIA | B | 15 atalhos anunciados e configuráveis sem executor (V2 e V3 iguais) | `t_41cbc83a` cobre só formatação |
| U1-12 | MORTO | B | `useActionFeedback` renderiza o botão de ação como texto "[Desfazer]" | nenhum |
| U1-13 | MELHORIA | B | Estados vazios: 9 das 14 ilustrações da V2 sem uso, vários contextos sem estado vazio | parcial |
| U1-14 | JÁ-COBERTO | – | Alertas globais de falha/retentativa/automação (V3 AppShell) | `t_34eef96e` (todo) |
| U1-15 | JÁ-COBERTO | – | Indicador de conexões na barra lateral, avisos de conexão degradada | `GL1/GL2/GL3` (done) |
| U1-16 | JÁ-COBERTO | – | Estado vazio da conversa; Tema/Idioma de Configurações; manifest PWA; redirects `/login` etc. | `t_af83b921`, `t_f2adbb2c`, `t_a7125912`, `t_db8710aa` |
| U1-17 | V2-MELHOR | – | Mobile shell, atualização de versão, boundary, navegação filtrada por papel, paleta de módulos | – |
| U1-18 | EQUIVALENTE | – | Sidebar shadcn, swipe, pull-to-refresh, motion/micro-interactions, Auth | – |
| U1-19 | DECISÃO | B | Tecla global `M` (mudo) existe só na V3; a V2 limita ao player por decisão (E16) | – |
| U1-20 | MELHORIA | B | Destinos de menu da V3 sem equivalente na V2 (lista para as outras frentes) | vários |

Erros do próprio documento 13 estão na seção 6.

---

## 1. Notificações e toast

### Como a V3 monta
- `App.tsx:114-115`: monta `<Toaster />` (shadcn) e `<Sonner />` estáticos. `use-toast.ts` (hook em `@/hooks/use-toast.ts`) é só um adaptador: `useToast().toast(...)` converte `{title, description, variant}` para `sonnerToast`, `destructive` vira `sonnerToast.error`. O `Toaster` do shadcn nunca recebe toast (`toasts: []`). Resultado: **um único viewport (sonner), pilha de toasts, botão de fechar, 4 s, ação clicável**. 230 arquivos chamam `sonner` direto e 100 chamam o hook: todos caem no sonner.
- `sonner.tsx`: `bottom-right`, `closeButton`, `duration=4000`, `gap=8`; estados com fundo sólido e `*-foreground` (comentário "contraste WCAG AA ≥ 4.5:1").
- `accessible-toast.tsx`: nunca montado (órfão). `useActionFeedback` também usa sonner.

### O que a V2 faz
- `App.tsx:136,161`: `<Toaster />` (Radix legado) estático + `Sonner` lazy dentro de `DeferredProviders` (com justificativa de bundle). `AppProviders.tsx:107` monta `AccessibleToastProvider`, que **sempre renderiza um `div role=region aria-live`**, mas só `accessible-toast.tsx` e o teste dele o consomem (`useAccessibleToast`: 0 chamadores).
- `hooks/ui/use-toast.ts` é o reducer **original do shadcn**: `TOAST_LIMIT = 1` (o teste `hooks/ui/__tests__/use-toast.test.tsx:40` fixa "o novo substitui o antigo"). 56 arquivos importam o hook e 10 chamam `useToast()`; 19 chamadas usam `variant: 'destructive'`.
- O `ToastViewport` do Radix (`ui/toast.tsx:17`) fica em `sm:bottom-0 sm:right-0` com `z-[100]`, no mesmo canto do sonner (`bottom-right`). Os dois podem aparecer sobrepostos.

### Achado U1-02 (MELHORIA, M, hugo + iris)
- **V3**: `hooks/use-toast.ts:60-110` (adaptador para sonner). **V2**: `hooks/ui/use-toast.ts:11,145` (reducer legado), `components/ui/toast.tsx:17` (viewport); `App.tsx:136` e `App.tsx:161`. Grep usado: `grep -rlE "use-toast['\"]"` (56 arquivos V2, 100 V3); `grep -rn useAccessibleToast` (só o próprio arquivo e o teste).
- **Efeito**: quando duas ações disparam avisos seguidos pelo hook (ex.: salvar e depois erro), o segundo apaga o primeiro antes de ser lido; sem pilha, sem botão de fechar visível, sem ação. Dois sistemas visuais diferentes (cor, posição, animação) para a mesma função. Região `aria-live` extra sem uso.
- **Correção**: trocar o corpo de `hooks/ui/use-toast.ts` por um adaptador para `toast` do `@/lib/lazyToast` (a V2 já tem a fachada lazy), mantendo a assinatura `useToast()`, `toast()` e `dismiss`; tirar `<Toaster />` de `App.tsx` e `AccessibleToastProvider` de `AppProviders.tsx` (ou, se a decisão for manter a acessibilidade própria, ligar os chamadores a ele). Atualizar `use-toast.test.tsx` para o novo contrato (empilha, `destructive` vira erro).
- **Critério**: teste: duas chamadas seguidas de `toast({title})` deixam as duas visíveis; `variant:'destructive'` rende `role=status` do sonner com classe de erro; só existe um viewport no DOM (`document.querySelectorAll('[data-sonner-toaster],[data-radix-toast-viewport]')` tem 1 elemento).
- **Ressalva**: a V2 pode ter escolhido o legado de propósito para o teste de `TOAST_LIMIT`; por isso a decisão é de produto (confirmar com o Joaquim se quer pilha).

### Achado U1-04 (MELHORIA, M, iris)
- **V2**: `components/ui/sonner.tsx:12-15`: `position="bottom-right"`, sem `offset`/`mobileOffset` (o `sonner@2.0.8` instalado suporta `mobileOffset`, `node_modules/sonner/dist/index.d.ts`). Mesma ausência na V3 (o doc 13 diz "offset de posição", mas o código não tem).
- **Efeito**: no celular o aviso aparece a ~16 px do rodapé e fica por cima da barra inferior (`BottomNavigation`, ~64 px) e do `MobileFAB`: o toast cobre justo os botões que o usuário vai tocar por 4 s, e o botão de fechar fica em cima do "Mais".
- **Correção**: `mobileOffset={{ bottom: 'calc(72px + env(safe-area-inset-bottom))' }}` (e `offset` desktop se houver barra). **Critério**: teste de componente verifica o atributo/variável de offset; foto no celular emulado (390 px) mostra o toast acima da barra.
- Busca de cartão: `mobileOffset|toast.*(barra inferior|bottom nav)|sonner.*(celular|mobile)` = 0.

### Contraste dos toasts (observação, DECISÃO do designer)
- V3 usa `bg-success text-success-foreground` sólido; V2 usa `bg-success/10` + `!text-success` sobre card translúcido com `backdrop-blur`. Não medi a razão de contraste. Se o designer não medir, risco de ficar abaixo de 4,5:1 no tema claro. Pedido: medir (script de contraste do repo) antes de decidir.

### Notificações do app (tempo real)
- V3 monta `RealtimeSentimentAlertProvider`, `IncomingCallAlert`, `VideoCallLauncher`, `InAppNotificationProvider`, `EasterEggsProvider` depois do primeiro desenho (800 ms). A V2 monta os mesmos (menos `VideoCallLauncher`, e acrescenta `OutboundCallDialog` e `TeamChatNotificationsListener`). `InAppNotificationProvider`: 0 chamadores de `useInAppNotification` nas duas versões (código morto em ambas).
- `MobileShell`: a V3 deixa lista de notificações local e vazia; a V2 usa `useNotifications()` real (V2-MELHOR, cartão `t_24706794` done).

---

## 2. Command Palette e atalhos globais

### Como a V3 monta
- Três peças: (a) `GlobalKeyboardProvider` (`App.tsx:111`) monta `ui/command-palette` com Ctrl/Cmd+K e `?`; (b) `components/CommandPalette.tsx` (paleta de **módulos**, em `IndexContentConnected.tsx:109`) com Ctrl/Cmd+K e evento `open-global-search`; (c) `useGlobalKeyboardShortcutsManagement` (captura em `window`, `stopPropagation`) com o registro `defaultShortcuts`.
- Atalhos: Alt+←/→ voltar/avançar histórico, Esc volta quando não há diálogo, Alt+Home vai para o inbox (`useKeyboardManagement.ts:308-338`). `M` silencia o áudio em reprodução via `audioPlaybackBus` (`GlobalKeyboardProvider.tsx:66-77`).
- Persistência: atalhos personalizados em `localStorage` `custom-keyboard-shortcuts`; recentes da paleta de módulos em `localStorage` (com `safeGetJSON`).

### V2
- Mesma arquitetura, com extras: paleta de módulos filtrada por papel (`NavigationService.filterNavItems`), `CommandPaletteHost` lazy com busca de catálogo e comandos Talk X, `searchSeqRef` contra resposta atrasada, `DialogTitle` oculto, itens de "Acesso rápido" navegáveis por setas (R2-INF-034), `useKeyboardNavigation` com Alt+←/→/Home (`hooks/ui/useKeyboardNavigation.ts:21-32`).

### U1-01 (MELHORIA, **A**, iris + hugo)
Existe uma interação defeituosa **já medida e documentada**, sem cartão corretivo.
- **Evidência V2**: `e2e/busca-global-paleta.spec.ts:249-330` tem 4 `test.fixme` com causa raiz: (1) a paleta não devolve contatos nem mensagens, só telas; (2) o **primeiro** Ctrl+K depois de abrir a tela é engolido (o `CustomEvent open-global-search` sai antes de o chunk lazy do `CommandPalette` ter o ouvinte); (3) o Ctrl+K seguinte **não fecha** a paleta; (4) o Esc fecha mas o foco cai no `body` (sem `DialogTrigger`, o Radix não sabe para onde voltar).
- **Causa estrutural que o E2E só descreve de lado** (conferida por leitura): `useGlobalKeyboardShortcuts.ts:140-143` registra o `keydown` em `window` com `capture=true` e chama `event.stopPropagation()` (`:132`) quando o atalho `global-search` (Ctrl+K) casa. Pela especificação do DOM o evento não chega mais a nenhum ouvinte seguinte, nem no bubble de `window`. Consequências:
  1. No **Windows/Linux** (Ctrl+K) abre só a paleta de **módulos** (`components/CommandPalette.tsx`). A paleta rica (`ui/command-palette` via `CommandPaletteHost`: busca de catálogo e comandos Talk X, que o cartão `t_02f7db58` "unificou") só abre por `open-command-palette` (botão `DashboardTopBar.tsx:27`). O listener Ctrl+K do `GlobalKeyboardProvider.tsx:96-100` fica morto.
  2. `useGlobalSearchShortcut` (Ctrl+K no `document`, `RealtimeInboxView.tsx:169`) também é bloqueado: a **busca global de contatos/mensagens da inbox (`GlobalSearch`) não abre por Ctrl+K**, como o próprio E2E registra.
  3. No **Mac** (Cmd+K) o registro não casa (`ctrlKey` falso) e o evento segue: abrem em conjunto `ui/command-palette`, `components/CommandPalette` e, na inbox, a busca global (inferência do código; não medi).
- **V3**: mesma estrutura (`useKeyboardManagement.ts:289-336` captura e `stopPropagation`), portanto o defeito é herdado; a V2 já tem o E2E que o expõe.
- **Efeito**: o atendente aperta Ctrl+K e não obtém a busca de contatos/mensagens nem o catálogo; às vezes a primeira tecla não faz nada; a segunda não fecha.
- **Correção proposta** (um dono, uma peça): fazer do `GlobalKeyboardProvider` o **único** dono de Ctrl/Cmd+K e do estado das paletas; remover os ouvintes de `components/CommandPalette.tsx:66-76` e `useGlobalSearchShortcut`; a ação `global-search` alterna (abre e fecha) um único diálogo; `open-global-search` vira `openCommandPalette()` via contexto, sem depender de ouvinte em chunk lazy (ou guardar o pedido pendente até o ouvinte existir); guardar `document.activeElement` ao abrir e devolver o foco no `onCloseAutoFocus`; incluir contatos/conversas como grupo de resultados (reaproveitar o `GlobalSearch` da inbox ou a RPC que ele usa).
- **Critério de pronto**: os 4 `test.fixme` de `busca-global-paleta.spec.ts` viram `test(...)` e passam; teste unitário garante que `Ctrl+K` e `Meta+K` abrem exatamente 1 `role=dialog`.
- **Cartão**: nenhum encontrado (`primeiro Ctrl.K|engolid|devolve o foco|busca-global-paleta|fixme` só devolve os cartões Y12 que escreveram o E2E). Sugerido: um cartão iris (diálogos/paletas) + hugo (registro de atalhos).

### U1-09 (DECISÃO / correção da 1ª passada, M)
- A 1ª passada (UI-08) afirmou que "Nova conversa" e "Respostas rápidas" na paleta da V3 eram lacuna. **Lendo `command-palette-data.tsx:46-47` da V3**: os dois itens não têm `action` nem `href`, e `executeCommand` só trata `action`, `href` ou id `nav-` (`command-palette.tsx:96-103`). Ou seja, na V3 escolher qualquer um **só fecha o diálogo** (item decorativo). A V2 removeu os dois de propósito (comentário R2-INF-033 em `command-palette-data.tsx:41-49`).
- O cartão `t_2bf96975` (done, iris) já mandava ligá-los a fluxos reais ("abre o fluxo de nova conversa que a V2 já tem"), o que é correto. Registro aqui para o revisor **não exigir a cópia literal da V3** e para exigir teste: escolher cada item executa o fluxo (não apenas fecha).
- O atalho `n` que a V3 mostra para "Nova conversa" não funciona (não há executor), nem na V3.

### U1-10 (MELHORIA, B, iris) acessibilidade da paleta `ui/command-palette`
- **V3**: `command-palette.tsx:183-197` dá `aria-label` ao campo e ao botão "Limpar busca". **V2**: `command-palette.tsx:157-160` não tem nem um nem outro (só o `DialogTitle` oculto, que a V2 acrescentou e é melhor). Nas duas, a lista de resultados é `button`s soltos: sem `role=listbox/option` nem `aria-activedescendant`; o item selecionado por seta não rola para dentro da vista (`selectedIndex` só muda a classe).
- **Correção**: `aria-label={placeholder}` no campo, `aria-label="Limpar busca"` no botão, `role=listbox` + `role=option` + `aria-selected`, `scrollIntoView({block:'nearest'})`. **Critério**: teste com `getByRole('combobox')`/`getByRole('option')` e axe sem violação. (Correção está fora de UI-03 e UI-04, que tratam de textos em pt-BR e dialog/skip-link.)

### U1-11 (MELHORIA, B, iris + hugo) atalhos anunciados sem executor
- `hooks/shortcuts/defaultShortcuts.ts` registra 25 atalhos "configuráveis". Por id, **nenhum código fora do registro/ajuda os executa** (V2 e V3 iguais): `send-message`, `ai-suggestions`, `focus-input`, `emoji-picker`, `attach-file`, `next-conversation`, `prev-conversation`, `mark-resolved`, `transfer-chat`, `pin-conversation`, `mute-conversation`, `new-message`, `select-all`, `bulk-archive`, e os eventos `toggle-theme`, `quick-compose`, `toggle-notifications` são **despachados sem ouvinte** (`grep -rn "addEventListener('toggle-theme'"` = 0 nas duas).
- Alguns existem por outro caminho fixo (Ctrl+Enter em `useChatKeyboardNavigation.ts:27`, Ctrl+N e Ctrl+A em `useContactsViewState.ts:54-61`, Ctrl+A em `RealtimeInboxView.tsx:193`), então a tecla "funciona" mas **a tela de personalização e a de ajuda mostram um atalho que o usuário pode trocar sem efeito**.
- **Efeito**: a Configuração > Atalhos promete rebind que não faz nada. **Correção**: ou ligar cada id a um executor (ver `t_41cbc83a` para Ctrl+B/I/E do compositor), ou esconder da lista os que não têm executor. **Critério**: teste que percorre `DEFAULT_SHORTCUTS` e falha se um id sem `scope` não aparecer na tabela de ações registradas (ou numa lista explícita de "somente informativo").

### U1-19 (DECISÃO, B) tecla global `M`
- V3 tem `audio-toggle-mute` (tecla `m`): silencia o áudio em reprodução em qualquer tela, via `audioPlaybackBus` (`features/inbox/hooks/realtime/audioPlaybackBus.ts`, registrado em `hooks/useAudioManagement.ts:520-531`). V2: não existe barramento (`grep audioPlaybackBus` = 0; cartões: 0). A V2 tem `M` **dentro do player** (E16, `hooks/ui/useVolumeRocker.ts:23-30`: "o app não captura teclado globalmente"). Posição recomendada: manter a decisão E16, não portar.

---

## 3. Empty states

### V3
- Cinco sistemas (`EmptyState.tsx`, `GenericEmptyState`, `empty-state.tsx` + ilustrações, `empty-states/` contextual, `UnifiedEmptyState` órfão). Em uso real: 31 arquivos importam; `GenericEmptyState` 22 importadores (V2: 4).
- Contextos da V3 (`contextConfigs.tsx`): inbox, contacts, chats, search, queue, reports, tags.

### V2
- `empty-states/contextConfigs.tsx` é maior: 12 contextos (inbox, contacts, queues, agents, transcriptions, dashboard, search, notifications, calls, wallet, messages) com ações; `empty-state-illustrations.tsx` tem as 14 ilustrações. Mas a V2 só usa 5 ilustrações em chamadas (`illustration="inbox|contacts|queues|transcriptions|wallet"`); as ilustrações `messages, search, dashboard, agents, notifications, calls, data, generic` nunca são pedidas.
- Onde a V3 usa estado vazio e a V2 não (verificado nos arquivos que existem nas duas): `ChatMessagesArea` (já tem `t_af83b921`, done), `SLAMetricsDashboard` (a V2 usa tabela própria `SLAAgentTable.tsx:68` com texto simples, equivalente), `TalkXView` (V2 redesenhou: `TalkXOverview` etc.; filtro sem resultado não verificado). Os outros 18 arquivos que a V3 usa não existem na V2 (monitoramento, DLQ, páginas admin): pertencem a outras frentes.

### U1-13 (MELHORIA, B, iris)
- **Efeito**: nenhum na tela hoje; é código pronto sem uso. **Proposta**: nos próximos cartões de tela vazia, usar `ContextualEmptyState` com `illustration` correspondente em vez de texto solto; criar teste que lista os contextos sem consumidor. Sem cartão dedicado (não vale cartão sozinho).
- Duplicidade (`EmptyState.tsx` e `empty-state.tsx` com o mesmo nome em arquivos de caixa diferente) existe na V2 também: risco no Windows/WSL/CI com sistema de arquivos insensível a maiúsculas. Conferir `git ls-files src/components/ui | sort -f | uniq -di` (não rodei).

---

## 4. Animações, micro-interactions, mobile, conectividade, sidebar, auth

### Motion e micro-interactions: conferido, sem diferença funcional
- Exports idênticos em `motion/components`, `motion/effects`, `micro-interactions/{buttons,feedback,skeletons}`, `empty-state-illustrations`, `emoji-picker` (comparação por `grep ^export`: nenhuma diferença; só `variants.ts` da V2 acrescenta `talkx*`). As diferenças de linhas (270 vs 127 etc.) são comentários e formatação.
- V2 usa `framer-motion` direto (23 importadores de `motion.tsx` barril); a V3 usa o barril `@/components/ui/motion` em 338 arquivos. Reduced-motion: V2 respeita em 7 arquivos de `ui/`, V3 em 2 (V2-MELHOR; cartão `t_6bfc8437`).
- Auth usa `RippleButton` nas duas. A V2 redesenhou a tela inteira (mapa-múndi, bloqueio por tentativas); equivalente.

### U1-03 (MELHORIA, M, hugo) persistência de preferências sem proteção
- **V2** (leitura/gravação em `localStorage` fora de `try/catch`): `hooks/ui/useTheme.ts:28` (leitura no estado inicial do tema) e `:108` (gravação); `components/theme/HighContrastToggle.tsx:61-66` (4 leituras em `useState`) e `:94,119,128,137` (4 gravações em `useEffect`); `hooks/ui/useScreenProtection.ts:24` (gravação); `components/CommandPalette.tsx:33` (`pushRecent`, antes de navegar); `components/mobile/MobileDrawerMenu.tsx:71`; `components/ui/emoji-picker.tsx:64` (depois de inserir o emoji, antes de fechar). A V2 **já tem** `lib/safeStorage.ts` (`safeGetItem`, `safeSetJSON`…) mas só 4 arquivos o importam; a V3 usa 11.
- **Efeito**: navegador com armazenamento bloqueado (aba anônima do Safari/Firefox, política corporativa, cota cheia, iframe com cookies de terceiros bloqueados) lança `SecurityError`/`QuotaExceededError` durante o render do provedor raiz (`HighContrastProvider`, `ThemeSync`) e derruba a árvore: o `ErrorBoundary` reage tentando de novo e termina em "Falha Crítica na Inicialização". Na paleta, escolher um módulo lança antes de navegar. O V3 tem a mesma fragilidade nesses pontos, mas a V2 já tem a ferramenta.
- **Correção**: trocar esses 12 pontos por `safeGetItem/safeSetItem/safeGetJSON/safeSetJSON`. `emoji-picker` também deveria validar que o JSON salvo é array (`Array.isArray`), senão `recentEmojis.filter` quebra com valor corrompido.
- **Critério**: teste que simula `Storage.prototype.setItem/getItem` lançando e monta `AppProviders`, a paleta e o `EmojiPicker` sem exceção.

### U1-05 (MELHORIA, M, iris) título do cabeçalho mobile
- **V2**: `components/mobile/MobileHeader.tsx:17-36` mapeia 17 views; o resto usa `currentView.charAt(0).toUpperCase()+slice(1)` (`:106`). Views sem rótulo, comparadas ao `NavigationService`: `team-chat`, `email-chat`, `omni-inbox`, `talkx`, `sla`, `warroom`, `wa-templates`, `wa-flows`, `ai-usage`, `audit-logs`, `evolution-monitor`, `gmail`, `integrations`, `multiplix`, `nps`, `voip`, `telemetry` etc. (36 ids). O cabeçalho mostra "Team-chat" e "Email-chat" justamente nos dois itens da barra inferior do celular ("Equipe", "Email").
- **V3**: mesma lacuna (com mapa de 21). **Correção**: derivar o título do mesmo `NavigationService` (label do item de menu) para que sidebar e cabeçalho nunca divirjam. **Critério**: teste percorre todos os ids de `NavigationService` e verifica que `MobileHeader` não rende hífen nem inicial minúscula.
- Cartão: `viewLabels|MobileHeader` só trouxe cartões de área segura (`t_edd11f2d`), não de rótulo.

### Mobile shell: V2-MELHOR
- V2 `MobileShell.tsx` usa `useNotifications()` real (sino, contagem, marcar lida) e liga o botão Buscar ao `open-global-search` (R2-PLAT-010); esconde o FAB em Contatos (que tem o próprio). V3: lista local vazia, `_mobileSearchOpen` nunca lido, sem `onMarkRead`. Gestos: `useSwipeNavigation` (borda 20 px, limiar 60) e `SwipeableMessage`/`MobilePullToRefresh` equivalentes nas duas; a V2 ainda tem `BottomSheet`, `MobileSlidePanel`, `SwipeGestures`, `TouchRipple`.
- `mobile-components.tsx`: diferenças só de estilo.

### Conectividade com o Supabase (UI-05, fluxo completo)
- **V3**: `integrations/supabase/connectivityMonitor.ts` (singleton pub/sub; heartbeat de 60 s que **pausa com a aba oculta**; `GET` com `mode:'no-cors'` e **sem cabeçalho customizado**, para não disparar preflight; "qualquer resolução = alcançável", só `TypeError` = backend fora; `reportSupabaseRequestFailure` chamado pelo `boundedFetch` do cliente acelera a detecção) → `hooks/useSupabaseConnectivity.ts` → `ui/supabase-connectivity-banner.tsx` (faixa `role=alert` no topo + botão "Tentar novamente" + toast "Conexão restaurada"). O alvo é `/functions/v1/health-check`, então o doc 13 está errado ao dizer "Nenhuma Edge Function".
- **V2**: só `OfflineIndicator` (navegador) e cartões `t_6a9e1f03` (hook, done) e `t_bc279fb5` (banner).
- **U1-08 (MELHORIA, M, hugo)**: o corpo de `t_6a9e1f03` manda usar "uma chamada leve (por exemplo `auth.getSession()` ou o endpoint de saúde que o projeto já use)". `auth.getSession()` lê a sessão local e não toca na rede (só renova se o token expirou): **não detecta backend fora**. Além disso, na V2 a Edge `health` é fechada (`authorizeObservability`: `x-cron-secret` ou JWT de admin) e não existe `health-check` (`ls supabase/functions`: só `health` e `connection-health-check`). **Correção do cartão**: copiar o desenho da V3 (GET `no-cors` sem cabeçalhos para uma rota pública da mesma origem do Supabase, por exemplo `${SUPABASE_URL}/auth/v1/health` ou `/rest/v1/`; resolveu = ok, `TypeError`/timeout de 6 s = fora; 60 s; pausa com aba oculta; religar ao `online` do navegador; gancho no `fetch` do cliente). **Critério**: teste com `fetch` rejeitando `TypeError` → `backend-down`; resolvendo → `online`; aba oculta → sem ping.

### Barra lateral e persistência
- `ui/sidebar*.tsx` (shadcn) tem **0 importadores** nas duas versões (confirmado em `uso_importadores.json` e por grep): o fluxo "AppLayout → sidebar.tsx" do doc 13 é falso; a barra real é `components/layout/Sidebar.tsx`.
- V2 `Sidebar.tsx`: filtro por papel/permissão, selos de Tarefas e Email, `SidebarUserPill` (status de presença), `AccessibilitySettings`, volume das mídias, voltar/avançar, `NotificationsPopover`. V3 tem de exclusivo: `ConnectionStatusIndicator` (coberto por `GL1/GL2`), `StatusLabelToggle` (`t_e938f048`, todo), selo de saúde da Evolution (`useEvoApiAlertsBadge`, sem cartão; ver U1-20) e `AgentProfilePopover`. Persistência: `sidebar-collapsed` e favoritos em `localStorage` nas duas, com `try/catch` na V2 (V2-MELHOR). Atalho Ctrl+B e evento `toggle-sidebar` existem nas duas (ouvinte em `useSidebarCollapse.ts`).

### Auth (micro-interactions e fluxo)
- U1-07 (MELHORIA, M, iris): a V2 `auth-login` já nega por política de rede com `403 "Access denied"` (`supabase/functions/_shared/request-policy.ts:186`, usada em `auth-login/index.ts:113-122`). O cliente (`lib/serverLogin.ts:112-117`) só trata 401/423 como recusa; qualquer outro status (inclusive 403) vira `unavailable` e a UI mostra "Login temporariamente indisponível. Tente novamente em instantes." (`services/auth.service.ts:100-106`). O usuário bloqueado fica tentando de novo. A V3 mostra "Acesso bloqueado pela política de segurança" com motivo (`lib/loginAttempts.ts:87-103`; `Auth.tsx:176-200`). O plano do dono (cartão `t_9dcf4766`, arquivado) decidiu **não revelar** se foi IP ou país; então o que falta é só separar 403 de falha de infraestrutura. **Correção**: `serverLogin` devolve `{ok:false, blocked:true}` em 403 e a tela mostra texto neutro "Não foi possível entrar a partir desta rede. Fale com o administrador." sem motivo. **Critério**: teste de `serverLogin` com 403 e teste da tela.
- O painel `AuthDiagnosticsPanel` e `PreviewPreconditionBanner` da V3 são ferramentas de depuração; não portar.

### Shell, boot e atualização de versão
- **U1-06 (MELHORIA, B, designer + iris)**: a V3 tem `#root-loading` (três pontos verdes, texto, fundo escuro) no `index.html` e esconde com `window.__zappHideRootLoader()` depois de ~150 ms do primeiro desenho. A V2 não tem: `index.html` só tem o script de tema e o watchdog de 8 s (que mostra erro). Até o JS inicial (~340 KB) baixar e o React montar, o usuário vê a cor de fundo vazia. **Correção**: loader mínimo em HTML/CSS inline usando as mesmas cores do script de tema (claro/escuro), removido no `AppContent` quando houver conteúdo em `#root`; respeitar `prefers-reduced-motion`. **Critério**: E2E: logo após `page.goto`, antes do React, existe `#root-loading`; depois de montar, some. Cartão: 0 (`index.html.*(loader|carregando|splash)`).
- `index.html` da V3 tem metas `theme-color`, `apple-mobile-web-app-*`, `manifest`, `apple-touch-icon`, `description`: coberto por `t_a7125912` (done).
- Atualização de versão: a V3 usa `lib/buildVersion.ts` + `ServiceWorkerUpdateBanner` ("Atualizar agora" com cortesia de 1 min). A V2 tem `lib/deployment-update.ts` (checa `version.json` a cada 10 min, recarrega com a aba oculta e sem bloqueio de edição/sessão, aviso com "Atualizar agora") e `StaleBundleNotice` para chunk velho: **V2-MELHOR** (cartões `t_6d3430b1`, `t_2916d3c4`).
- Componentes de depuração (`BuildValidationOverlay`, `HardResetButton`, `SwDebugWidget`, `ThemeDebugger`, `useThemeAudit`) só existem na V3 e renderizam nada em produção: não portar.

### Deep links
- V3 mantém redirects `/login`→`/auth`, `/inbox`, `/connections` e `/integrations` (para `?view=…&tab=…`), `/chat-popup` sem id. A V2 não os tinha; o cartão `t_db8710aa` (done, iris) os cobre ("links antigos caem no 404"). `manifest.json` da V2 tem `shortcuts` com `?view=inbox` e `?view=team-chat`, equivalentes. Rotas `/sla/preferences` e `/sla/alerts` só na V3 (frente SLA).

---

## 5. Alertas globais e canais (seção 3 do doc 13 + conferência no banco local)

O documento 13 diz que **não há tabelas, RPCs, canais nem Edge Functions** na camada de UI. Isso vale para os arquivos de `ui/`, mas os fluxos que ele cita acionam estes recursos no app (V3):

| Fluxo da V3 | Recurso | Onde | V2 |
|---|---|---|---|
| Alerta de mensagem abandonada | canal `postgres_changes` UPDATE `zapp.failed_messages`, nome com `Math.random` | `useFailedMessageAlerts.ts:59-78` | tabela **não existe** no banco local (só `public.*`) |
| Alerta de entrega após retentativa | UPDATE `evo.evolution_messages` | `useRetryResolutionAlerts.ts:187-190` | tabela **não existe** (V2 usa `public.messages`) |
| Alerta de automação com erro | `automation_executions` | `useAutomationFailureAlerts.ts` | **não existe**; só `public.automations` |
| Migração WhatsApp | RPC `rpc_migrate_whatsapp_integration` (uma vez por sessão) | `IntegrationMigrationMount.tsx` | função não existe; não portar |
| Conectividade | `GET /functions/v1/health-check` (no-cors) | `connectivityMonitor.ts` | Edge inexistente (ver U1-08) |

Conferência no banco local (`zapp-db-local psql . v2-integrador`, consulta de catálogo): esquemas `_realtime, auth, cron, extensions, graphql, graphql_public, net, ops, public`. Publicação `supabase_realtime` com 36 tabelas, entre elas `notifications`, `agent_presence`, `messages`, `whatsapp_connections`, `connection_health_logs`, `calls`, `security_alerts`, `message_reactions`. `user_settings` tem `theme`, `language`, `compact_mode` (sem efeito na tela até `t_f2adbb2c`, done). Tabelas `failed_messages`, `evolution_messages`, `automation_executions` ausentes: o cartão `t_34eef96e` deve usar `public.messages` (status de entrega) e `public.automations`/logs, e **uma assinatura por usuário**, como já pede.

- **U1-14**: `t_34eef96e` (todo, hugo) cobre os quatro hooks de alerta global. Sugestão ao cartão: depender de `public.messages` e listar a tabela de execução de automação real antes de começar (o corpo cita `automation_execu…`, tabela que não existe no banco local).

---

## 6. Erros e omissões do documento 13 (para o relatório final da série)

1. Seção 2 "Command Palette": cita `@/hooks/useCommandPalette` (não existe; o hook está em `command-palette.tsx`) e ignora a **segunda paleta** `components/CommandPalette.tsx` e o `GlobalKeyboardProvider`.
2. Seção 2 "Sidebar da Aplicação": a cadeia `AppLayout → sidebar.tsx` não existe (0 importadores); a barra real é `layout/Sidebar.tsx`.
3. Seção 2 "Notificação": o `Toaster` shadcn é montado mas nunca recebe toast na V3 (o hook é adaptador do sonner).
4. Seção 3: "nenhuma Edge Function"; o monitor de conectividade chama `/functions/v1/health-check`. Também omite os alertas globais de tempo real montados pelo `AppShell`.
5. Seção 5: `react-phone-number-input` não existe no `package.json` da V3; o `phone-input.tsx` é implementação própria. `pagination`, `hover-card`, `menubar`, `form`, `resizable` sem importadores (já na 1ª passada).
6. `sonner.tsx` não tem "offset de posição" (§1 do doc); `UnifiedEmptyState` e `empty-states.tsx` são órfãos.

## 7. V2-MELHOR e EQUIVALENTE (não devolver)

U1-17: `SectionErrorBoundary` reporta ao coletor; `error-boundary-retry` trata chunk velho com recarga única; paleta de módulos filtrada por papel; busca da paleta rica com `searchSeqRef`; notificações mobile reais; `deployment-update` com bloqueio de recarga; `serverLogin` com timeout de 12 s e região fixa; `AccessibleToastProvider` respeita movimento reduzido (quando for usado); `useCustomShortcuts` com estado compartilhado; `useZenMode`/`useDensity`/`useSidebarFavorites` com `try/catch`.
U1-18: sidebar shadcn (diferença só de comentários), `AppShell` swipe de borda, `InAppNotification`, `OfflineIndicator`/`RouteLoadingBar` (UI-04 cobre os timers), `MobilePullToRefresh`, `motion/*`, `micro-interactions/*`, `emoji-picker` (salvo U1-03).

## 8. U1-12 (MORTO, B) e U1-20 (MELHORIA, B)

- U1-12: `useActionFeedback` (V2 `hooks/ui/useActionFeedback.ts:15-20`, V3 igual) escreve a ação como `[Desfazer]` na descrição do toast, sem botão; `withUndo`, `useConfirmAction`, `withBatchFeedback` e `useOptimisticAction` têm 0 chamadores na V2 e na V3 (os 3 consumidores só usam `success/error`). Se `withUndo` virar necessário, usar o `useUndoableAction` (V2, sonner com botão e identidade por operação). Proposta: apagar ou migrar para sonner junto com U1-02.
- U1-20: destinos do menu da V3 sem equivalente nos ids do `NavigationService` da V2: `admin-connections, agents-ops, agents-system, alert-history, bridge-status, cron-scheduler, dispatch-errors-history, email-audit, email-status, email-webhook, evo-api-health, evolution-api-logs, failed-auth-messages, failed-messages, inbox-sync-status, instance-pauses, notification-channels, public-api, realtime-monitor, search-insights, sicoob-bridge, webhook-events, webhook-overview, webhook-secret` (e `payments`, `pipeline`, `tags`: fora de escopo/substituídos). Cartões existentes: falhas (`t_705ae88e` etc.), pausas (`t_d6a4b271`), cron (`t_ac2fa555`), eventos de webhook (`t_069395b8`). **Sem cartão encontrado** para `realtime-monitor` e `search-insights` (busca `realtime-monitor|monitor de realtime`, `search-insights|SearchInsights` = 0); fica para as frentes de admin/monitoramento.

---

## 9. Cartões e buscas usados (rastreabilidade)

Buscas no quadro por: `TOAST_LIMIT|use-toast|Toaster`, `mobileOffset`, `contraste.*toast`, `primeiro Ctrl.K|engolid|devolve o foco|busca-global-paleta|fixme`, `viewLabels|MobileHeader`, `safeStorage`, `index.html loader|splash`, `manifest|apple-touch`, `/login|redirect`, `Tema|Idioma|user_settings`, `useFailedMessageAlerts|useRetryResolutionAlerts|useAutomationFailureAlerts`, `ConnectionStatusIndicator`, `StatusLabelToggle`, `audioPlaybackBus|toggleMute`. Cartões lidos: `t_6a9e1f03`, `t_2bf96975`, `t_34eef96e`, `t_a7125912`, `t_db8710aa`, `t_f2adbb2c`, `t_9dcf4766`, `t_6d3430b1`, `GL1/GL2/GL3`, `t_af83b921`, `t_41cbc83a`, `t_e938f048`.

## 10. O que NÃO consegui ler ou conferir

- Não executei nada de runtime: U1-01 (Mac), U1-02 (sobreposição visual), U1-04 (cobertura da barra) e U1-05 (títulos) vêm de leitura do código; o E2E existente já mede parte de U1-01 no Windows/Linux.
- Não medi contraste dos toasts nem o desempenho do monitor de conectividade.
- Não li linha a linha os 76 arquivos "com diferença" fora do meu recorte (calendar, chart, table, form, etc.); de `ui/` li motion, micro-interactions, empty-state*, command-palette*, sonner/toast*, offline-indicator, route-loading-bar, scroll-to-top, emoji-picker, mobile-components, sidebar, e comparei exports dos demais.
- Não abri `TalkXView` e `SLAMetricsDashboard` da V2 por inteiro para checar todo estado vazio (a V2 redesenhou ambos).
- `ThemeInitializer`, `TransitionProvider`, `ViewRouter`, `Index.tsx` e `IndexContentConnected.tsx` foram lidos só nas partes que tocam os fluxos acima.
- Banco local: só a stack `v2-integrador` respondeu; as demais (`zapp-db-local list`) não foram abertas para poupar memória. Não consultei políticas RLS de `notifications` (a stack caiu entre consultas).
