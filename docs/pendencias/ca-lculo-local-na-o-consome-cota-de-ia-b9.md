# B9 — Cálculo local não consome cota de IA

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)

## Descrição e origem

Cálculo local não consome cota de IA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.2 Registro de achados IA-003 / lacunas IA-004 (residuais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Churn/classificação fora da quota
- **Existe hoje** (evidência da auditoria): registrarAcaoCalculada grava linha que conta na quota de 500/dia (_shared/ai-usage.ts:1211; ai-guards.ts:229-240)
- **Falta**: Excluir ações calculadas da quota
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Usuário perde cota de IA real com cálculo local

## Dependências

Nenhuma registrada.

## Critério de aceite

- Churn/classificação fora da quota
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).