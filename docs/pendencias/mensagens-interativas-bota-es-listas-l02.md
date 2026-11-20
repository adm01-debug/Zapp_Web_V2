# L-02 — Mensagens interativas (botões/listas)

- **Estado**: DIVERGENTE
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.1 Inbox / Chat

## Descrição e origem

Mensagens interativas (botões/listas).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.1 Inbox / Chat).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: IMPROVEMENT P2.6 ✅; CSF lista botões/listas na Evolution
- **Existe hoje** (evidência da auditoria): Builder abre (ChatDialogs.tsx:9), Edge tem rotas send-list/send-buttons (supabase/functions/evolution-api/index.ts:861-862, _shared/evolution-go-routes.ts:129-139), mas o handler sempre lança ENVIO_INTERATIVO_INDISPONIVEL (src/components/inbox/chat/useChatPanelHandlers.ts:74-75,421); clique em botão só faz toast (:424-425)
- **Falta**: publicar o transporte (handler → Edge) e tratar resposta de botão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Vendedor não consegue mandar menu/botões ao cliente

## Dependências

validar suporte de botões na Evolution GO

## Critério de aceite

- IMPROVEMENT P2.6 ✅; CSF lista botões/listas na Evolution
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).