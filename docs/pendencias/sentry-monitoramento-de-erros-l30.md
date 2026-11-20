# L-30 — Sentry (monitoramento de erros)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Sentry (monitoramento de erros).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: FORGOTTEN #5; 100 etapas 046/073
- **Existe hoje** (evidência da auditoria): Tela demo (src/components/integrations/SentryIntegrationView.tsx:64,115); nenhum @sentry/ no package.json; source maps hidden (vite.config.ts:49)
- **Falta**: SDK + upload de source maps + release
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Erros em produção não chegam a ninguém

## Dependências

DSN

## Critério de aceite

- FORGOTTEN #5; 100 etapas 046/073
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).