# E67 — Cache do Bun

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)

## Descrição e origem

Cache do Bun.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.1 PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01 (vigente)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: actions/cache de ~/.bun/install/cache
- **Existe hoje** (evidência da auditoria): 0 ocorrências de cache do Bun nos 16 YAML
- **Falta**: Adicionar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Minutos de CI e espera de PR

## Dependências

Nenhuma registrada.

## Critério de aceite

- actions/cache de ~/.bun/install/cache
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).