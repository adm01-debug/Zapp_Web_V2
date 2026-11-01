# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-11-01 por sessão `claude/trusting-albattani-9x3ipg`._

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
PR #2407, que adicionou a instalação npm de `@types/node` em `deploy-functions.yml`),
e **ainda falhou** com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407
não foi suficiente para resolver o erro.

**Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a instalação
npm de `@types/node` requer investigação adicional — provavelmente o path do `node_modules`
gerado não é o que o `deno check` procura. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** (ensaio: roda tudo até o deploy exclusive, sem publicar nada e sem
   reescrever secrets) para diagnosticar o erro `@types/node` sem risco de side-effects
2. Se falhar, investigar por que a instalação npm de `@types/node` não resolve o `Could not find "@types/node"` do `deno check`; verificar o path do `node_modules` gerado versus o caminho que o Deno resolve
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio reescreve secrets e publica
   as funções imediatamente no ambiente de produção

---

## 4. GF-002: db-migrate — 3 versões no ledger sem arquivo no repositório

**O que é:** O workflow `db-migrate.yml` (dry-run + apply) encontra 3 versões registradas
no ledger de produção (`supabase_migrations.schema_migrations`) que não têm arquivo
correspondente em `supabase/migrations/`. São migrations aplicadas diretamente no banco
sem passar pelo fluxo Git.

**Versions sem arquivo (a confirmar ao vivo):**
Executar `SELECT version, name FROM supabase_migrations.schema_migrations WHERE version NOT IN (SELECT regexp_replace(basename, '\.sql$', '') FROM ...)` para listar.

**Por que não foi corrigido:** Requer:
1. Leitura do SQL real de cada migration no ledger (campo `statements[]`)
2. Criação de arquivo `supabase/migrations/<version>_<name>.sql` com o SQL exato
3. PR → merge → verificação de paridade ledger↔arquivo

Isso depende de acesso ao banco de produção via MCP para ler o conteúdo exato das migrations.
A criação dos arquivos sem o SQL real seria drift reverso — proibido pelas regras do CLAUDE.md.

**O que o Joaquim precisa fazer:**
1. Confirmar as 3 versions ao vivo: `SELECT version, name, array_length(statements, 1) AS n_statements FROM supabase_migrations.schema_migrations WHERE version > (SELECT max(version) - 100000 FROM supabase_migrations.schema_migrations) ORDER BY version DESC LIMIT 20;` e comparar com `ls supabase/migrations/*.sql | sort`
2. Autorizar uma sessão de agente a criar os 3 arquivos a partir do ledger (leitura MCP produção + PR)

---

## 5. GF-013: issue #2016 — types-sync parada desde 29/10

