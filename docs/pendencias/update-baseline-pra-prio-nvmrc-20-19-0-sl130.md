# SL-130 — --update-baseline próprio / .nvmrc 20.19.0

- **Estado**: NÃO VERIFICÁVEL
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.6 Pendências do Dono (08/10) — itens da área

## Descrição e origem

--update-baseline próprio / .nvmrc 20.19.0.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.6 Pendências do Dono (08/10) — itens da área).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO VERIFICÁVEL.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): .nvmrc = 24 e toolchain.json node 24 (cartão contradiz o toolchain)
- **Falta**: Reavaliar cartão
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).