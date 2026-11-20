# L-24 — Campos customizáveis de contato

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.6 Contatos, CRM e Catálogo

## Descrição e origem

Campos customizáveis de contato.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.6 Contatos, CRM e Catálogo).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: README "Gestão de contatos com campos customizáveis"
- **Existe hoje** (evidência da auditoria): Serviço/hook de upsert/delete (src/hooks/crm/useContactCustomFields.ts:40,56) sem nenhuma tela de edição; único consumidor é a pré-visualização do Talk X (TalkXCampaignWizard.tsx:584)
- **Falta**: UI no cadastro/detalhe do contato
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Equipe não consegue registrar dados próprios do cliente

## Dependências

Nenhuma registrada.

## Critério de aceite

- README "Gestão de contatos com campos customizáveis"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).