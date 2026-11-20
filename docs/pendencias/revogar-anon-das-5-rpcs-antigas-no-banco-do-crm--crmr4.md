# CRM-R4 — Revogar anon das 5 RPCs antigas no banco do CRM, rotacionar anon key, remover VITE_CLIENTES_

- **Estado**: BLOQUEADO
- **Prioridade**: P0
- **Anexo**: 04 · **Seção**: 3.6 CRM externo (Singu) — integração, sincronização e segurança

## Descrição e origem

Revogar anon das 5 RPCs antigas no banco do CRM, rotacionar anon key, remover VITE_CLIENTES_.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.6 CRM externo (Singu) — integração, sincronização e segurança).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Fechar exposição
- **Existe hoje** (evidência da auditoria): docs/crm-external-grants.md "GATE C — pendente"; nenhuma prova de revogação
- **Falta**: Primeiro conferir o corpo das 5 funções (checagens auth.jwt()/auth.role()), que está no banco do CRM e não foi lido; depois revogar no pgxfvjmuubtbowutlide
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Se as funções não tiverem checagem interna, qualquer portador da anon key pública lê ~57k empresas/48k clientes (exposição não confirmada)

## Dependências

Admin do CRM externo

## Critério de aceite

- Fechar exposição
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).