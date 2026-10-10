# E98 — contratos de workflow: os invariantes do plano agora têm teste

**Data:** 03/10/2026 · **Etapa:** E98 (Fase 7, `PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md`, G-40)
**Status:** ✅ concluída · **Arquivo novo:** `scripts/ci/workflow-contracts.unit.mjs` (8 casos)

## O que a etapa pedia

> `scripts/ci/workflow-contracts.unit.mjs`: um teste por invariante deste plano que pode regredir
> em YAML (sem `pull_request` com secret; `persist-credentials: false`; `cancel-in-progress` só em PR;
> `--ignore-scripts`; pgbouncer sem `continue-on-error`; `paths` do guarda vivo sem `functions/**`;
> TLS em todo workflow com `DESTINO_URL*`). **Verificação: desfazer qualquer etapa → teste ❌.**

## O que foi entregue

`scripts/ci/workflow-contracts.unit.mjs` — 8 casos, leem os YAML reais de `.github/workflows/` e não
dependem de parser (texto + regex ancorado). Um caso por invariante, mais dois de reforço:

| # | Invariante | Por que existe |
|---|---|---|
| 1 | Nenhum checkout sem `persist-credentials: false` | Token do runner fica no `.git/config` e vaza para passos seguintes |
| 2 | `cancel-in-progress: true` nunca com gatilho `push` | Cancela deploy/guarda vivo no meio da execução |
| 3 | `bun install`/`npm ci` sempre com `--ignore-scripts` | Bloqueia postinstall de pacote comprometido |
| 4 | Passo do pgbouncer sem `continue-on-error` | Proxy falha e os dependentes rodam **sobre o banco real** — falso verde |
| 5 | `paths` do `db-live-guard` sem `supabase/functions/**` | PR de Edge Function passaria a conectar no banco de produção |
| 6 | Quem recebe `DESTINO_URL` chama `endurecerDestinoTls(` | Segredo do banco canônico sem endurecimento de TLS |
| 7 | Lista de exceções de TLS não cresce em silêncio | Guarda contra a exceção virar esconderijo |
| 8 | Workflow com `pull_request` não recebe `DESTINO_URL` | Reforço independente do `check-pr-workflow-secrets` |

**Verificação da etapa cumprida:** desfazer cada invariante no YAML real → o teste cai. **7/7 mutações
detectadas**, com os workflows restaurados e conferidos por `git status` (árvore limpa).

## Prova por mutação — e as 3 falhas que ela encontrou no MEU teste

A primeira rodada detectou **4 de 7**. As três que escaparam eram defeito do teste, não do YAML:

1. **`cancel-in-progress`** — a condição era `push:` **e** `!branches:`, ou seja, **excluía exatamente
   `push: branches: [main]`**, o pior caso. Corrigido: qualquer gatilho `push` já é infração.
2. **`--ignore-scripts`** — meu extrator só varria blocos `run: |`; a linha
   `run: bun install --frozen-lockfile --ignore-scripts` era `run:` de uma só linha e passava batido.
   Corrigido com `linhasExecutaveis()`, que cobre os dois formatos.
3. **`endurecerDestinoTls`** — o padrão `/endurecerDestinoTls/` casava com o próprio texto da mutação
   (`endurecerDestinoTlsRemovido`). Além disso, o mutador usava `replace(..., 1)` e trocava só o
   **import**, deixando a **chamada real** (linha 122) intacta — dois defeitos que se encobriam.
   Corrigidos ambos (`\bendurecerDestinoTls\s*\(` e `replace` sem limite).

Sem a mutação, este arquivo teria entrado no repo **parecendo** cobrir 7 invariantes e cobrindo 4.

## Achados fora do escopo (NÃO corrigidos)

- **`supabase-sync.yml` usa `DESTINO_URL` sem `endurecerDestinoTls`.** Ele importa `validarDestino`
  (comprova a identidade do banco) mas não endurece o TLS. O caso 6 tem uma **exceção explícita e
  nomeada** para ele, e o caso 7 trava a lista em 1 item. Motivo de não corrigir agora: é import
  **manual** de snapshot **legado**, desarmado desde 28/08, e mexer no fluxo de conexão dele é risco
  maior que o ganho — fora do escopo da E98, que é escrever o teste.
- **`db-live-guard.yml` e `types-sync.yml` têm 15 e 5 `continue-on-error`** cada. O caso 4 cobre só a
  vizinhança imediata do pgbouncer; uma varredura do resto é etapa própria.

## Arquivos

- `scripts/ci/workflow-contracts.unit.mjs` (novo, 8 casos)
- `docs/audits/e98-workflow-contracts-2026-10-03.md` (este relatório)
- `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` (checkbox E98)

## Verificação

| Gate | Resultado |
|---|---|
| `node --test scripts/ci/workflow-contracts.unit.mjs` | **8 pass, 0 fail** |
| Mutação (7 invariantes desfeitos no YAML real) | **7/7 detectadas**, workflows restaurados |
| `actionlint .github/workflows/*.yml` | limpo |
| `node scripts/ci/lint-ratchet.mjs` | nenhuma dívida nova |
| `node scripts/ci/typecheck-ratchet.mjs` | nenhum erro novo |
