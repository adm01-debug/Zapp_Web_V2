# EN-025 — Lista só por página no servidor

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.7 E-mail NAVY (100 EN / 80 AC)

## Descrição e origem

Lista só por página no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.7 E-mail NAVY (100 EN / 80 AC)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Filtro no servidor + cursor
- **Existe hoje** (evidência da auditoria): email-chat paginado; rota legada gmail (ViewRouter.tsx:89) usa full: true e baixa a caixa inteira (GmailInboxView.tsx:24, emailPagination.ts)
- **Falta**: Migrar/remover tela legada
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Lentidão/custo com caixas grandes

## Dependências

Nenhuma registrada.

## Critério de aceite

- Filtro no servidor + cursor
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).