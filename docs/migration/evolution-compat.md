# Inventário Evolution GO vs Evolution API — ZAPP WEB V2

Gerado: 2026-08-27 · Sessão 4

---

## Estado Atual do Evolution GO

**Projeto:** `evolution-go-rxj2` · VPS Hostinger · porta `4000` (externa `32773`)  
**URL:** `https://evolution-go-rxj2.srv1481814.hstgr.cloud`  
**Status:** ⚠️ **LICENSE_REQUIRED** — serviço não ativado

Resposta atual ao chamar qualquer endpoint:
```json
{
  "code": "LICENSE_REQUIRED",
  "error": "service not activated",
  "message": "License required. Open the manager to activate your license.",
  "register_url": "http://localhost:32773/manager/login"
}
```

**Ação necessária (Gate pré-etapa 62):** Joaquim precisa ativar a licença do Evolution GO em `http://187.77.151.129:32773/manager/login` antes do deploy das functions.

---

## Endpoints Usados pelo App

Extraídos de `supabase/functions/_shared/*.ts` e funções individuais:

| Endpoint | Método | Função que usa | Compatível? | Observação |
|---|---|---|---|---|
| `/message/sendText/{instance}` | POST | evolution-webhook, whatsapp-webhook | ⚠️ Não testado | Licença pendente |
| `/message/{mediaEndpoint}/{instance}` | POST | recover-corrupted-audios, talkx-send | ⚠️ Não testado | `mediaEndpoint` dinâmico |
| `/instance/connectionState/{instance}` | GET | evolution-health, connection-health-check | ⚠️ Não testado | — |
| `/instance/connect/{instance}` | GET | evolution-sync | ⚠️ Não testado | — |
| `/instance/logout/{instance}` | DELETE | evolution-api | ⚠️ Não testado | — |
| `/webhook/set/{instance}` | POST | evolution-webhook, talkx-send | ⚠️ Não testado | Step 62 |
| `/webhook/find/{instance}` | GET | evolution-webhook | ⚠️ Não testado | — |
| `/chat/fetchProfilePictureUrl/{instance}` | GET | evolution-helpers | ⚠️ Não testado | — |
| `/chat/findContacts/{instance}` | GET | evolution-sync | ⚠️ Não testado | — |
| `/chat/findMessages/{instance}` | GET | evolution-sync | ⚠️ Não testado | — |
| `/chat/getBase64FromMediaMessage/{instance}` | POST | evolution-media, recover-corrupted-audios | ⚠️ Não testado | — |
| `/chat/updatePresence/{instance}` | POST | whatsapp-webhook | ⚠️ Não testado | — |

---

## Próximos Passos

1. **Ativar licença** no painel do Evolution GO (Joaquim)
2. **Re-testar** todos os endpoints com instância real após ativação
3. **Step 62:** configurar webhook `/webhook/set/{instance}` apontando para `https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/evolution-webhook`
4. **Verificar** se Evolution GO usa mesma API contract do Evolution API v2 (suspeita: sim, mas path `/manager/` é exclusivo do GO)

---

## Variáveis necessárias (para wrangler secret put nas functions)

| Variável | Valor esperado |
|---|---|
| `EVOLUTION_API_URL` | `https://evolution-go-rxj2.srv1481814.hstgr.cloud` |
| `EVOLUTION_API_KEY` | GLOBAL_API_KEY do container (em `/root/.secrets/` da VPS) |
| `EVOLUTION_INSTANCE_NAME` | Nome da instância WhatsApp criada no GO |
