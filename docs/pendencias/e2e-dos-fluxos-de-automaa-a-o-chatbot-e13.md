# E-13 — E2E dos fluxos de automação/chatbot

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)

## Descrição e origem

E2E dos fluxos de automação/chatbot.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.10 Engenharia (100 etapas Cline, REFACTORING_REPORT, ADRs, audit_report)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: audit_report "Recomendações críticas" #2
- **Existe hoje** (evidência da auditoria): e2e/ não tem spec de chatbot/automação
- **Falta**: specs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo (o motor nem existe — L-04/L-05)

## Dependências

L-04

## Critério de aceite

- audit_report "Recomendações críticas" #2
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).