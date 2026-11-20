# E91 — Alerta de custo por e-mail

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.5 Mapa / Search Box — Finalização (100)

## Descrição e origem

Alerta de custo por e-mail.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.5 Mapa / Search Box — Finalização (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: E-mail + app
- **Existe hoje** (evidência da auditoria): Cron searchbox-budget-alert + edge supabase/functions/searchbox-budget-alert; o e-mail falha fechado com 403
- **Falta**: Segredo searchbox_alert_cron_secret (Vault) + CRON_SECRET
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Só o aviso no app funciona

## Dependências

Joaquim (segredos)

## Critério de aceite

- E-mail + app
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).