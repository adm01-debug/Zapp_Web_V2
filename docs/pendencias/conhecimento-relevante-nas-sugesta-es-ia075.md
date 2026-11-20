# IA-075 — Conhecimento relevante nas sugestões

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Conhecimento relevante nas sugestões.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Busca por relevância em vez dos primeiros artigos
- **Existe hoje** (evidência da auditoria): ai-suggest-reply/index.ts:65-68 pega 10 artigos publicados sem relevância
- **Falta**: Usar search_knowledge_base
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sugestão ignora o artigo certo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Busca por relevância em vez dos primeiros artigos
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).