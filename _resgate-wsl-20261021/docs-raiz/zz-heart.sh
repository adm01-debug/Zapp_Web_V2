#!/bin/bash
# Heartbeat detached: escreve um tique a cada 5s por 150s. Prova se um processo
# destacado sobrevive ao fim das sessões SSH (e se a VM continua de pé entre chamadas).
rm -f /home/joaquim_ataides/zz-heart.txt
setsid /bin/bash -c '
  for i in $(seq 1 30); do
    echo "$(date +%H:%M:%S) tick=$i uptime=$(cut -d. -f1 /proc/uptime)" >> /home/joaquim_ataides/zz-heart.txt
    sleep 5
  done
  echo "FIM $(date +%H:%M:%S)" >> /home/joaquim_ataides/zz-heart.txt
' < /dev/null > /dev/null 2>&1 &
echo "heartbeat launched pid=$!"
