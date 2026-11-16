# Dossiê PR #2124

**Título:** fix(ci): Fase 0 do plano GA02-GA12
**Branch:** `claude/fix-ga-fase0-banco-e2e-261020-2200`
**Head SHA:** `e966771219ba418e3c97ca22b79407bfaa9fdd58`
**Base SHA:** `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (BEHIND main@c4c7139e)
**Criado em:** 2026-10-20
**Draft:** Não | **auto_merge:** não configurado

---

## Veredito

**MERGEAR_SE_CI_VERDE**

(Requer resolução do conflito — `mergeable_state: "dirty"` — via `update_pr_branch` antes do merge)

⚠️ **Atenção:** contém nova migration SECURITY DEFINER (`20261020120000_e2e_fixture_message_rpc.sql`). O apply em produção segue o fluxo normal — requer aprovação de Joaquim no environment `producao-ddl`. O merge do código é seguro; o apply DDL é controlado separadamente.

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 13 (CI workflows, scripts, fixtures E2E, 1 migration nova)

### Diff lido — trechos-chave

**`supabase/migrations/20261020120000_e2e_fixture_message_rpc.sql`** (NOVO — 63 linhas):
```sql
-- SECURITY DEFINER — bypassa trigger guard_message_provenance_fields
create or replace function public.e2e_fixture_message(p_op text default 'insert')
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $e2e_fixture_message$
declare
  v_contato constant uuid := '04dff4dc-c6b1-4283-ac22-bd8639804759'; -- fixture fixo
  v_usuario constant uuid := 'aaa9b766-3b72-403d-95ad-f9cd7301ebca'; -- usuario E2E CI
  v_conteudo constant text := '[E2E fixture setup]';
begin
  if auth.uid() is distinct from v_usuario then
    raise exception '42501'; -- escopo travado ao usuario de CI
  end if;
  -- insert ou cleanup, so nessas linhas
end;
revoke all on function public.e2e_fixture_message(text) from public;
grant execute on function public.e2e_fixture_message(text) to authenticated;
```
**Análise de segurança:** (1) UUID do chamador hardcoded = só o usuário de CI pode invocar; (2) UUID do contato hardcoded = só o contato de fixture; (3) conteúdo hardcoded = só `[E2E fixture setup]`; (4) grant only `authenticated`, revoke `public`. Padrão idêntico ao `e2e_cleanup_conversation_closures` já em produção. Risco: baixo.

**`e2e/fixtures/e2e-contact.ts`:**
```diff
-  // A policy INSERT de messages não tem WITH CHECK
-  const msgResponse = await page.request.post(`.../messages`, ...);
+  // GA11: vai pela RPC e2e_fixture_message (SECURITY DEFINER)
+  const fixtureRpcResponse = await page.request.post(`.../rpc/e2e_fixture_message`, {
+    data: { p_op: 'insert' },
+  });
+  if (!fixtureRpcResponse.ok()) {
+    // Fallback legado enquanto DDL nao e aplicada (GA07)
+    const msgResponse = await page.request.post(`.../messages`, ...);
```
Fallback correto: tenta RPC, cai no INSERT direto se a DDL ainda não foi aplicada.

**`ci.yml`:**
```diff
+  group: ci-${{ github.event_name == 'workflow_dispatch' && github.run_id || ... }}
+  # GA58: dispatch manual ganha grupo proprio em vez de disputar com push
+
+  - name: 🛡️ Trava anti-apagao do CLAUDE.md (GA02)
+    run: node scripts/ci/check-claude-md-integrity.mjs
+
-  run: bun vitest run --shard=${{ matrix.shard }}/3
+  run: timeout 11m bun vitest run --shard=${{ matrix.shard }}/3
+  # GA56: exit 124 antes do teto de 12min (evita cancelled silencioso)
```

**`e2e-logado.yml`:**
```diff
- push: branches: [main]
+ workflow_run:
+   workflows: [CI/CD Pipeline]
+   branches: [main]
+   types: [completed]
+# GA08: fecha fork com branch main (Scorecard #40)
+if: >
+  github.event_name == 'workflow_dispatch' ||
+  (github.event.workflow_run.conclusion == 'success' && ...)
+# GA09: grupo fixo (sem ref): nunca duas runs ao mesmo tempo
+  group: e2e-logado
+# GA12: budget por grupo + portao "nenhum teste sem rodar"
+  global_timeout_ms: 660000 / 600000 / 600000
```

**`scripts/ci/check-claude-md-integrity.mjs`** — refatora para exportar `avaliarClaudeMd` (testável).

**Novos testes:** `check-claude-md-integrity.unit.mjs` (4 testes GA02), `e2e-logado-workflow.unit.mjs` (3 testes GA08/09/12), `scripts/ci/fila-merge.unit.mjs` (AGORA_ISO para evitar clock-skew), `scripts/ci/confirm-hash.unit.mjs` (GA04), `scripts/ci/verify-ledger-statements.unit.mjs` (GA05).

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **SIM** — resolve E2E quebrado desde 06/10 (trigger `guard_message_provenance_fields` recusava o INSERT direto; 0 sucessos em 7 dias) |
| 2 | Traz regressão? | **NÃO** — E2E usa fallback legado enquanto DDL não é aplicada; sem risco de quebrar produção; CI scripts não afetam comportamento do app |
| 3 | Já está em main? | **NÃO** — `e2e_fixture_message_rpc.sql` é adição nova; anti-wipe do CLAUDE.md não existe em main |
| 4 | Regra de negócio correta? | **SIM** — SECURITY DEFINER com 3 camadas de confinamento (usuário, contato, conteúdo); padrão aprovado; revoke `public` correto |

## Bloqueio atual

`mergeable_state: "dirty"` — conflito com `main`. Sem auto_merge — requer merge manual após CI verde.

## Ação necessária

1. Atualizar branch contra `main` (`update_pr_branch`).
2. Aguardar os 6 checks obrigatórios ficarem verdes.
3. Fazer merge manual (squash).
4. **Após o merge:** o deploy automático entra em produção; a migration `20261020120000` aguarda `producao-ddl` (Joaquim) — até o apply, o fallback legado opera.
