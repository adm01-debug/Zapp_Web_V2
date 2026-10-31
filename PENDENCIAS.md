# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão de correção de CI._

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
1. Aguardar o merge do PR #2409 (corrige deploy-functions → functions voltam a fazer deploy)
2. Após o merge, disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
3. Se ainda falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo específico tem diferença real
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration aplicada em produção sem estar no ledger (SELECT max(version) FROM supabase_migrations.schema_migrations)
5. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` para regenerar types.ts

---

## 2. Running Copilot Code Review — falha de firewall interno do Copilot (não corrigível via código)

**Runs confirmados com falha:**
- [41125593441](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41125593441) — múltiplos no dia 2026-10-30
- [41140197413](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41140197413) — job `copilot-pull-request-reviewer` (check run 124352329821), SHA `79156ee0e5ac8ebddefab98e3d6b5b19eb6b3dec`, PR #2399, concluído 2026-10-30T22:49:16Z com `conclusion=failure`

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
2. Adicionar as URLs necessárias na lista de permissões do firewall do Copilot (ver: https://gh.io/copilot/firewall-config)
3. Ou aguardar correção do próprio GitHub (pode ser uma indisponibilidade temporária do serviço Copilot)

---

## 3. Deploy Edge Functions (`deploy-functions.yml`) — correção em andamento via PR #2409

**Último run com falha na main:** [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645) — `conclusion: failure` — SHA `e4e8c265` — 2026-10-30T23:53Z

**Causa raiz:** `@types/ws@8.18.1` tem `/// <reference types="node" />` que força resolução de `@types/node` pelo `deno check`. O `scripts/ci/deno.lock` tem zero entradas npm; `deno install` padrão (frozen) recusa instalar pacotes npm ausentes do lockfile — `@types/node` nunca é instalado e o typecheck falha.

**Histórico de tentativas:**
- PR #2399 (SHA `3f18bbe7`): tentou `nodeModulesDir: "none"` → ainda falhou
- PR #2404 (SHA `e4e8c265`): reverteu para `nodeModulesDir: "auto"` → ainda falhou
- PR #2409 (SHA `4a7455896`): **fix atual** — `--frozen=false` + `@types/node` declarado em `deno.json` → CI em andamento

**Status:** PR [#2409](https://github.com/adm01-debug/Zapp_Web_V2/pull/2409) aberta com `auto_merge: squash`. CI run [41153047351](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41153047351) rodando (iniciado 2026-10-31T01:01Z).

**Ação pendente:** Aguardar merge automático. Após merge, verificar run de `deploy-functions.yml` na main para confirmar `conclusion: success`.

---

## 4. Reprodutibilidade do lockfile Deno — follow-up técnico (não bloqueia CI)

**Contexto:** A correção do item 3 usa `--frozen=false` + `@types/node@^22` sem pin de versão no lockfile. Isso cria uma build potencialmente não-reprodutível (Qodo, severidade média).

**Por que não foi corrigido agora:** O Deno não está disponível neste ambiente cloud para executar `deno install` localmente e gerar as entradas npm no `scripts/ci/deno.lock`.

**O que o Joaquim (ou sessão com Deno disponível) pode fazer:**
1. Em uma máquina com Deno instalado: `cd supabase/functions && deno install --config deno.json`
2. Isso populará `scripts/ci/deno.lock` com as entradas npm de `@types/node`
3. Após isso, remover `--frozen=false` do step no `deploy-functions.yml`
4. Abrir PR com lockfile atualizado + remoção do `--frozen=false`

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
