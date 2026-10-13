Especialista: Edgar (area-edge-api)

## Sensibilidade
- O diff toca remoção de objeto no bucket (storage.remove do avatar anterior). Nada de service_role novo, nada de RLS, nada de rateLimit/requireRole/verifyHmac. A remoção é best-effort (só `console.warn` em erro), acontece SÓ depois de o upload novo ter sucesso e SÓ para objeto localizável na URL pública do próprio bucket — URL externa (CDN do WhatsApp) devolve `null` e nada é removido (prova: teste "não remove quando o anterior é externo").
- Nenhuma proteção afrouxada: o download do avatar passa a usar a MESMA política de egress (R2-API-009) do resto da mídia; antes o batch buscava a foto com `fetch` cru, sem validação de destino.
- Nenhuma referência a banco/endpoint de produção; testes com stub em memória.
- O que muda para quem chama: `persistProfilePicture(client, phone, url)` vira `(client, contactId, url, previousUrl?)`. Os callers internos (webhook handlers/messages, batch) foram atualizados no mesmo commit.

## Escopo do diff
- 8 arquivos no `git diff --stat` deste commit, dos quais 2 são de teste; 5 casos de teste novos (4 em `avatar-storage-path.test.ts`, 1 em `batch-fetch-avatars/index.test.ts`).
- Arquivos do cartão: `evolution-helpers.ts`, `batch-fetch-avatars/`, testes.
- Arquivos NO CARTÃO-NÃO-LISTADOS e por que foram indispensáveis: `evolution-types.ts` (o contrato mínimo de storage só tinha `upload`/`getPublicUrl`; a remoção do objeto antigo exige `remove?`), `evolution-webhook-handlers.ts` e `evolution-webhook-messages.ts` (são os DOIS callers de `persistProfilePicture`; o caminho novo é por `contact_uuid`, que só o caller conhece — sem atualizá-los a assinatura quebraria). Sem esses três o cartão não fecha; todos são `supabase/functions/**`, minha área.
- `.tmp/relato.md` é o próprio relato (aparece no stat por ser versionado neste repo).

## O que mudou e por quê
- evolution-helpers.ts: `avatarObjectPath` deixa de ser `avatars/<telefone>.jpg` (derivável pelo número) e passa a `contacts/<contact_uuid>/<token>.jpg`, com token aleatório por gravação — a URL pública não é mais adivinhável. Novos `avatarObjectPathFromUrl` (acha o objeto na URL pública) e `persistProfilePicture` com `upsert:false` + remoção do objeto anterior.
- evolution-webhook-handlers.ts / evolution-webhook-messages.ts: passam o id do contato e a URL anterior (contato novo: o id só nasce no insert, então o avatar é persistido logo em seguida).
- batch-fetch-avatars/index.ts: a seleção inclui o caminho LEGADO mesmo dentro do backoff de 7d; o loop re-hospeda o objeto antigo (bytes do próprio bucket, não depende de a Evolution ainda servir a foto) no caminho novo e remove o antigo. Contatos sem avatar/CDN continuam via Evolution, agora por `persistProfilePicture`.
- evolution-types.ts: `remove?` opcional no contrato mínimo de storage.
- Testes: `avatar-storage-path.test.ts` reescrito para o caminho novo; novo `batch-fetch-avatars/index.test.ts` cobre a migração do legado.

## Prova
- vermelho antes (fontes em stash, teste novo aplicado): `deno test --allow-all --no-check supabase/functions/_shared/__tests__/avatar-storage-path.test.ts` → `SyntaxError: The requested module '../evolution-helpers.ts' does not provide an export named 'avatarObjectPathFromUrl'` / `FAILED | 0 passed | 1 failed`.
- verde depois: `deno test --allow-all --no-check supabase/functions/_shared/__tests__/avatar-storage-path.test.ts supabase/functions/batch-fetch-avatars/index.test.ts` → `ok | 5 passed | 0 failed`.
- regressão: `deno test --allow-all --no-check supabase/functions/_shared/__tests__/` → `ok | 602 passed | 0 failed | 2 ignored`.

## Ramos de erro (antes → depois)
- upload falha: `return null` + console.error (igual ao anterior).
- remoção do anterior: antes não existia; agora best-effort (warn), nunca derruba o fluxo e roda só após upload OK.
- batch: foto ausente/download rejeitado → `failed++` + marca `attempted_at` (mesmo efeito de antes). Antes o batch abortava todo o processamento sem conexão ativa; agora só aborta se não houver conexão ativa E nenhum legado a migrar.

## O que NÃO fiz e por quê
- Não tornei o bucket privado nem mexi em policy/migration: o cartão pede o caminho não adivinhável; a URL segue pública por objeto, mas não derivável. Bucket/RLS é trilha de banco (worker sql) — registrado como fora da minha área.
- Não criei edge nova: o cron `avatars-refresh` já chama `/functions/v1/batch-fetch-avatars` (scripts/db-audit/cron-secret-l5-contract.test.sh:424-426), então a migração vive nele.
