# RES-3 — Segurança: INSERT de tarefa com contact_id de qualquer contato

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.1 Tarefas — Plano de Finalização (100) e resíduos

## Descrição e origem

Segurança: INSERT de tarefa com contact_id de qualquer contato.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.1 Tarefas — Plano de Finalização (100) e resíduos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Mesmo predicado de visibilidade de contato no INSERT
- **Existe hoje** (evidência da auditoria): Trigger anti-falsificação só em BEFORE UPDATE (20260924110946; audit SEGURANCA_RLS_…:72-76); nenhuma migration posterior a 07/10 trata disso
- **Falta**: WITH CHECK ou trigger BEFORE INSERT com is_contact_visible_to_user
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agente pode vincular tarefa a cliente que não é dele

## Dependências

migration no lote diário

## Critério de aceite

- Mesmo predicado de visibilidade de contato no INSERT
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).