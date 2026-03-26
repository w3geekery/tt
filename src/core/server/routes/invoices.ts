import { Router } from 'express';
import type { Request, Response } from 'express';
import { getDb } from '../../db/connection.js';
import { aggregateInvoice } from '../../invoice/aggregate.js';
import { renderInvoiceHtml } from '../../invoice/template.js';
import { getExtension } from '../../extensions.js';

export const invoicesRouter = Router();

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
