# `VIRUSTOTAL_API_KEY` — segredo do scanner de arquivos

Nota curta pedida pelo cartão do `file-security-scanner` (achado HZ1-02, motor M28).
**Nenhum valor** aparece aqui, em log, em teste ou no repositório.

| Nome | Superfície/ambiente | Consumidor | Classe | Rotação |
|---|---|---|---|---|
| `VIRUSTOTAL_API_KEY` | Edge env (`supabase/functions`), injetada fora do repositório | somente `supabase/functions/file-security-scanner` | **segredo** | chave de API do VirusTotal (painel do provedor) → atualizar o Edge env da função |

## Onde vive

- **Produção:** Edge env do projeto Supabase, definido pelo procedimento padrão de
  segredo de Edge Function (`supabase secrets set`, sem valor no repositório nem em
  chat). Owner: `adm01`.
- **Local:** variável de ambiente do `deno` / `.env` **local e não versionado**; os
  testes não usam chave real (o provedor é substituído por stub em memória).
- **Nunca:** `.env.production`, `VITE_*`, bundle, `docs/`, comentário de código.

## Rotação

1. Gerar a nova chave no painel do VirusTotal.
2. Atualizar o Edge env da função `file-security-scanner` (produção) — **só o Joaquim
   autoriza deploy/produção**; o registro do deploy segue `docs/DEPLOYMENT.md`.
3. Atualizar a variável local das sessões de desenvolvimento.
4. Revogar a chave antiga no provedor depois da troca.
5. Confirmar por evidência: uma varredura com veredito devolvido (não
   `scanned:false`) — nenhum passo registra a chave.

## Comportamento quando o segredo não existe

Se a variável estiver ausente, a função **não inventa varredura**: responde
`200 {"scanned": false, "reason": "scanner_not_configured"}` (envio não bloqueado,
aviso ao usuário) e grava uma linha de `warn` sem a chave. Chave recusada pelo
provedor (401/403) tem o mesmo tratamento, com `reason: "scanner_auth_failed"`.
