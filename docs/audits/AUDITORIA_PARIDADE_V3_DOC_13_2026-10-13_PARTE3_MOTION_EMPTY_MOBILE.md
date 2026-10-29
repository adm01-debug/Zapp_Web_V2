# Achados U3: motion, micro-interações, empty states, skeleton, mobile, emoji, chat primitivos, paleta e demais componentes de produto de `components/ui`

> Segunda passada, 13/10/2026. Somente leitura (grep, diff, sed). Nada foi executado (sem vitest, tsc, build).
> V3: `~/projetos/Zapp_Web_V3/src` (local, igual ao `origin/main`). V2: `~/hermes-workspaces/Zapp_Web_V2/.integrador/src` (branch `dia/*`).
> Método de diff: normalização (sem comentários, aspas, vírgulas/pontos e vírgulas finais, tokens em linhas) para separar estilo de comportamento; depois leitura do diff cru dos arquivos com diferença real. Importadores contados com grep por `@/components/ui/<nome>` fora de `ui/` e fora de testes.

## 0. Resumo (leia isto primeiro)

1. **O documento 13 da V3 está desatualizado em pontos que mudam a conclusão**: `motion.tsx` deprecated **já não existe na V3** (só `motion/index.ts`, 338 importadores); `UnifiedEmptyState` **não é órfão** (`empty-states.tsx` o reexporta e 4 telas importam `EmptyState` dali); `stories/` **tem `.storybook`** na V3 (17 arquivos stories/config); `phone-input` **não usa** `react-phone-number-input` (é máscara própria). Os achados A1–A9 abaixo foram avaliados contra o código real, não contra o texto do documento.
2. **A V2 sofre dos mesmos problemas A1, A2, A3, A5(não, sem stories), A9 e em alguns casos pior**: 3 sistemas de toast **montados ao mesmo tempo** (Radix `Toaster` + Sonner + `AccessibleToastProvider` sem nenhum consumidor); 4+ componentes de empty state, dois deles sem importador (833 linhas de código morto só em `EmptyState`/`empty-states`/`SkeletonList`/`hover-card`/`menubar`/`pagination`).
3. **A V2 é melhor** em: `Skeleton` (variantes shimmer/wave, `SkeletonList`, `SkeletonAvatar/Button`), movimento reduzido (113 arquivos com `useReducedMotion` contra 17 na V3), `lazyWithRetry`+`chunkReload` com teto de recargas, paleta sem comandos falsos, `Progress` com `aria-valuenow`, largura responsiva do `EmojiPicker`, 3 componentes de empty state por módulo que a V3 não tem (`ConversationEmptyState`, `TasksEmptyState`).
4. **Descobertas novas que a 1ª passada não pegou** (todas com evidência abaixo): (a) **o cartão UI-08 (`t_2bf96975`) manda recriar na V2 dois comandos que a V3 deixa mortos** e que a V2 removeu de propósito (R2-INF-033) — precisa ser reescrito antes de ser executado; (b) `EmojiPicker` da V2 grava `localStorage` sem `try/catch` e sem `type="button"`; (c) `aria-label` das reações da V2 sai "reaçãoões"; (d) `PhoneInput` da V3 estraga números internacionais (prefixa 55) — o cartão UI-07 diz o contrário; (e) `Skeleton` da V2 tem `role="status" aria-label="Loading..."` em inglês em cada bloco (64 arquivos); (f) `AnimatedCounter` da V2 reinicia a contagem a cada render (bug latente, 0 consumidores); (g) `MotionConfig reducedMotion="user"` só existe em `ContactsView`; as ilustrações de empty state têm loops infinitos de framer-motion que a regra CSS global não alcança; (h) `lazyWithRetry` da V3 tem a guarda de navegação do WebKit que o `chunkReload` da V2 não tem; (i) `UI-05a` descreve errado o hook da V3 e a sonda deve evitar a Edge `health` da V2 (consulta banco).
5. Itens de ação propostos: **U3-02, U3-07, U3-11, U3-13, U3-14, U3-15, U3-16, U3-19, U3-20** (valem cartão); o restante é decisão, baixa prioridade ou "sem ação".

## 1. Mapa da fatia (arquivo a arquivo)

Legenda de uso: importadores fora de `ui/` e de testes (V3 / V2). "=": conteúdo funcionalmente igual (só tokens, JSDoc, ordem de classes e `framer-motion` → `@/components/ui/motion`).

