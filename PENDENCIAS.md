# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão `fix/ci-workflows`._

---

## 1. DB Live Guard — falhas em contrato vivo (investigação pendente)

**Último run com falha:** [41162077590](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162077590)  
**Head SHA:** vários (pós-merge de `main`)

**O que falha:**
- Step "Consolidar veredito do contrato vivo" — artifact `13027601857` contém evidências
- Compara o estado do banco de produção com artefatos do repositório (types.ts, schema-catalog.json,
  schema-manifest.json)

**Falhas identificadas no run 41162077590 (3 contratos reais, não deriva transitória):**
1. **migrations/ledger** — diferença entre migrations no disco (`supabase/migrations/`) e entradas no ledger do banco
2. **ACL/mcp_exec** — contrato de permissão `mcp_exec` não satisfeito
3. **configuração runtime** — `runtime-config` com divergência detectada

**Por que não foi corrigido:** DB Live Guard conecta ao banco de produção e exige análise
das evidências no artifact `db-live-evidence-{run_id}-1` para diagnosticar cada divergência.
Requer acesso ao banco de produção para comparação e possível migration corretiva. Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
2. Se falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo tem diferença real
3. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` **na branch `main`**
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration
   no disco (em `supabase/migrations/`) sem entrada no ledger

---

## 2. Running Copilot Code Review — limite de cota do plano (HTTP 402)

**Runs com falha confirmados (exemplos):**
- [41167331596](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41167331596) — 2026-10-31T04:08Z
- [41166869775](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41166869775) — 2026-10-31T04:02Z
- múltiplos anteriores no mesmo dia

**Workflow:** Dinâmico do GitHub Copilot — **não tem arquivo no repositório**.

**O que falha:** Step "Processing Request (Linux)" termina com `errorType: 'quota'`, HTTP 402,
"You've reached your additional usage limit for your plan". A mensagem de firewall que aparece
no log é secundária — a causa real é esgotamento de cota de uso do Copilot Code Review.

**Por que não foi corrigido:** Workflow dinâmico do GitHub Copilot — sem código no repositório.
A falha está no limite de cota do plano do Copilot (HTTP 402). Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Billing and plans → Copilot usage limits
2. Aguardar reset de ciclo de faturamento ou fazer upgrade do plano
3. Configurar allowlist de firewall do Copilot **não resolve** este erro — a causa é HTTP 402 quota, não HTTP 403 firewall

---

## 3. Deploy Edge Functions — fix de @types/node tentado (PR #2407) mas ainda falha

**Comportamento esperado:** `deploy-functions.yml` só executa quando o push na `main` altera
código implantável em `supabase/functions/` ou `supabase/config.toml`. Quando o push toca
apenas arquivos de frontend, documentação ou configuração de CI, o workflow não é disparado
(condição `paths:` no trigger).

**Run com falha após o fix:** Run `41162076060` executou no SHA `004e74a8c5` (pós-merge da
PR #2407, que adicionou a instalação npm de `@types/node` em `deploy-functions.yml`),
e **ainda falhou** com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407
não foi suficiente para resolver o erro.

**Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a instalação
npm de `@types/node` requer investigação adicional — provavelmente o path do `node_modules`
gerado não é o que o `deno check` procura. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** (ensaio: roda tudo até o deploy exclusive, sem publicar nada e sem
   reescrever secrets) para diagnosticar o erro `@types/node` sem risco de side-effects
2. Se falhar, investigar por que a instalação npm de `@types/node` não resolve o `Could not find "@types/node"` do `deno check`; verificar o path do `node_modules` gerado versus o caminho que o Deno resolve
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio reescreve secrets e publica
   as funções imediatamente no ambiente de produção

---

## 4. DB Migrate — 3 versões no ledger sem arquivo no disco

**Versões afetadas (remote_only):** encontradas pelo step "Paridade arquivos↔ledger" do
`db-live-guard`. Versões que existem no ledger do banco mas não têm arquivo em `supabase/migrations/`.

**Por que não foi corrigido:** Requer análise de cada versão para determinar se o arquivo foi
deletado por engano, nunca foi commitado, ou se a migration foi aplicada manualmente sem
passar pelo fluxo de arquivo→PR→merge. Risco de criar arquivo errado e introduzir drift.
Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Consultar `SELECT version, name, statements FROM supabase_migrations.schema_migrations
   WHERE version NOT IN (SELECT regexp_replace(filename, '^(\\d{14}).*$', '\\1') FROM ...)` para listar as versões
2. Para cada versão remote_only: decidir se o arquivo precisa ser criado (reconciliação) ou
   se a entrada do ledger está errada (correção)
3. Seguir CLAUDE.md §1 regra 7: o arquivo deve ter o SQL exato aplicado em produção

---

## 5. Congelamento de features — PR #2545 (Joaquim, 01/11/2026)

**Estado:** PR #2545 (feature freeze) aberta com auto-merge desde 2026-11-01 23:36Z.

**Decisão do Joaquim:** só entram correções dos 9 fluxos críticos de `docs/PRONTO_PRODUCAO.md`,
CI que impede verificá-los e segurança. Features novas (TalkX V4, Copiloto, a11y) aguardam
até os fluxos críticos estarem OK em produção.

**PRs fechadas pelo congelamento (01/11/2026 ~23:48Z):**
- PR #1930 (db-guard workflow) — branch preservada
- PR #2426 (branch-hygiene-audit) — branch preservada
- PR #2491 (migrations copilot fases 13-15) — branch preservada
- PR #2513 (email navy contrast) — branch preservada
- PR #2532 (docs GF tasks + PENDENCIAS) — branch `claude/trusting-albattani-9x3ipg` preservada

**Fix pendente do db-live-guard (não qualificado para o congelamento):**
Branch `fix/sincronizar-migrations-sql-divergente-261101-0400` criada com:
- `supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql` — `DROP POLICY IF EXISTS`
  adicionados para corresponder ao ledger de produção (SAME: true)
- `scripts/db-audit/migration-evidence.json` — 4 exceções pinned-replay para migrations
  20261016180000, 20261016190000, 20261016220000, 20261031130000 (ledger com resumo em prosa)
Esta correção reduz 5 das falhas "SQL divergente" no db-live-guard.
**Reabrir quando o congelamento levantar.**

**O que o Joaquim precisa fazer:**
1. Verificar se PR #2545 mergeou na main (status atual: OPEN, auto-merge habilitado)
2. Após o freeze: os 9 fluxos críticos de `docs/PRONTO_PRODUCAO.md` devem ser verificados em produção
3. O fluxo 2 (WhatsApp conectar) está QUEBRADO — prioridade máxima; sem ele fluxos 3 e 4 não funcionam
4. Após o freeze: reabrir branches fechadas ou criar novas PRs para as correções pendentes

---

## 6. Branches adm01-debug-patch-* e workflows "fantasma" (GF-032..GF-056)

**Status:** As 24 branches `adm01-debug-patch-*` **não existem mais no remoto** (verificado
em 2026-11-02 via `github_list_branches` — 3 páginas, ~219 branches, sem nenhuma entrada
`adm01-debug-patch-*`). Foram criadas pelo Joaquim na interface do GitHub a partir de templates
de workflow e foram apagadas sem PR mergeada.

**GF-032 — 25 workflows "fantasma"**
As branches originavam workflows não presentes no `.github/workflows/` da main (Bearer Scanner,
Hadolint, super-linter, main.yml etc.). Como as branches foram apagadas sem PR mergeada,
esses workflows nunca entraram na main. Não há ação necessária.

**GF-033..GF-056 — inventário (pelo BACKLOG de 2026-10-31):**

| Branch | Linhas (+) | GF |
|---|---|---|
| adm01-debug-patch-1 | +39 | GF-040 |
| adm01-debug-patch-1-2 | +43 | GF-033 |
| adm01-debug-patch-1-3 | +47 | GF-034 |
| adm01-debug-patch-1-4 | +55 | GF-035 |
| adm01-debug-patch-1-5 | +57 | GF-036 |
| adm01-debug-patch-1-6 | +55 | GF-037 |
| adm01-debug-patch-1-7 | +55 | GF-038 |
| adm01-debug-patch-1-8 | +43 | GF-039 |
| adm01-debug-patch-2 | +42 | GF-053 |
| adm01-debug-patch-2-1 | +28 | GF-044 |
| adm01-debug-patch-2-2 | +66 | GF-045 |
| adm01-debug-patch-2-3 | +31 | GF-046 |
| adm01-debug-patch-2-4 | +36 | GF-047 |
| adm01-debug-patch-2-5 | +98 | GF-048 |
| adm01-debug-patch-2-6 | +18 | GF-049 |
| adm01-debug-patch-2-7 | +33 | GF-050 |
| adm01-debug-patch-2-8 | +70 | GF-051 |
| adm01-debug-patch-2-9 | +34 | GF-052 |
| adm01-debug-patch-2-10 | +30 | GF-041 |
| adm01-debug-patch-2-11 | +40 | GF-042 |
| adm01-debug-patch-2-12 | +29 | GF-043 |
| adm01-debug-patch-3 | +32 | GF-055 |
| adm01-debug-patch-3-2 | +93 | GF-054 |
| adm01-debug-patch-4 | +1 | GF-056 |

**O que o Joaquim precisa fazer:**
- Branches deletadas — conteúdo inacessível via API.
- Se quiser reativar algum workflow das branches: recriar o arquivo diretamente na main
  usando os templates do GitHub Actions.

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
