# Proxy de saída fixado por IP para previews

## Objetivo e propriedade de segurança

`fetch-link-preview` **não pode** abrir conexões diretamente para URLs
controladas por usuários. Uma pré-validação DNS seguida de `fetch(hostname)`
continua vulnerável a DNS rebinding porque o runtime pode resolver o hostname
novamente. O serviço em `infrastructure/preview-egress-proxy` resolve cada hop
uma única vez, recusa respostas DNS mistas/não públicas e abre o socket para o
IP validado. Para HTTPS, o Host e o SNI continuam sendo o hostname original.

O contrato tem os seguintes limites fixos: somente GET HTTP(S), portas 80/443,
três redirects, seis segundos totais, 512 KiB de HTML e sem proxy de ambiente.
Requisições entre a Edge e o serviço usam HMAC-SHA-256, timestamp curto e nonce
de uso único. Não há fallback para `fetch` direto na Edge Function.

## Pré-requisitos de produção

Não promover enquanto todos os itens abaixo não forem verdadeiros:

1. Criar um hostname dedicado, por exemplo `preview-egress.<dominio-controlado>`,
   com DNS apontando para a VPS. O certificado TLS público deve validar esse
   hostname; IP direto e certificado autoassinado são proibidos.
2. Inspecionar a configuração atual do Traefik na VPS. Ele já é dono de 80/443;
   portanto, acrescentar uma rota **somente** para o hostname dedicado que
   encaminhe a `127.0.0.1:18080`. Não substituir nem reiniciar os containers da
   Evolution para isso.
3. Gerar um segredo aleatório de pelo menos 32 bytes e gravá-lo apenas nos dois
   gerenciadores de secrets: `PREVIEW_EGRESS_SHARED_SECRET` na VPS e na Edge
   Function. Nunca colocá-lo em compose, Git, logs, PR ou chat.
4. Configurar `PREVIEW_EGRESS_PROXY_URL` na Edge como a URL HTTPS completa,
   terminando em `/v1/fetch`. A Edge recusa HTTP, porta explícita e URL com
   credenciais.
5. Ter acesso administrativo à VPS e ao projeto Supabase canônico
   `tnnnlkbymytvtqngbbqh`. Sem ambos, o deploy deve ficar bloqueado.

## Validação antes do deploy

Execute no checkout da PR:

```bash
deno test --allow-env \
  supabase/functions/_shared/__tests__/ssrf.test.ts \
  supabase/functions/_shared/__tests__/secure-egress.test.ts
docker run --rm -v "$PWD:/workspace" \
  -w /workspace/infrastructure/preview-egress-proxy \
  golang:1.24-alpine go test ./...
docker build -t zapp-preview-egress-proxy:local infrastructure/preview-egress-proxy
```

Os testes simulam DNS rebinding: um hostname público é resolvido para um IP
público e o dialer é obrigado a usar exatamente aquele IP. O teste também prova
que uma resposta DNS privada não alcança o dialer, que replay HMAC é recusado e
que Host/SNI são preservados.

## Deploy controlado

1. Fazer merge da PR somente com CI verde e após os pré-requisitos acima.
2. Na VPS, copiar exclusivamente o diretório
   `infrastructure/preview-egress-proxy/` para o diretório operacional aprovado.
   Criar o secret no gerenciador de secrets local da VPS; o `docker-compose.yml`
   expõe apenas `127.0.0.1:18080`.
3. Construir e iniciar o serviço com a configuração da VPS. Confirmar que
   `GET /healthz` responde `200` pela rede local e que o ingresso HTTPS possui
   certificado válido pelo hostname público.
4. Configurar os dois Edge secrets com o mecanismo oficial (Dashboard ou
   `supabase secrets set`): `PREVIEW_EGRESS_PROXY_URL` e
   `PREVIEW_EGRESS_SHARED_SECRET`. Não imprimir os valores.
5. Acionar o workflow manual `deploy-functions.yml` na `main`; ele confere o
   manifesto antes do deploy de `fetch-link-preview`.
6. Executar smoke por `fetch-link-preview` contra uma página HTML pública
   conhecida e verificar resposta com `preview` preenchido. Em seguida, testar
   destinos negativos: `127.0.0.1`, metadata `169.254.169.254`, URL com
   credenciais, porta 8443 e redirect para endereço privado. Todos devem
   retornar `preview: null` sem detalhes internos.
7. Monitorar logs da Edge e do proxy por 15 minutos. Se houver erro, remover
   **primeiro** os dois Edge secrets ou apontar o workflow para a revisão
   anterior; não habilitar fetch direto como rollback.

## Critério de aceite

- O certificado do hostname do proxy é válido e verificável.
- O proxy não está acessível em porta pública sem o ingresso TLS.
- Uma chamada assinada válida a conteúdo HTML público funciona.
- Assinatura inválida, timestamp vencido e nonce repetido retornam 401.
- Os cinco cenários negativos acima não chegam à rede privada.
- A Edge não contém caminho alternativo que faça fetch do URL recebido.
