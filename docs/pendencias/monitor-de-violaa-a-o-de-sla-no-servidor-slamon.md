# SLA-MON — Monitor de violação de SLA no servidor

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.4 Filas, SLA, War Room e Distribuição

## Descrição e origem

Monitor de violação de SLA no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.4 Filas, SLA, War Room e Distribuição).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Alerta sem depender de tela aberta
- **Existe hoje** (evidência da auditoria): O monitor roda no navegador a cada 60s com JWT de admin/supervisor (src/hooks/business/useWarRoomAlerts.ts; MODULO_CATALOGO…:259)
- **Falta**: Job no servidor (pg_cron/edge)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem admin com o painel aberto, ninguém recebe alerta de SLA

## Dependências

Nenhuma registrada.

## Critério de aceite

- Alerta sem depender de tela aberta
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).