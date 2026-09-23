# PROMPT DE EXECUÇÃO — SISTEMA DE SKINS "OPERA GX" (paridade Promo Gifts V4) | ZAPP WEB V2

> **Executor:** Claude Code (container `claude-code`, VPS AtomicaBR) — sessão `claude -p`, worktree próprio
> **Repo alvo:** `adm01-debug/Zapp_Web_V2` (base `main` @ `196e1808` ou posterior)
> **Repo referência:** `adm01-debug/Promo_Gifts_V4` (`main` @ `cff6e9f0`) — `src/lib/theme-presets.ts`, `src/pages/admin/AdminTemasPage.tsx`, `src/components/settings/theme/*`, `src/components/ThemeInitializer.tsx`, `src/styles/diversity-overrides.css`, `tests/lib/theme-presets.test.ts`
> **Tela alvo:** `https://zapp-web-v2.vercel.app/?view=themes` (componente `ThemeCustomizer`, rota `themes` em `src/pages/ViewRouter.tsx`)
> **Tela referência:** `https://www.promogifts.com.br/admin/temas` (print 1: 10 clássicas + 9 Opera GX + Raio da Borda com presets)
> **Ledger de progresso (obrigatório):** `docs/design/SKINS_OPERA_GX_STATUS.md`
> **Versão do plano:** 1.0 — 23/09/2026 — escrito após leitura integral dos dois repositórios (seção 1)

---

## 0. LEIA ANTES DE TOCAR EM QUALQUER ARQUIVO

### 0.1 Por que a tela atual do Zapp "tem skins" e não muda nada (fatos verificados no código)

O print 2 mostra 8 cards cujas barras de cor são **idênticas** (charcoal › azul › azul-claro › charcoal). Não é bug visual do card — é o sistema inteiro. Causas raiz, com linha:

| # | Fato no código (`main` @ `196e1808`) | Efeito para o usuário |
|---|---|---|
| 1 | `src/components/settings/theme/presets.ts` › `buildPreset(id, label, h)`: o bloco **`dark` ignora `h`**. Todas as cores dark são literais (`primary: '221 83% 53%'`, `background: '240 6% 6%'`, …). Só o bloco `light` usa o hue. | No modo escuro (o padrão), trocar de skin **não muda cor nenhuma**. |
| 2 | `swatches = [dark.background, dark.primary, dark['primary-glow'], dark.card]` — derivado do bloco dark da causa 1. | 8 cards com a mesma barra de cor. |
| 3 | Dois escritores brigando no `localStorage['theme-custom-colors']`: `ThemeInitializer.tsx` grava `{cssVarsCache, cacheMode, cachePreset}`; `useThemePreset.ts` **apaga** esses campos ao montar a página de Skins (regrava só `{v, preset, borderRadius}`). | O boot inline do `index.html` só evita FOUC quando existe `cssVarsCache`; depois de visitar a página de Skins ele some → flash de cor errada até o React montar. |
| 4 | `ThemeInitializer.tsx`: `radius = Math.max(parsed.borderRadius, 14)`; `useThemePreset.ts`: slider 0–20, default 8, reset `0.5rem`. | Usuário escolhe 8px → no reload vira 14px. O slider mente. |
| 5 | `ThemeCustomizer.tsx` › botão **Salvar** só dispara `toast.success(...)`. Nada é gravado ali. | Sem feedback real; sem tratamento de storage indisponível. |
| 6 | `index.html` boot aplica `cssVarsCache` sem checar `cacheMode` contra o modo resolvido (`dark`/`light`). | Usuário em `theme=system` que muda o SO de claro→escuro recebe cache do modo errado até o React corrigir. |
| 7 | Cobertura: o preset cobre 51 tokens; `tokens.css` tem ~90 tokens amarrados ao azul 221 (`--primary-50…950`, `--kpi-tile-blue*`, `--xp`, `--gradient-xp/vibrant/purple-green`, `--shadow-glow-accent/purple`, `--chart-status-open`, `--border-strong`, `--primary-hover/active`, …). | Mesmo consertando a causa 1, tonal `tonal-500`, tiles KPI e gradientes ficariam azuis numa skin vermelha. |
| 8 | Não existe: categoria GX, raio por skin, presets rápidos de raio (Reto/Sutil/…), diálogo de confirmação no "Original", sync entre abas, `data-preset-id` no `<html>`, skin Diversity, **nenhum teste** (`src/components/settings/__tests__` só tem MediaLibrary/SLA). | A funcionalidade do Promo Gifts simplesmente não existe aqui. |
| 9 | `exportTheme`/`importTheme` em `useThemePreset.ts` — nunca usados por nenhum componente. | Código morto. |

O Promo Gifts V4 tem tudo isso resolvido e testado (`tests/lib/theme-presets.test.ts`, 150+ asserts, com IDs de bug `BUG-THEME-02/03/04/13/16/17` documentados no código). **Este plano porta a arquitetura do PG para o Zapp**, adaptando ao que o Zapp tem a mais (modo claro/escuro/sistema, `useTheme` próprio, boot com cache de CSS vars, tokens extras de chat/KPI/gamificação).

### 0.2 Regras invioláveis (anti-falha)

1. **Nenhum checkpoint fecha sem evidência** (caminho de screenshot/JSON + SHA + saída de comando no ledger). Sem arquivo = não aconteceu.
2. **Ordem é lei: núcleo (presets.ts) → sincronia com tokens.css → boot/initializer → página → componentes → cobertura → testes → QA.** Não abra `ThemeCustomizer.tsx` antes do CP1.
3. **Nunca escreva "idêntico", "validado", "pixel-perfect".** Escreva o número: `--primary = 347 96% 54% ✓`, `ΔE sidebar = 2.4`.
4. **Reescrita autorizada** (arquivo inteiro): `presets.ts`, `useThemePreset.ts`, `ThemeInitializer.tsx`, `ThemeCustomizer.tsx`, `PresetCard.tsx`, `BorderRadiusControl.tsx`. **Diff cirúrgico** em todo o resto (`index.html`, `tokens.css`, `index.css`, `Sidebar.tsx`, `AppProviders.tsx`).
5. **Zero backend.** Nada de Supabase, migration, RLS. Skin é preferência local (`localStorage`), igual ao PG.
6. **Zero regressão** na seção 4 (funcionalidades preservadas) — em especial Modo de Cor (Claro/Escuro/Sistema), que o PG não tem e o Zapp tem.
7. **`tokens.css` é a verdade para a skin `corporate`.** A fórmula do `buildPreset` é a verdade para as outras 18. O teste de sincronia (etapa 25) é o juiz; divergências se resolvem na fórmula, ou em `tokens.css` só quando a diferença é cosmética (ΔE < 3) e registrada.
8. **Ratchets são gates**: `bun run typecheck` (0 erros; se der o timeout conhecido, `npx tsc --noEmit -p tsconfig.app.json` e registre), `node scripts/ci/lint-ratchet.mjs`, `node scripts/ci/typecheck-ratchet.mjs`, `bun run implicit-any-check`, `npx vitest run`. Baseline só muda seguindo `scripts/ci/README.md`.
9. **Armadilha do lint-ratchet:** ele casa violações legadas por `contextHash` de linhas vizinhas; inserir código *antes* de uma violação antiga acusa dívida nova. Mova a inserção para depois; não toque no baseline.
10. **Fluxo Git do Joaquim:** branch única `claude/feat-skins-opera-gx-<AAMMDD-HHMM>` a partir de `origin/main`, em worktree próprio (`/workspace/repos/Zapp_Web_V2-skins`). Nunca commitar em `main`, nunca em branch alheia. Commits `feat:`/`fix:`/`test:`/`chore:` em PT-BR. **Push sempre com `git push --no-verify`** (o hook pre-push trava sessões `claude -p`). Um commit por fase.
11. **Nunca `pkill -f` com padrão genérico** (`vite`, `node`, porta) — mata a própria sessão `claude -p`. Preview local é morto pelo PID gravado em `/workspace/qa/preview.pid` ou `fuser -k 4173/tcp`.
12. **Sem biblioteca nova.** Tudo que o PG usa o Zapp já tem: `framer-motion`, `sonner`, Radix `tooltip`/`alert-dialog`/`slider`, `lucide-react`.
13. **Máximo 3 iterações por loop de QA.** Na 3ª, registre o resíduo e siga.
14. **Shell dos containers é `dash`.** Sem `[[ ]]`, arrays, `source`. Sem `python3` — QA em Node.
15. **Deploy:** a conta Vercel `juca1` estava **bloqueada** em 14/09/2026 (memória de sessão). O CP0 registra o estado atual; se continuar bloqueada, a etapa 100 vira `DEPLOY: bloqueado` — a entrega termina em "PR mergeada, deploy pendente de desbloqueio", **nunca em "concluído"**.
16. **Se algo do plano contradisser o código real, o código real vence — e a divergência vai para o ledger antes de decidir.**

## 1. CONTEXTO VERIFICADO (leitura feita em 23/09/2026)

### 1.1 Promo Gifts V4 — a referência (o que será portado)

| Arquivo (PG) | Responsabilidade | Porta para (Zapp) |
|---|---|---|
| `src/lib/theme-presets.ts` (≈900 linhas) | Tipos `ThemeModeColors`/`ThemePreset`/`ThemeConfig`; `CSS_VARS_TO_APPLY` (66 tokens); `buildPreset(params)` com 7 parâmetros de hue (`h,s,l,gh,sh,ss,sl`); 10 clássicas + `diversity` (overrides rainbow); pipeline GX (`applyGxDarkSurfaces` → roxo `265 22% 8%`, `applyGxNeonGlow` → `boostGlowAlpha` na 1ª ocorrência, `applyGxGlass`, `buildGxPreset` → `category:'gx'`, `borderRadius:10`, `font: Inter`); `withDarkPrimaryFg` (5 GX claras → texto escuro, contraste 6.18–14.56:1); storage `gifts-store-theme-config` `{presetId, radius, mode}`; `loadThemeConfig` (clamp 0–20, NaN→14, id desconhecido→corporate, mode inválido→auto); `saveThemeConfig(): boolean`; `applyThemePreset(id, mode)` (no-op se id desconhecido, `theme-transitioning` com timer único, `data-preset-id`, fonte/raio por preset); `applyRadius` (clamp); `clearThemeOverrides`; `export/importThemeConfig` | `src/components/settings/theme/presets.ts` (**reescrita**) |
| `src/pages/admin/AdminTemasPage.tsx` | Estado `config`/`savedConfig`, `hasUnsavedChanges`, `updateConfig` com **snap de raio** (GX→10, sair de GX→14, BUG-THEME-13), auto-save + `handleSave` com toast sucesso/erro, `handleReset`; header sticky com badge da skin ativa + Salvar (dot pulsante) + `ThemeResetDialog`; seção "Skins clássicas (10)" (`Sparkles`) e "Skins Opera GX (9)" (`Gamepad2` + badge GAMER); grids `role="radiogroup"` 2/3/5 colunas; `fadeUp` framer | `src/components/settings/ThemeCustomizer.tsx` (**reescrita**) + `useThemePreset.ts` (**reescrita**) |
| `src/components/settings/theme/PresetCard.tsx` | Tooltip, `role="radio"`, `aria-checked`, teclado Enter/Space, glow radial quando ativo, barra de 4 swatches com hover (altura 32→36 + shimmer), check animado (spring) / olho no hover, descrição itálica | `PresetCard.tsx` (**reescrita**) |
| `src/components/settings/theme/BorderRadiusControl.tsx` | Presets rápidos Reto 0 / Sutil 4 / Médio 8 / Suave 12 / Redondo 20, slider 0–20, preview (Enviar/Curtir/Config/Excluir, Buscar + Novo + 3, mini card João da Silva) | `BorderRadiusControl.tsx` (**reescrita** — o preview já é o mesmo, só muda a API) |
| `src/components/settings/theme/ThemeResetDialog.tsx` | Botão "Original" (outline destructive) → `ConfirmDialog` "Restaurar tema original?" | novo `ThemeResetDialog.tsx` com `AlertDialog` (Zapp não tem `ConfirmDialog`) |
| `src/components/ThemeInitializer.tsx` | Restaura skin no boot; **sync entre abas** via evento `storage` | `src/components/ThemeInitializer.tsx` (**reescrita**) |
| `index.html` (boot) | Só estampa `data-preset-id` antes do React (PG é dark-only, sem FOUC de modo) | `index.html` (diff cirúrgico — o Zapp mantém o cache de CSS vars, ver D8) |
| `src/styles/diversity-overrides.css` | `html[data-preset-id="diversity"]` → rainbow em `bg-primary`, tabs/checks/switch ativos, sidebar ativa, slider, scrollbar; remove rings | novo `src/styles/diversity-overrides.css` |
| `tests/lib/theme-presets.test.ts` | 12 seções, ~150 asserts | `src/components/settings/theme/__tests__/*.test.ts` (**porta adaptada**) |

