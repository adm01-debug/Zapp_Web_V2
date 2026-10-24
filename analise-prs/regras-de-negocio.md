# Regras de negócio para merge de PRs

Fonte: CLAUDE.md (versão 2026-10-01 / seções 0, 1, 3 e Fluxo Git)

## Critérios de aprovação para merge automático

Uma PR é elegível para merge automático **somente se TODAS as condições abaixo forem satisfeitas**:

1. **Não é rascunho (draft: false)**
2. **Todos os 6 required checks verdes** no HEAD SHA:
   - `🔍 Lint & TypeCheck`
   - `🧪 Unit Tests`
   - `🏗️ Build`
   - `🔒 Security Audit`
   - `Contrato DB offline`
   - `🎭 E2E Tests (Playwright)`
3. **Sem conflito com main** (`mergeable_state != "dirty"`)
4. **Não é Regra 8** — ver lista abaixo
5. **Não toca .github/workflows** — any change to CI/CD pipeline files
6. **Não é SINGU** — não escreve em `pgxfvjmuubtbowutlide` ou `doufsxqlfjyuvxuezpln`
7. **Sem DDL/migration nova** aguardando apply em produção (arquivo novo em `supabase/migrations/`)
8. **Não há outra PR aberta tocando os mesmos arquivos** — conflito de sessões paralelas

## Regra 8 — deixar aberta e notificar humano

PR fica aberta (sem merge) se envolver qualquer um dos seguintes:

| Categoria | Indícios |
|---|---|
| DDL / migration em banco de produção | arquivo novo em `supabase/migrations/`, ou corpo menciona `db_query` DDL |
| CI / workflows | mudança em `.github/workflows/` |
| Segredos | rotação de chaves, secrets novos, `.env`, vault |
| Dockerfile / stack / infra | `Dockerfile`, `docker-compose`, Traefik, Swarm, VPS |
| Deleção de dado ou mudança de arquitetura | `DROP`, `REVOKE`, rename de contrato público, mudança de API |
| Custo | dependência nova paga, tier de serviço |
| Título com `[DECISAO HUMANA]` ou `[DECISÃO HUMANA]` | marcação explícita |
| Conflito com PR de outro agente | sobreposição de arquivos em PRs abertas |

## Método de merge

- Squash-merge (política do repo: `allow_squash_merge=true`, `allow_merge_commit=false`)
- Deleção automática de branch pós-merge (`delete_branch_on_merge=true`)
- Via `GITHUB - MCP - FOREVER` (`github_merge_pull_request`)

## O que NÃO fazer

- Push direto em main
- Force-push
- Fechar / editar / comentar PR
- Adicionar/remover labels
- Deletar branch manualmente
- Mudar configurações do repo ou branch protection
- Burlar proteção de branch
