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
1. Aguardar o merge do PR #2396 (corrige deno.lock → deploy-functions volta a funcionar)
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

## 3. Branches adm01-debug-patch-* — criadas pelo GitHub UI (templates de workflow) (GF-033..056)

**Situação:** 24 branches criadas por Joaquim diretamente na interface do GitHub ao explorar templates de workflows do GitHub Actions. Cada grupo de branches representa edições iterativas do mesmo template (sub-branches são histórico de edição via UI). **Não abrir PR, não apagar.** Aguardar decisão do Joaquim sobre adotar ou descartar cada template.

### Grupo 1 — `dependency-review.yml` (8 branches: GF-033..040)

Branches: `adm01-debug-patch-1`, `adm01-debug-patch-1-2`, `adm01-debug-patch-1-3`, `adm01-debug-patch-1-4`, `adm01-debug-patch-1-5`, `adm01-debug-patch-1-6`, `adm01-debug-patch-1-7`, `adm01-debug-patch-1-8`

**O que propõe:** Adicionar `.github/workflows/dependency-review.yml` — workflow padrão do GitHub para revisar licenças e vulnerabilidades de dependências em PRs (acionado em `pull_request` para a `main`).

**Decisão pendente do Joaquim:**
- Adotar: abrir PR a partir de `adm01-debug-patch-1` (a mais recente/completa do grupo)
- Descartar: as 8 branches podem ser apagadas sem perda

### Grupo 2 — `deno.yml` (13 branches: GF-041..053)

Branches: `adm01-debug-patch-2`, `adm01-debug-patch-2-1`, `adm01-debug-patch-2-2`, `adm01-debug-patch-2-3`, `adm01-debug-patch-2-4`, `adm01-debug-patch-2-5`, `adm01-debug-patch-2-6`, `adm01-debug-patch-2-7`, `adm01-debug-patch-2-8`, `adm01-debug-patch-2-9`, `adm01-debug-patch-2-10`, `adm01-debug-patch-2-11`, `adm01-debug-patch-2-12`

**O que propõe:** Adicionar `.github/workflows/deno.yml` — workflow de CI para Deno (template oficial GitHub para projetos Deno).

**Atenção:** O projeto já tem CI para Deno integrado em `ci.yml` e `deploy-functions.yml`. Adotar este template provavelmente causaria execução duplicada.

**Decisão pendente do Joaquim:**
- Adotar: revisar se o conteúdo de `adm01-debug-patch-2` é diferente/complementar ao CI atual antes de abrir PR
- Descartar: as 13 branches podem ser apagadas sem perda

### Grupo 3 — `eslint.yml` + `manual.yml` (2 branches: GF-054..055)

Branches: `adm01-debug-patch-3`, `adm01-debug-patch-3-2`

**O que propõe:** Adicionar dois arquivos:
- `.github/workflows/eslint.yml` — workflow de lint com ESLint (template GitHub)
- `.github/workflows/manual.yml` — workflow de disparo manual simples (template "Manual workflow")

**Atenção:** O projeto já tem ESLint integrado em `ci.yml` (passo `🔍 Lint & TypeCheck`). Um `eslint.yml` separado causaria execução duplicada.

**Decisão pendente do Joaquim:**
- Adotar `eslint.yml`: revisar se é complementar; provavelmente redundante
- Adotar `manual.yml`: pode ser útil como workflow genérico de disparo manual
- Descartar: as 2 branches podem ser apagadas sem perda

### Grupo 4 — `eslint.yml` + `main.yml` (1 branch: GF-056)

Branches: `adm01-debug-patch-4`

**O que propõe:** Adicionar dois arquivos:
- `.github/workflows/eslint.yml` — igual ao do Grupo 3
- `.github/workflows/main.yml` — arquivo de 1 byte (starter vazio do GitHub)

**Decisão pendente do Joaquim:**
- Descartar: o `main.yml` de 1 byte não tem utilidade; `eslint.yml` é redundante com `ci.yml`
- A branch pode ser apagada sem perda

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
