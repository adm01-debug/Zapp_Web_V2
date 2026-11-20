# F65 — Edge multiplix-prepare-voice

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.19 Multiplix — plano de finalização (F01–F100)

## Descrição e origem

Edge multiplix-prepare-voice.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.19 Multiplix — plano de finalização (F01–F100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Fila de TTS por roteiro distinto
- **Existe hoje** (evidência da auditoria): Nada
- **Falta**: Edge
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem voz IA

## Dependências

Nenhuma registrada.

## Critério de aceite

- Fila de TTS por roteiro distinto
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).