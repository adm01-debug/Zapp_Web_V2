import { useEffect, useRef } from 'react';

/**
 * SilkWaves — ondas fluidas estilo seda (WebGL puro, sem dependências).
 * Inspirado no efeito "Silk Waves" (reactbits pro), reimplementado
 * em shader próprio. Versão DISCRETA para fundo de tela de login:
 * - cores derivadas dos tokens CSS (--primary, --secondary, --primary-glow, --background)
 *   → acompanha a variante de tema ativa (aurora/emerald/violet/original)
 * - intensidade baixa (nunca compete com o conteúdo)
 * - prefers-reduced-motion → renderiza 1 frame estático e para
 * - sem WebGL → não renderiza nada (fallback silencioso)
 *
 * Uso: <SilkWaves className="absolute inset-0" />
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_c1;   // cor base (fundo)
uniform vec3  u_c2;   // primary
uniform vec3  u_c3;   // secondary
uniform vec3  u_c4;   // primary-glow
uniform float u_alpha;

vec3 silk(vec2 uv) {
  float t = u_time;
  // domínio suavemente rotacionado
  vec2 p = uv;
  float a1 = 0.0;
  float a2 = 0.0;
  // fbm de domínio: 5 iterações (complexidade moderada)
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    p.x += 0.32 / fi * sin(fi * 2.4 * p.y + t * 0.6 + fi * 1.7) + 0.28;
    p.y += 0.30 / fi * cos(fi * 2.1 * p.x + t * 0.5 + fi * 1.3) + 0.24;
  }
  float v = sin(p.x + p.y);
  float band = 0.5 + 0.5 * v;                       // 0..1 faixas de seda
  float diag = 0.5 + 0.5 * sin(p.x - p.y + 1.2);    // segunda família, cruzada
  vec3 col = mix(u_c1, u_c2, band * 0.85);
  col = mix(col, u_c4, diag * diag * 0.55);
  col = mix(col, u_c3, pow(band, 3.0) * 0.35);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_res) / u_res.y;
  vec3 col = silk(uv * 1.6);                        // scale: zoom do padrão
  // vinheta: dissolve nas bordas para fundir com a página
  float vig = smoothstep(1.9, 0.35, length(uv));
  gl_FragColor = vec4(col, u_alpha * (0.35 + 0.65 * vig));
}
`;

/** Converte "H S% L%" (token CSS do projeto) em [r,g,b] 0..1 */
function hslToRgb(hsl: string): [number, number, number] {
  const m = hsl.trim().split(/[\s%]+/).filter(Boolean).map(Number);
  if (m.length < 3 || m.some((n) => Number.isNaN(n))) return [0, 0, 0];
  const [h, s, l] = [m[0] / 360, m[1] / 100, m[2] / 100];
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

function token(el: HTMLElement, name: string, fallback: string): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return hslToRgb(v || fallback);
}

export interface SilkWavesProps {
  /** Opacidade geral do efeito (default discreto: 0.28) */
  alpha?: number;
  /** Velocidade da animação (default 1) */
  speed?: number;
  className?: string;
}

export function SilkWaves({ alpha = 0.28, speed = 1, className = '' }: SilkWavesProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false });
    if (!gl) return; // fallback silencioso: sem WebGL, sem efeito

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uC = (i: number) => gl.getUniformLocation(prog, `u_c${i}`);
    const uAlpha = gl.getUniformLocation(prog, 'u_alpha');

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap: efeito de fundo não precisa de retina cheia
    let raf = 0;
    let disposed = false;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const setColors = () => {
      const root = document.documentElement;
      // escurecimento: 30% menos luz nas cores de destaque (efeito mais discreto)
      const dim = (c: [number, number, number]): [number, number, number] => [
        c[0] * 0.7, c[1] * 0.7, c[2] * 0.7,
      ];
      const bg = token(root, '--background', '0 0% 4%');
      gl.uniform3f(uC(1), bg[0], bg[1], bg[2]);
      const c2 = dim(token(root, '--primary', '221 83% 53%'));
      gl.uniform3f(uC(2), c2[0], c2[1], c2[2]);
      const c3 = dim(token(root, '--secondary', '215 70% 55%'));
      gl.uniform3f(uC(3), c3[0], c3[1], c3[2]);
      const c4 = dim(token(root, '--primary-glow', '230 86% 59%'));
      gl.uniform3f(uC(4), c4[0], c4[1], c4[2]);
      gl.uniform1f(uAlpha, alpha);
    };

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const t0 = performance.now();
    const draw = () => {
      if (disposed) return;
      resize();
      setColors(); // por frame: barato (4 getComputedStyle) e acompanha troca de tema ao vivo
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, ((performance.now() - t0) / 1000) * speed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [alpha, speed]);

  return <canvas ref={ref} className={`pointer-events-none ${className}`} aria-hidden="true" />;
}

export default SilkWaves;
