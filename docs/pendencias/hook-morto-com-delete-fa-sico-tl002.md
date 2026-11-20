# TL-002 — Hook morto com DELETE físico

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.21 3ª leva — cartões sem X/F correspondente

## Descrição e origem

Hook morto com DELETE físico.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.21 3ª leva — cartões sem X/F correspondente).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Remover/converter
- **Existe hoje** (evidência da auditoria): useTalkXSuppression.ts:38-110 (.delete() :94), sem consumidor
- **Falta**: Remover
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Risco de alguém reusar e apagar sem trilha

## Dependências

Nenhuma registrada.

## Critério de aceite

- Remover/converter
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).