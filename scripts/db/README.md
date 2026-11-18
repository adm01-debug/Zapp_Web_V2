# scripts/db

Gerador do inventário de banco lido pela guarda de documentação.

## `gen-db-inventory.mjs`

Reescreve **só** a tabela de contagens da seção `## Objetos por tipo` de
`docs/DB-INVENTORY.md`, a partir de `supabase/schema-catalog.json`.

```bash
node scripts/db/gen-db-inventory.mjs           # reescreve o documento
node scripts/db/gen-db-inventory.mjs --check   # falha se estiver desatualizado
```

**Por que existe.** A guarda `scripts/ci/db-inventory-doc.unit.mjs` compara o
documento com o catálogo. O catálogo é regenerado pelo bot do `types-sync`; o
documento era escrito à mão. Resultado: todo objeto novo no banco quebrava a
guarda e **congelava** a PR do types-sync até alguém lembrar de editar o
markdown — aconteceu na #3256 e de novo em 18/11/2026, com as 6 colunas e as 2
RPCs do X065. O passo "Regerar as contagens de docs/DB-INVENTORY.md" em
`.github/workflows/types-sync.yml` fecha o ciclo: documento e catálogo saem no
mesmo commit.

**O que ele NÃO toca.** O inventário de tabelas (`## Tabelas`), com status e
consumidores, é curadoria humana e a guarda o confere contra o repositório. O
gerador erra alto se a seção de contagens sumir, em vez de reescrever o
documento errado.

Contrato em `gen-db-inventory.unit.mjs`, executado pelo bloco
`🧩 Run Node CI scripts tests` do `ci.yml`.
