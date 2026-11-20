# E43 — Remover ações que a GO não tem

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 05 · **Seção**: 3.7 Multi-conexão Evolution GO (50)

## Descrição e origem

Remover ações que a GO não tem.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.7 Multi-conexão Evolution GO (50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Limpar ~45 ações
- **Existe hoje** (evidência da auditoria): Ainda roteadas e oferecidas na UI (ver 3.8)
- **Falta**: Remover ou esconder
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Botões que falham

## Dependências

Nenhuma registrada.

## Critério de aceite

- Limpar ~45 ações
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).