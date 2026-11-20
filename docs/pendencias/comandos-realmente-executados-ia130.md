# IA-130 — Comandos realmente executados

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)

## Descrição e origem

Comandos realmente executados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Mudança observável, não só toast
- **Existe hoje** (evidência da auditoria): src/components/layout/VoiceActionBridge.tsx + src/hooks/voice/voiceActionPlan.ts (navega)
- **Falta**: Buscar/filtrar/ordenar ligados ao estado
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

- Mudança observável, não só toast
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).