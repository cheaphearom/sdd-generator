// Turns SDD JSON into a .docx that follows the house SDD template:
// US Letter, 0.75" margins, Arial body, Calibri brown headings, brown table headers
// with alternating cream rows, a running header and "Page N" footer.
const {
  AlignmentType, BorderStyle, Bookmark, Document, Footer, Header, HeadingLevel, ImageRun,
  InternalHyperlink, LevelFormat, LineRuleType, Packer, PageBreak, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableRow, TabStopType, TextRun, WidthType, LeaderType,
} = require('docx');

const C = {
  dark: '7A4E2D', // H1, table header fill
  accent: '9A6542', // H2/H3, subtitle, captions
  rowA: 'F4E8DE',
  rowB: 'FBF6F1',
  code: 'FBF8F5',
  border: 'D9C3B0',
  grey: '666666',
  text: '222222',
};
const BODY_FONT = 'Arial';
const HEAD_FONT = 'Calibri';
const PAGE_W = 12240;
const MARGIN = 1080;
const CONTENT_W = PAGE_W - 2 * MARGIN; // 10080 DXA = 7 in
const MAX_IMG_W = 672; // px at 96 dpi = 7 in
const MAX_IMG_H = 760;

// "**bold** text" -> TextRuns
function runs(text, base = {}) {
  const parts = String(text ?? '').split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) =>
    p.startsWith('**') && p.endsWith('**')
      ? new TextRun({ ...base, text: p.slice(2, -2), bold: true })
      : new TextRun({ ...base, text: p }),
  );
}

function bookmarkId(label) {
  return 'h_' + label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 36);
}

function heading(text, level, id) {
  const lvl = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][level - 1];
  return new Paragraph({
    heading: lvl,
    pageBreakBefore: false,
    children: [new Bookmark({ id, children: [new TextRun(text)] })],
  });
}

// Column widths: each column gets at least enough room for its longest word
// (so words are not broken mid-word), and the rest is shared by average text length.
const CHAR_DXA = 100; // approx. width of one 9 pt Arial character
const CELL_PAD = 260;
function colWidths(columns, rows) {
  const cells = (i) => [columns[i], ...rows.map((r) => r[i] ?? '')].map((x) => String(x).replace(/\*\*/g, ''));
  const mins = columns.map((_, i) => {
    const longest = Math.max(...cells(i).flatMap((t) => t.split(/\s+/)).map((w) => w.length), 2);
    return Math.min(longest * CHAR_DXA + CELL_PAD, 3000);
  });
  const weights = columns.map((_, i) => {
    const c = cells(i);
    return Math.min(Math.max(c.reduce((a, t) => a + t.length, 0) / c.length, 4), 80);
  });
  let minTotal = mins.reduce((a, b) => a + b, 0);
  if (minTotal > CONTENT_W) {
    // Too many columns: scale minimums down to fit.
    const k = CONTENT_W / minTotal;
    for (let i = 0; i < mins.length; i++) mins[i] = Math.floor(mins[i] * k);
    minTotal = mins.reduce((a, b) => a + b, 0);
  }
  const spare = CONTENT_W - minTotal;
  const wTotal = weights.reduce((a, b) => a + b, 0);
  const widths = mins.map((m, i) => m + Math.floor((spare * weights[i]) / wTotal));
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0);
  return widths;
}

function table(columns, rows, { firstColBold = false } = {}) {
  if (!columns.length) return [];
  const widths = colWidths(columns, rows);
  const border = { style: BorderStyle.SINGLE, size: 4, color: C.border };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 60, bottom: 60, left: 100, right: 100 };

  const cell = (text, i, opts) =>
    new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      borders,
      margins,
      shading: { fill: opts.fill, type: ShadingType.CLEAR, color: 'auto' },
      children: [
        new Paragraph({
          spacing: { after: 0, line: 252 },
          children: runs(text, { font: BODY_FONT, size: 18, color: opts.color, bold: opts.bold }),
        }),
      ],
    });

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: columns.map((c, i) => cell(c, i, { fill: C.dark, color: 'FFFFFF', bold: true })),
  });
  const body = rows.map(
    (r, ri) =>
      new TableRow({
        cantSplit: true,
        children: columns.map((_, i) =>
          cell(r[i] ?? '', i, { fill: ri % 2 === 0 ? C.rowA : C.rowB, color: C.text, bold: firstColBold && i === 0 }),
        ),
      }),
  );
  return [
    new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows: [header, ...body] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}

