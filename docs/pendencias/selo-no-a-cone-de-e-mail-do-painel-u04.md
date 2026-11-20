# U04 — Selo no ícone de e-mail do painel

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.9 E-mail — alertas de não lido (U01–U12)

## Descrição e origem

Selo no ícone de e-mail do painel.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.9 E-mail — alertas de não lido (U01–U12)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Mesmo número
- **Existe hoje** (evidência da auditoria): ContactActionButtons.tsx:153-157 sem selo
- **Falta**: Ligar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

idem

## Dependências

U02

## Critério de aceite

- Mesmo número
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).