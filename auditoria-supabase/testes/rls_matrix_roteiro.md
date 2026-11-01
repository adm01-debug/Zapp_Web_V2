# Roteiro — Teste de Matriz RLS (Isolamento entre Tenants)

**Status**: EXECUTADO em PostgreSQL 16 local (sessão 2026-10-30T23:18Z) — **8/8 testes PASS** nas migrations reais do repo (900/1064 aplicadas; falhas esperadas: vault/pg_net/realtime). Via MCP não é possível (`BEGIN`/`SET LOCAL role`/`ROLLBACK` não suportados — `EXECUTE of transaction commands is not implemented`). O arquivo `01_rls_matrix.sql` contém o SQL completo.
**Referência**: Seção 11 do RELATORIO_AUDITORIA_SUPABASE.md

---

## Por que testar em Postgres temporário

A matriz completa de RLS exige executar queries como diferentes roles
(`anon`, `authenticated`, `service_role`) simulando JWTs reais. Isso
não pode ser feito no banco de produção (proibido escrever dados de teste
em produção). O roteiro abaixo usa um Postgres local com as migrations
do repo aplicadas.

---

## Pré-requisitos

```bash
cd /home/user/Zapp_Web_V2
bash scripts/db-audit/replay-local.sh
node scripts/db-audit/check-migration-drift.mjs
```

---

## Tabelas Prioritárias

| Prioridade | Tabela | Motivo |
|-----------|--------|--------|
| P1 | conversations | Core do produto |
| P1 | messages | Alto volume; dados de usuário |
| P1 | contacts | PII; acesso multi-role |
| P1 | tasks | Recentemente adicionada |
| P2 | talkx_campaign_segments | CRÍTICO: policies public sem JWT |
| P2 | copilot_sessions | ALTO: UPDATE public sem WITH CHECK |

---

## Resultado da Execução — PostgreSQL 16 local, migrations reais do repo (2026-10-30T23:18Z)

Postgres 16.15 local (pg_ctlcluster 16 main start), banco `rls_audit_test`, **900/1064 migrations do repo aplicadas** (164 falhas esperadas: vault, pg_net, realtime, auth.sessions — não afetam as tabelas testadas). Roles `authenticated`/`anon`/`service_role` criados via stubs Supabase-compatíveis. Dados sintéticos (domínio `.test`, phones fictícios).

```
T-01  PASS — user-a vê 2 msg(s) do seu contato (isolamento positivo OK)
T-02  PASS — user-a não vê msgs de user-b (count=0) — ISOLAMENTO OK
T-C2  PASS — UPDATE cross-tenant BLOQUEADO por trigger message_immutable_columns_forbidden
             (defesa em profundidade além do RLS WITH CHECK)
T-05  PASS — INSERT cross-tenant bloqueado (new row violates row-level security policy)
T-09  PASS — DELETE cross-tenant BLOQUEADO (rows=0)
T-B1  PASS — user-b vê 1 msg(s) do seu contato (isolamento positivo tenant B OK)
T-B2  PASS — user-b não vê msgs de user-a (count=0) — ISOLAMENTO OK
T-C2b PASS — UPDATE sem WITH CHECK explícito: USING implícito bloqueia cross-tenant ✓
```

**8/8 PASS** — isolamento tenant A×B confirmado para SELECT, UPDATE, INSERT e DELETE nas migrations reais do repo.

**Observação importante:** O schema das migrations usa `contact_id`-based isolation (não `organization_id`). Em produção há drift: 42 policies UPDATE sem WITH CHECK explícito (ver `propostas/02_rls_with_check.sql`). O USING implícito bloqueia cross-tenant no banco ao vivo também, mas a ausência de WITH CHECK é uma lacuna de segurança formal — sem WITH CHECK, um UPDATE pode mover uma linha para fora do escopo sem que o Postgres rejeite explicitamente.

Script SQL completo: `testes/01_rls_matrix.sql`

Ver `propostas/02_rls_with_check.sql` para correção das 42 policies UPDATE sem WITH CHECK.
