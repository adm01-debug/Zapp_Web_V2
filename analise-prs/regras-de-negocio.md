# Regras de Negócio — Classificação de PRs

**Fonte canônica:** `CLAUDE.md` do repositório `adm01-debug/Zapp_Web_V2`  
**Aplicadas na análise de 2026-11-01**  
**SHA de main ao início:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c`

---

## Regra 8 — DECISAO_HUMANA (não mergear sem aprovação)

**Fonte:** user preferences → "Fluxo Git → regra 8"

PR entra na Regra 8 quando toca qualquer um destes escopos:

| Escopo | Evidência no CLAUDE.md |
|---|---|
| **Migration/DDL em produção** | Seção 1, regras 1–8: "Toda mudança de DDL = arquivo em supabase/migrations/"; environment `producao-ddl` exige aprovação humana |
| **`.github/workflows/`** | User preferences regra 8: "CI/workflows, segredos, Dockerfile, stack/Swarm, Traefik" |
| **Secrets / env vars críticos** | User preferences regra 8: "segredos" |
| **Deleção destrutiva de dados** | User preferences regra 8: "deleção de dado, mudança de arquitetura ou custo" |
| **Edge functions (lógica crítica)** | CLAUDE.md seção "Deploy e edge functions": deploy automático em `producao-edge-functions`; edge functions com lógica de negócio crítica ficam na regra 8 |
| **Conflito com PR de outro agente** | User preferences regra 8: "conflito com PR de outro agente" |

---

## MERGE_OK — pode mergear automaticamente

Critérios simultâneos exigidos:
1. PR não é DRAFT
2. PR não está fechada (`state=open`)
3. Sem migration (`supabase/migrations/`)
4. Sem `.github/workflows/`
5. Sem deploy de edge function com lógica crítica não revisada
6. Sem conflito de merge (`mergeable_state ≠ dirty`)
7. Não escreve no banco SINGU (read-only: `pgxfvjmuubtbowutlide`, `doufsxqlfjyuvxuezpln`)

`MERGE_OK_AUTO_MERGE_PENDING` = critérios acima satisfeitos + `auto_merge=true` habilitado + CI ainda rodando.

---

## MERGEAR — docs/planos sem risco técnico

PRs que alteram apenas documentação (`docs/`, `*.md`) ou arquivos de configuração sem efeito em produção. Sem migration, sem workflow, sem edge function.

---

## MERGEAR_COM_RESSALVA — OK mas com caveats

PRs elegíveis para merge mas com conflito potencial entre si (ex: #2417 e #2431 tocam o mesmo `src/test/setup.ts`). Mergear uma pode invalida a outra.

---

## CONFLITO — rebase necessário

`mergeable_state=dirty` retornado pela API do GitHub. Autor da branch deve fazer `git rebase origin/main`.

---

## AGUARDANDO_APROVACAO

PR body contém sinalização explícita de aguardar aprovação humana, ou PR tem migration de alto impacto (ex: 57 índices FK).

---

## DRAFT — não mergear

`draft=true` na API do GitHub. Drafts não são mergeados independente do conteúdo.

---

## IMPOSSIVEL_MERGE

PR com `rebaseable=false` (GitHub não consegue rebasear automaticamente) e muito atrás do main. Requer intervenção manual complexa.

---

## Fontes consultadas

- `CLAUDE.md` (seções 0, 1, 3 — banco, migrations, repo)
- User preferences → "Fluxo Git" (regras 1–11)
- PR bodies e dossiers individuais em `analise-prs/dossies/`