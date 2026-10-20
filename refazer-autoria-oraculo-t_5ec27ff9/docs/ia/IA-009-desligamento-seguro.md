# IA-009 — Desligamento seguro (kill switch por capacidade, bot e provedor)

**Etapa do plano:** `IA-009` `[M]` *Definir desligamento seguro* — "Planejar flags por capacidade, bot e
provedor, com desligamento imediato de efeitos automáticos e manutenção do atendimento manual."
**Aceite:** desativar IA bloqueia novas ações **no servidor** e não impede conversa humana.

## 1. O que existe hoje (verificado no HEAD `0ab84095`)

| Mecanismo | Onde | Cobre o servidor? |
|---|---|---|
| Tabela `feature_flags` (+ hook `src/hooks/system/useFeatureFlag.ts`, query única com revalidação de 5 min) | banco canônico + **frontend** | **NÃO** — `grep -rn "feature_flags" supabase/functions` não retorna nada: as Edge Functions não leem flag nenhuma. Desligar a flag esconde o botão no cliente, mas quem chamar a função direto continua sendo atendido. |
| `public-api` respondendo `410` (kill switch de endpoint legado) | `supabase/config.toml` + função | **SIM**, mas para um único endpoint. |
| `verify_jwt` por função (10 exceções declaradas em `supabase/config.toml`, 59 funções com `true` no manifesto) | gateway do Supabase + `deploy-functions.yml` (automático no merge na `main`; o environment `producao-edge-functions` tem branch policy e **nenhuma** aprovação humana) | **SIM** — porém é tudo-ou-nada por função, não por capacidade, e exige deploy. |
| `chatbot_flows` (fluxo ativo por conexão) | banco | **SIM** para o bot, se a função validar o fluxo ativo. |
| `is_enabled` de configurações (`AutoCloseSettings`, `CSATAutoConfig`, business hours, `away` por conexão) | banco + frontend | **SIM** onde a função confere a configuração antes de agir. |
| RLS/grants | banco | **SIM** para leitura/escrita de dados, não para consumo de provedor. |

**Lacuna central:** não existe hoje (a) flag de capacidade lida **no servidor** nem (b) flag de
provedor. O caminho hoje para parar tudo é deploy de Edge Function, que é automático no merge na `main` — ou
seja, o desligamento de emergência não é imediato.

## 2. Desenho proposto

1. **Chave por capacidade** em `feature_flags` (tabela existente, sem estrutura nova):
   `ai.capability.suggest_reply`, `ai.capability.enhance_message`, `ai.capability.summary`,
   `ai.capability.conversation_analysis`, `ai.capability.auto_tag`, `ai.capability.churn`,
   `ai.capability.classify_tickets`, `ai.capability.transcribe_audio`, `ai.capability.voice`,
   `ai.capability.chatbot_l1`.
2. **Chave por provedor:** `ai.provider.openai`, `ai.provider.gemini`, `ai.provider.elevenlabs`,
   `ai.provider.anthropic` — desliga o destino, mantém a capacidade viva em outro provedor autorizado
   (encaixa na IA-039, fallback explícito).
3. **Chave por bot/conexão:** `ai.bot.<connectionId>` para pausar automação de **uma** conexão sem
   derrubar as outras.
4. **Checagem no servidor, antes de qualquer efeito:** cada Edge Function de IA lê a flag da sua
   capacidade **e** a do provedor resolvido **antes** de reservar orçamento, chamar o provedor ou
   gravar análise; com flag desligada responde um estado explícito de capacidade desativada (nunca
   resposta vazia apresentada como sucesso).
5. **Padrão seguro:** ausência de chave ou erro de leitura = **desligado** (o mesmo princípio do
   `fallback=false` do hook atual), para que falha de leitura nunca reative efeito automático.
6. **Atendimento manual preservado:** o desligamento não toca em envio humano, atribuição de conversa
   nem leitura de histórico — prova disso é a meta M1/M10 da IA-005.
7. **Imediatismo e auditoria:** mudança de flag é uma escrita em tabela (sem deploy); registrar
   `updated_at`/autor e expor quem desligou o quê; a revalidação do lado servidor não pode depender de
   cache de 5 minutos (o cache do hook é do cliente e não se aplica).

## 3. Onde implementar

- Bloco 02: as funções de IA passam a ter identidade verificada **antes** de qualquer efeito — é o
  pré-requisito para que a flag por capacidade faça sentido (IA-011, IA-015).
- Bloco 05: leitura de flag dentro do caminho de execução, junto de prazos/limites (IA-041..050).
- Bloco 11: pausa de bot por conexão e posse de conversa (IA-108) — é onde a flag `ai.bot.<conexão>`
  é consumida.
- Teste do aceite (obrigatório): com todas as capacidades desligadas, (a) nenhuma requisição consome
  provedor nem grava análise, (b) a conversa continua podendo ser lida e respondida por humano.

## 4. Aceite da etapa

- [x] Desenho de flags por capacidade, bot e provedor definido sobre estrutura existente.
- [x] Lacuna registrada com prova: flag hoje só é lida no cliente.
- [x] Critério de "desligamento imediato sem deploy" e de "atendimento manual preservado" descritos
      como teste, com o bloco onde serão implementados.
- [ ] Implementação — acontece nos Blocos 02/05/11 (fora do escopo do Bloco 01, que é preparação).
