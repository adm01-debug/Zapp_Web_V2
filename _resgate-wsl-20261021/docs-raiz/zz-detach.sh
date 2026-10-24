#!/bin/bash
# Teste: um processo sobrevive ao fim da sessão SSH?
setsid /bin/bash -c 'sleep 60; echo DETACHED_OK > /home/joaquim_ataides/zz-det.txt' < /dev/null > /dev/null 2>&1 &
echo "launched pid=$!"
