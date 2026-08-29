# Migrations — procedimento e armadilhas

**Origem:** etapa 12 do plano em `docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md` (achado A-05).

---

## 1. A regra que importa

**`supabase/migrations/` e `supabase_migrations.schema_migrations` do destino tem que
conter exatamente o mesmo conjunto de versoes.** Nao a mesma contagem — o mesmo conjunto.

Contagem igual esconde erro. Na auditoria de 27/08/2026 havia 267 arquivos e 259 registros;
depois de reconciliar, os dois lados fecharam em 261 com o mesmo hash:

```sh
# lado do repo
ls supabase/migrations/*.sql | sed 's|.*/||' \
  | sed -E 's/^([0-9]{14}).*/\1/' | sort | tr -d '\n' | md5sum

# lado do banco
psql "$DESTINO_URL" -At -c \
  "SELECT md5(string_agg(version,'' ORDER BY version)) FROM supabase_migrations.schema_migrations"
```

O job `migration-drift` do workflow `db-guard.yml` faz essa comparacao a cada push.

---

## 2. `supabase_apply_migration` esta bugado neste ambiente

O MCP do Supabase self-hosted falha ao aplicar migration — referencia uma coluna
`executed_at` que nao existe em `supabase_migrations.schema_migrations`. O schema real e:

```
version      text      NOT NULL
statements   text[]    NULL
name         text      NULL
```

### Procedimento manual correto

1. Aplique o DDL via `db_query` (multi-statement, uma transacao por chamada).
2. Registre a versao na mesma chamada ou logo depois:

```sql
INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
VALUES ('20260827120100', 'nome_da_migration', ARRAY[
  '-- resumo do que foi aplicado',
  '-- fonte de verdade: supabase/migrations/20260827120100_nome_da_migration.sql'
]) ON CONFLICT DO NOTHING;
```

3. Commite o arquivo `.sql` com o **mesmo** prefixo de 14 digitos.

**O arquivo no Git e a fonte de verdade.** A coluna `statements` e metadado. Nao gere
`statements` a partir do catalogo do banco sem filtrar: na primeira tentativa desta
reconciliacao o gerador capturou 126 statements em vez de 108, porque 18 indices
preexistentes seguiam a mesma convencao de nome — um `db reset` quebraria neles.

---

## 3. `CREATE INDEX CONCURRENTLY` nao roda pelo gateway MCP

Erro `25001: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. O gateway
envolve cada chamada numa transacao.

- Tabela pequena: use `CREATE INDEX` simples. As 108 FKs de 27/08 rodaram em 278ms
  (maior tabela: 584 kB / 41 linhas).
- Tabela grande: rode por `psql` direto, fora de transacao.

O mesmo vale para `VACUUM` e `DROP INDEX CONCURRENTLY`.

---

## 4. `_foreign/` e `_superseded/`

Diretorios que comecam com `_` ficam fora do glob `supabase/migrations/*.sql`, logo fora
do `supabase db push`. Nada foi apagado.

| Diretorio | O que guarda |
|---|---|
| `_foreign/` | 7 migrations do Supabase self-hosted / Evolution, commitadas no repo errado |
| `_superseded/` | 4 migrations cuja DDL nunca foi aplicada aqui — os objetos vieram de outras migrations, ja registradas |

Cada diretorio tem um `README.md` com a prova. Leia antes de mover qualquer coisa de volta.

### Como confirmar que uma migration nao pertence a este banco

```sql
SELECT to_regclass('public.tabela_que_ela_manipula');  -- NULL = nao existe aqui
```

Cuidado com colisao de nome: `20260612150000` dropava `idx_contacts_name_trgm` pensando em
`evolution_contacts` do self-hosted, mas esse indice **existe** aqui em `public.contacts`.
Verificar a tabela nao basta — verifique tambem os nomes de indice e de funcao.

### Como confirmar que uma migration foi superada

Existir a tabela nao prova que o arquivo rodou. Compare objeto a objeto e rastreie a origem:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE array_to_string(statements,' ') ILIKE '%CREATE TABLE%minha_tabela%';
```

---

## 5. Operacao pontual nao e migration

`VACUUM`, limpeza de bloat, backfill de uma vez — nada disso deve virar migration
replicavel. Se precisar registrar, o arquivo deve conter **so** o que e seguro reaplicar.

Exemplo real: `20260827130500_vacuum_maintenance_m05.sql`. O que foi executado incluia
`ALTER TABLE ... SET (autovacuum_vacuum_threshold=0, autovacuum_vacuum_scale_factor=0)` e
um `cron.schedule('one-time-vacuum-bloated-tables', '* * * * *', ...)`. O arquivo commitado
emite apenas os `RESET` idempotentes. Reaplicar o original faria o autovacuum disparar a
cada tupla morta e recriaria um cron de minuto em minuto — que, nas duas execucoes
registradas em `cron.job_run_details` (18:03 e 18:04 de 27/08/2026), saiu com
`status='failed'`.

---

## 6. Checklist antes de `supabase db push`

```sh
node scripts/db-audit/check-migration-drift.mjs        # DESTINO_URL setado
node scripts/db-audit/supabase-usage-guard.mjs         # offline
ls supabase/migrations/*.sql | sed 's|.*/||' | cut -c1-14 | sort | uniq -d   # versao duplicada
```

A ultima linha existe porque isso ja aconteceu: em 27/08/2026 duas sessoes criaram
arquivos diferentes com o prefixo `20260827130500`.

---

## 7. Artefatos gerados automaticamente

`src/integrations/supabase/types.ts` e `supabase/schema-catalog.json` sao
regenerados pelo workflow `types-sync` (`.github/workflows/types-sync.yml`).

**Nunca editar esses dois arquivos manualmente.** Qualquer edicao sera sobrescrita
no proximo push de migration ou no cron semanal (segunda, 06:00 UTC).

A regra de fechamento tripla foi simplificada:

- ~~migration + registro no banco + catalog + types~~ (anterior — manual, sujeita a drift)
- **migration + registro no banco** (atual — maquina cuida do catalog e do types)

### Para sessoes Claude

Nao incluir `types.ts` nem `schema-catalog.json` em commits de migration.
Ao adicionar uma tabela nova, o types sera atualizado automaticamente pelo bot.

### Para diagnosticar drift manual

Se o `types.ts` estiver desatualizado, dispare manualmente:
`GitHub Actions > types-sync > Run workflow`

O `db-guard.yml` (job `catalog-fresh`, semanal) tambem verifica o frescor do
`types.ts` contra o banco e falha se houver divergencia — os dois mecanismos
sao independentes.
