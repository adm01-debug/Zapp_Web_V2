# L-25 — Integração Bitrix24 (configuração pela tela)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.6 Contatos, CRM e Catálogo

## Descrição e origem

Integração Bitrix24 (configuração pela tela).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.6 Contatos, CRM e Catálogo).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: CSF 30.5 "bidirecional" ✅
- **Existe hoje** (evidência da auditoria): URL/domínio digitados ficam só em useState e são ignorados; o teste chama a Edge com o segredo do servidor (src/components/integrations/BitrixIntegrationView.tsx:13-14,28-30)
- **Falta**: persistir/validar config ou retirar os campos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Admin acha que configurou e não configurou

## Dependências

segredo BITRIX_WEBHOOK_URL

## Critério de aceite

- CSF 30.5 "bidirecional" ✅
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).