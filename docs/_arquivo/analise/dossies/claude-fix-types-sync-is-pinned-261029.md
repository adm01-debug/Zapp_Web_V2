# Dossiê: claude/fix-types-sync-is-pinned-261029

## Identificação

- **Branch**: `claude/fix-types-sync-is-pinned-261029`
- **Tip SHA**: `f87dc1ab747caaf24378e25c6259b7ae4c7bf05a`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: COBERTA (confiança 0.93)

A branch foi criada em 2026-10-29 para contornar um erro de TypeScript no campo `is_pinned`
da tabela `contact_notes` (migration `20261026200000`). O contorno usou `const pinField: any`
com `// eslint-disable-next-line @typescript-eslint/no-explicit-any`.

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/claude/fix-types-sync-is-pinned-261029
→ ab18c074b2ca6c914d588f08a05230c3dd00114e  (≠ main tree f7b413078...)
```

### Delta (1 arquivo)

`src/services/contact.service.ts`:
- Adiciona `const pinField: any` + 2 comentários `eslint-disable-next-line @typescript-eslint/no-explicit-any`
- Remove o spread inline direto `...(options?.isPinned === true ? { is_pinned: true } : {})`
- Adiciona `update(updates as any)` no método `updateContactNote`

### Estado em main

`src/integrations/supabase/types.ts` já contém `is_pinned`:
```
is_pinned: boolean        (linha 2266 — select)
is_pinned?: boolean       (linha 2278 — insert)
is_pinned?: boolean       (linha 2290 — update)
```

O workflow `types-sync` rodou e regenerou os types após a migration ser aplicada. O campo
agora está fortemente tipado — o workaround `any` seria regressão de tipo.

## Decisão

**Branch apagada.** Combinar introduziria `any` desnecessário onde tipos fortes já existem,
violando as regras de qualidade do projeto (proibido usar `@ts-ignore`/`any` para esconder
erros de TypeScript que podem ser resolvidos corretamente).
