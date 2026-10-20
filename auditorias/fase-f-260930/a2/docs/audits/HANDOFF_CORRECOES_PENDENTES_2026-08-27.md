# HANDOFF — ZAPP WEB V2: correcoes pos-auditoria (27/08/2026) — **CONCLUIDO**

> **Status:** TODAS as tarefas do handoff original foram executadas (por esta sessao
> e pela sessao paralela). O documento original (ordem de servico de 221 linhas,
> com protocolos e armadilhas) esta no historico git: commit `42c920b`.
> Este arquivo agora registra o ESTADO FINAL para futuras sessoes.

---

## Placar final: 15/15

| # | Item | Como foi resolvido | Onde |
|---|---|---|---|
| 1 | Guard `clear_login_attempts` | Guard interno via `auth.role()` + `auth.jwt()->>'email'`; authenticated so limpa o proprio email (front chama legitimamente em `src/lib/loginAttempts.ts:66`) | migration `20260827180000` |
| 2 | 108 indices FK (A-08) | fk_sem_indice = 0 | migration `20260827120000` |
| 3a | Drift gmail-oauth | `profile_id`→`user_id`, `scopes` removido, `onConflict: "email_address"`; zero `profile_id` nos 5 arquivos Gmail | commits da sessao paralela |
| 3b | RPCs `get_gmail_tokens`/`store_gmail_tokens` | Criados com contratos exatos dos call sites; `store` preserva refresh quando vem vazio; REVOKE PUBLIC/anon/authenticated | migration `20260827210100` |
| 3c | Chave de cripto | **VAULT** (decisao do Joaquim): secret `gmail_encryption_key` gerado in-db, nunca logado; encrypt/decrypt leem `vault.decrypted_secrets` (padrao sicoob); RAISE se ausente | migration `20260827210000` |
| 3d | Tabela `email_attachments` | Criada com UNIQUE(email_message_id) = onConflict do helper; RLS espelhando email_messages | migration `20260827210200` |
| 4 | Edges orfas | `evolution-health` + `analyze-external-db` removidas (0 invocacoes; `_shared/evolution-send.ts` preservado — 8 consumidores) | commit `22d289b` |
| 5 | Assertion ACL `mcp_exec` no CI | Step no job catalog-fresh falha se `authenticated=X` ou `anon=X` | commit `53186e0` |
| 6 | Reconciliacao migrations | 7 estrangeiras → `_foreign/`, 4 superadas → `_superseded/`, com READMEs | `supabase/migrations/_foreign\|_superseded/` |
| — | search_contacts (M-01/02/03) | COUNT(*) OVER() + NULLS LAST + predicado RLS replicado | migration `20260827160000` |
| — | Bridge sicoob | pg_net + URL correta + vault guard + trigger ANEXADO; chave `sicoob_service_role_key` presente no vault | migrations `130100`–`150000` |
| — | Reset custom morto | `validate_reset_token` dropado; chamada `store_reset_token` removida do edge | migration `20260827170000` |
| — | inbox.service morto | Deletado + barrel limpo | commit `7699e02` |
| — | CI DB Guard (3 jobs) | usage-guard offline / migration-drift / catalog-fresh semanal | `.github/workflows/db-guard.yml` |
| — | UNIQUE instance_id | `whatsapp_connections.instance_id` | migration `20260827201500` |

## Invariantes verificados (ultima medicao 27/08 ~20:40 UTC)

- **Paridade migrations:** 277 arquivos = 277 registros (hash conferido apos cada push)
- **Guard:** `known: []` — **acoplamento codigo↔banco 100% integro** (violacoes: 0)
- **Catalogo:** 124 tabelas / 7 views / 46 funcoes — identidade exata com o banco
- **ACLs criticas:** `mcp_exec`, `mcp_exec_many`, `encrypt/decrypt_gmail_token`, `get/store_gmail_tokens`, `get_channel_credentials` = `{postgres=X,service_role=X}`
- **RLS:** 123→124 tabelas, todas com RLS; views todas `security_invoker=true`
- **Testes comportamentais Gmail:** roundtrip vault PASS; store→get PASS; refresh preservado com `p_refresh_token=''` PASS; upsert attachment onConflict PASS; CASCADE PASS; residuo 0

## Aberto (nao bloqueante)

1. **Lote SECURITY DEFINER com `authenticated=X` sem guard interno:** `cleanup_expired_challenges`, `cleanup_link_preview_cache`, `reassign_absent_agents`, `reassign_overloaded_agents`, `skill_based_assign`. Na pratica so cron/service_role chamam. Antes de REVOKE, verificar call sites no front (mesma armadilha do clear_login_attempts — que ERA chamado pelo front).
2. **Blocos 3 (geo/IP) e 4 (lockout/MFA) da auditoria original:** NAO TOCAR sem decisao — caminho de auth; etapa 34 e ADR.
3. **Regenerar `types.ts`:** declaracoes fantasma inofensivas (`validate_reset_token`); regen total e mudanca grande, fazer junto com proxima feature que mexa em tipos.

## Protocolos que continuam valendo

- Escrita GitHub: **so `GITHUB - MCP - FOREVER`** (`github_push_files`)
- DDL: `db_query` + INSERT manual em `supabase_migrations.schema_migrations` (`supabase_apply_migration` segue bugado — coluna `executed_at`)
- Regra tripla de fechamento: banco → arquivo migration + registro; funcao/tabela → `schema-catalog.json`; violacao → `known-violations.json`
- Sessoes paralelas no mesmo branch/banco: re-sync antes de ler/editar; `SELECT max(version)` antes de registrar; conferir `uniq -d` apos push
- Armadilhas do ambiente: ver commit `42c920b` (handoff original, secao 2) — todas confirmadas
