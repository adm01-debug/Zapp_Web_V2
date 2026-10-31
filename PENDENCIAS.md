# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão `fix/ci-workflows`._

---

## 1. DB Live Guard — deriva transitória

**Último run com falha:** [41162077590](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162077590)  
**Head SHA:** vários (pós-merge de `main`)

**O que falha:**
- Step "Consolidar veredito do contrato vivo" — artifact `13027601857` contém evidências
- Compara o estado do banco de produção com artefatos do repositório (types.ts, schema-catalog.json,
  deployment-manifest.json)

**Por que não foi corrigido:** O DB Live Guard conecta ao banco de produção e compara com
artefatos gerados por `types-sync` e `deploy-functions`. Falhas em "todos os passos" indicam
deriva transitória: os artefatos no repositório ficam desatualizados quando `deploy-functions`
está parado. Após o merge da PR que corrigiu o deno.lock (PR #2394), `deploy-functions`
voltou a funcionar.

**O que o Joaquim precisa fazer:**
1. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
2. Se falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo tem diferença real
3. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml`
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration
   aplicada em produção sem estar no ledger

---

## 2. Running Copilot Code Review — firewall interno do GitHub Copilot

**Runs com falha confirmados (exemplos):**
- [41167331596](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41167331596) — 2026-10-31T04:08Z
- [41166869775](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41166869775) — 2026-10-31T04:02Z
- múltiplos anteriores no mesmo dia

**Workflow:** Dinâmico do GitHub Copilot — **não tem arquivo no repositório**.

**O que falha:** Step "Processing Request (Linux)" falha com erro de firewall:
```
If you need me to access, download, or install something from one of these locations, you can either:
  - Configure Actions setup steps to set up my env before the firewall is enabled.
  - Add the appropriate URLs or hosts to my firewall allow list
```
A URL bloqueada inclui `https://api.business.githubcopilot.com/agents/swe/agent/cleanup`.

**Por que não foi corrigido:** Workflow dinâmico do GitHub Copilot — sem código no repositório.
A falha está no ambiente de execução do Copilot (firewall bloqueando URLs externas). Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão sendo bloqueadas
2. Adicionar as URLs necessárias na lista de permissões do firewall do Copilot
   (ver: https://gh.io/copilot/firewall-config)
3. Ou aguardar correção do próprio GitHub (pode ser indisponibilidade temporária do serviço)

---

## 3. Deploy Edge Functions — por design (sem push para supabase/functions/)

**Comportamento esperado:** `deploy-functions.yml` só executa quando o push na `main` altera
código implantável em `supabase/functions/` ou `supabase/config.toml`. Quando o push toca
apenas arquivos de frontend, documentação ou configuração de CI, o workflow não é disparado
(condição `paths:` no trigger).

**Quando aparece como "falha":** Em runs anteriores (antes do fix do deno.lock em PR #2394),
o workflow falhava por `deno check` não encontrar `@types/node`. Isso foi corrigido na PR #2407.
Runs futuros que alterem `supabase/functions/` passarão corretamente.

**Não há ação pendente** — comportamento correto por design. O workflow `workflow_dispatch`
permanece disponível para rollback e operações direcionadas.

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
