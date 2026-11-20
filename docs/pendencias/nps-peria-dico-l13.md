# L-13 — NPS periódico

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.3 Satisfação (CSAT/NPS)

## Descrição e origem

NPS periódico.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.3 Satisfação (CSAT/NPS)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: FORGOTTEN 3.12
- **Existe hoje** (evidência da auditoria): NPS só manual pelo agente (src/hooks/business/useNPSSurveys.ts:64-85, survey_type: 'manual')
- **Falta**: disparo periódico ao cliente
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem medição de lealdade

## Dependências

Nenhuma registrada.

## Critério de aceite

- FORGOTTEN 3.12
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).