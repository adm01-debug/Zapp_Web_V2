# GO-06 — Ver status/stories dos contatos

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram

## Descrição e origem

Ver status/stories dos contatos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.8 Evolution GO — recursos da v2 sem equivalente na GO e botões que quebram).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: find-status-messages → notSupported (EVENT_IGNORE_STATUS=true, GO_GAPS D5)
- **Existe hoje** (evidência da auditoria): Não
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Recurso inexistente

## Dependências

Nenhuma registrada.

## Critério de aceite

- find-status-messages → notSupported (EVENT_IGNORE_STATUS=true, GO_GAPS D5)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).