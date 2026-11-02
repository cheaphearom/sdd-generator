// JSON Schema for a generated SDD. Claude fills this structure (structured outputs),
// and render-docx.js turns it into a Word file that follows the house SDD template.
//
// Every object lists all its properties as required and sets additionalProperties:false,
// as structured outputs require. Unused fields are sent as "" or [].

const str = { type: 'string' };
const strArr = { type: 'array', items: str };

// A block is one piece of body content inside a section.
const block = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'text', 'items', 'columns', 'rows', 'caption'],
  properties: {
    type: {
      type: 'string',
      enum: ['paragraph', 'bullets', 'numbered', 'table', 'code', 'diagram', 'note'],
      description:
        'paragraph: prose in text. bullets/numbered: list in items. table: columns + rows. ' +
        'code: pseudocode in text. diagram: Mermaid source in text plus a caption. ' +
        'note: a short bold-labelled remark in text, e.g. "Design note: ...".',
    },
    text: { type: 'string', description: 'Paragraph text, code, Mermaid source or note. "" if unused. **bold** is allowed in paragraphs.' },
    items: { ...strArr, description: 'List items for bullets/numbered. [] if unused.' },
    columns: { ...strArr, description: 'Table header cells. [] if unused.' },
    rows: { type: 'array', items: strArr, description: 'Table body rows; each row has one cell per column. [] if unused.' },
    caption: { type: 'string', description: 'Figure caption for diagram, e.g. "Figure 1. Proposed architecture". "" otherwise.' },
  },
};

const level3 = {
  type: 'object',
  additionalProperties: false,
  required: ['heading', 'blocks'],
  properties: { heading: str, blocks: { type: 'array', items: block } },
};

const level2 = {
  type: 'object',
  additionalProperties: false,
  required: ['heading', 'blocks', 'subsections'],
  properties: { heading: str, blocks: { type: 'array', items: block }, subsections: { type: 'array', items: level3 } },
};

const level1 = {
  type: 'object',
  additionalProperties: false,
  required: ['heading', 'blocks', 'subsections'],
  properties: { heading: str, blocks: { type: 'array', items: block }, subsections: { type: 'array', items: level2 } },
};

const sddSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['meta', 'sections', 'appendices'],
  properties: {
    meta: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'subtitle', 'tagline', 'guideline', 'system', 'module', 'documentType', 'version', 'preparedBy', 'date', 'status'],
      properties: {
        title: { type: 'string', description: 'Project name in capitals, e.g. "NEWS FEATURE ENHANCEMENT".' },
        subtitle: { type: 'string', description: 'Usually "Software Design Document (SDD)".' },
        tagline: { type: 'string', description: 'One-line italic description under the subtitle.' },
        guideline: { type: 'string', description: 'e.g. "Prepared in alignment with the Phase-2 (Software Design) guideline".' },
        system: str,
        module: str,
        documentType: str,
        version: str,
        preparedBy: str,
        date: str,
        status: str,
      },
    },
    sections: { type: 'array', items: level1, description: 'Numbered sections 1..16 in template order. Headings without numbers.' },
    appendices: { type: 'array', items: level1, description: 'Appendix A and B. Heading like "Appendix A – Completion and Approval Checklist".' },
  },
};

module.exports = { sddSchema };
