# Dossiê — `codex/fix-failed-workflows-20261020` (PRs #2139, #2443)

- Ref: `origin/codex/fix-failed-workflows-20261020` · tip `bf0ce7695` (2026-10-21) · merge-base `d7af7a671` (2026-10-19) · 2 commits
  - `4fa7e11be fix(ci): repair failed workflow contracts and bundle loading`
  - `bf0ce7695 fix(ci): reconcile workflow guard baselines`
- Propósito: consertar workflows/guardas de CI que falhavam em 2026-10-20 (pin Playwright 1.63.0→1.64.1, job Deno de edges, cache Bun, baselines de docs geradas ESTADO/FEATURE_REGISTRY/DB-INVENTORY/docs-ci, a11y de abas no AdminView, animação do ConversationEmptyState, mock `.range()` no teste de emojis).
- Fato central: o conteúdo desta branch entrou na main pelo merge **#2156 `4b9585052` (2026-10-21, "Correções validadas de CI, segurança e integrações")** — `git log -S` mostra o texto da branch (teste "rotas legadas da Evolution V2…", `ConversationEmptyState` com `useReducedMotion`) chegando à main nesse commit. O que hoje difere foi substituído de propósito por commits posteriores.

## Veredito: **OBSOLETA** (núcleo incorporado via #2156; resíduo superado) · apagar branch: **seguro**

## Arquivo × achado × evidência

