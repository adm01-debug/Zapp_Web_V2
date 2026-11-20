# T84 — Acessibilidade (axe 0 serious/critical)

- **Estado**: PARCIAL
- **Prioridade**: P2
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Acessibilidade (axe 0 serious/critical).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: axe real na tela ociosa e com chamada ativa; teclado/aria
- **Existe hoje** (evidência da auditoria): src/components/calls/__tests__/TelefoniaView.a11y.test.tsx (axe em jsdom, 3 estados); CallHistoryTabs.tsx:22-33 corrigiu aria-controls (A11Y-01)
- **Falta**: axe em navegador real; contraste medido; alvos 44 px (A11Y-09)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Risco de inacessibilidade para leitores de tela/mobile

## Dependências

Nenhuma registrada.

## Critério de aceite

- axe real na tela ociosa e com chamada ativa; teclado/aria
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).