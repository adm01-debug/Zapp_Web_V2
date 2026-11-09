import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import base from '../../vite.config.ts';
import { isolatedOnlinePlugin } from './force-online.mjs';

async function baseConfig(env: ConfigEnv): Promise<UserConfig> {
  const configured = typeof base === 'function' ? base(env) : base;
  return await configured as UserConfig;
}

export default defineConfig(async (env) => mergeConfig(
  await baseConfig(env),
  { plugins: [isolatedOnlinePlugin()] },
));
