# IA-054 — Quota por ação (não por linha de log)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Quota por ação (não por linha de log).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Separar ação, tentativa e cobrança na quota
- **Existe hoje** (evidência da auditoria): contaParaQuota existe (ai-usage.ts:1077) mas a guarda conta linhas de ai_usage_logs e falha aberta em erro (_shared/ai-guards.ts:224-245)
- **Falta**: Usar a regra na guarda; decidir fail-open
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Tentativas/fallback queimam a cota do usuário; erro de infra libera gasto

## Dependências

Nenhuma registrada.

## Critério de aceite

- Separar ação, tentativa e cobrança na quota
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).