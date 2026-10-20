# Evidencias DESCARTADAS (preservadas para auditoria do processo)

Motivo: estas medicoes rodaram com o banco em estado diferente do rotulado,
porque duas invocacoes do harness compartilharam o mesmo container Docker.

1. `*-10000` listados aqui: medidos com a tabela de 100.000 linhas (o container
   foi reaproveitado pela varredura seguinte antes de a fase terminar).
2. `*-100000` listados aqui: a varredura do volume 100k rodou a fase "baseline"
   DEPOIS que os indices propostos (idx1/idx2/idx3) ja existiam no banco.

As medicoes validas de 100k e 10k foram refeitas em container dedicado e estao
na pasta pai (arquivos `fase*-foco*-100000.txt`, `fase*-10000.txt`, etc.).
Nada foi apagado: os arquivos foram apenas movidos para ca.
