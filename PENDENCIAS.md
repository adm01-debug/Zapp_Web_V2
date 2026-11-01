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
PR #2407, que introduziu a declaração de `@types/node` em `supabase/functions/deno.json`),
e **ainda falhou** com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407
não foi suficiente para resolver o erro.

**Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a declaração
de `@types/node` em `deno.json` requer investigação adicional em `supabase/functions/` e
`supabase/config.toml`. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** (ensaio: roda tudo até o deploy exclusive, sem publicar nada e sem
   reescrever secrets) para diagnosticar o erro `@types/node` sem risco de side-effects
2. Se falhar, verificar as dependências Deno em `supabase/functions/deno.json`, `_shared/` e
   `supabase/config.toml`; confirmar que `@types/node` está mapeado corretamente no import map
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio reescreve secrets e publica
   as funções imediatamente no ambiente de produção

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
