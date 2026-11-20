# M-E30 — Rate limit nas edges expostas

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

## Descrição e origem

Rate limit nas edges expostas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Limite em todo webhook
- **Existe hoje** (evidência da auditoria): evolution-webhook, talkx-link, csp-report, auth-login, fetch-link-preview têm; elevenlabs-webhook, gmail-webhook, whatsapp-webhook, sync-call-records não (grep 0)
- **Falta**: Adicionar enforceRateLimit
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Abuso/custo nos webhooks públicos

## Dependências

Nenhuma registrada.

## Critério de aceite

- Limite em todo webhook
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).