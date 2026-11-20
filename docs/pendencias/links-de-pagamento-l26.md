# L-26 — Links de pagamento

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.7 Integrações e telas-fachada

## Descrição e origem

Links de pagamento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.7 Integrações e telas-fachada).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: FORGOTTEN #6, CSF 40
- **Existe hoje** (evidência da auditoria): CRUD (src/hooks/payments/usePaymentLinks.ts:36,62); tela avisa que /pay/<id> não tem provedor (src/components/payments/PaymentLinksView.tsx:114); menu "Em Desenvolvimento" (navigation.service.ts:136-142)
- **Falta**: provedor (PIX/cartão), rota de checkout, webhook de baixa
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não cobra ninguém

## Dependências

escolha de provedor/credenciais

## Critério de aceite

- FORGOTTEN #6, CSF 40
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).