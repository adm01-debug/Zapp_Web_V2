# SL-032 — approvals, audit prod bloqueante, husky, Node 24

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)

## Descrição e origem

approvals, audit prod bloqueante, husky, Node 24.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): audit-prod bloqueante (ci.yml:343), husky, Node 24 OK; approvals=0
- **Falta**: approvals (B)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

dono

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).