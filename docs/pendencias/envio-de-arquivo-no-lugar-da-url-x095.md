# X095 — Envio de arquivo no lugar da URL

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 01 · **Seção**: 3.9 Talk X — Fase 8 · Templates (X083–X098: 0 concluídos)

## Descrição e origem

Envio de arquivo no lugar da URL.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.9 Talk X — Fase 8 · Templates (X083–X098: 0 concluídos)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Dropzone 16 MB
- **Existe hoje** (evidência da auditoria): TalkXMediaDropzone.tsx:25-27 "ainda não está montado em nenhuma tela"; editor segue com URL (TalkXTemplateEditor.tsx:36,98)
- **Falta**: Montar após o bucket
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Usuário precisa hospedar mídia fora

## Dependências

X061

## Critério de aceite

- Dropzone 16 MB
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).