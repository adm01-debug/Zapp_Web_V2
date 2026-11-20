# F97 — GATE C (RPCs antigas do Singu com anon)

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

GATE C (RPCs antigas do Singu com anon).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Revogar grants
- **Existe hoje** (evidência da auditoria): docs/multiplix/PONTE_SINGU.md §7
- **Falta**: Decisão + DDL no Singu
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dados de terceiros expostos por chave anônima

## Dependências

dono / banco de terceiro

## Critério de aceite

- Revogar grants
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).