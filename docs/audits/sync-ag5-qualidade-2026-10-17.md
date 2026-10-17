Especialista: worker (testes) (area-testes-do-produto)

## O que é este cartão
Cartão de MEDIÇÃO (F16+F20+F21+F19). Produto = tabelas de aceite, sem mudança de código funcional.
Diff deste cartão: 1 arquivo novo, este relatório (`docs/audits/sync-ag5-qualidade-2026-10-17.md`); zero alteração em código, teste, guarda ou baseline. Fonte: leitura de log do GitHub (`gh`, somente leitura), `gitleaks`/`vercel` e bateria local. NENHUM merge, nenhuma PR fechada, nenhuma guarda afrouxada (limite do cartão respeitado).

## F20 — bateria na árvore final (o meu núcleo)
Comandos rodados AGORA, nesta ordem, 1 suite pesada por vez:

| # | Etapa | Comando | Resultado (linha real) |
|---|-------|---------|------------------------|
| 1 | install | `bun install --frozen-lockfile` | `651 packages installed [1.56s]` (lockfile íntegro) |
| 2 | typecheck | `bun run typecheck` (`tsc -b --force`) | exit 0, zero erro |
| 3 | lint ratchet | `node scripts/ci/lint-ratchet.mjs` | `baseline=498, atual=393, novas=0` OK |
| 4 | typecheck ratchet | `node scripts/ci/typecheck-ratchet.mjs` | `baseline=0, atual=0, novas=0` OK |
| 5 | implicit-any | `node scripts/ci/implicit-any-ratchet.mjs` | `implicit-any errors: 0 (baseline: 0)` |
| 6 | a11y button-name | `node scripts/ci/a11y-button-name-ratchet.mjs` | `82 (baseline: 236)` OK |
| 7 | unit | `bun run test` | `Test Files 1499 passed | 5 skipped (1504)` / `Tests 13235 passed | 24 expected fail | 48 todo (13307)` — EXIT=0 |
| 8 | contratos | `bun run test:contracts` | `Test Files 90 passed (90)` / `Tests 1381 passed (1381)` — EXIT=0 (11.77s) |
| 9 | segredo em artefato E2E | `node scripts/ci/check-e2e-artifact-secrets.mjs` | OK — nenhum workflow publica report com credenciais |
| 10 | inventário de testes | `node scripts/ci/check-test-inventory.mjs` | **FALHOU (exit 1)**: 6 testes órfãos (abaixo) |

Nenhum teste foi removido, pulado ou afrouxado: a contagem de unit (13235 passed, 5 skipped) e de contratos (1381 passed) é a da árvore; os `skip`/`expected fail`/`todo` são os que já existem no baseline, não introduzidos aqui.

**Achado vermelho (F20/etapa 209):** `check-test-inventory.mjs` (rodado no `ci.yml` e no `db-guard.yml`) reprova com 6 scripts `db-audit/*.test.sh` sem correspondente em YAML:
```
scripts/db-audit/department-invite-contract-audit-vocabulary.test.sh
scripts/db-audit/ia-usage-outbox-duravel.test.sh
scripts/db-audit/talkx-conversion-defaults.test.sh
scripts/db-audit/team-chat-department-transfer-guards.test.sh
scripts/db-audit/team-chat-media-contract.test.sh
scripts/db-audit/team-direct-conversation-race.test.sh
```
Pré-existente (não nasce deste cartão; os arquivos já estão no baseline). Dono: **worker (sql) / worker (ci)** — adicionar ao YAML ou à ALLOWLIST com justificativa. Eu não corrijo: guarda de CI/banco e não da minha área; mudar baseline para "passar" seria afrouxar guarda (proibido pelo cartão).

## F20 — SQL local e E2E: NÃO CONCLUÍ
- **Suites de SQL (`supabase/tests/*.sql` e `scripts/db-audit/*.test.sh`)** não foram executadas por mim: exigem Postgres descartável + papel real e são a área do **worker (sql)**, não a minha (regra de fronteira da área de testes).
- **E2E crítico local/sintético** não foi executado: não há stack Supabase local de pé nesta máquina (`supabase status` → sem container) e faltam os browsers `firefox`/`webkit` (só `chromium`/`chromium_headless_shell` presentes). Subir stack + migrations + seed + usuário sintético + dev server não cabe no limite de 60 min e é o que a F16 já aponta como bloqueio de infra no CI (ver abaixo). Não inventei resultado.

