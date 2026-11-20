# 100 — Cache Playwright / artifacts

- **Estado**: JÁ PRONTO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)

## Descrição e origem

Cache Playwright / artifacts.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.7 Segunda leva — CI/DevOps, Performance e seleção infra/segurança (status do TSV é de 07/10; abaixo o estado no código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): JÁ PRONTO.
- **Planejado**: E68/E72
- **Existe hoje** (evidência da auditoria): ci.yml:386-404, ci.yml:241-247,284-290,421-428
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- E68/E72
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).