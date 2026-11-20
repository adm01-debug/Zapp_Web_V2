# ARQ-NP3 — Política D2 ("só dentro do ZAPP") nas bolhas do chat

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Política D2 ("só dentro do ZAPP") nas bolhas do chat.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Chat sem abrir URL assinada em nova aba
- **Existe hoje** (evidência da auditoria): src/components/inbox/MediaPreview.tsx:78-80 window.open(resolvedUrl,'_blank')
- **Falta**: Aplicar a mesma política
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Link assinado sai do sistema pelo chat, anulando a política da aba Arquivos

## Dependências

decisão D2 já tomada

## Critério de aceite

- Chat sem abrir URL assinada em nova aba
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).