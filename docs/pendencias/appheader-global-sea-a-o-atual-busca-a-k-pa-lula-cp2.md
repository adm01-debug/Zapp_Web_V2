# CP2 — AppHeader global (seção atual, busca ⌘K, pílula do usuário)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.10 Design System Promo Gifts (CP0–CP12 / PROMPT_FASES_2_12)

## Descrição e origem

AppHeader global (seção atual, busca ⌘K, pílula do usuário).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.10 Design System Promo Gifts (CP0–CP12 / PROMPT_FASES_2_12)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: header sticky h-14
- **Existe hoje** (evidência da auditoria): nenhum AppHeader/HeaderSectionAnchor/GlobalSearchTrigger/HeaderUserPill em src (grep); só RoleBadge/ProfileMenuContent existem
- **Falta**: Implementar ou cancelar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem cabeçalho global de navegação/busca

## Dependências

dono

## Critério de aceite

- header sticky h-14
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).