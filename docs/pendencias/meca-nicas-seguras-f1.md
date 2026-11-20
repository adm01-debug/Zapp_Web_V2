# F1 — Mecânicas seguras

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.3 Dívida de lint (6 fatias)

## Descrição e origem

Mecânicas seguras.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.3 Dívida de lint (6 fatias)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: 10 → 0
- **Existe hoje** (evidência da auditoria): use-memo 3 + incompatible-library 2
- **Falta**: 5 casos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

Nenhuma registrada.

## Critério de aceite

- 10 → 0
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).