**Issue:** [#2016](https://github.com/adm01-debug/Zapp_Web_V2/issues/2016)  
**Workflow:** `types-sync.yml`

**O que é:** O workflow de sincronização de types.ts (`types-sync.yml`) parou de criar PRs
nos últimos dias. A issue #2016 documenta a falha.

**Possíveis causas:**
- PR anterior de types-sync ainda aberta (o workflow evita abrir duplicata)
- Erro transitório no step de comparação de types
- `types.ts` já está sincronizado e não há mudança para PR

**O que o Joaquim precisa fazer:**
1. Verificar se há PR aberta de `types-sync` na lista de PRs abertas
2. Se houver: aguardar o CI passar e o auto-merge atuar, ou fechar a PR e re-disparar o workflow
3. Se não houver: disparar `workflow_dispatch` do `types-sync.yml` **na branch `main`**
4. Política E51: se a issue #2016 tiver > 20 comentários de bot, fechar com comentário-resumo e abrir nova

---

## 6. GF-017 a GF-031: PRs com conflitos — análise e resolução pendente

**Por que não foi corrigido:** PRs com ancestral muito divergente da `main` exigem:
1. Identificar qual subconjunto de mudanças ainda não está em `main`
2. Criar branch limpa a partir de `main` com apenas esse conteúdo
3. Nova PR → CI → merge

Esse trabalho requer leitura detalhada do diff de cada PR e não foi coberto por esta sessão.

**Lista de PRs a avaliar:**

| Task | PR | Título resumido | Conflitos |
|---|---|---|---|
| GF-017 | [#2036](https://github.com/adm01-debug/Zapp_Web_V2/pull/2036) | (verificar ao vivo) | 2 |
| GF-018 | [#2125](https://github.com/adm01-debug/Zapp_Web_V2/pull/2125) | (verificar ao vivo) | 2 |
| GF-019 | [#2142](https://github.com/adm01-debug/Zapp_Web_V2/pull/2142) | (verificar ao vivo) | 1 |
| GF-020 | [#2143](https://github.com/adm01-debug/Zapp_Web_V2/pull/2143) | (verificar ao vivo) | 2 |
| GF-021 | [#2197](https://github.com/adm01-debug/Zapp_Web_V2/pull/2197) | (verificar ao vivo) | 2 |
| GF-022 | [#2246](https://github.com/adm01-debug/Zapp_Web_V2/pull/2246) | duplicata fila-merge — FECHADA | fechado |
| GF-023 | [#2261](https://github.com/adm01-debug/Zapp_Web_V2/pull/2261) | duplicata fila-merge — FECHADA | fechado |
| GF-024 | [#2104](https://github.com/adm01-debug/Zapp_Web_V2/pull/2104) | (verificar ao vivo) | 5 |
| GF-025 | [#2110](https://github.com/adm01-debug/Zapp_Web_V2/pull/2110) | (verificar ao vivo) | 21 |
| GF-026 | [#2144](https://github.com/adm01-debug/Zapp_Web_V2/pull/2144) | (verificar ao vivo) | 6 |
| GF-027 | [#2145](https://github.com/adm01-debug/Zapp_Web_V2/pull/2145) | (verificar ao vivo) | 4 |
| GF-028 | [#2195](https://github.com/adm01-debug/Zapp_Web_V2/pull/2195) | (verificar ao vivo) | 14 |
| GF-029 | branch `claude/fix-auto-update-pr-branch-261023-1950` | sem PR aberta (+75, 3 conflitos) | 3 |
| GF-030 | branch `claude/fix-e2e-logado-ga09-261017-1410` | sem PR aberta (+5) | — |
| GF-031 | branch `claude/fix-types-sync-ga20-ga21-261017-0015` | sem PR aberta (+63, 2 conflitos) | 2 |

**O que o Joaquim pode fazer:**
1. Para cada PR ainda aberta: verificar se o conteúdo ainda é relevante (pode já estar em `main`)
2. Se relevante e conflito pequeno (1-2 arquivos): resolver conflito e re-rodar CI
3. Se conflito grande (>6 arquivos) ou conteúdo coberto: fechar como obsoleta

---

## 7. GF-033 a GF-056: branches `adm01-debug-patch-*` — decisão do Joaquim

**O que são:** Branches criadas manualmente pelo Joaquim (prefixo `adm01-debug-patch-`)
sem PR aberta. Cada uma tem commits à frente de `main`. Sem análise do conteúdo,
não é possível determinar se estão obsoletas ou representam trabalho em andamento.

**Regra de segurança:** NUNCA apagar branch criada pelo Joaquim sem confirmação explícita.

**Lista completa:**

| Task | Branch | Commits à frente | Status |
|---|---|---|---|
| GF-033 | `adm01-debug-patch-1-2` | +43 | sem PR |
| GF-034 | `adm01-debug-patch-1-3` | +47 | sem PR |
| GF-035 | `adm01-debug-patch-1-4` | +55 | sem PR |
| GF-036 | `adm01-debug-patch-1-5` | +57 | sem PR |
| GF-037 | `adm01-debug-patch-1-6` | +55 | sem PR |
| GF-038 | `adm01-debug-patch-1-7` | +55 | sem PR |
| GF-039 | `adm01-debug-patch-1-8` | +43 | sem PR |
| GF-040 | `adm01-debug-patch-1` | +39 | sem PR |
| GF-041 | `adm01-debug-patch-2-10` | +30 | sem PR |
| GF-042 | `adm01-debug-patch-2-11` | +40 | sem PR |
| GF-043 | `adm01-debug-patch-2-12` | +29 | sem PR |
| GF-044 | `adm01-debug-patch-2-1` | +28 | sem PR |
| GF-045 | `adm01-debug-patch-2-2` | +66 | sem PR |
| GF-046 | `adm01-debug-patch-2-3` | +31 | sem PR |
| GF-047 | `adm01-debug-patch-2-4` | +36 | sem PR |
| GF-048 | `adm01-debug-patch-2-5` | +98 | sem PR |
| GF-049 | `adm01-debug-patch-2-6` | +18 | sem PR |
| GF-050 | `adm01-debug-patch-2-7` | +33 | sem PR |
| GF-051 | `adm01-debug-patch-2-8` | +70 | sem PR |
| GF-052 | `adm01-debug-patch-2-9` | +34 | sem PR |
| GF-053 | `adm01-debug-patch-2` | +42 | sem PR |
| GF-054 | `adm01-debug-patch-3-2` | +93 | sem PR |
| GF-055 | `adm01-debug-patch-3` | +32 | sem PR |
| GF-056 | `adm01-debug-patch-4` | +1 | sem PR |

**O que o Joaquim precisa fazer para cada branch:**
1. `git log main..adm01-debug-patch-X --oneline` para ver o que está na branch mas não em `main`
2. Se o conteúdo já está em `main` ou não é necessário: `git branch -d adm01-debug-patch-X` + deletar remota
3. Se o conteúdo é trabalho em andamento: abrir PR ou incorporar em outra branch ativa
4. As branches com mais commits (+93, +70, +66, +57...) provavelmente têm conteúdo significativo

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
