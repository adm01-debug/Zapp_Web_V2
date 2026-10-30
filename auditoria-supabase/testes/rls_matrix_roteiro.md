# Roteiro — Teste de Matriz RLS (Isolamento entre Tenants)

**Status**: EXECUTADO — Postgres 16 local em 2026-10-30 (ver resultados em `01_rls_matrix.sql`)  
**Referência**: CRITICAL-2 / Seção 11 do RELATORIO_AUDITORIA_SUPABASE.md

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

## Resultado da Execução — PostgreSQL 16 local (2026-10-30)

```
T-01: PASS — user-a vê 2 msgs do seu contato (isolamento positivo OK)
T-02: PASS — user-a não vê msgs de user-b (count=0) (isolamento negativo OK)
T-C2: PASS — UPDATE cross-tenant BLOQUEADO (0 rows)
T-05: PASS — INSERT cross-tenant bloqueado
T-09: PASS — DELETE cross-tenant bloqueado (rows=0)
```

Script SQL completo: `testes/01_rls_matrix.sql`

Ver `propostas/02_rls_with_check.sql` para correção das 39 policies UPDATE sem WITH CHECK.
