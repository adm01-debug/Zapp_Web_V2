# Automação Vercel

`ignore-build.sh` decide builds de preview; produção sempre cria um deployment.
`verify-release-targets.mjs` acompanha os três destinos possíveis do domínio principal:

- `v2`: `https://zapp-web-v2.vercel.app`, cujo `buildId` deve ser o SHA atual da `main`;
- `v3`: `https://zappweb.app.br`, cujo `gitSha` deve coincidir com o `releaseId` da V3;
- `dominio`: `https://zappweb.app.br` servindo o build do **V2** (virada de produção), com o
  mesmo contrato de `buildId` do alvo `v2`.

O workflow `front-release-targets.yml` roda as trilhas em jobs separados após cada push na
`main`, de hora em hora e por dispatch. O job V2 espera até cinco minutos pela propagação da Vercel.
O job V3 valida a identidade publicada sem compará-la com o SHA deste repositório V2.

A virada do domínio é ligada pela variable `ZAPP_PROD_TARGET=v2` (Settings → Variables):
nesse modo o job `v2-dominio` valida `dominio` contra o SHA da `main` e o job `v3-domain` fica
desligado, de modo que as duas trilhas nunca rodam juntas. Sem a variable, nada muda.

```sh
node scripts/vercel/verify-release-targets.mjs --target=v2 --expected-sha="$(git rev-parse HEAD)" --attempts=30 --interval-ms=10000
node scripts/vercel/verify-release-targets.mjs --target=v3 --attempts=3 --interval-ms=5000
node scripts/vercel/verify-release-targets.mjs --target=dominio --expected-sha="$(git rev-parse HEAD)" --attempts=30 --interval-ms=10000
```

Os testes ficam em `scripts/ci/verify-release-targets-*.unit.mjs` (`node --test`).

Nenhum secret é usado. As leituras são públicas e os resultados vão para o log e o Job Summary.
