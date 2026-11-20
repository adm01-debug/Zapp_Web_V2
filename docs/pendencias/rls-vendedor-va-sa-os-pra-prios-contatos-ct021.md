# CT-021 — RLS: vendedor vê só os próprios contatos

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

RLS: vendedor vê só os próprios contatos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Regra Q21/Q26 decidida pelo dono
- **Existe hoje** (evidência da auditoria): can_edit_contact ainda inclui membro de fila (20260929810000); CT-022 mediu que 2 vendedores veem 3.098 de 3.106 contatos
- **Falta**: Migration local + RLS por papel + decisão sobre 318 sem dono e 0 departamentos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Hoje qualquer vendedor da fila enxerga a carteira inteira

## Dependências

Decisão do dono (carteiras, departamentos); só local até autorização

## Critério de aceite

- Regra Q21/Q26 decidida pelo dono
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).