# S46 — Lição no CLAUDE.md

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.4 SalesView + Journey 50 (02/10)

## Descrição e origem

Lição no CLAUDE.md.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.4 SalesView + Journey 50 (02/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Lição correta
- **Existe hoje** (evidência da auditoria): CLAUDE.md "Lição de UI (2026-10-02)" diz "sem série histórica — não reintroduzir %", mas #1640 já usa % real
- **Falta**: Atualizar texto
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Agentes podem remover % legítimo

## Dependências

Joaquim (arquivo protegido)

## Critério de aceite

- Lição correta
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).