| Arquivo | Lacuna mecânica | Achado | Evidência na main |
|---|---|---|---|
| `.github/workflows/ci.yml` | 9 linhas | Setup Deno + `deno check/test` existem (job separado E70); `ignore-build` guard existe; cache Bun existe em 7 jobs; pin `playwright@1.64.1` no install existe; linha de projetos E2E idêntica. **Upload coverage** removido de propósito; **`install-deps` sem pin** de propósito | `ci.yml:130-133,214-223` (Deno), `:190-191` (ignore-build), `:61,101,143,245,315,458,600` (cache), `:484` (pin 1.64.1), `:501-502` (E2E). Coverage: `ci.yml:289-291` comentário "upload anterior era no-op", commit `5721e4f50` (2026-10-16). `install-deps` despinado em `c543c6ade` #2054 (2026-10-28) |
| `.github/workflows/e2e-logado.yml` | 2 linhas | Workflow reescrito (matriz de 5 grupos, Supabase descartável, sem `bunx playwright`); abordagem superada | `e2e-logado.yml:3,126-146` (sem nenhuma linha `bunx playwright`) |
| `.github/workflows/e2e-talkx.yml` | 1 linha | Install pinado 1.64.1 presente; `install-deps` sem pin de propósito (#2054) | `e2e-talkx.yml:94,98` |
| `scripts/ci/ci-docs-baseline.unit.mjs` | 11 linhas | Versão agora lida do `bun.lock` (W39), não pinada no teste; contagem de workflows é 21, não 15; fixtures `PLANO_ANTES/DEPOIS` com "1.63.0" são texto de teste sintético | `ci-docs-baseline.unit.mjs:298` (`arquivos.length, 21`), `:359` ("W39: extrair versão do bun.lock em vez de pinar"), `:456`; `git ls-tree origin/main .github/workflows` = 21 YAML |
| `scripts/ci/evolution-edge-fixes.unit.mjs` | 6 linhas | Teste "rotas legadas da Evolution V2 permanecem explícitas" ENTROU via #2156 e foi REMOVIDO de propósito em #2054 | `git log -S'rotas legadas da Evolution V2'` → `4b9585052` (add), `c543c6ade` (remove). Handler ainda tem as rotas (`supabase/functions/evolution-api/index.ts:1147,1331`) — sem regressão funcional |
| `scripts/ci/github-settings-guard.unit.mjs` | 2 linhas | Main tem superconjunto: `banco-leitura`, `perimetro-leitura` + `copilot/Preview/Production` (E94 marcou para apagar, mas existem ao vivo; baseline devolveu-os) | `github-settings-guard.unit.mjs:417-418`; `github-settings-baseline.json` campo `environments` e `environments_para_apagar._comentario` (medido 2026-10-29) |
| `src/components/admin/AdminView.tsx` | 2 missing / 4 still | `role="tablist"`, `navegarNasAbas`, `aria-selected` presentes. Branch encolhia `AdminTab` para 3 abas e removia `cron`; main manteve `cron` (só admin) de propósito | `AdminView.tsx:47` (`type AdminTab = 'users'|'audit'|'crm'|'cron'`), `:188-195`, `:198`, `:230-241`, `:503` |
| `src/components/shared/ConversationEmptyState.tsx` | 4 missing / 2 still | Animação com `useReducedMotion` presente; main NUNCA teve `repeat: Infinity` (merge #2156 já entrou sem movimento contínuo — coerente com guarda de reduzir movimento) | `ConversationEmptyState.tsx:3,35,52-78`; `git log -S'repeat' origin/main -- <arquivo>` vazio; `git show 4b9585052 -- <arquivo>` linhas 87-112 sem `repeat` |
| `src/hooks/integrations/__tests__/useCustomEmojis.upload.test.tsx` | 4 linhas | Mock equivalente (`order: () => q`, `range`, `limit`) com outro nome de variável; hook usa `.range()` | teste `:80-83`; `useCustomEmojis.ts:74,93` |
| `TESTING_CONVENTION.md` | 2 linhas | Mesmo conteúdo (job `node-scripts`, passo "Run Node CI scripts tests") com comando mais longo (lista atual de guardas) | `TESTING_CONVENTION.md:48,52-53` |
| `FEATURE_REGISTRY.md` | 3 missing / 1 still | Base `dia/2026-10-20`, 56 views presentes; linha `talkx-kit` presente (hoje `Full`, contagem 45/11 — regenerado depois) | `FEATURE_REGISTRY.md:8,26-29,86` |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | 1 linha | E76 já cita 1.64.1; E62 cita 1493 linhas (branch dizia 1491; `db-migrate.yml` da main tem 1493) | `PLANO...:107-108` |
| `ESTADO.md` | 23 missing / 2 still | Doc gerada, regenerada depois (A=54, E=27 vs A/E=20 da branch; sem seção "Órfãs (20)") | `ESTADO.md:20-28` |
| `docs/DB-INVENTORY.md` | 13 linhas | Doc gerada do banco ao vivo: `generated_at` 2026-11-14, 212 tabelas / 396 funções (branch: 2026-10-16, 170/279) | `docs/DB-INVENTORY.md:4,43,46` |
| `docs/ci/README.md` | 9 missing / 4 still | Gerado por `render-workflow-docs.mjs`; main declara **21 workflows**, inclui CodeQL e E2E logado com texto novo | `docs/ci/README.md:7,14,22,112-117` |

Demais 30 arquivos do item: `IDENTICAL_TO_MAIN`/`PRESENT_REVERSE_APPLIES` (prova mecânica no JSON do item).

## Lacunas a recuperar
Nenhuma. Resíduos (upload de coverage, pin em `install-deps`, teste de rotas legadas, `repeat: Infinity`, redução das abas do Admin) foram removidos/substituídos de propósito na main após #2156 — reintroduzi-los contradiria decisões registradas (`ci.yml:289-291`, #2054, `AdminView.tsx:188-195`).

## Verificação adversarial

Refutação tentada arquivo por arquivo contra `origin/main` em `dac285f62`. **Triagem confirmada: OBSOLETA, apagar é seguro.** Nenhum hunk de valor ≥ médio ficou fora da main.

Conferências próprias (não copiadas da triagem):

| Alegação da triagem | Conferência independente | Resultado |
|---|---|---|
| Job Deno de edges existe na main | `git show origin/main:.github/workflows/ci.yml` :215-223 — `setup-deno 2.9.5`, `deno check` + `deno test --allow-net=127.0.0.1` com `mapfile -t testes_edge < <(git ls-files 'supabase/functions/**/*.test.ts')` | main é **melhor** que a branch (array em vez de glob solto, não quebra com zero arquivos) |
| Upload de coverage foi removido de propósito | `ci.yml` :289-291: "Vitest roda em shards sem coletar coverage. Não tente anexar `coverage/` neste runner… o upload anterior era no-op" | reintroduzir seria regressão documentada |
| Pin 1.64.1 presente; `install-deps` despinado de propósito | `ci.yml` :484 `bunx playwright@1.64.1 install --with-deps` (cache miss) e :490 `bunx playwright install-deps` (cache quente); guarda `scripts/ci/playwright-version-lock.unit.mjs` :59-80 (N-022) amarra o pin ao `bun.lock` | pin vivo e com guarda; a 2ª linha é passo diferente |
| `e2e-logado.yml` reescrito | main :41-63 matriz de 5 grupos, :107 checkout de SHA validado, :134-140 suíte em backend descartável; nenhuma linha `bunx playwright` | as 2 linhas da branch pinam passos que não existem mais |
| `e2e-talkx.yml` pinado | main :94 `playwright@1.64.1`, :98 `install-deps` sem pin | coberto |
| 15 → 21 workflows | `git ls-tree origin/main .github/workflows/ \| wc -l` = **21**; `ci-docs-baseline.unit.mjs` :291-298 `assert.equal(arquivos.length, 21)` e :359 "W39: extrair versão do bun.lock em vez de pinar" | baseline da branch (15 / pin literal) está vencida |
| `github-settings-guard.unit.mjs` superconjunto | main :417-418 lista os 6 ambientes da branch **+** `copilot`, `Preview`, `Production`; stub :91 idem | superconjunto confirmado |
| `AdminView.tsx` | main :17 importa `AlertTriangle/ChevronLeft/ChevronRight`, :47 `AdminTab = 'users'\|'audit'\|'crm'\|'cron'`, :191-195 aba cron só admin, :198 `navegarNasAbas`, :230-241 `role="tablist"` + `aria-selected` | a11y da branch já na main; a branch **removia** a aba `cron` — aplicá-la seria perda |
| Teste de emojis | main :77-86 `const q = { order: () => q, range: (_from,to) => …, limit: … }` | mock equivalente (só muda o nome da variável) |
| `ConversationEmptyState` | main :3/:35 `useReducedMotion`, :44-78 com todo o gating `reduzido ? undefined : …`; `git log -S'repeat: Infinity' origin/main -- <arquivo>` **vazio** | gating presente; ver resíduo abaixo |
| Docs geradas | `docs/DB-INVENTORY.md` da main = banco de 2026-11-14 (212 tabelas) vs 2026-10-16 (170) da branch; `docs/ci/README.md` "21 workflows" | regeneradas depois; aplicar a branch retrocederia os números |

Resíduo único, valor **baixo** (não altera veredito): a main não tem `repeat: Infinity` nas 4 transições decorativas do `ConversationEmptyState` (órbita 18s, pulso 3s, 2 pontos 2s) — a branch tinha. Hoje a decoração roda uma vez e para. O comentário da guarda `src/components/__tests__/reduzirMovimentoInboxCrmConexoes.test.tsx:133` ainda diz "o vazio do chat tem três laços infinitos", mas o teste de controle (:150-161) só exige que a animação aconteça, então passa sem laço. É enfeite de tela vazia, não comportamento de negócio — não justifica reabrir a branch; se o dono quiser o laço de volta, são 4 linhas em um arquivo, sem depender deste histórico.
