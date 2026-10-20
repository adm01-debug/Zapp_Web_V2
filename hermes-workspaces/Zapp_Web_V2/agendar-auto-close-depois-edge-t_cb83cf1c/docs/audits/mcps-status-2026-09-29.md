# E44 — Status dos MCPs Quebrados

> Documento criado em 2026-09-29 para fechar a etapa E44 do
> `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md`.
> Observações coletadas desde 2026-09-16 (estado-base) e confirmadas em 29/09.

## Estado-base (2026-09-20): 5 MCPs com falha

| MCP | Erro | Status |
|-----|------|--------|
| CLOUDFLARE-WORKERS | 410 CLIENT_HTTP_NOT_IMPLEMENTED | Aposentado (endpoint removido) |
| LALAMOVE ×2 | 404 Not Found | Aposentado (integração descontinuada) |
| VS-CODE-VPS | 404 Not Found | Aposentado (VPS tool removido) |
| PLAYWRIGHT | timeout | Substituído por Playwright local nos E2E |
| N8N stubs | `search_workflows`/`execution_logs` não existem | Stubs removidos — ver E45 |

## Estado em 2026-09-29

### CLOUDFLARE-MCP (antigo CLOUDFLARE-WORKERS)

```
CLOUDFLARE_-_MCP_-_WORK (410): "SdkHttpError dialing https://api.anthropic.com/v2/[...]/mcp?[...]
(CLIENT_HTTP_NOT_IMPLEMENTED)"
```

**Diagnóstico**: O endpoint da Anthropic que hospeda este MCP retornou 410 Gone —
o servidor foi removido. Não é falha de configuração do lado do usuário; é o provider
que descontinuou o endpoint.

**Ação**: Nada a fazer via agente. O MCP deve ser removido da config do Claude Code
quando Joaquim quiser limpar os erros de sessão. Enquanto estiver configurado, falhará
toda sessão sem nenhum impacto funcional (as tools não existem mais).

### PORTAINER-MCP

```
PORTAINER_-_MCP: "Connection closed again while reconnecting"
```

**Diagnóstico**: Falha de transporte — o servidor MCP no Portainer fechou a conexão.
Causas possíveis: container parado, rede VPS instável, timeout de idle.

**Ação**: Verificar no Portainer se o container do MCP está em execução. Se estiver
parado, reiniciar. Se o erro persistir, verificar logs do container.

**Impacto atual**: Portainer da VPS AtomicaBR não acessível por agente. Todas as
operações que dependiam do Portainer (exec em containers, restart, logs) estão
indisponíveis nesta sessão.

### MCPs que foram desligados com sucesso

- **LALAMOVE ×2**: removidos da config (integração descontinuada)
- **VS-CODE-VPS**: removido (tool substituído)
- **PLAYWRIGHT timeout**: resolvido com Playwright local (`/opt/pw-browsers/chromium`)

## Recomendação

1. **CLOUDFLARE-MCP**: remover da config Claude Code — o endpoint não existe mais.
2. **PORTAINER-MCP**: investigar o container na VPS AtomicaBR; se o serviço for necessário,
   reiniciar via SSH direto. Se não for mais necessário, remover da config.

Etapa E44 documentada em 2026-09-29.

## Estado em 2026-10-08 (reconferido — item E44 / cartão SL-213)

Reconferência na ponta do dia para o cartão SL-213 da 2ª leva de melhorias:

- A sessão de 07/10 (evidência do item E44 no `INVENTARIO_MELHORIAS_2026-10-07.tsv`)
  **ainda reporta falha** dos dois conectores: `CLOUDFLARE-MCP-WORKERS` (410
  `CLIENT_HTTP_NOT_IMPLEMENTED`) e `VS CODE - MCP - VPS` (404). Logo, o "removido" da
  linha dos MCPs desligados **não foi aplicado** ao VS-CODE-VPS — ele continua
  configurado e continua falhando toda sessão.
- Os dois são **configuração do CLIENTE** (conta/agente claude.ai), não deste
  repositório. O repo não versiona nenhum `mcpServers`/`.mcp.json`: `git grep -i
  "mcpServers\|mcp_servers"` só encontra `.codex/config.toml`, e ali os servidores são
  `github`, `context7`, `exa`, `memory`, `playwright` e `sequential-thinking` — nenhum
  dos quebrados. Os demais arquivos com "mcp" no nome são a ACL de `mcp_exec` no banco
  (`scripts/db-audit/check-mcp-exec-acl.*` + migrations correlatas) e este documento.
- Fechar o critério "sessão nova com 0 MCPs falhando" depende de **remover ou
  reconfigurar os dois conectores no claude.ai** — ação do dono (👤 Joaquim), sem
  contrapartida de código neste repositório: não há arquivo no repo que crie, configure
  ou possa desligar esses conectores.
- Sem mudança de código; nenhum caminho do defeito existe dentro do repositório.

Reconferido em 2026-10-08 (SL-213).
