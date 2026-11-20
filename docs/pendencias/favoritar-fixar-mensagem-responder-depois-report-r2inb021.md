# R2-INB-021 — Favoritar/Fixar mensagem, Responder depois, Reportar, "Adicionar tag" no header, /note e /tag

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta"

## Descrição e origem

Favoritar/Fixar mensagem, Responder depois, Reportar, "Adicionar tag" no header, /note e /tag.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Itens existiam sem handler; foram removidos
- **Existe hoje** (evidência da auditoria): MessageHoverToolbar.tsx:160-166; ChatPanelHeader.tsx:186; slashCommandsData.ts:22; nenhuma tabela/hook de mensagem fixada/favorita
- **Falta**: Backend + UI se o negócio quiser
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente não consegue fixar/favoritar mensagem nem marcar para responder depois

## Dependências

decisão de produto

## Critério de aceite

- Itens existiam sem handler; foram removidos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).