### 1.2 Zapp Web V2 — estado atual (o que já existe e será reaproveitado ou substituído)

| Arquivo (Zapp) | Estado | Destino |
|---|---|---|
| `src/components/settings/theme/presets.ts` (271 linhas) | 8 presets por hue; dark hardcoded (causa 1); `STORAGE_VERSION=5`; `normalizeStoredPresetId` (deprecia `default`, `purpure`); `applyThemeColors`/`removeThemeColors`/`buildCustomPreset` sem uso fora do módulo | reescrever (Fase 1) |
| `src/components/settings/theme/useThemePreset.ts` (173 linhas) | aplica cores, grava storage sem cache (causa 3), radius default 8, export/import mortos | reescrever (Fase 4) |
| `src/components/settings/ThemeCustomizer.tsx` (125 linhas) | back + título + Salvar fake + Original; card **Modo de Cor** (Claro/Escuro/Sistema via `useTheme`); grid única 2/5 colunas; `BorderRadiusControl` | reescrever mantendo Modo de Cor (Fase 4) |
| `src/components/settings/theme/PresetCard.tsx` / `BorderRadiusControl.tsx` | versões simplificadas | reescrever (Fase 5) |
| `src/components/ThemeInitializer.tsx` (103 linhas) | monta em `AppProviders` após `ThemeSync`; aplica preset por `resolvedTheme`; grava cache; clamp min 14 (causa 4); sem sync entre abas | reescrever (Fase 3) |
| `src/hooks/ui/useTheme.ts` | `theme: light\|dark\|system`, `resolvedTheme`, `ThemeSync`, classe `theme-transitioning` no `<html>` e `<body>` por 300–350ms, `colorScheme` | **não tocar** — é a fonte de `resolvedTheme` |
| `index.html` boot | `c.v === 5` → aplica `cssVarsCache` + `--radius`; senão remove | diff cirúrgico (Fase 3) |
| `src/styles/tokens.css` | `:root` (light) e `.dark` charcoal `240 6% 6%`, primary `221 83% 53%`, radius `0.875rem`; tokens extras: tonal `--primary-50…950`, `--neutral-*`, gamificação, `--kpi-tile-*`, `--dash-*`, `--chart-*`, `--surface`, `--divider`, `--border-strong`, `--primary-hover/active` | diff cirúrgico só onde o teste de sincronia mandar (Fase 2) |
| `src/styles/base.css` | `html.theme-transitioning *` com transição 0.3s | não tocar |
| `tailwind.config.ts` | mapeia todos os tokens acima (`tonal.*`, `kpi.*`, `dash.*`, `chat.*`, `sidebar.*`, `status.*`, glows) | não tocar |
| `src/providers/AppProviders.tsx` | `<ThemeSync/>` → `<ThemeInitializer/>` | não tocar |
| `src/pages/ViewRouter.tsx` + `lazyViews.ts` | `'themes': Views.ThemeCustomizer` (lazy, dentro de `ViewContainer` com gutter) | não tocar |
| `src/components/theme/HighContrastToggle.tsx` | só classes `high-contrast`/`reduced-motion`/`large-text` + `--contrast-multiplier` | sem conflito; não tocar |
| `src/components/settings/AppearanceSettings.tsx` | select Tema (dark/light/system) gravado em settings do usuário | não tocar |
| `docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md` | shell já portado do PG (AppHeader, BreadcrumbBar, sidebar 256, charcoal, PJS/Outfit, radius 14, skin v5) | contexto; não tocar |

### 1.3 Stack e comandos reais (`package.json`)
Vite 8 · React 19 · TS 5.9 · Tailwind 3.4 · framer-motion 12 · Radix (alert-dialog, tooltip, slider) · sonner 2 · vitest 4 + jsdom 29 · Playwright 1.56. Scripts: `build`, `preview`, `typecheck` (= `tsc -b --force`), `test` (= `vitest run`), `lint`, `implicit-any-check`. Instala com **bun** (`bun.lock`). Node ≥ 24. Husky ativo.

### 1.4 Infra de QA já existente (reutilizar)
`/workspace/qa` (Playwright + pngjs + pixelmatch instalados no redesign de Contatos) · usuário `qa.visual@promobrindes.com.br` com `ZAPP_QA_EMAIL`/`ZAPP_QA_PASSWORD` em **`/workspace/.secrets/zapp-v2.env`** (não `/root/.secrets`) · padrão de preview local com PID em arquivo.

## 2. ESPECIFICAÇÃO ALVO

### 2.1 Decisões de negócio já tomadas (recomendação do tech lead — Joaquim só precisa dizer se discorda)

| # | Decisão | Recomendação e por quê |
|---|---|---|
| D1 | Fonte Inter nas skins GX | **Não declarar `font`** nos GX. No PG o campo existe, mas `index.html` do PG **removeu o carregamento do Inter** ("overhead desnecessário") — na prática as GX renderizam em Plus Jakarta Sans. Replicar o efeito real, não o código morto: zero request extra, zero FOUT. O campo `font?` fica no tipo para o futuro. |
| D2 | Catálogo | **Substituir os 8 presets atuais pelos 19 do PG, mesmos ids/nomes/emoji/descrições/HSL.** Paridade total entre os dois sistemas (o próprio PG documenta "HSL idênticos ao Zapp"). Migração de ids salvos: `forest→emerald`, `teal→cyber`, `purple→purpure`, `default→corporate`. Quem tinha uma dessas vê a equivalente mais próxima. |
| D3 | Raio | Default **14** (= `--radius: 0.875rem` do tokens.css), slider **0–20**, presets rápidos do PG, **remover** o clamp mínimo de 14 do `ThemeInitializer`. GX → snap 10; sair de GX → 14. |
| D4 | Export/Import de skin | **Sem UI** (o PG também não expõe). Funções puras `exportThemeConfig`/`importThemeConfig` ficam e são testadas. Código do file-picker em `useThemePreset.ts` é removido. |
| D5 | Modo de Cor (Claro/Escuro/Sistema) | **Permanece** no topo da página, como hoje. O PG é dark-only; o Zapp não. Cada preset tem `light` e `dark`. |
| D6 | Navegação por setas no radiogroup | **Implementar** (≈10 linhas): ←/→ movem o foco entre cards. Melhoria de a11y que o PG não tem; sem risco. |
| D7 | Header sticky da página | **Não.** O Zapp já tem `AppHeader` + `BreadcrumbBar` sticky; empilhar um 3º sticky exige offset e cria bug de sobreposição. Header normal. |
| D8 | Boot anti-FOUC | **Manter o cache de CSS vars do Zapp** (`cssVarsCache`) — o PG só estampa `data-preset-id` porque é dark-only; o Zapp tem `system` e modo claro, sem cache o flash é real. Correção: único escritor (`applyThemePreset`) e checagem de `cacheMode` no boot. |
| D9 | Nome do storage | Manter `theme-custom-colors`; **`STORAGE_VERSION: 5 → 6`**. Boot: v6 aplica; v5 é migrado pelo `ThemeInitializer`; outros removidos. |

### 2.2 Catálogo (Apêndice A tem a tabela completa com todos os parâmetros)
10 clássicas na ordem: `corporate` Padrão · `purpure` Púrpure · `emerald` Esmeralda · `sunset` Pôr do Sol · `rose` Rosé · `minimal` Minimal · `ocean` Oceano · `amber` Âmbar · `cyber` Cyber · `diversity` Diversity. 9 GX: `gx-classic` · `gx-pink-addiction` · `gx-purple-haze` · `gx-rose-quartz` · `gx-ultraviolet` · `gx-hackerman` · `gx-frutti-di-mare` · `gx-cyberpunk` · `gx-razer`. `THEME_PRESETS[0].id === 'corporate'`.

### 2.3 Tokens que o preset controla (`CSS_VARS_TO_APPLY`) — três grupos

**Grupo A — superfícies e neutros** (dark: charcoal fixo nas clássicas, roxo GX nos GX; light: tingido pelo hue):
`background, foreground, card, card-foreground, card-elevated, popover, popover-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, border, input, surface, surface-hover, divider, sidebar-background, sidebar-foreground, sidebar-accent, sidebar-accent-foreground, sidebar-border, chat-bubble-received, chat-bubble-received-foreground, chat-header, chat-input-bg, elevated, elevated-hover, glass-bg, glass-border, gradient-surface, gradient-divider, shadow-lg, shadow-xl, shadow-header`

**Grupo B — derivados da primária** (mudam em toda skin, nos dois modos):
`primary, primary-foreground, primary-glow, primary-hover, primary-active, ring, sidebar-primary, sidebar-primary-foreground, sidebar-ring, chat-bubble-sent, chat-bubble-sent-foreground, status-open, chart-status-open, xp, xp-foreground, chart-1, border-strong, gradient-primary, gradient-secondary, gradient-xp, gradient-vibrant, gradient-purple-green, shadow-glow-primary, shadow-glow-secondary, shadow-glow-accent, shadow-glow-purple, kpi-tile-blue, kpi-tile-blue-fg, primary-50 … primary-950 (11)`

**Grupo C — semânticos fixos (NÃO entram no preset; ficam no tokens.css):**
`destructive*, success*, warning*, info*, status-pending/resolved/waiting, whatsapp*, online/away/offline, unread, coins*, streak*, rank-*, priority-*, kpi-tile-green/purple/yellow (+fg), chart-2…10, chart-status-*, chart-sentiment-*, dash-*, neutral-50…950, elev-*, glow-*` (os `--glow-*` já derivam de `var(--primary)` em runtime — mudam sozinhos).

`gradient-success` e `shadow-glow-success` são verdes fixos no PG e no Zapp → grupo C. Exceção documentada: `diversity` sobrescreve `gradient-success` (verde→azul pride) como no PG.

### 2.4 Fórmulas (PG, estendidas para os tokens do Zapp)
Com `p = ${h} ${s}% ${l}%`, `glow = ${gh} ${s}% ${min(l+10,95)}%`, `sec = ${sh} ${ss}% ${sl}%`:

| Token | dark | light |
|---|---|---|
| primary / ring / sidebar-primary / sidebar-ring / chat-bubble-sent / status-open / chart-status-open / xp / chart-1 | `p` | `p` |
| primary-glow | `glow` | `glow` |
| primary-hover / primary-active | `${h} ${s}% ${max(l-5,5)}%` / `${h} ${s}% ${max(l-10,5)}%` | idem |
| border-strong | `p / 0.55` | `p / 0.45` |
| gradient-primary / gradient-xp | `linear-gradient(135deg, hsl(p), hsl(glow))` / `linear-gradient(90deg, hsl(p), hsl(glow))` | idem |
| gradient-secondary | `linear-gradient(135deg, hsl(sec), hsl(${sh} ${ss}% ${min(sl+10,95)}%))` | idem |
| gradient-vibrant | `linear-gradient(135deg, hsl(p), hsl(${gh} 95% 62%), hsl(glow))` | idem |
| gradient-purple-green | `linear-gradient(135deg, hsl(p), hsl(155 80% 50%))` | `…hsl(160 70% 42%))` |
| shadow-glow-primary | `0 0 30px hsl(p / 0.4), 0 0 60px hsl(p / 0.15)` | `0 4px 14px hsl(p / 0.25)` |
| shadow-glow-secondary | `0 4px 24px hsl(sec / 0.4)` | `0 4px 14px hsl(sec / 0.2)` |
| shadow-glow-accent / shadow-glow-purple | `0 4px 24px hsl(glow / 0.4)` / `0 4px 24px hsl(p / 0.5)` | `0 4px 14px hsl(glow / 0.25)` / `0 4px 14px hsl(p / 0.3)` |
| shadow-lg / shadow-xl / shadow-header | charcoal + `hsl(p / 0.04)` / `0.06` / `0.03` (como tokens.css, hue trocado) | como tokens.css light |
| kpi-tile-blue / kpi-tile-blue-fg | `p / 0.13` / `${h} ${s}% 72%` | idem |
| glass-border / gradient-divider | `${h} 30% 30% / 0.15` / `…hsl(${h} 50% 40% / 0.15)…` | `${h} 15% 88% / 1` / `…hsl(${h} 15% 88% / 0.5)…` |
| primary-50…950 | tabela `.dark` do tokens.css com `221 → h` (S/L mantidos) | tabela `:root` com `221 → h` |
| light: background/muted/border/input/accent/sidebar-*/chat-* | — | valores do `:root` do tokens.css com `221 → h` (ex.: `background: ${h} 20% 97%`, `muted: ${h} 15% 92%`, `accent-foreground: ${h} ${s}% ${max(l-8,5)}%`) |
| dark neutros (clássicas) | `240 6% 6% / 240 5% 10% / 240 5% 13% / 240 5% 16% / 240 4% 18% / 240 5% 14% / 240 6% 5% / 240 5% 12% / 240 4% 14%` (background/card/card-elevated/secondary/muted+border/input/sidebar-bg/sidebar-accent/sidebar-border) — iguais ao `.dark` atual | — |
| dark neutros (GX, `applyGxDarkSurfaces`) | `265 22% 8% / 265 22% 12% / 265 18% 17% / 265 22% 14% / 265 18% 17% / 265 18% 22% / 265 24% 10% / 265 18% 17% / 265 18% 20%` + `surface 265 22% 10%`, `divider 265 18% 22%`, `chat-header 265 22% 12%`, `chat-input-bg 265 22% 10%`, `chat-bubble-received 265 18% 17%`, `gradient-surface 180deg 265 22% 12% → 265 24% 8%` | — |

