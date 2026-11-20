# L-21 — Carrinho de compras e mensagem de pagamento PIX no chat

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.6 Contatos, CRM e Catálogo

## Descrição e origem

Carrinho de compras e mensagem de pagamento PIX no chat.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.6 Contatos, CRM e Catálogo).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: CSF 3.14, 13.5–13.7 ✅
- **Existe hoje** (evidência da auditoria): ShoppingCart, useShoppingCart, PaymentMessage removidos; ainda listados na doc in-app (src/components/docs/featuresSectionsData.ts:155)
- **Falta**: retirar dos docs ou reimplementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Promessa de e-commerce no chat sem entrega

## Dependências

Nenhuma registrada.

## Critério de aceite

- CSF 3.14, 13.5–13.7 ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).