# F43 — Contrato de reação

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Contrato de reação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: boolean (F) / {reacted} (TC)
- **Existe hoje** (evidência da auditoria): RPC devolve jsonb {action,emoji} (20260930260000:63-73); front nem usa a RPC
- **Falta**: Decidir contrato
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

decisão

## Critério de aceite

- boolean (F) / {reacted} (TC)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).