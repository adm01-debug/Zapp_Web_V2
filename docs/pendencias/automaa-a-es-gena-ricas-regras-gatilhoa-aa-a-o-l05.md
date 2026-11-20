# L-05 — Automações genéricas (regras gatilho→ação)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 08 · **Seção**: 3.2 Automação, chatbot e atendimento automático

## Descrição e origem

Automações genéricas (regras gatilho→ação).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.2 Automação, chatbot e atendimento automático).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 19.1, IMPROVEMENT P2.10, FORGOTTEN 3.11
- **Existe hoje** (evidência da auditoria): CRUD em automations (src/components/automations/useAutomations.ts:29,40,62); nenhum executor em functions/migrations (só cadastro)
- **Falta**: executor de trigger_type/actions
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Regras salvas não fazem nada; gestor acredita que estão rodando

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 19.1, IMPROVEMENT P2.10, FORGOTTEN 3.11
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).