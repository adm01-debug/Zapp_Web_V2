# T77 — Responsivo (<1280 Sheet, 390 px)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Responsivo (<1280 Sheet, 390 px).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Painel vira Sheet, CallRowMobile, KPIs 2 col
- **Existe hoje** (evidência da auditoria): Nada (grep Sheet|CallRowMobile src/components/calls vazio)
- **Falta**: Implementar layouts
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Telefonia ruim em notebook pequeno/celular

## Dependências

SL-106

## Critério de aceite

- Painel vira Sheet, CallRowMobile, KPIs 2 col
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).