| Arquivo | V3 linhas | V2 linhas | Uso V3 / V2 | Veredito |
|---|---|---|---|---|
| `motion/variants.ts` | 79 | 83 | via barril / 1 direto (`talkxScaleIn`) | = ; V2 tem 4 variantes `talkx*` (3 sem uso) |
| `motion/components.tsx` | 270 | 127 | via barril | = (V3 só reformatou; `MotionCard` V3 sem glow de hover, estilo) |
| `motion/effects.tsx` | 258 | 94 | via barril | **diferença real**: `AnimatedCounter` (U3-03) |
| `motion/index.ts` | 70 | ausente | 338 arquivos importam `@/components/ui/motion` | só V3; V2 tem `motion.tsx` (22 importadores) |
| `micro-interactions/buttons.tsx` | 381 | 284 | 1 / 1 (`Auth.tsx`, só `RippleButton`) | V3 limpa timers do ripple (U3-06) |
| `micro-interactions/feedback.tsx`, `skeletons.tsx` | 127, 138 | 83, 106 | 0 / 0 | = ; mortos nos dois |
| `EmptyState.tsx` | 198 | 188 | 0 / 0 | morto nos dois (V3 adiciona preset `pipeline`; V2 removeu de propósito, E12) |
| `GenericEmptyState.tsx` | 73 | 84 | 22 / 4 | = (V3 mais "chamativo": badge animado e sombra) |
| `empty-state.tsx` | 156 | 143 | 2 (+4 via barril) / 11 | V3 acrescenta tamanho `xs`; resto = |
| `empty-state-illustrations.tsx` | 604 | 157 | 0 direto (usado por `empty-state.tsx`) / idem | mesmas 13 ilustrações; V3 põe `aria-hidden` em todas (14), V2 em nenhuma (U3-10) |
| `UnifiedEmptyState.tsx` | 498 | ausente | 4 via `empty-states.tsx` | **não órfão na V3** (U3-08) |
| `empty-states.tsx` | 20 | 181 | 4 / 0 | V3 = reexport; V2 = implementação própria **sem importador** |
| `empty-states/*` (3 + `index.ts`) | 183+46+85+58 | 86+33+110 (sem `index.ts`) | 2 (`contextual-empty-states`) / 1 | V2 usa só `AgentsEmptyState` |
| `contextual-empty-states.tsx` | 16 | 15 | 2 / 1 | = (V3 inclui `TagsEmptyState`, fora de escopo) |
| `SkeletonList.tsx` | 153 | 149 | 0 / 0 | morto nos dois |
| `skeleton.tsx` | 43 | 139 | 103 / 64 | **V2-MELHOR** em recursos; pior em a11y (U3-11) |
| `calendar.tsx` | 80 | 54 | 6 / 9 | V3 em react-day-picker 10 (API v9+), V2 em 8.10.2 (U3-12) |
| `mobile-components.tsx` | 257 | 263 | 1 / 1 (`BottomNavigation` no `MobileShell`) | = |
| `icon-button.tsx` | 154 | 151 | 1 / 1 (`MobileDrawerMenu`) | = |
| `emoji-picker.tsx` | 365 | 332 | 1 / 1 + 3 usos de `EmojiPicker` | **diferenças reais** (U3-13) |
| `chat-shimmer.tsx` | 39 | ausente | 4 | JÁ-COBERTO:CL1 (U3-17) |
| `bubble`, `message`, `marker`, `attachment`, `chat/index.ts` | 32, 41, 26, 88, 16 | ausentes | `bubble` 4 atrás da flag `chat_bubble_v2` (=false por padrão); os demais 0 | MORTO / não portar (U3-17) |
| `prompt-kit/*` | 4 arquivos | ausente | 0 (só teste) | MORTO |
| `message-reactions.tsx` | 374 | 184 | 4 / 3 | ver U3-14 |
| `command-palette.tsx`, `command-palette-data.tsx` | 405, 79 | 246, 84 | 1 / 2 | ver U3-15 (UI-08) |
| `phone-input.tsx` | 120 | ausente | 1 | ver U3-16 (UI-07) |
| `supabase-connectivity-banner.tsx` | 106 | ausente | 1 | JÁ-COBERTO:UI-05a/b (ressalvas em U3-18) |
| `quick-peek.tsx` | 82 | 73 | 2 / 0 | JÁ-COBERTO:UI-06 (ressalva U3-18) |
| `offline-indicator.tsx` | 137 | 131 | 1 / 1 | V3 limpa o timer; JÁ-COBERTO:UI-04(c) |
| `progress.tsx` | 24 | 24 | 34 / 28 | **V2-MELHOR** (U3-21) |
| `sparkline.tsx`, `step-progress.tsx`, `route-loading-bar.tsx`, `scroll-to-top.tsx` | — | — | 2/1, 1/1, 1/1, 1/1 | = ; V3: `aria-hidden` no sparkline (UI-04e), `useScrollToTop` sem uso |
| `chart.tsx` | 370 | 305 | 1 / 1 | JÁ-COBERTO:UI-02 (resto = tipagem do tooltip) |
| `error-boundary-retry.tsx`, `section-error-boundary.tsx` | 140, 67 | 157, 71 | 1/1, 16/8 | V2-MELHOR (já em §6 da 1ª passada); UI-01 cobre a adoção |
| `sonner.tsx`, `toaster.tsx`, `toast.tsx`, `accessible-toast.tsx`, `use-toast.ts` | — | — | ver U3-09 | A3 |
| `virtualized*`, `lazy*` | — | — | não existem em `ui/` nos dois; equivalentes fora (`VirtualizedRealtimeList`, `lib/lazyWithRetry`) | ver U3-22 |

## 2. Achados

Legenda de perfis: iris = telas/componentes; hugo = hooks/estado; designer = visual; workertestes = testes.

### Motion e micro-interações

**U3-01 | MELHORIA | B | Ponto único de entrada de movimento (`ui/motion`)**
- V3: `src/components/ui/motion/index.ts:1-70` reexporta variantes, componentes e também `AnimatePresence`, `motion`, `LayoutGroup`, `useReducedMotion`, `useMotionValue`, `useTransform`, `useSpring`, `useScroll`, `useAnimation` e tipos. 338 arquivos importam daqui; só 6 importam `framer-motion` direto. O arquivo `motion.tsx` deprecated do documento (A4) foi removido.
- V2: `src/components/ui/motion.tsx` reexporta só `motion` e `AnimatePresence`; **356 arquivos** importam `framer-motion` direto (`grep -rlE "from ['\"]framer-motion['\"]" src | wc -l`) e 22 usam `@/components/ui/motion`. Não há `motion/index.ts`, logo **A4 não existe como ambiguidade na V2** (o arquivo vence o diretório, sem conflito).
- Efeito para o usuário: nenhum direto. Efeito de engenharia: não há ponto único para impor `MotionConfig`, `LazyMotion` ou lint.
- Proposta: **não migrar 356 arquivos** (risco sem ganho visível). Estender `motion.tsx` com `useReducedMotion`, `LayoutGroup` etc. e uma regra de lint `no-restricted-imports` só para arquivos **novos**. Decisão do dono; baixa prioridade.
- Perfil: iris. Pronto quando: `motion.tsx` exporta os hooks e um teste de importação passa.

