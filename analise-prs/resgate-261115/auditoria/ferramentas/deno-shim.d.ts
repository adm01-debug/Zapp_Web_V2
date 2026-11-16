declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response> | Response): unknown;
  test(name: string, fn: () => void | Promise<void>): void;
};
interface ImportMeta { main?: boolean }
