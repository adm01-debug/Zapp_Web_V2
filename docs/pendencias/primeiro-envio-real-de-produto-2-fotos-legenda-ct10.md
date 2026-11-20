# CT-10 — Primeiro envio real de produto (2 fotos + legenda)

- **Estado**: BLOQUEADO
- **Prioridade**: P0
- **Anexo**: 05 · **Seção**: 3.3 Catálogo — Finalização (CT-01..CT-100)

## Descrição e origem

Primeiro envio real de produto (2 fotos + legenda).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/05-tarefas-catalogo-mapa-go.md` (3.3 Catálogo — Finalização (CT-01..CT-100)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Envio real em produção com ids registrados
- **Existe hoje** (evidência da auditoria): Procedimento escrito; "evidência AINDA NÃO COLETADA" (docs/catalogo/ENVIO_E2E.md:54)
- **Falta**: Envio real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

O fluxo central do catálogo nunca foi provado em produção

## Dependências

Joaquim + conexão WhatsApp ativa

## Critério de aceite

- Envio real em produção com ids registrados
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).