**U3-02 | LACUNA | M | `MotionConfig reducedMotion="user"` na raiz e ilustrações de empty state com loops infinitos**
- Evidência V2: `grep -rn MotionConfig src` → só `components/contacts/ContactsView.tsx:122`. A regra CSS global (`styles/accessibility.css:75-82`, `index.css:53`) zera `animation-duration` de CSS, **mas não alcança animações JS do framer-motion**. As 13 ilustrações de `components/ui/empty-state-illustrations.tsx` têm `animate={{ y: [0,-8,0] }} transition={{ repeat: Infinity }}` (e rotação/escala) sem checar `useReducedMotion`. Mesmo cenário em `GenericEmptyState` (badge pulsando infinito).
- V3: mesma situação (0 `MotionConfig`); só 17 arquivos usam `useReducedMotion`. **A V2 está melhor que a V3 em movimento reduzido (113 arquivos), mas ainda deixa buracos exatamente nos elementos que nunca param.**
- Efeito: quem pediu "reduzir movimento" no sistema continua vendo ilustrações flutuando e girando para sempre (WCAG 2.2.2 e 2.3.3).
- Correção: envolver a árvore em `AppProviders.tsx` com `<MotionConfig reducedMotion="user">` (desliga transform/layout; mantém opacidade). Remover o `MotionConfig` local de `ContactsView` ou deixá-lo (inofensivo).
- Perfil: iris (+ workertestes). Pronto quando: teste monta `<EmptyState illustration="inbox">` com `matchMedia('(prefers-reduced-motion: reduce)')` verdadeiro e confirma que o `<g>` não recebe `animate` em transform (ou que `MotionConfig` está presente no provider; teste de contrato lendo `AppProviders`).

**U3-03 | MELHORIA | B | `AnimatedCounter` reinicia a contagem a cada render (bug latente)**
- V2: `src/components/ui/motion/effects.tsx:10`: `const prevRef = { current: 0 };` (objeto novo a cada render; o `useRef` foi esquecido). Qualquer re-render do pai durante a animação refaz a contagem a partir de 0 e `prevRef.current = value` (linha 25) nunca persiste.
- V3: `motion/effects.tsx:15` usa `useRef(0)`. Os dois ainda têm `key={displayValue}` em `motion.span`, que **remonta o elemento a cada tick** (flicker e custo), e nenhum respeita `prefers-reduced-motion`.
- Uso: 0 consumidores na V2 (`grep -rn AnimatedCounter src` só acha definição e barril) → latente. Correção de uma linha ou apagar o componente.
- Perfil: iris. Pronto quando: teste com `rerender` do mesmo `value` não reinicia o contador (`useRef`) e, com reduced-motion, mostra o valor final direto.

**U3-04 | EQUIVALENTE | B | Variantes `talkx*` só na V2**
- V2 `motion/variants.ts:60-83` (`talkxFadeUp`, `talkxScaleIn`, `talkxFloat`, `talkxStagger`). Só `talkxScaleIn` tem consumidor (`components/talkx/kit/dialogs.tsx:67`, já com guarda de movimento reduzido). Sem ação; os outros 3 podem sair numa limpeza.

**U3-05 | EQUIVALENTE | B | `MotionCard` / `MotionButton` / `StaggeredList` etc.**
- Diferença real única: V2 `MotionCard` tem `shadow-sm ... hover:shadow-glow-primary`; V3 `shadow-none` (visual "plano" da V3). Estilo, não comportamento. **Conferido, sem diferença funcional** em `PageTransition`, `NeonPageReveal`, `MotionFadeIn/SlideUp/Scale`, `MotionInteractive`, `SkeletonShimmer`, `Presence`, `SlideTransition`, `HoverScale`, `AnimatedList`, `Typewriter`, `AnimatedProgress`, `StaggerContainerEnhanced` (leitura do diff normalizado de `motion/components.tsx` e `motion/effects.tsx`).

**U3-06 | MELHORIA | B | Micro-interações: só `RippleButton` é usado; ripple sem limpeza**
- V3 `micro-interactions/buttons.tsx:51,79`: guarda os timers do ripple num `Set` em `useRef` e limpa ao desmontar. V2 `buttons.tsx:65`: `setTimeout(() => setRipples(...))` sem limpeza (React 18 não avisa; efeito prático nulo no `Auth`).
- Uso nos dois: 1 arquivo (`pages/Auth.tsx:7,177`) e só `RippleButton`. O resto (`feedback.tsx`, `skeletons.tsx`, `InteractiveIconButton`, `MagneticButton`, `GlowButton`, `PressFeedback`) é código morto nos dois (~470 linhas na V2). Há ainda um `RippleButton` duplicado e imperativo em `components/effects/ScrollEffects.tsx:252`.
- Proposta: sem cartão próprio. Se alguém tocar o arquivo, aplicar a limpeza de timers (3 linhas). A A9 da V3 ("poucos consumidores") vale igual na V2.

### Empty states (A1, A2, A7)

