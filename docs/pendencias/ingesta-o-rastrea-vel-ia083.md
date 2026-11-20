# IA-083 — Ingestão rastreável

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Ingestão rastreável.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Extração, trechos, hash, origem
- **Existe hoje** (evidência da auditoria): _shared/ai-kb-ingest.ts + ai-kb-ingest (só formatos texto; PDF/DOCX ficam unsupported, ai-kb-ingest.ts:17,30); sem hash/trechos
- **Falta**: PDF/DOCX, hash, versões
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Manuais em PDF não viram conhecimento

## Dependências

Nenhuma registrada.

## Critério de aceite

- Extração, trechos, hash, origem
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).