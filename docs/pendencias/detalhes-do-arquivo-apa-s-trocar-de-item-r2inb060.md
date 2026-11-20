# R2-INB-060 — Detalhes do arquivo após trocar de item

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta"

## Descrição e origem

Detalhes do arquivo após trocar de item.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Reset do erro de imagem por item
- **Existe hoje** (evidência da auditoria): FileDetailPanel.tsx:26 useState(false) sem reset; FilesTab.tsx:448 e :456 sem key por item
- **Falta**: key={item.id}
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Ao clicar em outro arquivo a prévia aparece quebrada

## Dependências

Nenhuma registrada.

## Critério de aceite

- Reset do erro de imagem por item
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).