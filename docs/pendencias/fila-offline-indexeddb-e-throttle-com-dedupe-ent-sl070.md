# SL-070 — Fila offline (IndexedDB) e throttle com dedupe entre abas

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)

## Descrição e origem

Fila offline (IndexedDB) e throttle com dedupe entre abas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: envio resiliente offline
- **Existe hoje** (evidência da auditoria): nenhum IndexedDB em src
- **Falta**: Implementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Mensagem digitada sem rede pode se perder

## Dependências

Nenhuma registrada.

## Critério de aceite

- envio resiliente offline
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).