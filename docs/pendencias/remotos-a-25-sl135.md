# SL-135 — Remotos ≤ 25

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

## Descrição e origem

Remotos ≤ 25.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: ≤25 branches remotos
- **Existe hoje** (evidência da auditoria): API: 54 branches (35 claude/ de 26/09–02/10, 10 hermes/, dia/2026-10-07 e dia/2026-10-08 já squash-mergeados)
- **Falta**: Podar mergeados/abandonados
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Confusão sobre trabalho vivo; viola CLAUDE.md §3

## Dependências

guarda proíbe agente

## Critério de aceite

- ≤25 branches remotos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).