# Paridade UI, 2ª passada, fatia U2: primitivos de `components/ui` (V3 contra V2)

Data: 13/10/2026. Somente leitura. V3 = `~/projetos/Zapp_Web_V3/src/components/ui` (116 arquivos). V2 = `~/hermes-workspaces/Zapp_Web_V2/.integrador/src/components/ui` (105 arquivos). Em comum: 84; só V3: 32; só V2: 21.

## 1. Método

1. Lista dos dois lados (`find`), `comm` para separar comuns, só-V3 e só-V2.
2. Para os 84 comuns: `diff -B -w` (ignora espaço e linha em branco), lido arquivo por arquivo. Descartei o ruído dominante da V3: ~600 linhas de JSDoc genérico ("... component for the ui section"), reordenação de classes Tailwind e formatação de Prettier. Só 1 arquivo é byte a byte igual (`micro-interactions.tsx`) e 7 diferem só por comentário.
3. Cada diferença foi classificada em: comportamento, a11y, segurança, robustez, desempenho, variante/prop, estilo, dependência, import/estrutura.
4. Contexto verificado: versões de `package.json` das duas (react-day-picker 10 contra 8; react-resizable-panels 4 contra 2; vaul 0.9 contra 1.1; framer-motion 13 contra 12.43), importadores reais de cada primitivo (`grep` nos dois `src/`), `MotionConfig`, tokens de cor, e a 1ª passada (`AUDITORIA_PARIDADE_V3_UI_PARTE7...`, UI-01..UI-10).
5. Antes de afirmar lacuna: `buscar_corpo.py` com os termos (`aria-activedescendant`, `group-focus-within`, `AnimatedCounter`, `useScrollToTop`, `MotionConfig`, `react-day-picker`): NENHUM cartão. `aria-busy` e `Loading...` só aparecem como menção solta em planos antigos (CL1, SH3), sem cartão aberto sobre o primitivo.

Observação importante: a V2 viva já recebeu coisas desde a 1ª passada. `ui/__tests__/message-reactions.test.tsx` existe (17 casos, commit `aff8bfb1ce`) e a V2 já tem `aria-pressed` nas reações; o teste até registra o defeito "reaçãoões" (ver U2-03). O UI-10 só precisa cobrir o tooltip de quem reagiu e o que sobrar.

## 2. Resumo

- Os primitivos shadcn/Radix (accordion, alert, alert-dialog, avatar, badge, button, card, checkbox, command, context-menu, dialog, dropdown-menu, input, label, menubar, popover, progress, radio-group, scroll-area, select, separator, sheet, sidebar, slider, switch, table, tabs, textarea, toast, toggle, toggle-group, tooltip) têm **a mesma API e o mesmo comportamento Radix** nas duas. A diferença é de tema: a V3 é "plana" (`shadow-none`, `border-border`, `bg-background`, realce `primary/20`); a V2 usa sombras, `bg-popover`, `bg-accent`. Isso é decisão de design, não lacuna.
- Onde há diferença funcional, a V2 está melhor em vários pontos (seção 5) e a V3 em alguns (seção 4; os já cobertos por UI-01..10 estão marcados na tabela).
- A V2 introduziu um defeito de acessibilidade que a V3 não tem: **`role="status" aria-label="Loading..."` em todo `Skeleton`** (U2-01).
- **Nada de segurança novo**: o único item (saneamento de CSS do chart) já é UI-02. Diferença a favor da V2: `secureRandomFloat`.
- **Achados novos: 20** (U2-01..U2-21, sendo o U2-12 apenas "conferido, sem diferença"): severidade A 0, M 5 (U2-01, 02, 03, 14, 17), B 15. Nenhum duplica UI-01..10.
- Código morto em ambas: `form`, `resizable`, `pagination`, `hover-card`, `menubar`, `SkeletonList`, `EmptyState`, `micro-interactions/*`, `AnimatedCounter` e outros (seção 6).

## 3. Tabela arquivo a arquivo

Legenda de classe: A11Y, COMP (comportamento), DES (desempenho), EST (estilo), IMP (só caminho), ROB (robustez), SEG, TESTE, VAR (variante/prop), DEP (versão de biblioteca), MORTO (0 importadores), JÁ-COBERTO:UI-xx (cartão da 1ª passada), **V2-MELHOR** (não devolver para a V3).

### 3.1 Os 116 arquivos da V3

