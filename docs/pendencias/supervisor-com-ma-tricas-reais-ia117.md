# IA-117 — Supervisor com métricas reais

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Supervisor com métricas reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Backlog, espera, SLA no contexto
- **Existe hoje** (evidência da auditoria): Contexto declara "Não medido: SLA, backlog…" (src/components/admin/SupervisorCopilot.tsx:46-55) mas a tela sugere justamente essas perguntas (:17-18)
- **Falta**: Alimentar com métricas reais
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Copiloto responde "não disponível" às perguntas que ele mesmo sugere

## Dependências

Nenhuma registrada.

## Critério de aceite

- Backlog, espera, SLA no contexto
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).