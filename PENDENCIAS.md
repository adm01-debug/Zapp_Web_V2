# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-01 por sessão de correção de CI._

---

## 1. DB Live Guard — deriva de migration + artefatos desatualizados (issue #1965)

**Causa raiz identificada em 2026-11-01:**

### 1a. Migration ausente no repositório (DRIFT REAL — em correção)

A migration `20261030145126_copilot_fases13_15_tabelas` estava no ledger de produção mas sem arquivo correspondente no repositório. Isso causava exit 1 no passo "Comparar migrations com schema_migrations".

**Correção em andamento:** PR #2491 (`fix/reconciliar-migration-copilot-fases13-15`) adiciona o arquivo. Auto-merge ativo — aguardando CI.

### 1b. Artefatos desatualizados (schema-catalog, deployment-manifest, types.ts)

Os artefatos commitados não refletem as tabelas copilot criadas diretamente em produção. Causam falha nos passos de catálogo, manifesto, types e paridade tripla.

**Correção em andamento:** `types-sync.yml` disparado manualmente em 2026-11-01. O workflow gera PR com auto-merge para regenerar os três artefatos.

### 1c. Migrations apply-pending (veja Seção 4)

Há migrations em `main` não ainda aplicadas no banco de produção, causando exit 2 no passo "Comparar migrations". Depende do Joaquim aprovar (Seção 4).

**O que o Joaquim precisa fazer (após os PRs acima mergearem):**
1. Confirmar que PR #2491 e o PR do types-sync mergearam na main
2. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
3. Se o passo "Comparar migrations" ainda falhar: aprovar as migrations pendentes (Seção 4)

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

## 4. db-migrate — migrations apply-pending exigem aprovação no environment producao-ddl

**Situação (2026-11-01):** Há migrations em `supabase/migrations/` (presentes na `main`) que ainda não foram aplicadas no banco de produção. O workflow `db-migrate.yml` falha quando há múltiplas migrations pending porque exige um alvo único ou bundle atômico conhecido.

**Migrations apply-pending conhecidas (podem mudar conforme PRs mergearem):**
- `20261023100000_*` — arquivo em main, não no ledger
- `20261020120000_*` — arquivo em main, não no ledger
- (possivelmente outros adicionados por PRs recentes)

**Como verificar o estado atual:**
```sql
SELECT max(version) FROM supabase_migrations.schema_migrations;
```
E comparar com `ls supabase/migrations/*.sql | sort | tail -10`.

**O que o Joaquim precisa fazer:**
1. Abrir [db-migrate.yml → workflow_dispatch](https://github.com/adm01-debug/Zapp_Web_V2/actions/workflows/db-migrate.yml) na aba Actions
2. Executar com `apply=false` (dry-run) para ver quais migrations serão aplicadas e obter o hash SHA-256
3. Se o resultado do dry-run estiver correto, executar com `apply=true` e o `confirm_runtime_sha256` obtido no passo anterior
4. O job pausa em `Waiting` no environment `producao-ddl` — aprovar na aba Actions → Environments
5. **Atenção:** executar uma migration por vez se houver dependências de ordem entre elas

**Nota:** O `db-migrate.yml` exige um alvo único (`target_version`) ou bundle atômico. Se houver múltiplas migrations pending, executar o workflow uma vez por migration, em ordem crescente de versão.

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
