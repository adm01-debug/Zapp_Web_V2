# IA-002 — Inventário dos fluxos de IA (mapa botão → hook → função → provedor → tabela → permissão → efeito → teste)

**Etapa do plano:** `IA-002` `[V]` *Mapear o fluxo completo* — "Relacionar cada botão de IA à rota, hook,
função, provedor, tabela, permissão, efeito e teste; incluir CRM externo, mídia, voz e campanhas."
**Aceite:** nenhum recurso inventariado fica sem origem, consumidor e responsável técnico identificados.

Este arquivo é o **índice consolidado**. O detalhe está em dois anexos, ambos levantados na referência
congelada (`0ab84095`, ver `IA-001`):

| Anexo | Conteúdo | Volume |
|---|---|---|
| `IA-002-inventario-functions-ia.md` | 25 funções de IA (Edge Functions) + os compartilhados que as sustentam: autenticação, provedor, modelo (cliente × servidor), tabelas, efeitos, teste, risco | 32 linhas de tabela, 162 linhas |
| `IA-002-inventario-frontend-ia.md` | **59 pontos de UI** (`P01`–`P59`) em 7 áreas (inbox, input de texto/áudio, contato/memória, CRM/churn/tickets, dashboard, configurações, efeitos automáticos), com gatilho, hook, função, payload, efeito, gating e teste | 596 linhas |

## 1. Números do inventário

- **59 pontos de UI** de IA mapeados, do botão ao efeito.
- **25 funções de IA** no escopo (de 67 funções do projeto), **24 delas com chamador identificado no
  frontend** (`IA-002-inventario-frontend-ia.md` §(f)) — as exceções estão em §3.
- **Provedores pagos** envolvidos: Lovable AI Gateway (11 funções), OpenRouter (fallback do `ai-proxy`),
  ElevenLabs (9 chamadas em 8 funções). Resend aparece no `sentiment-alert`, mas não é IA.
- **Trilha de consumo:** só **7 funções** gravam `ai_usage_logs` (as que usam `callAiWithTracking`).
- **CRM externo:** `crm-integration` (`contactLookup` / `intelligence`) chamado por
  `useContactIntelligence.ts:98` → `lib/crmIntegration.ts:20`; é a origem de briefing, DISC, gatilhos e
  churn "importados" (ver `IA-006` §Parte 3).
- **Voz e mídia:** 10 pontos de UI entre STT/TTS/STS/diálogo/voz-desenho/SFX e 4 pontos de classificação
  de mídia (sticker, emoji, áudio-meme) + transcrição sob demanda.

## 2. Como ler cada linha (o contrato de campos do aceite)

`origem` (botão/hook/arquivo:linha) → `rota/edge function` → `consumidor` (o que aplica o resultado:
persistência, painel, envio, alerta) → `provedor/modelo` (e **quem escolhe** o modelo) → `tabela` →
`permissão` (checagem no servidor? só no cliente? nenhuma?) → `efeito` (mensagem enviada, fila trocada,
prioridade, etiqueta, tarefa) → `teste` (caminho ou "nenhum").

## 3. Exceções declaradas (recurso sem origem/consumidor/`teste` confirmado)

| Item | Situação | Onde |
|---|---|---|
| `voice-copilot-action` | **nenhum chamador no repositório** (só comentários em `src/lib/postgrestFilters.ts:16` e num teste de `_shared`). Consumidor provavelmente é o agente ElevenLabs configurado **no painel**, fora do repo — precisa confirmação com o Joaquim | `supabase/functions/voice-copilot-action/` |
| `elevenlabs-agent-token` | **nenhum chamador no repositório** — mesmo caso acima | `supabase/functions/elevenlabs-agent-token/` |
| `chatbot-l1` | chamado do frontend **apenas para testar a conexão** (`ChatbotL1Config.tsx:234`); a execução real é pelo webhook do backend | `IA-002-inventario-frontend-ia.md` §(f) |
| `sentiment-alert` | disparado **pelo backend** após a análise; o frontend só consome o alerta por realtime | `useSentimentAlerts.ts:38` |
| 6 lacunas do anexo de frontend | persistência por função, modelo efetivo quando o cliente não envia, `initialSummary` sem caller, policies de `search_knowledge_base`/`ai_conversation_tags`/`conversation_memory`, `disabled` do VoiceChanger, e ausência de flag/tier gate-ando IA no inbox | `IA-002-inventario-frontend-ia.md` §"Lacunas explicitamente não verificadas" |
| RLS de object storage de áudio | as policies de `storage.objects` dos buckets de áudio **não** foram lidas linha a linha (a evidência é do download pela função) | `IA-004-matriz-autorizacao.md` §"Notas de honestidade" |

## 4. Efeitos automáticos (sem clique) — os que exigem flag/limite

O anexo de frontend (§7) lista os efeitos automáticos: alerta de sentimento (análise → alerta →
notificação) e transcrição automática de áudio. São exatamente os caminhos onde o desligamento por
capacidade (`IA-009`) e o controle de consumo (`IA-043`/`IA-044`) precisam valer **no servidor**.

## 5. Aceite da etapa

- [x] Cada função de IA tem origem, provedor, tabela, efeito, autenticação, teste e risco em uma linha.
- [x] Cada ponto de UI de IA tem gatilho, hook, função, payload, efeito, gating e teste.
- [x] Números fecham: 59 pontos de UI, 25 funções, 24 com chamador no frontend.
- [x] Todo item **sem** origem/consumidor/`teste` confirmado está declarado explicitamente (§3) em vez de
      preenchido por suposição. Os dois consumidores que vivem fora do repositório (agente ElevenLabs)
      ficam como pergunta ao Joaquim no Bloco 02, não como fato.
