# CT-004 — Fixtures Singu canônicas

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Fixtures Singu canônicas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Fixtures completo/incompleto/longo
- **Existe hoje** (evidência da auditoria): amostra em src/services/crm/singu-adapter.mock.ts:8-40 ("fixtures canônicas chegam no CT-004")
- **Falta**: Fixtures definitivas
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

CT-002

## Critério de aceite

- Fixtures completo/incompleto/longo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).