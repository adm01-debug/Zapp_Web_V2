# X041 — Negócio ganho vira conversão; receita e ROI

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)

## Descrição e origem

Negócio ganho vira conversão; receita e ROI.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: talkx_attribute_purchases na janela
- **Existe hoje** (evidência da auditoria): talkx_conversions existe (X021); 0 ocorrências de talkx_attribute_purchases
- **Falta**: Atribuição + receita
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Relatório não mostra quanto a campanha vendeu

## Dependências

X039

## Critério de aceite

- talkx_attribute_purchases na janela
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).