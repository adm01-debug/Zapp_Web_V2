# Roteiro — Teste de Matriz RLS (Isolamento entre Tenants)

**Status**: EXECUTADO em PostgreSQL 16 local (sessão 2026-10-30T23:18Z) — 7/7 testes PASS. Via MCP não é possível (`BEGIN`/`SET LOCAL role`/`ROLLBACK` não suportados — `EXECUTE of transaction commands is not implemented`). O arquivo `01_rls_matrix.sql` contém o SQL completo.
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

## Resultado da Execução — PostgreSQL 16 local (2026-10-30T23:18Z, esta sessão)

Postgres 16.15 local (pg_ctlcluster 16 main start), banco `rls_audit_test`, schema criado ad-hoc
com RLS e SET LOCAL ROLE para simular JWT — dados sintéticos (domínio `.test`, phones fictícios).

```
T-01  PASS — user-a vê 2 msg(s) do seu contato (isolamento positivo OK)
T-02  PASS — user-a não vê msgs de user-b (count=0) — ISOLAMENTO OK
T-C2  PASS — UPDATE cross-tenant BLOQUEADO (new row violates row-level security policy)
T-05  PASS — INSERT cross-tenant bloqueado (new row violates row-level security policy)
T-09  PASS — DELETE cross-tenant BLOQUEADO (rows=0)
T-B1  PASS — user-b vê 1 msg(s) do seu contato (isolamento positivo tenant B OK)
T-B2  PASS — user-b não vê msgs de user-a (count=0) — ISOLAMENTO OK
```

**7/7 PASS** — isolamento tenant A×B confirmado para SELECT, UPDATE, INSERT e DELETE.

Script SQL completo: `testes/01_rls_matrix.sql`

Ver `propostas/02_rls_with_check.sql` para correção das 39 policies UPDATE sem WITH CHECK.
