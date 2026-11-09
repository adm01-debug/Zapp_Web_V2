# Automação Vercel

`ignore-build.sh` decide builds de preview; produção sempre cria um deployment.
`verify-production.mjs` mantém o smoke legado de um endereço V2 informado.
`verify-release-targets.mjs` acompanha os dois destinos que hoje têm donos diferentes:

- `v2`: `https://zapp-web-v2.vercel.app`, cujo `buildId` deve ser o SHA atual da `main`;
- `v3`: `https://zappweb.app.br`, cujo `gitSha` deve coincidir com o `releaseId` da V3.

O workflow `front-release-targets.yml` roda as duas trilhas em jobs separados após cada push na
`main`, de hora em hora e por dispatch. O job V2 espera até cinco minutos pela propagação da Vercel.
O job V3 valida a identidade publicada sem compará-la com o SHA deste repositório V2.

```sh
node scripts/vercel/verify-release-targets.mjs --target=v2 --expected-sha="$(git rev-parse HEAD)" --attempts=30 --interval-ms=10000
node scripts/vercel/verify-release-targets.mjs --target=v3 --attempts=3 --interval-ms=5000
```

Nenhum secret é usado. As leituras são públicas e os resultados vão para o log e o Job Summary.
