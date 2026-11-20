# 100 — Verificação final em produção

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.1 Tarefas — Plano de Finalização (100) e resíduos

## Descrição e origem

Verificação final em produção.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.1 Tarefas — Plano de Finalização (100) e resíduos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Conferência presencial
- **Existe hoje** (evidência da auditoria): Prints J-100 + cron tasks-notify-due ativo (STATUS:822)
- **Falta**: Conferência do dono
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Só aceite

## Dependências

Joaquim

## Critério de aceite

- Conferência presencial
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).