# E18 — Teste dedicado do helper de etiquetas

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.6 Remoção de Etiquetas (100)

## Descrição e origem

Teste dedicado do helper de etiquetas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.6 Remoção de Etiquetas (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Teste nominal de isWhatsAppTag/parseWhatsAppTag/filterCustomTags
- **Existe hoje** (evidência da auditoria): src/lib/tags.ts:1-22 sem nenhum teste que o importe
- **Falta**: Teste
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Regressão em wa: passaria sem aviso

## Dependências

Nenhuma registrada.

## Critério de aceite

- Teste nominal de isWhatsAppTag/parseWhatsAppTag/filterCustomTags
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).