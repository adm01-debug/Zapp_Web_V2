# IA-070 — Detectar análise desatualizada

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Detectar análise desatualizada.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Fingerprint e rótulo "desatualizada"
- **Existe hoje** (evidência da auditoria): Versão de contexto atômica na gravação (20261006160117_ai_context_version_atomic_persist.sql)
- **Falta**: Fingerprint + rótulo na UI
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Análise velha parece atual

## Dependências

Nenhuma registrada.

## Critério de aceite

- Fingerprint e rótulo "desatualizada"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).