| # | Arquivo | Na V2? | Classe | Observação (diff real normalizado) |
|---|---|---|---|---|
| 1 | `EmptyState.tsx` | sim | VAR | V3 tem o contexto `pipeline` ("Criar Deal") e fala em "importe uma lista" no contexto contatos (fora de escopo: importar). 0 importadores nas duas. |
| 2 | `GenericEmptyState.tsx` | sim | COMP | V3 componente completo com `motion` pulsante (22 importadores); V2 virou shim `@deprecated` (4). Visual do ícone diferente. |
| 3 | `SkeletonList.tsx` | sim | EST | Só formatação; 0 importadores nas duas. |
| 4 | `UnifiedEmptyState.tsx` | **não** | SÓ-V3 | Órfão na V3 (só barril quebrado). Não portar. |
| 5 | `__tests__/bubble.test.tsx` | **não** | SÓ-V3 | Teste do `bubble.tsx` da V3. V2 usa `MessageBubble.tsx`. Sem ação. |
| 6 | `__tests__/button.test.tsx` | sim | TESTE | V2 cobre `MotionButton` por CSS (`motion-safe`) e proíbe `framer-motion` no botão (SL-103A). |
| 7 | `__tests__/message-reactions.test.tsx` | sim | TESTE | V3 26 casos; V2 já tem 17 (cartão UI-10/commit aff8bfb1ce); falta tooltip de quem reagiu. |
| 8 | `accessible-toast.tsx` | sim | COMP/DES | V2: saída animada por CSS respeitando movimento reduzido, id por `secureRandomChars`, `aria-live`; V3: framer, `useMemo` no contexto, `crypto.randomUUID`. V2 montado nos provedores; V3 nunca montou (1ª passada). Ver U2-09. |
| 9 | `accordion.tsx` | sim | EST | V3 põe `border-border` no item; V2 usa `border` padrão. Sem efeito funcional. |
| 10 | `alert-dialog.tsx` | sim | EST | Overlay `/90` (V3) vs `/80` (V2); sombra `shadow-none` vs `shadow-lg`. Mesma API Radix, foco/teclado iguais. |
| 11 | `alert.tsx` | sim | EST | Variantes de borda/cor; sem mudança de API. |
| 12 | `attachment.tsx` | **não** | SÓ-V3 | Sem consumidor final na V3. Não portar. |
| 13 | `avatar.tsx` | sim | ROB | V3: chave estável no `AvatarGroup`; V2 usa `index` (JÁ-COBERTO:UI-04f). V2 memoiza `StatusIndicator` (**V2-MELHOR**, pequeno). `text-3xs` (V2) vs `text-[10px]`. |
| 14 | `badge.tsx` | sim | ROB/VAR | V3 `whitespace-normal break-words max-w-full overflow-hidden` (texto longo não vaza) e variante `whatsapp` e `glowPurple`; V2 sem essas duas variantes. Ver U2-05 e U2-19. |
| 15 | `breadcrumb.tsx` | sim | A11Y/i18n | sr-only "Mais" (V3) vs "More" (V2). JÁ-COBERTO:UI-03. Sem uso de `BreadcrumbEllipsis` além do import; 1 importador. |
| 16 | `bubble.tsx` | **não** | SÓ-V3 | Bolha de chat da V3; V2 tem `MessageBubble.tsx` próprio. EQUIVALENTE por outro desenho (1ª passada). |
| 17 | `button.tsx` | sim | DES/A11Y | **V2-MELHOR** em desempenho: `Button`/`MotionButton` sem `framer-motion` (CSS `motion-safe:`); `CardTitle as`. V3 tem `aria-busy` em `isLoading` (V2 perdeu — ver U2-04) e `whitespace-normal break-words overflow-hidden` (V2 `whitespace-nowrap`). |
| 18 | `calendar.tsx` | sim | DEP | V3 escrito para react-day-picker v9/v10 (`month_caption`, `Chevron`, `autoFocus`), V2 para v8 (`caption`, `IconLeft`). Cada um bate com seu `package.json`. Ver U2-15. |
| 19 | `card.tsx` | sim | DES/A11Y | **V2-MELHOR**: `MotionCard` sem `framer-motion`; `CardTitle` com `as` (nível de título correto). V3 tem `break-words max-w-full overflow-hidden` no Card (ver U2-05; não portar o `overflow-hidden`). |
| 20 | `chart.tsx` | sim | COMP/SEG | V3: saneamento de CSS (JÁ-COBERTO:UI-02), tipos oficiais do recharts, `key` estáveis e valor `0` exibido no tooltip. V2: `item.value &&` esconde 0, `key={item.dataKey}` pode repetir/ficar `undefined`, `item.payload.fill` sem guarda, `any`. Ver U2-14. |
| 21 | `chat-shimmer.tsx` | **não** | SÓ-V3 | Esqueleto de abertura de conversa; JÁ-COBERTO:t_5e0b5d80 (todo). |
| 22 | `chat/index.ts` | **não** | SÓ-V3 | Barril do chat. Sem ação. |
| 23 | `checkbox.tsx` | sim | A11Y | V3: borda `border-border` (contraste não-textual fraco no estado desmarcado) e foco `ring-1 ring-primary`. V2: borda `border-primary` e foco `ring-2 ring-ring ring-offset-2`. **V2-MELHOR**: não portar. |
| 24 | `collapsible.tsx` | sim | EQUIVALENTE | Só JSDoc de ruído na V3. Conferido, sem diferença de comportamento. |
| 25 | `command-palette-data.tsx` | sim | COMP | V3: "Nova conversa", "Respostas rápidas", item Etiquetas. V2: categoria `talkx`, atalhos "?" que dispara `show-shortcuts-help`. Comandos sem executor foram removidos de propósito na V2 (R2-INF-033). Nova conversa/Respostas = UI-08 (tags: excluídas). |
| 26 | `command-palette.tsx` | sim | A11Y/COMP | V3: `aria-label` no campo e no "Limpar busca", `type="button"`, `mountedRef`. **V2-MELHOR**: `searchSeqRef` (descarta resposta antiga), setas funcionam no "Acesso rápido", grupo Talk X, `DialogTitle`. Ambas sem `combobox/listbox`. Ver U2-02. |
| 27 | `command.tsx` | sim | A11Y | **V2-MELHOR**: `CommandDialog` com `DialogTitle` sr-only e título configurável. Sem equivalente na V3 (Radix avisa). |
| 28 | `context-menu.tsx` | sim | EST | Item focado: V3 `bg-primary/20 text-primary`, V2 `bg-accent`. Superfície `bg-background` (V3) vs `bg-popover` (V2). Zero diferença de teclado/ARIA (Radix). |
| 29 | `contextual-empty-states.tsx` | sim | EQUIVALENTE | Só JSDoc de ruído na V3 e o re-export de `TagsEmptyState` (tags: função excluída, V2 correta). Conferido, sem diferença de comportamento. |
| 30 | `dialog.tsx` | sim | A11Y/ROB | V3: descrição oculta padrão para o Radix (JÁ-COBERTO:UI-04a) e "Fechar" (UI-03). **V2-MELHOR**: `max-h-[calc(100dvh-2rem)] overflow-y-auto` na base — diálogo mais alto que a viewport mantém o rodapé alcançável. Overlay `blur` da V2. |
| 31 | `dropdown-menu.tsx` | sim | EST | Item focado `bg-primary/20 text-primary` (V3) vs `bg-accent` (V2); superfície e sombra; separador. Sem diferença de a11y funcional. |
| 32 | `emoji-picker.tsx` | sim | ROB/A11Y | V3: `aria-label` nas categorias/"Recentes", `type="button"`, `safeGetJSON/safeSetJSON`. V2: só `title`, sem `type`, `localStorage.setItem` sem try (lança em cota/privado). **V2-MELHOR**: largura `min(340px, 100vw-1rem)`. Ver U2-10. |
| 33 | `empty-state-illustrations.tsx` | sim | A11Y/MORTO | V3: todas as 15 ilustrações com `aria-hidden` (+ `tags`); V2: sem `aria-hidden`, usadas só por `empty-state.tsx` (11 importadores) e `empty-states.tsx` (0). Ver U2-20. |
| 34 | `empty-state.tsx` | sim | VAR | V3 tem `size="xs"`; V2 não. 11 importadores na V2, 2 na V3. Ver U2-20. |
| 35 | `empty-states.tsx` | sim | MORTO | V3: barril para `UnifiedEmptyState` (órfão). V2: componente `EmptyState` de 181 linhas com ilustrações; 0 importadores. Candidato a remoção na V2. |
| 36 | `empty-states/ContextualEmptyState.tsx` | sim | COMP | V2 exige `primaryAction`, V3 aceita `primaryAction?` e `actionLabel`. V3 define o contexto `tags` (excluído). |
| 37 | `empty-states/ConvenienceExports.tsx` | sim | COMP | V3 tem `TagsEmptyState` (função excluída). V2 correta. |
| 38 | `empty-states/contextConfigs.tsx` | sim | COMP | V2 tem 12 contextos completos (queues, agents, transcriptions, dashboard, wallet, messages...); V3 está incompleto (faltam vários) e traz `tags`, `chats`, `queue`, `reports`. **V2-MELHOR**. A V2 oferece "Importar distribuição" no contexto `wallet`: ação de importar fora de escopo — revisar o rótulo se virar botão real. |
| 39 | `empty-states/index.ts` | **não** | SÓ-V3 | Barril. Sem ação. |
| 40 | `error-boundary-retry.tsx` | sim | ROB | **V2-MELHOR**: erro de chunk (`isChunkLoadError`) é relançado ao boundary global/recarrega a página; V3 repete o `retry` que não resolve nada. |
| 41 | `form.tsx` | sim | A11Y/DES | V3: `useMemo` nos contextos e `role="alert" aria-live="polite"` em `FormMessage`. Zero importadores nas duas (UI-14 já registrou). Se um dia for usado: portar ambos. |
| 42 | `hover-card.tsx` | sim | EST | V3 `bg-background shadow-none`; V2 `bg-popover shadow-md`. Zero importadores nas duas. |
| 43 | `icon-button.tsx` | sim | EST | Glow por token na V2; resto formatação. |
| 44 | `input.tsx` | sim | VAR/EST | V3 `variant` padrão = `default` (foco sóbrio) e `max-w-full`; V2 padrão = `glow` (anel de 4px + sombra) e foco por variante. Todas as 5 variantes existem nas duas. Ver U2-18 (decisão de design). |
| 45 | `label.tsx` | sim | ROB/EST | V3 `leading-normal break-words`; V2 `leading-none`. Rótulo de 2 linhas na V2 fica colado e palavra longa não quebra. Ver U2-06. |
| 46 | `marker.tsx` | **não** | SÓ-V3 | Sem consumidor final. Não portar. |
| 47 | `menubar.tsx` | sim | EST | Mesmo padrão de realce primário da V3. Zero importadores nas duas. |
| 48 | `message-reactions.tsx` | sim | A11Y/COMP | V2: `aria-pressed` (já), `role="toolbar"`, picker com tabindex itinerante (**V2-MELHOR**), mas barra rápida só aparece em `group-hover` (sem foco por teclado) e plural "reaçãoões". V3: tooltip de quem reagiu, `hasReacted/aria-pressed` no picker, `group-focus-within`. Ver U2-03; tooltip/teste = UI-10. |
| 49 | `message.tsx` | **não** | SÓ-V3 | Compositor de mensagem da V3; V2 usa `message-reactions.tsx` + `MessageBubble`. EQUIVALENTE. |
| 50 | `micro-interactions.tsx` | sim | IDÊNTICO | Byte a byte igual. |
| 51 | `micro-interactions/buttons.tsx` | sim | ROB | V3 limpa os timers do ripple ao desmontar. 0 importadores — MORTO. |
| 52 | `micro-interactions/feedback.tsx` | sim | EST | Formatação; 0 importadores nas duas. |
| 53 | `micro-interactions/skeletons.tsx` | sim | EST | Formatação; 0 importadores. |
| 54 | `mobile-components.tsx` | sim | A11Y/EST | V2: `showTooltip={false}` no botão fechar do drawer, cor `--primary-text` no item ativo (contraste), `z-50` vs `z-[100]`. V3: `type="button"` nos itens da navegação inferior. 1 importador cada. |
| 55 | `motion/__tests__/variants.test.ts` | **não** | SÓ-V3 | Teste das variantes (V2 não tem). B: workertestes pode copiar (U2-21). |
| 56 | `motion/components.tsx` | sim | EST | V3 `MotionCard` com `shadow-none`, V2 `hover:shadow-glow-primary`; V2 importa `AnimatePresence/Variants` a mais; formatação. |
| 57 | `motion/effects.tsx` | sim | ROB | V3 `AnimatedCounter` usa `useRef`; V2 `const prevRef = { current: 0 }` (objeto novo a cada render: sempre anima do 0). 0 importadores externos. Ver U2-07. |
| 58 | `motion/index.ts` | **não** | SÓ-V3 | Barril canônico + passthrough de framer-motion. V2 usa `motion.tsx` e importa `framer-motion` direto em ~20 arquivos. Ver U2-17 (MotionConfig). |
| 59 | `motion/variants.ts` | sim | VAR | V2 tem `talkxFadeUp/ScaleIn/Float/Stagger` (Talk X). V3 testa as variantes (`motion/__tests__/variants.test.ts`). |
| 60 | `offline-indicator.tsx` | sim | ROB/A11Y | V3: timer com cleanup e `type="button"` no "Tentar novamente"; V2 `setTimeout` solto. JÁ-COBERTO:UI-04c (type=button é extra, B). |
| 61 | `pagination.tsx` | sim | A11Y/i18n | Textos em inglês na V2 ("Go to previous page", "Previous", "Next", "More pages"). JÁ-COBERTO:UI-03. Zero importadores nas duas. |
| 62 | `phone-input.tsx` | **não** | SÓ-V3 | LACUNA — JÁ-COBERTO:UI-07. |
| 63 | `popover.tsx` | sim | COMP | V2 exporta `PopoverAnchor` (usado nos controles de volume). **V2-MELHOR**. Resto estilo. |
| 64 | `progress.tsx` | sim | A11Y | V2 repassa `value` ao Root do Radix (`aria-valuenow` correto); a V3 não repassa. **V2-MELHOR**. Cor da trilha `bg-secondary` vs `bg-accent`. |
| 65 | `prompt-kit/PromptActions.tsx` | **não** | SÓ-V3 | Órfão. Não portar. |
| 66 | `prompt-kit/PromptInput.tsx` | **não** | SÓ-V3 | Órfão. Não portar. |
| 67 | `prompt-kit/PromptSuggestion.tsx` | **não** | SÓ-V3 | Órfão. Não portar. |
| 68 | `prompt-kit/index.ts` | **não** | SÓ-V3 | Órfão. Não portar. |
| 69 | `quick-peek.tsx` | sim | ROB | V3: timer em `useRef` + limpeza ao desmontar; V2 guarda o timer em `useState` (sem limpeza, estado "velho" entre eventos). Ver U2-08. Uso na lista = UI-06. |
| 70 | `radio-group.tsx` | sim | EQUIVALENTE | Só JSDoc de ruído na V3. Conferido, sem diferença de comportamento. |
| 71 | `registry.json` | **não** | SÓ-V3 | Fora de escopo (página /design-system + registry). |
| 72 | `resizable.tsx` | sim | COMP/DEP | V3 usa API da `react-resizable-panels` v4 (`Group/Panel/Separator`); V2 usa v2.1 (`PanelGroup/PanelResizeHandle`). Zero importadores nas duas. MORTO (U2-16). |
| 73 | `route-loading-bar.tsx` | sim | EST | Brilho da ponta (V3 `w-12 bg-primary/20`, V2 gradiente `w-24`). Import direto de `framer-motion` na V2 vs barril. Nenhuma das duas usa `role="progressbar"`/`aria-hidden`; 1 importador cada. |
| 74 | `scroll-area.tsx` | sim | EST | Cor do polegar (V3 `bg-accent/50`, V2 `bg-border`). Estilo. |
| 75 | `scroll-fade.tsx` | **não** | SÓ-V3 | Fora de escopo (scroll-fade, decisão do dono). |
| 76 | `scroll-to-top.tsx` | sim | VAR | V3 exporta o hook `useScrollToTop` (0 importadores) e tipa `RefObject<HTMLElement>`; V2 aceita `HTMLElement | null` (correto com React 19). MORTO o hook. |
| 77 | `section-error-boundary.tsx` | sim | COMP | V2 reporta ao coletor (`reportClientError`, seção + pilha); V3 só `getLogger`. **V2-MELHOR**. UI-01 trata o uso por seção. |
| 78 | `select.tsx` | sim | EST | Gatilho: V3 `rounded-xl ring-1 ring-primary`; V2 `rounded-md ring-2 ring-ring ring-offset-2` e `border-input`. Separador `bg-border` vs `bg-muted`. |
| 79 | `separator.tsx` | sim | EQUIVALENTE | Só JSDoc de ruído na V3. Conferido, sem diferença de comportamento. |
| 80 | `sheet.tsx` | sim | A11Y/i18n | sr-only "Fechar" (V3) vs "Close" (V2). JÁ-COBERTO:UI-03. Overlay `/95` vs `/80`. |
| 81 | `sidebar.tsx` | sim | EQUIVALENTE | Só JSDoc de ruído na V3. Conferido, sem diferença de comportamento. |
| 82 | `sidebar/index.ts` | sim | EQUIVALENTE | Só JSDoc de ruído na V3. Conferido, sem diferença de comportamento. |
| 83 | `sidebar/sidebar-context.tsx` | sim | IMP | Path do hook `use-mobile`; V3 só JSDoc a mais. |
| 84 | `sidebar/sidebar-menu.tsx` | sim | SEG | V2 usa `secureRandomFloat` no esqueleto; V3 `Math.random`. **V2-MELHOR**. |
| 85 | `sidebar/sidebar-primitives.tsx` | sim | A11Y/i18n | "Alternar barra lateral" (V3) vs "Toggle Sidebar" (V2) — JÁ-COBERTO:UI-03. V3 `type="button"` no trilho; V2 `tabIndex={-1}` (padrão shadcn, ok). |
| 86 | `skeleton.tsx` | sim | A11Y/VAR | **V2 PIOR em a11y**: todo `Skeleton` tem `role="status" aria-label="Loading..."` (258 usos). **V2-MELHOR** em variantes (`variant`, `speed`, `SkeletonList/Avatar/Button`). Ver U2-01. |
| 87 | `skip-link.tsx` | sim | A11Y | V3: `tabindex=-1` no alvo (UI-04b), cleanup do timer (UI-04c), MutationObserver no `body` inteiro, devolve `null` sem alvos. V2: intervalo de 1,5 s, `<nav>` vazio sem alvos. Ver U2-12. |
| 88 | `slider.tsx` | sim | A11Y/VAR | **V2-MELHOR**: `thumbLabel` (nome acessível por thumb), um thumb por valor (faixa), orientação vertical, trilha com contraste. V3 simples, um só thumb sem nome. |
| 89 | `sonner.tsx` | sim | EST | V2 liga `richColors` e usa fundo `/10` + texto colorido com blur; V3 cor sólida com foreground (comentário cita WCAG AA). Contraste da V2 conferido nos tokens (verde `160 70% 27%` no claro, `142 71% 45%` no escuro): passa. Estilo. |
| 90 | `sparkline.tsx` | sim | A11Y | V3 SVG `aria-hidden` (decorativo). JÁ-COBERTO:UI-04e. |
| 91 | `step-progress.tsx` | sim | EST | Tokens `text-3xs/2xs` da V2 vs px fixos. 1 importador cada. Sem diferença funcional. |
| 92 | `stories/AIChatResponseCard.stories.tsx` | **não** | SÓ-V3 | Storybook sem `.storybook` na V3. Não portar. |
| 93 | `stories/AudioTranscription.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 94 | `stories/Bubble.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 95 | `stories/Button.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 96 | `stories/Card.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 97 | `stories/Input.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 98 | `stories/Introduction.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 99 | `stories/Link.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 100 | `stories/Message.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 101 | `stories/dialog.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 102 | `stories/select.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 103 | `stories/textarea.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 104 | `stories/tooltip.stories.tsx` | **não** | SÓ-V3 | Storybook. Não portar. |
| 105 | `supabase-connectivity-banner.tsx` | **não** | SÓ-V3 | LACUNA — JÁ-COBERTO:UI-05a/05b. |
| 106 | `switch.tsx` | sim | A11Y/EST | V3: foco `ring-1 ring-primary`, trilha desligada `bg-accent`. V2: `ring-2 ring-ring ring-offset-2`, `bg-input`. Foco da V2 mais visível (WCAG 2.4.7/1.4.11). **V2-MELHOR**. |
| 107 | `table.tsx` | sim | A11Y | V3: `TableHead` com `scope="col"` por padrão. JÁ-COBERTO:UI-04d. Cores de linha/hover: V3 `bg-accent`, V2 `bg-muted/40`. |
| 108 | `tabs.tsx` | sim | ROB/EST | V3 `TabsList` com `flex-wrap h-auto min-h-10 w-full` e gatilho `whitespace-normal break-words`; V2 `h-10` fixo e `whitespace-nowrap`. Aba ativa: V3 `bg-background`, V2 `bg-primary`. Ver U2-05. |
| 109 | `textarea.tsx` | sim | EST | V3 `rounded-xl`, foco `ring-1`/borda primária; V2 `rounded-md ring-2 ring-ring`. Sem diferença de props. |
| 110 | `toast.tsx` | sim | A11Y/i18n | V3: `aria-label="Fechar"` no botão de fechar do toast (V2 sem nome acessível). JÁ-COBERTO:UI-03. Foco do destrutivo: V3 tokens, V2 cores fixas (`red-400/600`). Sombra. |
| 111 | `toaster.tsx` | sim | IMP | Import do hook e cast de tipo (V3). Sem efeito. |
| 112 | `toggle-group.tsx` | sim | DES | V3 memoiza o valor do contexto (`useMemo`). Ver U2-13. |
| 113 | `toggle.tsx` | sim | EQUIVALENTE | Só JSDoc de ruído na V3. Conferido, sem diferença de comportamento. |
| 114 | `tooltip.tsx` | sim | ROB | **V2-MELHOR**: `TooltipContent` e o conteúdo rico dentro de `TooltipPrimitive.Portal` (corrige corte por ancestral com overflow, ex. linha da lista de conversas). V3 sem Portal. Glow do `neon` via token na V2. |
| 115 | `use-toast.ts` | sim | IMP | Só o caminho de import do hook (`@/hooks/use-toast` vs `@/hooks/ui/use-toast`). Estrutura da V2. |
| 116 | `visually-hidden.tsx` | sim | ROB | `LiveRegion`/anúncio: V3 guarda o timer em ref e limpa ao desmontar; V2 `setTimeout` solto. JÁ-COBERTO:UI-04c. |

### 3.2 Só na V2 (21 arquivos)

| # | Arquivo | Observação |
|---|---|---|
| 1 | `VolumeDial.tsx` | Só V2 (plano de volume). Fora da V3. |
| 2 | `VolumeSliderPopoverContent.tsx` | Só V2. Usa `Slider` vertical + `PopoverAnchor`. |
| 3 | `VolumeTriggerButton.tsx` | Só V2. |
| 4 | `__tests__/EmptyState.test.tsx` | Teste V2. |
| 5 | `__tests__/VolumeDial.test.tsx` | Teste V2. |
| 6 | `__tests__/VolumeSliderPopoverContent.test.tsx` | Teste V2. |
| 7 | `__tests__/VolumeTriggerButton.test.tsx` | Teste V2. |
| 8 | `__tests__/accessible-toast.test.tsx` | Teste V2. |
| 9 | `__tests__/card.test.tsx` | Teste V2. |
| 10 | `__tests__/command-palette-acoes.test.tsx` | Teste V2. |
| 11 | `__tests__/command-palette.busca-antiga.test.tsx` | Teste V2 (resposta antiga da busca). |
| 12 | `__tests__/command-palette.test.tsx` | Teste V2. |
| 13 | `__tests__/emoji-picker.test.tsx` | Teste V2. |
| 14 | `__tests__/liquid-metal-button.test.tsx` | Teste V2. |
| 15 | `__tests__/progress.test.tsx` | Teste V2. |
| 16 | `__tests__/skip-link.a11y.test.tsx` | Teste V2 (axe). |
| 17 | `__tests__/skip-link.test.tsx` | Teste V2. |
| 18 | `__tests__/slider.test.tsx` | Teste V2. |
| 19 | `drawer.tsx` | Só V2 (vaul 1.1). 2 importadores. A V3 não tem `drawer.tsx`. |
| 20 | `liquid-metal-button.tsx` | Só V2. |
| 21 | `motion.tsx` | Barril de movimento da V2 (23 importadores); equivalente a `motion/index.ts` da V3, mas sem os hooks reexportados. |

## 4. Achados novos (não repetem UI-01..UI-10)

Formato: Id, classe, severidade, evidência V3 / V2, efeito, correção, perfil, critério de pronto. Caminhos relativos a `src/components/ui/` (V3 em `~/projetos/Zapp_Web_V3`, V2 em `~/hermes-workspaces/Zapp_Web_V2/.integrador`).

### U2-01 Todo `Skeleton` vira região viva em inglês
- Classe: MELHORIA (a V2 é pior que a V3). Severidade: **M**. a11y.
- V3: `skeleton.tsx` renderiza `<div>` puro, sem papel. V2: `skeleton.tsx:53-54` `role="status" aria-label="Loading..."`. Uso real na V2: 258 `<Skeleton` em 66 arquivos (`grep -rn "<Skeleton"`).
- Efeito: ao abrir lista, painel ou conversa, o leitor de tela anuncia "Loading..." dezenas de vezes, em inglês, num produto pt-BR. Piora para quem usa teclado + leitor.
- Correção: remover `role`/`aria-label` do `Skeleton` base (decorativo, `aria-hidden="true"`). Quem monta um bloco de carregamento declara UMA região `role="status" aria-busy="true"` com `<span className="sr-only">Carregando…</span>`. Criar esse wrapper em `SkeletonList`/`SkeletonCard` (ou novo `SkeletonRegion`) e usá-lo nas telas principais (inbox, contatos, dashboard).
- Perfil: iris. Pronto: teste que renderiza 5 `Skeleton` e espera 0 elementos `role=status`; teste do wrapper com 1 `role=status` nomeado em pt-BR; `axe` sem aviso nas telas de carregamento.

### U2-02 Paleta de comandos: campo e botão sem nome, seleção por setas não é anunciada
- Classe: LACUNA (parcial) + MELHORIA (ambas). Severidade: **M**. a11y.
- V3: `command-palette.tsx:177` `aria-label={placeholder}` no campo e `:187` `aria-label="Limpar busca"`, `type="button"`. V2: `command-palette.tsx` campo sem `aria-label` (só placeholder), botão X sem nome (`grep -n "aria-" command-palette.tsx` devolve só o `aria-describedby`). Nas duas, a lista é `<button>` solto: sem `role="combobox"`, `listbox`, `option`, `aria-selected` nem `aria-activedescendant`. O realce por seta é só visual (`gi === selectedIndex ? 'bg-muted'`).
- Efeito: leitor de tela não sabe qual comando está selecionado nem anuncia "N resultados"; o botão "Limpar" é lido como "botão".
- Correção: (1) `aria-label` no campo e "Limpar busca" no X (portar da V3); (2) campo `role="combobox" aria-expanded aria-controls={listId} aria-activedescendant={idDoSelecionado}`; contêiner `role="listbox"`; cada item `role="option" id aria-selected`; (3) região `aria-live="polite"` sr-only com "N resultados". Manter o `searchSeqRef` (V2-MELHOR).
- Perfil: iris. Pronto: teste com Testing Library: `getByRole('combobox')`, ArrowDown muda `aria-activedescendant`, `getAllByRole('option')`, "Limpar busca" por nome; teste existente `command-palette.busca-antiga` continua verde.

### U2-03 Barra rápida de reações inacessível por teclado e texto "reaçãoões"
- Classe: LACUNA. Severidade: **M**. a11y/bug de texto.
- V3: `message-reactions.tsx` `QuickReactionStrip` com `opacity-0 group-focus-within/msg:opacity-100 group-hover/msg:opacity-100`, `aria-pressed={hasReacted(emoji)}` por emoji e `forceShow`. V2: `message-reactions.tsx:158-163` `opacity-0 group-hover/msg:opacity-100 ... pointer-events-none group-hover/msg:pointer-events-auto`, sem `focus-within`; botões sem `aria-pressed`. Rótulo do badge `:39` `reação${count !== 1 ? 'ões' : ''}` gera "reaçãoões" (conferido com `node`; o teste da V2 já admite o defeito em comentário).
- Efeito: quem navega por teclado (ou toque em tablet sem hover) chega a botões invisíveis e `pointer-events-none`, ou nunca os vê; o plural errado é lido em voz alta.
- Correção: adicionar `group-focus-within/msg:opacity-100 group-focus-within/msg:pointer-events-auto` na barra e `focus-visible:ring`; corrigir o plural (`count === 1 ? 'reação' : 'reações'`); aceitar `hasReacted` opcional e `aria-pressed` por emoji no strip e no picker. Tooltip de quem reagiu e teste adicional = UI-10 (JÁ-COBERTO:UI-10 só para esses dois).
- Perfil: iris. Pronto: teste: focar um botão da barra (Tab) torna a barra visível (`opacity-100` via classe focus-within); `getByRole('button',{name:'👍 3 reações'})`; sem "ãoõ".

### U2-04 `Button` em carregamento sem `aria-busy`
- Classe: MELHORIA. Severidade: B. a11y.
- V3: `button.tsx:61` `aria-busy={isLoading || undefined}` (também no `MotionButton`). V2: `button.tsx:58-66` e `:97-105` só `disabled`, e o `Loader2` não é `aria-hidden`.
- Efeito: leitor de tela não percebe que a ação está em andamento; o ícone girando é lido.
- Correção: `aria-busy={isLoading || undefined}` nos dois botões e `aria-hidden="true"` no `Loader2`. Pronto: teste `isLoading` ⇒ `toHaveAttribute('aria-busy','true')`. Perfil: iris.

### U2-05 Texto longo em `Badge`, `Tabs` e `Card`
- Classe: MELHORIA. Severidade: B. robustez.
- V3: `badge.tsx:7` `whitespace-normal break-words max-w-full overflow-hidden`; `tabs.tsx:15,30` `TabsList` `h-auto min-h-10 flex-wrap` e gatilho `whitespace-normal break-words`; `card.tsx:6` `break-words max-w-full`; `input.tsx` `max-w-full`. V2: `badge.tsx:7` sem proteção; `tabs.tsx:15` `h-10` fixo e `whitespace-nowrap`.
- Efeito: com rótulos longos em pt-BR (ex. nomes de fila, filtro) ou 360 px de largura, a V2 estoura a barra de abas e o selo. 47 arquivos usam `Tabs`.
- Correção: portar para a V2 `max-w-full break-words` no `Badge`, `h-auto min-h-10 flex-wrap` no `TabsList` (sem o `w-full` da V3, para não mudar o layout) e `min-w-0`/`break-words` no `Card`. NÃO portar o `overflow-hidden` do Card (cortaria menus/sombras internos). Perfil: designer (decide) + iris. Pronto: teste visual (Playwright) com rótulo de 60 caracteres sem rolagem horizontal em 360 px.

### U2-06 `Label` colado em duas linhas
- Classe: MELHORIA. Severidade: B. V3: `label.tsx:7` `leading-normal break-words`; V2: `leading-none`. Rótulo de 2 linhas na V2 fica sem respiro. Correção: `leading-normal break-words` (a V2 usa `Label` em muitos formulários; conferir regressão de altura). Perfil: iris. Pronto: snapshot do formulário de contato.

### U2-07 `AnimatedCounter` anima sempre do zero
- Classe: MORTO (bug latente). Severidade: B. V3: `motion/effects.tsx:15` `const prevRef = useRef(0)`. V2: `motion/effects.tsx:10` `const prevRef = { current: 0 }` (objeto novo a cada render). 0 importadores fora de `ui/motion` nas duas (`grep -rn AnimatedCounter`). Correção: `useRef(0)` ou apagar o componente. Perfil: iris. Pronto: teste do contador subindo de 10 a 20 sem passar por 0, ou arquivo removido.

### U2-08 Timers sem limpeza além dos do UI-04
- Classe: MELHORIA. Severidade: B. robustez.
- UI-04c cobre `offline-indicator`, `visually-hidden`, `skip-link`. Faltam: `quick-peek.tsx:30-42` (V2 guarda o timer em `useState`; um `mouseenter` rápido seguido de `mouseleave` usa o valor do render anterior e pode abrir o peek depois de sair; sem cleanup ao desmontar; V3 usa `useRef` + `useEffect` de limpeza, `quick-peek.tsx:30-50`), `micro-interactions/buttons.tsx` (V3 limpa os ripples, V2 não; 0 importadores) e `accessible-toast.tsx:84` `window.setTimeout` de remoção sem cleanup (V2).
- Efeito: o `quick-peek` vai ser ligado à lista de conversas pelo UI-06; com o defeito, o painel abre fantasma ao passar o mouse rápido entre linhas.
- Correção: port do `useRef` + `useEffect` de limpeza da V3 no `quick-peek` (JUNTO do cartão UI-06, que consome o componente) e nos ripples; guardar os ids de remoção do toast num `Set` limpo no unmount. Perfil: iris. Pronto: teste com `vi.useFakeTimers`: enter+leave antes do delay não abre; desmontar com timer ativo não deixa timer pendente.

### U2-09 Contexto do `accessible-toast` recriado a cada render
- Classe: MELHORIA. Severidade: B. desempenho. V3: `accessible-toast.tsx` `useMemo` no valor do contexto; V2: `value={{ toasts, addToast, removeToast, updateToast }}` novo a cada render do provedor. Efeito: todo consumidor re-renderiza a cada mudança de lista (e em renders do pai). Correção: `useMemo`. Perfil: iris. Pronto: teste de contagem de renders de um consumidor ao rerender do pai = 0 extras.

### U2-10 `emoji-picker` com nomes acessíveis só por `title` e `localStorage` sem proteção
- Classe: MELHORIA. Severidade: B. a11y/robustez.
- V3: `aria-label="Abrir seletor de emoji"`, `aria-label` nas categorias e em "Recentes" (`emoji-picker.tsx`), `type="button"`, `safeGetJSON/safeSetJSON`. V2: `emoji-picker.tsx:117-139` categorias só com `title`, 3 `<button>` sem `type`, `:64` `localStorage.setItem` sem `try/catch` (a leitura tem). V2-MELHOR: largura `w-[min(340px,calc(100vw-1rem))]`. Usado em `TalkXMessageEditor` (1 importador).
- Efeito: leitor de tela não anuncia a categoria; modo privado/cota cheia lança exceção no clique do emoji; botão sem `type` envia formulário se o picker for colocado dentro de um `<form>`.
- Correção: `aria-label` nas categorias, `type="button"`, trocar o storage direto por `safeSetJSON('RECENT_KEY', ...)`. Perfil: iris. Pronto: `emoji-picker.test.tsx` com `localStorage.setItem` lançando: clicar no emoji não propaga erro.

### U2-11 `SkipLink`: `<nav>` vazio quando não há alvo
- Classe: MELHORIA. Severidade: B. a11y. V3: `skip-link.tsx` `if (visible.length === 0) return null`. V2: renderiza o `<nav aria-label="Links de navegação rápida" role="navigation">` mesmo sem nenhum alvo (ex. tela de login), criando um marco vazio (e `role` redundante). O `MutationObserver` em `document.body` com `subtree` da V3 NÃO deve ser portado (roda `querySelector` x4 a cada mutação do DOM do chat); a V2 usa intervalo de 1,5 s, que é mais barato. Correção: devolver `null` quando `availableTargets.size === 0`; tirar o `role`. Perfil: iris. Pronto: `skip-link.a11y.test.tsx` sem marco `navigation` na rota /auth.

### U2-12 `sonner` conferido, sem diferença relevante
- Classe: EQUIVALENTE. V3 cores sólidas; V2 `richColors` com fundo `/10` e texto colorido. Contraste conferido nos tokens da V2 (`styles/tokens.css:145` verde `160 70% 27%` no claro; `:465` `142 71% 45%` no escuro sobre fundo escuro): passa em AA. Sem ação.

### U2-13 Valor de contexto de `ToggleGroup` e `Form*` sem `useMemo`
- Classe: MELHORIA. Severidade: B. desempenho. V3: `toggle-group.tsx:16-20`, `form.tsx:26,66` memoizam; V2 cria objeto novo a cada render. `ToggleGroup` tem 6 importadores na V2; `Form` 0 (UI-14). Correção: `useMemo` no `ToggleGroup` (e no `Form` se um dia for usado, junto com `role="alert" aria-live="polite"` do `FormMessage`). Perfil: iris. Pronto: teste de render único dos itens.

### U2-14 Tooltip do gráfico esconde o valor 0 e usa chaves instáveis
- Classe: LACUNA. Severidade: **M**. comportamento/robustez.
- V3: `chart.tsx:213-215` `item.value !== undefined && item.value !== null`, `key={item.dataKey ?? item.name ?? index}`, `itemPayload?.fill` com guarda, tipos oficiais do recharts. V2: `chart.tsx:211` `{item.value && (...)}` (zero some do tooltip, parecendo "sem dado"), `:171` `key={item.dataKey}` (colide ou fica `undefined` em Pie/Radar), `:165` `item.payload.fill` sem guarda (quebra se `payload` for `undefined`), legenda `key={item.value}`. UI-02 só trata o saneamento de CSS.
- Efeito: `AIStatsWidget` (único uso na V2: `components/dashboard/AIStatsWidget.tsx:202`) mostra tooltip sem o valor "0" e pode lançar erro em série sem `payload`.
- Correção: no mesmo cartão do UI-02 (mesmo arquivo), trocar a condição do valor, as chaves e o `?.`, e tirar os `as any`. Perfil: iris. Pronto: teste do `ChartTooltipContent` com `value: 0` exibindo "0" e com `payload` ausente sem exceção.

### U2-15 `calendar.tsx` escrito para a versão que cada app tem
- Classe: DECISÃO. Severidade: B. V3 usa react-day-picker `^10.0.1` (`month_caption`, `Chevron`, `autoFocus`, shim `initialFocus`); V2 `^8.10.2` (`caption`, `IconLeft`). 8 importadores na V2. Copiar o arquivo sem atualizar a dependência quebra o layout. Se o Joaquim quiser subir a versão: cartão próprio (dependência, os 8 usos, `Calendar` e testes visuais). Sem recomendação urgente. Perfil se aprovado: iris + workertestes.

### U2-16 `resizable.tsx` e outros sem importador
- Classe: MORTO. Severidade: B. `resizable` (V3 com API v4 de `react-resizable-panels`, V2 com v2.1), `pagination`, `hover-card`, `menubar`, `form`, `input-otp`, `carousel` têm 0 importadores nas duas. Não portar nada; a V2 pode apagar os que não pretende usar (reduz superfície, tamanho e manutenção). Perfil: iris (limpeza), opcional.

### U2-17 Movimento reduzido nas animações do `framer-motion`
- Classe: MELHORIA. Severidade: **M**. a11y (WCAG 2.3.3).
- V3: `motion/index.ts` é a porta única (reexporta `framer-motion`, `useReducedMotion` etc.); só 7 arquivos importam `framer-motion` direto. V2: 350 arquivos `.tsx` importam `framer-motion` direto e só `contacts/ContactsView.tsx:122` envolve a árvore em `<MotionConfig reducedMotion="user">`. Os `@media (prefers-reduced-motion)` de `styles/utilities.css:182,200` não afetam animações do framer (são JS). 67 arquivos usam `useReducedMotion`.
- Efeito: quem pede "reduzir movimento" no sistema ainda vê as animações de página, listas, modais, empty states em ~340 arquivos.
- Correção: um único `<MotionConfig reducedMotion="user">` no provedor raiz (`AppProviders`), uma linha, cobre todos. A V3 não faz isso também (V2 já está à frente com 67 arquivos); logo é melhoria nas duas. Opcional: mover os imports para `@/components/ui/motion` (barril V2, que deve reexportar os hooks que faltam) em refatoração futura. Perfil: iris. Pronto: teste de render com `MotionConfig` no topo e `useReducedMotion` verdadeiro; verificação visual com `prefers-reduced-motion: reduce` (Playwright `reducedMotion: 'reduce'`) sem transformação nos modais.

### U2-18 Tema "plano" da V3 contra o da V2 (decisão de design)
- Classe: DECISÃO. Severidade: B. estilo. Diferenças sistemáticas em todos os primitivos: V3 `shadow-none`, superfícies `bg-background border-border`, realce de item de menu `bg-primary/20 text-primary`, foco `ring-1 ring-primary`, overlays `/90-/95`, `Input` com variante padrão sóbria. V2 `shadow-lg/md`, `bg-popover`, realce `bg-accent`, foco `ring-2 ring-ring ring-offset-2`, overlay `/60 blur`, `Input` com padrão `glow`. **Recomendação: manter a V2** em foco (anel de 2 px com offset passa melhor em WCAG 2.4.7/1.4.11, e a borda da checkbox/switch da V3 em `border-border` é fraca) e sombras. Se o designer quiser a linguagem plana: um cartão `designer` que troque os tokens de uma vez, não arquivo a arquivo. O `Input` padrão `glow` merece conferência com o designer (anel de 4 px em todo campo).

### U2-19 Variantes de `Badge` e `size="xs"` do `EmptyState` só na V3
- Classe: MELHORIA (opcional). Severidade: B. V3 tem `Badge variant="whatsapp"` e `glowPurple` (1 uso na V3, 0 na V2) e `EmptyState size="xs"` (V2 não). Só portar se uma tela da V2 precisar; sem cartão por enquanto.

### U2-20 Ilustrações de estado vazio sem `aria-hidden` e código morto na V2
- Classe: MELHORIA + MORTO. Severidade: B. V3: as 15 ilustrações de `empty-state-illustrations.tsx` abrem com `<svg ... aria-hidden="true">`. V2: sem `aria-hidden`, e `empty-state.tsx` (11 importadores) as renderiza como estão (conferido: `grep aria-hidden empty-state.tsx` vazio). `empty-states.tsx` da V2 tem 0 importadores (181 linhas) e duplica o `EmptyState`. Correção: `aria-hidden="true"` e `focusable="false"` em cada SVG decorativo (ou no contêiner no `empty-state.tsx`); apagar `empty-states.tsx` e o contexto `tags` se existir. Perfil: iris. Pronto: `axe` nas telas com estado vazio sem `svg-img-alt`/nós sem nome.

### U2-21 Teste das variantes de movimento
- Classe: MELHORIA. Severidade: B. V3 tem `motion/__tests__/variants.test.ts`; V2 não tem teste dos variantes (incluindo `talkxFadeUp/ScaleIn/Float/Stagger`). Perfil: workertestes. Pronto: teste de forma dos variantes (hidden/visible/exit).

## 5. Onde a V2 já está melhor (não devolver para a V3)

1. `tooltip` em `Portal` (não é cortado por ancestral com overflow).
2. `dialog` com `max-h` + rolagem na base (rodapé alcançável em 1280x720).
3. `slider` com `thumbLabel`, faixa (um thumb por valor) e vertical; `progress` repassa `value` ao Radix.
4. `button`/`card`: `MotionButton`/`MotionCard` em CSS com `motion-safe:`, sem `framer-motion` no caminho inicial (SL-103A); `CardTitle as`.
5. `command`/`command-palette`: `DialogTitle` oculto, `searchSeqRef`, acesso rápido navegável por setas, grupo Talk X, ação real em "Atalhos".
6. `error-boundary-retry` (erro de chunk), `section-error-boundary` (`reportClientError`).
7. `popover` com `PopoverAnchor`; `sidebar-menu` com `secureRandomFloat`.
8. `accessible-toast` respeita movimento reduzido; ids com `secureRandomChars`; montado nos provedores.
9. `checkbox`, `switch`, `select`, `textarea`: anel de foco de 2 px com offset (mais visível).
10. `skeleton`: variantes e `SkeletonList/Avatar/Button`. `empty-states/contextConfigs`: 12 contextos completos. Função de tags já removida nos arquivos de estado vazio.
11. `mobile-components`: `--primary-text` no item ativo, `showTooltip={false}` no botão do drawer.
12. `message-reactions`: tabindex itinerante e `role="toolbar"` no picker; teste de 17 casos.
13. 18 testes em `ui/` na V2 contra 3 na V3.

## 6. Código morto ou sem uso (para decidir, não para portar)

V3 e V2 sem importadores: `form`, `resizable`, `pagination`, `hover-card`, `menubar`, `input-otp`, `carousel`, `SkeletonList`, `EmptyState`, `micro-interactions/{buttons,feedback,skeletons}`, `AnimatedCounter` (fora de `ui/motion`), `useScrollToTop`. Só V2 sem uso: `empty-states.tsx`, `quick-peek` (UI-06 vai ligar). Só V3 sem uso: `UnifiedEmptyState`, `attachment`, `marker`, `prompt-kit/*`, 12 stories.

## 7. Cobertura e limites

- Li o diff completo de todos os 84 comuns, exceto: a metade final do diff de `message-reactions.tsx` (linhas de `MessageReactionBar` após o trigger; li o início, o picker e a barra rápida), a parte média de `empty-state-illustrations.tsx` (591 linhas de SVG; conferi só os pontos de `aria-hidden`, `tags` e `framer-motion` por busca) e o corpo de `motion/components.tsx` além de `MotionCard`/`MotionButton` (diferença é de formatação).
- Não li linha a linha o corpo dos testes V2-only e os dos stories (V3), nem rodei testes, tsc, build ou Playwright (ordem do BRIEF).
- Não medi contraste real de tema `neon`/`glow` nem renderizei telas; as notas de estilo vêm do diff.
- A fila `.v2-fila` foi consultada só por `buscar_corpo.py` (termos acima); não abri um a um os cartões que citam `Loading...`/`aria-busy` (CL1, SH3 são menções em planos antigos).

## 8. Proposta de agrupamento em cartões (sugestão, não criados)

| Id sugerido | Perfil | Itens |
|---|---|---|
| U2-A | iris | U2-01 (Skeleton + wrapper), U2-20 (aria-hidden das ilustrações) |
| U2-B | iris | U2-02 (paleta) |
| U2-C | iris | U2-03 + U2-04 (reações por teclado e plural; Button aria-busy) |
| U2-D | iris | U2-14 junto com UI-02 (mesmo `chart.tsx`) |
| U2-E | iris | U2-17 (`MotionConfig` raiz) |
| U2-F | iris | U2-08 junto com UI-06 (`quick-peek`) e U2-09, U2-10, U2-11, U2-13 |
| U2-G | designer | U2-05, U2-06, U2-18 (decisão de tema) |
| U2-H | workertestes | U2-21 e os critérios de pronto dos acima |
Decisões para o Joaquim: U2-15 (subir react-day-picker 8 para 10) e U2-18 (continuar com o tema com sombras e foco de 2 px).

