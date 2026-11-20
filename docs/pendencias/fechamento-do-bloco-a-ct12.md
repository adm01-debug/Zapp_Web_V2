# CT-12 — Fechamento do bloco A

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Fechamento do bloco A.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: 5 evidências commitadas
- **Existe hoje** (evidência da auditoria): CT-01/02 aplicados; falta CT-03 e CT-10
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

CT-03, CT-10

## Critério de aceite

- 5 evidências commitadas
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).