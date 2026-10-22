# Regras de Negócio — Critérios de Merge de PRs

> Extraídas de `CLAUDE.md`, branch protection da API do GitHub, e da convenção vigente do projeto.
> Data: 2026-10-22 · main SHA: `5a4632c87f7e233fe62e830443f8b0eddf3e1a72`

---

## 1. Stack tecnológica do projeto

- **Runtime**: Bun (não Node, não Deno)
- **Bundler**: Vite (não Webpack, não Next.js)
- **Linguagem**: TypeScript/React (não PHP, Python, Java, Rust, R, Go, Puppet)
- **Containerização**: nenhuma — sem Dockerfile, sem Docker Compose neste repositório
- **Banco**: Supabase Postgres 17 (`tnnnlkbymytvtqngbbqh`)
- **Deploy front**: Vercel automático na `main`
- **Deploy edge functions**: manual via `deploy-functions.yml` + aprovação

PR que adiciona workflow para tecnologia ausente neste projeto **é inválida** (critério 1 falha).

---

## 2. GitHub Actions — SHA pinning obrigatório

`sha_pinning_required = true` (verificado em CLAUDE.md, seção "Perímetro do GitHub").

Toda referência a action **deve** usar SHA completo de 40 caracteres, não tag semântica:

```yaml
# ERRADO
uses: actions/checkout@v4

# CORRETO
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
```

PR que adiciona workflow com `@vN` ou `@latest` viola esta regra e **é rejeitada**.

---

## 3. Proteção de branch `main`

| Campo | Valor |
|---|---|
| `strict` | `true` (PR deve estar atualizada com a `main`) |
| `enforce_admins` | `true` |
| `required_status_checks` | 6 checks obrigatórios |
| `required_pull_request_reviews` | nenhum (deliberado) |
| Método de merge | squash only |
| `delete_branch_on_merge` | `true` |

### 6 required checks

1. `🔍 Lint & TypeCheck`
2. `🧪 Unit Tests`
3. `🏗️ Build`
4. `🔒 Security Audit`
5. `Contrato DB offline`
6. `🎭 E2E Tests (Playwright)`

PR não pode ser mergeada enquanto qualquer required check falhar, **mesmo que a falha seja pré-existente na `main`**.

---

## 4. Migrations de banco de dados

Somente migrations **aditivas e não destrutivas** são aceitas:

| Operação | Permitida? |
|---|---|
| `CREATE TABLE` | ✅ |
| `CREATE INDEX` | ✅ (não CONCURRENTLY — falha no gateway) |
| `ALTER TABLE ADD COLUMN NULL` | ✅ |
| `CREATE FUNCTION` / `CREATE OR REPLACE FUNCTION` | ✅ |
| `CREATE POLICY` (nova) | ✅ |
| `DROP POLICY` / `DROP TABLE` / `DROP FUNCTION` | ❌ |
| `RENAME` (tabela, coluna, função) | ❌ |
| `ALTER TYPE` | ❌ |
| `DELETE ... WHERE` em massa | ❌ |
| `UPDATE ... WHERE` em massa | ❌ |

Migration com `DROP POLICY IF EXISTS` viola esta regra mesmo que seja seguida de `CREATE POLICY`.

---

## 5. Testes — zero regressão

**Proibido:**
- Apagar arquivo de teste existente
- Pular (`test.skip`) ou enfraquecer asserções
- Atualizar snapshots sem justificativa explícita
- Usar `|| true`, `continue-on-error`, `@ts-ignore` para esconder erros

PR que deleta arquivo de teste **é rejeitada**, independente do motivo alegado.

---

## 6. SINGU — somente leitura

O sistema SINGU é externo e read-only neste contexto. PR que tente **escrever** no SINGU não é mergeada.

---

## 7. Workflows existentes — não duplicar

O `ci.yml` já cobre: lint, typecheck, unit tests (Bun/Vitest), build (Vite), security audit, E2E (Playwright), DB contract.

PR que adiciona workflow que duplica funcionalidade já existente **é rejeitada** (critério 3: já implementado).

---

## 8. Critérios de análise (4 perguntas)

Para cada PR, 4 critérios devem ser verdadeiros para o merge ser permitido:

1. **Válida?** — A mudança tem valor real para este projeto?
2. **Sem regressão?** — Nenhum teste é apagado, nenhuma funcionalidade existente é removida?
3. **Não já implementada?** — O conteúdo não está já na `main`?
4. **Regra de negócio correta?** — A mudança está alinhada com as decisões de produto?

Qualquer critério falso → PR **não é mergeada**.

---

## 9. CI vermelho na main — impacto

Os checks `🧪 Unit Tests` (×3) e `Contrato DB offline` **já falham na `main` SHA `5a4632c`** com 44 testes pré-existentes e falha de conexão de banco respectivamente.

Com `strict=true`, mesmo PRs que passem os critérios 1–4 **não podem ser mergeadas** enquanto o CI da `main` estiver vermelho, pois o required check `🧪 Unit Tests` sempre falhará no SHA da PR.

---

*Fonte: `CLAUDE.md` (seções 0–3), `scripts/ci/github-settings-baseline.json`, API GitHub branch protection.*
