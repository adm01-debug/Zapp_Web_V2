# S4 — Integridade Referencial e Dados

**Coletado em:** 2026-11-01

## FK sem índice de suporte

```sql
SELECT count(*) FROM (
  SELECT c.conrelid::regclass, a.attname
  FROM pg_constraint c
  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
  WHERE c.contype = 'f'
    AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid
        AND a.attnum = ANY(i.indkey)
    )
) x;
-- Resultado: 30 FKs sem índice
```

## Tabela contacts

| Coluna | Existe |
|---|---|
| id | ✓ |
| phone | ✓ |
| name | ✓ |
| deleted_at | ✓ |
| is_lid_legacy | ✓ |

Critério de contato visível: `deleted_at IS NULL AND is_lid_legacy = false AND phone ~ '^[0-9]{10,15}$'`

## Estrutura de Conversas

Tabela `conversations` **NÃO EXISTE** no schema `public` (como esse nome).

**NÃO VERIFICADO** — possível que o acesso seja via view ou nome diferente.

## Dead Tuples (Bloat)

```sql
SELECT relname, n_dead_tup, n_live_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup+n_dead_tup,0)*100,1) as dead_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY dead_pct DESC LIMIT 10;
```

| Tabela | Dead% |
|---|---|
| `_http_response` | ~17.4% |
| `connection_health_logs` | ~9.5% |

**Baixo risco** — ambas abaixo de 20%. Autovacuum operacional.

## Status

| Verificação | Status |
|---|---|
| FK sem índice | ✓ 30 encontradas |
| Dead tuples | ✓ baixo |
| conversations table | NÃO VERIFICADO (nome diferente) |