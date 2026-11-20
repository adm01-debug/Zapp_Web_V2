# F46 — Sair/remover membro com promoção de dono

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Sair/remover membro com promoção de dono.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Último owner + promoção
- **Existe hoje** (evidência da auditoria): RPCs usam coluna inexistente tcm.role (20261003272707:1017,1035,1313); front faz DELETE direto (useTeamChatMutations.ts:168,190)
- **Falta**: Corrigir RPC e migrar front
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Grupo pode ficar sem dono

## Dependências

Nenhuma registrada.

## Critério de aceite

- Último owner + promoção
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).