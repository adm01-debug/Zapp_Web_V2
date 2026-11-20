# IA-127 — Governança de vozes

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Governança de vozes.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Vozes autorizadas, dono, revogação
- **Existe hoje** (evidência da auditoria): Criação exige admin/supervisor (elevenlabs-voice-design/index.ts:76-86); voice_id livre em TTS/STS (_shared/schemas.ts:169)
- **Falta**: Allowlist de vozes
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Uso de voz clonada não autorizada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Vozes autorizadas, dono, revogação
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).