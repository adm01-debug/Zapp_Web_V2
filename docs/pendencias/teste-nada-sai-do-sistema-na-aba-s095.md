# S095 — Teste "nada sai do sistema" na aba

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11

## Descrição e origem

Teste "nada sai do sistema" na aba.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.5 Journey histórico completo (07/10) — S001–S100 + K01–K11).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Substitui exportar (D11)
- **Existe hoje** (evidência da auditoria): nada
- **Falta**: Teste
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Regra permanente sem guarda

## Dependências

Nenhuma registrada.

## Critério de aceite

- Substitui exportar (D11)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).