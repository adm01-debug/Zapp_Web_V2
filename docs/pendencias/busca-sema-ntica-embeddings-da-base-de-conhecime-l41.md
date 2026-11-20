# L-41 — Busca semântica / embeddings da Base de Conhecimento

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.8 Segurança, LGPD e IA

## Descrição e origem

Busca semântica / embeddings da Base de Conhecimento.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.8 Segurança, LGPD e IA).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: audit_report "Vector Search"; FORGOTTEN #4 "status de embedding"
- **Existe hoje** (evidência da auditoria): ai-kb-ingest grava embedding_status: "pending" e "Nenhuma embedding é gerada aqui" (supabase/functions/ai-kb-ingest/index.ts:230-231)
- **Falta**: gerar embeddings + busca vetorial
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

functions, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

IA responde só por palavra-chave

## Dependências

Nenhuma registrada.

## Critério de aceite

- audit_report "Vector Search"; FORGOTTEN #4 "status de embedding"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).