# F47 — set_profile_department, request_department_access, notify_team_mentions

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

set_profile_department, request_department_access, notify_team_mentions.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: 3 RPCs
- **Existe hoje** (evidência da auditoria): Nenhuma existe (grep 0 em migrations)
- **Falta**: Criar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem menção com notificação, sem pedido de acesso

## Dependências

Nenhuma registrada.

## Critério de aceite

- 3 RPCs
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).