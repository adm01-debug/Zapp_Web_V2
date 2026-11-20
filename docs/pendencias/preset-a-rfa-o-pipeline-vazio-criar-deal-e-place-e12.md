# E12 — Preset órfão "Pipeline vazio/Criar Deal" e placeholder da paleta

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.2 Fusão Quadro→Tarefas (50)

## Descrição e origem

Preset órfão "Pipeline vazio/Criar Deal" e placeholder da paleta.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.2 Fusão Quadro→Tarefas (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Remover o preset; placeholder "ex: tarefas, chatbot"
- **Existe hoje** (evidência da auditoria): Preset ainda presente (src/components/ui/EmptyState.tsx:70-76); placeholder "ex: pipeline, chatbot" (src/components/CommandPalette.tsx:97)
- **Falta**: Remover e trocar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

A paleta sugere um módulo que não existe mais

## Dependências

Nenhuma registrada.

## Critério de aceite

- Remover o preset; placeholder "ex: tarefas, chatbot"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).