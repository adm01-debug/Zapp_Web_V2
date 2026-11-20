# IA-066 — Métricas de tempo calculadas por código

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Métricas de tempo calculadas por código.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Espera/resposta/duração por timestamps
- **Existe hoje** (evidência da auditoria): Prompt pede ao modelo "considerar tempo de resposta" (ai-conversation-analysis/index.ts:124); nenhum cálculo
- **Falta**: Calcular no servidor e passar ao modelo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Tempo de resposta "inventado" pelo modelo

## Dependências

Nenhuma registrada.

## Critério de aceite

- Espera/resposta/duração por timestamps
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).