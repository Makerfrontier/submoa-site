// DOCX generation for download.ts
// Drop this into functions/api/submissions/[id]/download.ts
// Replace the placeholder comment with this function and the zip.file() call below it.
//
// The docx package (v9.6.1) is already installed.
// This generates a clean, formatted Word document matching the rendered article style.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  NumberFormat,
  convertInchesToTwip,
  BorderStyle,
  ShadingType,
  UnderlineType,
} from 'docx';

// ---------------------------------------------------------------------------
// parseHtmlToDocx — converts article HTML into docx Paragraph nodes
// ---------------------------------------------------------------------------
function parseHtmlToDocx(html: string, title: string, authorName: string, wordCount: number): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Title
  paragraphs.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
      style: 'Title',
    })
  );

  // Byline
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `By ${authorName}`,
          color: '888888',
          size: 20,
          italics: true,
        }),
        new TextRun({
          text: `    ·    ${wordCount?.toLocaleString() ?? 0} words`,
          color: 'AAAAAA',
          size: 18,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Divider
  paragraphs.push(
    new Paragraph({
      border: {
        bottom: { color: '1e3a1e', size: 6, space: 1, style: BorderStyle.SINGLE },
      },
      spacing: { after: 300 },
    })
  );

  // Strip HTML tags and parse structure
  // Handle h1-h4, p, ul/li, ol/li, blockquote
  const lines = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .split(/\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const fullText = lines.join('\n');

  // Parse block elements
  const blocks = fullText.split(/(<h[1-4][^>]*>[\s\S]*?<\/h[1-4]>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>|<blockquote[^>]*>[\s\S]*?<\/blockquote>)/gi)
    .filter(b => b.trim());

  for (const block of blocks) {
    const stripped = block.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
    if (!stripped) continue;

    if (/<h1/i.test(block)) {
      paragraphs.push(new Paragraph({
        text: stripped,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 360, after: 120 },
      }));
    } else if (/<h2/i.test(block)) {
      paragraphs.push(new Paragraph({
        text: stripped,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      }));
    } else if (/<h3/i.test(block)) {
      paragraphs.push(new Paragraph({
        text: stripped,
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 80 },
      }));
    } else if (/<h4/i.test(block)) {
      paragraphs.push(new Paragraph({
        text: stripped,
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 200, after: 60 },
      }));
    } else if (/<blockquote/i.test(block)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: stripped, italics: true, color: '555555' })],
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { before: 160, after: 160 },
        shading: { type: ShadingType.SOLID, color: 'F5F5F5' },
      }));
    } else if (/<li/i.test(block)) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: `• ${stripped}` })],
        indent: { left: convertInchesToTwip(0.25) },
        spacing: { before: 60, after: 60 },
      }));
    } else if (/<p/i.test(block) || stripped.length > 0) {
      // Handle inline bold/italic within paragraph
      const children = parseInlineFormatting(stripped);
      paragraphs.push(new Paragraph({
        children,
        spacing: { before: 120, after: 120 },
        alignment: AlignmentType.JUSTIFIED,
      }));
    }
  }

  return paragraphs;
}

// ---------------------------------------------------------------------------
// parseInlineFormatting — handles bold, italic, links within a paragraph
// ---------------------------------------------------------------------------
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Split on <strong>, <em>, <a> tags
  const parts = text.split(/(<strong>.*?<\/strong>|<b>.*?<\/b>|<em>.*?<\/em>|<i>.*?<\/i>|<a[^>]*>.*?<\/a>)/gi);

  for (const part of parts) {
    if (!part) continue;
    const inner = part.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    if (!inner) continue;

    if (/<strong|<b>/i.test(part)) {
      runs.push(new TextRun({ text: inner, bold: true }));
    } else if (/<em|<i>/i.test(part)) {
      runs.push(new TextRun({ text: inner, italics: true }));
    } else if (/<a /i.test(part)) {
      runs.push(new TextRun({
        text: inner,
        color: '1a6b2e',
        underline: { type: UnderlineType.SINGLE },
      }));
    } else {
      runs.push(new TextRun({ text: inner }));
    }
  }

  return runs.length ? runs : [new TextRun({ text })];
}

// ---------------------------------------------------------------------------
// generateDocx — main export
// Call this from the download endpoint
// ---------------------------------------------------------------------------
export async function generateDocx(
  articleHtml: string,
  title: string,
  authorName: string,
  wordCount: number,
  grade: {
    grammar_score?: number | null;
    readability_score?: number | null;
    ai_detection_score?: number | null;
    plagiarism_score?: number | null;
    seo_score?: number | null;
    overall_score?: number | null;
  } | null,
  articleFormat: string,
  createdAt: number,
): Promise<Uint8Array> {

  const docParagraphs = parseHtmlToDocx(articleHtml, title, authorName, wordCount);

  // Grade summary footer content
  const gradeText = grade
    ? `Grade: ${grade.overall_score ?? '—'}/100  ·  Grammar: ${grade.grammar_score ?? '—'}  ·  Readability: ${grade.readability_score ?? '—'}  ·  SEO: ${grade.seo_score ?? '—'}`
    : 'Not yet graded';

  const doc = new Document({
    title,
    creator: authorName,
    description: `${articleFormat} · Generated by SubMoa Content`,

    styles: {
      default: {
        document: {
          run: {
            font: 'Georgia',
            size: 24, // 12pt
            color: '1a1a1a',
          },
          paragraph: {
            spacing: { line: 360 }, // 1.5 line spacing
          },
        },
        title: {
          run: {
            font: 'Georgia',
            size: 52, // 26pt
            bold: true,
            color: '0a1a0a',
          },
        },
        heading1: {
          run: { font: 'Georgia', size: 36, bold: true, color: '1a3a1a' },
        },
        heading2: {
          run: { font: 'Georgia', size: 30, bold: true, color: '1a3a1a' },
        },
        heading3: {
          run: { font: 'Georgia', size: 26, bold: true, color: '2a4a2a' },
        },
        heading4: {
          run: { font: 'Georgia', size: 24, bold: true, italics: true, color: '3a5a3a' },
        },
      },
    },

    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1.25),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1.25),
            },
          },
        },

        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `SubMoa Content  ·  ${articleFormat}`,
                    color: 'AAAAAA',
                    size: 16,
                  }),
                ],
                alignment: AlignmentType.RIGHT,
                border: {
                  bottom: { color: 'DDDDDD', size: 4, space: 4, style: BorderStyle.SINGLE },
                },
              }),
            ],
          }),
        },

        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${gradeText}     `,
                    color: 'AAAAAA',
                    size: 16,
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: 'AAAAAA',
                    size: 16,
                  }),
                  new TextRun({
                    text: ' / ',
                    color: 'AAAAAA',
                    size: 16,
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES],
                    color: 'AAAAAA',
                    size: 16,
                  }),
                ],
                alignment: AlignmentType.CENTER,
                border: {
                  top: { color: 'DDDDDD', size: 4, space: 4, style: BorderStyle.SINGLE },
                },
              }),
            ],
          }),
        },

        children: docParagraphs,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
