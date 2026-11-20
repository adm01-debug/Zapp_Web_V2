# X130 — Botões na campanha

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)

## Descrição e origem

Botões na campanha.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Edição/prévia/fallback
- **Existe hoje** (evidência da auditoria): Nada
- **Falta**: Tudo
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem CTA

## Dependências

X063, X064

## Critério de aceite

- Edição/prévia/fallback
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).