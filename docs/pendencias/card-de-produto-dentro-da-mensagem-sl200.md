# SL-200 — Card de produto dentro da mensagem

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.8 Inbox 360, Fidelidade Carvão, Coluna/Header

## Descrição e origem

Card de produto dentro da mensagem.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.8 Inbox 360, Fidelidade Carvão, Coluna/Header).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Componente de produto no balão
- **Existe hoje** (evidência da auditoria): nenhum ProductCard em src/components/inbox
- **Falta**: Implementar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Vendedor não vê produto enviado como cartão

## Dependências

catálogo

## Critério de aceite

- Componente de produto no balão
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).