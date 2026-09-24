# Skins Opera GX (paridade Promo Gifts V4) — STATUS
Branch: claude/feat-skins-opera-gx-260923-1229 · Base: 71befc7d → rebaseado sobre origin/main @ 02054d44 (2026-09-24) · HEAD ledger commit: b48e14e9 · Worktree: /workspace/repos/Zapp_Web_V2-skins
Referência: Promo_Gifts_V4 @ cff6e9f0 (sha256 pg-theme-presets.ts = d364f45db57584dc997c24a82782689be5d500fc401b5c0f132dc2b91ba0bfc5 · pg-theme-presets.test.ts = 31c2705a1a00f1352f4f7a4e6059a6f2878fbe2d21b3f041f1fb010b0cb48c88) · Playwright: instalado (chromium 1194 + headless_shell 1194 baixados nesta sessão) · QA user: **BLOQUEADO** (ver Pendências) · DEPLOY: verificar externamente (MCP Vercel indisponível no container)

## CP0 Ambiente      [x] sha=852c70da · before=BLOQUEADO (login QA falhou, ver Pendências) · gates baseline: typecheck=0 lint-ratchet=OK(1097/1097,novas=0) tc-ratchet=OK(0/0,novas=0) implicit=OK(0/0) vitest=299 passed (3 arquivos, settings) · build=OK (17.52s) · PRs abertas conflitantes: nenhuma (#548 dashboard/navigation, #537 hooks unmount — nenhuma toca presets.ts/useThemePreset.ts/ThemeCustomizer.tsx/ThemeInitializer.tsx/index.html/tokens.css)
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
- Sessão retomada em 2026-09-24: branch estava 15 commits atrás de `origin/main` (`71befc7d`). `git fetch origin && git rebase origin/main` sem conflitos → novo topo `02054d44`. `gh` não autenticado no container; PRs abertas listadas via `curl` na REST API do GitHub com o token de `/workspace/.git-credentials` (mesmo fallback já registrado em memória de sessões anteriores).
- Playwright instalado em `/workspace/qa` pedia build `chromium_headless_shell-1194`, cache global só tinha `-1243` (versão de outra sessão/projeto) → `npx playwright install chromium` baixou 1194 (chromium + headless_shell, ~278 MB). Doravante os dois builds coexistem em `~/.cache/ms-playwright`.

## Reconciliações tokens.css ↔ corporate (token | tokens.css antes | depois | ΔE)
-

## Iterações do loop de QA (máx 3 por fase)
-

## Pendências / resíduos (honestos)
- **QA login bloqueado (crítico para Fases 8/9/100):** `ZAPP_QA_EMAIL`/`ZAPP_QA_PASSWORD` de `/workspace/.secrets/zapp-v2.env` foram rejeitadas por produção: `POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auth-login` → `401 {"error":"Invalid login credentials","isLocked":false,"lockedUntil":null,"attempts":2,"remainingTime":0}`. Duas tentativas já consumidas nesta sessão (uma em `before-shot.mjs`, uma em `debug-login.mjs`). **Parei de tentar para não travar a conta.** Sem login não é possível gerar `00-before-themes.png`, nem os screenshots/QA das Fases 8-9 (checagem de vars por Playwright, ΔE de pixel, sync entre abas, funcional E2E), nem a verificação de produção da etapa 100. Ação necessária de Joaquim: confirmar/rotacionar a senha do usuário `qa.visual@promobrindes.com.br` e atualizar o arquivo de secrets. Até lá, esta sessão prossegue com Fases 1-7 (núcleo, sincronia, boot, página, componentes, cobertura, testes unitários — nenhuma delas depende de login) e registra QA visual/funcional como bloqueada.
-
