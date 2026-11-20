# Y16-01 — Botões Lista/Quadro/Agenda sem nome no celular

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.1 Tarefas — Plano de Finalização (100) e resíduos

## Descrição e origem

Botões Lista/Quadro/Agenda sem nome no celular.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.1 Tarefas — Plano de Finalização (100) e resíduos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: aria-label nos botões
- **Existe hoje** (evidência da auditoria): Rótulo só hidden sm:inline, sem aria-label (src/components/tasks/shared/ModeSwitcher.tsx:46)
- **Falta**: aria-label
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Leitor de tela anuncia "botão" sem nome

## Dependências

Nenhuma registrada.

## Critério de aceite

- aria-label nos botões
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).