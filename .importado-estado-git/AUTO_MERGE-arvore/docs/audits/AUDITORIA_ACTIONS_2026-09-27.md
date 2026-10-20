# Auditoria de GitHub Actions — 2026-09-27

Sessão: https://claude.ai/code/session_01Po8soxLqw97GpqoqnwiwsH

Plano completo: `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-09-27.md`

---

## Ações executadas nesta sessão

### Limpeza imediata

- **Webhook 671865950 excluído** (`gh-push-graph-sync`, n8n). Todas as 5 últimas entregas
  retornavam 404 — endpoint morto. Sem impacto operacional (o webhook não servia a nada).

- **46 caches CodeQL overlay deletados** (~10 GB). O job `analyze-actions` do `codeql.yml`
  gerava um cache único por run (chave contém `{run_id}`), acumulando ~231 MB por execução.
  Com >46 runs/dia em `main`, o limite de 10 GB do repositório foi atingido em <3 h, ativando
  a política de evicção do GitHub. Caches deletados via prefixo
  `codeql-overlay-base-database-1-6144223ab8882e93-javascript-2.27.1-`.
  **Causa raiz**: estratégia de cache-key do `codeql.yml` — ver F-09 no plano.

- **Run zombie 36337021716 cancelado** (`Deploy Edge Functions`, `status: waiting` desde
  17:27Z). Disparado pelo merge do PR #999 (remove etiquetas system). O job estava pausado
  no environment `producao-edge-functions` aguardando aprovação, que nunca viria sem aviso
  explícito.

### Correções de código (3 PRs)

| PR | Branch | Achado | Descrição |
|---|---|---|---|
| [#1059](https://github.com/adm01-debug/Zapp_Web_V2/pull/1059) | `claude/fix-types-sync-pipefail-270927-2025` | F-01 | `set -o pipefail` nos Gates 1 e 2 do `types-sync.yml` — sem ele, `tee` mascarava falhas do `node` e os gates eram no-ops |
| [#1060](https://github.com/adm01-debug/Zapp_Web_V2/pull/1060) | `claude/fix-deploy-functions-pipefail-270927-2025` | F-02 | `set -o pipefail` no step Deploy do `deploy-functions.yml` — falha do CLI Supabase só aparecia ~12 min depois |
| [#1061](https://github.com/adm01-debug/Zapp_Web_V2/pull/1061) | `claude/fix-db-live-guard-dedupe-270927-2025` | F-03 | Remoção da exceção `migrationsFalhou` do dedupe do `db-live-guard.yml` — gerou 21 comentários duplicados na issue #1013 em 3 h |

### Documento de plano

- [PR #1058](https://github.com/adm01-debug/Zapp_Web_V2/pull/1058) — plano de 100 etapas com
  42 achados (F-01 a F-42), classificados por severidade P0/P1/P2/P3.

---

## Itens pendentes que exigem decisão do Joaquim

### 🔒 E01 — Run zombie deploy-functions
Já cancelado nesta sessão (run 36337021716). O deploy do PR #999 (remove etiquetas) **nunca
entrou em produção**. Se precisar deployar: disparar `deploy-functions.yml` novamente via
`workflow_dispatch` e aprovar no environment `producao-edge-functions`.

### 🔒 E05 — Docker Hub rate limit
`types-sync` e `db-live-guard` rodam `postgres:17-alpine` sem autenticação. Com >46 pushes/dia
em `main`, a cota anônima do Docker Hub é atingida. Criar segredos:
- `DOCKERHUB_USER` = seu usuário Docker Hub
- `DOCKERHUB_TOKEN` = access token (read-only é suficiente)

Sem isso, qualquer run que precise do Postgres falha em `docker pull`.

### 🔒 E07 — `SUPABASE_SERVICE_ROLE_KEY` a nível de repositório
O secret `SUPABASE_SERVICE_ROLE_KEY` está configurado a nível de **repositório público** (qualquer
workflow pode lê-lo). Deve migrar para o environment `producao-ddl` para restringir o acesso.
Enquanto estiver aqui, qualquer PR aprovado por ci.yml pode ser vetorizado para vazar a chave.

Ação recomendada:
1. Criar o secret no environment `producao-ddl` com o mesmo valor
2. Deletar o secret a nível de repositório
3. Ajustar os workflows que o consomem para referenciar o environment

### 🔒 E02 — Conflito entre PRs #1045 × #1052
Dois PRs criaram migrations com versions `20260926560000` e `20260926570000` com conteúdos
divergentes. Não é possível mergear ambos sem decidir a ordem e reconciliar o conteúdo.

---

## Causa raiz documentada: acúmulo de caches CodeQL (F-09)

O `codeql.yml` tem dois jobs: `analyze` (javascript-typescript) e `analyze-actions` (actions).
O job `analyze` usa `init` da action `github/codeql-action`, que por padrão cria um cache de
"overlay" com chave `codeql-overlay-base-database-1-{matrix-hash}-{language}-{codeql-version}-{sha}-{run_id}-1`.

O `{run_id}` na chave garante que **cada run cria um novo cache, nunca reutilizando**. Com
`main` recebendo ~1 push a cada 4-5 min no dia 27/09, isso gera 46+ caches em 3 h.

**Fix sugerido (F-09, P1):** configurar `max-codeql-ram` / cache retention no `codeql.yml`
ou limitar o número de runs do CodeQL na `main` para não disparar em todo push — por exemplo,
rodar apenas em schedule (já tem às 09:30) e em PRs, não em push direto.

---

## Estado dos required checks após esta sessão

Os 6 required checks continuam os mesmos; `strict=false` ao vivo (ver correção de 27/09
no CLAUDE.md). As 3 correções desta sessão (#1059-#1061) não afetam os required checks.

---

*Gerado em 2026-09-27. Sessão Claude Code.*
