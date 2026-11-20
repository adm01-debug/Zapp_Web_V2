# SEC-ELEVEN — Replay/insert no webhook ElevenLabs (IA-WEBHOOK-001)

- **Estado**: JÁ PRONTO
- **Prioridade**: P3
- **Anexo**: 07 · **Seção**: 3.8 LGPD, backup, observabilidade e segurança operacional

## Descrição e origem

Replay/insert no webhook ElevenLabs (IA-WEBHOOK-001).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/07-infra-ci-banco-governanca.md` (3.8 LGPD, backup, observabilidade e segurança operacional).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): JÁ PRONTO.
- **Planejado**: dedupe + 5xx em falha
- **Existe hoje** (evidência da auditoria): elevenlabs-webhook/index.ts:8-23 (dedupe_key único)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- dedupe + 5xx em falha
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).