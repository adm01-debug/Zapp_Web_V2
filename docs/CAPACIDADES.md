# Capacidades de chamada por canal

Estado do código **após as etapas T23–T30 da Fase 2** do
`docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md`.

Regra viva em código: `src/lib/calls/capabilities.ts` (rótulos e motivos) e
`src/hooks/calls/useCallChannels.ts` (leitura do estado real + regras por canal).
Quem decide o canal é o hook; a tela (`CallChannelBadge`) só apresenta.

## VoIP

| Estado | `canDial` | `canReceive` | `canReject` | `reason` |
|---|---|---|---|---|
| `registered` e microfone ok | sim | sim | sim | — |
| `registered` com microfone bloqueado | **não** | sim | sim | `mic_blocked` (precede qualquer outro) |
| `registered` com microfone `unknown` | **não** | sim | sim | trava a discagem (comportamento do código) |
| `reconnecting` / `connecting` | não | não | não | `voip_reconnecting` |
| `unavailable` | não | não | não | `voip_unavailable` |
| `idle` | não | não | não | `voip_not_configured` |

`canRecord` é `false` em todos os estados — não há gravação implementada.

## WhatsApp

Canal **somente-recebidas** por desenho: não existe saída de WhatsApp nesta fase.

| Estado | `canDial` | `canReceive` | `canReject` | `reason` |
|---|---|---|---|---|
| Linha conectada | não | **sim** | não | `whatsapp_no_outbound` |
| Linha não conectada | não | não | não | `whatsapp_no_outbound` |
| Sem linha utilizável | não | não | não | `whatsapp_unavailable` |
| Sem permissão de supervisor (D8) | não | não | não | `whatsapp_restrito_supervisores` |

O botão de recusar só existe no VoIP: no WhatsApp o segundo botão do alerta é
**"Ignorar"** (silencia, sem gravar desfecho) — decisão D7=b do plano.

## Qual linha decide (T30)

- **Dentro do inbox:** a linha da **conversa** (`contact.whatsapp_connection_id`),
  que prevalece sobre a `is_default`. Se ela não resolver (RLS ou linha apagada),
  o canal cai na `is_default`.
- **Fora do inbox:** a linha `is_default` do usuário.
- Linhas `[E2E]` **nunca** contam — filtradas na consulta e de novo no mapper.

O painel mostra o texto pronto de `rotuloLinhaWhatsApp`:
`"pela linha <nome>"`, ou `"Sem linha de WhatsApp"`, ou ainda
`"Disponível para supervisores"` quando o usuário não pode ver a linha.

## Permissão (D8) — WhatsApp restrito a supervisor

A RLS de `whatsapp_connections` só devolve linhas para **admin/supervisor**. Para o
agente comum a **ausência de linha não significa "sem conexão"**: significa **sem
permissão**. Por isso o canal **não** aparece como "indisponível" — aparece como
**"Disponível para supervisores"** (`whatsapp_restrito_supervisores`), e a linha
não é exibida. A decisão foi **não** alterar a RLS (opção 3 do plano).

Cobertura: `useCallChannels.d8.test.ts` (agente comum), `linhaDoCanal.test.ts`
(linha da conversa, rótulo e o caso restrito) e `CallChannelBadge.test.tsx`.