**U3-07 | MELHORIA | M | Consolidar empty states e apagar o morto (A1 vale igual na V2, com mais lixo)**
- V2 hoje: `ui/empty-state.tsx` (11 importadores: Conexões, Grupos, Transcrições, Carteira, Dashboard, 4 abas do inbox, Agentes), `ui/GenericEmptyState.tsx` (4: `FollowUpExecutionsHistory`, `DiagnosticsView`, `GmailInboxView`, `EmailThreadView`; **marcado `@deprecated` apontando para `ui/EmptyState`, que tem 0 importadores**), `ui/EmptyState.tsx` (188 linhas, 0 importadores; só um teste `__tests__/EmptyState.test.tsx` o mantém vivo), `ui/empty-states.tsx` (181 linhas com `EmptyState` + 7 `*EmptyState`, 0 importadores), `ui/empty-states/*` (usado só por `AgentsEmptyState`), `shared/ConversationEmptyState` (3), `contacts/ContactEmptyState`, `tasks/TasksEmptyState`. Total: **3 componentes exportando `EmptyState` + 5 outros**.
- V3 hoje: 5 sistemas, mas com um **superset funcional** (`UnifiedEmptyState`: `context`, `icon`, `illustration`, `action/actionLabel/onAction`, `compact`) que serve de fachada a 4 telas. A V3 resolveu sem querer (A2/A7 são riscos latentes de nome, não bugs ativos).
- Efeito para o usuário: telas com vazio em estilos diferentes (gradiente, sombra, ilustração, tipografia) e 166 arquivos com mensagem "Nenhum/Nenhuma…" escrita à mão contra apenas 28 que usam algum componente de empty state (`grep -rlE ">\s*Nenhum[a]? |'Nenhum[a]? " src --include=*.tsx`; V3: 161 e 30).
- Correção proposta (sem tela nova): (1) escolher `ui/empty-state.tsx` como canônico (já tem 11 usos, ilustração e tamanhos); acrescentar `size="xs"` da V3; (2) migrar os 4 usos de `GenericEmptyState` e apagar o arquivo; (3) apagar `EmptyState.tsx`, `empty-states.tsx` e o teste órfão `EmptyState.test.tsx`; (4) manter `ContextualEmptyState` só se `AgentsView` precisar de "ajuda"/terciária, senão migrar também; (5) corrigir o `@deprecated`. Sempre mantendo os testes de cada tela.
- Perfil: iris (+ workertestes para os testes). Pronto quando: `grep -rn "ui/(EmptyState|GenericEmptyState|empty-states)['\"]"` → 0; um único `export function EmptyState` em `ui/`; testes das 15 telas tocadas verdes.
- Relação: JÁ-COBERTO parcialmente por nenhum cartão (a 1ª passada marcou como "não portar"; aqui a proposta é limpar, não portar).

**U3-08 | MORTO/MELHORIA | B | Barril `empty-states.tsx` ao lado do diretório `empty-states/` (A2) e conflito de nome `EmptyState` (A7)**
- V3: `empty-states.tsx:1-20` reexporta de `./UnifiedEmptyState`; o diretório `empty-states/index.ts` reexporta `EmptyState` de `../empty-state`. Import `@/components/ui/empty-states` resolve **para o arquivo** (Vite/TS preferem arquivo a diretório), portanto as 4 telas (`TranscriptionsHistoryView`, `ClientWalletView`, `DashboardWidgetRenderer`, `ChatMessagesArea`) recebem `UnifiedEmptyState`. As props que elas passam (`icon`, `illustration`, `size`, `actionLabel`) existem no Unified. Ou seja: **funciona hoje, por sorte de resolução**; remover o arquivo faria o import cair no `index.ts` e trocar o componente em silêncio.
- V2: mesmo desenho (arquivo `empty-states.tsx` + diretório sem `index.ts`), porém **ninguém importa** `@/components/ui/empty-states` (0 resultados), logo o risco é só confusão. `contextual-empty-states.tsx` importa direto de `./empty-states/ConvenienceExports`.
- Proposta: resolvida por U3-07 (apagar `empty-states.tsx`). Na V3 não mexer.

**U3-09 | LACUNA | M | Três sistemas de toast montados ao mesmo tempo na V2 (A3 pior que na V3)**
- V3: Radix `Toaster` (148 arquivos usam `use-toast`) + Sonner (244 arquivos). `accessible-toast` nunca montado.
- V2: `App.tsx:3,57-59,84,162` monta **Sonner e Radix `Toaster`**; `providers/AppProviders.tsx:6,127` monta `AccessibleToastProvider`, que **não tem nenhum consumidor** (`grep -rn "useAccessibleToast" src` → só definição e teste). Uso real: Sonner 258 arquivos, `use-toast` 160.
- Efeito: dois tipos de toast com cara e posição diferentes conforme a tela; o terceiro provider roda sem produzir nada (custo de render e uma região `aria-live` extra).
- Sonner V2 usa `richColors` + fundo translúcido (`bg-success/10 text-success`); a V3 trocou por fundo sólido com `*-foreground` (comentário `sonner.tsx:28`: "garante contraste WCAG AA"). **Não medi o contraste dos tokens da V2** (os valores HSL não foram lidos). Pendência: medir.
- Proposta: (a) desmontar `AccessibleToastProvider` ou ligar de verdade o que ele tem de bom (saída animada com respeito a movimento reduzido) dentro do Sonner; (b) decidir um toast padrão (Sonner, 258 usos) e um codemod simples do `use-toast` para Sonner em lote futuro; (c) medir contraste dos 4 estilos do Sonner nos dois temas.
- Perfil: iris (a), designer (c). Pronto quando: um único mecanismo montado em `App`+`AppProviders`; teste de contraste ≥ 4,5:1 para `success/error/warning/info`.

