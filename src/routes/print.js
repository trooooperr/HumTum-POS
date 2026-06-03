const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execP = util.promisify(exec);

const router = express.Router();

// POST /api/print
// body: { html: '<html>...</html>', documentType: 'bill' }
router.post('/', async (req, res) => {
  const { html, documentType = 'bill' } = req.body || {};
  if (!html) return res.status(400).json({ error: 'Missing html in request body' });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'humtum-print-'));
  const htmlPath = path.join(tmpDir, `${documentType}.html`);
  const pdfPath = path.join(tmpDir, `${documentType}.pdf`);

  try {
    await fs.writeFile(htmlPath, html, 'utf8');

    // Check for wkhtmltopdf
    try {
      await execP('which wkhtmltopdf');
    } catch (e) {
      return res.status(501).json({ error: 'wkhtmltopdf is not installed on the server' });
    }

    // Convert HTML -> PDF
    await execP(`wkhtmltopdf ${htmlPath} ${pdfPath}`);

    // Check for lp/lpr printer command
    let printCmd = 'lp';
    try {
      await execP('which lp');
    } catch (e) {
      try {
        await execP('which lpr');
        printCmd = 'lpr';
      } catch (e2) {
        return res.status(501).json({ error: 'No printing utility found (lp or lpr)' });
      }
    }

    // Send to default printer
    await execP(`${printCmd} ${pdfPath}`);

    // Cleanup (best-effort)
    try { await fs.unlink(htmlPath); } catch (e) {}
    try { await fs.unlink(pdfPath); } catch (e) {}
    try { await fs.rmdir(tmpDir); } catch (e) {}

    return res.json({ status: 'ok' });
  } catch (err) {
    console.error('Print failure:', err);
    return res.status(500).json({ error: err.message || 'Print failed' });
  }
});

module.exports = router;