## F16 — main vermelha (a9b4d6c): classificação com trecho
| Workflow (run) | Falha | Classe | Trecho |
|---|---|---|---|
| CI/CD Pipeline `38986918764` | Unit 1/3, 2/3, 3/3; TypeCheck; Node CI Scripts | **código/teste** | TalkXOverview.table 13 falhas, TalkXA11y 3, AuditLogDashboard 9, filesPeriod.adversarial 2, TalkXTemplatesRail 1 e tsc com erro |
| E2E logado `38986918644` | 3 shards | **infra** | `Executable doesn't exist at /home/runner/.cache/ms-playwright/chromium_headless_shell-1248/...` (browsers não instalados no runner; 16 failed no shard deslogado-principal, 1 no setup autenticado) |
| DB Guard offline `38986918645` | Contrato DB offline | **guarda/contrato** | `supabase-usage-guard` acusa 30 violações novas: alvo em uso no código ausente do catálogo da main ("catalogo gerado em 2026-10-16"); migration replay OK |
| types-sync `38986918662` | Job de proposta de sync | **código** | `evolutionAdapter` TS2353 (×2) + `useTarefasAgendadas` TS2339/TS2345; drift types/catalogo/manifesto/grants = true |

Observação importante: **na árvore final (dia/2026-10-17) os unit tests estão VERDES (13235 passed)** — as falhas de unit da main a9b4d6c já não aparecem aqui; main vermelha ≠ árvore final vermelha para unit/contratos.

## F16 — tabela das 28 PRs (idade/tamanho/trilha/flag-migration)
Todas base `main`. Tamanho = arquivos / (linhas). flag-migration: nº de `supabase/migrations/*` tocadas.

| PR | estado | arq | linhas | idade | trilha | mig |
|----|--------|-----|--------|-------|--------|-----|
| 1922 | READY | 1 | +12/-2 | 14/10 | w10 mutação mapa | 0 |
| 1930 | READY | 2 | +179/-10 | 14/10 | w21 classificar migration-drift | 0 |
| 1975 | draft | 2 | +14/-15 | 16/10 | fix-ci reativar suites | 0 |
| 1979 | draft | 17 | +1546/-2510 | 16/10 | fix ci/codex | 0 |
| 1983 | **READY** | **3115** | **+362236/-30670** | 16/10 | lote/2026-10-16-880-cards | 0 |
| 1987 | draft | 114 | +14350/-64397 | 16/10 | sync ledger (codex) | 0 |
| 1991 | draft | 14 | +932/-126 | 16/10 | fix codex findings | 0 |
| 1997 | draft | 9 | +324/-382 | 16/10 | Copiloto CV011-020 | **6** |
| 1998 | draft | 4 | +1005/-3 | 16/10 | Copiloto CV021-030 worker | **1** |
| 2000 | draft | 16 | +1889/-1 | 16/10 | Copiloto CV031-040 brinde-intel | **2** |
| 2002 | draft | 6 | +1390/-1 | 16/10 | Copiloto CV041-050 suggest-reply | 0 |
| 2003 | draft | 9 | +1094/-190 | 16/10 | Copiloto CV051-060 radar-popup | 0 |
| 2005 | draft | 18 | +1982/-2 | 16/10 | Copiloto CV061-070 ghost-text | 0 |
| 2013 | draft | 14 | +1377/-0 | 16/10 | Copiloto CV071-080 objection-battlecard | 0 |
| 2021 | draft | 20 | +3929/-3160 | 16/10 | chore db-audit: known-violations + schema-catalog (branch auto `serene-allen-ojclyz`) | 0 |
| 2022 | draft | 9 | +928/-0 | 16/10 | Copiloto CV081-090 catalog-budget | 0 |
| 2023 | draft | 2 | +2/-2 | 16/10 | fix build: export duplicado (branch auto `pensive-cori-i93zgf`) | 0 |
| 2024 | draft | 14 | +1026/-0 | 16/10 | Copiloto CV091-100 signals | 0 |
| 2025 | draft | 16 | +939/-0 | 16/10 | Copiloto CV101-110 multimodal | 0 |
| 2026 | draft | 12 | +675/-0 | 16/10 | Copiloto CV111-120 guardrails | 0 |
| 2029 | draft | 12 | +1082/-0 | 16/10 | Copiloto CV121-130 supervisor | 0 |
| 2030 | draft | 12 | +902/-0 | 16/10 | Copiloto CV131-140 aprendizado | 0 |
| 2032 | draft | 12 | +1400/-0 | 16/10 | Copiloto CV141-150 piloto | 0 |
| 2033 | draft | 1 | +5/-1 | 17/10 | GA09 e2e logado | 0 |
| 2034 | draft | 2 | +34/-6 | 17/10 | GA10/GA02 notify names | 0 |
| 2035 | draft | 1 | +27/-0 | 17/10 | logger vitest mock | 0 |
| 2036 | draft | 3 | +985/-207 | 16/10 | GA04/GA05 db-migrate | 0 |
| 2037 | draft | 2 | +48/-12 | 17/10 | GA20/GA21 types-sync | 0 |

