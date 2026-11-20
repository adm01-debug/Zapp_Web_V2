# CT-088 — Retirar edição em massa; seleção limitada a 3

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Retirar edição em massa; seleção limitada a 3.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Decisão do dono
- **Existe hoje** (evidência da auditoria): Edição em massa (tags/atribuir/tipo) ainda existe em BulkActionsBar.tsx
- **Falta**: Remover
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Contraria decisão "nada de edição em massa"

## Dependências

Nenhuma registrada.

## Critério de aceite

- Decisão do dono
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).