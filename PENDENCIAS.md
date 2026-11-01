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

## 4. Branches adm01-debug-patch-* — criadas pelo GitHub UI (templates de workflow) (GF-033..056)

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

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
