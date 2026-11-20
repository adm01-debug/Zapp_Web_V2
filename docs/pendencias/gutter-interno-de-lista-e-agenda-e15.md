# E15 — Gutter interno de Lista e Agenda

- **Estado**: DIVERGENTE
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.2 Fusão Quadro→Tarefas (50)

## Descrição e origem

Gutter interno de Lista e Agenda.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.2 Fusão Quadro→Tarefas (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: Com tasks em layout:'full', Lista e Agenda recebem o padding por dentro
- **Existe hoje** (evidência da auditoria): tasks virou layout:'full' (src/services/navigation.service.ts:63); ViewContainer não aplica wrapper (src/components/layout/ViewContainer.tsx:33); a raiz do módulo não tem padding (src/components/tasks/TasksModule.tsx:235); nenhum layout-gutter em TasksListMode/TasksAgendaMode
- **Falta**: Padding/scroll nas raízes de Lista, Agenda, cabeçalho e KPIs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Tela de Tarefas encostada nas bordas: regressão visual

## Dependências

Nenhuma registrada.

## Critério de aceite

- Com tasks em layout:'full', Lista e Agenda recebem o padding por dentro
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).