import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import { aggregateInvoice } from '../../invoice/aggregate.js';
import { renderInvoiceHtml } from '../../invoice/template.js';
import { getMockInvoices, renderBrandedInvoiceHtml } from '../../invoice/branded-invoice.js';
import { getExtension } from '../../extensions.js';

export const invoicesRouter = Router();

// GET /api/invoices/preview — all branded invoices on one page (design view).
invoicesRouter.get('/preview', (_req: Request, res: Response) => {
  const invoices = getMockInvoices();
  const pages = invoices
    .map((inv) => renderBrandedInvoiceHtml(inv))
    .join('\n<div style="height: 3rem;"></div>\n');

  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Preview</title>
  <style>body { background: #f1f5f9; margin: 0; padding: 2rem 0; }</style>
</head>
<body>
  ${pages}
</body>
</html>`);
});

// GET /api/invoices/preview/:index — a single branded invoice (PDF source).
invoicesRouter.get('/preview/:index', (req: Request, res: Response) => {
  const invoices = getMockInvoices();
  const idx = parseInt(req.params.index as string, 10);
  if (isNaN(idx) || idx < 0 || idx >= invoices.length) {
    res.status(404).json({ error: `Invoice index ${idx} not found. Valid: 0-${invoices.length - 1}` });
    return;
  }
  const data = invoices[idx];
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${data.invoiceNumber}</title>
  <style>
    /* Match the prior PDFs: Letter, top .5in / sides 1in. Bottom trimmed to .5in
       so 3-week invoices (e.g. SM0005) stay on one page — bottom is whitespace only. */
    @page { size: Letter; margin: 0.5in 1in 0.5in 1in; }
    body { background: white; margin: 0; padding: 0; }
    .invoice-page { max-width: none; margin: 0; box-shadow: none; border-radius: 0; }
  </style>
</head>
<body>
  ${renderBrandedInvoiceHtml(data)}
</body>
</html>`);
});

// GET /api/invoices?company_id=X&start=Y&end=Z&project_id=P&format=html|json
invoicesRouter.get('/', (req: Request, res: Response) => {
  const companyId = req.query.company_id as string;
  const startDate = req.query.start as string;
  const endDate = req.query.end as string;
  const projectId = req.query.project_id as string | undefined;
  const format = (req.query.format as string) ?? 'json';

  if (!companyId || !startDate || !endDate) {
    res.status(400).json({ error: 'company_id, start, and end are required' });
    return;
  }

  const db = getDb();
  const invoice = aggregateInvoice(db, companyId, startDate, endDate, projectId);

  if (!invoice) {
    res.status(404).json({ error: 'Company not found' });
    return;
  }

  if (format === 'html') {
    const customFormatter = getExtension('formatInvoice');
    const html = customFormatter
      ? customFormatter(invoice.data)
      : renderInvoiceHtml(invoice);
    res.type('html').send(html);
  } else {
    res.json(invoice);
  }
});
