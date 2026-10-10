# E95 — perímetro do GitHub: baseline criado, guard consertado, tabela pendente de aprovação

**Data:** 03/10/2026 · **Etapa:** E95 (Fase 7, `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, G-37)
**Status: PARCIAL** — dois dos três entregáveis saíram; a tabela no `CLAUDE.md` depende de aprovação do dono.

## O que a etapa pedia

Seção nova no `CLAUDE.md` ("Perímetro do GitHub — estado canônico") com uma tabela de branch protection,
environments, secrets por escopo, apps e `allowed_actions`, **e a regra** de que toda mudança nesses
campos atualiza a tabela **e** o `github-settings-baseline.json` (E13) no mesmo PR. Verificação:
`settings-guard` verde contra a tabela.

## O que saiu

### 1. O `github-settings-baseline.json` da E13 não existia — agora existe

A etapa manda atualizar esse arquivo "no mesmo PR", mas ele **nunca foi criado**: a E13 entregou só o
script, que comparava contra valores fixos no código. Criei `scripts/ci/github-settings-baseline.json`
com o **estado medido da API em 03/10/2026** — branch protection (6 checks, `strict`, `enforce_admins`),
merge settings, actions (`allowed_actions=selected`, `sha_pinning_required=true`), os 7 environments e a
lista da E94. A partir de agora existe contra o quê comparar.

### 2. O `settings-guard` estava quebrado desde a criação

Achado da medição, e o mais grave desta etapa:

| Medição | Resultado |
|---|---|
| Runs do `settings-guard.yml` | **6** |
| Falhas | **6 (100%)** — desde a criação |
| Erro | `403 Resource not accessible by integration` em `GET /branches/main/protection` |

O `GITHUB_TOKEN` de workflow **não tem o escopo `administration`**, que essa API exige. O guard morria
no **primeiro GET** — antes de comparar qualquer coisa — e, como o `throw` abortava o fluxo, **também
não abria a issue** que deveria abrir. Ou seja: um guard que rodava 4× por dia, falhava sempre, e não
avisava ninguém. **Nunca protegeu nada.**

**Consertado** (o que dava para consertar sem PAT): o guard agora distingue **regressão** de **ponto
cego**. 403/404 em um campo vira **"NÃO VERIFICÁVEL"** com o motivo, e **abre a issue de qualquer
forma** — "não consegui olhar" é exatamente o que precisa de gente. Também passou a conferir merge
settings, `actions/permissions` e environments contra o baseline.

**O que continua pendente:** ler a branch protection exige `administration: read`, que **só um PAT ou
App dedicado** fornece. Sem isso, os campos de branch protection permanecem marcados como
**intenção declarada, não cobertura medida**. Decisão registrada ao dono (`20261003-110826-2ff5`).

### 3. A tabela no `CLAUDE.md` — bloqueada por aprovação

O `CLAUDE.md` é arquivo de instrução de agente: a escrita exige aprovação explícita do dono, e o prompt
expirou sem resposta. **Não insisti** e não tentei por outro caminho. O texto está pronto abaixo.

## Estado medido (03/10/2026, direto da API)

| Campo | Estado | Verificado por |
|---|---|---|
| Branch protection — checks obrigatórios | **6**: 🔍 Lint & TypeCheck · 🧪 Unit Tests · 🏗️ Build · 🔒 Security Audit · Contrato DB offline · 🎭 E2E Tests (Playwright) | `settings-guard` ⚠ |
| Branch protection — `strict` | **esperado `true`** (E15(b), reativada em 01/10; opção (a) revogada em 02/10) — **hoje está `false`** ⚠ | `settings-guard` ⚠ |
| Branch protection — `enforce_admins` | `true` | `settings-guard` ⚠ |
| Branch protection — review obrigatório | nenhum | — |
| Merge (E93) | `allow_squash_merge=true` · `allow_merge_commit=false` · `allow_rebase_merge=false` · `allow_auto_merge=true` · `delete_branch_on_merge=true` | `settings-guard` |
| Squash | `squash_merge_commit_message=PR_BODY` · `squash_merge_commit_title=PR_TITLE` | `settings-guard` |
| Environments | **7**: `copilot` · `db-ledger-evidence` · `legacy-import-destrutivo` · `Preview` · `producao-ddl` · `producao-edge-functions` · `Production` (E94 apaga 3) | `settings-guard` |
| Secrets (escopos) | **repo** + `producao-ddl` · `producao-edge-functions` · `legacy-import-destrutivo` · `db-ledger-evidence` | `check-pr-workflow-secrets` |
| Actions — `allowed_actions` | `selected` | `settings-guard` |
| Actions — `sha_pinning_required` | `true` | `check-workflow-pins` |
| GitHub Apps | **não auditado** — o token não lista instalações (E89 decide) | — |

> ⚠ **Achado colateral da medição:** `strict` está **`false`**, mas a E15 decidiu `true` e a opção
> `false` foi **revogada em 02/10**. Como o guard estava morto, a regressão passou **em silêncio** por
> dias. É o exemplo exato do custo de um guard que falha sem avisar. **Não corrigi** (mudar branch
> protection não é desta etapa) — está na decisão enviada ao dono.

## Verificação

| Verificação | Resultado |
|---|---|
| `node --test scripts/ci/github-settings-guard.unit.mjs` | **5 passed, 0 failed** |
| Mutação (403 fatal de volta, ponto cego sem issue, `semQuebra` removido, strict não-restaurável) | **4 de 4 detectadas** |
| `lint-ratchet` / `typecheck-ratchet` | 587/587 e 0/0 — **novas=0** |
| `actionlint`, `check-test-inventory` | OK |
| `settings-guard` verde contra a tabela | **não cumprido** — exige PAT (ver acima) |

O teste antigo **foi reescrito**: ele reimplementava a lógica no próprio arquivo e por isso ficava verde
enquanto o guard falhava em produção. Agora ele **executa o guard de verdade** (child process, `fetch`
stubbed) em 4 cenários, e o invariante de log injection (jssecurity:S5145) foi preservado.

## Pendências para o dono

1. **Aprovar a seção** "4. Perímetro do GitHub — estado canônico" no `CLAUDE.md` (texto pronto no PR).
2. **Decidir sobre o PAT/App** com `administration: read` para o `settings-guard` — sem isso, branch
   protection segue sem cobertura automática.
3. **Confirmar o `strict`**: hoje `false`, a política vigente (E15) diz `true`.
4. **E94** (apagar `copilot`, `Preview`, `Production`) segue pendente e mexe em settings.
