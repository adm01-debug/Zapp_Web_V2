# CT-082 — Trocar responsável 1 a 1 com histórico

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Trocar responsável 1 a 1 com histórico.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Com histórico
- **Existe hoje** (evidência da auditoria): Atribuição em massa sem histórico (BulkActionsBar.tsx:123)
- **Falta**: Histórico + 1 a 1
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem rastreio de troca de carteira

## Dependências

Nenhuma registrada.

## Critério de aceite

- Com histórico
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).