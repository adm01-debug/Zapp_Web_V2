# IA-161 — Rascunho de campanha por IA

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Rascunho de campanha por IA.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Gerar rascunho no editor
- **Existe hoje** (evidência da auditoria): Edge talkx-ai (supabase/functions/talkx-ai/index.ts:1-28) sem tabela talkx_ai_requests (ausente em migrations/types) e sem consumidor em src/
- **Falta**: DDL + chaves talkx_settings + UI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Recurso existe só no backend, inoperante

## Dependências

DDL da "trilha de banco" do TalkX

## Critério de aceite

- Gerar rascunho no editor
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).