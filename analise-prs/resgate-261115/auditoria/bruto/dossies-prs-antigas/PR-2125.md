# Dossiê PR #2125

**Título:** fix(ci): Fase 1 do plano GA18 GA19 + GA26 prepare
**Branch:** `claude/fix-ga-fase1-lote-banco-261020-2200`
**Head SHA:** `19c48a20cdbd6933cca7c8587d256e342a8217db`
**Base SHA:** `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (BEHIND main@c4c7139e)
**Criado em:** 2026-10-20
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

(Requer resolução do conflito — `mergeable_state: "dirty"` — via `update_pr_branch` antes do merge)

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 8 (scripts de auditoria/DB e workflows — nenhum código de app)

### Diff lido — trechos-chave

**GA19 — Semântica de exit codes em `check-migration-drift.mjs`:**
```diff
-  // exit 2 = so apply pendente
+  // GA19: exit 3 = EXCLUSIVO apply pendente
+  // exit 2 = erro de infra (conexao, autenticacao, ledger inacessivel)
+  // exit 1 = drift real
+
+  if (result.pendingOnly) {
+    console.error('\nAVISO: somente apply pendente (exit 3)');
+    return 3;
+  }
```
Antes, exit 2 era usado tanto para erro de infra quanto para "apply pendente". A separação usa exit 3 exclusivamente para "only pending apply" e libera exit 2 para erros reais.

**GA18 — Confinamento de path `-f` em `run-runtime-contract.mjs`:**
```diff
+  const RAIZ = dirname(dirname(AQUI));
+  const resolvido = resolve(RAIZ, invocacao.arquivo);
+  if (!resolvido.startsWith(RAIZ + sep) || !resolvido.endsWith('.sql')) {
+    console.error(`::error::contrato com -f fora do repo: ${invocacao.arquivo}`);
+    process.exit(2);
+  }
```
Um `-f ../evil.sql` escrito no contrato agora falha com exit 2 em vez de executar um arquivo fora do repo.

**GA26 (prepare) — Modo `--json` em `check-migration-drift.mjs`:**
```diff
+  if (process.argv.includes('--json')) console.log = console.error;
+  // ...
+  if (asJson) {
+    process.stdout.write(JSON.stringify({ ok: ..., linhas: [...] }) + '\n');
+  }
```
Emite tabela `{version, disco, ledger, classe}` no stdout para consumo por scripts; log humano vai para stderr.

**`lote-pendente.mjs` / `db-live-guard.yml` / `types-sync.yml`:** todos atualizados de `rc -eq 2` para `rc -eq 3`:
```diff
-  if [ "$rc" -eq 2 ] && [ "$GITHUB_EVENT_NAME" = "push" ]; then
+  if [ "$rc" -eq 3 ] && [ "$GITHUB_EVENT_NAME" = "push" ]; then
```
Mudança de interface atomicamente coordenada dentro do mesmo PR.

**Testes:**
- `check-migration-drift.test.mjs`: `'GA19: arquivo do repo sem versao no banco sai 3'` (antes era exit 1), `'GA19: falha de autenticacao no ledger sai 2, nunca 3'`, `'GA26: --json emite a tabela'`
- `lote-pendente.test.mjs`: `'GA19: exit 3 escreve summary "apply aguardado"'`, testes de integração real com psql fake
- `db-migrate-contratos.unit.mjs`: `'GA18: -f com traversal sai com 2 pelo executor'`

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — corrige falso-positivo real: falha de autenticação no ledger estava sendo tratada como "apply pendente verde" (exit 2); com exit 3 exclusivo, um psql falhando não vira "sem drift" |
| 2 | Traz regressão? | **NÃO** — mudança de exit code coordenada atomicamente: produtores (check-migration-drift) e consumidores (lote-pendente, db-live-guard, types-sync) atualizados no mesmo PR; testes verificam ambos os lados |
| 3 | Já está em main? | **NÃO** — `exit 3` e `pendingOnly` são adições novas; main usa exit 2 para ambos os casos |
| 4 | Regra de negócio correta? | **SIM** — separar "infra falhou" (exit 2) de "apply aguardado" (exit 3) é mais defensivo; garante que uma falha de psql nunca vira "verde" silencioso |

## Bloqueio atual

`mergeable_state: "dirty"` — conflito com `main`. Sem auto_merge — requer merge manual após CI verde.

## Ação necessária

1. Atualizar branch contra `main` (`update_pr_branch`).
2. Aguardar os 6 checks obrigatórios ficarem verdes.
3. Fazer merge manual (squash).
