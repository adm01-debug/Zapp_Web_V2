# IA-127 — Lista fechada de vozes/modelos TTS

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)

## Descrição e origem

Lista fechada de vozes/modelos TTS.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Só vozes autorizadas geram áudio
- **Existe hoje** (evidência da auditoria): supabase/functions/_shared/schemas.ts:169 aceita voice_id livre (máx. 100)
- **Falta**: Allowlist + revogação
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Qualquer voz (inclusive clonada) pode ser usada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Só vozes autorizadas geram áudio
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).