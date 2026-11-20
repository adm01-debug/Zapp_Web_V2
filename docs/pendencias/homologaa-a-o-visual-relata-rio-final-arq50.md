# ARQ-50 — Homologação visual + relatório final

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Homologação visual + relatório final.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md com prints 4 combinações × 3 modos × 4/6/8 col, claro/escuro
- **Existe hoje** (evidência da auditoria): Arquivo inexistente (ls docs/design)
- **Falta**: Produzir no banco local
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Dono não tem prova visual do redesign

## Dependências

Nenhuma registrada.

## Critério de aceite

- RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md com prints 4 combinações × 3 modos × 4/6/8 col, claro/escuro
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).