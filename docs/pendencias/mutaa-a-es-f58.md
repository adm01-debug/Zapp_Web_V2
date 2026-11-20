# F58 — Mutações

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Mutações.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: sonner, RPCs de pref/leave/transfer
- **Existe hoje** (evidência da auditoria): Mute por membership feito (useTeamChatPanel.ts:97-102); use-toast ainda em useTeamChatMutations.ts; rename por UPDATE direto
- **Falta**: Terminar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- sonner, RPCs de pref/leave/transfer
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).