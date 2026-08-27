# `scripts/db-audit/`

Ferramental de auditoria do banco. Nasceu da auditoria de migracao de 27/08/2026
(`docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md`), que teve que ser refeita do zero
porque os scripts da primeira rodada viviam em `/home/claude/` e morreram no reset do
container. Etapa 98 do plano: publicar aqui para nao perder de novo.

## O que tem

| Arquivo | Precisa de banco? | O que faz |
|---|---|---|
| `supabase-usage-guard.mjs` | nao | Valida `.from()` / `.rpc()` do cliente principal contra `supabase/schema-catalog.json` |
| `known-violations.json` | nao | Baseline (ratchet) das violacoes ja conhecidas |
| `catalog.sql` | sim | Regenera `supabase/schema-catalog.json` |
| `check-migration-drift.mjs` | sim | Compara `supabase/migrations/*.sql` com `schema_migrations` |
| `manifest.sql` | sim | Assinatura MD5 por objeto do schema `public` |
| `diff.mjs` | nao | Diffa dois manifestos |

## Uso

```sh
# guard de acoplamento (roda no CI, offline)
bun run db:guard

# drift de migrations
DESTINO_URL='postgres://...' node scripts/db-audit/check-migration-drift.mjs

# comparar dois bancos estruturalmente
psql "$ORIGEM_URL"  -At -f scripts/db-audit/manifest.sql > /tmp/src.json
psql "$DESTINO_URL" -At -f scripts/db-audit/manifest.sql > /tmp/dst.json
node scripts/db-audit/diff.mjs /tmp/src.json /tmp/dst.json

# regenerar o catalogo apos criar/remover tabela ou funcao
psql "$DESTINO_URL" -At -f scripts/db-audit/catalog.sql > supabase/schema-catalog.json
```

## Por que o guard e offline

Porque assim ele roda em PR de fork, sem secret, e nao vira aquele check que fica
amarelo pra sempre porque a credencial expirou. O preco e que
`supabase/schema-catalog.json` precisa ser regenerado quando o schema muda - o job
`catalog-fresh` do workflow `db-guard.yml` avisa quando ele fica velho.

## Armadilhas conhecidas

- **Este repo tem tres clientes Supabase.** `src/integrations/supabase/client.ts` (principal),
  `externalClient.ts` (CRM externo) e `clientesClient.ts` (base de clientes). Edge functions
  ainda criam `extClient` para PROMOGIFTS. Tratar todos como um so gera falso positivo:
  na primeira passada da auditoria, 13 de 17 "tabelas inexistentes" eram so chamadas em
  outro banco.
- **`storage.from('bucket')` casa com o mesmo regex de `.from('tabela')`.** O guard filtra
  pelo receptor; qualquer analise ad-hoc precisa fazer o mesmo.
- **`.from('x' as any)` silencia o TypeScript.** Ha 18 desses no repo. O type-check nao
  pega, so o guard pega.
- **`CREATE INDEX CONCURRENTLY` nao roda pelo gateway MCP** (erro 25001, wrapper
  transacional). Para tabela grande, use `psql` direto.
- **`supabase_apply_migration` esta bugado no self-hosted** (referencia coluna
  `executed_at` inexistente). Ver `docs/MIGRATIONS.md`.
