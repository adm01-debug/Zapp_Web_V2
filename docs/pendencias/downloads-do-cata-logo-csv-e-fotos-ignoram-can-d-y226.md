# Y22-6 — Downloads do catálogo (CSV e fotos) ignoram can_download

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Downloads do catálogo (CSV e fotos) ignoram can_download.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Mapear saídas de informação (Y29)
- **Existe hoje** (evidência da auditoria): catalogExport.ts:219-233 e SendProductDialog → downloadImageAsBlob não consultam profiles.can_download
- **Falta**: Decidir se aplica
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Conflita com a regra "nenhuma informação sai do sistema"

## Dependências

decisão de produto

## Critério de aceite

- Mapear saídas de informação (Y29)
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).