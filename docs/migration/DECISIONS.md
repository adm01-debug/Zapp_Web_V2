# DECISIONS — Migração ZAPP WEB V2

Origem: `vpkmqeumtxhrwgawxdrl` (Lovable Cloud, read-only) → Destino: `tnnnlkbymytvtqngbbqh` (Supabase Cloud novo, PG 17.6) + VPS Hostinger.
Registro das decisões (id · decisão · classificação · status). Fonte de verdade operacional: `HANDOFF.md`. Evidência de paridade: `PARITY-REPORT.md`.

## Gate 1 — aprovado em 2026-08-26

| ID | Decisão | Classificação | Status |
|----|---------|---------------|---------|
| D1 | Restaurar `contacts` + FKs + policies de `contact_tags`/`contact_custom_fields` a partir das migrations Lovable | perda na origem (drop out-of-band) | ✅ EXECUTADO — destino tem `contacts` + 34 FKs + policies restauradas |
| D2 | Aplicar SÓ as 256 migrations Lovable (UUID); excluir as 3 retro-datadas e as 7 de junho (lote v3/self-hosted) | paridade com a origem | ✅ EXECUTADO — 256/256 sem erro real, 258 registradas em `schema_migrations` |
| D3 | Hardening `20260412230000_fix_rls_policies_security` | revisado → **DROP** | ⛔ NÃO aplicado. Split afrouxaria a baseline Lovable de `entity_versions`; família e-mail incompatível; redundante. Destino mantém RLS Lovable = paridade com a origem. |
| D4 | Recriar cron `cleanup-link-preview-cache` (`0 3 * * *` → `SELECT public.cleanup_link_preview_cache()`) | paridade de config | ✅ EXECUTADO — hash do comando idêntico à origem |
| D5 | Publication realtime curada = origem(3) ∪ frontend-subscribed existentes = 11 tabelas, todas `REPLICA IDENTITY FULL` | funcionalidade > paridade | ✅ EXECUTADO — tabelas mortas do CRM/v3 não entram (não existem) |
| D6 | Manter lab `zapp-replay` na VPS até o Gate 2 | — | ✅ mantido |

## Notas técnicas
- `pg_net` destino 0.20.4 × origem 0.20.0 — versão minor gerida pelo Supabase; `net.http_post` com assinatura idêntica. Aceito.
- `pg_cron`/`pg_net`/`pg_trgm` instaladas via as próprias migrations (governança de extensão no Cloud validada ao vivo com role postgres).
- Funções `mcp_exec`/`mcp_exec_many` no destino = helpers do worker MCP (execução de query), não código de app.

## Gate 2 — paridade
Ver `PARITY-REPORT.md`. Zero divergência inexplicada: tudo = D1 (restauração correta) + D5 (curadoria) + pg_net (minor) + tooling do worker. Freshness da origem verificado byte-a-byte (sem drift).

## Gates seguintes (pendentes)
16 SSH · 22 descartar `supabase-export/` · 51 dados (~60 linhas: migrar vs nascer limpo) · 57 PAT do destino · 60 `LOVABLE_API_KEY` · 66 backend · 77 merge · 78 tag · 79 budget Actions · 88 firewall · 90 go-live · 98 congelar origem.

## Plano de 30 etapas — decisões adicionais (sessão 3, 2026-08-26)

| ID | Decisão | Classificação | Status |
|----|---------|---------------|---------|
| D7 | Publication realtime = expansão funcional; `supabase_realtime` com 11 tabelas criado no step 38, mas assinantes confirmados somente após deploy das functions (step 61). Criar sem subscriber não quebra nada. | expansão intencional documentada | ✅ Registrado |
