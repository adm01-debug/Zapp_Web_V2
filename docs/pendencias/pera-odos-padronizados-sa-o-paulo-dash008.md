# DASH-008 — Períodos padronizados (São Paulo)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes

## Descrição e origem

Períodos padronizados (São Paulo).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.4 Plano Dashboard 100 etapas (vigente) — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Mesmo fuso em front/SQL/relatório
- **Existe hoje** (evidência da auditoria): RPC com fuso SP; hooks usam relógio local (useAIStats.ts:66-68, useSLAMetrics.ts:59-66)
- **Falta**: Fuso único
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Contagem "hoje" difere conforme o navegador

## Dependências

Nenhuma registrada.

## Critério de aceite

- Mesmo fuso em front/SQL/relatório
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).