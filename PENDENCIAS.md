# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-30 por sessão de correção de CI._

---

## 1. DB Live Guard — deriva transitória (todos os 7 passos falharam)

**Run:** [41066127274](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41066127274) — 2026-10-30T13:47:10Z  
**Head SHA:** `fb57b4a5cd071bf86a384d10f143360bd18feb61`

**O que falhou:** Todos os 7 passos do "Contrato DB vivo":
- Comparar migrations com schema_migrations
- Verificar ACL e contrato de mcp_exec
- Regenerar catálogo e comparar com o commitado
- Regenerar manifesto e comparar com o commitado
- Verificar frescor do types.ts
- Paridade tripla (migrations, edges, grants)
- Auditar configuração runtime sem dados de clientes

**Por que não foi corrigido:** O DB Live Guard compara o estado do banco de produção com os artefatos do repositório (types.ts, schema-catalog.json, deployment-manifest.json). A falha em TODOS os passos — incluindo "Verificar frescor do types.ts" — sugere deriva transitória causada pelo deploy-functions estar parado desde às 08:21 (por causa do deno.lock quebrado). Os artefatos gerados por `types-sync` e `deploy-functions` podem estar desatualizados.

**O que o Joaquim precisa fazer:**
1. Aguardar o merge do PR desta sessão (fix `nodeModulesDir: none` → deploy-functions volta a funcionar)
2. Após o merge, disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
3. Se ainda falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo específico tem diferença real
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration aplicada em produção sem estar no ledger
5. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` para regenerar types.ts

---

## 2. Running Copilot Code Review — falha de firewall interno do Copilot

**Runs:** múltiplos hoje (ex.: [41125593441](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41125593441))  
**Workflow:** `.github/workflows/` — workflow dinâmico do GitHub Copilot (não tem arquivo próprio no repo)

**O que falhou:** Step "Processing Request (Linux)" falha com:
```
If you need me to access, download, or install something from one of these locations, you can either:
  - Configure Actions setup steps to set up my env before the firewall is enabled.
  - Add the appropriate URLs or hosts to my firewall allow list
```

**Por que não foi corrigido:** Este é um workflow dinâmico do GitHub Copilot — não tem código no repositório. A falha está no ambiente de execução do Copilot (firewall bloqueando URLs externas necessárias para o processamento da review). Não é corrigível via código do projeto.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão sendo bloqueadas
2. Adicionar as URLs necessárias na lista de permissões do firewall do Copilot
3. Ou aguardar correção do próprio GitHub (pode ser uma indisponibilidade temporária do serviço Copilot)

---

## 3. deploy-functions — `@types/node` não encontrado no `deno check` (fix em PR)

**Run com falha:** [41138661310](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41138661310) — SHA `bcb11c84`, 2026-10-30  
**Workflow:** `.github/workflows/deploy-functions.yml`

**Erro exato:**
```
error: Error: Could not find "@types/node" in a node_modules folder.
Deno expects the node_modules/ directory to be up to date.
```

**Causa:** `supabase/functions/deno.json` usava `"nodeModulesDir": "auto"`. Com esse modo, o Deno 2.9.5 cria `node_modules/` mas o lockfile (`scripts/ci/deno.lock`) só contém `npm:tslib@2.8.1` — `@types/node` não é instalado. Ao encontrar `/// <reference types="node" />` transitivo (via `@supabase/realtime-js` → `ws`), o `deno check` falha.

**Fix aplicado:** `supabase/functions/deno.json` — `"nodeModulesDir": "auto"` → `"nodeModulesDir": "none"`. Com `"none"`, o Deno não usa `node_modules/`; as referências transitivas em `.d.ts` são ignoradas pelo `skipLibCheck: true` já presente.

**Status:** Fix em [PR #2401](https://github.com/adm01-debug/Zapp_Web_V2/pull/2401) — aguardando merge e run de prova. Após o merge, o push em `supabase/functions/deno.json` dispara `deploy-functions.yml` automaticamente; confirmar `conclusion: success` no run gerado.

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
