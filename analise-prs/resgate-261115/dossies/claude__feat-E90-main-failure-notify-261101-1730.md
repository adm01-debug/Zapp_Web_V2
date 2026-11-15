# Dossiê — claude__feat-E90-main-failure-notify-261101-1730 (PR #2499)

**Ref:** `origin/claude/feat-E90-main-failure-notify-261101-1730` · tip `0265d2c2d` · merge-base `1252bb5a4` · 14 commits (2026-11-01)
**PR #2499** `feat(ci): notificação WhatsApp em falha crítica na main (E90)` — CLOSED 2026-11-01, motivo (comentário de fechamento): congelamento de features #2545; "branch preservada — reabrir quando destravar fluxo crítico". Triagem 2804: OBSOLETA (não confirmada aqui para todos os arquivos).

## Propósito
1. Novo workflow `.github/workflows/main-failure-notify.yml`: em `workflow_run` com `conclusion=failure` na main (E2E logado, DB Live Guard, Deploy Edge Functions, types-sync) envia WhatsApp via Evolution GO `/send/text` (host **hardcoded** `evolution-go-rxj2.srv1481814.hstgr.cloud`, secrets de Actions `EVOLUTION_INSTANCE_TOKEN` + `JOAQUIM_WHATSAPP_NUMBER`), dedupe de 1h via `listWorkflowRuns` do próprio workflow.
2. Dedup de 1h nos comentários da issue `[falha-main]` em `notifica-falha-main.yml` (suprime comentário se a issue foi `updated_at` há < 1h).
3. Atualização de inventário 17→18 (CLAUDE.md, PLANO, docs/ci/README.md, teste baseline).

## Arquivo × achado × evidência

