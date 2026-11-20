# E-02 — Web Vitals oficial + coletor (RUM)

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)

## Descrição e origem

Web Vitals oficial + coletor (RUM).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: etapa 047; REVISAO 09-10 R09
- **Existe hoje** (evidência da auditoria): Sem pacote web-vitals no package.json; telemetria manual
- **Falta**: biblioteca oficial + destino
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Lentidão real dos usuários não medida

## Dependências

Nenhuma registrada.

## Critério de aceite

- etapa 047; REVISAO 09-10 R09
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).