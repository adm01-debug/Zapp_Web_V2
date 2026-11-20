# T75 — Motion sob reduced-motion

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Motion sob reduced-motion.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: KPI fade 150 ms, troca de painel 120 ms, whileTap 0.98, tudo sob useReducedMotion
- **Existe hoje** (evidência da auditoria): CallResultCell.tsx:29 usa motion-safe:animate-pulse; ActiveCallPanel.tsx:59 AnimatePresence; CallDialog.tsx:232 whileTap scale 0.9; nenhum useReducedMotion em src/components/calls
- **Falta**: Aplicar regras de motion e reduced-motion
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Desconforto para quem desativa animações

## Dependências

Nenhuma registrada.

## Critério de aceite

- KPI fade 150 ms, troca de painel 120 ms, whileTap 0.98, tudo sob useReducedMotion
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).