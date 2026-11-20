# SL-206 — Presets de filtros e deep link ?contact=/?message= na Inbox

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)

## Descrição e origem

Presets de filtros e deep link ?contact=/?message= na Inbox.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: salvar filtros; link direto
- **Existe hoje** (evidência da auditoria): useSavedFilters só exportado em src/hooks/chat/index.ts:17 (sem uso); deep link só no Catálogo
- **Falta**: Ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não dá para compartilhar link de conversa

## Dependências

Nenhuma registrada.

## Critério de aceite

- salvar filtros; link direto
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).