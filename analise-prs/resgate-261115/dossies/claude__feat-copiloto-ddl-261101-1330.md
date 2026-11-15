# Dossiê — claude__feat-copiloto-ddl-261101-1330 (PR #2461)

**Ref:** `origin/claude/feat-copiloto-ddl-261101-1330` · tip `7a8bea7d4` · merge-base `1252bb5a4` · 11 commits (7 são merges de `main`)

## Propósito
Adicionar a migration `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql`: 7 tabelas de suporte do copiloto RADAR fases 13-15 (`copilot_outcomes`, `copilot_objection_catalog`, `copilot_usage`, `copilot_seller_settings`, `copilot_help_requests`, `copilot_learning_moments`, `copilot_conversation_scores`), cada uma com RLS habilitado e policies `insert`/`select` (+ `update` em `seller_settings` e `conversation_scores`). Único arquivo no diff (`git diff --stat`: 1 file, +145).

## Arquivo × achado × evidência

| Arquivo | Pré-classificação | Achado | Evidência |
|---|---|---|---|
| `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql` | BOTH_CHANGED / CONFLICT / 99 linhas "faltando" | **JÁ NA MAIN** — mesmo SQL, só formatação diferente (main tem 1 statement por linha, sem comentários; branch tem multi-linha com comentários). As "99 linhas faltando" são puramente whitespace/comentário. | Normalização (remove comentários, colapsa espaços, 1 statement por linha) de ambas as versões gera 30 statements idênticos → `diff` vazio (`SEMANTICAMENTE_IDENTICOS`). Main adicionou o arquivo em `587ec25f8` (2026-11-02, #2551). |
| mesmo conteúdo, também em `supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql` (main) | — | A versão formatada com comentários (texto igual ao da branch) existe na main sob outro timestamp. | `git log --diff-filter=A origin/main -- …20261031100000…` → `089551d0b 2026-10-31 feat(copilot): migrations DDL aditivas fases 13-15 RADAR (#2420)`. |

### Produção (Supabase `tnnnlkbymytvtqngbbqh`, somente leitura)
- `supabase_migrations.schema_migrations`: **`20261030145126`** e **`20261031100000`** ambas registradas (`copilot_fases13_15_tabelas`).
- `pg_tables`: as 7 tabelas existem em `public`.
- `pg_policies`: as 17 policies da branch existem com os mesmos nomes (`*_insert`, `*_select` nas 7; `*_update` em `copilot_seller_settings` e `copilot_conversation_scores`).

## Veredito
**INCORPORADA** (confiança alta). Todo o DDL da branch está na `main` (dois arquivos) e aplicado em produção. O `CONFLICT` mecânico vem apenas da reformatação do arquivo na main (`587ec25f8`). Os commits próprios da branch (`2cba211cd` etc.) não são ancestrais de `origin/main`, mas o conteúdo foi incorporado via #2420 e #2551.

## Lacunas a recuperar
Nenhuma.

## Apagar branch
Seguro: sim.

## Reexame de commits intermediários

**Veredito do reexame: REFATORACAO_INTERNA.** Os 3 achados mecânicos (121 linhas) são renomeação de
arquivo, correção de typo e uma tentativa de fix bloqueada pelo guard — cujo efeito já está coberto na
`main` por outro caminho. Nada a recuperar; apagar a branch continua seguro.

Ordem dos commits (`git log --oneline --no-merges 1252bb5a4..origin/claude/feat-copiloto-ddl-261101-1330`):
`e98c7701b` → `5b7ca50e0` → `b6a164c9e` → `3ae3aa554` → `1ce715bad` → `2cba211cd` (ponta `7a8bea7d4`).

### Achado 1 — `e98c7701b` · `20261026180300_copilot_fases13_15_tabelas.sql` (103 linhas) → removido por `5b7ca50e0`
Renomeação de arquivo (timestamp), não perda. `5b7ca50e0` ("remove duplicate copilot migration") apagou os
145 do arquivo e `b6a164c9e` recriou o mesmo DDL sob `20261030145126`.
- `diff e98c7701b:…20261026180300… origin/main:…20261031100000…` → **vazio (idênticos)**.
- `diff` contra a ponta (`…20261030145126…`) → 2 linhas, só alinhamento de espaços na coluna `id`.
- Valor a recuperar: **nenhum**.

### Achado 2 — `b6a164c9e` · `20261030145126…` (1 linha) → removida por `3ae3aa554`
A linha removida era **o próprio defeito**: `OM public.copilot_seller_settings FOR UPDATE …` (typo de `ON`,
SQL inválido). `3ae3aa554` ("corrige typo OM→ON") a substituiu pela forma correta, que está na ponta e na
`main`. Varredura mecânica contou o lado `-` do diff de um fix.
- Valor a recuperar: **nenhum**.

### Achado 3 — `1ce715bad` · `20261031100000…` (17 linhas `DROP POLICY IF EXISTS`) → removidas por `2cba211cd`
Único achado que merecia dúvida: commit intermediário adicionou idempotência ("Migration duplicava todas as
16 policies já criadas por 20261030145126"); o commit seguinte, `2cba211cd`, desfez com o motivo
"guard rejeita edição de migration registrada". Os `DROP POLICY` não existem na ponta nem na `main`
(`git grep -c 'DROP POLICY' origin/main --` nos dois arquivos → 0 matches).

O problema que `1ce715bad` atacava é **real e pré-existente na `main`**: os dois arquivos da `main`
(`20261030145126` e `20261031100000`) criam exatamente as **mesmas 16 policies** (`comm -12` dos nomes → 16)
e `CREATE POLICY` não aceita `IF NOT EXISTS`, então o replay do job `replay-migrations`
(`.github/workflows/db-guard.yml` → `scripts/db-audit/replay-local.sh`, um psql por arquivo em ordem) erra no
segundo arquivo.

**Mas a intenção sobrevive na `main` por outro caminho, o sancionado:** a falha está registrada no allowlist
do gate, `scripts/db-audit/replay-known-failures.json` (linha 107), com o mesmo diagnóstico do commit
intermediário — *"policy 'copilot_outcomes_insert' (e demais) … already exists. A migration 20261030145126
… cria as mesmas 7 tabelas e todas as politicas antes desta no replay. CREATE TABLE IF NOT EXISTS e inerte;
CREATE POLICY sem IF NOT EXISTS falha com duplicate_object. … Efeito real: nenhum — o objeto esta correto no
canonico. Medido em 02/11/2026."* Só falha fora do allowlist derruba o replay (`replay-classify.py`, `RC=1`),
logo o gate está verde sem os `DROP POLICY`.
- Produção não é afetada: as duas migrations já estão em `supabase_migrations.schema_migrations` e as 7
  tabelas + 17 policies existem (medido na triagem).
- Restaurar as linhas, além de desnecessário, violaria a regra do repo que `2cba211cd` cita (não editar
  migration já registrada).
- Valor a recuperar: **nenhum**.

## Verificação adversarial

**Parecer: CONCORDO com a triagem — INCORPORADA. Branch segura para apagar.**

Tentei refutar procurando qualquer hunk de valor não coberto pela `main`. Não existe nenhum.

### Prova 1 — o diff da branch é um único arquivo
`git diff --stat 1252bb5a41123ba4d49efd84d0f91604bff6c87c origin/claude/feat-copiloto-ddl-261101-1330`
→ `supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql | 145 +++++` — 1 arquivo, 145 inserções,
0 deleções. Os 11 commits adiante são 5 merges de `main` + 6 commits sobre esse mesmo arquivo
(`e98c7701b`, `5b7ca50e0`, `b6a164c9e`, `3ae3aa554`, `1ce715bad`, `2cba211cd`). Nada de `src/`, edge,
workflow ou doc. Não há segunda frente de trabalho escondida.

### Prova 2 — o arquivo da branch é byte-idêntico ao da `main` (a menos de 2 espaços de alinhamento)
`diff <(git show origin/claude/feat-copiloto-ddl-261101-1330:supabase/migrations/20261030145126_copilot_fases13_15_tabelas.sql) <(git show origin/main:supabase/migrations/20261031100000_copilot_fases13_15_tabelas.sql)`
→ só 2 linhas divergem (38 e 111), e apenas na coluna de padding:
`  id                UUID …` (branch) vs `  id               UUID …` (main). Zero diferença de SQL,
inclusive os comentários `-- CV-121 a CV-150`, o bloco `-- Rollback:` e os rótulos `-- Fase 13/14/15`
que o `missing_sample` do JSON listava como "faltando" — eles estão na `main`, no arquivo de nome
`20261031100000`, não no de nome `20261030145126`. O `line_check` comparou arquivo por **nome** e por
isso marcou 99 linhas como ausentes; elas estão presentes no repo, em outro nome de arquivo.

### Prova 3 — equivalência semântica também com o arquivo de mesmo nome na `main`
Normalizando os três arquivos (remover comentários, colapsar espaços, 1 statement por linha, ordenar):
30 statements em cada um. `branch == main:20261031100000` idêntico após normalização; `branch` vs
`main:20261030145126` diverge só no espaço depois do `(` de cada `CREATE TABLE` (versão compactada).
Nenhum statement a mais ou a menos de nenhum lado: nenhuma tabela, coluna, CHECK, `ENABLE ROW LEVEL
SECURITY` ou `CREATE POLICY` perdido.

### Prova 4 — produção já tem tudo (leitura, projeto `tnnnlkbymytvtqngbbqh`)
- `SELECT version FROM supabase_migrations.schema_migrations WHERE version IN ('20261030145126','20261031100000')`
  → as duas linhas presentes.
- `pg_class`/`pg_policies`/`information_schema.columns` para as 7 tabelas:
  `copilot_outcomes` 8 cols / 2 policies, `copilot_objection_catalog` 7/2, `copilot_usage` 7/2,
  `copilot_seller_settings` 3/3, `copilot_help_requests` 5/2, `copilot_learning_moments` 7/2,
  `copilot_conversation_scores` 4/3 — todas com `relrowsecurity = true`. As contagens de coluna batem
  exatamente com o DDL da branch. (Ajuste factual: são **16** policies, não 17 como diz a triagem —
  7×insert + 7×select + 2×update. Irrelevante para o veredito.)

### O que eu procurei e não achei
- Hunk útil fora da `main`: nenhum (prova 2 e 3).
- Trabalho removido de propósito e que valesse resgatar: `1ce715bad`/`2cba211cd` mostram que o próprio
  autor retirou o `DROP POLICY IF EXISTS` porque o guard do repo proíbe editar migration já registrada —
  restaurar isso seria violar regra vigente, não recuperar valor.
- `DECISAO_DONO`: não se aplica — DDL já aplicado em produção, sem custo externo novo e sem contradição
  de regra.

Veredito final: **INCORPORADA**. `apagar_branch_seguro = true`.
