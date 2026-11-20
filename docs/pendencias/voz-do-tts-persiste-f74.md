# F74 — Voz do TTS persiste

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Voz do TTS persiste.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Panel usa handleVoiceChange
- **Existe hoje** (evidência da auditoria): handleVoiceChange persiste (useTeamChatPanel.ts:121-135) mas o Panel passa s.tts.setVoiceId (TeamChatPanel.tsx:104)
- **Falta**: Trocar o callback
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Preferência de voz se perde no reload

## Dependências

Nenhuma registrada.

## Critério de aceite

- Panel usa handleVoiceChange
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).