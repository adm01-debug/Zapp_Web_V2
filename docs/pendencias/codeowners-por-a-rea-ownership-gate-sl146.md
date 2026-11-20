# SL-146 — CODEOWNERS por área + ownership-gate

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos

## Descrição e origem

CODEOWNERS por área + ownership-gate.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.5 Paridade V1/V3 (100) — blocos da área (1, 2, 4, 5, 6, 10); blocos 3/7/8/9 resumidos).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Dono por área efetivo
- **Existe hoje** (evidência da auditoria): .github/CODEOWNERS todas as áreas → @adm01-debug; sem revisão obrigatória
- **Falta**: 2º colaborador
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Nenhuma revisão humana obrigatória

## Dependências

contratação/conta

## Critério de aceite

- Dono por área efetivo
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).