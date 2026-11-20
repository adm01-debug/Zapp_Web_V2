# X131 — Resumo da campanha calculado no servidor

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 01 · **Seção**: 3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)

## Descrição e origem

Resumo da campanha calculado no servidor.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.11 Talk X — Fase 10 · Criar, revisar e agendar (X118–X139: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Elegíveis, supressos, duração
- **Existe hoje** (evidência da auditoria): Cálculo local
- **Falta**: Hook servidor
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Números divergentes

## Dependências

X068

## Critério de aceite

- Elegíveis, supressos, duração
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).