# Regras de negócio aplicadas na análise de PRs

> Gerado em 2026-11-01. Fonte: `/goal` + `CLAUDE.md`.

## 1. Restrições absolutas (qualquer uma → DECISAO_HUMANA)

| Regra | Motivo | Evidência |
|---|---|---|
| Não tocar `.github/workflows/` | Risco de CI/deploy; escopo vedado pelo `/goal` | CLAUDE.md §0 regra 6; `/goal` literal |
| Não mergear PRs DRAFT | Trabalho incompleto por definição do autor | GitHub API `draft: true` |
| Migration destrutiva: `DROP TABLE`, `DROP COLUMN`, `DROP TYPE`, `ALTER TYPE`, `RENAME`, `UPDATE/DELETE em massa` | Irrecuperável sem backup; pode quebrar produção | CLAUDE.md §1 regra 6; `/goal` |
| Edge function R2: WhatsApp, email, voz, CRM, pagamento | Efeito colateral real (mensagens enviadas, cobranças) | `/goal` literal |
| PR com body explícito "AGUARDANDO APROVAÇÃO" | Próprio agente sinalizou que Joaquim precisa decidir | PR body verificado via API |
| SINGU (bancos externos CRM/Catálogo) | Read-only; fora do escopo deste repo | CLAUDE.md §1 bancos externos |

## 2. Critérios para MERGE_OK

Todos os itens abaixo devem ser verdadeiros:

1. **Não é DRAFT** (`draft: false`)
2. **Não toca `.github/workflows/`**
3. **Sem migration destrutiva** (sem `DROP`, `RENAME`, `ALTER TYPE`, `UPDATE/DELETE em massa`)
4. **Migration presente é aditiva e idempotente** (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, etc.)
5. **Edge functions são R0/R1** ou ausentes
6. **PR body não declara aguardando aprovação externa**
7. **Sem conflito de merge** (`mergeable != false`)
8. **Não depende de PR DECISAO_HUMANA ainda não mergeada**

## 3. Classificação de edge functions

| Classe | Exemplos | Ação |
|---|---|---|
| R0 | Leitura pura (SELECT, GET) | Livre para merge |
| R1 | Escrita interna sem efeito colateral externo | Livre para merge |
| R2 | Envia WhatsApp, email, SMS, voz; CRM externo; pagamento | DECISAO_HUMANA obrigatória |

## 4. Merge method

- Squash-merge exclusivamente (`merge_method: "squash"`)
- `allow_merge_commit=false`, `allow_rebase_merge=false` no repo

## 5. Branch protection

- `strict=true` (required)
- Required checks: `🏗️ Build`, `🔎 TypeCheck`, `✅ CI Gate (required check)` (3 checks)
- `enforce_admins=true`
