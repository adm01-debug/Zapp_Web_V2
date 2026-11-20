# EVO-2 — Pressão de contato

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.20 Multiplix — evoluções da especificação (sem ID no plano)

## Descrição e origem

Pressão de contato.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.20 Multiplix — evoluções da especificação (sem ID no plano)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Alertar contato já acionado
- **Existe hoje** (evidência da auditoria): Nada (§5.2)
- **Falta**: Fonte única de histórico
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Cliente acionado em excesso

## Dependências

F85

## Critério de aceite

- Alertar contato já acionado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).