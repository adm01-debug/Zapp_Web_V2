# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-01 por sessão `claude_04/pensive-tesla-ixtl9w`._

---

## 1. DB Live Guard — falhas em contrato vivo (investigação pendente)

**Último run com falha:** [41318522203](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41318522203) (2026-11-01T14:54Z)  
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

## 3. E2E logado — falhas em testes de telefonia e autenticação

**Runs com falha recentes:**
- [41240478106](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41240478106) — job `deslogado-secundario` (telefonia) — 2026-10-31T20:46Z
- [41172264670](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41172264670) — job `authenticated` (3 testes) — 2026-10-31T05:21Z

**O que falha:**
- **Job `deslogado-secundario`** (`chromium-telefonia`, `firefox-telefonia`, `webkit-telefonia`): log indica `503 ***/functions/v1/get-sip-password :: {"error":"SIP não configurado","code":"SIP_NOT_CONFIGURED"}`. O job é cancelado por timeout. A edge function `get-sip-password` retorna 503 porque SIP não está configurado no ambiente de produção usado pelo CI.
- **Job `authenticated`**: 3 testes falharam (nomes não visíveis — logs retornam vazios via API). Uma issue `[e2e-logado] Suíte logada quebrada na main` foi aberta automaticamente pelo workflow.

**Por que não foi corrigido:** Os testes de telefonia dependem de `get-sip-password` que retorna 503 quando SIP não está configurado — é um estado esperado do ambiente de CI, não um bug de código. Os testes autenticados dependem de estado no banco de produção e de credenciais reais. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Verificar a issue aberta `[e2e-logado] Suíte logada quebrada na main` para ver os 3 testes autenticados com falha
2. Se os testes de telefonia falharem por SIP não configurado: avaliar se o mock de `get-sip-password` deve ser expandido para cobrir o estado 503 nos specs de telefonia
3. Os logs completos do Playwright estarão no artifact `playwright-report` do run correspondente

---

## 4. DB Migrate — dispatch manual com versão incorreta

**Runs com falha recentes:**
- [41313326544](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41313326544) — 2026-11-01T13:52Z
- [41209212823](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41209212823) — 2026-10-31T14:14Z

**O que falha:** `workflow_dispatch` manual com `TARGET_VERSION` incorreto ou `missing_count > 0`.

**Por que não foi corrigido:** Workflow de dispatch manual — sem código para corrigir. Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. O `db-migrate.yml` é disparado manualmente (Settings → Actions → db-migrate → Run workflow)
2. Passar o `TARGET_VERSION` correto (última migration do ledger: `SELECT max(version) FROM supabase_migrations.schema_migrations`)
3. Fazer dry-run primeiro (`apply=false`) e conferir o hash SHA-256 antes do apply

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
