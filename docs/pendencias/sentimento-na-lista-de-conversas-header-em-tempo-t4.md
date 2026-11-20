# T4 — Sentimento na lista de conversas/header em tempo real

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 02 · **Seção**: 3.3 Prompt Lovable — Painel de Inteligência Comercial

## Descrição e origem

Sentimento na lista de conversas/header em tempo real.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.3 Prompt Lovable — Painel de Inteligência Comercial).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Emoji na lista, cor no header
- **Existe hoje** (evidência da auditoria): Nada em src/components/inbox/conversation-list
- **Falta**: Implementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Emoji na lista, cor no header
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).