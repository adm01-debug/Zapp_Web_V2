# AG-08 — Rotacionar Bearer Lovable; command_allowlist e fail_closed dos hooks secundários

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 07 · **Seção**: 3.10 Programa de agentes (fábrica de cartões) e ferramentas

## Descrição e origem

Rotacionar Bearer Lovable; command_allowlist e fail_closed dos hooks secundários.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.10 Programa de agentes (fábrica de cartões) e ferramentas).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): AUDITORIA_AGENTES "Não aplicado"
- **Falta**: Decisão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agente com permissões amplas (git reset --hard, rm -r)

## Dependências

Joaquim

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).