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
  bloqueio ativo tende a estender o bloqueio, não encurtá-lo. O sistema trava essas ações
  automaticamente via `global_settings.whatsapp_maintenance_until` (edge `evolution-api`
  recusa `connect`/`restart-instance`/`disconnect`/`create-instance` enquanto a janela estiver
  no futuro) — se algum botão ainda funcionar, é sinal de que a trava expirou ou não foi
  configurada, não motivo para insistir manualmente.
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
   Isso desabilita os botões de reconectar/QR/reiniciar/criar-instância na UI e bloqueia essas
   ações na edge `evolution-api` (mensagem clara em vez de erro genérico).
3. **Avisar o time** que o WhatsApp está fora e por quê (mensagens não param de chegar, só não
   são entregues — conferir depois quem escreveu sem resposta).
4. **Decidir sobre número reserva** (swap de instância) — só com decisão explícita, ver E04 do
   plano multi-conexão. Não é reversível sem custo (clientes veem outro remetente).
5. **Diagnosticar a causa** enquanto espera: volume de conversas iniciadas por agente sem
   resposta, uso de verificação de número em massa, re-logins recentes (`connection_health_logs`).
6. **Ao voltar:** confirmar `/instance/status` com `connected:true` estável por alguns minutos
   antes de desligar a janela de manutenção. Primeiras horas: preferir só responder, evitar
   iniciar conversa nova e evitar disparo de campanha (Talk X) — ver E05 do plano.
7. **Desligar a manutenção:**
   ```sql
   update global_settings set value = null where key = 'whatsapp_maintenance_until';
   ```

## Verificar se a volta é real

- `select status, health_status, last_health_check from whatsapp_connections where instance_id = 'PRINCIPAL';`
- `select count(*) from connection_health_logs where instance_id='PRINCIPAL' and checked_at > now() - interval '15 minutes' and status <> 'healthy';` — deve ser 0 antes de destravar.
- Enviar e receber 1 mensagem de teste real antes de avisar o time que voltou ao normal.
