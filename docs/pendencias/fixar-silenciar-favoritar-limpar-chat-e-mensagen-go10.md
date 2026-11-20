# GO-10 — Fixar, silenciar, favoritar, limpar chat e mensagens temporárias

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram

## Descrição e origem

Fixar, silenciar, favoritar, limpar chat e mensagens temporárias.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: O hook manda pin-chat, unpin-chat, mute-chat, star-message, clear-chat, set-disappearing (src/hooks/evolution/useEvolutionMessaging.ts:90-143), que não existem no roteador; travado por it.fails em src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts:390. A GO tem /chat/pin e /chat/mute
- **Existe hoje** (evidência da auditoria): Não (sem consumidor)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Oportunidade: a GO suporta fixar/silenciar

## Dependências

Nenhuma registrada.

## Critério de aceite

- O hook manda pin-chat, unpin-chat, mute-chat, star-message, clear-chat, set-disappearing (src/hooks/evolution/useEvolutionMessaging.ts:90-143), que não existem no roteador; travado por it.fails em src/hooks/evolution/__tests__/useEvolutionMessaging.test.ts:390. A GO tem /chat/pin e /chat/mute
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).