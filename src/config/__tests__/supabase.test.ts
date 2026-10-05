import { describe, expect, it } from 'vitest';

import { PRODUCTION_SUPABASE_URL, SUPABASE_URL, resolveLocalSupabase } from '../supabase';

const KEY = 'chave-anon-local';

describe('resolveLocalSupabase', () => {
  it('sem variáveis, o app fica no banco oficial', () => {
    expect(resolveLocalSupabase({})).toBeNull();
    expect(resolveLocalSupabase(undefined)).toBeNull();
    expect(SUPABASE_URL).toBe(PRODUCTION_SUPABASE_URL);
  });

  it('aceita o banco local em 127.0.0.1 e em localhost, e devolve só a origem', () => {
    expect(
      resolveLocalSupabase({
        VITE_ZAPP_LOCAL_SUPABASE_URL: 'http://127.0.0.1:23794/qualquer/caminho',
        VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: ` ${KEY} `,
      }),
    ).toEqual({ url: 'http://127.0.0.1:23794', anonKey: KEY });
    expect(
      resolveLocalSupabase({
        VITE_ZAPP_LOCAL_SUPABASE_URL: 'http://localhost:54321',
        VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: KEY,
      }),
    ).toEqual({ url: 'http://localhost:54321', anonKey: KEY });
  });

  it('recusa qualquer endereço que não seja a própria máquina', () => {
    for (const url of [
      'https://vpkmqeumtxhrwgawxdrl.supabase.co',
      'https://tnnnlkbymytvtqngbbqh.supabase.co',
      'http://127.0.0.1.evil.example:54321',
      'http://192.168.0.10:54321',
      'https://localhost:54321',
      'nao-e-url',
    ]) {
      expect(
        resolveLocalSupabase({
          VITE_ZAPP_LOCAL_SUPABASE_URL: url,
          VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: KEY,
        }),
      ).toBeNull();
    }
  });

  it('recusa URL local sem a chave, para não misturar a chave de produção com o banco local', () => {
    expect(resolveLocalSupabase({ VITE_ZAPP_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321' })).toBeNull();
    expect(
      resolveLocalSupabase({
        VITE_ZAPP_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: '   ',
      }),
    ).toBeNull();
  });

  it('em build de produção o desvio é ignorado mesmo com as variáveis presentes', () => {
    expect(
      resolveLocalSupabase({
        PROD: true,
        VITE_ZAPP_LOCAL_SUPABASE_URL: 'http://127.0.0.1:54321',
        VITE_ZAPP_LOCAL_SUPABASE_ANON_KEY: KEY,
      }),
    ).toBeNull();
  });
});
