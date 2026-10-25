# Inventário — Funções de Banco de Dados

**Data**: 2026-10-24 | **Total**: 475 funções auditadas  
**Método**: bulk query em `pg_proc` + leitura individual das 12 com SQL dinâmico (EXECUTE/format)

## Resumo

| Categoria | Qtd |
|-----------|-----|
| Total de funções em `public` | 475 |
| Com SQL dinâmico (EXECUTE/format) | 12 |
| SECURITY DEFINER | ~63 (estimado via bulk query) |
| Sem SQL dinâmico confirmado | 463 |

---

## Funções com SQL Dinâmico (12 — lidas individualmente)

| Função | Risco | Detalhes |
|--------|-------|----------|
| `mcp_exec` | R2-mitigado | SECURITY DEFINER; EXECUTE com SQL literal do caller; MIME check + require admin; risco residual documentado (MEDIUM-7) |
| `talkx_audience_query` | R1 | SECURITY DEFINER; column names via `format(%I)` mas whitelist presente; input validado antes do EXECUTE |
| `purge_talkx_expired_data` | R0 | `format(%L)` para literais — imune a injeção por design do format |
| `merge_contacts_atomic` | R0 | SQL dinâmico apenas para limpeza de pivot; sem input externo |
| `purge_gmail_account_data` | R0 | `format(%L)` com UUIDs validados via regex antes do EXECUTE |
| `score_security_acl` | R0 | Construção de query sobre catálogo interno; sem input de usuário |
| `talkx_engine_cron_runs` | R0 | SQL dinâmico em comentário (inativo) — não executa |
| `increment_custom_emoji_use` | R0 | EXECUTE em comentário (inativo) — não executa |
| `trigger_pending_multiplix_dispatches` | R0 | EXECUTE em comentário (inativo) — não executa |
| `trigger_talkx_engine_tick` | R0 | EXECUTE em comentário (inativo) — não executa |
| `talkx_compile_segment_rules` | R0 | SECURITY DEFINER; `format(%I/%L)` com whitelist de colunas; retorna `text` sem EXECUTE — sem execução de SQL arbitrário |
| `guard_talkx_template_update` | R0 | Trigger de validação; não é SECURITY DEFINER; sem SQL dinâmico real |

---

## Funções SECURITY DEFINER — padrões identificados

As funções SECURITY DEFINER foram identificadas via bulk query:

```sql
SELECT proname, prosecdef, pronargs
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
ORDER BY proname;
```

Usos legítimos confirmados (sample):
- `revoke_auth_sessions` — chamada pela edge function; substitui escalação direta de role
- `get_instance_token`, `get_talkx_cron_secret` — leitura de Vault sem expor service_role
- `is_admin_or_supervisor`, `is_member_of` — funções de autorização chamadas por RLS policies
- `talkx_audience_query` — queries parametrizadas de campanha
- `talkx_compile_segment_rules` — compilação de regras de segmentação

Nenhuma SECURITY DEFINER sem `search_path` fixo encontrada nas 12 auditadas individualmente.

---

## Tabelas sem Primary Key (1)

```sql
SELECT relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conrelid=c.oid AND pc.contype='p')
ORDER BY relname;
```
Resultado: **1 tabela** (`_zapp_fn_before`) (INFO-4) — não é tabela de aplicação; não causa risco de segurança mas impede replication e CDC.

Nota: sessão anterior afirmou "4 tabelas" — corrigido nesta sessão (2026-10-24) após re-executar a query ao vivo.

---

## Achados desta seção

- **MEDIUM-7**: `mcp_exec` com SQL arbitrário executado como SECURITY DEFINER (R2-mitigado; restrito a admin)
- **INFO-4**: 1 tabela sem PK (`_zapp_fn_before`)
- 463 funções sem SQL dinâmico: confirmado via bulk query sobre `pg_proc` + `pg_get_functiondef`
