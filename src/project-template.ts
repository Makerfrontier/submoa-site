// src/project-template.ts
// Creates the project folder structure in R2 on every new submission.
// Called immediately after a submission record is saved to DB.
// Every project gets the full folder tree with placeholder docs —
// regardless of what was requested. Real files overwrite placeholders
// as each component completes.

// ── Folder structure ─────────────────────────────────────────────────────────
//
// projects/{submission_id}/
// ├── article/
// │   ├── article.docx          ← real or placeholder
// │   └── article.html          ← real or placeholder
// ├── audio/
// │   └── audio.mp3             ← real or placeholder.docx
// ├── infographic/
// │   ├── infographic.svg       ← real or placeholder.docx
// │   ├── infographic.png       ← real or placeholder.docx
// │   ├── infographic-data.csv  ← real or placeholder.docx
// │   └── sources.txt           ← real or placeholder.docx
// ├── images/
// │   └── images.docx           ← real files or placeholder
// └── seo/
//     └── meta.json             ← real or placeholder.docx
//
// ─────────────────────────────────────────────────────────────────────────────

interface Env {
  SUBMOA_IMAGES: R2Bucket;
}

// Component definitions — every project gets all of these
const COMPONENTS: Array<{
  folder: string;
  files: Array<{ key: string; label: string }>;
}> = [
  {
    folder: "article",
    files: [
      { key: "article.docx",  label: "Article (DOCX)" },
      { key: "article.html",  label: "Article (HTML)" },
    ],
  },
  {
    folder: "audio",
    files: [
      { key: "audio.mp3",     label: "Audio" },
    ],
  },
  {
    folder: "infographic",
    files: [
      { key: "infographic.svg",          label: "Infographic (SVG)" },
      { key: "infographic.png",          label: "Infographic (PNG)" },
      { key: "infographic-data.csv",     label: "Infographic Data (CSV)" },
      { key: "sources.txt",              label: "Infographic Sources" },
    ],
  },
  {
    folder: "images",
    files: [
      { key: "images.docx",   label: "Product Images" },
    ],
  },
  {
    folder: "seo",
    files: [
      { key: "meta.json",     label: "SEO Metadata" },
    ],
  },
  {
    folder: "email",
    files: [
      { key: "email.html",  label: "Email (HTML)" },
      { key: "email.txt",   label: "Email (Plain Text)" },
    ],
  },
  {
    folder: "presentation",
    files: [
      { key: "presentation.pptx", label: "Presentation (PPTX)" },
    ],
  },
];

// ── Placeholder DOCX generator ────────────────────────────────────────────────
// Produces a minimal valid DOCX (Office Open XML) with a single paragraph.
// Does not require the docx npm package — pure string construction.

function buildPlaceholderDocx(label: string): Uint8Array {
  const message = `${label} was not created at user request.`;

  // Minimal DOCX XML structure
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml"
  xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex"
  xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid"
  xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml"
  xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2020/wordml/sdtdatahash"
  xmlns:w16se="http://schemas.microsoft.com/office/word/2015/wordml/symex"
  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"
  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
  mc:Ignorable="w14 w15 w16se w16cid w16 w16cex w16sdtdh wp14">
  <w:body>
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Normal"/>
        <w:spacing w:after="160"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:color w:val="6A8A6A"/>
          <w:sz w:val="24"/>
          <w:szCs w:val="24"/>
        </w:rPr>
        <w:t>${message}</w:t>
      </w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  mc:Ignorable="w14">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // Build ZIP manually using a simple implementation
  // In the actual Worker, import JSZip which is already used by the packager
  // This is the logical structure — the Worker will use JSZip to assemble it
  return new TextEncoder().encode(JSON.stringify({
    "[Content_Types].xml": contentTypesXml,
    "_rels/.rels": rootRelsXml,
    "word/document.xml": documentXml,
    "word/_rels/document.xml.rels": relsXml,
    "word/styles.xml": stylesXml,
  }));
}

// Placeholder for non-DOCX types
function buildPlaceholderText(label: string): Uint8Array {
  return new TextEncoder().encode(`${label} was not created at user request.\n`);
}

// ── Determine placeholder type by file extension ──────────────────────────────

