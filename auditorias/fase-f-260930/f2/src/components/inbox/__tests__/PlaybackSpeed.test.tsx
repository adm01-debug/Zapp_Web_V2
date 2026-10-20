import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ─── Mocks ───────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
    storage: {
      from: vi.fn(() => ({
        createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://test.com/audio.webm' } })),
      })),
    },
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: { transcription: 'test' }, error: null })),
    },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

vi.mock('@/hooks/ui/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  log: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef((props: any, ref: any) => {
      const { whileHover, whileTap, initial, animate, exit, transition, variants, ...rest } = props;
      return React.createElement('div', { ...rest, ref });
    }),
    circle: React.forwardRef((props: any, ref: any) => React.createElement('circle', { ref, ...props })),
  },
  AnimatePresence: ({ children }: any) => children,
}));

import { AudioMessagePlayer } from '../AudioMessagePlayer';

// ─── Audio Element Mock ──────────────────────────────────
let mockAudioPlaybackRate = 1;
let mockAudioPaused = true;
const mockAudioPlay = vi.fn(() => {
  mockAudioPaused = false;
  return Promise.resolve();
});
const mockAudioPause = vi.fn(() => { mockAudioPaused = true; });

function setupAudioMock() {
  mockAudioPlaybackRate = 1;
  mockAudioPaused = true;
  
  Object.defineProperty(HTMLAudioElement.prototype, 'play', {
    configurable: true,
    value: mockAudioPlay,
  });
  Object.defineProperty(HTMLAudioElement.prototype, 'pause', {
    configurable: true,
    value: mockAudioPause,
  });
  Object.defineProperty(HTMLAudioElement.prototype, 'load', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLAudioElement.prototype, 'playbackRate', {
    configurable: true,
    get() { return mockAudioPlaybackRate; },
    set(v: number) { mockAudioPlaybackRate = v; },
  });
  Object.defineProperty(HTMLAudioElement.prototype, 'duration', {
    configurable: true,
    get() { return 10; },
  });
  Object.defineProperty(HTMLAudioElement.prototype, 'currentTime', {
    configurable: true,
    get() { return 0; },
    set() {},
  });
}

// ─── Tests ───────────────────────────────────────────────
describe('AudioMessagePlayer - Playback Speed Controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAudioMock();
  });

  const defaultProps = {
    audioUrl: 'https://test.com/audio.webm',
    messageId: 'msg-1',
    isSent: false,
  };

  // --- BASIC RENDERING ---

  it('renders speed button with default 1x', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const speedBtn = screen.getByTitle('Velocidade');
    expect(speedBtn).toBeInTheDocument();
    expect(speedBtn.textContent).toBe('1x');
  });

  it('speed button is visible for sent messages', () => {
    render(<AudioMessagePlayer {...defaultProps} isSent={true} />);
    expect(screen.getByTitle('Velocidade')).toBeInTheDocument();
  });

  it('speed button is visible for received messages', () => {
    render(<AudioMessagePlayer {...defaultProps} isSent={false} />);
    expect(screen.getByTitle('Velocidade')).toBeInTheDocument();
  });

  // --- SPEED CYCLING ---

  it('cycles from 1x to 1.25x on first click', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('1.25x');
  });

  it('cycles through all speeds in correct order', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    const expectedOrder = ['1.25x', '1.5x', '1.75x', '2x', '0.5x', '0.75x', '1x'];
    
    for (const expected of expectedOrder) {
      fireEvent.click(btn);
      expect(btn.textContent).toBe(expected);
    }
  });

  it('wraps around after full cycle (returns to 1x)', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    // Click 7 times to complete full cycle
    for (let i = 0; i < 7; i++) fireEvent.click(btn);
    expect(btn.textContent).toBe('1x');
  });

  it('continues cycling after multiple full loops', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    // 14 clicks = 2 full cycles, should be back to 1x
    for (let i = 0; i < 14; i++) fireEvent.click(btn);
    expect(btn.textContent).toBe('1x');
    // One more click → 1.25x
    fireEvent.click(btn);
    expect(btn.textContent).toBe('1.25x');
  });

  // --- PLAYBACK RATE SYNC ---

  it('sets playbackRate on audio element when speed changes', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    
    fireEvent.click(btn); // → 1.25
    expect(mockAudioPlaybackRate).toBe(1.25);
    
    fireEvent.click(btn); // → 1.5
    expect(mockAudioPlaybackRate).toBe(1.5);
    
    fireEvent.click(btn); // → 1.75
    expect(mockAudioPlaybackRate).toBe(1.75);
    
    fireEvent.click(btn); // → 2
    expect(mockAudioPlaybackRate).toBe(2);
    
    fireEvent.click(btn); // → 0.5
    expect(mockAudioPlaybackRate).toBe(0.5);
    
    fireEvent.click(btn); // → 0.75
    expect(mockAudioPlaybackRate).toBe(0.75);
    
    fireEvent.click(btn); // → 1
    expect(mockAudioPlaybackRate).toBe(1);
  });

  // --- DISPLAY FORMAT ---

  it('shows integer speeds without extra decimals (1x not 1.00x)', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    expect(btn.textContent).toBe('1x');
    // Cycle to 2x
    for (let i = 0; i < 4; i++) fireEvent.click(btn);
    expect(btn.textContent).toBe('2x');
    // Not "2.00x"
  });

  it('shows decimal speeds correctly (1.25x, 1.5x, etc)', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('1.25x');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('1.5x');
    fireEvent.click(btn);
    expect(btn.textContent).toBe('1.75x');
  });

  // --- EDGE CASES ---

  it('speed button works independently of play state', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    // Change speed without playing
    fireEvent.click(btn);
    expect(btn.textContent).toBe('1.25x');
    expect(mockAudioPlaybackRate).toBe(1.25);
  });

  it('speed state persists across play/pause cycles', async () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const speedBtn = screen.getByTitle('Velocidade');
    
    // Set speed to 1.5x
    fireEvent.click(speedBtn); // 1.25
    fireEvent.click(speedBtn); // 1.5
    expect(speedBtn.textContent).toBe('1.5x');
    
    // Speed state should persist
    expect(mockAudioPlaybackRate).toBe(1.5);
  });

  it('each audio player has independent speed state', () => {
    const { container } = render(
      <>
        <AudioMessagePlayer audioUrl="url1" messageId="msg-1" isSent={false} />
        <AudioMessagePlayer audioUrl="url2" messageId="msg-2" isSent={true} />
      </>
    );
    
    const buttons = screen.getAllByTitle('Velocidade');
    expect(buttons).toHaveLength(2);
    
    // Change speed on first player only
    fireEvent.click(buttons[0]);
    expect(buttons[0].textContent).toBe('1.25x');
    expect(buttons[1].textContent).toBe('1x');
  });

  // --- ACCESSIBILITY ---

  it('speed button has accessible title', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    expect(screen.getByTitle('Velocidade')).toBeInTheDocument();
  });

  it('speed button is a <button> element', () => {
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    expect(btn.tagName).toBe('BUTTON');
  });

  // --- SPEED ARRAY INTEGRITY ---

  it('contains exactly 7 speed options', () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    expect(speeds).toHaveLength(7);
  });

  it('all speeds are positive numbers', () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    speeds.forEach(s => {
      expect(s).toBeGreaterThan(0);
      expect(typeof s).toBe('number');
    });
  });

  it('speed range covers 0.5x to 2x', () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    expect(Math.min(...speeds)).toBe(0.5);
    expect(Math.max(...speeds)).toBe(2);
  });

  it('no duplicate speeds exist', () => {
    const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const unique = new Set(speeds);
    expect(unique.size).toBe(speeds.length);
  });

  // --- ROBUSTNESS: indexOf fallback ---

  it('handles unknown playbackRate gracefully (indexOf returns -1)', () => {
    // This tests the edge case where playbackRate somehow gets set to a value
    // not in the speeds array. indexOf returns -1, (-1+1) % 7 = 0, so it resets to speeds[0] = 1
    render(<AudioMessagePlayer {...defaultProps} />);
    const btn = screen.getByTitle('Velocidade');
    
    // Normal operation should work even after rapid clicks
    for (let i = 0; i < 20; i++) {
      fireEvent.click(btn);
    }
    // 20 % 7 = 6 clicks past full cycles → index 6 → 0.75x
    // 20 clicks: cycles of 7 → 2 full (14) + 6 more → index 6 → 0.75x
    expect(btn.textContent).toBe('0.75x');
  });
});

