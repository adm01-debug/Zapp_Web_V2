# IA-012 — Identidades de serviço próprias

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Identidades de serviço próprias.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Credencial por cron/webhook/worker com escopo mínimo
- **Existe hoje** (evidência da auditoria): Cron de jobs usa x-cron-secret; transcrição automática chama ai-transcribe-audio com SUPABASE_SERVICE_ROLE_KEY (_shared/evolution-webhook-messages.ts:726-747)
- **Falta**: Identidade por serviço com escopo/expiração
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Vazamento da service role expõe tudo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Credencial por cron/webhook/worker com escopo mínimo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).