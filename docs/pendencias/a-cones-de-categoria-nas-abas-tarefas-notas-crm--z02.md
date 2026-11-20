# Z02 — Ícones de categoria nas abas Tarefas/Notas/CRM 360°

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.4 Consistência de design (Z01–Z03)

## Descrição e origem

Ícones de categoria nas abas Tarefas/Notas/CRM 360°.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.4 Consistência de design (Z01–Z03)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Reusar CATEGORY_META
- **Existe hoje** (evidência da auditoria): CATEGORY_META só em src/lib/journey/model.ts
- **Falta**: Aplicar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Inconsistência visual

## Dependências

Nenhuma registrada.

## Critério de aceite

- Reusar CATEGORY_META
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).