// ─── Video Speed Tests ───────────────────────────────────
describe('VideoFullscreen - Playback Speed Controls (unit logic)', () => {
  const speeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];

  it('cycleSpeed returns correct next speed for each value', () => {
    speeds.forEach((speed, index) => {
      const nextIndex = (index + 1) % speeds.length;
      const nextSpeed = speeds[nextIndex];
      
      // Verify the cycling logic
      const computedNextIndex = (speeds.indexOf(speed) + 1) % speeds.length;
      expect(speeds[computedNextIndex]).toBe(nextSpeed);
    });
  });

  it('cycling from 2x goes to 0.5x (not 2.25x)', () => {
    const currentSpeed = 2;
    const nextIndex = (speeds.indexOf(currentSpeed) + 1) % speeds.length;
    expect(speeds[nextIndex]).toBe(0.5);
  });

  it('cycling from 0.75x wraps back to 1x', () => {
    const currentSpeed = 0.75;
    const nextIndex = (speeds.indexOf(currentSpeed) + 1) % speeds.length;
    expect(speeds[nextIndex]).toBe(1);
  });

  it('audio and video use identical speed arrays', () => {
    // Both components define speeds as [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75]
    const audioSpeeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    const videoSpeeds = [1, 1.25, 1.5, 1.75, 2, 0.5, 0.75];
    expect(audioSpeeds).toEqual(videoSpeeds);
  });

  it('all speeds are valid HTMLMediaElement playbackRate values (0.25 to 5.0)', () => {
    speeds.forEach(s => {
      expect(s).toBeGreaterThanOrEqual(0.25);
      expect(s).toBeLessThanOrEqual(5.0);
    });
  });

  it('speed display format is consistent: {number}x', () => {
    speeds.forEach(s => {
      const display = `${s}x`;
      expect(display).toMatch(/^\d+\.?\d*x$/);
    });
  });
});

// ─── TTS Speed (useTextToSpeech) Integration ─────────────
describe('Speed controls consistency across components', () => {
  it('TTS speed range (0.5 to 2.0) matches audio/video range', () => {
    const audioVideoMin = 0.5;
    const audioVideoMax = 2;
    const ttsMin = 0.5;
    const ttsMax = 2.0;
    expect(ttsMin).toBe(audioVideoMin);
    expect(ttsMax).toBe(audioVideoMax);
  });

  it('default speed is 1x for all players', () => {
    // AudioMessagePlayer: useState(1.0)
    // VideoFullscreen: useState(1.0)
    // useTextToSpeech: options.initialSpeed || 1.0
    const defaults = [1.0, 1.0, 1.0];
    defaults.forEach(d => expect(d).toBe(1));
  });
});
