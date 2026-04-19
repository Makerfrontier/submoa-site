import { json, getSessionUser } from '../../_utils';

const STATUS_STEPS: Record<string, { step: number; total: number; message: string }> = {
  researching:      { step: 1, total: 4, message: 'Researching the topic…' },
  casting:          { step: 2, total: 4, message: 'Casting hosts…' },
  scripting:        { step: 3, total: 4, message: 'Writing the script…' },
  generating_audio: { step: 4, total: 4, message: 'Generating audio…' },
  audio_ready:      { step: 4, total: 4, message: 'Ready' },
  script_draft:     { step: 3, total: 4, message: 'Script ready…' },
  failed:           { step: 0, total: 4, message: 'Failed' },
};

// GET /api/quick-podcast/:id/status — lightweight polling endpoint
export async function onRequest(context: any) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(context.request, context.env);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const accountId = user.account_id || 'makerfrontier';
  const id = context.params.id;

  const ep: any = await context.env.submoacontent_db
    .prepare(`SELECT id, status, audio_duration_seconds, audio_r2_key, source, topic FROM podcast_episodes WHERE id = ? AND account_id = ? AND source = 'quick'`)
    .bind(id, accountId).first();
  if (!ep) return json({ error: 'Not found' }, 404);

  const step = STATUS_STEPS[ep.status] || { step: 0, total: 4, message: ep.status };
  const audioReady = ep.status === 'audio_ready';

  const base = new URL(context.request.url).origin;
  return json({
    id: ep.id,
    status: ep.status,
    progress_step: step.step,
    progress_total: step.total,
    current_message: step.message,
    audio_ready: audioReady,
    audio_url: audioReady ? `${base}/api/quick-podcast/${ep.id}/audio` : null,
    audio_duration_seconds: ep.audio_duration_seconds || null,
    topic: ep.topic,
  });
}
