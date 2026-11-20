# IA-059 — Retirar dado sensível dos logs

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Retirar dado sensível dos logs.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Redigir tokens, prompts, trechos de conversa
- **Existe hoje** (evidência da auditoria): tests/contracts/log-injection-sanitizacao.contract.test.ts (só injeção); nenhuma redação de PII/CPF em _shared/ai-/ai-proxy
- **Falta**: Redação + retenção + captura excepcional
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Risco LGPD em telemetria

## Dependências

Nenhuma registrada.

## Critério de aceite

- Redigir tokens, prompts, trechos de conversa
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).