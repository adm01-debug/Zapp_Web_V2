# W4-1 — Inlinar predicado de visibilidade no search_contacts

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada

## Descrição e origem

Inlinar predicado de visibilidade no search_contacts.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.11 Auditorias Y14 (a11y), Y24 (RLS) e W4 (performance) — sem correção versionada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: -53% a -66%
- **Existe hoje** (evidência da auditoria): ainda chama can_edit_contact por linha (20260930450000:54)
- **Falta**: Migration
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Busca mais lenta com base grande

## Dependências

Nenhuma registrada.

## Critério de aceite

- -53% a -66%
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).