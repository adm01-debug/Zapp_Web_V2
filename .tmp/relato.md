Especialista: hugo

## O que mudou e por quê
- `src/services/mediaRecovery.ts` (novo): cliente da Edge `recover-message-media` (`recoverMessageMedia`, com `AbortSignal`), teto de tentativas por objeto em memória do módulo (`MAX_RECOVERY_ATTEMPTS` = 3 dentro de `RECOVERY_WINDOW_MS` = 10 min, mais `markRecoveryExhausted` para resposta definitiva) e as duas pontas do par (url → id da mensagem) no cache do React Query (`findMessageIdByMediaUrl`, `replaceMediaUrlInCache`). `parseRecoveryBody` recusa status desconhecido em vez de tratar como sucesso. Nenhuma URL nem token é logado.
- `src/hooks/storage/useResolvedStorageUrl.ts`: `refresh` de URL que NÃO é objeto do Storage passa a chamar `recoverExpiredMedia` — acha o id da mensagem no cache de mídia, chama a Edge, assina o locator permanente que ela devolve (bucket privado) e reescreve o cache; desmontar ou trocar de mídia aborta a chamada com `AbortController`. Passado o teto (ou resposta `negado`), a Edge não é mais chamada: estado final `url: ''` + erro `Mídia indisponível`, sem laço. O caminho de locator do Storage (assinatura, assinatura em lote, cooldown) ficou intacto.
- `src/hooks/chat/useContactMedia.ts`: `contactMediaKey` passa a usar a raiz `CONTACT_MEDIA_QUERY_ROOT` exportada pelo serviço — uma única fonte da chave que a recuperação lê e escreve.
- `src/hooks/storage/__tests__/useResolvedStorageUrl.recovery.test.tsx` (novo): 8 testes (recuperação, `ja_permanente`, sem par (url → id), teto de tentativas, erro de rede, `negado`, aborto ao desmontar e locator vivo que não chama a Edge).

## Prova
- vermelho antes: `npx vitest run src/hooks/storage/__tests__/useResolvedStorageUrl.recovery.test.tsx` com o `refresh` no comportamento anterior (`if (!reference) return source;`) → `Tests 6 failed | 2 passed (8)` (os 2 que passam já são as regressões: URL externa sem par e locator vivo não chamam a Edge).
- verde depois: `npx vitest run src/hooks/storage/__tests__/useResolvedStorageUrl.recovery.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`.
- regressão da área: `npx vitest run src/hooks/storage src/hooks/__tests__/useResolvedStorageUrl.test.tsx src/components/inbox/media-gallery src/components/inbox/tabs` → `Test Files 52 passed | 1 failed (53); Tests 526 passed | 1 failed | 1 todo (528)` — a única falha é `FilesTab.period.integration.test.tsx` estourando `Test timed out in 15000ms` sob a carga da suíte; rodando sozinho (`npx vitest run src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx`) → `Test Files 1 passed (1); Tests 9 passed | 1 todo (10)`, ou seja, é teste de tempo, não regressão do diff.
- lint dos arquivos tocados: `npx eslint src/services/mediaRecovery.ts src/hooks/storage/useResolvedStorageUrl.ts src/hooks/chat/useContactMedia.ts src/hooks/storage/__tests__/useResolvedStorageUrl.recovery.test.tsx` → exit 0, sem aviso.
- commit local: `8343a82207 feat(midia): recupera no front a midia do WhatsApp com URL de CDN vencida`.

## O que NÃO fiz e por quê
- Não toquei em componentes (fora dos arquivos permitidos pelo cartão): o balão do chat entrega a URL sem o id da mensagem, então lá a recuperação depende de o par (url → id) chegar pelo cache de mídia; o caminho ligado hoje é o das telas que usam esse cache (galeria e arquivos).
- Não leio o campo `motivo` da resposta da Edge: o contrato lido no base só tem `status`; status diferente de `ok`/`ja_permanente` apenas conta tentativa, e o teto fecha o laço.
