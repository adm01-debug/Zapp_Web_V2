# CT-023 — Lote Singu com campos novos

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Lote Singu com campos novos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Cargo, depto, apelido, último pedido, ativo
- **Existe hoje** (evidência da auditoria): contactLookupBatch devolve 8 campos (useExternalContact360Batch.ts)
- **Falta**: Campos novos no lote
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Singu (CT-111)

## Critério de aceite

- Cargo, depto, apelido, último pedido, ativo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).