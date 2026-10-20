# E20 — Conexões e Pooling das Edge Functions

> Documento criado em 2026-09-29 para fechar a etapa E20 do
> `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`.

## Como as edges conectam ao banco

Todas as 69 edge functions do Zapp Web V2 usam `@supabase/supabase-js` exclusivamente.
Não há nenhuma conexão TCP direta ao banco (nenhum hit em `DATABASE_URL` ou
`postgres://` em `supabase/functions/`).

```sh
# Verificação (29/09 — 0 hits)
grep -r "DATABASE_URL\|postgres://" supabase/functions/
```

## Caminho de conexão

```
Edge Function
  └─► supabase-js (HTTPS)
        └─► PostgREST  (porta 443, REST API)
              └─► Supavisor (connection pooler)
                    └─► PostgreSQL 17.6
```

**Supavisor** é o pooler padrão do Supabase Cloud desde 2023. Dois modos:

| Modo | Porta | Uso |
|------|-------|-----|
| Transaction | **6543** | Stateless, sem `SET LOCAL`, sem prepared statements persistentes — padrão para edges |
| Session | **5432** | Stateful, para clientes que precisam de `SET` / transações longas |

As edges usam PostgREST/HTTPS, que já opera em transaction mode internamente.
Não há configuração adicional necessária.

## Timeouts configurados

```toml
# supabase/config.toml
[edge_runtime]
request_timeout_ms = 150_000   # 150s por request de edge function
```

## Estado atual

| Item | Estado |
|------|--------|
| Conexões diretas TCP ao banco | **0** (grep confirmado) |
| Modo de pooling | Transaction (via PostgREST/HTTPS) |
| Porta Supavisor transaction | 6543 |
| Timeout por request | 150s |
| Documentação de pooler | Este arquivo |

Etapa E20 fechada em 2026-09-29.
