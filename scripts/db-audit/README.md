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
| `database-identity.json` / `.mjs` | nao | Prova o projeto Supabase por fingerprint, DB, schema e major sem imprimir segredo |
| `catalog.sql` | sim | Regenera `supabase/schema-catalog.json` (relacoes, colunas e assinaturas/overloads de funcoes) |
| `check-catalog-fresh.mjs` | nao | Compara por conjuntos o catalogo commitado com uma geracao fresca |
| `check-mcp-exec-acl.sql` | sim | Falha se as funcoes MCP sairem do contrato `postgres` + `service_role` |
| `check-migration-drift.mjs` | parcial | Valida migrations locais e compara versao, nome e evidencia com `schema_migrations` |
| `check-migration-drift.test.mjs` | nao | Simula duplicata, vazio, conteudo alterado e drift do ledger com `psql` fake |
| `migration-evidence.json` | nao | Excecoes exatas, versionadas e com hash para stubs historicos comment-only |
| `manifest.sql` | sim | Manifesto deterministico: views, tipos/enums, defaults, constraints, indices, RLS, policies, triggers, funcoes e grants (relacao/coluna/rotina/tipo/default/schema) |
| `check-manifest-fresh.mjs` | nao | Compara `supabase/schema-manifest.json` com o banco oficial, provando identidade |
| `diff.mjs` | nao | Diffa dois manifestos v2, inclusive entre bancos distintos |
| `catalog-manifest.test.sh` | Docker local | Executa os dois SQLs no PostgreSQL 17, desloca OIDs e simula mutacoes estruturais |

## Uso

```sh
# guard de acoplamento (roda no CI, offline)
bun run db:guard

# drift de migrations
DESTINO_URL='postgres://...' node scripts/db-audit/check-migration-drift.mjs

# testes offline do guard de migrations (nao acessam banco real)
node --test scripts/db-audit/check-migration-drift.test.mjs

# integracao descartavel do catalogo/manifesto (nao acessa banco oficial)
bash scripts/db-audit/catalog-manifest.test.sh

# comparar dois bancos estruturalmente
psql "$ORIGEM_URL"  -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/manifest.sql > /tmp/src.json
psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/manifest.sql > /tmp/dst.json
node scripts/db-audit/diff.mjs /tmp/src.json /tmp/dst.json

# gerar artefatos frescos no job trusted (DESTINO_URL fica somente no ambiente)
umask 077
psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/catalog.sql \
  > /tmp/schema-catalog.fresh.json
psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/manifest.sql \
  > /tmp/schema-manifest.fresh.json

# validar sem copiar automaticamente artefato de banco errado
node scripts/db-audit/check-catalog-fresh.mjs /tmp/schema-catalog.fresh.json
node scripts/db-audit/check-manifest-fresh.mjs /tmp/schema-manifest.fresh.json

# apos revisar um drift (exit 1), atualizar os snapshots versionados
cp /tmp/schema-catalog.fresh.json supabase/schema-catalog.json
cp /tmp/schema-manifest.fresh.json supabase/schema-manifest.json
```

Os comparadores usam `0` para identidade + estrutura em sincronia, `1` para drift
estrutural revisavel e `2` para JSON invalido ou identidade nao comprovada. Um job
de sincronizacao pode propor snapshot apos `1`, mas **nunca** deve copiar arquivos
apos `2`. URLs, project-ref em claro, usuario e senha nao aparecem nas mensagens.

### Rollout inicial de `schema-manifest.json`

O primeiro snapshot **nao pode ser fabricado offline**. O rollout e deliberadamente
feito em duas fases:

1. integrar o tooling/checkers e o fluxo trusted; a ausencia do snapshot retorna
   `1` somente depois de o candidato fresco e o `DESTINO_URL` provarem a identidade;
2. disparar `types-sync` no SHA integrado, revisar o PR gerado com o
   `supabase/schema-manifest.json` vindo do banco oficial e so entao fazer merge.

Durante esse bootstrap, `db-live-guard` sinaliza o snapshot ausente como drift. Ele
so volta a ficar verde depois do PR da fase 2; `exit 2` bloqueia o bootstrap e
impede que qualquer artefato seja copiado.

Sem `DESTINO_URL`, o guard de migrations ainda valida nomes, versoes unicas,
conteudo e o manifesto de evidencias; apenas a comparacao com o ledger e pulada.
Um arquivo somente de comentarios so e aceito quando uma entrada exata em
`migration-evidence.json` fixa versao, filename, SHA-256, `ledger_name`, tipo e
justificativa. Nos testes, `MIGRATIONS_DIR`, `MIGRATION_EVIDENCE_PATH` e `PSQL_BIN`
injetam fixtures e um executavel fake sem usar shell. Essas variaveis nao sao
necessarias no uso normal.

## Por que o guard e offline

Porque assim ele roda em PR de fork, sem secret, e nao vira aquele check que fica
amarelo pra sempre porque a credencial expirou. O preco e que
`supabase/schema-catalog.json` e `supabase/schema-manifest.json` precisam ser
regenerados quando o schema muda. O workflow offline `db-guard.yml` valida o
ferramental sem receber segredo; o workflow confiavel `db-live-guard.yml` compara
os snapshots com o banco oficial e publica a geracao fresca como artifact de curta
retencao para revisao/rebuild.

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
