# S42 — Matriz de prints

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.4 SalesView + Journey 50 (02/10)

## Descrição e origem

Matriz de prints.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.4 SalesView + Journey 50 (02/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Antes/depois claro+escuro
- **Existe hoje** (evidência da auditoria): 00-antes- adicionados (lote 06/10) e cheio≠vazio agora; sem par escuro da SalesView
- **Falta**: Par escuro
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Antes/depois claro+escuro
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).