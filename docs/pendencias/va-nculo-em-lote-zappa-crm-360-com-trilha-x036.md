# X036 — Vínculo em lote ZAPP↔CRM 360 com trilha

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)

## Descrição e origem

Vínculo em lote ZAPP↔CRM 360 com trilha.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Job em lotes + talkx_data_jobs/talkx_crm_link_issues
- **Existe hoje** (evidência da auditoria): crm_contact_links existe; 0 ocorrências de talkx_data_jobs/talkx_data_sync_runs/talkx_crm_link_issues em migrations
- **Falta**: Job, tabelas, métricas
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Público "clientes do CRM" não se resolve

## Dependências

Nenhuma registrada.

## Critério de aceite

- Job em lotes + talkx_data_jobs/talkx_crm_link_issues
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).