**U3-10 | MELHORIA | B | Ilustrações decorativas sem `aria-hidden`**
- V2: `empty-state-illustrations.tsx` → `grep -c aria-hidden` = 0 de 13 `<svg>`; V3 = 14/14. Sem `<title>`, leitores costumam ignorar, mas `aria-hidden="true"` é o correto para decorativo. Mesma família do UI-04(e) (sparkline).
- Perfil: iris. Pronto quando: `grep -c 'aria-hidden' ... = grep -c '<svg'`.

### Skeleton

**U3-11 | MELHORIA | M | `Skeleton` da V2: ruído para leitor de tela, texto em inglês**
- V2 `ui/skeleton.tsx:50-52`: todo `Skeleton` leva `role="status" aria-label="Loading..."`. Uma lista de 10 itens produz 10 regiões "status" anunciando "Loading..." em inglês, num produto pt-BR (64 arquivos usam `Skeleton`; `role="status"` aparece em 89 lugares da V2).
- V3: `skeleton.tsx` tem 43 linhas e **não tem variantes nem `SkeletonList/Avatar/Button`** (o documento A-list não diz). **A V2 é melhor em recursos** (shimmer/wave/pulse, velocidade, `delay`, `SkeletonList` escalonada) e **não deve ser rebaixada**. `ChatShimmer` da V3 acerta no padrão: um único `role="status" aria-label="Carregando mensagens"` no contêiner.
- Correção: no `Skeleton`, remover `role` e `aria-label` (virar decorativo, `aria-hidden`); nos contêineres de carregamento (`ViewLoadingFallback`, listas) usar `role="status"` + `aria-busy` + texto `sr-only` em pt-BR uma vez. Variante `shimmer` já respeita a regra CSS global.
- Perfil: iris. Pronto quando: teste renderiza `<SkeletonList>` e encontra exatamente 1 `role="status"` com nome em pt-BR e nenhum "Loading...".
- Cobertura de cartões: skeletons de telas já estão em ~60 cartões da paridade V3→V2 (`buscar_corpo.py skeleton`); nenhum trata do `Skeleton` base.

### Calendário

**U3-12 | DECISÃO | B | `Calendar` na V2 está em react-day-picker 8.10.2 e sem locale padrão**
- V2: `package.json:89` `react-day-picker ^8.10.2`, `date-fns ^3.6.0`; `ui/calendar.tsx` usa classes v8 (`nav_button`, `head_row`, `IconLeft`). V3: `^10.0.1` + `date-fns ^4.4.0` com classes novas (`month_caption`, `button_previous`, `Chevron`) e `autoFocus` (aceita `initialFocus` legado).
- Os dois: o wrapper **não define `locale`**; cada chamador passa `locale={ptBR}` (V2: 7 de 8 arquivos; `pages/AdminTelemetriaPage.tsx:172,182` **sem locale** → meses em inglês; V3 também).
- Proposta: (1) default `locale={ptBR}` no wrapper (1 linha, corrige a tela de telemetria); (2) **não** atualizar para v10 agora: exigiria `date-fns` 4 em todo o app (dependência nova) — fica como decisão do dono.
- Perfil: iris. Pronto quando: `<Calendar />` sem `locale` mostra "janeiro" no teste.

### Emoji, reações, paleta, telefone

**U3-13 | MELHORIA | M | `EmojiPicker`: armazenamento direto e botões sem `type`**
- V2 `ui/emoji-picker.tsx:50,64`: `localStorage.getItem/setItem` direto. A leitura tem `try/catch`; **a escrita não**: em modo privado/cota cheia `setItem` lança dentro de `handleSelect` depois de `onEmojiSelect`, e o picker não fecha (`setIsOpen(false)` na linha 67 não executa) além de gerar erro não tratado. `JSON.parse` aceita valor corrompido que não é array e depois `.filter` quebra. A V2 **já tem** `lib/safeStorage.ts`.
- V3 `emoji-picker.tsx:2,65,79`: `safeGetJSON/safeSetJSON` — o "problema" A8 do documento é, na verdade, a correção; **a V2 é que sofre do problema real**.
- Também V3 acrescentou: `type="button"` nos botões internos (V2 sem: quando o picker fica dentro de `<form>`, clicar em categoria ou limpar busca envia o formulário), `aria-label` nos botões de categoria (V2 só `title`) e "Limpar busca de emoji". V2 é melhor em: largura responsiva `w-[min(340px,calc(100vw-1rem))]` (V3 fixa 340px, estoura em telas < 356px).
- Quem usa na V2: `TalkXMessageEditor`, `TeamChatInputArea`, `inbox/chat/ChatInputToolbars`, `CustomEmojiPicker`.
- Correção: trocar por `safeGetJSON/safeSetJSON` (validando `Array.isArray`), `type="button"` e `aria-label` nas categorias; manter a largura da V2.
- Perfil: iris. Pronto quando: teste com `Storage.prototype.setItem` lançando: selecionar emoji chama `onEmojiSelect`, fecha o popover e não lança; clique em categoria dentro de `<form onSubmit>` não dispara submit.

**U3-14 | MELHORIA | B | Reações: texto de acessibilidade com erro de plural na V2; sem detalhes na V3**
- V2 `ui/message-reactions.tsx:39`: ``aria-label={`${emoji} ${count} reação${count !== 1 ? 'ões' : ''}`}`` → "reaçãoões" para 2 ou mais. V3 `message-reactions.tsx:88` escreve "reações/reação" corretamente e acrescenta "Você reagiu."; `ReactionPicker` da V3 usa `aria-label="Reagir com {emoji}"` (V2: só o emoji, `:92`).
- Mesmo padrão de bug em texto visível: V2 `components/contacts/ContactRegionMap.tsx:216` ("região" + "ões" = "regiãoões") e V3 `layout/ConnectionStatusIndicator.tsx:47` ("conexãoões").
- Cobertura: UI-10 (`t_1d4a2920`) cuida de tooltip e testes; **não cita este bug**. Acrescentar ao UI-10 e ao arquivo do mapa.
- Perfil: iris/workertestes. Pronto quando: teste de `ReactionBadge` com `count=2` espera "2 reações"; grep `'ões'` sem `ç`/`x` correto → 0 ocorrências erradas.

