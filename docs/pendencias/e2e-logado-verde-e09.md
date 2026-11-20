# E09 — E2E logado verde

- **Estado**: DIVERGENTE
- **Prioridade**: P0
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

E2E logado verde.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: 3 specs vermelhos corrigidos ou em fixme com issue; 5 verdes seguidos
- **Existe hoje** (evidência da auditoria): e2e-logado.yml:49 timeout-minutes: 15; API: 60/60 últimos runs cancelled (03/10→09/10), último verde 02/10 (run 37040113129); check do HEAD 🎭 E2E logado = cancelled
- **Falta**: Aumentar timeout ou dividir projetos; obter 5 verdes
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Fluxos com login real (enviar, conversar, catálogo, Talk X) não são testados desde 02/10 — quebra em produção passa sem ninguém ver

## Dependências

Nenhuma registrada.

## Critério de aceite

- 3 specs vermelhos corrigidos ou em fixme com issue; 5 verdes seguidos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).