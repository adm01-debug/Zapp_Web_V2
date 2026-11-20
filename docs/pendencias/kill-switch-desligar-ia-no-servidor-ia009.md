# IA-009 — Kill switch (desligar IA no servidor)

- **Estado**: PARCIAL
- **Prioridade**: P1
- **Anexo**: 02 · **Seção**: 3.1 Plano IA 200 etapas — itens pendentes

## Descrição e origem

Kill switch (desligar IA no servidor).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/02-ia-dashboard.md` (3.1 Plano IA 200 etapas — itens pendentes).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Flags por capacidade, bot e provedor, com desligamento imediato
- **Existe hoje** (evidência da auditoria): _shared/ai-feature-flags.ts:34-68 (10 capacidades, lido em ai-guards.ts:17/ai-auth.ts:102); sem chave ai.provider./ai.bot. (ai-feature-flags.ts:19-20); sem tela (nenhum ai.capability em src/); caminho HMAC do chatbot-l1 não passa pelo gate (chatbot-l1/index.ts:27-34); classify-, elevenlabs-, ai-proxy, talkx-ai, sentiment-alert fora do mapa
- **Falta**: Chaves por provedor/bot, tela admin, cobrir webhook do bot e efeitos automáticos
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Em incidente/custo alto não dá para desligar só um provedor ou o bot sem SQL; o bot automático não para

## Dependências

Nenhuma registrada.

## Critério de aceite

- Flags por capacidade, bot e provedor, com desligamento imediato
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).