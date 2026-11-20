# SL-201 — Recursos exclusivos da GO (mute/pin de chat, carrossel, link, enquetes, comunidades, newsletter)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)

## Descrição e origem

Recursos exclusivos da GO (mute/pin de chat, carrossel, link, enquetes, comunidades, newsletter).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: actions
- **Existe hoje** (evidência da auditoria): nada no front
- **Falta**: Implementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Funções do WhatsApp indisponíveis

## Dependências

Evolution GO

## Critério de aceite

- actions
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).