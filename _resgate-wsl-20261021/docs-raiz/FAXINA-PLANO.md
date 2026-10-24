# FAXINA DO WSL — estado em 17/10/2026 (pausada)

Motivo da pausa: outro chat esta subindo arquivos para o GitHub. Retomar depois.

## Disco

- `/dev/sdd` = 1007G, **947G usados, 9,1G livres (100%)** — caindo ~0,6 GB a cada 10 min
- O gargalo NAO e programa instalado: e o Docker, que cresce ~2 GB/hora
  (containers 152 -> 173 e volumes 108,4 -> 110,2 GB em 1 hora)
- Risco imediato: `git push` do outro chat pode falhar com ENOSPC (precisa de espaco
  temporario para empacotar objetos)

## FEITO (confirmado por verificacao, nao por suposicao)

- [x] OmniRoute desinstalado: pacote npm 2,7 GB + `~/.omniroute` 365 MB + units systemd
- [x] `zcode` (ZCode Desktop App, z.ai): pacote apt 590 MB, `/opt/ZCode`,
      `~/.config/ZCode`, `~/.local/bin/zcode`, `.desktop`
- [x] `@deepseek-ai/dsh` (DeepSeek CLI, 296 MB) — sobrou pasta vazia de 4 KB
- [x] Forense/recuperacao: sleuthkit, testdisk, gddrescue, ddrutility, smartmontools,
      sg3-utils, hdparm, ntfs-3g
- [x] Midia/OCR/PDF: ffmpeg, tesseract-ocr(+por), gstreamer1.0-* (4), poppler-utils,
      qpdf, xvfb, libflite1
- [x] Fontes CJK: unifont, wqy-zenhei, ipafont-gothic, freefont-ttf, tlwg-loma-otf
- [x] Binarios orfaos: cua-driver, devin, ~/.config/devin
- [x] `browser-use` (uv), `typescript-language-server` (npm)
- [x] 106 arquivos `.bak-*` movidos para `~/backups-bin-2026-10-17` (1,8 MB)

Resultado: `~/.local/bin` de ~155 para 49 itens. Ganho real de espaco: ~0
(o Docker repoe em ~40 min).

## PRESERVADO DE PROPOSITO (nao remover)

- `snapd` (130 MB): dependencia de ubuntu-wsl/apparmor
- `mesa-vulkan-drivers` (94 MB) + `libllvm20` (137 MB): presos ao Chromium/Playwright (e2e)
- `gitleaks`, `actionlint`: referenciados nos gates de CI dos projetos
- `pnpm` (8 refs), `vercel` (17), `typescript` (20), `graphify` (358): em uso
- `docker` + stack, node, bun, deno, codex, claude, gh, supabase, ripgrep

## PROXIMO PASSO (o unico que muda o disco)

```bash
docker volume prune -f     # 1.714 volumes ANONIMOS orfaos -> ~68,4 GB
docker builder prune -f    # 721 MB
df -h / | tail -1
```

- NAO usar `docker volume prune -a`: apagaria tambem os 15 volumes NOMEADOS (1,2 GB),
  que precisam ser revisados um por um antes (bancos `supabase_db_*`).
- Orfaos = volumes com `LINKS=0`, ou seja, nenhum container (nem parado) os referencia.

## ACHADO DE FABRICA (virar cartao)

173 containers rodando (era 152) e nenhum derrubado ao fim da tarefa. O Docker ganha
~20 containers e ~2 GB de volume por hora sem que ninguem os remova. E vazamento, nao uso.
Isso e o que esta enchendo o disco, nao os programas.

## ESTAGIO 3 (opcional, nao feito)

Rodando como root, no seu terminal: `apt-get --auto-remove purge` da lista de
midia/forense arrastaria ~140 libs (libpulse0, libarchive13t64, libsdl2, libblas3,
liblapack3, libwww-perl): +210 MB. Risco de dlopen em runtime. Se algo reclamar:
reinstalar libpulse0, libarchive13t64 e libsdl2-2.0-0.

## OUTROS ALVOS MEDIDOS (nao tocados)

- `~/.codex/sessions` = 21 GB (historico de sessoes do Codex; dado, nao programa)
- `~/.cache/hermes-tmp` = 3,5 GB, `~/.npm` = 3,1 GB, `/tmp` = 1,0 GB
- `~/.cache/deno` = 2,5 GB, `~/.cache/ms-playwright` = 1,4 GB
