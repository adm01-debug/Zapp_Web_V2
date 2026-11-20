# X169 — Compartilhar por link/e-mail

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.13 Talk X — Fase 12 · Relatório (X161–X169: 0 concluídos)

## Descrição e origem

Compartilhar por link/e-mail.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.13 Talk X — Fase 12 · Relatório (X161–X169: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Link interno + e-mail
- **Existe hoje** (evidência da auditoria): E-mail legado (E81)
- **Falta**: Link/menu
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

X163

## Critério de aceite

- Link interno + e-mail
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).