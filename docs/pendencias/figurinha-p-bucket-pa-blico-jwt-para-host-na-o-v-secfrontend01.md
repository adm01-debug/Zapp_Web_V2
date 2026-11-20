# SEC-FRONTEND-01 — Figurinha p/ bucket público; JWT para host não validado

- **Estado**: JÁ PRONTO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade

## Descrição e origem

Figurinha p/ bucket público; JWT para host não validado.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.9 Achados de segurança de 07/10 (Y24–Y29) — tratamento previsto no §5 do plano de qualidade).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): JÁ PRONTO.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): MessageBubble.tsx:38; useTalkXTemplates.ts:180
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