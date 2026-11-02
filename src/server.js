require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true }); // loads ANTHROPIC_API_KEY etc. from .env
// Web API + upload page.
//   POST /api/sdd                       multipart field "brd" (+ optional projectName, preparedBy) -> { id }
//   GET  /api/sdd/:id                   job status and progress
//   GET  /api/sdd/:id/download?format=docx|pdf
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { brdToSdd } = require('./pipeline');
const { SUPPORTED } = require('./extract');

const PORT = process.env.PORT || 4000;
const DATA_DIR = path.resolve(process.env.SDD_DATA_DIR || path.join(__dirname, '..', 'data'));
const JOB_TTL_MS = 24 * 60 * 60 * 1000;

fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const upload = multer({
  dest: path.join(DATA_DIR, 'uploads'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = SUPPORTED.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error(`Unsupported file type. Upload one of: ${SUPPORTED.join(', ')}`), ok);
  },
});

// In-memory job list. Fine for one server; use a database/queue if you run several.
const jobs = new Map();

const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

app.post('/api/sdd', upload.single('brd'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach the BRD file in the "brd" field.' });

  const id = crypto.randomUUID();
  const job = { id, status: 'processing', progress: 'Queued', fileName: req.file.originalname, createdAt: Date.now() };
  jobs.set(id, job);

  brdToSdd({
    brdPath: req.file.path,
    originalName: req.file.originalname,
    outDir: path.join(DATA_DIR, 'jobs', id),
    projectName: req.body.projectName,
    preparedBy: req.body.preparedBy,
    onProgress: (p) => { job.progress = p; },
  })
    .then((result) => Object.assign(job, { status: 'done', progress: 'Done', result }))
    .catch((err) => {
      console.error(`[job ${id}]`, err);
      Object.assign(job, { status: 'failed', error: err.message });
    })
    .finally(() => fs.rm(req.file.path, { force: true }, () => {}));

  res.status(202).json({ id, status: job.status });
});

app.get('/api/sdd/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const { result, ...rest } = job;
  res.json({
    ...rest,
    downloads: job.status === 'done'
      ? { docx: `/api/sdd/${job.id}/download?format=docx`, pdf: `/api/sdd/${job.id}/download?format=pdf` }
      : undefined,
  });
});

app.get('/api/sdd/:id/download', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || job.status !== 'done') return res.status(404).json({ error: 'Document not ready' });
  const format = req.query.format === 'pdf' ? 'pdf' : 'docx';
  const file = format === 'pdf' ? job.result.pdfPath : job.result.docxPath;
  res.download(file, path.basename(file));
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

// Remove finished jobs and their files after a day.
setInterval(() => {
  for (const [id, job] of jobs) {
    if (Date.now() - job.createdAt > JOB_TTL_MS) {
      fs.rm(path.join(DATA_DIR, 'jobs', id), { recursive: true, force: true }, () => {});
      jobs.delete(id);
    }
  }
}, 60 * 60 * 1000).unref();

app.listen(PORT, () => console.log(`SDD generator running at http://localhost:${PORT}`));
