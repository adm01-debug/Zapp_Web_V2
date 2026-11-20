# E17 — Compatibilidade de URLs antigas de filtro por UUID → nome

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.6 Remoção de Etiquetas (100)

## Descrição e origem

Compatibilidade de URLs antigas de filtro por UUID → nome.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.6 Remoção de Etiquetas (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Regra de transição
- **Existe hoje** (evidência da auditoria): nada
- **Falta**: Decisão + fallback
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Link antigo de filtro abre vazio

## Dependências

decisão de produto

## Critério de aceite

- Regra de transição
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).