# X053 — Cabeçalho com trilha e indicador

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 01 · **Seção**: 3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)

## Descrição e origem

Cabeçalho com trilha e indicador.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.6 Talk X — Fase 5 · Kit, estados, modais, navegação (X042–X056: 6 concluídos, 9 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Breadcrumb + indicador
- **Existe hoje** (evidência da auditoria): "Ao vivo" e "Ajuda" (TalkXView.tsx:320-331); sem breadcrumb
- **Falta**: Breadcrumb
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Navegação menos clara

## Dependências

X052

## Critério de aceite

- Breadcrumb + indicador
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).