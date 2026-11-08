import type { Page } from '@playwright/test';
import type { networkInterfaces } from 'node:os';

export interface IsolatedAuthTarget {
  origin: string;
  run_id: string;
  source_sha: string;
  anon_key_sha256: string;
}

export declare class IsolatedAuthError extends Error {
  constructor(code: string, message: string);
  code: string;
}

export declare function validateIsolatedAuthEvidence(input: {
  baseURL: string | undefined;
  env: Record<string, string | undefined>;
  proof: unknown;
  networkNamespace: string;
  interfaces: ReturnType<typeof networkInterfaces>;
  now: number;
}): IsolatedAuthTarget;

export declare function validateBrowserEvidence(
  target: IsolatedAuthTarget,
  observation: unknown,
): void;

export declare function assertIsolatedAuthEnvironment(input: {
  page: Pick<Page, 'goto' | 'url' | 'evaluate'>;
  baseURL: string | undefined;
}): Promise<void>;
