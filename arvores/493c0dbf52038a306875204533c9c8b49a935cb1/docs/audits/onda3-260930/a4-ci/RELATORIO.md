# A4 · Forense de CI + paridade de produção — Onda 3 (30/09/2026)

Auditor: subagente A4 (forense CI/produção). Host: WSL/Ubuntu (SSH), user `joaquim_ataides`.
Clone de referência (somente leitura): `/home/joaquim_ataides/projetos/Zapp_Web_V2`.
Sandbox de trabalho (ver nota): `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/multiplix-guards-fail-closed-26093014476657/.tmp/a4-ci`
(usei o `.tmp` do workspace da tarefa em vez de `/tmp` por causa da regra do guard do workspace; o clone é `cp -a` da referência + `git fetch origin` + `git checkout origin/main`).
`gh` = conta `adm01-debug` (somente leitura; nenhum `pr merge/close/comment/edit` executado).

Janela de medição: **2026-09-30 15:02 → 18:40 (BRT) / 18:02 → 18:40 UTC**.

Estados de main observados durante a auditoria (main avançou enquanto eu auditava):
| hora (UTC) | main HEAD | observação |
|---|---|---|
| 18:06 | `92e884ee` (#1308) | primeiro fetch |
| 18:22 | `160f3405` (#1314, merge 18:18:16) | 2ª medição |
| 18:36 | `d3ed11cb` | produção já redeployada |

---

## 1) Forense dos 3 PRs desta onda

### Recorte exato (janela 17:27 → 18:18 UTC)

| PR | estado | merge | merge commit | checks não-verdes |
|---|---|---|---|---|
| #1309 | MERGED 17:27:44 | `b4581381` | blocos reacao cross-team | **NENHUM** (todos `pass`) |
| #1313 | MERGED 17:45:24 | `9d37567e` | RPC ambígua + recursao tcm | **NENHUM** (todos `pass`) |
| #1314 | MERGED 18:18:16 | `160f3405` | guards Multiplix fail-closed | 1 `pending` (E2E) que virou `pass` às 18:17:47; `mergeStateStatus=BLOCKED` até o E2E fechar |

Saída crua (`gh pr checks`) — #1309 (17:19→17:27):

```
CodeQL          pass  5s      Contrato DB offline  pass 3m32s   SonarCloud Code Analysis pass 55s
Vercel          pass  0       Vercel Preview Comments pass 0     🎭 E2E Tests (Playwright) pass 2m0s
🏗️ Build        pass 24s      🔍 Lint & TypeCheck  pass 2m50s   🔒 Security Audit pass 19s
🔬 CodeQL (actions) pass 44s  🔬 CodeQL (javascript-typescript) pass 1m49s  🧪 Unit Tests pass 4m38s
```

#1313 (17:37→17:45): mesma estrutura, **todas `pass`** (`Contrato DB offline pass 3m16s`, `🧪 Unit Tests pass 4m44s`, `🏗️ Build pass 19s`, `🔍 Lint & TypeCheck pass 2m34s`, `🔒 Security Audit pass 11s`, E2E `pass 2m1s`, CodeQL/SonarCloud/Vercel `pass`).

#1314:
- 18:09:55 UTC → `🎭 E2E Tests (Playwright) pending 0`, `mergeStateStatus=BLOCKED`;
- `gh run view 36754855332`: `🎭 E2E Tests (Playwright) completed/success 2026-09-30T17:57:58Z -> 2026-09-30T18:17:47Z`;
- 18:31:49 UTC → **todos os checks `pass`**, PR `MERGED` em `2026-09-30T18:18:16Z` (`mergeCommit=160f34052619a837a5fd00c522a4ca338ff1d2fb`).

**Classificação (item 1):** não há check vermelho em nenhum dos 3 PRs. O único não-verde foi `pending` (E2E do #1314) e fechou verde — **não é defeito meu nem drift**; é fila/duração do próprio job (19m49s). Histórico dos workflows nesses branches: `gh run list --branch <head>` devolve **1 run por workflow** em cada branch (nenhum rerun, nenhuma falha anterior) → com o recorte do dia: **0 de 3 runs por branch com falha** em #1309/#1313, **0 de 1 run** falho em #1314.

Marcadores de infra que aparecem nos logs do `Contrato DB offline` (NÃO são falhas): as linhas
`aviso: falha de transporte ao falar com o banco; nova tentativa 1/2` e `nova tentativa 2/2` são **fixtures** do passo "Testar comparadores de catalogo, manifesto e migrations" (testes `queryLedger desiste apos esgotar tentativas de falha transitoria`, `LEDGER_RETRY_DELAYS_MS vazio desliga o retry do ledger`) — não são retry real de infra. Nos 3 logs do DB Guard offline: **0 ocorrências** de `toomanyrequests`, `Data limit exceeded`, `canceling statement due to statement timeout`, `exit 125`.

---

## 2) PROVA de que os 3 testes de contrato rodaram no CI

### 2a) Referência no workflow do commit certo (`.github/workflows/db-guard.yml`)

`git show <sha>:.github/workflows/db-guard.yml | grep -nE 'retry-disposable-postgres-test\.sh'`:

| commit | `team-reaction-membership` | `team-chat-rpc-ambiguity` | `multiplix-rls` |
|---|---|---|---|
| `b4581381` (#1309) | linha 253 ✅ | **ausente** (o teste ainda não existia) | linha 320 ✅ |
| `9d37567e` (#1313) | linha 253 ✅ | linha 396 ✅ | linha 325 ✅ |
| `9845569d` (#1314 head) | linha 266 ✅ | linha 409 ✅ | linha 338 ✅ |

Linhas cruas (uma por teste):
```
253:        run: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-reaction-membership.test.sh
338:        run: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-rls.test.sh
409:        run: bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-rpc-ambiguity.test.sh
```
**Nenhum dos 3 testes está órfão**: os três estão referenciados no workflow do commit correspondente (o `multiplix-rls.test.sh` já era executado desde antes — está no workflow do merge do #1309; o #1314 o **edita**, não cria: `index 81d60f358..19af2dc3d`).

### 2b) O passo REALMENTE executou no job "Contrato DB offline" (log cru)

Log `gh run view <id> --log`, runs 36750522845 (#1309), 36752716786 (#1313), 36754855278 (#1314) — o nome do ficheiro aparece na linha `Run` do próprio passo:

```
Contrato DB offline	Simular vinculo de time na reacao em mensagem (#1265)	2026-09-30T17:57:06.6841857Z ##[group]Run bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-reaction-membership.test.sh
Contrato DB offline	Simular contrato de acesso e fila do Multiplix	2026-09-30T17:58:16.9373647Z ##[group]Run bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/multiplix-rls.test.sh
Contrato DB offline	Simular ambiguidade da RPC e recursao da policy do team chat (#1266)	2026-09-30T17:59:23.4695126Z ##[group]Run bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/team-chat-rpc-ambiguity.test.sh
```

E as asserções (recorte do run do #1314; 476 linhas `[PASS]` no total do log, 0 falha real — o único `[FAIL]` é a evidência **negativa esperada** do teste de mutação de outro PR: `[EVIDENCIA] [FAIL] C5 (mutacao) anon NAO tem EXECUTE...` seguida de `[PASS] C5 a assercao de ACL do BLOCO B FALHA com o REVOKE removido (exit != 0)`):

```
[PASS] A1 (defeito) Atila REAGE em mensagem do OUTRO time pelo INSERT direto (caminho do app)
[PASS] B1 (#1265) INSERT direto cross-team agora e barrado pela RLS
[PASS] B2 (#1265) a RPC cross-team agora barra por vinculo
[PASS] A1 (defeito) get_team_messages_page estoura: conversation_id ambiguo (42702
[PASS] B1 (#1266) get_team_messages_page responde (sem 42702)
PASS: Multiplix hardening — anon sem acesso, FORCE RLS, policies TO authenticated no replay ...
```
No passo do Multiplix, entre as 22 migrações aplicadas na base descartável está `· 20260930300000_multiplix_guards_fail_closed.sql` (a migration do #1314) — ou seja, o teste roda **com a migration da onda aplicada**.

**Conclusão do item 2:** sem achado grave. Os 3 testes estão referenciados no workflow e rodam (e passam) no CI.

---

## 3) Estado do #1314 (medido duas vezes)

| hora da medição (UTC) | `state` | `mergeStateStatus` | checks não-verdes |
|---|---|---|---|
| 18:09:55 | OPEN | BLOCKED | `🎭 E2E Tests (Playwright) pending` |
| 18:31:49 | **MERGED** (18:18:16) | — | **nenhum** (`E2E pass 19m49s`) |

`gh pr view 1314 --json state,mergedAt,mergeCommit` às 18:22:01 UTC:
```json
{"headRefOid":"9845569d63ab1499143a2e13edb83a2acce1f22a","mergeCommit":{"oid":"160f34052619a837a5fd00c522a4ca338ff1d2fb"},"mergedAt":"2026-09-30T18:18:16Z","state":"MERGED"}
```
Todos os checks obrigatórios fecharam verdes (Contrato DB offline 4m8s; Unit Tests 4m46s; Lint & TypeCheck 2m33s; Build 21s; Security Audit 17s; CodeQL ×2; SonarCloud pass; Vercel pass).

---

## 4) PARIDADE DE PRODUÇÃO dos fixes de front da onda 2 (#1290, #1294, #1297)

### 4a) Ancestralidade (pré-condição)

```
#1290 merge=67e94e4b7af283fdc835d842e51671761412c9c9 (2026-09-30T15:40:26Z) → ANCESTRAL de origin/main: SIM
#1294 merge=3d2b7d572e689527e12e2e44104f327a9a23cb55 (15:54:57Z)              → SIM
#1297 merge=0958298a2eef31d5d86f107e78a773a4f45c1cb7 (16:17:33Z)              → SIM
```

### 4b) Qual build está servido? (`/version.json` do próprio deploy)

```
$ curl -sS https://zapp-web-v2.vercel.app/version.json
{"buildId":"160f34052619a837a5fd00c522a4ca338ff1d2fb"}
```
`160f3405` = **o merge commit do #1314** (ancestral de `origin/main`). O `vite.config.ts` injeta
`__ZAPP_BUILD_ID__ = process.env.VERCEL_GIT_COMMIT_SHA || ...` e emite `version.json` — logo o bundle servido foi construído **desse commit**, que contém #1290/#1294/#1297.

### 4c) Snapshots e comparação com build local

Snapshot do bundle servido (HTML + fecho completo dos chunks) em
`.tmp/a4-prod-now/` às **18:20–18:23 UTC**, entry citado no HTML: `assets/index-ClKpfp3_.js`; **381 chunks** baixados.
Build local reproduzível: `git archive origin/main | tar -x` em `.tmp/a4-build-head`, `bun install --frozen-lockfile` (bun 1.4.0) + `VERCEL_GIT_COMMIT_SHA=160f34052619a837a5fd00c522a4ca338ff1d2fb bun run build` (rolldown/vite, 8.5–19s) → **381 chunks**.

Comparação por conteúdo, normalizando os nomes de chunk (`X-<hash>.js` → `X.js`) para isolar o efeito cascata do hash do entry:

```
js em prod: 381   js no local: 381
multiset de hashes normalizados: iguais? -> só 1 par diferia por colisão de nome-base
keys (nome,tamanho) comuns: 350 | conteúdo normalizado DIFERENTE: 0
SLADashboard 488B  normalizado -> IDENTICO
SLADashboard 36867B normalizado -> IDENTICO
```
Ou seja: **o bundle servido é byte-a-byte o build de `160f3405`** (as diferenças de nome de ficheiro são cascata do `__ZAPP_BUILD_ID__` injetado no entry, não diferença de conteúdo).

### 4d) Marcadores dos fixes — PRESENTES nos chunks servidos

| fix | chunk servido (byte sha256) | trecho cru |
|---|---|---|
| **#1297** aviso de coordenada velha | `ContactForm-Bo9h-nuy.js` (17.476 B, `d94ea864c5bf1767…`), offset 16593 | ``…(x,{className:`w-3.5 h-3.5 shrink-0`}),`O endereço foi alterado, mas a localização (coordenada) continua a anterior — ela pode estar desatualizada.`]})]}),…`` |
| **#1297** select com a coordenada | `messageSender-h2IPmCGo.js` (8.489 B, `9c3da419ce07419d…`) offset 2668 / `ChatPanel-lbQdyM_W.js` (190.102 B, `0570668072f971f2…`) offset 178914 | ``…longitude<-180||t.longitude>180?void 0:{latitude:t.latitude,longitude:t.longitude,…`` |
| **#1290** CLEAR preserva o backoff de 429 | `SuggestionList-DgxH_AzC.js` (10.802 B, `8f7b1eed3227ffdf…`) | ``case`CLEAR`:return{...B,rateLimitedUntil:e.rateLimitedUntil}`` |
| **#1290** SET_QUERY invalida o destaque (A3-06) | `SuggestionList-DgxH_AzC.js` | ``case`SET_QUERY`:{let n=t.query.trim().length<I;return{...e,query:t.query,error:e.blocked?e.error:null,retrieveError:null,highlightedIndex:-1,…`` |
| **#1294** flag órfã removida | varredura de **todos** os 381 chunks servidos | `mapa.searchbox-autocomplete` presente? **False** (chave ausente do bundle, como esperado) |

`LocationPicker-Dfliiufn.js` (12.330 B, `82068f798cd10e8a…`) tem `highlightedIndex` ×6, `blocked` ×2, `paused` ×2 — coerente com o picker de ramo único (o reducer vive no chunk do `SuggestionList`).

**Veredito do item 4: VERIFICÁVEL e VERDADEIRO.** Os três fixes estão no bundle servido, e o bundle servido é reproduzível a partir de `160f3405`.
Ressalva honesta: produção redeploya a cada merge (às 18:36 o `/version.json` já respondia `d3ed11cb…` e o entry era `index-DQx0SZZw.js`); o snapshot acima é datado de 18:20–18:23 UTC e é o que foi auditado. Como `d3ed11cb` descende de `160f3405`, os marcadores continuam no ar, mas não re-download o bundle novo.

---

## 5) Vermelhos no HEAD da main (HEAD no momento: `160f3405`) — classificação

### 5a) `Contrato DB vivo` → failure (2 runs: 18:19:26 e 18:20:24) — **AMBIENTE + DRIFT-DE-OUTRA-SESSÃO**

Anotações do check-run (`gh api .../check-runs/110032198611/annotations`):
```
failure  Contrato vivo quebrado em: Verificar frescor do types.ts Regenerar manifesto e comparar com o commitado Paridade tripla (migrations, edges, grants) Comparar migrations com schema_migrations
```

Linhas cruas dos sub-falhos:

1. **AMBIENTE — rate limit do Docker Hub (o job nem chega a rodar o gen-types):**
```
Contrato DB vivo	Verificar frescor do types.ts	2026-09-30T18:20:15.9255574Z docker: Error response from daemon: toomanyrequests: Rate exceeded
Contrato DB vivo	Verificar frescor do types.ts	2026-09-30T18:20:16.4553121Z error running container: exit 125
Contrato DB vivo	Verificar frescor do types.ts	2026-09-30T18:20:16.4723104Z ##[error]Process completed with exit code 1.
```
No run do merge `b4581381` (#1309, 17:29) a mesma classe, com outra mensagem do registry:
```
2026-09-30T17:29:35.6125270Z docker: Error response from daemon: toomanyrequests: Data limit exceeded
2026-09-30T17:29:36.0048697Z error running container: exit 125
```

2. **DRIFT-DE-OUTRA-SESSÃO — migrations de outro PR sem registro no banco vivo:**
```
Contrato DB vivo	Comparar migrations com schema_migrations	arquivos validos em supabase/migrations: 685
Contrato DB vivo	Comparar migrations com schema_migrations	registros em schema_migrations: 683
FALHA: drift de migrations detectado:
  Arquivo no repo sem registro no banco (db push tentaria aplicar):
    20260930240000  20260930240000_cron_secret_dedicado_l5.sql
    20260930250000  20260930250000_reschedule_cron_secrets_l5.sql
```
`git log -1 origin/main -- <ficheiro>` → ambas vêm de **`33be6b98 fix(seguranca): da credencial dedicada ao cron no lugar da anon key (#1306)`** — PR de outra sessão (não é da minha onda). A minha (`20260930300000_multiplix_guards_fail_closed.sql`) **não** aparece na lista de pendentes → já registrada no banco na hora da medição.

3. **DRIFT-DE-ARTEFATO-DERIVADO — manifesto divergente em 2 funções Multiplix:**
```
Contrato DB vivo	Regenerar manifesto e comparar com o commitado	Manifesto desatualizado. Revise as divergencias antes de regenerar:
[functions] so em arquivo: 0 | so em banco: 0 | divergente: 2
  divergente: f:enforce_multiplix_dispatch_mutability(), f:enforce_multiplix_recipient_mutability()
Paridade tripla (migrations, edges, grants)	FALHA: count divergente: 685 arquivos vs 683 no ledger
Paridade tripla (migrations, edges, grants)	FALHA: md5 das versoes divergente entre arquivos e ledger
```
Atribuição: **o padrão já existia ANTES dos meus merges**. No run do merge `b4581381` (#1309, 17:29 — antes de #1313 e #1314):
```
[constraints] so em arquivo: 0 | so em banco: 9 | divergente: 0
[functions]   so em arquivo: 0 | so em banco: 4 | divergente: 4
  divergente: f:enforce_talkx_campaign_mutability(), f:enqueue_outbound_message(p_contact_id uuid, p_client_message_id uuid
[relation_grants] so em arquivo: 0 | so em banco: 20 | divergente: 0
Paridade tripla: FALHA: grants-baseline desatualizado. Regenere: psql ...
```
O commit `2aca8b89 chore(db): sincronizar artefatos derivados do banco (#1295)` (18:13 UTC, **outra sessão**) reduziu a divergência, e no run das 18:19 sobraram exatamente 2 funções que a minha migration redefine (`git grep` → `enforce_multiplix_*_mutability` aparece em `20260929590000_multiplix_mutability_guard.sql` **e** em `20260930300000_multiplix_guards_fail_closed.sql`). Classificação: **artefato derivado (manifesto/catálogo) defasado após aplicação da migration** — o próprio pipeline propõe o sync (`Propor sync de types + catalogo + manifesto + grants` → `completed/success` nos check-runs do HEAD), e o repo trata isso como PR de sync separado (#1295). Não é defeito do fix; é dívida de sincronização que deixa o guard "vivo" vermelho em main até o sync.

### 5b) `SonarCloud Code Analysis` (branch main) → failure — **PRÉ-EXISTENTE / NÃO ATRIBUÍVEL (drift de qualidade)**

Série com janela (anti-inflação) — `SonarCloud Code Analysis` nos 4 merge commits da janela:

| merge commit | PR | conclusão | condições reprovadas (raw, do check-run `output.summary`) |
|---|---|---|---|
| `b4581381` 17:27:54 | #1309 | failure | `[C Reliability Rating on New Code] (required ≥ A)` |
| `9d37567e` 17:45:35 | #1313 | failure | `[C Reliability Rating on New Code] (required ≥ A)` |
| `92e884ee` 17:57:08 | #1308 | failure | `[C Reliability Rating on New Code] (required ≥ A)` |
| `160f3405` 18:18:27 | #1314 | failure | `[3.1% Duplication on New Code] (required ≤ 3%)` **+** `[C Reliability Rating on New Code] (required ≥ A)` |

**4 de 4** merge commits da janela 17:27→18:18 falham o gate **na branch main**; a condição `C Reliability` é constante nos quatro (pré-existente, não introduzida pela onda). A violação de duplicação (3.1% > 3%) aparece só na análise de `160f3405`. Nos **PRs** os três checks SonarCloud passaram (`pass` em #1309/#1313/#1314). Quem introduziu os 3.1% **NÃO VERIFICÁVEL**: exige a lista de issues do SonarCloud (`sonarcloud.io/api/issues/search`) e não tenho token/credencial de leitura do projeto — só a página pública do dashboard.

### 5c) `Contrato DB vivo` em `9d37567e` → **cancelled** (ambiente/concurrency)
Check-run do merge do #1313: `completed/cancelled` (run 36753678802) — cancelado por concorrência (novo push/merge cancela o anterior), não é falha de conteúdo.

### 5d) `🎭 E2E logado (Playwright)` em `160f3405` → `in_progress` no momento da medição (18:31) — pendente, sem conclusão.

---

## 6) NÃO VERIFICÁVEL

- **Autor exato do breach de duplicação do SonarCloud** (3.1% em new code): sem token do SonarCloud para `api/issues/search`. Só dá para afirmar a série acima (4/4 na branch main, C Reliability constante; duplicação só na análise de `160f3405`).
- **Se a migration `20260930300000` estava aplicada no banco vivo antes das 18:19**: a evidência é indireta (não aparece na lista de "arquivo no repo sem registro no banco"), não li o ledger `schema_migrations` (proibido escrever; leitura via MCP não foi necessária para o escopo).

---

## 7) Comandos-chave usados (reprodução)

```bash
gh pr checks <1309|1313|1314> --repo adm01-debug/Zapp_Web_V2
gh run view 36750522845 --repo adm01-debug/Zapp_Web_V2 --log      # DB Guard do #1309
gh run view 36752716786 --repo adm01-debug/Zapp_Web_V2 --log      # DB Guard do #1313
gh run view 36754855278 --repo adm01-debug/Zapp_Web_V2 --log      # DB Guard do #1314
gh run view 36757701862 --repo adm01-debug/Zapp_Web_V2 --log      # Contrato DB vivo (main 160f3405)
gh run view 36751622039 --repo adm01-debug/Zapp_Web_V2 --log      # Contrato DB vivo (main b4581381, 17:29)
git -C <sandbox> show <sha>:.github/workflows/db-guard.yml | grep -n retry-disposable-postgres-test
curl -sS https://zapp-web-v2.vercel.app/version.json
curl -sS https://zapp-web-v2.vercel.app/ | grep -oE 'assets/index-[A-Za-z0-9_.-]+\.js'
# fecho de chunks: .tmp/a4-ci-work/snap.sh <dir>
# comparação build local x servido: .tmp/a4-ci-work/realdiff.py, cmp.py
# evidência dos marcadores no bundle: .tmp/a4-ci-work/evidencia.py
```

Artefatos brutos nesta pasta (`auditoria-onda3-260930/a4-ci/`): cópia deste relatório; logs e diffs em
`.tmp/a4-ci-work/` (`dbguard-*.log`, `dbvivo-*.log`, `pr*.diff`, `pub-chunks.txt`, `prod-chunks.txt`) e o snapshot do bundle em `.tmp/a4-prod-now/` (381 chunks, **não** versionado).
