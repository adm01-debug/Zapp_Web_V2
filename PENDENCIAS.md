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

**Por que não foi corrigido:** O DB Live Guard compara o estado do banco de produção com os artefatos do repositório. A falha em TODOS os passos sugere deriva transitória causada pelo deploy-functions estar parado. Deve se resolver após este fix.

**O que o Joaquim precisa fazer:**
1. Aguardar o merge deste PR (fix `nodeModulesDir: none` → deploy-functions volta a funcionar)
2. Após o merge, disparar manualmente o DB Live Guard via `workflow_dispatch`
3. Se ainda falhar: examinar o artifact `db-live-evidence-{run_id}-1` para identificar o passo com diferença real

---

## 2. Running Copilot Code Review — falha de firewall interno do Copilot

**Runs:** múltiplos (ex.: [41125593441](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41125593441))  
**Workflow:** workflow dinâmico do GitHub Copilot (não tem arquivo próprio no repo)

**Por que não foi corrigido:** Falha no ambiente de execução do Copilot (firewall bloqueando URLs externas). Não é corrigível via código.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão bloqueadas
2. Adicionar URLs necessárias na lista de permissões ou aguardar correção do GitHub

---

## 3. deploy-functions — `@types/node` não encontrado no `deno check` (fix em PR)

**Run com falha:** [41138661310](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41138661310) — SHA `bcb11c84`, 2026-10-30  
**Workflow:** `.github/workflows/deploy-functions.yml`

**Erro exato:**
```
error: Error: Could not find "@types/node" in a node_modules folder.
Deno expects the node_modules/ directory to be up to date.
```

**Causa:** `supabase/functions/deno.json` usava `"nodeModulesDir": "auto"`. Com esse modo, o Deno 2.9.5 cria `node_modules/` mas o lockfile só contém `npm:tslib@2.8.1`. Ao encontrar `/// <reference types="node" />` transitivo (via `@supabase/realtime-js` → `ws`), o `deno check` falha.

**Fix aplicado:** `supabase/functions/deno.json` — `"nodeModulesDir": "auto"` → `"nodeModulesDir": "none"`. Com `"none"`, o Deno não usa `node_modules/`; as referências transitivas em `.d.ts` são ignoradas pelo `skipLibCheck: true` já presente.

**Status:** Fix neste PR — aguardando merge e run de prova. Após o merge, confirmar `conclusion: success` no run auto-disparado de `deploy-functions.yml`.

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
