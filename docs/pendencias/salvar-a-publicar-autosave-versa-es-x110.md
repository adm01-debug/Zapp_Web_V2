# X110 — Salvar × Publicar, autosave, versões

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)

## Descrição e origem

Salvar × Publicar, autosave, versões.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Rascunho separado
- **Existe hoje** (evidência da auditoria): Botão único "Publicar segmento/Salvar" (TalkXSegmentBuilder.tsx:118)
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mudança vai direto para campanhas

## Dependências

X101

## Critério de aceite

- Rascunho separado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).