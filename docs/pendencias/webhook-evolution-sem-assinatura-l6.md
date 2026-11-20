# L6 — Webhook Evolution sem assinatura

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)

## Descrição e origem

Webhook Evolution sem assinatura.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: strictMode
- **Existe hoje** (evidência da auditoria): evolution-webhook/index.ts:33-35,127 (GO não assina)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Fornecedor Evolution GO

## Critério de aceite

- strictMode
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).