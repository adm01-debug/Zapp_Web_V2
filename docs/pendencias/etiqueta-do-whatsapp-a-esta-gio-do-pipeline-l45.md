# L-45 — Etiqueta do WhatsApp → estágio do pipeline

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.9 Telefonia e webhooks

## Descrição e origem

Etiqueta do WhatsApp → estágio do pipeline.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.9 Telefonia e webhooks).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: EVOLUTION_WEBHOOKS_DOCUMENTATION §10.2 ("usado para sincronizar o Pipeline de Vendas")
- **Existe hoje** (evidência da auditoria): handleLabelsAssociation só grava tag wa:<id>:<nome> (supabase/functions/_shared/evolution-webhook-handlers.ts:273-295)
- **Falta**: — (pipeline foi removido; L-20)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

L-20

## Critério de aceite

- EVOLUTION_WEBHOOKS_DOCUMENTATION §10.2 ("usado para sincronizar o Pipeline de Vendas")
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).