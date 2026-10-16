import { log } from '@/lib/logger';
import { SOUND_CONFIGS } from './soundConfigs';
import type { SoundType, NotificationType, SoundConfig } from './soundConfigs';

// ÂNCORA (não unificar): ALERTAS do sistema = WebAudio (oscilador → gain → destination),
// com ganho vindo exclusivamente de `settings.soundVolume`. MÍDIA de conversa (áudio e
// vídeo das mensagens) = `HTMLMediaElement`, controlada por `@/lib/mediaVolumeStore`.
// São canais fisicamente independentes: `element.volume` não tem efeito sobre osciladores.
// Não "consolide" os dois num controle só.

// Re-export types
export type { SoundType, NotificationType } from './soundConfigs';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
};

export const playNotificationSound = (
  notificationType: NotificationType,
  soundType: SoundType = 'chime',
  volume: number = 70
) => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') void ctx.resume();

    // O acesso direto `SOUND_CONFIGS[soundType]` estoura quando o valor vem fora do vocabulário
    // (preferência antiga, cache otimista): o erro caía no catch lá embaixo e o alerta ficava
    // MUDO, com um warn no log que ninguém lê. Silêncio é o pior resultado possível para um
    // alerta; o som padrão é a resposta certa.
    const variacoes = SOUND_CONFIGS as Record<string, Record<string, SoundConfig>>;
    const variacao = variacoes[soundType];
    if (!variacao) log.warn(`Tipo de som "${soundType}" fora do vocabulário — tocando o padrão.`);
    const config = variacao?.[notificationType] ?? SOUND_CONFIGS.chime.message;
    const volumeMultiplier = volume / 100;

    config.frequencies.forEach((freq, index) => {
      setTimeout(() => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = config.waveform;
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

        const baseGain = config.gains[index] * volumeMultiplier;
        const duration = config.durations[index];
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(baseGain, ctx.currentTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      }, config.delays[index] * 1000);
    });
  } catch (error) {
    log.warn('Could not play notification sound:', error);
  }
};

export const previewSound = (soundType: SoundType, volume: number = 70) => {
  playNotificationSound('message', soundType, volume);
};

/**
 * NUNCA rejeita e NUNCA propaga: qualquer estouro do navegador (sem suporte, pedido sem gesto
 * do usuário, `Notification` ausente/estranho) volta como `false`. O pedido é disparado de
 * dentro de um efeito de React e de handlers de Realtime — uma rejeição aqui subia solta e
 * derrubava o fluxo que só queria avisar de uma mensagem.
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  try {
    if (!('Notification' in window)) { log.warn('Notifications not supported'); return false; }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    return (await Notification.requestPermission()) === 'granted';
  } catch (error) {
    log.warn('Could not request notification permission:', error);
    return false;
  }
};

/**
 * O aviso do sistema é o único canal que alcança quem está em OUTRA janela — e é o único
 * caminho do alerta que roda código do navegador fora do nosso controle (construtor, `onclick`,
 * `close`). Nada aqui pode propagar erro para quem chamou: quem chama é um handler de Realtime
 * que ainda tem um toast e um som para entregar, e a falha do aviso não é motivo para perder os
 * outros dois. Todo estouro vira `log.warn` e a função segue.
 */
export const showBrowserNotification = (
  title: string,
  body: string,
  options?: { icon?: string; tag?: string; onClick?: () => void }
) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Campos do navegador vêm de dados (nome/avatar do contato, preferências antigas): o que
    // não for string utilizável cai no padrão em vez de ir para o construtor. `tag` em branco
    // não agrupa nada e ainda apaga o aviso anterior do mesmo balde — o padrão é mais seguro.
    const icon = typeof options?.icon === 'string' && options.icon.trim() ? options.icon : '/favicon.ico';
    const tag = typeof options?.tag === 'string' && options.tag.trim() ? options.tag : 'notification';

    const notification = new Notification(title, { body, icon, badge: '/favicon.ico', tag });

    // O clique é instalado SEMPRE, mesmo sem callback: sem `onclick` a janela do sistema não
    // traz a aba para frente nem some do centro de notificações.
    const abrirConversa = options?.onClick;
    notification.onclick = () => {
      try { window.focus(); } catch (error) { log.warn('Could not focus the window:', error); }
      if (typeof abrirConversa === 'function') {
        try { abrirConversa(); } catch (error) { log.warn('Notification click handler failed:', error); }
      }
      try { notification.close(); } catch (error) { log.warn('Could not close the notification:', error); }
    };

    // Prazo do aviso: ele fecha sozinho para não virar pilha no centro de notificações.
    setTimeout(() => {
      try { notification.close(); } catch (error) { log.warn('Could not close the notification:', error); }
    }, 5000);
  } catch (error) {
    log.warn('Could not show browser notification:', error);
  }
};
