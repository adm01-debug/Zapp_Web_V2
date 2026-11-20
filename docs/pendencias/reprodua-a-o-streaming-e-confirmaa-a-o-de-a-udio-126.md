# 126 — Reprodução/streaming e confirmação de áudio enviado

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)

## Descrição e origem

Reprodução/streaming e confirmação de áudio enviado.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Estados separados gerado/prévia/enviado
- **Existe hoje** (evidência da auditoria): Testes novos VoiceChangerPicker.preview-send.test.tsx, playTtsAudio.ts alterado (#1900)
- **Falta**: Fechar aceite do bloco
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

- Estados separados gerado/prévia/enviado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).