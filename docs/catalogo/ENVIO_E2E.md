# E08 — Envio de produto: diagnóstico ponta a ponta (2026-09-12)

## Pergunta do plano
`messages` nunca teve uma imagem `imagedelivery.net` nem um texto de template do catálogo
(seção 0, item 7). O fluxo "Enviar produto" funciona hoje contra o PromoGifts, ou só contra
imagens já hospedadas no Storage do próprio ZAPP?

## O que foi verificado (código real, lido nesta sessão)

1. **Caminho real do envio:** `useSendProduct.sendProductToContact` → `sendOutboundMessage`
   (`src/services/outbound-message.service.ts`) → RPC `enqueue_outbound_message` (enfileira,
   atômico) → edge `message-delivery` (`supabase/functions/message-delivery/index.ts`), que
   resolve o `media_url` e chama a Evolution API.
2. **A URL externa do produto passa sem re-upload.** `message-delivery:249` chama
   `resolvePrivateBucketUrl(caller, claim.media_url, undefined, supabaseUrl)`
   (`supabase/functions/_shared/evolution-api-proxy.ts:272`). Essa função só transforma a URL
   quando ela bate com o padrão de bucket privado (`whatsapp-media`/`audio-messages`); para
   qualquer outra coisa — inclusive `https://imagedelivery.net/.../public` — devolve a URL
   **inalterada** (`if (!objectReference) return url;`). Ou seja: o código já suporta o mediaUrl
   do PromoGifts sem nenhuma mudança.
3. **`external_id` é gravado no servidor, não no frontend.** `message-delivery:285` chama a RPC
   de conclusão com `p_external_id: externalId` diretamente no banco. `useSendProduct.ts`
   descartar o retorno de `sendOutboundMessage` não é um bug: a coluna é preenchida pelo backend
   de qualquer forma. O "(fix do #209)" citado no plano original não corresponde a nada
   pendente — removido da E08.
4. **Nunca testado em produção:** consulta real ao banco — dos 2.218 registros
   `messages.message_type='image'` com `media_url` preenchido, **100% usam o host
   `tnnnlkbymytvtqngbbqh.supabase.co`** (Storage do próprio ZAPP); nenhum usa um domínio
   externo. O caminho é suportado pelo código, mas nunca foi exercitado de verdade.

## O que NÃO foi possível verificar nesta sessão, e por quê

- **Envio real via `message-delivery`:** a função exige `requireAuth` — um JWT de usuário
  autenticado validado por `auth.getUser()` (`supabase/functions/_shared/validation.ts:294`).
  Este ambiente (Claude Code no VPS) não tem uma sessão de login de usuário para gerar esse
  token; não existe fixture de e2e logado neste repo (`e2e/auth.spec.ts` só testa validação
  de formulário, sem login real).
- **Envio direto via Evolution API (bypass do app, só para confirmar a entrega da mídia):**
  `evo_status` retornou **401 "apikey provavelmente inválida"** para a instância `wpp2`. É uma
  falha de credencial do MCP `EVO API - MCP`, **não relacionada ao código do Catálogo** — sinalizo
  aqui para não se perder, mas não mexo nela (infraestrutura de outro escopo).

## Conclusão

Sem patch necessário no código (a lógica já está correta — item 2 acima). O risco real não é
de código, é de **cobertura empírica zero** para mediaUrl externo. Fica registrado como item de
atenção para a E85 (primeiro envio de catálogo em produção, com throttle) e para quando o
acesso de login/EVO estiver disponível para um teste ao vivo.
