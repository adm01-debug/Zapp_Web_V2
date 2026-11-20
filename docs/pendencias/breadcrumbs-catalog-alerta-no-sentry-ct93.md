# CT-93 — Breadcrumbs catalog. + alerta no Sentry

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Breadcrumbs catalog. + alerta no Sentry.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Sentry
- **Existe hoje** (evidência da auditoria): Não há SDK do Sentry no app (@sentry ausente; só um formulário de DSN em src/components/integrations/SentryIntegrationView.tsx:81)
- **Falta**: SDK + alerta
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Falha do PromoGifts não alerta ninguém

## Dependências

Sentry / Joaquim

## Critério de aceite

- Sentry
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).