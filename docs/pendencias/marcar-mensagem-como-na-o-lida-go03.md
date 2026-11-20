# GO-03 — Marcar mensagem como não lida

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram

## Descrição e origem

Marcar mensagem como não lida.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: /chat/markMessageAsUnread → sem rota (evolution-api/index.ts:866)
- **Existe hoje** (evidência da auditoria): Sim. Dois menus: src/components/inbox/MessageContextActions.tsx:100-112, 170 e src/components/inbox/chat/MessageHoverToolbar.tsx:92-99, 170
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O atendente clica e recebe erro

## Dependências

Nenhuma registrada.

## Critério de aceite

- /chat/markMessageAsUnread → sem rota (evolution-api/index.ts:866)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).