**U3-15 | DECISÃO/LACUNA no cartão | A | Cartão UI-08 (`t_2bf96975`) reintroduz comandos mortos**
- V3 `command-palette-data.tsx:46-47`: "Nova conversa" (atalho `n`) e "Respostas rápidas" **não têm `action` nem `href`** e o `executeCommand` (`command-palette.tsx:119-127`) só trata `action`, `href` ou id `nav-*`. Escolher qualquer um **apenas fecha a paleta**. O atalho `n` anunciado não existe em `GlobalKeyboardProvider` nem em `useKeyboardManagement`.
- V2 `command-palette-data.tsx` (comentário R2-INF-033 #378): os dois comandos foram **removidos de propósito** pelo mesmo motivo, e o "Atalhos de teclado" ganhou `action` real (`show-shortcuts-help`).
- O cartão UI-08 manda "acrescentar os dois comandos"; ele diz para abrir fluxos existentes, mas **não existe evento global** para isso (as telas é que abrem os modais). Executado literalmente, recria a regressão que a V2 já corrigiu.
- Ação: reescrever ou cancelar UI-08. Se o dono quiser os comandos, o cartão precisa criar primeiro um gatilho (evento `open-new-conversation` e `open-quick-replies` ouvido pelo Inbox) e provar com teste que a paleta executa a ação. "Etiquetas" fica fora (escopo excluído). O grupo `talkx` existe só na V2 (categoria a mais).
- Perfil: iris. Pronto quando: teste de paleta: escolher "Nova conversa" dispara o evento ouvido e o modal abre; sem isso, o comando não aparece.

**U3-16 | DECISÃO/MELHORIA | M | `PhoneInput` da V3 não é internacional; cartão UI-07 afirma o contrário**
- V3 `phone-input.tsx:70-100`: se o usuário digita número que não começa com 55 e cujos dois primeiros dígitos estejam entre 11 e 99, **prefixa "55"**. Um número dos EUA (+1 212…) ou de Portugal (+351…) vira "+55 12…"/"+55 35…". O comentário da função promete "international passthrough"; o código não cumpre. O foco em campo vazio chama `onChange('+55 ', '55')` (marca o formulário como alterado sem digitar). O documento diz que usa `react-phone-number-input`: **não usa**, é máscara própria.
- UI-07 (`t_a2751a74`) cita "formata `+55 XX XXXXX-XXXX`, aceita internacional". Recomendação: **não copiar `formatPhone`**. A V2 já tem `lib/calls/phone.ts` (`normalizeE164BR`, `formatPhoneBR`, `phonesMatchExact`, `phoneQueryVariants`) e `contacts/useContactFormValidation.ts`; montar a máscara sobre elas, só prefixar 55 quando o campo começar sem `+` e tiver 10–11 dígitos (DDD 11–99), e deixar `+` explícito passar intocado.
- Perfil: iris. Pronto quando: testes: "11999990000" → "+55 11 99999-0000"; "+12125551234" permanece "+1 212…"; foco em vazio não chama `onChange`.

### Primitivos de chat, banner, QuickPeek

**U3-17 | JÁ-COBERTO:CL1 / MORTO | B | `chat-shimmer`, `bubble`, `message`, `marker`, `attachment`, `prompt-kit/*`, `scroll-fade`**
- `chat-shimmer` é usado em 4 lugares da V3 (`ChatMessagesArea.tsx:478`, `AudioTranscription`, `AIChatResponseCard`, `ChatInputQueueDisplay`); a V2 não tem e a ideia está no cartão CL1 (`buscar_corpo.py` "esqueleto" e "ChatShimmer" → CL1). Padrão a copiar: um único `role="status"` pt-BR (ver U3-11).
- `bubble.tsx` só é usado atrás de `chat_bubble_v2`, **`enabled:false` por padrão** (`lib/featureFlags.ts:88`); a V2 tem `MessageBubble`/`EmailChatBubble` próprios. `message`, `marker` (separador de data), `attachment` e `chat/index.ts`: 0 consumidores finais. `prompt-kit/*` (3 componentes de 26–52 linhas): só usados em teste. `scroll-fade`: fora de escopo. **Não portar.**
- Observação sobre `marker.tsx`: `role="separator"` + `aria-label` é bom, mas a V2 já tem separador de dia no chat (não verificado em detalhe).

**U3-18 | JÁ-COBERTO:UI-05a/UI-05b, UI-06 | M | Ressalvas aos cartões do banner e do QuickPeek**
- UI-05a descreve o hook da V3 como estados `checking|online|degraded|offline` com recuo. **Não é isso**: V3 `hooks/useSupabaseConnectivity.ts` (64 linhas) é uma casca sobre `integrations/supabase/connectivityMonitor.ts` (275 linhas): 3 estados (`online|offline|backend-down`), singleton compartilhado, heartbeat de 60 s, pausa com aba oculta (`visibilitychange`), sonda `GET {url}/functions/v1/health-check` com `mode:'no-cors'` (sem preflight), `retryNow()`. A V2 não tem `integrations/supabase/connectivityMonitor`.
- Cuidado para o cartão: a Edge `health` da V2 faz consulta ao banco (`supabase/functions/health/index.ts:5`); **sondar a cada 60 s por aba e por agente aumenta carga e custo**. Usar o `connection-health-check`/rota leve, ou o ping `no-cors` da própria origem; limitar a 1 sonda por aba (singleton) e 60 s.
- UI-06 (QuickPeek): `ui/quick-peek.tsx` da V2 guarda o timer em `useState` e **não limpa ao desmontar nem cancela o timer anterior**; a V3 usa `useRef`, limpa no unmount e no `mouseenter` repetido. Como o cartão vai montar esse componente em cada linha de uma lista virtualizada, **aplicar o `useRef`+cleanup da V3 faz parte do UI-06** (hoje o cartão diz "somente se faltar prop"). Também não há `aria`/foco: o balão é só mouse (o cartão já pede decisão sobre teclado).
- Perfil: iris/hugo. Pronto quando: teste de QuickPeek desmontando durante o atraso não chama `setShow`.

### Demais

**U3-19 | MELHORIA | M | Ícone sem nome acessível: V2 pior que a V3 e sem trava automática**
- Estimativa por regex (`<Button ... size="icon"` sem `aria-label`, `title` ou `sr-only` próximo): V2 112 de 322 (35%) em 72 arquivos; V3 78 de 385 (20%) em 50 arquivos. A regex corta no primeiro `>`, então atributos depois de `=>` não são vistos: **números indicativos, não exatos**. Nem V2 nem V3 têm `eslint-plugin-jsx-a11y` (`grep -n jsx-a11y eslint.config.js package.json` → vazio). `IconButton` (V2 `ui/icon-button.tsx:44`) já obriga `aria-label` pela tipagem, mas só 1 tela o usa (A9 vale igual na V2).
- Proposta: um teste de varredura (vitest lendo arquivos, sem dependência nova) ou `eslint-plugin-jsx-a11y` só com `control-has-associated-label` como decisão do dono; corrigir por módulo (mobile e inbox primeiro).
- Perfil: workertestes (teste) + iris (correções). Pronto quando: teste de varredura com lista de exceções decrescente; zero ocorrências em `components/inbox/**` e `components/mobile/**`.

**U3-20 | V2-MELHOR | M | `lazyWithRetry` e recarga de chunk — V3 tem uma guarda que a V2 não tem**
- V2 `lib/lazyWithRetry.ts` (33 linhas) + `lib/chunkReload.ts` (161): teto de 2 recargas por sessão, cooldown de 30 s, contador preso em [0, 2], fallback de memória se o `sessionStorage` falhar, e **não** entra em laço de retentativas em erro de chunk. É **mais robusto e mais enxuto** que o da V3.
- Só a V3 tem (`lazyWithRetry.ts:38-47,162`): flag `documentNavigationInProgress` via `beforeunload` — no WebKit (Safari) um `import()` rejeitado durante uma navegação de documento legítima dispararia recarga que cancela a navegação. `grep beforeunload lib/chunkReload.ts` na V2 → vazio.
- Proposta (B): acrescentar a mesma guarda a `chunkReload.triggerChunkReload`/`podeRecarregar` com teste. Perfil: hugo. Pronto quando: teste com `beforeunload` disparado e `isChunkLoadError` verdadeiro → não chama `location.reload`.

**U3-21 | V2-MELHOR | M | `Progress` da V3 perdeu `aria-valuenow`**
- `ui/progress.tsx` V2:12-13 passa `value={value}` ao `ProgressPrimitive.Root` (Radix expõe `aria-valuenow`); V3 removeu essa linha (diff `progress.tsx`: `-    value={value}`), então o leitor de tela ouve uma barra sem valor. A V2 tem teste próprio (`__tests__/progress.test.tsx`). **Não devolver à V3 o que a V2 tem; manter.** (Observação de fatia: a V2 também troca `bg-accent` por `bg-secondary`, token.)

**U3-22 | EQUIVALENTE | B | `virtualized*` e `lazy*`**
- Não existem em `components/ui` em nenhuma versão. Equivalentes fora: `VirtualizedRealtimeList` (V3 352 linhas, V2 681 linhas — a V2 tem bem mais lógica; **não comparei linha a linha, fora da fatia**), `components/performance/VirtualizedList.tsx` e `LazyRoutes.tsx` só na V2, `pages/lazyViews.ts` nos dois. Sem diferença conhecida a corrigir.

**U3-23 | EQUIVALENTE | B | `mobile-components` e `icon-button` (A9)**
- Conferido: `mobile-components.tsx` e `icon-button.tsx` são iguais nos dois em comportamento (a V3 só reordena classes, troca sombras por rgb fixo, `z-[100]` no `BottomNavigation` e `type="button"`). Uso real nos dois: **só `BottomNavigation`** (`mobile/MobileShell.tsx`) e `IconButton` (`MobileDrawerMenu`). `MobileDrawer`, `PullToRefresh` e `TouchFeedback` de `ui/` estão mortos nos dois; a V2 mantém ainda um `PullToRefresh` duplicado em `components/mobile/SwipeGestures.tsx:94`.
- A9 se aplica igual à V2 (ROI baixo, não um defeito). A V2 usa token `--primary-text` no rótulo ativo (melhor contraste que `text-primary` da V3). Sem ação, só limpar o morto se houver faxina.

**U3-24 | V2-MELHOR | B | Dois toasts: `toast.tsx` perdeu `aria-label="Fechar"` na V2**
- Já em UI-03 (texto de a11y em pt-BR). Confirmado: V3 `toast.tsx:74` `aria-label="Fechar"`, V2 sem. Nada novo.

## 3. A1–A9 do documento 13 da V3: a V2 tem o mesmo problema?

| # | O que a V3 declara | Estado real na V3 hoje | A V2 sofre do mesmo? | Melhoria que faz sentido |
|---|---|---|---|---|
| A1 | 4 (na verdade 5) sistemas de empty state | Procede; mas `UnifiedEmptyState` é fachada viva | **Sim, pior**: 3 componentes `EmptyState`, 2 sem importador (369 linhas mortas), `@deprecated` aponta para o morto, 166 arquivos com vazio escrito à mão | U3-07 (canônico `empty-state.tsx`, apagar o morto) |
| A2 | barril `empty-states.tsx` quebrado | Não está quebrado: arquivo vence o diretório e as 4 telas usam o `Unified` | **Parcial**: mesmo desenho, mas 0 importadores | U3-08 (apagar na V2; na V3 não mexer) |
| A3 | 2 toasts (+1 morto) | Procede (Radix + Sonner; `accessible-toast` não montado) | **Sim, pior**: os 3 estão **montados** (Sonner, Radix `Toaster`, `AccessibleToastProvider` sem consumidores) | U3-09 |
| A4 | `motion.tsx` deprecated coexiste com `motion/index.ts` | **Resolvido na V3** (o arquivo foi removido, 338 importadores no barril novo) | **Não** (só `motion.tsx`, sem `index.ts`, sem ambiguidade) — mas 356 arquivos importam `framer-motion` direto | U3-01 (opcional) |
| A5 | stories sem `.storybook` | **Desatualizado**: V3 tem `.storybook` e 13 stories | **Não tem stories nem Storybook** | Nenhuma (fora de escopo; nada a portar) |
| A6 | `motion/variants.ts` "órfão" mas interno | Procede (falso positivo do doc) | **Não é órfão** na V2 (usado por `components.tsx`, `effects.tsx` e `talkx/kit/dialogs.tsx`) | Nenhuma |
| A7 | `UnifiedEmptyState` exporta `EmptyState` em conflito | Latente; na prática o arquivo `empty-states.tsx` o torna o `EmptyState` de 4 telas | **Sim**: V2 tem 3 `export function EmptyState` (`EmptyState.tsx`, `empty-state.tsx`, `empty-states.tsx`) | U3-07 |
| A8 | `emoji-picker` usa `localStorage` direto via `safe*` | A V3 **usa `safeStorage`** (é a solução) | **Sim, e sem proteção na escrita**; `lib/safeStorage.ts` já existe | U3-13 |
| A9 | `icon-button` e `mobile-components` com poucos consumidores | Procede (1 e 1) | **Sim, igual**; pior porque ainda há `PullToRefresh` duplicado | U3-23, U3-19 |

## 4. O que a 1ª passada comparou "só por amostra" e o resultado

- `motion/*`: lido o diff normalizado completo; só `AnimatedCounter` e as variantes `talkx*` diferem em comportamento (U3-03, U3-04).
- `micro-interactions/*`: lido; diferença só no cleanup do ripple (U3-06).
- `empty-state-illustrations`: as 13 ilustrações são as mesmas; diferença só em `aria-hidden` (U3-10). A V3 tem 604 linhas contra 157 por formatação de JSX, não por conteúdo (mesmas chaves: inbox, contacts, dashboard, calls, notifications, queues, messages, data, search, tags*, transcriptions, agents, wallet, generic; `tags` só na V3).
- `calendar`: V3 em API nova do react-day-picker 10; V2 em 8 (U3-12).
- `skeleton`: **a V3 é a versão simples e a V2 a rica**, o oposto do que o documento sugere (U3-11).
- `EmptyState*`: U3-07, U3-08.
- Os 76 arquivos "com diferença" desta fatia (todos os listados na tabela do §1) foram classificados; os demais (shadcn puros) são de outra fatia.

## 5. Cartões que já cobrem, e relação com este relatório

- JÁ-COBERTO: UI-02 (chart), UI-03 e UI-04 (a11y/robustez de primitivos), UI-05a/b (banner; ressalvas U3-18), UI-06 (QuickPeek; ressalva U3-18), UI-07 (PhoneInput; ressalva U3-16), UI-10 (reações; acrescentar U3-14), CL1 (esqueleto da conversa).
- **UI-08 precisa ser reescrito antes de rodar (U3-15).**
- Sem cartão ainda e que valem criar: U3-02, U3-07, U3-09, U3-11, U3-13, U3-14 (como acréscimo ao UI-10), U3-16 (ajuste ao UI-07), U3-19, U3-20. Os demais são decisão, baixa prioridade ou "sem ação".

## 6. O que NÃO consegui ler a fundo

- Linha a linha de `command-palette.tsx` (V3 405 × V2 246 linhas): conferi só `command-palette-data.tsx`, o `executeCommand` da V3 e o que a 1ª passada já listou como V2-melhor (`searchSeqRef`, grupo Talk X).
- `error-boundary-retry.tsx` e `section-error-boundary.tsx`: confiei no diff normalizado (pequeno) e na 1ª passada; não rodei nada.
- `message-reactions.tsx`: comparei só estrutura e a11y, não o comportamento do popover (foco, Escape) nas duas versões.
- `prompt-kit/PromptActions.tsx` e o final de `attachment.tsx`/`Bubble.stories.tsx`: só cabeçalhos; todos sem consumidor.
- Contraste de cores dos toasts (U3-09) e a contagem de ícones sem nome (U3-19, por regex, indicativa).
- `VirtualizedRealtimeList` (681 × 352 linhas) e `components/performance/*`: fora da fatia, não comparados.
- Nada foi executado (sem testes, tsc, build, navegador): todas as afirmações de comportamento vêm de leitura de código.
