# L-20 — Pipeline de Vendas (Kanban de negócios)

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.6 Contatos, CRM e Catálogo

## Descrição e origem

Pipeline de Vendas (Kanban de negócios).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.6 Contatos, CRM e Catálogo).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: FORGOTTEN #3, CSF 37 (SalesPipelineView)
- **Existe hoje** (evidência da auditoria): Tela removida; ?view=pipeline redireciona para Tarefas (src/hooks/system/useNavigationHistory.ts:115-121, CHANGELOG 07/10); sales_deals/deal_activities só lidos no Contato 360/Histórico (src/components/inbox/tabs/OpenDealsList.tsx); pipeline_stages não existe mais no catálogo
- **Falta**: atualizar docs (ou reabrir gestão de negócios)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Docs vendem um CRM de negócios que não existe

## Dependências

decisão de produto

## Critério de aceite

- FORGOTTEN #3, CSF 37 (SalesPipelineView)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).