**Regra de ouro (etapa 25):** `corporate.light` ≡ `:root` e `corporate.dark` ≡ `.dark` do `tokens.css` para toda chave em `CSS_VARS_TO_APPLY`. O teste falha → ou a fórmula não reproduz o 221, ou o tokens.css precisa de ajuste cosmético registrado.

### 2.5 Contrato de storage v6 (`localStorage['theme-custom-colors']`)
```json
{ "v": 6, "preset": "gx-classic", "borderRadius": 10,
  "cacheMode": "dark", "cachePreset": "gx-classic", "cssVarsCache": { "background": "265 22% 8%", "...": "..." } }
```
- `preset`/`borderRadius` = config do usuário (escritos por `saveThemeConfig`, sempre com merge preservando os campos de cache).
- `cacheMode`/`cachePreset`/`cssVarsCache` = **escritos exclusivamente por `applyThemePreset`** (etapa 21), após aplicar. Mais ninguém grava `cssVarsCache` (grep na etapa 36 garante).
- Modo claro/escuro **não** mora aqui — continua em `localStorage['theme']` (`useTheme`).
- Migração: `v:5` → ids pelo `LEGACY_ID_MAP`, radius mantido (clamp 0–20), regrava `v:6`. `v<5`/inválido → default.
- Boot (`index.html`): `v===6 && cacheMode === modoResolvido` → aplica `cssVarsCache` + `--radius` (clamp) + `data-preset-id`; `v===5` → não aplica, não remove (React migra); outro → remove.

### 2.6 Comportamentos da página (paridade PG)
- Clicar num card **aplica e salva na hora** (auto-save); toast `Tema "X" aplicado!`.
- **Salvar**: grava explicitamente; sucesso → toast `Tema salvo com sucesso!` (`Skin "X" aplicada.`); falha (quota/privado) → toast de erro e o dot vermelho pulsante no botão fica aceso (`hasUnsavedChanges`).
- **Original**: `AlertDialog` "Restaurar tema original?" → `clearThemeOverrides()` + config default + save → toast `Tema restaurado ao padrão`.
- Trocar para GX → raio vai para 10; voltar para clássica → raio 14; o usuário pode mover o slider depois (snap, não lock).
- Skin muda em todas as abas abertas (evento `storage`) sem reload.
- `<html data-preset-id="…">` sempre estampado; `diversity` liga o CSS rainbow.
- Modo de Cor troca `resolvedTheme` → `ThemeInitializer` reaplica `preset[light|dark]` e atualiza o cache.

---

## 3. ARQUITETURA DA MUDANÇA

### 3.1 Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `src/components/settings/theme/presets.ts` | **reescrita** — catálogo 19, pipeline GX, storage v6, apply/clear/radius, export/import |
| `src/components/settings/theme/useThemePreset.ts` | **reescrita** — hook fino da página (config/savedConfig/snap/save/reset) |
| `src/components/settings/ThemeCustomizer.tsx` | **reescrita** — header PG + Modo de Cor + 2 seções + raio |
| `src/components/settings/theme/PresetCard.tsx` | **reescrita** — porta do PG |
| `src/components/settings/theme/BorderRadiusControl.tsx` | **reescrita** — presets rápidos + API `{value,onChange(n)}` |
| `src/components/ThemeInitializer.tsx` | **reescrita** — restore + sync entre abas, sem clamp 14, sem escrita própria |
| `index.html` | boot: v6 + `cacheMode` + `data-preset-id` + clamp |
| `src/styles/tokens.css` | só linhas apontadas pelo teste de sincronia (registradas) |
| `src/index.css` | `@import './styles/diversity-overrides.css'` |
| `src/components/layout/Sidebar.tsx` | classe `sidebar-logo-tile` no tile do logo (1 linha) |

### 3.2 Arquivos novos
| Arquivo | Conteúdo |
|---|---|
| `src/components/settings/theme/ThemeResetDialog.tsx` | botão Original + AlertDialog |
| `src/styles/diversity-overrides.css` | porta do PG + regra do logo |
| `src/components/settings/theme/__tests__/presets.test.ts` | porta adaptada da suíte PG (§1–§12) + §3 GX ativa + contraste |
| `src/components/settings/theme/__tests__/tokens-sync.test.ts` | `corporate` ≡ `tokens.css` |
| `src/components/settings/theme/__tests__/theme-storage.test.ts` | v5→v6, clamp, quota, cache preservado |
| `src/components/settings/theme/__tests__/PresetCard.test.tsx`, `BorderRadiusControl.test.tsx` | a11y e API |
| `src/components/settings/__tests__/ThemeCustomizer.test.tsx` | página |
| `src/components/__tests__/ThemeInitializer.test.tsx` | boot + storage event sem loop |
| `docs/design/SKINS_OPERA_GX_STATUS.md` | ledger (Apêndice F) |
| `/workspace/qa/skins-*.mjs` (fora do repo) | Apêndice E |

### 3.3 O que NÃO tocar
`src/hooks/ui/useTheme.ts`, `AppProviders.tsx`, `ViewRouter.tsx`, `lazyViews.ts`, `tailwind.config.ts`, `base.css`, `AppearanceSettings.tsx`, `HighContrastToggle.tsx`, `sidebarNavConfig`, qualquer coisa em `supabase/`, `scripts/ci/*` e baselines, `docs/design/*` anteriores.

---

## 4. CONTRATO DE FUNCIONALIDADES PRESERVADAS (checar no CP9)
Modo de Cor Claro/Escuro/Sistema (`useTheme`) e o select "Tema" em Aparência · rota `?view=themes` e item "Skins" na sidebar (grupo Sistema) · botão voltar · slider de raio com preview ao vivo · toast ao aplicar · `theme-transitioning` suave · boot sem flash de modo (classe `dark` antes do React) · Alto contraste / Reduzir movimento / Texto grande · densidade · `StarBackground` no dark · Teletransporte/BreadcrumbBar · usuário QA e toda a suíte de testes existente.

**Fora de escopo (observado, vai para "Próximos passos", não corrigir aqui):** parâmetros `wizard=new&step=1&cat=…` vazando do Catálogo para outras views na URL; trilha "Skins › Skins" (é histórico de navegação, não hierarquia); `:root` do tokens.css define `--surface`/`--divider`/`--border-strong` com valores **dark** também no modo claro (bug pré-existente do light).
---

## 5. O PLANO — 100 ETAPAS · 12 FASES · 12 CHECKPOINTS

Formato: `[ ] N. Ação — arquivo — DoD`. Marque `[x]` **só** com a evidência no ledger.

### FASE 0 — Preparação e diagnóstico (etapas 1–8) → CP0

- [ ] **1.** Worktree próprio, sem tocar no checkout principal: `cd /workspace/repos/Zapp_Web_V2 && git fetch origin && S=$(date +%y%m%d-%H%M) && git worktree add /workspace/repos/Zapp_Web_V2-skins -b claude/feat-skins-opera-gx-$S origin/main && ln -s /workspace/repos/Zapp_Web_V2/node_modules /workspace/repos/Zapp_Web_V2-skins/node_modules`. — DoD: caminho, branch e `git rev-parse HEAD` (≥ `196e1808`) no ledger. **JÁ EXECUTADO pelo tech lead ao disparar esta sessão: worktree em `/workspace/repos/Zapp_Web_V2-skins`, branch `claude/feat-skins-opera-gx-260923-1229`, HEAD `71befc7d`. Confirme com `git -C /workspace/repos/Zapp_Web_V2-skins status` e prossiga.**
- [ ] **2.** PRs abertas (`gh pr list --state open` ou API): se alguma tocar `presets.ts`, `useThemePreset.ts`, `ThemeCustomizer.tsx`, `ThemeInitializer.tsx`, `index.html` ou `tokens.css` → **pare e avise**. — DoD: lista no ledger. **JÁ VERIFICADO pelo tech lead: PRs abertas #540 (evolution-api-proxy) e #537 (hooks unmount) — nenhuma toca os arquivos deste plano. Registre e prossiga.**
- [ ] **3.** Grafo antes de grep: se `graphify-out/GRAPH_REPORT.md` existir, confira o commit de origem vs `HEAD` (divergiu → `. /workspace/.local/env.sh && graphify update . --force`); `graphify explain "presets"`, `graphify path "ThemeCustomizer" "tokens.css"`, `graphify explain "ThemeInitializer"`. Confirme que só `ThemeInitializer` e `useThemePreset` importam `presets.ts`. — DoD: consumidores listados; divergências com a seção 1 anotadas.
- [ ] **4.** Crie `docs/design/SKINS_OPERA_GX_STATUS.md` (Apêndice F). Commit `chore(skins): ledger do sistema de skins`. — DoD: arquivo commitado.
- [ ] **5.** Fonte de valores da referência: `mkdir -p /workspace/qa/ref && (git -C /workspace/repos/Promo_Gifts_V4 show cff6e9f0:src/lib/theme-presets.ts 2>/dev/null || curl -fsSL https://raw.githubusercontent.com/adm01-debug/Promo_Gifts_V4/cff6e9f0947c477736fb58c832c4120d38efb2af/src/lib/theme-presets.ts) > /workspace/qa/ref/pg-theme-presets.ts`. Idem para `tests/lib/theme-presets.test.ts` → `/workspace/qa/ref/pg-theme-presets.test.ts`. — DoD: `sha256sum` dos dois no ledger.
- [ ] **6.** Ferramentas de QA: `cd /workspace/qa && node -e "require('playwright');require('pngjs');require('pixelmatch')"`; `grep -cE 'ZAPP_QA_(EMAIL|PASSWORD)' /workspace/.secrets/zapp-v2.env` = 2. Se faltar algo, reinstale (`npm i playwright@1.56 pngjs pixelmatch && npx playwright install chromium`). — DoD: sem erro.
- [ ] **7.** Baseline verde **antes** de mexer: `cd /workspace/repos/Zapp_Web_V2-skins && bun install --frozen-lockfile && bun run typecheck; node scripts/ci/lint-ratchet.mjs; node scripts/ci/typecheck-ratchet.mjs; bun run implicit-any-check; npx vitest run src/components/settings`. Timeout conhecido do `tsc -b` → `npx tsc --noEmit -p tsconfig.app.json` e registre. — DoD: 5 saídas com exit 0 (ou timeout registrado + fallback 0).
- [ ] **8.** Preview local + ANTES + estado do deploy: `bun run build && (bun run preview --port 4173 --host 127.0.0.1 >/workspace/qa/preview.log 2>&1 & echo $! > /workspace/qa/preview.pid)`; `node /workspace/qa/skins-shot.mjs http://127.0.0.1:4173 out/00-before-themes.png` (Apêndice E.1, só o screenshot da página). Em paralelo, registre o estado da Vercel (último deployment de `main` via MCP Vercel `list_deployments` no projeto `prj_J4wb8egzz8iL1CJnSOXJDtqnbvRp` ou o check "Vercel" do último commit em `main` via `github_list_commit_statuses`) — esse MCP não está disponível dentro do container; registre no ledger "DEPLOY: verificar externamente" e prossiga sem bloquear. — DoD: `00-before-themes.png` + linha `DEPLOY: ok | bloqueado (motivo) | verificar externamente` no ledger.

