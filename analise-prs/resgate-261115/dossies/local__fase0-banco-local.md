# Dossiê — `local__fase0-banco-local` (`origin/local/fase0-banco-local`, tip `1bee59c5a`, base `7a1585279`)

## Propósito
7 commits de 2026-10-04 ("fase 0" da fábrica local): app aceita banco local por desvio explícito (`VITE_ZAPP_LOCAL_SUPABASE_*`), `replay-local.sh` trava DNS/pg_cron para não chamar produção, 3 migrations (reconcile replay, fecha EXECUTE anônimo de `record_incoming_call_event` M-DB-02, tick Talk X não aborta no expurgo M-DB-01), 2 testes de banco no `db-guard.yml`, e2e passam a usar `fixtures/supabase-env.ts`, seção 0 do CLAUDE.md com a regra "trabalho local / lote do dia".

## Veredito: **INCORPORADA** (com 2 pontos superados de propósito) — apagar branch: **seguro**

Entrou via PR #1890 `b44540e35` "Lote 04–05/10: 45 correções da fábrica local" (toca `db-guard.yml`, `CLAUDE.md +57`, `replay-known-failures.json +8`, `replay-local.sh +14`, `src/config/supabase.ts`) e migrations/scripts idênticos byte a byte.

| Arquivo | Achado | Evidência na main |
|---|---|---|
| 3 migrations, `check-secdef-public-execute.{sql,test.sh}`, `talkx-tick-expurgo.test.sh`, `client.ts`, `.env.example` | idênticos | `PRESENT_BYTE` (JSON do item) |
| `.github/workflows/db-guard.yml` | 2 steps presentes | `db-guard.yml:340` (secdef) e `:1097` (talkx-tick-expurgo) |
| `scripts/db-audit/replay-known-failures.json` | 2 entradas presentes | `:79` e `:83` (fixtures 20261003182707/192707) |
| `scripts/db-audit/replay-local.sh` | travas DNS + `cron.launch_active_jobs=off` presentes; só o cleanup difere | `:156-161`. Main usa `exit 2` + `trap remover_nosso EXIT` (`:54-59`) em vez de `docker rm -f` inline — mudança deliberada (comentário R2-INF-014 `:24-25`: nunca `docker rm -f` de nome fixo) |
| `src/config/supabase.ts` | lógica inteira presente; protocolo ampliado para http+https | main `:11` e `:36` aceitam `['http:','https:']` — PR #2716 `f32223dda` "validar HTTPS e completar suíte E2E isolada". A linha da branch (só `http:`) foi superada de propósito |
| `src/config/__tests__/supabase.test.ts` | todos os casos presentes; `'https://localhost:54321'` saiu da lista de rejeitados porque main agora aceita https | main `:38-39` rejeita `wss://`/`ftp://`; `:51` loop aceita 127.0.0.1/localhost em https |
| `e2e/catalog.spec.ts` | import da fonte única presente | `:3 import { SUPABASE_URL, ... } from './fixtures/supabase-env'` |
| `e2e/fixtures/mapa-mocks.ts` | presente, forma diferente | `:4` import; `:27 SUPABASE_HOST = SUPABASE_URL`; `:169` route por `url.origin === SUPABASE_HOST` (mais estrito que o `**` da branch) |
| `e2e/fixtures/talkx-demo.ts` | presente, forma diferente | `:4` import `SUPABASE_STORAGE_KEY`; `:261 AUTH_STORAGE_KEY = SUPABASE_STORAGE_KEY` (definida em `supabase-env.ts:75` com a mesma fórmula `sb-<label>-auth-token`); `:284 iss: SUPABASE_URL + '/auth/v1'` |
| `CLAUDE.md` (seção 0, 49 linhas) | conteúdo migrou; partes obsoletas removidas de propósito | main `CLAUDE.md` = `@AGENTS.md` (#2762 `effd6b0bb` "instruções enxutas"). Regras 4-7 vivem em `docs/agentes/banco.md:15-31` (desvio local, overrides E2E, travas do replay, known-failures) e `AGENTS.md:70`. Regras 1-3 ("nenhum agente faz push/abre PR/mergeia", branch `dia/AAAA-MM-DD`, `db-migrate.yml` com aprovação) CONTRADIZEM o fluxo vigente em `AGENTS.md` (agente abre PR e mergeia; DDL pelo fluxo de `banco.md`) — obsoletas por decisão do dono, não lacuna |

## Lacunas a recuperar
Nenhuma. `banco.md:21-22` ainda diz que `catalog.spec.ts`/`talkx-demo.ts`/`mapa-mocks.ts` "não foram adaptados" — está desatualizado (os 3 já usam `supabase-env.ts`), mas é doc herdada da main, fora do escopo desta branch.

## Banco
Não consultado: as 3 migrations são `PRESENT_BYTE` em `supabase/migrations/` da main; aplicação em produção segue o ledger, não esta branch.

## Verificação adversarial

Parecer: **triagem confirmada** — `INCORPORADA`, apagar a branch é seguro. Tentei refutar os 7 arquivos
com lacuna (67 linhas) e os 2 "superados de propósito"; nenhum hunk de valor ≥ médio ficou fora da main.

Prova de que o trabalho entrou: `b44540e35` (PR #1890 "Lote 04–05/10: 45 correções da fábrica local") é
ancestral de `origin/main` (`git merge-base --is-ancestor` = 0) e toca os mesmos arquivos da branch
(`.env.example +7`, `db-guard.yml`, `CLAUDE.md +57`, `replay-known-failures.json +8`, `replay-local.sh +14`,
`check-secdef-public-execute.{sql,test.sh}`, `talkx-tick-expurgo.test.sh`, `src/config/supabase.ts`).

Conferi por md5, não pelo campo do JSON: as 3 migrations (`20261003272707`, `20261004172554`,
`20261004173439`), `check-secdef-public-execute.sql`, `check-secdef-public-execute.test.sh`,
`talkx-tick-expurgo.test.sh`, `.env.example` e `src/integrations/supabase/client.ts` são **byte a byte
iguais** entre `1bee59c5a` e `origin/main`.

Cada lacuna, verificada arquivo por arquivo na main:

| Lacuna alegada | Verificação | Conclusão |
|---|---|---|
| `src/config/supabase.ts` (2 linhas) | main `:1-48` é o mesmo módulo; só `:11` (comentário) e `:36` mudam, de `!== 'http:'` para `!['http:','https:'].includes(...)`. `git log -S"'http:', 'https:'"` → `f32223dda` (#2716) | superado de propósito; a linha da branch é **mais restritiva** e foi ampliada por decisão posterior |
| `src/config/__tests__/supabase.test.ts` (1 linha) | main é **superconjunto** (88 linhas vs 66): mantém os 5 casos da branch e acrescenta `:35-39` (`https://127.0.0.1.evil.example`, `https://192.168.0.10`, `https://[::1]`, `wss://`, `ftp://`) e o loop `:51-67` (10 casos HTTPS local, incl. PROD ignorado). `'https://localhost:54321'` saiu da lista de recusa porque a main **aceita** | sem perda; cobertura maior |
| `scripts/db-audit/replay-local.sh` (2 linhas) | travas presentes em main `:153-161` com o mesmo comentário "TRAVAS CONTRA A PRODUCAO (medido em 04/10/2026)", `/etc/hosts` e `cron.launch_active_jobs = off`. As 2 linhas ausentes são só o `docker rm -f "$NOME"` inline, trocado por `exit 2` + `trap remover_nosso EXIT` (`:50-59`), o que o comentário `:23-25` **proíbe explicitamente** ("Nunca `docker rm -f` de nome fixo: apagaria o container de outra execucao (R2-INF-014)") | recuperar seria **regressão** |
| `e2e/catalog.spec.ts` (3) | main `:3 import { SUPABASE_URL, SUPABASE_ANON_KEY as FIXTURE_SUPABASE_ANON_KEY } from './fixtures/supabase-env'` — literal removido | presente |
| `e2e/fixtures/mapa-mocks.ts` (4) | main `:4` import, `:27 SUPABASE_HOST = SUPABASE_URL`, `:169` route por `url.origin === SUPABASE_HOST` + regex de `/(auth\|rest\|storage\|realtime\|functions)/v1/` — mais estrito que o `${SUPABASE_HOST}/**` da branch. Checei se o `new URL(...).origin` da branch protegia contra barra final: `.env.production:7 VITE_SUPABASE_URL=https://tnnnlkbymytvtqngbbqh.supabase.co` (sem barra) e `supabase-env.ts:54` exige `https://127.0.0.1:5173` exato no modo isolado — a normalização é inócua | presente, forma melhor |
| `e2e/fixtures/talkx-demo.ts` (5) | main `:4 import { SUPABASE_URL, SUPABASE_STORAGE_KEY }`, `:261 AUTH_STORAGE_KEY = SUPABASE_STORAGE_KEY`, `:284 iss: SUPABASE_URL + '/auth/v1'`. `supabase-env.ts:75` tem a **mesma fórmula** `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token` | presente, fórmula movida para a fonte única |
| `scripts/db-audit/README.md` | main `:18-19` com as 2 linhas da tabela | presente |
| `.github/workflows/db-guard.yml` / `replay-known-failures.json` | main `db-guard.yml:340` e `:1097`; `replay-known-failures.json:79-85` (fixtures `20261003182707`/`20261003192707`) | presente |
| `CLAUDE.md` seção 0 (49 linhas) | **removida de propósito, com registro.** `git log -S"Onde se trabalha: banco LOCAL" origin/main -- CLAUDE.md` → adicionada em `b44540e35`, removida em `ac04c5c03` (#2565 "arquitetura abandonada removida"), que no lugar escreveu: _"O fluxo antigo de 'git local + branch `dia/AAAA-MM-DD` + um PR por lote, nenhum agente abre PR' (2026-10-04) foi **abandonado** na prática — não o siga."_ Depois `effd6b0bb` (#2762) esvaziou o CLAUDE.md (`-379` linhas → `@AGENTS.md`) e as regras 4-7 reapareceram quase literais em `docs/agentes/banco.md:15-30` (desvio local, overrides E2E, travas DNS+pg_cron, replay ≠ produção) e em `AGENTS.md:70` ("dev server sem `VITE_ZAPP_LOCAL_SUPABASE_*` aponta para produção") | regras 1-3 e o parágrafo das ferramentas de WSL: **obsoletos por decisão registrada do dono**; regras 4-7: presentes |

Único resíduo, de valor baixo: os números medidos da regra 7 (21 falhas esperadas, 64 divergências de
`schema-manifest.json`) foram generalizados em `banco.md:28-30` sem os valores. São métricas de
04/10/2026, hoje desatualizadas (migrations novas desde então) — recuperá-las plantaria número errado.
Não é lacuna.

Banco: não consultei a produção. As 3 migrations são idênticas às da main; o estado aplicado é o ledger,
que esta branch não altera.
