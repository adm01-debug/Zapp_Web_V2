# CT-111 — Documentos "Pedido ao Singu" (dados/filtros; área provisória)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)

## Descrição e origem

Documentos "Pedido ao Singu" (dados/filtros; área provisória).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.2 Plano Contatos por jornada — CT-001 a CT-130 (08/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Pedido formal ao Singu
- **Existe hoje** (evidência da auditoria): só citado no próprio plano
- **Falta**: Escrever
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Singu não sabe o que entregar → todo o bloco fica com nulos

## Dependências

Nenhuma registrada.

## Critério de aceite

- Pedido formal ao Singu
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).