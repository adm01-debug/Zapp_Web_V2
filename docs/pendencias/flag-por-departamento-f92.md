# F92 — Flag por departamento

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

Flag por departamento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: multiplix_enabled_departments
- **Existe hoje** (evidência da auditoria): HANDOFF §6: manter kill switch por permissão
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

decisão 08/10

## Critério de aceite

- multiplix_enabled_departments
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).