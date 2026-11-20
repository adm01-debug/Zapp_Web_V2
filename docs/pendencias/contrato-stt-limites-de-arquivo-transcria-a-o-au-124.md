# 124 — Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)

## Descrição e origem

Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): Não auditado em profundidade nesta área
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Área IA

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).