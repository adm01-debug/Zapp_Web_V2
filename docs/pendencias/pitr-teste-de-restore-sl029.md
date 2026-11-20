# SL-029 — PITR + teste de restore

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 07 · **Seção**: 3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16

## Descrição e origem

PITR + teste de restore.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.2 PLANO_MELHORIAS_50_ETAPAS_2026-09-20 e PLANO_CORRECOES_50_ETAPAS_2026-09-16).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Evidência PITR + restore em ambiente descartável
- **Existe hoje** (evidência da auditoria): BACKUP-RECOVERY-STRATEGY.md:315-321 checklist 0/7; nenhum registro de restore
- **Falta**: Executar e documentar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem prova de que dá para recuperar dados após incidente

## Dependências

Joaquim (painel Supabase)

## Critério de aceite

- Evidência PITR + restore em ambiente descartável
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).