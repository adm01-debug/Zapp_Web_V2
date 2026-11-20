# SL-198 — Timeline de envio por mensagem

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)

## Descrição e origem

Timeline de envio por mensagem.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: painel no balão
- **Existe hoje** (evidência da auditoria): MessageSendHistorySheet.tsx:100 + messageSendTimeline.ts sem consumidor
- **Falta**: Montar no menu do balão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente não vê por que a mensagem falhou

## Dependências

Nenhuma registrada.

## Critério de aceite

- painel no balão
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).