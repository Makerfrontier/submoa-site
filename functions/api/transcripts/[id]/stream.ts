// GET /api/transcripts/:id/stream
// Server-sent events endpoint. Polls the transcripts row every 500ms and
// emits one SSE event per status/progress change plus a final `complete`
// event when status lands in ready or failed. Kept DB-backed (no Durable
// Object pub/sub) since the whole pipeline only has five steps.

import { getSessionUser } from '../../_utils';

const TERMINAL = new Set(['ready', 'failed']);

export async function onRequest(context: { request: Request; env: any; params: { id: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Not authenticated', { status: 401 });

  // Ownership check up-front so we don't leak statuses via the stream.
  const check: any = await env.submoacontent_db
    .prepare(`SELECT user_id FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!check) return new Response('Not found', { status: 404 });
  if (check.user_id !== user.id) return new Response('Forbidden', { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let lastKey = '';
      const emit = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Poll the DB every 500ms. Cap at ~10 min (1200 iterations) to keep
      // a stray client connection from hanging forever.
      for (let i = 0; i < 1200; i++) {
        const row: any = await env.submoacontent_db
          .prepare(`SELECT status, current_step, progress_percent, video_title, detected_language, transcript_text, error_message FROM transcripts WHERE id = ?`)
          .bind(params.id).first();
        if (!row) { emit('error', { message: 'Transcript deleted' }); break; }
        const key = `${row.status}:${row.current_step}:${row.progress_percent}`;
        if (key !== lastKey) {
          lastKey = key;
          emit('status', {
            status: row.status,
            current_step: row.current_step,
            progress_percent: row.progress_percent,
            video_title: row.video_title,
            detected_language: row.detected_language,
            preview: (row.transcript_text || '').slice(0, 4000),
            error_message: row.error_message,
          });
        }
        if (TERMINAL.has(row.status)) {
          emit('complete', { status: row.status, error_message: row.error_message });
          break;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
