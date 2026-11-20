# IA-082 — Documentos com versão e validade

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Documentos com versão e validade.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Dono, versão, vigência, aprovação
- **Existe hoje** (evidência da auditoria): knowledge_base_articles só tem title/content/category/tags/is_published (schema-catalog)
- **Falta**: Colunas + fluxo de aprovação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Política vencida responde cliente

## Dependências

Nenhuma registrada.

## Critério de aceite

- Dono, versão, vigência, aprovação
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).