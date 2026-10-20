# Runbook — Bloqueio da Meta (WhatsApp)

> Referência rápida para quando o WhatsApp Business da Meta bloqueia o número principal
> (`PRINCIPAL` / 551146375517) por violação de política — comum ser um bloqueio temporário
> (ex.: 24h). Contexto completo em `docs/audits/PLANO_MULTI_CONEXAO_EVOLUTION_GO_50_ETAPAS_2026-09-25.md`.

## Sintomas

- `/instance/status` (ou `/instance/all` na GO) mostra `connected:false` com
  `disconnect_reason: "Reconnecting"` persistente — a instância tenta relogar sozinha e falha.
- `warroom_alerts` com `🔴 Conexão PRINCIPAL desconectou` recorrente (a GO pode gravar em
  duplicata — não é sinal de piora, é bug conhecido de dedup, ver E26 do plano).
- Nenhuma mensagem nova chega nem sai pelo WhatsApp; o resto do sistema (Bitrix, e-mail, outros
  canais) continua normal.

## O que NÃO fazer

- **Não clicar em "Reconectar"/"Gerar QR"/"Reiniciar" repetidamente.** Login em loop durante um
  bloqueio ativo tende a estender o bloqueio, não encurtá-lo. O sistema recusa essas ações no
  servidor enquanto `global_settings.whatsapp_maintenance_until` estiver no futuro: a edge
  `evolution-api` barra `connect`/`restart-instance`/`disconnect`/`create-instance`/
  `create-connection` e devolve `{ error: true, message }` com o motivo e o fim da janela. **Os
  botões continuam visíveis** — o que existe é a recusa da edge, anunciada com esse motivo (faixa
  global de conexões e lista de conexões). Recusa sem motivo ("Erro ao reconectar") é falha de
  transporte, não licença para insistir; nenhuma mensagem é perdida por causa da janela.
- **Não trocar de aparelho/reinstalar o WhatsApp** no celular vinculado durante o bloqueio.
- **Não criar uma segunda instância "provisória"** sem decisão explícita — ver E04 no plano
  (swap de instância é operação de negócio, não técnica).

## Checklist de resposta

1. **Confirmar o bloqueio de verdade** (não é só instabilidade): `/instance/status` mostrando
   `Reconnecting` por mais de ~15–20 min após tentativas normais de reconexão é o sinal mais
   forte; o app da Meta Business (se houver acesso) ou o próprio WhatsApp no celular geralmente
   mostra a mensagem oficial de bloqueio/suspensão.
2. **Ligar a janela de manutenção** (se ainda não estiver ativa):
   ```sql
   update global_settings set value = '<ISO até quando o bloqueio deve valer + folga>'
   where key = 'whatsapp_maintenance_until';
   ```
   Isso bloqueia as ações na edge `evolution-api` (recusa com o motivo, no lugar de erro genérico).
   A UI **não** desabilita os botões: `global_settings` só é legível por admin/supervisor, então
   quem informa o motivo é a própria edge. Botão desabilitado, aviso sumido ou silêncio são outra
   coisa (falha de transporte/tela), nunca sinal verde.
3. **Avisar o time** que o WhatsApp está fora e por quê (mensagens não param de chegar, só não
   são entregues — conferir depois quem escreveu sem resposta).
4. **Decidir sobre número reserva** (swap de instância) — só com decisão explícita, ver E04 do
   plano multi-conexão. Não é reversível sem custo (clientes veem outro remetente).
5. **Diagnosticar a causa** enquanto espera: volume de conversas iniciadas por agente sem
   resposta, uso de verificação de número em massa, re-logins recentes (`connection_health_logs`).
6. **Ao voltar — retomada gradual (E05 do plano):** confirmar `/instance/status` com
   `connected:true` estável por alguns minutos antes de desligar a janela de manutenção.
   - primeiras 2 h: **só responder** — nenhuma conversa iniciada pelo agente ("Nova conversa");
   - primeiras 72 h: **sem campanha** (Talk X) e teto de conversas novas iniciadas por hora.
   - A chave `global_settings.whatsapp_warmup_until` prevista no plano **não tem leitor no
     sistema**: `global_settings` só é legível por admin/supervisor (o agente não lê no navegador)
     e nenhum caminho de envio consulta a chave — a rampa acima é regra do time, não do sistema.
     Levar o bloqueio para o servidor (RPC/edge de envio, que rodam com service role) é pendência
     do trilho de servidor.
7. **Desligar a manutenção:**
   ```sql
   update global_settings set value = null where key = 'whatsapp_maintenance_until';
   ```

## Envio com a conexão fora (E02)

O envio já é barrado no banco: `enqueue_outbound_message` exige conexão `connected` e levanta
`no_connected_whatsapp_connection` (ou `selected_whatsapp_connection_unavailable` quando o id
informado não serve) — `supabase/migrations/20260930200000_enforce_enqueue_connection_scope.sql`.
Nenhuma mensagem fica presa em `sending`; o compositor mostra o erro do envio. O que o sistema não
faz é avisar o agente **antes** de ele tentar enviar: o motivo (inclusive o bloqueio da Meta) chega
pela mensagem da edge, e a faixa global de conexões repassa esse motivo em vez do texto genérico.

## Verificar se a volta é real

- `select status, health_status, last_health_check from whatsapp_connections where instance_id = 'PRINCIPAL';`
- `select count(*) from connection_health_logs where instance_id='PRINCIPAL' and checked_at > now() - interval '15 minutes' and status <> 'healthy';` — deve ser 0 antes de destravar.
- Enviar e receber 1 mensagem de teste real antes de avisar o time que voltou ao normal.
