# Dossiê — claude_04__pensive-tesla-ixtl9w (PR #2526)

- Ref: `origin/claude_04/pensive-tesla-ixtl9w` · tip `f3cccccae` · merge-base `1252bb5a` (2026-11-01) · 10 commits
- Propósito: sessão de "fix CI" de 2026-11-01. Um commit de código (`e798dcc1a`: `deno check --config` no
  `deploy-functions.yml` + espera de tema dark no teste axe de `e2e/email-navy-visual.spec.ts`) e 9 commits
  de relatório (`RELATORIO_CI.md`, `PENDENCIAS.md`) com estado de runs daquela sessão.
- Triagem 2026-11-08: OBSOLETA. Confirmado abaixo.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `.github/workflows/deploy-functions.yml` | **INCORPORADA** — `deno check --config supabase/functions/deno.json supabase/functions/**/index.ts` está na main | `origin/main:.github/workflows/deploy-functions.yml:494`; entrou por `84b8b149e` (#2575, 2026-11-02), depois reforçado por `c5650d887` (#2855) |
| `e2e/email-navy-visual.spec.ts` | **INCORPORADA (equivalente)** — branch trocava `waitForTimeout(400)` por `waitForAppliedTheme(page,'dark')` no teste "não introduz violações axe". Main fez a mesma troca em `b46f5d291` (#2710): `waitForTimeout(400)` removido, `waitForAppliedTheme(page,'dark')` presente (`origin/main:e2e/email-navy-visual.spec.ts:155`). Ordem difere (main: freeze → addScriptTag → waitForAppliedTheme; branch: waitForAppliedTheme → freeze), mas o teste de alto contraste da main (`:534-542`) e `13a00e06a` (#2881) tratam o mesmo flake webkit com rAF explícito — abordagem da main é a vigente. Só faltam as 2 linhas de comentário. | `git diff 1252bb5a origin/main -- e2e/email-navy-visual.spec.ts` mostra `-waitForTimeout(400)` / `+waitForAppliedTheme(page,'dark')`; `git show 3e6ed32ac` ainda tinha `waitForTimeout(400)`, `git show b46f5d291` já tem `waitForAppliedTheme` |
| `PENDENCIAS.md` | **OBSOLETA** — relatório datado 2026-11-01 (runs 41318522203, 41240478106 etc.). Main reescreveu o arquivo 10+ vezes depois (`f03e6f6a2` 2026-11-05 … `1d4702804` 2026-11-15); hoje é "PENDÊNCIAS CI — 2026-11-12" com 445 linhas e tabela de prova própria | `git log 1252bb5a..origin/main -- PENDENCIAS.md`; `git show origin/main:PENDENCIAS.md | head` |
| `RELATORIO_CI.md` | **OBSOLETA** — relatório da sessão (`§0 Estado atual — sessão claude_04/pensive-tesla-ixtl9w`, runs pending da PR #2526). Main reescreveu em `341d3fdab`, `d985c7fc8`, `15923813a`, `65cf38544`, `cb6576b2a`; hoje é o relatório de `fix-ci-workflows-261112-0400` (464 linhas) | `git log 1252bb5a..origin/main -- RELATORIO_CI.md`; `git show origin/main:RELATORIO_CI.md | head` |

## Veredito

**OBSOLETA** (os 2 fixes de código já estão na main por outros commits; os 2 relatórios são snapshots de
2026-11-01 substituídos de propósito por versões posteriores). Nenhuma lacuna a recuperar.
`apagar_branch_seguro = true`.

## Lacunas a recuperar

Nenhuma. Única diferença textual residual: 2 linhas de comentário no teste axe explicando o motivo do
`waitForAppliedTheme` — a main já documenta o mesmo motivo no teste de alto contraste (`:528-540`); valor nenhum.

## Verificação adversarial

Refutação tentada em 4/4 arquivos do `git diff 1252bb5a origin/claude_04/pensive-tesla-ixtl9w`
(nenhum outro arquivo: `--stat` lista só esses 4). Tip `f3cccccae` não está em `origin/main`
(`git branch -r --contains f3cccccae` → só a própria branch e `pr/2526`), então tudo que a branch
tem de único seria perdido no delete. Nada de valor ≥ médio sobrou.

1. `.github/workflows/deploy-functions.yml` — a única linha da branch
   (`deno check --config supabase/functions/deno.json supabase/functions/**/index.ts`) está
   **literalmente igual** em `origin/main:.github/workflows/deploy-functions.yml:494`, entrada por
   `84b8b149e` ("fix(ci): deno check @types/node — cd functions + --config (GR-001) (#2575)",
   `git log -S'deno check --config supabase/functions/deno.json' origin/main`). Main ainda acrescentou
   o comentário GR-001 (`:492`) e o `deno install --config` (`:475-481`) — é superconjunto. Zero lacuna.

2. `e2e/email-navy-visual.spec.ts` — a branch trocava `waitForTimeout(400)` por
   `waitForAppliedTheme(page, 'dark')` no teste "workspace do Email não introduz violações axe".
   Main fez a troca em `b46f5d291` (#2710) e hoje o teste (`origin/main:e2e/email-navy-visual.spec.ts:151-200`)
   tem `freezeVisualTransitions` → `addScriptTag` → `waitForAppliedTheme(page,'dark')` **mais** um loop
   `requestAnimationFrame` dentro do `page.evaluate` que só dispara o `axe.run` quando
   `documentElement.classList.contains('dark')`, `theme-transitioning` ausente em `<html>` e `<body>`,
   `opacity === 1`/`visibility: visible` em toda a cadeia de ancestrais e `axe._running === false`
   (`:177-190`). Isso cobre o flake de cor interpolada no WebKit de forma estritamente mais forte que a
   reordenação da branch; a ordem diferente não é lacuna, é abordagem superada. Resíduo real: 2 linhas
   de comentário — valor nenhum, e o mesmo motivo já está documentado no bloco vigente.

3. `PENDENCIAS.md` (24 linhas únicas) — snapshot de 2026-11-01 com run IDs de 31/10–01/11.
   `origin/main:PENDENCIAS.md` é "PENDÊNCIAS CI — 2026-11-12", 445 linhas, com seções até 2026-11-15
   (`## 11. CORRIGIDO em 15/11 …`). Testei o único conteúdo que poderia ter valor independente da data:
   - §3 da branch (telefonia falha porque `get-sip-password` devolve 503 sem SIP configurado) já está
     na main em `docs/audits/REVISAO_PLANO_MELHORIAS_2026-10-30.md:32` ("1.260 respostas 503 de
     `get-sip-password` por ausência de `SIP_PASSWORD`"), com ação recomendada;
   - §4 da branch (instrução de `TARGET_VERSION`/dry-run/hash do `db-migrate.yml`, objeto do commit
     `0fbc4be86`) está na main em `docs/agentes/banco.md:58-62` (`apply=false` primeiro, depois
     `apply=true` com `confirm_runtime_sha256` do dry-run), que é o lugar canônico e não expira.
   Substituição confirmada abrindo os arquivos da main nas linhas citadas. Zero lacuna.

4. `RELATORIO_CI.md` (81 linhas únicas) — é relatório de sessão: `§0 Estado atual — sessão
   claude_04/pensive-tesla-ixtl9w`, tabela de runs da PR #2526 em `⏳ pending (attempt 2)`.
   `origin/main:RELATORIO_CI.md` é o relatório de `fix-ci-workflows-261112-0400` (464 linhas, baseline
   de 2026-11-05/11-12). Os números de baseline da branch (bundle 323,0 KB gzip; 15.685 testes em 3
   shards) não são fato recuperável — são medições do SHA `1252bb5a`, de 14 dias atrás, substituídas
   pelo baseline de 12/11 (`§1.1-1.8`). As 3 linhas em `still_sample` são separadores de tabela markdown
   (`|---|---|`). Zero lacuna.

Não há sinal de remoção acidental: os dois fixes de código entraram por PRs próprias na main e os dois
.md foram reescritos de propósito 10+ e 5 vezes respectivamente. Nada depende de API que deixou de existir.

**Parecer: CONCORDO com OBSOLETA.** `apagar_branch_seguro = true`. Ao apagar a branch, a PR #2526
fecha junto — é o desfecho correto, já que seu conteúdo de código está na main por #2575 e #2710.
