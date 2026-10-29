# CV-009 — Decisões arquiteturais D1–D5 do Copiloto de Vendas

> ADR (Architecture Decision Record) para as 5 decisões que precisam de aprovação de Joaquim antes do go-live.
> Status: todas ABERTAS em 2026-10-16. Preencher antes do início da Fase 3 (CV-021).

---

## D1 — Teto de custo por chamada de IA

**Status:** ABERTA  
**Decisão necessária:** qual o custo máximo por chamada ao `copilot-live` em produção?  
**Contexto:** `ai_model_prices` está vazia — não há dado real de custo. O modelo a usar em `copilot-live` ainda não foi escolhido. Estimativa: modelos flash (Gemini 1.5 Flash, GPT-4o-mini) custam ~USD 0,001–0,005 por chamada.  
**Opções:**
- A) R$ 0,02/chamada (~USD 0,004) — modelo flash, qualidade intermediária
- B) R$ 0,05/chamada (~USD 0,01) — modelo balanceado, melhor qualidade
- C) Sem teto definido no piloto, revisar após 30 dias com dado real  
**Impacto:** D1 define qual modelo pode ser usado em CV-021 e o gatilho de desligamento automático de CV-008.  
**Pré-requisito para fechar:** popular `ai_model_prices` com o modelo escolhido.  
**Decidido por:** Joaquim  
**Data:** —

---

## D2 — Meta de tempo de primeira resposta

**Status:** PROVISORIAMENTE FECHADA (aguardando confirmação)  
**Decisão necessária:** confirmar p95 ≤ 60 min como meta do piloto 90 dias.  
**Contexto:** linha de base setembro = p50 10,95 min, p95 1.236 min. Meta provisória em CV-008: p95 ≤ 60 min.  
**Recomendação:** confirmar a meta provisória — é ambiciosa mas alcançável com o RADAR sugerindo resposta imediata nas conversas de alto valor.  
**Decidido por:** Joaquim  
**Data:** —

---

## D3 — Limiar mínimo de adoção para continuar o piloto

**Status:** ABERTA  
**Decisão necessária:** qual % de sugestões clicadas pelos vendedores justifica continuar o RADAR após 30 dias?  
**Contexto:** linha de base = 0 % (nunca usado). Meta em CV-008 = ≥ 30 % em 90 dias. Limiar de pausa sugerido = < 10 % após 30 dias.  
**Opções:**
- A) < 5 % após 30 dias = pausa imediata para revisão
- B) < 10 % após 30 dias = reunião de revisão de produto
- C) Avaliar apenas no dia 90 (sem pausa intermediária)  
**Impacto:** D3 define se há ponto de verificação em 30 dias ou só em 90 dias.  
**Decidido por:** Joaquim  
**Data:** —

---

## D4 — Visibilidade das sugestões: todos os vendedores ou selecionados?

**Status:** ABERTA  
**Decisão necessária:** no piloto, quem vê as sugestões do RADAR?  
**Contexto:** o RADAR pode ser ligado para todos os usuários do Zapp Web ou apenas para um grupo piloto (ex.: 2–3 vendedores).  
**Opções:**
- A) Todos os vendedores desde o início
- B) Grupo piloto de 2–3 vendedores por 30 dias, depois expandir
- C) Apenas Joaquim por 7 dias para validar as sugestões antes de abrir  
**Recomendação:** Opção B — piloto pequeno reduz risco de sugestão ruim chegar ao cliente antes de ajuste de prompt.  
**Impacto:** D4 define o filtro de `profile_id` na tabela `copilot_sessions` (CV-011).  
**Decidido por:** Joaquim  
**Data:** —

---

## D5 — Pré-condições obrigatórias para o go-live

**Status:** ABERTA  
**Decisão necessária:** quais itens devem estar prontos ANTES de ligar o RADAR em produção?  
**Contexto:** lista sugerida pela análise técnica:

| # | Pré-condição | Status atual |
|---|---|---|
| 1 | `ai_model_prices` populada com modelo do RADAR | ❌ Pendente |
| 2 | WhatsApp `PRINCIPAL` reconectado | ❌ Desconectado |
| 3 | `ai.capability.copilot_live = true` em `feature_flags` | ❌ Pendente |
| 4 | D1 (custo) fechada | ❌ Pendente |
| 5 | D4 (visibilidade) fechada | ❌ Pendente |
| 6 | Pelo menos 1 vendedor treinado na UI do RADAR | ❌ Pendente |
| 7 | `ai-transcribe-audio` habilitado (lê áudios no contexto) | ❌ Verificar |

**Impacto:** D5 é o checklist de go-live. Nenhuma das Fases 4+ deve ir para produção sem estes itens.  
**Decidido por:** Joaquim  
**Data:** —

---

## Histórico de alterações

| Data | Decisão | Mudança | Por |
|---|---|---|---|
| 2026-10-16 | D2 | Meta provisória p95 ≤ 60 min adotada (aguarda confirmação) | Claude/CV-009 |