**CP0 — Ambiente pronto.** Gate: etapas 1–8 com evidência. Sem `00-before-themes.png`, CP0 não fecha.

### FASE 1 — Núcleo: `presets.ts` reescrito (etapas 9–24) → CP1

- [ ] **9.** `presets.ts`: novo `ThemeModeColors` **estrito** (sem `[key: string]: string`) com todas as chaves dos grupos A e B da seção 2.3 (≈90). Remover `label`/`hue` do `ThemePreset`; adicionar `category: 'classic' | 'gx'`, `borderRadius?: number`, `font?: string`, `swatches: [string,string,string,string]`. — DoD: `bun run typecheck` aponta só os consumidores (`useThemePreset`, `ThemeCustomizer`, `PresetCard`, `ThemeInitializer`) — serão reescritos nas fases 3–5.
- [ ] **10.** `PresetParams { id,name,description,emoji,h,s,l,gh,sh,ss,sl }` e `buildPreset(p)`. Bloco `light`: `:root` do tokens.css com `221 → h` e primária/secundária dos params. Bloco `dark`: neutros charcoal **fixos** (seção 2.4) + primária dos params. **A causa raiz #1 morre aqui: `dark.primary = `${h} ${s}% ${l}%`, nunca literal.** — DoD: `buildPreset({...,h:347,s:96,l:54}).dark.primary === '347 96% 54%'` e `.light.background === '347 20% 97%'`.
- [ ] **11.** Fórmulas derivadas da seção 2.4 para todos os tokens do grupo B (glow, hover/active, ring/sidebar/chat/status/xp/chart-1, gradientes, glows, border-strong, kpi-tile-blue, tonal `primary-50…950`). Tonal: copiar as duas tabelas (`:root` e `.dark`) do tokens.css como constantes `TONAL_LIGHT`/`TONAL_DARK` de `[s,l]` por degrau e gerar `${h} ${s}% ${l}%`. — DoD: para `h=221` o resultado bate com tokens.css (teste da etapa 25).
- [ ] **12.** Tokens semânticos fixos (grupo C) documentados num comentário `FIXED_TOKENS` no topo do arquivo e **ausentes** de `ThemeModeColors`. — DoD: `success`, `whatsapp`, `kpi-tile-green` não aparecem em `CSS_VARS_TO_APPLY`.
- [ ] **13.** `swatches` como no PG: `[hsl(h s l), hsl(sh ss sl), hsl(gh max(s-5,0) min(l+6,100)), hsl(h round(s/2) min(l+15,100))]`. **Causa raiz #2 morre aqui.** — DoD: `new Set(corporate.swatches).size === 4`.
- [ ] **14.** `CSS_VARS_TO_APPLY: readonly (keyof ThemeModeColors)[]` congelado (`as const`), sem duplicatas, mesmo conjunto das chaves do tipo (teste garante). — DoD: teste §12.
- [ ] **15.** 10 skins clássicas com os parâmetros **exatos** do Apêndice A (ids, nomes, emoji, descrições, `category:'classic'`), `corporate` primeira. — DoD: `THEME_PRESETS.slice(0,10).map(p=>p.id)` = lista do Apêndice A.
- [ ] **16.** `diversity`: `diversityBase = buildPreset({h:330,s:85,l:55,gh:290,sh:130,ss:70,sl:45,…})` + constantes `PRIDE_RED/ORANGE/YELLOW/GREEN/BLUE/PURPLE/PINK`, `rainbowGrad`, `rainbowDivider` e os overrides light/dark do PG (primary pink `330 85% 52%` light / `330 85% 60%` dark, secondary verde pride, accent amarelo/violeta, sidebar-*, ring, gradient-primary/secondary/novelty→`gradient-vibrant`/hero→`gradient-purple-green`/divider/surface rainbow, shadow-glow-* multicoloridos, `chart-1`). Adaptar chaves: sem `orange`/`interactive`; com `status-open`, `chat-bubble-sent`, `xp`, `kpi-tile-blue*` = pink. Swatches `[red, yellow, green, purple]`. — DoD: `diversity.light['gradient-primary']` contém as 6 cores; `diversity.dark.accent` começa com `280 `.
- [ ] **17.** Pipeline GX portada: `applyGxDarkSurfaces` (tabela 2.4 GX, **incluindo** `chat-header`, `chat-input-bg`, `chat-bubble-received`, `surface`, `surface-hover`, `divider`, `elevated*`, `glass-bg`, `gradient-surface`), `boostGlowAlpha(shadow, alpha)` (regex na **1ª** ocorrência `/\/\s*[0-9.]+\s*\)/`), `applyGxNeonGlow` (light 0.45/0.4; dark 0.7/0.65), `applyGxGlass` (glass-bg `265 22% 12% / 0.55` dark, `0 0% 100% / 0.55` light; glass-border tingida `${h} ${min(100,s+5)}% ${l}% / 0.5`), `buildGxPreset` → `category:'gx'`, `borderRadius: 10`, **sem `font`** (D1), `withDarkPrimaryFg` (`primary-foreground`/`sidebar-primary-foreground` = `222 25% 10%` nos dois modos). — DoD: `gx-classic.dark.background === '265 22% 8%'`; `gx-classic.dark['shadow-glow-primary']` casa `/\/\s*0\.7\s*\)/`.
- [ ] **18.** 9 GX com parâmetros do Apêndice A; `withDarkPrimaryFg` em `gx-rose-quartz`, `gx-hackerman`, `gx-frutti-di-mare`, `gx-cyberpunk`, `gx-razer`. — DoD: `THEME_PRESETS.length === 19`, ids únicos, ordem clássicas→GX.
- [ ] **19.** `getPresetById(id)`, `classicPresets`/`gxPresets` (filtros exportados) para a página. — DoD: 10 e 9.
- [ ] **20.** Storage (seção 2.5): `STORAGE_KEY = 'theme-custom-colors'`, `STORAGE_VERSION = 6`, `ThemeConfig { preset: string; borderRadius: number }`, `getDefaultConfig() = { preset:'corporate', borderRadius:14 }`, `LEGACY_ID_MAP = { default:'corporate', forest:'emerald', teal:'cyber', purple:'purpure' }`, `normalizePresetId(id)`, `loadThemeConfig()` (v6 → lê; v5 → migra ids, mantém radius; radius não-finito → 14, clamp 0–20; id desconhecido → corporate; JSON inválido/indisponível → default), `saveThemeConfig(cfg): boolean` (**merge** com o objeto salvo preservando `cacheMode/cachePreset/cssVarsCache`, sempre `v: 6`, `try/catch` → `false` + `console.error`). — DoD: testes §8 e `theme-storage.test.ts`.
- [ ] **21.** `applyThemePreset(presetId, mode: 'light'|'dark', opts?: { persistCache?: boolean })`: no-op se id desconhecido; `root.classList.add('theme-transitioning')` com **timer único** módulo-level (`_transitionTimer`, 500ms, `clearTimeout` antes de reagendar — BUG-THEME-03); `root.dataset.presetId = id`; `setProperty` de todos `CSS_VARS_TO_APPLY`; `--radius` se `preset.borderRadius` definido; `--font-sans/--font-display` se `preset.font` definido, senão `removeProperty` (restaura tokens.css); se `persistCache !== false` → grava `{cacheMode: mode, cachePreset: id, cssVarsCache}` com merge (**único escritor de cache — causa raiz #3 morre aqui**). — DoD: testes §5.
- [ ] **22.** `applyRadius(px)`: `safe = isFinite(px) ? clamp(px,0,20) : 14` → `--radius = ${safe/16}rem`. `clearThemeOverrides()`: remove todos `CSS_VARS_TO_APPLY`, `--radius`, `--font-*`, `delete root.dataset.presetId` (BUG-THEME-02) e limpa os campos de cache no storage. — DoD: testes §6/§7.
- [ ] **23.** `exportThemeConfig(cfg): string` e `importThemeConfig(json): ThemeConfig | null` (valida `preset` existente, `borderRadius` numérico, aplica clamp). Sem UI (D4). — DoD: teste §9.
- [ ] **24.** Commit `feat(skins): catálogo de 19 skins, pipeline Opera GX e storage v6 (presets.ts)`. Push `--no-verify`. — DoD: SHA no ledger. (`typecheck` ainda pode acusar os 4 consumidores — registre; zera na Fase 5.)

**CP1 — Núcleo.** Gate: `npx vitest run src/components/settings/theme/__tests__/presets.test.ts` com a porta mínima das seções §1, §2, §4, §12 (etapa 66 completa o resto) — ≥ 30 asserts verdes; `node -e` que importa o módulo via `tsx` e imprime `THEME_PRESETS.map(p=>[p.id,p.dark.primary])` mostrando **19 primárias diferentes**.

---

### FASE 2 — Sincronia `tokens.css` ↔ `corporate`, `data-preset-id`, Diversity (etapas 25–31) → CP2

- [ ] **25.** `__tests__/tokens-sync.test.ts`: lê `src/styles/tokens.css` (`fs.readFileSync`), extrai `--nome: valor;` dos blocos `:root` e `.dark` (regex por bloco, ignora comentários), e para cada chave de `CSS_VARS_TO_APPLY` compara com `corporate.light`/`corporate.dark` (normalizando espaços). Falhas listadas com `nome | tokens.css | preset`. — DoD: teste roda; lista de divergências no ledger.
- [ ] **26.** Reconciliar cada divergência: (a) fórmula não reproduz o 221 → conserte a fórmula; (b) diferença cosmética (ex.: `gradient-primary` `230 78% 57%` vs `230 83% 63%`) → ajuste a linha em `tokens.css` (as duas ocorrências, `:root` e `.dark`, quando aplicável) e registre `token | antes | depois | ΔE`. Nunca "resolver" removendo a chave do preset. — DoD: `tokens-sync.test.ts` verde; tabela no ledger.
- [ ] **27.** `src/styles/diversity-overrides.css`: porta integral do PG (mesmos 13 blocos + fix de gradientes sólidos), adicionando `html[data-preset-id="diversity"] .sidebar-logo-tile { background: var(--_rb); }`. `src/index.css`: `@import './styles/diversity-overrides.css';` **depois** de `tokens.css` e `base.css`. — DoD: `grep -c 'data-preset-id="diversity"' src/styles/diversity-overrides.css` ≥ 13; build ok.
- [ ] **28.** `Sidebar.tsx`: `grep -n 'ZAPP' src/components/layout/Sidebar.tsx` → no tile do logo (o quadrado com "Z"), adicionar a classe `sidebar-logo-tile`. Uma linha. — DoD: diff de 1 linha.
- [ ] **29.** Coexistência de `theme-transitioning`: `useTheme` (350ms, `<html>`+`<body>`) e `applyThemePreset` (500ms, `<html>`) removem a mesma classe; o pior caso é a transição terminar 150ms antes — aceitável. Registrar. — DoD: nota no ledger.
- [ ] **30.** Grep de azul hardcoded nas áreas que a skin precisa pintar: `grep -rnE "hsl\(221 |#2563eb|#3b82f6|#1470ff|bg-blue-|text-blue-|border-blue-" src/components/layout src/components/settings src/styles | grep -v tokens.css`. Trocar por token **só** nesses três diretórios; o resto vai para "Pendências". — DoD: lista (antes/depois) no ledger.
- [ ] **31.** Commit `feat(skins): sincronia tokens↔corporate, diversity overrides e data-preset-id`. Push. — DoD: SHA.

**CP2 — Sincronia.** Gate: `tokens-sync.test.ts` verde; `git diff --stat src/styles/tokens.css` só com as linhas registradas na etapa 26.

---

### FASE 3 — Storage v6, `ThemeInitializer` e boot (etapas 32–41) → CP3

- [ ] **32.** `ThemeInitializer.tsx` reescrito (Apêndice D): `useEffect([resolvedTheme])` → `const cfg = loadThemeConfig(); applyThemePreset(cfg.preset, resolvedTheme); applyRadius(cfg.borderRadius);`. **Sem** `Math.max(radius,14)` (causa raiz #4), **sem** `localStorage.setItem` próprio (cache vem do `applyThemePreset`), sem `requestAnimationFrame` (o PG aplica direto no effect; encurta a janela de FOUC). Log via `getLogger('ThemeInitializer')` mantido. — DoD: `grep -c setItem src/components/ThemeInitializer.tsx` = 0.
- [ ] **33.** Sync entre abas: segundo `useEffect` com listener `storage` (`e.key === STORAGE_KEY && e.newValue`) → `parse` → `applyThemePreset(cfg.preset, resolvedTheme, { persistCache: false })` + `applyRadius`. **`persistCache:false` é obrigatório**: sem ele, aba A grava cache → aba B recebe evento e regrava (com `cacheMode` diferente se uma está em light) → ping-pong infinito. — DoD: teste da etapa 40 com `spy(setItem)` ≤ 1 chamada após `StorageEvent`.
- [ ] **34.** Migração v5→v6 acontece dentro de `loadThemeConfig()` (etapa 20) no primeiro mount. Caso de teste canônico: `{v:5, preset:'forest', borderRadius:8, cssVarsCache:{...}}` → após mount, storage = `{v:6, preset:'emerald', borderRadius:8, cacheMode:'dark', cachePreset:'emerald', cssVarsCache:{...novo}}`. — DoD: teste verde.
- [ ] **35.** `index.html` boot (Apêndice C): `if (c.v === 6) { if (c.cacheMode === (isDark?'dark':'light') && c.cssVarsCache) {aplica vars}; if (c.borderRadius != null) {clamp 0..20 → --radius}; if (c.preset) root.setAttribute('data-preset-id', c.preset); } else if (c.v !== 5) { removeItem }`. **Causa raiz #6 morre na checagem de `cacheMode`.** — DoD: código presente; `grep -c "c.v === 5" index.html` = 1 (só no `else if`).
- [ ] **36.** Único escritor de cache: `grep -rn "cssVarsCache" src/ index.html` deve listar só `presets.ts` (escrita), `index.html` (leitura) e tipos. `useThemePreset.ts` antigo ainda referencia → será reescrito na Fase 4; anote. — DoD: grep no ledger.
- [ ] **37.** `AppProviders.tsx`: ordem `<ThemeSync/>` → `<ThemeInitializer/>` inalterada. — DoD: `git diff src/providers/AppProviders.tsx` vazio.
- [ ] **38.** Modo claro: com skin `gx-classic` salva, `useTheme.setTheme('light')` → efeito em `resolvedTheme` reaplica `preset.light` e o cache vira `cacheMode:'light'`. — DoD: verificado no preview (console: `JSON.parse(localStorage['theme-custom-colors']).cacheMode`).
- [ ] **39.** Radius no boot e no initializer usam o **mesmo** clamp (0–20, NaN→14); reset do `useTheme` não mexe em radius. — DoD: teste `theme-storage.test.ts` (`borderRadius: 999` → 20; `'abc'` → 14).
- [ ] **40.** `src/components/__tests__/ThemeInitializer.test.tsx` (jsdom, `vi.mock('@/hooks/ui/useTheme')` retornando `resolvedTheme:'dark'`): (a) mount sem storage → `--primary` = `221 83% 53%`, `data-preset-id=corporate`, storage v6 gravado; (b) storage v5 `forest` → aplica `emerald` e migra; (c) `window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:JSON.stringify({v:6,preset:'gx-razer',borderRadius:10})}))` → `--primary` = `113 70% 51%` e `setItem` não chamado pelo handler. — DoD: 3 testes verdes.
- [ ] **41.** Commit `fix(skins): ThemeInitializer único escritor de cache, boot v6 com cacheMode, migração v5→v6`. Push. — DoD: SHA.

**CP3 — Boot.** Gate: no preview local (Playwright, Apêndice E.3): salvar `gx-classic`, recarregar com `waitUntil:'commit'` e ler `getComputedStyle(document.documentElement).getPropertyValue('--background')` **antes** do React montar → `265 22% 8%`. Screenshot `03-boot.png`. Sem isso, o FOUC não foi resolvido.

### FASE 4 — Hook da página e `ThemeCustomizer` (etapas 42–50) → CP4

- [ ] **42.** `useThemePreset.ts` reescrito como hook fino (nome do arquivo mantido, export `useThemePreset`): estado `config`/`savedConfig` (`useState(loadThemeConfig)`), `hasUnsavedChanges` (JSON compare), `applyAll(cfg)` = `applyThemePreset(cfg.preset, resolvedTheme) + applyRadius(cfg.borderRadius)` em `useEffect([config, resolvedTheme])`, `updateConfig(partial)` com **snap de raio** (novo preset com `borderRadius` → usa; saindo de um preset com `borderRadius` para um sem → `getDefaultConfig().borderRadius`) + auto-save (`saveThemeConfig` → se `true`, `setSavedConfig`), `handleSave` (toast sucesso `Tema salvo com sucesso!` + description `Skin "${name}" aplicada.` / erro `Não foi possível salvar o tema` + description do PG), `handleReset` (`clearThemeOverrides(); const def = getDefaultConfig(); setConfig(def); saveThemeConfig(def)…` + toasts do PG), `applyPreset(id)` = `updateConfig({preset:id})` + toast `Tema "${name}" aplicado!`. Sem export/import de arquivo. — DoD: ≤ 120 linhas; `grep -c "createElement('input')"` = 0.
- [ ] **43.** `ThemeCustomizer.tsx` header: `[← voltar] [Palette] Skins  [badge: ✓ {nome da skin ativa}]` à esquerda; `[Salvar (Save) + dot bg-destructive animate-pulse se hasUnsavedChanges] [ThemeResetDialog]` à direita; subtítulo "Escolha sua skin favorita" mantido. **Sem sticky** (D7). `data-testid="theme-save"`. — DoD: DOM com um `[data-testid=theme-save]` e um `[data-testid=theme-reset]`.
- [ ] **44.** Card "Modo de Cor" (Claro/Escuro/Sistema) **inalterado** — mesmo JSX, mesma posição, mesmos tooltips. — DoD: bloco copiado byte a byte.
- [ ] **45.** Seção "Skins clássicas" — `Sparkles` + `h2` "Skins clássicas" + `(10)`; grid `grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5` com `role="radiogroup" aria-label="Skins clássicas" data-testid="skins-classic-grid"`, 10 `PresetCard`. — DoD: 10 cards.
- [ ] **46.** Seção "Skins Opera GX" — `Gamepad2` + `h2` + `(9)` + badge `GAMER` (`rounded-md border border-primary/30 bg-primary/15 text-[10px] font-bold uppercase tracking-wide text-primary`); grid idem, `aria-label="Skins Opera GX"`, `data-testid="skins-gx-grid"`. — DoD: 9 cards.
- [ ] **47.** `<BorderRadiusControl value={config.borderRadius} onChange={(v) => updateConfig({ borderRadius: v })} />` (nova API da etapa 52). — DoD: typecheck.
- [ ] **48.** Motion: `fadeUp` (hidden `{opacity:0,y:16}` → visible com `delay: i*0.08, duration:.4`) nas 4 seções e nos cards (`custom={2.5 + i*0.05}`), como no PG. `grep -n "export" src/components/ui/motion.tsx` — se o wrapper exportar `motion`, usar ele (é o padrão do repo, ver `AppearanceSettings`); senão `framer-motion`. `useReducedMotion()` → `initial={false}`. — DoD: sem warning de ref no console.
- [ ] **49.** Textos exatos (pt-BR, iguais ao PG): `Tema "X" aplicado!` · `Tema salvo com sucesso!` / `Skin "X" aplicada.` · `Não foi possível salvar o tema` / `O armazenamento local está indisponível ou cheio. Tente em uma janela normal.` · `Tema restaurado ao padrão` · `Restaurar tema original?` · `Isso irá reverter a skin, modo de cor e raio de borda para os valores padrão. Essa ação não pode ser desfeita.` (no Zapp o modo de cor **não** é revertido — ajustar a frase para "a skin e o raio de borda"). — DoD: strings no código.
- [ ] **50.** Commit `feat(skins): página Skins com categorias clássicas/GX, salvar real e reset com confirmação`. Push. — DoD: SHA; `typecheck` 0 (todos os consumidores reescritos).

**CP4 — Página.** Gate: screenshot `04-page.png` (1440×900) mostrando 10 + 9 cards com barras de cor **distintas**; clicar `gx-classic` → `--primary` = `347 96% 54%`, `--background` = `265 22% 8%`, sidebar roxa (pixel em (100,400) ΔE ≤ 6 de `hsl(265 24% 10%)`).

---

### FASE 5 — `PresetCard`, `BorderRadiusControl`, `ThemeResetDialog` (etapas 51–58) → CP5

- [ ] **51.** `PresetCard.tsx` porta do PG: `Tooltip` (nome + descrição + "✓ Skin ativa"), `motion.div whileHover={{scale:1.04,y:-2}} whileTap={{scale:.96}}`, glow radial quando ativo (`radial-gradient(ellipse at 50% 0%, ${swatches[0]}15 0%, transparent 70%)`), barra de swatches `h-8 rounded-lg` com 4 `motion.div` (altura 32→36 e opacidade .9→1 no hover, `delay: i*0.03`) + shimmer `via-white/20`, emoji + `h3` nome (`font-display text-xs font-bold truncate`), `AnimatePresence` check (spring 500/25) ou `Eye` no hover, descrição `text-[11px] italic`. A11y: `role="radio"`, `aria-checked`, `aria-label={`Skin ${name}: ${description}`}`, `tabIndex={0}`, Enter/Space. `data-testid={`preset-card-${id}`}`. Classes ativo/inativo do PG. — DoD: axe sem violação; `getByRole('radio', {name:/Skin GX Classic/})` encontra.
- [ ] **52.** `BorderRadiusControl.tsx` porta do PG com API `{ value: number; onChange: (v: number) => void }`: header (`SlidersHorizontal` + "Raio da Borda" + `{value}px` mono), `QUICK_PRESETS` Reto 0 / Sutil 4 / Médio 8 / Suave 12 / Redondo 20 (`data-testid="radius-preset-{v}"`, ativo `bg-primary text-primary-foreground`), `Slider min 0 max 20 step 1 aria-label="Raio da borda em pixels"`, labels 0/20, "Preview em tempo real" com as 3 linhas — **manter o preview atual do Zapp** (já é o mesmo conteúdo: Enviar/Curtir/Config/Excluir, Buscar + Novo + 3, João da Silva). — DoD: 5 botões rápidos; `onChange(20)` ao clicar Redondo.
- [ ] **53.** `ThemeResetDialog.tsx` novo com `AlertDialog` do shadcn: trigger `Button variant="outline" size="sm"` classes destructive do PG + `RotateCcw` + "Original" (`data-testid="theme-reset"`); `AlertDialogContent` com título/descrição da etapa 49, `AlertDialogCancel` "Cancelar", `AlertDialogAction` "Restaurar padrão" → `onConfirm`. `data-testid="theme-reset-dialog"` no content. — DoD: abre, cancela, confirma.
- [ ] **54.** Roving por setas (D6): no grid, `onKeyDown` — `ArrowRight/ArrowLeft` movem foco entre `[role=radio]` irmãos (wrap), `Home/End` primeiro/último. ≈10 linhas num helper `focusSibling(e, dir)` compartilhado pelos 2 grids. — DoD: teste com `userEvent.keyboard('{ArrowRight}')`.
- [ ] **55.** Skeleton/empty state: não se aplica (catálogo estático). — DoD: linha `n/a` no ledger.
- [ ] **56.** `useReducedMotion()` no `PresetCard` (sem hover scale/shimmer) e no `fadeUp`. — DoD: com `emulateMedia({reducedMotion:'reduce'})` nenhum `transform` animado nos cards.
- [ ] **57.** Mobile 390×844: grids em 2 colunas, header em `flex-wrap`, sem overflow horizontal. — DoD: `document.documentElement.scrollWidth <= innerWidth` (screenshot `05-mobile.png`).
- [ ] **58.** Commit `feat(skins): PresetCard com tooltip/a11y, raio com presets rápidos, diálogo de reset`. Push. — DoD: SHA.

**CP5 — Componentes.** Gate: E.2 → `swatchBar=32±2`, `cardsPerRow=5` em 1440, `radiusPresets=5`, dialog abre/fecha; `05-mobile.png` sem overflow.

---

### FASE 6 — Cobertura profunda de tokens (etapas 59–65) → CP6

- [ ] **59.** Inventário de consumo: `grep -rhoE "var\(--[a-z0-9-]+\)" src | sort | uniq -c | sort -rn > /workspace/qa/out/06-tokens-usage.txt` e `grep -rhoE "\b(bg|text|border|ring|from|via|to|shadow)-(primary|tonal|kpi|xp|chat|sidebar|status|glow)[a-z0-9/-]*" src | sort | uniq -c | sort -rn > 06-classes-usage.txt`. Marcar cada token como **A/B (no preset)**, **C (fixo)** ou **FALTA**. — DoD: tabela no ledger, zero "FALTA" sem decisão.
- [ ] **60.** Para cada FALTA que carrega azul 221 (candidatos: `--chart-9`, `--gradient-secondary` light, `--shadow-glow-accent` light, `--neutral-*` — decidir: `neutral-*` fica **C**, é neutro por definição): adicionar ao grupo B com fórmula, ou declarar C com justificativa. — DoD: `CSS_VARS_TO_APPLY` final e `tokens-sync.test.ts` ainda verde.
- [ ] **61.** Verificação visual por skin nas 4 telas mais usadas: `?view=inbox`, `?view=contacts`, `?view=dashboard`, `?view=settings` com `gx-classic` (vermelho/roxo) e `diversity` (rainbow) → 8 screenshots `06-<view>-<skin>.png`. Procurar resíduo azul 221 em botões primários, tabs ativas, tiles KPI, badge de não-lidos, links (amostra de pixel nos 5 pontos mais visíveis de cada tela; qualquer pixel com hue 215–225 e S > 60% em elemento "primário" é resíduo). — DoD: 8 shots + lista `tela | elemento | classe | token` de resíduos.
- [ ] **62.** Corrigir resíduos **só** em `src/components/layout/*`, `src/components/settings/*` e nos tiles KPI de Contatos (`ContactKpiCard` usa `bg-kpi-blue` → já coberto pelo grupo B). Resíduos em inbox/dashboard/outros módulos → "Pendências" com a lista exata. — DoD: shots refeitos das telas corrigidas.
- [ ] **63.** `StarBackground.tsx` (fundo dark): confirmar que a cor dos pontos vem de `text-primary`/`bg-primary` ou token, não hex. — DoD: grep.
- [ ] **64.** `HighContrastProvider` (`--contrast-multiplier`, classes) e `useDensity` não colidem com `CSS_VARS_TO_APPLY`. — DoD: `comm` entre a lista de vars deles e a nossa = vazio.
- [ ] **65.** Commit `feat(skins): cobertura de tokens derivados (tonal, kpi, gradientes, glows)`. Push. — DoD: SHA.

**CP6 — Cobertura.** Gate: inventário fechado; 8 shots com zero resíduo nas áreas de escopo; pendências listadas com caminho de arquivo.

---

### FASE 7 — Testes unitários (etapas 66–74) → CP7

- [ ] **66.** `__tests__/presets.test.ts` — porta adaptada da suíte do PG: §1 catálogo (19, ids únicos, name/description/emoji/swatches[4]/light/dark, ordem, corporate primeiro) · §2 clássicas (sem `borderRadius`, sem `font`, `category:'classic'`, 10 ids) · §4 pipeline GX (superfícies 265, alphas 0.45/0.7/0.4/0.65, estrutura do box-shadow, light não é roxo, glass) · §5 `applyThemePreset` (no-op, `--background`, light≠dark, todos os tokens, classe `theme-transitioning`, `--radius` 0.625rem nos GX, sem `--radius` nas clássicas, `data-preset-id`, cache gravado, `persistCache:false` não grava) · §6 `applyRadius` · §7 `clearThemeOverrides` · §8 storage · §9 import/export · §11 fluxos (GX primeira vez, GX→clássica, reload, alternar 9 GX, reset) · §11.5 Diversity · §12 edge cases. Adaptações: sem `font`/`orange`/`interactive`; `mode` não existe no config. — DoD: ≥ 90 testes verdes.
- [ ] **67.** §3 paridade GX (no PG está `describe.skip`) — aqui **ativa** com os HSL do Apêndice A (`gx-classic 347 96% 54%`, `gx-pink-addiction 330 95% 60%`, `gx-purple-haze 265 65% 50%`, `gx-rose-quartz 345 75% 68%`, `gx-ultraviolet 271 76% 53%`, `gx-hackerman 127 65% 46%`, `gx-frutti-di-mare 182 90% 42%`, `gx-cyberpunk 55 100% 51%`, `gx-razer 113 70% 51%`), `category:'gx'`, `borderRadius:10`, `font` undefined, `light.primary === dark.primary`. — DoD: 9×5 asserts.
- [ ] **68.** Contraste WCAG (teste puro, 30 linhas: hsl→rgb→luminância relativa→ratio): `primary` vs `primary-foreground` ≥ 3:1 e `sidebar-primary` vs `sidebar-primary-foreground` ≥ 3:1 para 19 skins × 2 modos. Falhou → ajustar `withDarkPrimaryFg` na skin (nunca baixar o limiar). — DoD: 76 asserts verdes; ratios mínimos no ledger.
- [ ] **69.** `tokens-sync.test.ts` (etapa 25) permanece na suíte. — DoD: verde.
- [ ] **70.** `theme-storage.test.ts`: v6 round-trip; v5 `forest/teal/purple/default` → ids novos; radius `999`→20, `-3`→0, `'abc'`→14, `NaN`→14; id fantasma → corporate mantendo radius; `saveThemeConfig` preserva `cssVarsCache` existente; quota (`Storage.prototype.setItem` lança) → `false`; JSON inválido → default. — DoD: ≥ 12 testes.
- [ ] **71.** `ThemeInitializer.test.tsx` (etapa 40) na suíte. — DoD: verde.
- [ ] **72.** `src/components/settings/__tests__/ThemeCustomizer.test.tsx` (mock `useTheme`, mock `sonner`): renderiza 10 + 9 radios; badge mostra "Padrão"; clicar `preset-card-gx-hackerman` → `data-preset-id`, storage v6 `preset:'gx-hackerman'`, `borderRadius:10`; clicar `preset-card-ocean` → radius 14; `theme-save` → `toast.success`; `theme-reset` → dialog → "Restaurar padrão" → `preset:'corporate'` e `data-preset-id` = `corporate`; `radius-preset-0` → `--radius` `0rem`. — DoD: ≥ 8 testes.
- [ ] **73.** `PresetCard.test.tsx` (role/aria/Enter/Space/aria-label) e `BorderRadiusControl.test.tsx` (5 presets, slider chama `onChange(number)`). — DoD: ≥ 6 testes.
- [ ] **74.** Commit `test(skins): suíte de presets, storage, initializer e página (porta da suíte Promo Gifts)`. Push. `npx vitest run src/components/settings src/components/__tests__` verde. — DoD: total de testes e tempo no ledger.

**CP7 — Testes.** Gate: número total de testes novos (alvo ≥ 130) e exit 0 no ledger.

---

### FASE 8 — QA visual local (etapas 75–82) → CP8

- [ ] **75.** Rebuild + preview: `kill $(cat /workspace/qa/preview.pid) 2>/dev/null; bun run build && (bun run preview --port 4173 --host 127.0.0.1 >/workspace/qa/preview.log 2>&1 & echo $! > /workspace/qa/preview.pid)`. — DoD: `curl -sI http://127.0.0.1:4173 | head -1` = 200.
- [ ] **76.** `/workspace/qa/skins-shot.mjs` (Apêndice E.1): login, `?view=themes`, tema dark; para cada um dos 19 ids: clique em `[data-testid="preset-card-{id}"]`, `waitForTimeout(600)`, lê `--primary`, `--background`, `--sidebar-background`, `--radius`, `data-preset-id`, screenshot `08-{id}.png` (1440×900); grava `08-skins.json`. — DoD: 19 PNG + JSON.
- [ ] **77.** `/workspace/qa/skins-assert.mjs` (Apêndice E.2): para cada id compara as vars lidas com o catálogo (string exata, exportado via `npx tsx -e`) **e** amostra de pixel (mediana 9×9) em sidebar (100,400) e fundo (900,520) vs `hsl→rgb` do preset (ΔE76 ≤ 6). — DoD: `19/19 OK` (vars) e `19/19 OK` (pixels) no ledger.
- [ ] **78.** Modo claro: `localStorage.theme='light'` → `corporate`, `gx-classic`, `diversity` → `08-light-{id}.png`; asserts de `--background` (`221 20% 97%` / `347 20% 97%` / `330 20% 97%`). — DoD: 3/3.
- [ ] **79.** Raio: clicar `radius-preset-0` → `--radius` `0rem` (`08-radius-0.png`); `radius-preset-20` → `1.25rem`; escolher GX → `0.625rem`; voltar a `corporate` → `0.875rem`. — DoD: 4 leituras.
- [ ] **80.** Sync entre abas: duas `page` no mesmo `context`; A em `?view=themes` escolhe `gx-razer`; B em `?view=contacts` — após 500ms `--primary` = `113 70% 51%` sem reload; storage escrito 1 vez (contar via `page.evaluate` de um `Proxy` em `setItem` instalado por `addInitScript`). — DoD: OK + contagem.
- [ ] **81.** Reduced motion: `context.emulateMedia({reducedMotion:'reduce'})` → `transitionDuration` `0s` e sem `transform` nos cards no hover. — DoD: OK.
- [ ] **82.** Loop de correção (máx 3 iterações por FAIL; cada iteração registrada com o que mudou). — DoD: tabela final no ledger.

**CP8 — Fidelidade.** Gate: 19/19 + 19/19, light 3/3, raio 4/4, sync OK, reduced-motion OK.

---

### FASE 9 — QA funcional E2E (etapas 83–90) → CP9

- [ ] **83.** `/workspace/qa/skins-func.mjs` (Apêndice E.4), checks 1–5: (1) `?view=themes` sem `console.error`; (2) 19 `[role=radio]`; (3) clique muda `--primary`; (4) reload mantém skin e raio; (5) **FOUC**: `page.goto(url,{waitUntil:'commit'})` + `evaluate` imediato → `--background` já é o da skin (antes de `#root` ter filhos). — DoD: 5 OK.
- [ ] **84.** Checks 6–9: (6) `Salvar` → toast "Tema salvo com sucesso!"; (7) `Original` → dialog → "Restaurar padrão" → `corporate` + `--radius 0.875rem` + toast; (8) storage v5 injetado (`addInitScript`: `{v:5,preset:'forest',borderRadius:8}`) → após load `data-preset-id=emerald`, storage `v:6`, radius 8 (não 14!); (9) GX→10, clássica→14, slider depois livre. — DoD: 4 OK.
- [ ] **85.** Checks 10–12: (10) Modo Claro mantém a skin (`--background` light da skin) e `cacheMode:'light'`; (11) quota: `addInitScript` sobrescrevendo `Storage.prototype.setItem` para lançar → clicar card → toast de erro **e** dot vermelho visível em `theme-save`; (12) teclado: `Tab` até o primeiro card, `ArrowRight` ×2, `Enter` → terceiro card ativo. — DoD: 3 OK.
- [ ] **86.** Checks 13–14: (13) mobile 390×844 sem overflow em `?view=themes`; (14) com `gx-classic`, abrir `inbox`, `contacts`, `dashboard`, `settings` sem `console.error` novo (comparar com a lista de erros pré-existentes do `00-before`). — DoD: 2 OK.
- [ ] **87.** Corrigir FAILs (máx 3 iterações; registrar). — DoD: 14/14.
- [ ] **88.** Diversity e foco visível: os overrides removem `ring-*`; o foco de teclado do Zapp usa `box-shadow` em `:focus-visible` (`base.css`) — confirmar com `Tab` em 3 botões que o anel de foco continua visível (screenshot `09-diversity-focus.png`). — DoD: visível.
- [ ] **89.** Regressão do select "Tema" em Aparência (`AppearanceSettings`): mudar para Claro ali e ver a skin acompanhar. — DoD: OK.
- [ ] **90.** Commit `fix(skins): ajustes do QA funcional`. Push. — DoD: SHA (ou "sem ajustes").

**CP9 — Funcional.** Gate: JSON `{ok:[14], fail:[], consoleErrors:[]}` no ledger + seção 4 conferida item a item.

### FASE 10 — Gates técnicos e limpeza (etapas 91–94) → CP10

- [ ] **91.** Gates completos: `bun run typecheck` (0; ou fallback registrado) · `node scripts/ci/lint-ratchet.mjs` · `node scripts/ci/typecheck-ratchet.mjs` · `bun run implicit-any-check` · `bun run lint` (sem erro **novo** — comparar com baseline da etapa 7) · `npx vitest run` (suíte inteira) · `bun run build` · tamanho gzip dos chunks que contêm `ThemeCustomizer`/`presets` (`ls -la dist/assets | grep -i theme` + `gzip -c … | wc -c`) vs `main`: Δ ≤ 12 KB gz (o catálogo cresce de 8 para 19 presets com ~90 tokens). — DoD: 8 saídas no ledger.
- [ ] **92.** Lint-ratchet acusou dívida nova por `contextHash`? Mover a inserção para depois do trecho legado; **não** tocar no baseline. — DoD: ratchet verde.
- [ ] **93.** Limpeza de código morto: `applyThemeColors`, `removeThemeColors`, `buildCustomPreset`, `normalizeStoredPresetId` (substituído), `label`/`hue` — `grep -rn` em `src/` para cada um; remover se 0 usos fora do módulo. — DoD: grep no ledger.
- [ ] **94.** Ledger: preencher a seção "Entrega" (resumo, arquivos, funcionalidades preservadas, resultados dos gates, screenshots, pendências honestas). — DoD: seção completa.

**CP10 — Técnico.** Gate: 8 gates verdes; `git diff --stat main` só nos arquivos da seção 3.

---

### FASE 11 — PR, merge e verificação de deploy (etapas 95–100) → CP11

- [ ] **95.** `git fetch origin && git rebase origin/main` (conflito só na própria branch), `bun run typecheck` de novo, `git push --no-verify --force-with-lease`. Confirmar que o último commit da branch é seu (`git log -1 --format=%an`). — DoD: branch em cima de `main`.
- [ ] **96.** PR para `main`: título `feat(skins): sistema de Skins Opera GX (paridade Promo Gifts V4) — 19 skins, storage v6, boot sem FOUC`. Corpo = seção "Entrega" do ledger + `00-before-themes.png` vs `08-corporate.png` / `08-gx-classic.png` / `08-diversity.png` + tabela dos 14 checks. — DoD: URL da PR.
- [ ] **97.** CI: aguardar checks; vermelho → `github_get_run_failure_summary` → corrigir → push. — DoD: checks verdes (ou motivo documentado se o check "Vercel" falhar por conta bloqueada — isso **não** é falha do código).
- [ ] **98.** Merge: escopo é 100% front (sem DDL, CI, segredos, Dockerfile) → **squash-merge autônomo** com CI verde e branch apagada. Exceção: se o único check vermelho for a Vercel bloqueada, mergear mesmo assim (o deploy é pré-existente e fora do escopo) e registrar. — DoD: SHA do merge.
- [ ] **99.** Deploy: deployment de produção do SHA do merge em `READY` na Vercel (`list_deployments`, `target: production`). Bloqueada → ledger `DEPLOY: bloqueado — requer ação de Joaquim em vercel.com (conta juca1)`; **pular a 100**. — DoD: estado + URL.
- [ ] **100.** Verificação em produção: `node /workspace/qa/skins-assert.mjs https://zapp-web-v2.vercel.app --only corporate,gx-classic,diversity` → `12-prod.png`, asserts OK. **Só então** escreva "concluído". Se a 99 bloqueou, a última linha do ledger é `ENTREGA: PR mergeada; deploy pendente de desbloqueio da Vercel`. — DoD: screenshot de produção + asserts, ou linha de bloqueio.

**CP11 — Entregue.** Gate: PR mergeada, ledger com as 12 seções preenchidas, "Pendências/resíduos" honesto.

---

## 6. CRITÉRIOS DE ACEITAÇÃO FINAIS
**Funcional:** 19 skins (10 clássicas + 9 GX + Diversity dentro das clássicas), cada uma com cores **diferentes** no modo escuro; GX com superfícies roxas `265 22% 8%` e raio 10; presets rápidos de raio; Salvar real com erro tratado; Original com confirmação; sync entre abas; migração v5→v6 sem perder raio; boot sem flash de cor (cache do modo correto); Modo de Cor preservado.
**Dados:** `corporate` ≡ `tokens.css` (teste); todos os tokens do grupo B mudam com a skin; grupo C nunca muda.
**Técnico:** typecheck 0, ratchets verdes, ≥ 130 testes novos verdes, suíte inteira verde, build ok, bundle Δ ≤ 12 KB gz, reduced-motion respeitado, contraste ≥ 3:1 em 19×2.
**Honestidade:** ledger com números e caminhos; deploy reportado como está.
---

## APÊNDICE A — Catálogo (parâmetros exatos, copiados do PG `cff6e9f0`)

| ordem | id | nome | emoji | descrição | h | s | l | gh | sh | ss | sl | extras |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `corporate` | Padrão | 💼 | Azul profissional | 221 | 83 | 53 | 230 | 215 | 70 | 55 | classic |
| 2 | `purpure` | Púrpure | 💜 | Roxo vibrante | 254 | 92 | 55 | 260 | 260 | 90 | 67 | classic |
| 3 | `emerald` | Esmeralda | 💎 | Verde sofisticado | 160 | 84 | 35 | 170 | 145 | 70 | 50 | classic |
| 4 | `sunset` | Pôr do Sol | 🌅 | Quente e acolhedor | 25 | 95 | 48 | 35 | 15 | 80 | 50 | classic |
| 5 | `rose` | Rosé | 🌸 | Elegante e moderno | 346 | 77 | 50 | 355 | 330 | 70 | 55 | classic |
| 6 | `minimal` | Minimal | ⚪ | Clean e neutro | 220 | 15 | 50 | 220 | 220 | 10 | 45 | classic |
| 7 | `ocean` | Oceano | 🌊 | Azul profundo | 200 | 85 | 48 | 210 | 190 | 75 | 50 | classic |
| 8 | `amber` | Âmbar | ✨ | Dourado e premium | 38 | 92 | 42 | 45 | 30 | 80 | 55 | classic |
| 9 | `cyber` | Cyber | 🤖 | Neon futurista | 180 | 100 | 30 | 300 | 320 | 100 | 60 | classic |
| 10 | `diversity` | Diversity | 🏳️‍🌈 | Pride 🏳️‍🌈 — celebrando a comunidade LGBTQIA+ | 330 | 85 | 55 | 290 | 130 | 70 | 45 | classic + overrides rainbow (etapa 16) |
| 11 | `gx-classic` | GX Classic | 🦈 | Vermelho neon assinatura do Opera GX | 347 | 96 | 54 | 340 | 280 | 60 | 40 | gx, r=10 |
| 12 | `gx-pink-addiction` | Pink Addiction | 🍭 | Rosa intenso e viciante | 330 | 95 | 60 | 340 | 300 | 90 | 55 | gx, r=10 |
| 13 | `gx-purple-haze` | Purple Haze | 🟣 | Roxo profundo e psicodélico | 265 | 65 | 50 | 275 | 245 | 70 | 55 | gx, r=10 |
| 14 | `gx-rose-quartz` | Rose Quartz | 💗 | Rosa quartzo cristalino | 345 | 75 | 68 | 355 | 320 | 60 | 70 | gx, r=10, **darkFg** |
| 15 | `gx-ultraviolet` | Ultraviolet | 🔮 | Violeta UV vibrante | 271 | 76 | 53 | 280 | 255 | 80 | 55 | gx, r=10 |
| 16 | `gx-hackerman` | Hackerman | 🧑‍💻 | Verde Matrix de hacker | 127 | 65 | 46 | 135 | 115 | 60 | 42 | gx, r=10, **darkFg** |
| 17 | `gx-frutti-di-mare` | Frutti di Mare | 🐙 | Azul-petróleo do fundo do mar | 182 | 90 | 42 | 190 | 200 | 75 | 45 | gx, r=10, **darkFg** |
| 18 | `gx-cyberpunk` | Cyberpunk | ⚡ | Amarelo neon de Night City | 55 | 100 | 51 | 180 | 320 | 95 | 55 | gx, r=10, **darkFg** |
| 19 | `gx-razer` | Razer | 🐍 | Verde RGB Razer Chroma | 113 | 70 | 51 | 120 | 100 | 60 | 48 | gx, r=10, **darkFg** |

`darkFg` = `withDarkPrimaryFg` → `primary-foreground` e `sidebar-primary-foreground` = `222 25% 10%` (contraste 6.18:1 a 14.56:1 segundo o PG; o teste da etapa 68 confirma no Zapp).

Diversity — constantes: `PRIDE_RED 0 85% 55%` · `PRIDE_ORANGE 30 90% 55%` · `PRIDE_YELLOW 55 90% 50%` · `PRIDE_GREEN 130 70% 45%` · `PRIDE_BLUE 210 80% 55%` · `PRIDE_PURPLE 280 80% 58%` · `PRIDE_PINK 330 85% 52%` · `rainbowGrad = linear-gradient(135deg, R, O, Y, G, B, P)` · `rainbowDivider = linear-gradient(90deg, R/.5, Y/.5, G/.5, B/.5, P/.5)`.

## APÊNDICE B — `presets.ts` (esqueleto das partes novas)
```ts
export interface PresetParams { id: string; name: string; description: string; emoji: string;
  h: number; s: number; l: number; gh: number; sh: number; ss: number; sl: number }

const TONAL_LIGHT: [number, number][] = [[100,97],[95,93],[92,86],[90,76],[87,64],[83,53],[83,46],[80,38],[75,30],[70,22],[65,14]]; // :root
const TONAL_DARK:  [number, number][] = [[60,14],[65,18],[70,24],[75,32],[80,42],[83,53],[87,62],[90,72],[92,82],[95,90],[100,96]]; // .dark
const TONAL_STEPS = [50,100,200,300,400,500,600,700,800,900,950] as const;
const tonal = (h: number, t: [number, number][]) =>
  Object.fromEntries(TONAL_STEPS.map((st, i) => [`primary-${st}`, `${h} ${t[i][0]}% ${t[i][1]}%`]));

export function buildPreset(p: PresetParams): ThemePreset {
  const { h, s, l, gh, sh, ss, sl } = p;
  const primary = `${h} ${s}% ${l}%`;
  const glow = `${gh} ${s}% ${Math.min(l + 10, 95)}%`;
  const secondary = `${sh} ${ss}% ${sl}%`;
  const light: ThemeModeColors = { background: `${h} 20% 97%`, foreground: `${h} 20% 12%`, card: '0 0% 100%', /* … :root com 221→h … */
    primary, 'primary-foreground': '0 0% 100%', 'primary-glow': glow, secondary, /* … */ ...tonal(h, TONAL_LIGHT) };
  const dark: ThemeModeColors = { background: '240 6% 6%', card: '240 5% 10%', 'card-elevated': '240 5% 13%', /* … charcoal fixo … */
    primary, 'primary-foreground': '0 0% 100%', 'primary-glow': glow, secondary: '240 5% 16%', /* … */ ...tonal(h, TONAL_DARK) };
  return { id: p.id, name: p.name, description: p.description, emoji: p.emoji, category: 'classic',
    swatches: [`hsl(${primary})`, `hsl(${secondary})`, `hsl(${gh} ${Math.max(s-5,0)}% ${Math.min(l+6,100)}%)`, `hsl(${h} ${Math.round(s*0.5)}% ${Math.min(l+15,100)}%)`],
    light, dark };
}
// applyGxDarkSurfaces / boostGlowAlpha / applyGxNeonGlow / applyGxGlass / buildGxPreset / withDarkPrimaryFg — copiar do PG (ver etapa 17), sem `font`.

export const STORAGE_KEY = 'theme-custom-colors';
export const STORAGE_VERSION = 6;
export interface ThemeConfig { preset: string; borderRadius: number }
const LEGACY_ID_MAP: Record<string, string> = { default: 'corporate', forest: 'emerald', teal: 'cyber', purple: 'purpure' };
type Stored = Partial<ThemeConfig> & { v?: number; cacheMode?: 'light'|'dark'; cachePreset?: string; cssVarsCache?: Record<string,string> };
const readStored = (): Stored => { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; } };
const writeStored = (patch: Stored): boolean => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readStored(), ...patch, v: STORAGE_VERSION })); return true; } catch (e) { console.error('[presets] storage write failed', e); return false; } };
const clampRadius = (n: unknown) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(20, n)) : 14;
export function loadThemeConfig(): ThemeConfig {
  const s = readStored(); const def = getDefaultConfig();
  if (s.v !== STORAGE_VERSION && s.v !== 5) return def;
  const preset = normalizePresetId(s.preset);                     // LEGACY_ID_MAP + existe no catálogo, senão corporate
  const cfg = { preset, borderRadius: clampRadius(s.borderRadius) };
  if (s.v === 5) writeStored({ ...cfg, cacheMode: undefined, cachePreset: undefined, cssVarsCache: undefined }); // migra
  return cfg;
}
export const saveThemeConfig = (cfg: ThemeConfig) => writeStored(cfg);

let _transitionTimer: ReturnType<typeof setTimeout> | null = null;
export function applyThemePreset(presetId: string, mode: 'light'|'dark', opts: { persistCache?: boolean } = {}) {
  const preset = THEME_PRESETS.find(p => p.id === presetId); if (!preset) return;
  const root = document.documentElement; root.classList.add('theme-transitioning'); root.dataset.presetId = presetId;
  const colors = preset[mode]; const cache: Record<string,string> = {};
  for (const k of CSS_VARS_TO_APPLY) { root.style.setProperty(`--${k}`, colors[k]); cache[k] = colors[k]; }
  if (preset.borderRadius !== undefined) root.style.setProperty('--radius', `${preset.borderRadius/16}rem`);
  if (preset.font) { root.style.setProperty('--font-sans', preset.font); root.style.setProperty('--font-display', preset.font); }
  else { root.style.removeProperty('--font-sans'); root.style.removeProperty('--font-display'); }
  if (opts.persistCache !== false) writeStored({ cacheMode: mode, cachePreset: presetId, cssVarsCache: cache });
  if (_transitionTimer) clearTimeout(_transitionTimer);
  _transitionTimer = setTimeout(() => { root.classList.remove('theme-transitioning'); _transitionTimer = null; }, 500);
}
```

## APÊNDICE C — `index.html` boot (substitui o bloco `var skin = …`)
```js
var skin = localStorage.getItem('theme-custom-colors');
if (skin) {
  var c = JSON.parse(skin), root = document.documentElement;
  if (c.v === 6) {
    var mode = isDark ? 'dark' : 'light';
    if (c.cssVarsCache && c.cacheMode === mode) { for (var k in c.cssVarsCache) root.style.setProperty('--' + k, c.cssVarsCache[k]); }
    if (typeof c.borderRadius === 'number' && isFinite(c.borderRadius)) { var r = Math.max(0, Math.min(20, c.borderRadius)); root.style.setProperty('--radius', (r / 16) + 'rem'); }
    if (c.preset) root.setAttribute('data-preset-id', c.preset);
  } else if (c.v !== 5) {
    localStorage.removeItem('theme-custom-colors'); /* v5 fica: ThemeInitializer migra */
  }
}
```

## APÊNDICE D — `ThemeInitializer.tsx`
```tsx
export function ThemeInitializer() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    const cfg = loadThemeConfig();
    applyThemePreset(cfg.preset, resolvedTheme);
    applyRadius(cfg.borderRadius);
  }, [resolvedTheme]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try { const c = JSON.parse(e.newValue) as Partial<ThemeConfig>;
        if (c.preset) applyThemePreset(c.preset, resolvedTheme, { persistCache: false });
        if (typeof c.borderRadius === 'number') applyRadius(c.borderRadius);
      } catch { /* malformed */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [resolvedTheme]);
  return null;
}
```

## APÊNDICE E — Scripts de QA (em `/workspace/qa`, fora do repo)

### E.1 `skins-shot.mjs` — login + 19 screenshots + leitura de vars
```js
import { chromium } from 'playwright'; import fs from 'node:fs';
const [,, base = 'http://127.0.0.1:4173', theme = 'dark'] = process.argv;
const env = Object.fromEntries(fs.readFileSync('/workspace/.secrets/zapp-v2.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>l.split('=').map(s=>s.trim())));
const IDS = ['corporate','purpure','emerald','sunset','rose','minimal','ocean','amber','cyber','diversity','gx-classic','gx-pink-addiction','gx-purple-haze','gx-rose-quartz','gx-ultraviolet','gx-hackerman','gx-frutti-di-mare','gx-cyberpunk','gx-razer'];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR' });
await ctx.addInitScript((t) => { localStorage.removeItem('theme-custom-colors'); localStorage.setItem('theme', t); }, theme);
const page = await ctx.newPage(); const errors = []; page.on('console', m => m.type()==='error' && errors.push(m.text()));
await page.goto(base, { waitUntil: 'networkidle' });
if (await page.locator('input[type="email"]').count()) { await page.fill('input[type="email"]', env.ZAPP_QA_EMAIL); await page.fill('input[type="password"]', env.ZAPP_QA_PASSWORD); await page.keyboard.press('Enter'); await page.waitForURL(/view=|dashboard|inbox/, { timeout: 30000 }).catch(()=>{}); }
await page.goto(base + '/?view=themes', { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="skins-gx-grid"]', { timeout: 30000 });
fs.mkdirSync('out', { recursive: true }); const result = {};
const readVars = () => page.evaluate(() => { const cs = getComputedStyle(document.documentElement); const g = k => cs.getPropertyValue(k).trim();
  return { primary: g('--primary'), background: g('--background'), sidebar: g('--sidebar-background'), radius: g('--radius'), presetId: document.documentElement.dataset.presetId }; });
for (const id of IDS) {
  await page.click(`[data-testid="preset-card-${id}"]`); await page.waitForTimeout(600);
  result[id] = await readVars(); await page.screenshot({ path: `out/08-${id}.png` });
}
fs.writeFileSync('out/08-skins.json', JSON.stringify({ result, errors }, null, 2)); console.log('saved', Object.keys(result).length, 'consoleErrors', errors.length);
await browser.close();
```
Se o seletor de login for outro, descubra com `page.content()` e ajuste — não chute.

### E.2 `skins-assert.mjs` — vars exatas + amostra de pixel (ΔE76)
- Catálogo esperado: `cd /workspace/repos/Zapp_Web_V2-skins && npx tsx -e "import {THEME_PRESETS} from './src/components/settings/theme/presets'; console.log(JSON.stringify(THEME_PRESETS.map(p=>({id:p.id,dark:p.dark,light:p.light,radius:p.borderRadius}))))" > /workspace/qa/out/catalog.json`.
- Para cada id: `result[id].primary === catalog[id].dark.primary`, `background`, `sidebar` idem; `radius` = `0.625rem` nos GX, senão `0.875rem` (ou o último raio escolhido); `presetId === id`.
- Pixel: `pngjs` lê `08-{id}.png`; mediana 9×9 em `(100,400)` (sidebar) e `(900,520)` (fundo) vs `hslToRgb(catalog[id].dark['sidebar-background'|'background'])`; ΔE76 em Lab ≤ 6 (implementação de 20 linhas, sem lib nova). Se o ponto cair em texto/card, mova ±8px para região plana e registre.
- Saída: tabela `id | primary ✓/✗ | background ✓/✗ | sidebar ✓/✗ | ΔE sidebar | ΔE fundo | radius ✓/✗` + `N/19 OK`.

### E.3 `skins-boot.mjs` — FOUC
```js
await ctx.addInitScript(() => localStorage.setItem('theme', 'dark'));
// 1) sessão normal: escolhe gx-classic via UI (como em E.1) → storage v6 com cache
// 2) nova page no mesmo contexto:
const p2 = await ctx.newPage();
await p2.goto(base + '/?view=themes', { waitUntil: 'commit' });
const early = await p2.evaluate(() => ({ bg: getComputedStyle(document.documentElement).getPropertyValue('--background').trim(), mounted: !!document.getElementById('root')?.firstChild }));
console.log(early); // esperado: { bg: '265 22% 8%', mounted: false }
```

### E.4 `skins-func.mjs` — 14 checks (etapas 83–86)
Cada check: `if (!cond) fails.push('N: …'); else ok.push('N')`; `page.on('console')` acumulando erros; ao final imprime `{ ok, fail, consoleErrors }`. Quota (check 11): `ctx.addInitScript(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v){ if (k==='theme-custom-colors') throw new DOMException('QuotaExceededError','QuotaExceededError'); return o.call(this,k,v); }; })`. Storage v5 (check 8): `ctx.addInitScript(() => localStorage.setItem('theme-custom-colors', JSON.stringify({v:5,preset:'forest',borderRadius:8})))`.

## APÊNDICE F — Template do ledger `docs/design/SKINS_OPERA_GX_STATUS.md`
```md
# Skins Opera GX (paridade Promo Gifts V4) — STATUS
Branch: claude/feat-skins-opera-gx-<stamp> · Base: <sha> · Worktree: /workspace/repos/Zapp_Web_V2-skins
Referência: Promo_Gifts_V4 @ cff6e9f0 (sha256 pg-theme-presets.ts = …) · Playwright: ok · QA user: ok · DEPLOY: ok | bloqueado (motivo)

## CP0 Ambiente      [ ] sha= · before=out/00-before-themes.png · gates baseline: typecheck=_ lint-ratchet=_ tc-ratchet=_ implicit=_ vitest=_ · PRs abertas conflitantes: nenhuma
## CP1 Núcleo        [ ] sha= · presets.test.ts=_ asserts · 19 primárias distintas: sim
## CP2 Sincronia     [ ] sha= · tokens-sync: divergências=_ reconciliadas (tabela abaixo) · tokens.css linhas alteradas=_
## CP3 Boot          [ ] sha= · shot=03-boot.png · early --background=_ (esperado 265 22% 8%) · storage event: setItem=_ chamadas
## CP4 Página        [ ] sha= · shot=04-page.png · cards=10+9 · gx-classic: primary=_ background=_ ΔE sidebar=_
## CP5 Componentes   [ ] sha= · swatchBar=_ cardsPerRow=_ radiusPresets=_ dialog=ok · 05-mobile.png overflow=não
## CP6 Cobertura     [ ] sha= · inventário: A/B=_ C=_ FALTA=0 · shots 06-*.png=8 · resíduos corrigidos=_ · pendências=_
## CP7 Testes        [ ] sha= · testes novos=_ · suíte settings+__tests__: exit 0 · contraste mín=_
## CP8 Fidelidade    [ ] vars=_/19 · pixels=_/19 · light=_/3 · raio=_/4 · sync=ok · reduced-motion=ok · iterações=_
## CP9 Funcional     [ ] checks=_/14 · consoleErrors novos=0 · seção 4 conferida
## CP10 Técnico      [ ] typecheck=_ lint-ratchet=_ tc-ratchet=_ implicit=_ lint=_ vitest=_ build=_ bundle Δ=_ KB gz
## CP11 Entrega      [ ] PR=<url> · CI=_ · merge=<sha> · deploy=_ · prod=12-prod.png | bloqueado

## Divergências plano × código
-
## Reconciliações tokens.css ↔ corporate (token | tokens.css antes | depois | ΔE)
-
## Iterações do loop de QA (máx 3 por fase)
-
## Pendências / resíduos (honestos)
- Resíduos azul-221 fora do escopo (inbox/dashboard/…): <lista tela | elemento | classe>
- Modo claro: `:root` define --surface/--divider/--border-strong com valores dark (pré-existente)
- URL carrega `wizard=new&step=1&cat=` entre views (pré-existente)
-
```

## APÊNDICE G — Matriz de paridade (o que fecha o gap)
| Funcionalidade | PG | Zapp antes | Zapp depois |
|---|---|---|---|
| Skins com cores reais no dark | 19 | 0 (8 idênticas) | 19 |
| Categorias Clássicas / Opera GX + badge GAMER | sim | não | sim |
| Pipeline GX (roxo 265, neon glow, glass, raio 10) | sim | não | sim |
| Diversity (rainbow) + `data-preset-id` + CSS overrides | sim | não | sim |
| Swatches 4 cores distintas | sim | não | sim |
| Presets rápidos de raio + slider 0–20 + snap por skin | sim | slider (clamp 14 no reload) | sim |
| Salvar real + erro de storage + dot pendente | sim | toast fake | sim |
| Original com confirmação | sim | reset direto | sim |
| Sync entre abas | sim | não | sim |
| Anti-FOUC no boot | data-preset-id | cache (quebrado pela briga de escritores) | cache v6 com cacheMode |
| Modo Claro/Escuro/Sistema | não (dark-only) | sim | sim (preservado) |
| Testes | ~150 asserts | 0 | ≥ 130 |
| Contraste primária/texto ≥ 3:1 | documentado | não verificado | teste automático 19×2 |

---

## COMANDO DE DISPARO (para Joaquim, via Portainer → container `claude-code`)
```sh
cd /workspace/repos/Zapp_Web_V2 && git fetch origin && \
claude -p 'Leia docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md por completo e execute-o do início ao fim, fase por fase, em worktree próprio (etapa 1), fechando cada checkpoint SOMENTE com a evidência exigida escrita em docs/design/SKINS_OPERA_GX_STATUS.md. Não pule fases, não reordene, não afirme conclusão sem os arquivos de evidência. Push sempre com --no-verify. Nunca use pkill -f. Se um gate falhar 3 vezes, registre o resíduo e siga. Ao final, abra a PR, faça o squash-merge se CI verde (escopo front) e reporte o estado do deploy exatamente como está (Vercel pode estar bloqueada — não invente "concluído").' --model sonnet
```