**Tamanho:** 1983 (3115 arq / +362236) e 1987 (114 arq / -64397) violam o teto da etapa 173 (≤30 arq / ≤1500 linhas) e precisam ser FATIADAS antes do merge. 1979 (-2510) também passa do teto de linhas.

## F16 — ordem de merge PROPOSTA (não executar; CI-destrava antes de produto)
1. **2023** (build, 2 linhas) e **1975** (reativar suites) — destravam o build/CI.
2. **2033, 2034, 2035, 2036, 2037** (série GA) — fecham as falhas de CI/E2E/types-sync da main.
3. **2021** (baseline known-violations + schema-catalog) — destrava o **DB Guard offline** (as 30 violações). Revisar: é baseline; nunca afrouxar.
4. **1979 / 1987** (sync ledger) — após CI verde; **1987 fatiar** (114 arq / -64397).
5. **Copiloto (dependem de migration, ordem CV):** 1997 → 1998 → 2000 → 2002 → 2003 → 2005 → 2013 → 2022 → 2024 → 2025 → 2026 → 2029 → 2030 → 2032 (as 3 com migration: 1997, 1998, 2000).
6. **1922, 1930, 1991** — pequenas, depois do verde.
7. **1983 (monstro)** — por último; fatiar antes (3115 arq).

**PR órfã (etapa 168):** só comentário-prova, sem fechar. Candidatas com branch de nome automático e sem cartão: **#2023** (`claude/pensive-cori-i93zgf`, fix de build de 2 linhas) e **#2021** (`claude/serene-allen-ojclyz`, baseline db-audit). Precisam de confirmação de autor antes do merge; **nenhuma foi fechada nem comentada por mim** (não executei mutação em PR alheia).

## F21 — segurança e segredos
- `gitleaks detect --no-git --source . --redact` → **`no leaks found`** (656.7 MB varridos, 24.4s).
- Diff desta sync = vazio (sem commit), logo não há segredo/dado de cliente a classificar no meu diff.
- Varredura por PR (etapa 211-212) é responsabilidade de cada autor de PR; minha leitura não imprime valor de segredo.
- Dependências novas: nenhuma (o cartão não altera `package.json`).

## F19 — Vercel (nomes, sem valores)
- `vercel project ls` → projeto **`zapp_web_v2`** existe (produção `www.zappweb.app.br`). Deploy/branch de produção **não conferido por escrito** aqui: exigiria `vercel project inspect`/dashboard e o cartão proíbe deploy manual; main=produção é premissa do plano, a confirmar no gate F19.
- Vars do Vercel que **NÃO** estão em `.env.example` (20): NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_SUPABASE_URL, POSTGRES_DATABASE, POSTGRES_HOST, POSTGRES_PASSWORD, POSTGRES_PRISMA_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING, POSTGRES_USER, SUPABASE_ANON_KEY, SUPABASE_JWT_SECRET, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, VITE_CLIENTES_SUPABASE_ANON_KEY, VITE_CLIENTES_SUPABASE_URL, VITE_EVOLUTION_API_URL, VITE_LOG_LEVEL.
- Vars do `.env.example` que **NÃO** estão no Vercel (10): EVOLUTION_API_FLAVOR, EVOLUTION_INSTANCE_NAME, EVOLUTION_INSTANCE_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY, PROMOGIFTS_SUPABASE_URL, VITE_CRM_INTEGRATION_ENABLED, VITE_SUPABASE_PUBLISHABLE_KEY.
- **Ponto de atenção F19:** `VITE_SUPABASE_PUBLISHABLE_KEY` está declarada no `.env.example` mas ausente no Vercel (nome), enquanto sobram vars `POSTGRES_*`/`NEXT_PUBLIC_*` (16 delas são do bloco Preview da branch `claude/fix-promogifts-offset-503`, provavelmente resíduo de outra app). Confirmar se a app lê `VITE_SUPABASE_PUBLISHABLE_KEY` (nome x nome) — se sim, o ambiente está incompleto.

## O que NÃO fiz e por quê
- Merge/push/deploy: proibidos no modo V2 e pelo cartão.
- SQL local + E2E local: fora da minha área (SQL = worker (sql)) e sem stack/browsers nesta máquina (ver acima).
- Correção do `check-test-inventory` (6 órfãos): guarda de CI/banco; corrigir seria mudar baseline — dono é worker (sql)/worker (ci).
- Único arquivo criado: `docs/audits/sync-ag5-qualidade-2026-10-17.md` (este relatório). Nenhum código/teste/guarda/baseline alterado; a árvore de código segue igual à base `dia/2026-10-17`.