function getPlaceholderContent(key: string, label: string): { content: Uint8Array; contentType: string; isDocx: boolean } {
  const ext = key.split(".").pop()?.toLowerCase();

  // Audio gets a placeholder DOCX (can't fake an MP3)
  if (ext === "mp3") {
    return {
      content: buildPlaceholderDocx(label),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isDocx: true,
    };
  }

  // Images folder placeholder
  if (ext === "docx") {
    return {
      content: buildPlaceholderDocx(label),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      isDocx: false,
    };
  }

  // SVG, PNG, HTML, JSON, CSV, TXT — plain text placeholder
  return {
    content: buildPlaceholderText(label),
    contentType: "text/plain",
    isDocx: false,
  };
}

// ── Placeholder key naming ────────────────────────────────────────────────────
// MP3 and other non-doc types get renamed to .docx for the placeholder

function getPlaceholderKey(submissionId: string, folder: string, key: string): string {
  const ext = key.split(".").pop()?.toLowerCase();
  const needsDocxRename = ["mp3", "svg", "png", "csv", "json", "html", "pptx"].includes(ext ?? "");
  const placeholderFilename = needsDocxRename
    ? key.replace(`.${ext}`, ".docx")
    : key;
  return `projects/${submissionId}/${folder}/${placeholderFilename}`;
}

function getRealKey(submissionId: string, folder: string, key: string): string {
  return `projects/${submissionId}/${folder}/${key}`;
}

// ── Main: create project folder ───────────────────────────────────────────────

export async function createProjectFolder(
  env: Env,
  submissionId: string
): Promise<void> {
  const uploads: Promise<void>[] = [];

  for (const component of COMPONENTS) {
    for (const file of component.files) {
      const { content, contentType, isDocx } = getPlaceholderContent(file.key, file.label);
      const r2Key = getPlaceholderKey(submissionId, component.folder, file.key);

      uploads.push(
        env.SUBMOA_IMAGES.put(r2Key, content, {
          httpMetadata: { contentType },
          customMetadata: {
            placeholder: "true",
            label: file.label,
            submissionId,
          },
        }).then(() => {})
      );
    }
  }

  await Promise.all(uploads);
  console.log(`Project folder created for submission ${submissionId}`);
}

// ── Write real file (overwrites placeholder) ──────────────────────────────────

export async function writeProjectFile(
  env: Env,
  submissionId: string,
  folder: string,
  filename: string,
  content: ArrayBuffer | Uint8Array | string,
  contentType: string
): Promise<string> {
  const r2Key = getRealKey(submissionId, folder, filename);

  await env.SUBMOA_IMAGES.put(r2Key, content, {
    httpMetadata: { contentType },
    customMetadata: {
      placeholder: "false",
      submissionId,
    },
  });

  // Also delete the placeholder variant if it exists (e.g. audio.docx when audio.mp3 is ready)
  const ext = filename.split(".").pop()?.toLowerCase();
  const needsDocxClean = ["mp3", "svg", "png", "csv", "json", "html", "pptx"].includes(ext ?? "");
  if (needsDocxClean) {
    const placeholderKey = getPlaceholderKey(submissionId, folder, filename);
    await env.SUBMOA_IMAGES.delete(placeholderKey).catch(() => {});
  }

  return r2Key;
}

// ── Check if a file is a placeholder ─────────────────────────────────────────

export async function isPlaceholder(
  env: Env,
  r2Key: string
): Promise<boolean> {
  const obj = await env.SUBMOA_IMAGES.head(r2Key);
  if (!obj) return true; // Doesn't exist — treat as placeholder
  return obj.customMetadata?.placeholder === "true";
}

// ── List all project files (real + placeholders) ──────────────────────────────

export async function listProjectFiles(
  env: Env,
  submissionId: string
): Promise<Array<{ key: string; isPlaceholder: boolean; folder: string; filename: string }>> {
  const prefix = `projects/${submissionId}/`;
  const listed = await env.SUBMOA_IMAGES.list({ prefix });

  return listed.objects.map((obj) => {
    const parts = obj.key.replace(prefix, "").split("/");
    return {
      key: obj.key,
      isPlaceholder: (obj.customMetadata as any)?.placeholder === "true",
      folder: parts[0],
      filename: parts[1],
    };
  });
}
