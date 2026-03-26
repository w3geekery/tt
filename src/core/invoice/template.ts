/**
 * Default invoice HTML template.
 */

import type { InvoiceResult } from './aggregate.js';

export function renderInvoiceHtml(invoice: InvoiceResult): string {
  const { data, lineItems, roundedTotalHrs } = invoice;
  const rows = lineItems.map(li => `
    <tr>
      <td>${li.date}</td>
      <td>${li.project_name}</td>
      <td>${li.task_name ?? '—'}</td>
      <td>${li.notes ?? '—'}</td>
      <td class="num">${li.rounded_hrs.toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice — ${data.company.name}</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .meta { color: #666; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #eee; }
    th { background: #f8f8f8; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total { font-size: 1.2rem; font-weight: 600; text-align: right; margin-top: 8px; }
  </style>
</head>
<body>
  <h1>Invoice</h1>
  <div class="meta">
    <strong>${data.company.name}</strong><br>
    ${data.project.name !== 'All Projects' ? `Project: ${data.project.name}<br>` : ''}
    Period: ${data.periodStart} — ${data.periodEnd}
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Project</th><th>Task</th><th>Notes</th><th class="num">Hours</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="total">Total: ${roundedTotalHrs.toFixed(2)} hours</div>
</body>
</html>`;
}
