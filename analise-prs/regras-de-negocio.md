# Regras de Negócio — Análise de PRs (2026-11-08)

## Feature Freeze

**Status**: ATIVO (desde PR #2545)

Apenas correções de fluxo crítico são permitidas. PRs com prefixo `feat(` ou `feat:` são bloqueadas
pelo Feature Freeze até decisão contrária do Joaquim.

## Critérios de Elegibilidade para Merge

1. **NÃO-DRAFT** — PRs em rascunho (draft) não são mergeadas
2. **NÃO-REGRA8** — PRs que tocam CI/workflows `.github/`, migrations DDL destrutivas, segredos,
   Dockerfile, infraestrutura ou deleção de dados em massa precisam de aprovação humana do Joaquim
3. **NÃO-FEATURE_FREEZE** — PRs com `feat(` / `feat:` bloqueadas durante o congelamento
4. **CI VERDE** — Todos os 6 required checks devem passar:
   - 🏗️ Build
   - 🔎 TypeCheck  
   - ✅ CI Gate (inclui Unit Tests, E2E, Security Audit, Contrato DB offline)
5. **SEM CONFLITO** — Sem `mergeable_state: dirty`
6. **ESCOPO VÁLIDO** — Apenas mudanças no escopo descrito (sem alargamento de scope)

## Classificações de Veredito

| Veredito | Significado | Ação |
|---|---|---|
| `ELEGIVEL` | Pode ser mergeada se CI verde | Merge via squash |
| `FEATURE_FREEZE` | Feature bloqueada durante congelamento | Não mergear |
| `REGRA8` | Precisa aprovação humana | Aguardar Joaquim |
| `DRAFT` | Rascunho incompleto | Não mergear |
| `SUPERSEDIDA` | Corrigida por outra PR (ex: #2864) | Será fechada automaticamente quando a superior mergear |
| `BOT_CHORE` | PR automática de bot (types-sync, inventário) | Merge se CI verde e sem conflito |

## Restrições de Escopo

- **SINGU** (pgxfvjmuubutbowutlide, doufsxqlfjyuvxuezpln): READ-ONLY, nenhuma PR que escreva neles
- **Main branch**: nunca commit direto, force-push ou edição de workflows
- **Edge functions**: deploy automático via `deploy-functions.yml` após merge em main
- **Banco de produção**: migrations só pelo fluxo arquivo → PR → merge → db-migrate.yml

## Ordem de Merge

1. PR #2864 (restaurar test suite — desbloqueia CI de todas as outras PRs)
2. PRs de fix urgentes não-conflitantes em paralelo
3. PRs de chore/docs em paralelo após CI verde
