# ARQ-19 — Encaminhar por item (cartão, lista, tabela, detalhes)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 06 · **Seção**: 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

## Descrição e origem

Encaminhar por item (cartão, lista, tabela, detalhes).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos").

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Após a PR G, botão de cada item ligado ao serviço real
- **Existe hoje** (evidência da auditoria): FileCard.tsx:112-120, FilesListView.tsx:116, FilesTableView.tsx:169, FileDetailPanel.tsx:82 — todos disabled title="Disponível em breve"; onForward chega ao FileCard (FilesContent.tsx:289) e é ignorado; só "Encaminhar N" da barra de seleção funciona (FilesTab.tsx:402)
- **Falta**: Ligar cada botão a openForward([item])
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Atendente vê "em breve" num recurso que já existe; precisa entrar no modo seleção para encaminhar 1 arquivo

## Dependências

nenhuma

## Critério de aceite

- Após a PR G, botão de cada item ligado ao serviço real
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).