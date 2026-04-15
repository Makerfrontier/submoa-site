// src/packager-update.ts
// Updated download zip handler and project-folder packager helpers.
// Calls listProjectFiles() to build zips from the unified project folder.
// The zip mirrors the folder structure exactly.

import { listProjectFiles, writeProjectFile } from "./project-template";

interface Env {
  SUBMOA_IMAGES: R2Bucket;
  submoacontent_db: D1Database;
}

// ── GET /api/submissions/:id/download ─────────────────────────────────────────

export async function handleDownload(
  request: Request,
  env: Env,
  submissionId: string,
  accountId: string
): Promise<Response> {
  // Auth — verify ownership
  const sub = await env.submoacontent_db.prepare(
    `SELECT id, topic FROM submissions WHERE id = ? AND account_id = ?`
  ).bind(submissionId, accountId).first<{ id: string; topic: string }>();

  if (!sub) return new Response("Not found", { status: 404 });

  // Get all project files
  const files = await listProjectFiles(env as any, submissionId);

  if (files.length === 0) {
    return new Response("Project folder not found", { status: 404 });
  }

  // Build zip using JSZip (already in project dependencies)
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Add every file — real or placeholder — maintaining folder structure
  const fetchPromises = files.map(async (file) => {
    const obj = await env.SUBMOA_IMAGES.get(file.key);
    if (!obj) return;

    const buffer = await obj.arrayBuffer();

    // Zip path: folder/filename (strip the projects/{id}/ prefix)
    const zipPath = `${file.folder}/${file.filename}`;
    zip.file(zipPath, buffer);
  });

  await Promise.all(fetchPromises);

  // Generate zip
  const zipBuffer = await zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  // Sanitize topic for filename
  const safeTopic = (sub.topic ?? submissionId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60);

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeTopic}-${submissionId.slice(0, 8)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

// ── Packager: write article HTML to project folder after generation ────────────
// Note: DOCX is written by packager.ts which has all required params.
// This just writes the HTML as soon as article content is available.

export async function packageArticle(
  env: any,
  submissionId: string,
  _articleContent: string,
  articleHtml: string
): Promise<void> {
  await writeProjectFile(
    env, submissionId, "article", "article.html",
    articleHtml, "text/html"
  );
}

// ── Packager: write audio after TTS ──────────────────────────────────────────

export async function packageAudio(
  env: any,
  submissionId: string,
  audioBuffer: ArrayBuffer
): Promise<void> {
  await writeProjectFile(
    env, submissionId, "audio", "audio.mp3",
    audioBuffer, "audio/mpeg"
  );
}

// ── Packager: write infographic files after assembly ─────────────────────────

export async function packageInfographic(
  env: any,
  submissionId: string,
  svgContent: string,
  csvData: string,
  sourcesText: string,
  pngBuffer?: ArrayBuffer
): Promise<void> {
  await writeProjectFile(
    env, submissionId, "infographic", "infographic.svg",
    svgContent, "image/svg+xml"
  );

  await writeProjectFile(
    env, submissionId, "infographic", "infographic-data.csv",
    csvData, "text/csv"
  );

  await writeProjectFile(
    env, submissionId, "infographic", "sources.txt",
    sourcesText, "text/plain"
  );

  if (pngBuffer) {
    await writeProjectFile(
      env, submissionId, "infographic", "infographic.png",
      pngBuffer, "image/png"
    );
  }
}

// ── Packager: write SEO metadata after generation ─────────────────────────────

export async function packageSeo(
  env: any,
  submissionId: string,
  meta: {
    title: string;
    description: string;
    keywords: string[];
    schema?: Record<string, unknown>;
  }
): Promise<void> {
  await writeProjectFile(
    env, submissionId, "seo", "meta.json",
    JSON.stringify(meta, null, 2), "application/json"
  );
}

// ── Packager: write product images ────────────────────────────────────────────

export async function packageImages(
  env: any,
  submissionId: string,
  images: Array<{ filename: string; buffer: ArrayBuffer; contentType: string }>
): Promise<void> {
  for (const img of images) {
    await writeProjectFile(
      env, submissionId, "images", img.filename,
      img.buffer, img.contentType
    );
  }

  // Remove the placeholder docx once real images exist
  await (env.SUBMOA_IMAGES as R2Bucket).delete(`projects/${submissionId}/images/images.docx`).catch(() => {});
}
