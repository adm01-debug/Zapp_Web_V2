# F87 — Push → abre conversa / ?cid= na URL

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Push → abre conversa / ?cid= na URL.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: notificationclick + cid
- **Existe hoje** (evidência da auditoria): Sem leitura de cid em TeamChatView.tsx; push desligado por decisão (cartões, PLANO_SEGUNDA_LEVA_CARTOES:7)
- **Falta**: cid na URL pode ser feito já
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Link para conversa não existe

## Dependências

decisão (push)

## Critério de aceite

- notificationclick + cid
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).