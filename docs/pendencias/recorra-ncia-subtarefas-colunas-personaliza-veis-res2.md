# RES-2 — Recorrência, subtarefas, colunas personalizáveis, anexos, comentários, arrastar na Agenda, parser de linguagem natural, virtualização, push do navegador

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.1 Tarefas — Plano de Finalização (100) e resíduos

## Descrição e origem

Recorrência, subtarefas, colunas personalizáveis, anexos, comentários, arrastar na Agenda, parser de linguagem natural, virtualização, push do navegador.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.1 Tarefas — Plano de Finalização (100) e resíduos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: v2 do módulo
- **Existe hoje** (evidência da auditoria): nada (STATUS:805-809)
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Funções avançadas de produtividade ausentes

## Dependências

Nenhuma registrada.

## Critério de aceite

- v2 do módulo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).