import { errorResponse, handleCors } from '../_shared/validation.ts';

export function handlePublicApiRequest(req: Request): Response {
  const cors = handleCors(req);
  if (cors) return cors;

  return errorResponse('Public API is disabled', 410, req);
}

if (import.meta.main) {
  Deno.serve(handlePublicApiRequest);
}
