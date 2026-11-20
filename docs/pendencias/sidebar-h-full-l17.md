# L17 — Sidebar h-full

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.9 Correção de layout (30) e tipografia (100)

## Descrição e origem

Sidebar h-full.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.9 Correção de layout (30) e tipografia (100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: trocar h-screen
- **Existe hoje** (evidência da auditoria): Sidebar.tsx:99 h-screen supports-[height:100dvh]:h-[100dvh]
- **Falta**: Ajustar
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo (sem corte medido)

## Dependências

Nenhuma registrada.

## Critério de aceite

- trocar h-screen
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).