function renderBlock(b, ctx) {
  switch (b.type) {
    case 'paragraph':
      return [new Paragraph({ children: runs(b.text) })];
    case 'lead': // paragraph that introduces the next table or figure
      return [new Paragraph({ keepNext: true, keepLines: true, children: runs(b.text) })];
    case 'note':
      return [new Paragraph({ children: runs(b.text, { italics: false }) })];
    case 'bullets':
      return b.items.map((t) => new Paragraph({ numbering: { reference: 'sdd-bullets', level: 0 }, spacing: { after: 80 }, children: runs(t) }));
    case 'numbered': {
      const instance = ++ctx.numberedInstance;
      return b.items.map(
        (t) => new Paragraph({ numbering: { reference: 'sdd-numbered', level: 0, instance }, spacing: { after: 80 }, children: runs(t) }),
      );
    }
    case 'table':
      return table(b.columns, b.rows);
    case 'code':
      return [codeBlock(b.text)];
    case 'diagram': {
      const img = ctx.images[ctx.diagramIndex++];
      const out = [];
      if (img) {
        let w = img.width;
        let h = img.height;
        const s = Math.min(1, MAX_IMG_W / w, MAX_IMG_H / h);
        w = Math.round(w * s);
        h = Math.round(h * s);
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { before: 120, after: 60, line: 240, lineRule: LineRuleType.AUTO },
            children: [new ImageRun({ type: 'png', data: img.png, transformation: { width: w, height: h }, altText: { title: b.caption || 'Diagram', description: b.caption || 'Diagram', name: `diagram${ctx.diagramIndex}` } })],
          }),
        );
      } else {
        out.push(codeBlock(b.text));
      }
      if (b.caption) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: b.caption, bold: true, italics: true, color: C.accent, size: 18, font: BODY_FONT })],
          }),
        );
      }
      return out;
    }
    default:
      return b.text ? [new Paragraph({ children: runs(b.text) })] : [];
  }
}

function codeBlock(text) {
  const lines = String(text).split('\n');
  return new Paragraph({
    shading: { fill: C.code, type: ShadingType.CLEAR, color: 'auto' },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: C.accent, space: 8 } },
    indent: { left: 360 },
    spacing: { before: 60, after: 200, line: 240 },
    children: lines.map((l, i) => new TextRun({ text: l.replace(/\t/g, '    '), font: 'Courier New', size: 18, break: i ? 1 : 0 })),
  });
}

function cover(meta) {
  const items = [
    ['Project / System', meta.system],
    ['Module', meta.module],
    ['Document Type', meta.documentType],
    ['Version', meta.version],
    ['Prepared By', meta.preparedBy],
    ['Date', meta.date],
    ['Status', meta.status],
  ];
  const center = (children, spacing = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing, children });
  return [
    center([], { before: 1800 }),
    center([new TextRun({ text: meta.title, bold: true, color: C.accent, size: 48, font: BODY_FONT })], { after: 120 }),
    center([new TextRun({ text: meta.subtitle, bold: true, color: C.accent, size: 32, font: BODY_FONT })], { after: 360 }),
    center([new TextRun({ text: meta.tagline, italics: true, color: C.grey, size: 22, font: BODY_FONT })], { after: 1200 }),
    center([new TextRun({ text: meta.guideline, color: C.grey, size: 20, font: BODY_FONT })], { after: 80 }),
    ...table(['Document Item', 'Details'], items),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

// Builds the numbered heading list once, so the TOC and body agree.
function outline(sdd) {
  const entries = [];
  sdd.sections.forEach((s, i) => {
    const n1 = `${i + 1}`;
    s._label = `${n1}. ${s.heading}`;
    s._id = bookmarkId(s._label);
    entries.push({ level: 1, label: s._label, id: s._id });
    (s.subsections || []).forEach((s2, j) => {
      s2._label = `${n1}.${j + 1} ${s2.heading}`;
      s2._id = bookmarkId(s2._label);
      entries.push({ level: 2, label: s2._label, id: s2._id });
      (s2.subsections || []).forEach((s3, k) => {
        s3._label = `${n1}.${j + 1}.${k + 1} ${s3.heading}`;
        s3._id = bookmarkId(s3._label);
        entries.push({ level: 3, label: s3._label, id: s3._id });
      });
    });
  });
  (sdd.appendices || []).forEach((a) => {
    a._label = a.heading;
    a._id = bookmarkId(a._label);
    entries.push({ level: 1, label: a._label, id: a._id });
    (a.subsections || []).forEach((s2) => {
      s2._label = s2.heading;
      s2._id = bookmarkId(s2._label);
      entries.push({ level: 2, label: s2._label, id: s2._id });
    });
  });
  return entries;
}

function tocBlock(entries, pageMap) {
  const out = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Table of Contents')] }),
  ];
  for (const e of entries) {
    const page = pageMap?.[e.label] ?? '';
    out.push(
      new Paragraph({
        indent: { left: (e.level - 1) * 300 },
        spacing: { after: e.level === 1 ? 80 : 40, before: e.level === 1 ? 60 : 0 },
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
        children: [
          new InternalHyperlink({
            anchor: e.id,
            children: [
              new TextRun({ text: e.label, bold: e.level === 1, size: e.level === 1 ? 21 : 20, font: BODY_FONT, color: C.text }),
              new TextRun({ text: `\t${page}`, size: 20, font: BODY_FONT, color: C.text }),
            ],
          }),
        ],
      }),
    );
  }
  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
}

