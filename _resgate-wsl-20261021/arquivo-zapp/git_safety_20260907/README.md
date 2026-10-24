# Preservação e classificação Git — Zapp Web V3

Data da coleta: 2026-09-07 (America/Sao_Paulo)

## Objetivo

Preservar integralmente o estado Git local antes de alinhar a pasta principal
`/home/joaquim_ataides/projetos/Zapp_Web_V3` com `origin/main` por fast-forward.
Nenhuma worktree, branch, alteração local ou arquivo não rastreado foi apagado.

## Evidências preservadas

- `repository-all-refs.bundle`: bundle completo, verificável e autocontido, criado com `--all`.
- 396 referências registradas no bundle, incluindo branches locais/remotas, tags, checkpoints do Cline, refs do Codex e refs de segurança dos 25 HEADs de worktree.
- SHA-256 do bundle: `72159bd8265c64f96491d1c84724c77defd13ec3a91745dc93b007aac6ce2812`.
- `worktrees/`: pacotes individuais das 13 worktrees sujas, cobrindo 33 entradas locais.
- Cada pacote contém HEAD, branch, status, patch binário de alterações rastreadas e, quando aplicável, arquivo `untracked.tar.gz` com os arquivos não rastreados.
- `validation.tsv`: validação não destrutiva de todos os patches e arquivos compactados; resultado esperado: zero falhas.
- `local-only-classification.tsv`: classificação reproduzível dos commits alcançáveis somente por branches locais.
- `SHA256SUMS`: checksums dos artefatos desta pasta.

## Classificação das 13 worktrees sujas

### Candidatas funcionais — exigem revisão humana e testes antes de reaproveitar

1. `Zapp_Web_V3_fix_10_10_exec_20260826`: fixture de autenticação E2E, hook/teste de Contact Intelligence, configuração Vite e novo cenário E2E de retorno à rota.
2. `Zapp_Web_V3_fix_webkit_spa_20260826`: `ProtectedRoute`, seu teste, cenário E2E de sessão e três configurações temporárias do Codex.
3. `Zapp_Web_V3_wave_webkit_e2e_20260826`: `ProtectedRoute` e cenário E2E de sessão.
4. `Zapp_Web_V3_post_merge_webkit_20260826`: remoção local de cenário E2E e dois arquivos do pnpm; a remoção pode representar decisão ou regressão e não deve ser assumida.

### Predominantemente artefatos gerados ou de auditoria — não autorizados para exclusão

1. `Zapp_Web_V3_audit_100_20260826`: relatórios de estado do schema.
2. `Zapp_Web_V3_audit_main`: `bun.lock`, `registry.json` e `types.ts.new`.
3. `Zapp_Web_V3_fix_supabase_cancellation`: `registry.json` e `types.ts.new`.
4. `Zapp_Web_V3_integration_sim_20260826`: `registry.json`.
5. `Zapp_Web_V3_p0_transfer_20260828`: arquivos pnpm e `types.ts.new`.
6. `Zapp_Web_V3_test_idempotency_order_20260828`: `types.ts.new`.
7. `Zapp_Web_V3_ts_consolidated_20260828`: arquivos pnpm.
8. `Zapp_Web_V3_typecheck_subset_20260826`: `types.ts.new`.
9. `Zapp_Web_V3_wave_release_20260826`: `registry.json` e `types.ts.new`.

Esta classificação é conservadora. “Provável artefato” não significa lixo e não autoriza remoção.

## Classificação dos commits locais

Foram encontrados 70 commits alcançáveis por branches locais e não por refs de `origin`:

- 25 têm patch equivalente já encontrado em alguma ref de `origin`.
- 43 não tiveram equivalência de patch comprovada em `origin` e permanecem preservados para revisão.
- 2 são merges ou commits sem patch unitário comparável.

Essa classificação compara conteúdo por `git patch-id --stable`; não declara automaticamente que os 43 commits devam ser publicados, apenas que não devem ser descartados sem triagem.

## Recuperação

Clonar todo o estado preservado:

```bash
git clone repository-all-refs.bundle Zapp_Web_V3_restaurado
```

Restaurar alterações rastreadas de uma worktree em uma cópia compatível:

```bash
git apply /caminho/do/pacote/unstaged.patch
git apply --cached /caminho/do/pacote/staged.patch
```

Restaurar arquivos não rastreados:

```bash
tar -xzf /caminho/do/pacote/untracked.tar.gz -C /caminho/da/worktree
```

Antes de restaurar, confira `head.txt`, `branch-ref.txt`, `status.txt` e `manifest.txt`. Os patches foram validados contra os respectivos estados originais; aplicá-los sobre outro commit pode exigir resolução manual.

## Limites desta operação

- Nenhuma limpeza foi executada.
- Nenhuma worktree ou branch foi removida.
- Nenhum commit, push, merge remoto ou alteração de banco foi realizado.
- O alinhamento da pasta principal usa exclusivamente `git merge --ff-only origin/main`, condicionado a uma última confirmação de worktree limpa e ancestralidade fast-forward.
