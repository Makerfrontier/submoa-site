// GET /api/admin/danger/counts
// Super-admin only. Returns current row counts for every destructible content
// type. Tables that don't exist in this deployment are reported as -1 so the
// UI can render "Not tracked".
import { getSessionUser, json } from '../../_utils';
import type { Env } from '../../_utils';

async function tableExists(env: Env, name: string): Promise<boolean> {
  try {
    const row: any = await env.submoacontent_db
      .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name = ?")
      .bind(name).first();
    return !!row;
  } catch { return false; }
}

async function countOf(env: Env, name: string): Promise<number> {
  if (!(await tableExists(env, name))) return -1;
  try {
    const row: any = await env.submoacontent_db
      .prepare(`SELECT COUNT(*) AS c FROM ${name}`)
      .first();
    return Number(row?.c ?? 0);
  } catch { return -1; }
}

export async function onRequest(context: { request: Request; env: Env }) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);
  if (user.role !== 'super_admin') return json({ error: 'Forbidden — super_admin only' }, 403);

  const [submissions, itineraries, comp_drafts, legislation, legislative_briefs, html_templates] = await Promise.all([
    countOf(env, 'submissions'),
    countOf(env, 'itinerary_submissions'),
    countOf(env, 'comp_studio_drafts'),
    countOf(env, 'legislation'),
    countOf(env, 'legislative_briefs'),
    countOf(env, 'html_templates'),
  ]);

  return json({
    counts: {
      submissions,
      itineraries,
      comp_drafts,
      legislation,
      legislative_briefs,
      html_templates,
    },
  });
}
