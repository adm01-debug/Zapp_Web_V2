# IA-017 — Allowlist de segredos por provedor

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Allowlist de segredos por provedor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Só secrets aprovados vinculados ao destino
- **Existe hoje** (evidência da auditoria): requireSecret lê qualquer Deno.env pelo nome cadastrado (_shared/ai-generate.ts:483-489,565)
- **Falta**: Lista fechada nome↔destino
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Admin pode, por erro, mandar segredo de infraestrutura a terceiro

## Dependências

Nenhuma registrada.

## Critério de aceite

- Só secrets aprovados vinculados ao destino
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).