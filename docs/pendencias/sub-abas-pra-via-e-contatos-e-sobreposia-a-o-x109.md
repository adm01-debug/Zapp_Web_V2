# X109 — Sub-abas "Prévia e Contatos" e "Sobreposição"

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)

## Descrição e origem

Sub-abas "Prévia e Contatos" e "Sobreposição".

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.10 Talk X — Fase 9 · Segmentos (X099–X117: 1 concluído, 18 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Tabela paginada e overlap
- **Existe hoje** (evidência da auditoria): Nada
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não se vê quem entra no segmento

## Dependências

X068

## Critério de aceite

- Tabela paginada e overlap
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).