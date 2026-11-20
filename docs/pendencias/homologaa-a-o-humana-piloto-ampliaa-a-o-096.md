# 096 — Homologação humana, piloto, ampliação

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.6 Talk Me (100 + refinamento 50)

## Descrição e origem

Homologação humana, piloto, ampliação.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.6 Talk Me (100 + refinamento 50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Aceite nominal e piloto controlado
- **Existe hoje** (evidência da auditoria): sem artefato
- **Falta**: Dono decidir/homologar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Recurso ligado por flag (inbox.talk-me, RealtimeInboxView.tsx:104) sem aceite formal

## Dependências

dono

## Critério de aceite

- Aceite nominal e piloto controlado
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).