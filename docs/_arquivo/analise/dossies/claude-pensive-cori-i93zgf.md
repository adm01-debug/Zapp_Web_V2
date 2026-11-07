# Dossiê: claude/pensive-cori-i93zgf

## Identificação

- **Branch**: `claude/pensive-cori-i93zgf`
- **Tip SHA**: `b4bd6fd2e4a68a0562d921ef62159a30ac3381ac1a`
- **Analisado em**: 2026-10-31
- **Sessão**: `claude/trusting-albattani-9x3ipg`

## Veredito: COBERTA (confiança 0.85)

Duas mudanças de qualidade marginal que não corrigem bugs e têm riscos:

## Evidência

### merge-tree

```
git merge-tree --write-tree origin/main origin/claude/pensive-cori-i93zgf
→ dacdabe13fa0af1ebef1afc66c45e0c90c0ebee8  (≠ main tree f7b413078...)
exit code 0 — sem conflitos
```

### Delta (2 arquivos)

**`src/hooks/chat/useNextBestAction.ts`** — line 34:
```diff
-export const nextBestActionKey = (contactId: string | null | undefined) =>
+export const nextBestActionKey = (contactId: string) =>
```
Tightening potencialmente incorreto: remove suporte a `null | undefined` na key do
React Query. Se qualquer chamador passar `null` enquanto o contactId não está carregado,
o TypeScript passaria a reclamar, ou pior: o hook seria chamado com `undefined` convertido
implicitamente. Main mantém a versão mais permissiva e segura.

**`src/hooks/tasks/workItemAggregates.ts`** — line 102:
```diff
-  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
+  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
```
Mudança de notação de regex: a versão da branch usa caracteres Unicode literais em vez de
escape `\u`, tornando o código menos legível. Funcionalmente equivalente, mas regressão de
manutenibilidade.

### Estado em main

Ambos os arquivos em main têm a versão **anterior** (mais robusta para o tipo, mais legível
para o regex). As mudanças da branch seriam uma regressão de qualidade.

## Decisão

**Branch apagada.** As mudanças são neutras a negativas: type tightening pode quebrar
chamadores que passam null/undefined quando contactId não está pronto; regex com chars
literais é menos legível. Nenhuma das duas corrige um bug real documentado.
