# X037 — Projeção talkx_contact_attributes

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)

## Descrição e origem

Projeção talkx_contact_attributes.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.5 Talk X — Fase 4 · Dados comerciais e vínculo CRM (X036–X041: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Empresa, cidade, UF, vendedor, estágio, compra, ticket, RFM num lugar
- **Existe hoje** (evidência da auditoria): Nada (0 ocorrências)
- **Falta**: Migration + RLS
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Filtros comerciais do mock devolvem zero

## Dependências

X036

## Critério de aceite

- Empresa, cidade, UF, vendedor, estágio, compra, ticket, RFM num lugar
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).