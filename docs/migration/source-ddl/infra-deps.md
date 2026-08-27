# Mapa de Dependências de Infra Antiga — ZAPP WEB V2

Gerado: 2026-08-27 · Sessão 4 · src_query na origem `vpkmqeumtxhrwgawxdrl`

## Funções com Referências a Infra Antiga

| Função | Dependência | Ação |
|---|---|---|
| `notify_sicoob_on_reply` | `allrjhk` (project ref origem) | Substituir por `app.settings.supabase_url` do destino (step 34/64) |
| `notify_sicoob_on_reply` | `app.settings.service_role_key` | Verificar se o GUC existe no destino (step 34) |

## Resultado

- **1 função afetada** de 64 totais na origem.
- `allrjhk` está hardcoded na função — chama endpoint da **origem** em vez do destino → silently fails.
- Correção: steps 34 + 64 do PLANO.md (recriar função apontando para `SUPABASE_URL` do destino via GUC ou env).

## Outras Dependências Investigadas

- `atomicabr`: **0 funções** (sem referência)
- `app.settings.supabase_url`: **0 funções** (GUC não usado diretamente em funções, apenas via trigger setup)
- `net.http_post`: **0 funções** em public (extensão pg_net disponível mas não usada em functions)
