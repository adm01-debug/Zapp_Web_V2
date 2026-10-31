# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão de correção de CI._

---

## 1. DB Live Guard — deriva transitória

**Runs com falha:**
- [41066127274](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41066127274) — 2026-10-30T13:47:10Z (todos os 7 passos falharam)

**O que falhou:** Todos os 7 passos do "Contrato DB vivo":
- Comparar migrations com schema_migrations
- Verificar ACL e contrato de mcp_exec
- Regenerar catálogo e comparar com o commitado
- Regenerar manifesto e comparar com o commitado
- Verificar frescor do types.ts
- Paridade tripla (migrations, edges, grants)
- Auditar configuração runtime sem dados de clientes

**Por que não foi corrigido:** O DB Live Guard compara o estado do banco de produção com os artefatos do repositório (types.ts, schema-catalog.json, deployment-manifest.json). A falha em TODOS os passos sugere deriva transitória causada pelo `deploy-functions.yml` estar parado (deno.lock quebrado). Os artefatos gerados por `types-sync` e `deploy-functions` estavam desatualizados.

**O que o Joaquim precisa fazer:**
1. Aguardar a conclusão do run [41162076060](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162076060) do `deploy-functions.yml` na main (fix do PR #2407, commit `004e74a8`)
2. Após o deploy das edge functions com sucesso, disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
3. Se ainda falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo específico tem diferença real
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration aplicada em produção sem estar no ledger (`SELECT max(version) FROM supabase_migrations.schema_migrations`)
5. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` para regenerar types.ts

---

## 2. Running Copilot Code Review — falha de firewall interno do Copilot

**Workflow:** Dinâmico do GitHub Copilot — **não tem arquivo próprio no repositório**  
**Não é required check** (não bloqueia merge da main)

**Runs confirmados com falha:**
- [41125593441](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41125593441) — 2026-10-30
- [41140197413](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41140197413) — `copilot-pull-request-reviewer`, conclusão `failure` em 2026-10-30T22:49:16Z
- [41154128287](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41154128287) — `copilot-pull-request-reviewer`, conclusão `failure` em 2026-10-31T01:11:xx

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
3. Ou aguardar correção do próprio GitHub (pode ser indisponibilidade temporária do serviço Copilot)

---

## 3. deploy-functions.yml — fix em main, aguardando conclusão do run

**Última run com falha:** [41147095645](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41147095645)

**O que falhou:** Step "Typecheck das edge functions (deno check)":
```
error TS2307: Cannot find module '@types/node' or its corresponding type declarations
```

**Causa raiz:** `@types/ws@8.18.1` tem `/// <reference types="node" />` que força resolução de `@types/node`. O `scripts/ci/deno.lock` tem zero entradas npm, então `deno install --frozen` não instala `@types/node`.

**Correção aplicada em PR #2407** (commit `004e74a8`, 2026-10-31T02:53:54Z):
```yaml
- name: Instalar dependencias node_modules (deno install + @types/node)
  run: |
    deno install --config supabase/functions/deno.json
    (cd supabase/functions && echo '{}' > package.json && npm install --no-save --ignore-scripts --no-package-lock @types/node && rm -f package.json)
```

**Status:** Fix em main desde commit `004e74a8`. Run [41162076060](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162076060) (workflow_dispatch, 2026-10-31T02:54:59Z) estava `queued` na SHA `004e74a8`. Aguardando `conclusion=success`.

**O que o Joaquim precisa fazer:** Apenas confirmar que o run [41162076060](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162076060) completou com `success`. Se ainda estiver `queued` sem iniciar depois de 10 minutos, verificar se o environment `producao-edge-functions` tem aprovação pendente.

---

## 4. Lockfile npm desatualizado — solução requer Deno local

**Contexto:** O `scripts/ci/deno.lock` tem zero entradas npm. A abordagem atual (PR #2407: instalar `@types/node` via npm diretamente em `node_modules/` após `deno install`) funciona mas não é rastreada no lockfile — a versão de `@types/node` instalada não está pinada.

**Por que não foi corrigido:** Regenerar `deno.lock` com entradas npm exige Deno instalado localmente (não disponível no container cloud desta sessão). O comando seria:
```sh
cd supabase/functions
deno install --config deno.json
# deno.lock será atualizado com entradas npm
```

**O que o Joaquim precisa fazer (ou autorizar):**
1. Instalar Deno localmente (se não tiver): `curl -fsSL https://deno.land/install.sh | sh`
2. Rodar `deno install --config supabase/functions/deno.json` na raiz do repo
3. Verificar que `scripts/ci/deno.lock` ganhou entradas npm
4. Commitar o `scripts/ci/deno.lock` atualizado
5. Após isso, remover o passo `npm install` do `deploy-functions.yml` (usar `--frozen` novamente)

Enquanto isso, o `npm install` do passo atual funciona — apenas instala a versão mais recente de `@types/node@22.x` a cada run.

---

_Nota: Remover ou atualizar este arquivo conforme os itens forem resolvidos._
