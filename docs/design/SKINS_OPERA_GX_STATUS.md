# Skins Opera GX (paridade Promo Gifts V4) — STATUS
Branch: claude/feat-skins-opera-gx-260923-1229 · Base: 71befc7d (origin/main) · HEAD ledger commit: b48e14e9 · Worktree: /workspace/repos/Zapp_Web_V2-skins
Referência: Promo_Gifts_V4 @ cff6e9f0 (sha256 pg-theme-presets.ts = _) · Playwright: _ · QA user: _ · DEPLOY: _

## CP0 Ambiente      [ ] sha= · before=out/00-before-themes.png · gates baseline: typecheck=_ lint-ratchet=_ tc-ratchet=_ implicit=_ vitest=_ · PRs abertas conflitantes: nenhuma
## CP1 Núcleo        [ ] sha= · presets.test.ts=_ asserts · 19 primárias distintas: _
## CP2 Sincronia     [ ] sha= · tokens-sync: divergências=_ reconciliadas (tabela abaixo) · tokens.css linhas alteradas=_
## CP3 Boot          [ ] sha= · shot=03-boot.png · early --background=_ (esperado 265 22% 8%) · storage event: setItem=_ chamadas
## CP4 Página        [ ] sha= · shot=04-page.png · cards=10+9 · gx-classic: primary=_ background=_ ΔE sidebar=_
## CP5 Componentes   [ ] sha= · swatchBar=_ cardsPerRow=_ radiusPresets=_ dialog=_ · 05-mobile.png overflow=_
## CP6 Cobertura     [ ] sha= · inventário: A/B=_ C=_ FALTA=0 · shots 06-*.png=_ · resíduos corrigidos=_ · pendências=_
## CP7 Testes        [ ] sha= · testes novos=_ · suíte settings+__tests__: exit _ · contraste mín=_
## CP8 Fidelidade    [ ] vars=_/19 · pixels=_/19 · light=_/3 · raio=_/4 · sync=_ · reduced-motion=_ · iterações=_
## CP9 Funcional     [ ] checks=_/14 · consoleErrors novos=_ · seção 4 conferida
## CP10 Técnico      [ ] typecheck=_ lint-ratchet=_ tc-ratchet=_ implicit=_ lint=_ vitest=_ build=_ bundle Δ=_ KB gz
## CP11 Entrega      [ ] PR=_ · CI=_ · merge=_ · deploy=_ · prod=12-prod.png | bloqueado

## Divergências plano × código
- Etapa 3: `graphify-out/` não existe neste worktree (`/workspace/repos/Zapp_Web_V2-skins`). Existe em `/workspace/repos/Zapp_Web_V2` (checkout principal) mas o plano manda trabalhar isolado no worktree. Fallback usado: `grep -rn "from '.*presets'" src/` — confirma que só `ThemeInitializer.tsx`, `useThemePreset.ts`, `PresetCard.tsx` e `ThemeCustomizer.tsx` importam `presets.ts`, batendo com a seção 1.2 do plano.

## Reconciliações tokens.css ↔ corporate (token | tokens.css antes | depois | ΔE)
-

## Iterações do loop de QA (máx 3 por fase)
-

## Pendências / resíduos (honestos)
-
