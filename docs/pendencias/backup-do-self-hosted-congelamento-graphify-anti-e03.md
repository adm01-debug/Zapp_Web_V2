# E03 — Backup do self-hosted, congelamento, graphify antigo

- **Estado**: JÁ PRONTO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.4 Plano de Banco Único (201) — trilha "banco único" Singu

## Descrição e origem

Backup do self-hosted, congelamento, graphify antigo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.4 Plano de Banco Único (201) — trilha "banco único" Singu).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): JÁ PRONTO.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): baseline divergente / superado
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).