function sectionBody(sec, level, ctx) {
  const out = [];
  out.push(heading(sec._label, level, sec._id));
  const blocks = sec.blocks || [];
  blocks.forEach((b, i) => {
    const next = blocks[i + 1];
    const introducesNext = b.type === 'paragraph' && next && (next.type === 'table' || next.type === 'diagram');
    out.push(...renderBlock(introducesNext ? { ...b, type: 'lead' } : b, ctx));
  });
  for (const sub of sec.subsections || []) out.push(...sectionBody(sub, level + 1, ctx));
  return out;
}

// Collects Mermaid sources in document order so they can be rendered before the docx is built.
function collectDiagrams(sdd) {
  const list = [];
  const walk = (sec) => {
    for (const b of sec.blocks || []) if (b.type === 'diagram') list.push(b.text);
    for (const s of sec.subsections || []) walk(s);
  };
  [...sdd.sections, ...(sdd.appendices || [])].forEach(walk);
  return list;
}

async function renderDocx(sdd, { images = [], pageMap = null } = {}) {
  const entries = outline(sdd);
  const ctx = { images, diagramIndex: 0, numberedInstance: 0 };

  const body = [];
  sdd.sections.forEach((s) => body.push(...sectionBody(s, 1, ctx)));
  (sdd.appendices || []).forEach((a) => body.push(...sectionBody(a, 1, ctx)));

  const headerText = `${sdd.meta.title} | SOFTWARE DESIGN DOCUMENT`.toUpperCase();

  const doc = new Document({
    creator: sdd.meta.preparedBy || 'SDD Generator',
    title: `${sdd.meta.title} – ${sdd.meta.subtitle}`,
    description: 'Software Design Document generated from a BRD',
    styles: {
      default: { document: { run: { font: BODY_FONT, size: 21, color: C.text }, paragraph: { spacing: { after: 160, line: 276, lineRule: LineRuleType.AUTO } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: HEAD_FONT, size: 36, bold: true, color: C.dark },
          paragraph: { spacing: { before: 360, after: 140 }, keepNext: true, keepLines: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: HEAD_FONT, size: 28, bold: true, color: C.accent },
          paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, keepLines: true, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: HEAD_FONT, size: 23, bold: true, color: C.accent },
          paragraph: { spacing: { before: 220, after: 100 }, keepNext: true, keepLines: true, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'sdd-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '❖', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 300 } }, run: { color: C.accent } } }] },
        { reference: 'sdd-numbered', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 340 } } } }] },
      ],
    },
    sections: [
      {
        properties: {
          page: { size: { width: PAGE_W, height: 15840 }, margin: { top: 936, right: MARGIN, bottom: 936, left: MARGIN, header: 500, footer: 500 } },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerText, italics: true, size: 14, color: C.grey })] })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: ['Page ', PageNumber.CURRENT], size: 16, color: C.grey })] })],
          }),
        },
        children: [...cover(sdd.meta), ...tocBlock(entries, pageMap), ...body],
      },
    ],
  });

  return { buffer: await Packer.toBuffer(doc), entries };
}

module.exports = { renderDocx, collectDiagrams };