| Arquivo | Status | Achado | Evidência |
|---|---|---|---|
| `.github/workflows/main-failure-notify.yml` | NEW, ausente na main | **NÃO está na main** em nenhuma forma (`git ls-tree origin/main .github/workflows/` = 21 arquivos, sem ele; `git log -S'main-failure-notify' origin/main` e `-S'JOAQUIM_WHATSAPP_NUMBER'` = vazio; `git grep -i 'send/text\|hstgr.cloud' origin/main -- .github/ scripts/ci/` = vazio). **Contradiz regra vigente**: `AGENTS.md:76-77` "`EVOLUTION_*` só nas edges" e "hostname/URL: `EVOLUTION_API_URL` nas edges"; `docs/agentes/evolution-go.md:8,12` (URL só via secret das edges; `EVOLUTION_INSTANCE_TOKEN` "secrets nas Edge Functions"). O workflow exige o token em secret do GitHub Actions e grava o hostname da VPS em YAML num repo público. | DECISAO_DONO · valor médio |
| `.github/workflows/notifica-falha-main.yml` | BOTH_CHANGED, patch aplica limpo | Dedup **ausente** na main: `origin/main:.github/workflows/notifica-falha-main.yml:62-63` segue `if (existente) { await github.rest.issues.createComment(` sem checagem de tempo; `git log -S'DEDUP_HORAS' origin/main` = vazio. Qodo apontou (PR #2499, low): usar `updated_at` da issue suprime alerta real se alguém comentou/editou a issue na última hora. | PERDIDA · valor médio |
| `CLAUDE.md` | CONFLICT | OBSOLETA: `origin/main:CLAUDE.md` virou só `@AGENTS.md` (commit `effd6b0bb` 2026-11-07 "instruções enxutas para agentes"); a linha de inventário não existe mais. Inventário vive em `docs/agentes/github-ci.md:75` com **21**. | OBSOLETA · nenhum |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | CONFLICT | OBSOLETA: main já diz `**21** arquivos YAML` medido em 2026-11-14 (`:78`). | OBSOLETA · nenhum |
| `docs/ci/README.md` | CONFLICT | Contagem OBSOLETA (`:7` = `**21 workflows.**`). A linha/seção `main-failure-notify` é gerada do bloco `# docs:` do YAML (`render-workflow-docs.mjs --check`) — só volta se o workflow entrar. | OBSOLETA (contagem) / depende do item 1 |
| `scripts/ci/ci-docs-baseline.unit.mjs` | CONFLICT | OBSOLETA: main já espera 21 (`:298,:300,:305,:340`). | OBSOLETA · nenhum |

## Veredito: **DECISAO_DONO** (confiança alta) · `apagar_branch_seguro = false`

- A funcionalidade central (aviso WhatsApp de falha na main) não existe na main e ainda faz sentido (há `notifica-falha-main.yml` que só abre issue). Porém **contradiz** `AGENTS.md:76-77` (`EVOLUTION_*` só nas edges) e expõe o hostname da Evolution GO em YAML público. Se o dono quiser o aviso por WhatsApp, o caminho conforme a regra é: Actions chama uma Edge Function (ex.: nova `notify-ci-failure` com `verify_jwt` + segredo próprio) que usa `EVOLUTION_API_URL`/`EVOLUTION_INSTANCE_TOKEN` já existentes nas edges — não copiar o token para o GitHub.
- O dedup da issue é lacuna pequena e recuperável sem decisão do dono (ver abaixo), mas com a correção do Qodo (marcador próprio em vez de `updated_at`).
- Hunks de inventário 17→18: obsoletos (main = 21).

## Lacunas a recuperar

### 1. Dedup em `.github/workflows/notifica-falha-main.yml` (valor médio, ~8 linhas)
Inserir após `origin/main:...:43` (`const wf = ...`) e dentro do `if (existente) {` (`:62`):
```js
            const DEDUP_HORAS = 1;
...
            if (existente) {
              const atualizadoEm = new Date(existente.updated_at);
              const diff = Date.now() - atualizadoEm.getTime();
              if (diff < DEDUP_HORAS * 60 * 60 * 1000) {
                core.info(`Dedup: issue #${existente.number} atualizada ha ${Math.round(diff / 60000)} min — comentario suprimido`);
                return;
              }
              await github.rest.issues.createComment({
```
Recomendação ao portar: em vez de `existente.updated_at`, listar comentários da issue e usar o `created_at` do último comentário do bot (`github-actions[bot]`) — evita suprimir alerta real quando humano comenta (finding Qodo da PR #2499).

### 2. Workflow WhatsApp `main-failure-notify.yml` (DECISAO_DONO)
Hunk completo em `git show origin/claude/feat-E90-main-failure-notify-261101-1730:.github/workflows/main-failure-notify.yml` (125 linhas). Pontos reutilizáveis: gatilho `workflow_run` + `if: conclusion == 'failure'`, texto da mensagem (workflow, sha7, horário `America/Sao_Paulo`, link dos logs), validação de corpo 2xx (`data.error`, `data.status==='error'`, msgId em `key.id | id | Info.ID`). **Não portar como está**: host hardcoded e `EVOLUTION_INSTANCE_TOKEN` em secret do Actions violam `AGENTS.md:76-77`. Precisa `# zizmor: ignore[dangerous-triggers]` na linha do `workflow_run` (`docs/agentes/github-ci.md`) e bloco `# docs:` para o README gerado.

### 3. Inventário (CLAUDE.md, PLANO, README, teste) — nada a recuperar; main já em 21.

## Verificação adversarial

**Parecer: CONCORDO com DECISAO_DONO · `apagar_branch_seguro = false`** (tentei refutar; não achei refutação).

Reconferido item por item na `origin/main` atual:

| Alegação da triagem | Resultado da reconferência |
|---|---|
| Workflow WhatsApp ausente na main | **Confirmado.** `git ls-tree --name-only origin/main .github/workflows/` = 21 arquivos, nenhum `main-failure-notify.yml`. `git log -S'main-failure-notify' --oneline origin/main` e `-S'JOAQUIM_WHATSAPP_NUMBER'` = vazio (nunca entrou, logo não foi removido de propósito). Nenhum arquivo da main cita `send/text`+`hstgr.cloud` em `.github/` ou `scripts/ci/` — só docs e edges da Evolution. |
| Contradiz regra vigente (`EVOLUTION_*` só nas edges) | **Confirmado e é real, não formal.** `origin/main:AGENTS.md:76-77` ("hostname/URL: `EVOLUTION_API_URL` nas edges … `EVOLUTION_*` só nas edges") e `origin/main:docs/agentes/evolution-go.md:12` ("`EVOLUTION_INSTANCE_TOKEN` (endpoints por instância `/send/*`) — secrets nas Edge Functions, nunca no front"). A branch quebra as duas: `main-failure-notify.yml:49` (`secrets.EVOLUTION_INSTANCE_TOKEN` em secret do Actions) e `:97` (`https://evolution-go-rxj2.srv1481814.hstgr.cloud/send/text` em YAML de repo **público**). |
| Dedup ausente na main | **Confirmado.** `origin/main:.github/workflows/notifica-falha-main.yml:62-68` = `if (existente) { await github.rest.issues.createComment({…})` sem checagem de tempo; `git log -S'DEDUP_HORAS' --oneline origin/main` = vazio. Diff aplica limpo (2 hunks, 8 linhas). |
| Inventário 17→18 obsoleto | **Confirmado (main = 21).** `docs/ci/README.md:7` = `**21 workflows.**`; `PLANO…:78` = `**21** arquivos YAML` (medido 2026-11-14); `scripts/ci/ci-docs-baseline.unit.mjs:296,298,300,305,337,340` = 21; `docs/agentes/github-ci.md:75` = **21**; `origin/main:CLAUDE.md` = só `@AGENTS.md`. Nada a portar. |
| Diff tem só esses 6 arquivos | **Confirmado.** `git diff --stat 1252bb5a4 origin/claude/feat-E90…` = 6 arquivos, 150+/9-; 14 commits, nenhum arquivo extra (src/edge/migration = 0). |

**Por que DECISAO_DONO se sustenta (não rebaixo para PERDIDA_*):** não é "só um workflow". Para existir, a branch precisa de dois secrets que **só o dono pode fornecer** — o número de WhatsApp dele (`JOAQUIM_WHATSAPP_NUMBER`) e a cópia do `EVOLUTION_INSTANCE_TOKEN` para o Actions — e `AGENTS.md:72` fecha a porta: "Destrutivo, **segredos** e rotação: só com o dono". Agravante verificado: `docs/agentes/github-ci.md:69-70` registra que `secret_scanning_non_provider_patterns` está **desligado** (exige plano pago) neste repo público — token da Evolution vazado em YAML/secret aqui não dispara alerta nenhum.

**A necessidade segue viva (reforça não apagar):** `origin/main:docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md:866-868` — **E90 ainda é checkbox aberto** `- [ ]`. Detalhe que a triagem não registrou: o plano prescreve o canal **via N8N** (`webhook workflow_run → Evolution GO PRINCIPAL → número do Joaquim`), não `Actions → Evolution` direto. Ou seja, o dono tem **três** caminhos, não dois: (a) descartar; (b) Edge Function chamada pelo Actions (sugestão da triagem); (c) N8N como o plano original manda — (b) e (c) respeitam `EVOLUTION_*` só nas edges/fora do Actions.

**Lacunas adicionais encontradas (não mudam o veredito):**
1. Sobreposição de gatilho ignorada pela triagem: `origin/main:.github/workflows/notifica-falha-main.yml:11-22` já escuta `workflow_run` dos **mesmos** 4 workflows (e mais 4) com `if conclusion == 'failure'` (`:35`). O aviso de WhatsApp cabe como **step extra nesse workflow**, sem criar um 22º arquivo — evita o custo de bump de inventário em 4 lugares.
2. Se mesmo assim entrar como arquivo novo, a contagem 21→22 precisa subir também em `docs/agentes/github-ci.md:75` (lista nominal inclusa) — a triagem citou `render-workflow-docs.mjs` e `ci-docs-baseline.unit.mjs`, mas não esse arquivo, que é checado por `violacoesContagemClaude(…, 21)` em `ci-docs-baseline.unit.mjs:305`.
3. O `main-failure-notify.yml:19` da branch não tem `# zizmor: ignore[dangerous-triggers]` no `workflow_run` (a main tem, `notifica-falha-main.yml:11`) — já citado no dossiê, confirmado no código.
