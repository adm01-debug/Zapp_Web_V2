# 📦 supabase-export/ — Padrão de Exportação

> ⚠️ **SNAPSHOT LEGADO — NÃO APLICAR SEM REGERAR (auditoria 2026-08-28)**
>
> Os blocos atuais foram exportados **antes** da migração para o banco oficial
> `tnnnlkbymytvtqngbbqh.supabase.co` e estão **defasados** do schema real
> (ex.: 390 RLS policies no export vs 658 nas migrations — ver
> `docs/migration/PLANO.md` etapa 22 e `docs/migration/DECISIONS.md` gate 22,
> que prevê descartar esta pasta). A fonte de verdade do schema é
> **`supabase/migrations/`**.
>
> Em 2026-08-28 as URLs de banco **antigo** embutidas em funções
> (`notify_sicoob_on_reply` em `BLOCO_01/04/10/15`) foram corrigidas para o
> banco oficial, mas o conteúdo continua defasado. O workflow
> `.github/workflows/supabase-sync.yml` passou a ser **somente manual**
> (`workflow_dispatch`) para impedir aplicação automática deste snapshot.
> Detalhes: `docs/audits/AUDITORIA_REFERENCIAS_DB_2026-08-28.md`.

Pasta **única e oficial** para todos os artefatos de exportação/migração do banco.
Toda geração de bloco DEVE seguir este padrão — sem exceção.

---

## 📁 Localização (única)

```
supabase-export/
```

❌ Não criar arquivos SQL de export em outras pastas (`/tmp`, raiz, `migrations/`, etc.).
✅ Todos os blocos vão sempre em `supabase-export/`.

---

## 🔖 Convenção de nomes

Formato fixo:

```
BLOCO_<NN>_<slug>.sql
```

- `<NN>` — número com 2 dígitos, zero-padded (`01`, `02`, …, `15`)
- `<slug>` — minúsculas, separadas por `_`, descrevendo o conteúdo
- Extensão sempre `.sql`
- Auxiliares: `POST_IMPORT_CHECKLIST.sql`, `POST_EXPORT_CHECKLIST.sh`, `README.md`

---

## 📋 Manifesto oficial dos blocos

| #  | Arquivo                                  | Conteúdo                              | Ordem de aplicação |
|----|------------------------------------------|---------------------------------------|--------------------|
| 01 | `BLOCO_01_schema_completo.sql`           | Schema completo consolidado           | (alternativa única) |
| 02 | `BLOCO_02_types_enums_domains.sql`       | Types / Enums / Domains               | 2 |
| 03 | `BLOCO_03_rls_policies.sql`              | RLS Policies (v1)                     | — (substituído por 14) |
| 04 | `BLOCO_04_functions.sql`                 | Functions (v1)                        | — (substituído por 10) |
| 05 | `BLOCO_05_triggers.sql`                  | Triggers (v1)                         | 8 |
| 06 | `BLOCO_06_indexes.sql`                   | Indexes                               | — (incluso em 13) |
| 07 | `BLOCO_07_foreign_keys.sql`              | Foreign Keys                          | — (incluso em 13) |
| 08 | `BLOCO_08_views.sql`                     | Views                                 | 7 |
| 09 | `BLOCO_09_rls_policies.sql`              | RLS Policies (v2)                     | — (substituído por 14) |
| 10 | `BLOCO_10_functions.sql`                 | Functions (final)                     | 5 |
| 11 | `BLOCO_11_extensions.sql`                | Database Extensions                   | 1 |
| 12 | `BLOCO_12_tables_and_types.sql`          | Tables + Types                        | 3 |
| 13 | `BLOCO_13_constraints_indexes.sql`       | Constraints + Indexes + FKs           | 4 |
| 14 | `BLOCO_14_rls_policies.sql`              | RLS Policies (final)                  | 6 |
| 15 | `BLOCO_15_triggers.sql`                  | Triggers + Trigger Functions (final)  | 9 |

---

## 🚀 Ordem recomendada de aplicação (modular)

```bash
psql "$DESTINO_URL" -f supabase-export/BLOCO_11_extensions.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_02_types_enums_domains.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_12_tables_and_types.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_13_constraints_indexes.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_10_functions.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_14_rls_policies.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_08_views.sql
psql "$DESTINO_URL" -f supabase-export/BLOCO_15_triggers.sql
psql "$DESTINO_URL" -f supabase-export/POST_IMPORT_CHECKLIST.sql
```

Alternativa **all-in-one**:

```bash
psql "$DESTINO_URL" -f supabase-export/BLOCO_01_schema_completo.sql
```

---

## ✅ Validação

Antes de enviar para o destino, rode:

```bash
bash supabase-export/POST_EXPORT_CHECKLIST.sh
```

Saída esperada: `15/15 OK`, exit code `0`.

---

## 🛡️ Regras de geração (para o agente)

1. **Pasta destino fixa:** sempre `supabase-export/` na raiz do projeto.
2. **Nome fixo:** seguir o manifesto acima — nunca renomear nem inventar variações.
3. **Idempotência obrigatória:** todo SQL gerado deve usar `IF NOT EXISTS`, `CREATE OR REPLACE`, ou `DO $$ ... pg_constraint/pg_policies/pg_trigger ...$$`.
4. **Sem dados:** apenas DDL — nunca exportar `INSERT`/`COPY` de dados de aplicação.
5. **Schema único:** apenas `public` (não tocar em `auth`, `storage`, `realtime`, `vault`, `supabase_functions`).
6. **Atualização:** após gerar/regerar qualquer bloco, rodar `POST_EXPORT_CHECKLIST.sh` para confirmar.