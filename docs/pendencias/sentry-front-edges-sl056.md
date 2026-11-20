# SL-056 — Sentry front + edges

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos

## Descrição e origem

Sentry front + edges.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: SDK, túnel, release tagging, breadcrumbs catalog.
- **Existe hoje** (evidência da auditoria): src/components/integrations/SentryIntegrationView.tsx:33-36 diz "não existe integração real"; 0 @sentry; erro do front vai para audit_logs (errorReporter)
- **Falta**: Escolher Sentry/GlitchTip e instrumentar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Erros em produção sem stack nem alerta

## Dependências

decisão do dono

## Critério de aceite

- SDK, túnel, release tagging, breadcrumbs catalog.
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).