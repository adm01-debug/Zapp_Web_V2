# PARITY REPORT — ZAPP WEB V2 (Gate 2)

**Data:** 2026-08-26
**Origem:** vpkmqeumtxhrwgawxdrl.supabase.co (Lovable Cloud, baseline pós-drop de `contacts`)
**Destino:** tnnnlkbymytvtqngbbqh.supabase.co (Supabase Cloud novo, PG 17.6)
**Método:** fingerprint `fp.sql` (11 categorias, hash server-side md5) nos dois lados; diff por objeto.

## Freshness (anti-drift, sim #10)
Assinatura fresca da origem (md5+length por categoria) via `src_query` == `source-fp.txt` em disco, **byte-a-byte nas 11 categorias**. Origem não mudou desde o baseline → diff rigoroso.

## Resultado por categoria

| Cat | Origem | Destino | Divergências | Status |
|-----|--------|---------|--------------|--------|
| COLS | 122 | 123 | 0 (só `contacts` a mais) | ✅ paridade + D1 |
| IDX  | 122 | 123 | 0 (só `contacts`)         | ✅ paridade + D1 |
| TRG  | 54  | 55  | 0 (só `contacts`)         | ✅ paridade + D1 |
| VIEW | 7   | 7   | 0                         | ✅ idêntico |
| ENUM | 4   | 4   | 0                         | ✅ idêntico |
| CRON | 1   | 1   | 0 (hash idêntico)         | ✅ idêntico (D4) |
| FN (app) | 64 | 64 | 0                      | ✅ idêntico |
| CONS | 122 | 123 | 34 → cascata D1          | ✅ explicado |
| POL  | 120 | 123 | 10 → cascata D1          | ✅ explicado |
| PUB  | 3   | 11  | superset D5              | ✅ intencional |
| EXT  | 8   | 8   | 1 → pg_net versão minor  | ✅ aceitável |
| FN (tooling) | — | +2 | mcp_exec/mcp_exec_many | ✅ helpers do worker |

## Classificação das divergências (todas intencionais)

1. **contacts + cascata (D1).** `contacts` restaurada no destino; origem a perdeu out-of-band.
   - CONS: as 34 tabelas com FK→`contacts` no destino = **exatamente** as 34 CONS-divergentes.
   - POL: nas 10 tabelas divergentes, o nº de policies que referenciam `contacts` no destino = **exatamente** o delta.
   - `contact_tags`/`contact_custom_fields`: policies restauradas (origem estava com RLS on e 0 policies).
   - **Destino é MAIS correto que a origem** nesta dimensão.

2. **PUB (D5).** Publication curada = origem(3) ∪ frontend-subscribed existentes = 11 tabelas, todas REPLICA IDENTITY FULL.

3. **EXT pg_net.** 0.20.0 (origem) × 0.20.4 (destino) — versão minor gerida pelo Supabase; `net.http_post` com assinatura idêntica. Sem ação.

4. **FN mcp_exec/mcp_exec_many.** Funções-helper do próprio worker MCP do destino, não código de app.

## Não aplicado
- **D3 hardening = DROP.** Inspeção mostrou que o hardening afrouxaria a baseline Lovable de `entity_versions`. Destino mantém RLS Lovable = paridade com a origem.

## Veredito
**Paridade estrutural atingida.** Zero divergência inexplicada. Todas as diferenças = D1 (restauração correta) + D5 (curadoria intencional) + pg_net (minor) + tooling do worker. **Gate 2 assinado.**
