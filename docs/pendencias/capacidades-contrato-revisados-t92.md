# T92 — CAPACIDADES/CONTRATO revisados

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

CAPACIDADES/CONTRATO revisados.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Documentos batem com o código final
- **Existe hoje** (evidência da auditoria): docs/telefonia/CAPACIDADES.md:22 ainda diz SIP "hardcoded em useSipClient.ts:15-17" (T15 removeu)
- **Falta**: Revisar contra o código
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Documento engana quem dá suporte

## Dependências

Nenhuma registrada.

## Critério de aceite

- Documentos batem com o código final
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).