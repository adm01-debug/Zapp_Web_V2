# C-14 — Agente de voz conversacional (ElevenLabs ConvAI)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 5. Achados fora dos planos (varredura de código)

## Descrição e origem

Agente de voz conversacional (ElevenLabs ConvAI).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (5. Achados fora dos planos (varredura de código)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: —
- **Existe hoje** (evidência da auditoria): Edge elevenlabs-agent-token sem chamador; @elevenlabs/react no package.json (:34) sem import em src
- **Falta**: decidir ou remover
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Custo de cota sem uso; dependência morta

## Dependências

Nenhuma registrada.

## Critério de aceite

- —
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).