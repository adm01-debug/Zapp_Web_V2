# A11Y-CRM-02 — Abas da conversa sem nome < 1536 px

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Abas da conversa sem nome < 1536 px.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: aria-label={tab.label}
- **Existe hoje** (evidência da auditoria): ConversationTabs.tsx:60-64 sem aria-label; rótulo hidden 2xl:inline (:86)
- **Falta**: 1 linha
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

8 abas anunciadas sem nome

## Dependências

Nenhuma registrada.

## Critério de aceite

- aria-label={tab.label}
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).