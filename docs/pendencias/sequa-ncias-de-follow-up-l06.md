# L-06 — Sequências de follow-up

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Sequências de follow-up.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #12, CSF 46
- **Existe hoje** (evidência da auditoria): CRUD (src/components/settings/FollowUpSequences.tsx:38,48,62) e histórico de execuções só leitura; nenhum produtor de followup_executions em functions/migrations
- **Falta**: executor com delay por passo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Follow-up comercial automático não é enviado

## Dependências

Nenhuma registrada.

## Critério de aceite

- FORGOTTEN #12, CSF 46
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).