# Guarda de documentação Realtime

```bash
node scripts/docs/verificar-docs-realtime.mjs
```

Não altera nada: relê `docs/REALTIME-CHANNELS-INVENTORY.md`,
`docs/adr/ADR-009-inbox-fonte-unica-de-mensagens.md` e
`docs/JORNADA_MENSAGEM_WHATSAPP.md` contra o código e as migrations, e falha
se a documentação deixou de corresponder ao repositório. Confere:

1. todo `arquivo:linha` citado existe e a linha citada existe no arquivo;
2. todo canal do inventário aponta a tabela assinada de verdade no código;
3. o nome do canal aparece no arquivo citado;
4. a tabela está na publication `supabase_realtime` (provado por replay das
   migrations).

Exit: `0` = documentação consistente; `1` = alguma divergência encontrada.
