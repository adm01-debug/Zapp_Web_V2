# Evolution GO (WhatsApp) — referência para agentes

Ler quando mexer em conexão WhatsApp, QR Code, edge `evolution-api` ou na VPS da Evolution.

| O que | Valor |
|---|---|
| Flavor | **Evolution GO** (`evoapicloud/evolution-go`) — `EVOLUTION_API_FLAVOR=go` |
| URL pública | valor de `EVOLUTION_API_URL` nos secrets das Edge Functions (`supabase secrets list`); o front a lê de `public/version.json` |
| Hospedagem | VPS **Hostinger** (hostname: painel Hostinger → VPS, ou MCP `HOSTINGER`) → Gerenciador Docker, projeto da Evolution GO (nome = subdomínio da URL acima) |
| Containers | `<projeto>-api-1` (porta host mapeada → 4000; ver o projeto no Gerenciador Docker), `<projeto>-postgres-1`, `<projeto>-pg-backup-1` |
| Instância padrão | `PRINCIPAL` (`EVOLUTION_INSTANCE_NAME`; é o `instance_id` da conexão real em `whatsapp_connections`) |
| Auth | `EVOLUTION_API_KEY` (global, endpoints admin `/instance/*`) e `EVOLUTION_INSTANCE_TOKEN` (endpoints por instância `/send/*`, `/message/*`) — secrets nas Edge Functions, nunca no front |
| Tradução de rotas | `supabase/functions/_shared/evolution-go-routes.ts` (GO ↔ v2 legada) |
| Gestão da VPS | MCP **`HOSTINGER`** (VPS/Docker). **NÃO** é a VPS AtomicaBR/Portainer — Portainer não enxerga estes containers. |

O Postgres do projeto da Evolution GO é interno dela (estado de sessões WhatsApp). **Não
confundir com o banco do projeto** e não aplicar migrations do repo nele. A conexão
`[E2E] Conexão WhatsApp Teste` (`instance_id = E2E_FIXTURE`) é fixture do E2E — **não apagar**.

## Runbook: QR Code não aparece / trava no spinner (sessão órfã na GO)

Sintoma: dialog "Escanear QR Code" fica só com o loader; a conexão nunca pareia. Assinatura: o
registro da instância na GO vem com `jid` preenchido, `connected:false` e
`disconnect_reason:"Reconnecting"` — o device foi desvinculado no celular, mas o whatsmeow ainda tem
`Store.ID` e fica em loop; `Connect()` não abre o canal de QR, `/instance/qr` volta vazio e
`logout`/`reconnect` respondem 400/500 (`no active session found`).

A edge `evolution-api` (ação `connect`) resolve sozinha, em três camadas:
1. poll do `/instance/qr` (3× / 1,5s), porque o QR na GO é assíncrono;
2. sem QR + não logado + registro com `jid` → **recria a instância na GO** (`DELETE /instance/delete/{id}`
   + `POST /instance/create` com o **mesmo** `EVOLUTION_INSTANCE_TOKEN` e o nome `PRINCIPAL`), reconecta
   e faz novo poll, devolvendo `recovered:true`;
3. se ainda assim não sair QR, devolve `error:true`/409 — o front mostra "Gerar novo código".

`whatsapp_connections` não é tocado nesse fluxo e o token não muda — nenhum secret precisa ser
regerado. Não há passo manual no Postgres da GO (o MCP `HOSTINGER` não expõe docker-exec).
