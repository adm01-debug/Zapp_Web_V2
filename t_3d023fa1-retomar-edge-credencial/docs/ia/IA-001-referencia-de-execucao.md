# IA-001 — Referência técnica da execução

**Etapa do plano:** `IA-001` `[V]` *Fixar a referência técnica* — "Registrar commit, branch, árvore e data
da futura execução; comparar a referência com esta auditoria antes de alterar qualquer arquivo."
**Aceite:** diferenças posteriores ao commit analisado identificadas e incorporadas ao escopo.

## 1. Referência analisada pelo plano (auditoria)

| Item | Valor |
|---|---|
| Repositório | `adm01-debug/Zapp_Web_V2` |
| Commit | `5209b8a43730cf8e620295bc0a84850737bf9631` |
| Documento | `docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md` (v1.0, 29/09/2026), commitado em `cd135b60` (PR #1196) |

## 2. Referência congelada desta execução

| Item | Valor |
|---|---|
| Base | `origin/main` |
| Commit | `0ab84095d34548124d0feefb6cdec0dedda7c5fe` |
| Árvore (tree) | `8f10f51497060231cda043e764392cc5b040f890` |
| Data do commit | 2026-09-29 14:19:24 -0300 |
| Capturada em | 2026-09-29 14:21:18 -0300 (UTC 17:21) |
| Assunto | `fix(contatos): predicado unico de permissao, guards por mudanca real e gate do Excluir (#1198)` |
| Branch da tarefa | `hermes/ia-bloco-01-preparacao-26092914200da6` |
| Workspace | `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/ia-bloco-01-preparacao-26092914200da6` |
| Banco canônico conferido no `.hermes-tarefa` | `tnnnlkbymytvtqngbbqh` |

## 3. Diferenças entre a auditoria do plano e a referência de execução

Distância: **6 commits**, **51 arquivos**, **+4060 / -472 linhas**.

| Commit | Assunto |
|---|---|
| `0ab84095` | fix(contatos): predicado unico de permissao, guards por mudanca real e gate do Excluir (#1198) |
| `cd135b60` | docs(ia): plano de 200 etapas de correções e evolução da IA (#1196) |
| `694bf084` | fix(mapa): F3.E23-E34 estado de busca explícito na lista de sugestões (#1195) |
| `d35e9225` | feat(catalogo): chat envia pelo SendProductDialog com o contato da conversa (#1192) |
| `01ae7d43` | fix(talkx): retomada automática respeita o motivo da pausa (V03) (#1190) |
| `b71bd414` | fix: F-03 strip ANSI do log antes de capturar funções inalteradas no deploy (#1191) |

**Nenhum arquivo de IA, voz, transcrição, classificação ou chatbot mudou desde a auditoria.** Prova:

```bash
git diff --name-only 5209b8a43730cf8e620295bc0a84850737bf9631..origin/main \
  | grep -Ei "ai-|elevenlabs|voice-|chatbot|sentiment|classify-"
# saída: vazia
```

Ou seja: **os 10 achados do plano seguem de pé no HEAD atual** e valem no código que será alterado.

### 3.1 Mudanças que importam para este plano (incorporadas ao escopo)

| Mudança | Por que importa |
|---|---|
| 3 migrations novas de contatos (`20260929770000_contacts_can_edit_contact_helper.sql`, `20260929780000_contacts_single_permission_predicate.sql`, `20260929790000_contacts_hijack_guards_only_on_change.sql`) | mexem no predicado de permissão de contatos — base da **IA-004** (matriz de autorização) e da **IA-015** (leitura ≠ alteração). A matriz foi levantada no HEAD, não no commit do plano. |
| `supabase/functions/{talkx-scheduler,talkx-send}/index.ts` e `_shared/talkx-resume-policy.ts` (+ teste) | primeira extração de política para `_shared` — referência de desenho para **IA-031/IA-032** (camada única) e **IA-048** (estado/retomada). |
| `.github/workflows/ci.yml` e `deploy-functions.yml` | mudam gates e o caminho de deploy de Edge Function (que é **automático no merge na `main`** — o environment `producao-edge-functions` tem só branch policy, sem aprovação humana) — condição de **IA-105** e do Bloco 20. |
| `supabase/deployment-manifest.json` | `function_count` **67 → 67**, `source_file_count` 94 → 95, `verify_jwt_true` **57 → 57**, `verify_jwt_false` **10 → 10**. O manifesto é a prova do estado de autenticação de cada função (ele lista nome, entrypoint e `verify_jwt` por função) e é regenerado pelo próprio pipeline. |

> **Armadilha medida aqui (vale para os próximos blocos):** a cópia de referência `~/projetos/Zapp_Web_V2`
> está no commit local `cbe75963` (2 commits atrás de `origin/main`) e o manifesto dela diz **69 funções /
> 59 `true`**. Quem ler o arquivo da cópia de referência em vez do `main` reporta 2 funções a mais: as
> funções **`sicoob-bridge` e `sicoob-bridge-reply` foram deletadas** entre `cbe75963` e `0ab84095`
> (`git diff --name-status cbe75963..0ab84095 -- supabase/functions` → 2 `D`). Números deste documento
> foram lidos no **workspace da tarefa** (que nasce de `origin/main`) ou com `git show <ref>:<arquivo>`.


## 4. Regra de revalidação por bloco (derivada da IA-001)

Antes de cada bloco de execução:

```bash
git fetch origin
git log -1 --format='%H %T %ad %s' origin/main   # comparar com a referência desta tabela
```

Se `origin/main` avançou: registrar o novo commit no `IA-xxx` do bloco; se algum arquivo **do escopo
daquele bloco** mudou, revalidar o achado no código antes de escrever a correção. A referência deste
arquivo (`0ab84095`) é a linha de base do Bloco 01; blocos seguintes registram a sua própria.

## 5. Aceite da etapa

- [x] Commit, branch, árvore e data registrados.
- [x] Comparação com a auditoria feita: 6 commits, 51 arquivos, nenhum arquivo de IA tocado.
- [x] Diferenças incorporadas ao escopo (tabela 3.1) e regra de revalidação definida.
