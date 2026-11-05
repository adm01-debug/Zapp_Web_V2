export interface QrProviderEvidence {
  instance: string;
  image_sha256: string;
  generation: number;
  connects: number;
  qr_reads: number;
  status_reads: number;
  delivered: number;
}
export interface QrCompletion { readonly __qrCompletion?: never }
export interface QrOperationTracker {
  started(request: object, action: 'connect' | 'status', valid?: boolean): void;
  finished(request: object): void;
  failed(request: object): void;
  close(): void;
  snapshot(): { connects: number; statuses: number; completed: number; failed: number; invalid: number; after_close: number; pending: number };
  completion(timeoutMs?: number): Promise<QrCompletion>;
}
export interface IsolatedQrFixtureAccess {
  loginCredentials(): Promise<{ email: string; password: string }>;
  assertBaseline(accessToken: string): Promise<void>;
  assertPending(accessToken: string): Promise<void>;
  evidence(): Promise<QrProviderEvidence>;
  reset(accessToken: string, completion: QrCompletion): Promise<void>;
}
export declare function createQrOperationTracker(): QrOperationTracker;
export declare function createIsolatedQrFixtureAccess(input: {
  baseURL: string;
  anonKey: string;
}): Promise<IsolatedQrFixtureAccess>;

