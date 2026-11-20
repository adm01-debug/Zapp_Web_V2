# CT-52 — Botão "Enviar produto" no perfil do contato

- **Estado**: DIVERGENTE
- **Prioridade**: P3
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Botão "Enviar produto" no perfil do contato.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): DIVERGENTE.
- **Planejado**: Botão + evento com contact_id
- **Existe hoje** (evidência da auditoria): Botão implementado (src/components/contacts/ContactDetailPanel.tsx:304-329); checkbox ainda aberto
- **Falta**: Prova com envio real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

CT-10

## Critério de aceite

- Botão + evento com contact_id
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).