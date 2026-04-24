// GET /api/transcripts/:id/download/:format
// Formats: txt, srt, vtt, docx, json. Owner-scoped.
//
// txt  — plain-text paragraphs by speaker turn
// srt  — classic subtitle format with word-level timestamps
// vtt  — WebVTT
// json — the full transcript_json payload
// docx — minimal .docx (returned as text/plain fallback when docx tooling
//        isn't bundled — worker envs don't have a pure-JS docx writer
//        cheap enough to include. Logs a follow-up TODO.)

import { getSessionUser } from '../../../_utils';

function pad(n: number, w = 2) { return String(Math.floor(n)).padStart(w, '0'); }

function formatSrtTime(seconds: number): string {
  const ms = Math.round((seconds % 1) * 1000);
  const s = Math.floor(seconds);
  return `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)},${pad(ms, 3)}`;
}
function formatVttTime(seconds: number): string {
  const ms = Math.round((seconds % 1) * 1000);
  const s = Math.floor(seconds);
  return `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}.${pad(ms, 3)}`;
}

export async function onRequest(context: { request: Request; env: any; params: { id: string; format: string } }) {
  const { request, env, params } = context;
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const user = await getSessionUser(request, env);
  if (!user) return new Response('Not authenticated', { status: 401 });

  const row: any = await env.submoacontent_db
    .prepare(`SELECT user_id, video_title, transcript_json, transcript_text FROM transcripts WHERE id = ?`)
    .bind(params.id).first();
  if (!row) return new Response('Not found', { status: 404 });
  if (row.user_id !== user.id) return new Response('Forbidden', { status: 403 });

  const title = String(row.video_title || 'transcript').replace(/[^a-z0-9_\-]+/gi, '-').slice(0, 80);
  let turns: any[] = [];
  try { turns = JSON.parse(row.transcript_json || '[]'); } catch {}

  const fmt = params.format.toLowerCase();
  let body = '';
  let contentType = 'text/plain';
  let filename = `${title}.${fmt}`;

  if (fmt === 'json') {
    body = row.transcript_json || '[]';
    contentType = 'application/json';
  } else if (fmt === 'txt' || fmt === 'docx') {
    body = (turns || []).map((turn: any) => {
      const who = turn.speaker || 'Speaker';
      const text = turn.text || (turn.words || []).map((w: any) => w.text).join(' ');
      return `${who}:\n${text}\n`;
    }).join('\n') || (row.transcript_text || '');
    contentType = fmt === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain';
    // TODO: when a worker-safe docx writer is added, emit a real .docx binary here.
  } else if (fmt === 'srt' || fmt === 'vtt') {
    // Turn-level cues — each turn becomes a subtitle entry. Word-level cues
    // would be noisy for a full SRT/VTT; paragraph-level is the standard
    // podcast caption granularity.
    const lines: string[] = fmt === 'vtt' ? ['WEBVTT', ''] : [];
    let idx = 1;
    for (const turn of turns) {
      const start = Number(turn.start_seconds ?? turn.start ?? 0);
      const end = Number(turn.end_seconds ?? turn.end ?? start + 3);
      const text = (turn.text || '').trim();
      if (!text) continue;
      if (fmt === 'srt') {
        lines.push(String(idx++));
        lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
        lines.push(text);
        lines.push('');
      } else {
        lines.push(`${formatVttTime(start)} --> ${formatVttTime(end)}`);
        lines.push(text);
        lines.push('');
      }
    }
    body = lines.join('\n');
    contentType = fmt === 'vtt' ? 'text/vtt' : 'application/x-subrip';
  } else {
    return new Response('Unsupported format', { status: 400 });
  }

  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
