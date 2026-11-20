# GO-05 — Votos e resultado de enquete

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram

## Descrição e origem

Votos e resultado de enquete.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: GO tem /polls/{id}/results (não usado); pollUpdateMessage não é processado no webhook (só pollCreationMessage, evolution-media.ts:264)
- **Existe hoje** (evidência da auditoria): Envio de enquete sim (AdvancedMessageMenu.tsx:92-117); resultado não
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O agente manda a enquete e nunca vê a resposta

## Dependências

Nenhuma registrada.

## Critério de aceite

- GO tem /polls/{id}/results (não usado); pollUpdateMessage não é processado no webhook (só pollCreationMessage, evolution-media.ts:264)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).