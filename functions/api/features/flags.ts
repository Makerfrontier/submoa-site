// GET /api/features/flags
// Exposes server-side feature flags to the browser so the nav and routing
// logic can gate items dynamically. Public endpoint — no auth required;
// the flags themselves decide what the user can then reach.

import { json } from '../_utils';

export async function onRequest(context: { request: Request; env: any }) {
  const { env } = context;
  const flag = (name: string): boolean => {
    const v = (env as any)[name];
    return v === true || v === 'true' || v === '1';
  };
  return json({
    atomic_transcription: flag('ATOMIC_TRANSCRIPTION_ENABLED'),
  });
}
