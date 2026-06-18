/**
 * Branded invoice template + data — ported from the legacy timetracker-ui
 * (`src/server/invoices.ts`). This is the polished, client-facing invoice
 * layout (logo, INVOICE header, info grid, bank block, weekly line items,
 * totals, footer) used to produce the ZB####/SM#### PDFs.
 *
 * The data currently lives in `getMockInvoices()` (one entry per semi-monthly
 * stream). Numbering + reconciliation lives in the `invoices` table in tt.db;
 * keep the two in sync when adding a period.
 */

import { W3_LOGO_DATA_URI } from './logo-data-uri.js';

export interface BillingParty {
  name: string;
  address?: string[];
  phone?: string;
}

export interface WeekProject {
  projectLabel: string;
  orgDetail: string;
  hours: number;
  amount: number;
  /** True for over-cap lines: billed at the real rate into the Subtotal, then
   *  backed out via Adjustments so the Total reflects only billable work. */
  over?: boolean;
}

export interface WeekLineItem {
  weekRange: string;
  projects: WeekProject[];
}

export interface InvoiceData {
  invoiceNumber: string;
  submittedDate: string;
  dueDate: string;
  billTo: BillingParty;
  billFrom: BillingParty;
  payableTo: string;
  period: { title: string; dateRange: string };
  weeks: WeekLineItem[];
  totalHours: number;
  totalAmount: number;
  rate: number;
  bankRouting?: string;
  bankAccount?: string;
  emailInvoiceTo?: string;
  emailNotes?: string;
}

// ── Mock data: one entry per semi-monthly stream ────────────────────────────

export function getMockInvoices(): InvoiceData[] {
  const rate = 50.0;
  const billFrom: BillingParty = {
    name: 'Clark Stacer',
    address: ['119 N Polk St Apt A', 'Eugene, OR 97402-4391'],
    phone: '(541) 435-4727',
  };
  const billTo: BillingParty = {
    name: 'ZeroBias',
    address: ['12400 Highway 71 West', 'Suite 350-407', 'Austin, TX 78738'],
  };
  const shared = {
    submittedDate: '03/14/2026',
    dueDate: 'Due Upon Receipt',
    billTo,
    billFrom,
    payableTo: 'Clark Stacer',
    rate,
    bankRouting: '32518101',
    bankAccount: '5309680317',
    emailInvoiceTo: 'zerobias@ap.mercury.com',
    emailNotes: 'cc: bhierholzer@zerobias.com',
  };

  const zbProject = 'UI — General Development';
  const smProject = 'SME Mart — General Development';
  const smOverLabel = 'SME Mart — General Development (over 15h weekly cap)';
  // The detailed per-day work log for each line lives in the referenced ZeroBias
  // Platform task (the "W3Geekery Work Log" board). The invoice line is a billable
  // summary that POINTS at that task — so the task code is the prominent reference,
  // not buried plumbing.
  const zbOrg = (task: string) =>
    `Full work log: ZeroBias Platform Task <strong>${task}</strong>`;
  const smOrg = (task: string) =>
    `Full work log: ZeroBias Platform Task <strong>${task}</strong>`;

  // Totals sum the per-line amounts (so $0.00 over-cap lines never inflate the
  // dollar total) and the per-line hours (for the /data endpoint only).
  const sumHrs = (weeks: WeekLineItem[]) =>
    weeks.reduce((s, w) => s + w.projects.reduce((s2, p) => s2 + p.hours, 0), 0);
  // Net billable total = everything EXCEPT the over-cap lines.
  const sumAmt = (weeks: WeekLineItem[]) =>
    weeks.reduce((s, w) => s + w.projects.reduce((s2, p) => s2 + (p.over ? 0 : p.amount), 0), 0);

  // ── Jan 16–31 ──
  const zb1Weeks: WeekLineItem[] = [
    { weekRange: 'Jan 16 – Jan 24', projects: [{ projectLabel: zbProject, orgDetail: 'Jira: PM-853, PM-854, PM-855, PM-856, PM-857, PM-858', hours: 20, amount: 20 * rate }] },
    { weekRange: 'Jan 27 – Jan 31', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-8'), hours: 20, amount: 20 * rate }] },
  ];
  const sm1Weeks: WeekLineItem[] = [
    { weekRange: 'Jan 27 – Jan 31', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-2'), hours: 10, amount: 10 * rate }] },
  ];

  // ── Feb 3–14 ──
  const zb2Weeks: WeekLineItem[] = [
    { weekRange: 'Feb 3 – Feb 7', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-9'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Feb 10 – Feb 14', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-10'), hours: 20, amount: 20 * rate }] },
  ];
  const sm2Weeks: WeekLineItem[] = [
    { weekRange: 'Feb 3 – Feb 7', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-4'), hours: 15, amount: 15 * rate }] },
    { weekRange: 'Feb 10 – Feb 14', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-6'), hours: 15, amount: 15 * rate }] },
  ];

  // ── Feb 16–27 ──
  const zb3Weeks: WeekLineItem[] = [
    { weekRange: 'Feb 16 – Feb 20', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-11'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Feb 23 – Feb 27', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-13'), hours: 20, amount: 20 * rate }] },
  ];
  const sm3Weeks: WeekLineItem[] = [
    { weekRange: 'Feb 16 – Feb 20', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-12'), hours: 14.25, amount: 14.25 * rate }] },
    { weekRange: 'Feb 23 – Feb 27', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-14'), hours: 15, amount: 15 * rate }] },
  ];

  // ── Mar 2–13 (1st half) ──
  const zb4Weeks: WeekLineItem[] = [
    { weekRange: 'Mar 2 – Mar 6', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-16'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Mar 9 – Mar 13', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-17'), hours: 20, amount: 20 * rate }] },
  ];
  const sm4Weeks: WeekLineItem[] = [
    { weekRange: 'Mar 2 – Mar 6', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-3'), hours: 14, amount: 14 * rate }] },
    {
      weekRange: 'Mar 9 – Mar 13',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-4'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-4'), hours: 0.25, amount: 0.25 * rate, over: true },
      ],
    },
  ];

  // ── Mar 16–31 (2nd half) ──
  const zb5Weeks: WeekLineItem[] = [
    { weekRange: 'Mar 16 – Mar 20', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-1'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Mar 23 – Mar 27', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-3'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Mar 30 – Mar 31', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-5'), hours: 7.5, amount: 7.5 * rate }] },
  ];
  const sm5Weeks: WeekLineItem[] = [
    {
      weekRange: 'Mar 16 – Mar 20',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-2'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-2'), hours: 1.0, amount: 1.0 * rate, over: true },
      ],
    },
    {
      weekRange: 'Mar 23 – Mar 27',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-4'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-4'), hours: 3.25, amount: 3.25 * rate, over: true },
      ],
    },
    { weekRange: 'Mar 30 – Mar 31', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-6'), hours: 6.25, amount: 6.25 * rate }] },
  ];

  // ── Apr 1–15 (1st half) ──
  // Split week Mar 30–Apr 3: March billed 7.5h ZB (Mar 30–31, in ZB0129), so
  // April fills to the 20h week -> Apr 1–3 ZB = 12.5h (not 4×3).
  const zb6Weeks: WeekLineItem[] = [
    { weekRange: 'Apr 1 – Apr 3', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-7'), hours: 12.5, amount: 12.5 * rate }] },
    { weekRange: 'Apr 6 – Apr 10', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-9'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Apr 13 – Apr 15', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-11'), hours: 12, amount: 12 * rate }] },
  ];
  const sm6Weeks: WeekLineItem[] = [
    {
      // Split week Mar 30–Apr 3: 15h W3G cap minus 6.25h billed in March (aha1-6)
      // = 8.75h billed in April; the remaining Apr 1–3 work (2.25h) is over-cap.
      weekRange: 'Apr 1 – Apr 3',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-8'), hours: 8.75, amount: 8.75 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-8'), hours: 2.25, amount: 2.25 * rate, over: true },
      ],
    },
    {
      weekRange: 'Apr 6 – Apr 10',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-10'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-10'), hours: 4.75, amount: 4.75 * rate, over: true },
      ],
    },
    { weekRange: 'Apr 13 – Apr 15', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-12'), hours: 11.75, amount: 11.75 * rate }] },
  ];

  // ── Apr 16–30 (2nd half) ──
  const zb7Weeks: WeekLineItem[] = [
    { weekRange: 'Apr 16 – Apr 17', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-13'), hours: 8, amount: 8 * rate }] },
    { weekRange: 'Apr 20 – Apr 24', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-15'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'Apr 27 – Apr 30', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-17'), hours: 16, amount: 16 * rate }] },
  ];
  const sm7Weeks: WeekLineItem[] = [
    {
      // Split week Apr 13–17: 15h W3G cap minus 11.75h billed Apr 13–15 (aha1-12)
      // = 3.25h billed Apr 16–17; the remaining Apr 16–17 work (8.25h) is over-cap.
      weekRange: 'Apr 16 – Apr 17',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-14'), hours: 3.25, amount: 3.25 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-14'), hours: 8.25, amount: 8.25 * rate, over: true },
      ],
    },
    {
      weekRange: 'Apr 20 – Apr 24',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-16'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-16'), hours: 4.25, amount: 4.25 * rate, over: true },
      ],
    },
    { weekRange: 'Apr 27 – Apr 30', projects: [{ projectLabel: smProject, orgDetail: smOrg('aha1-18'), hours: 14, amount: 14 * rate }] },
  ];

  // ── May 1–15 (1st half) ──
  // May 1 is the tail of the Apr 27–May 1 week (April billed 16h ZB / 14h W3G in
  // aha1-17/18, left as-is); May 1 fills ZB to the 20h cap (4h) and W3G to the
  // 15h cap (1h), with the remaining 4h W3G over-cap.
  const zb8Weeks: WeekLineItem[] = [
    { weekRange: 'May 1', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-19'), hours: 4, amount: 4 * rate }] },
    { weekRange: 'May 4 – May 8', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-21'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'May 11 – May 15', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-23'), hours: 20, amount: 20 * rate }] },
  ];
  const sm8Weeks: WeekLineItem[] = [
    {
      weekRange: 'May 1',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-20'), hours: 1, amount: 1 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-20'), hours: 4, amount: 4 * rate, over: true },
      ],
    },
    {
      weekRange: 'May 4 – May 8',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-22'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-22'), hours: 1.75, amount: 1.75 * rate, over: true },
      ],
    },
    {
      weekRange: 'May 11 – May 15',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-24'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-24'), hours: 5.5, amount: 5.5 * rate, over: true },
      ],
    },
  ];

  // ── May 16–31 (2nd half) ──
  // May 26–29 is the Memorial Day short week (4 days); ZB billed proportionally
  // at 16h (4×4), W3G fills its 15h cap with 3.25h over.
  const zb9Weeks: WeekLineItem[] = [
    { weekRange: 'May 18 – May 22', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-25'), hours: 20, amount: 20 * rate }] },
    { weekRange: 'May 26 – May 29', projects: [{ projectLabel: zbProject, orgDetail: zbOrg('aha1-27'), hours: 16, amount: 16 * rate }] },
  ];
  const sm9Weeks: WeekLineItem[] = [
    {
      weekRange: 'May 18 – May 22',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-26'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-26'), hours: 1.75, amount: 1.75 * rate, over: true },
      ],
    },
    {
      weekRange: 'May 26 – May 29',
      projects: [
        { projectLabel: smProject, orgDetail: smOrg('aha1-28'), hours: 15, amount: 15 * rate },
        { projectLabel: smOverLabel, orgDetail: smOrg('aha1-28'), hours: 3.25, amount: 3.25 * rate, over: true },
      ],
    },
  ];

  const mk = (
    invoiceNumber: string,
    title: string,
    dateRange: string,
    weeks: WeekLineItem[],
    submittedDate: string = shared.submittedDate,
  ): InvoiceData => ({
    ...shared,
    submittedDate,
    invoiceNumber,
    period: { title, dateRange },
    weeks,
    totalHours: sumHrs(weeks),
    totalAmount: sumAmt(weeks),
  });

  return [
    mk('ZB0125', 'January 2026<br>Second Half', 'Jan. 16 – Jan. 31', zb1Weeks),
    mk('SM0001', 'January 2026<br>Second Half', 'Jan. 27 – Jan. 31', sm1Weeks),
    mk('ZB0126', 'February 2026<br>First Half', 'Feb. 3 – Feb. 14', zb2Weeks),
    mk('SM0002', 'February 2026<br>First Half', 'Feb. 3 – Feb. 14', sm2Weeks),
    mk('ZB0127', 'February 2026<br>Second Half', 'Feb. 16 – Feb. 27', zb3Weeks),
    mk('SM0003', 'February 2026<br>Second Half', 'Feb. 16 – Feb. 27', sm3Weeks),
    mk('ZB0128', 'March 2026<br>First Half', 'Mar. 2 – Mar. 13', zb4Weeks),
    mk('SM0004', 'March 2026<br>First Half', 'Mar. 2 – Mar. 13', sm4Weeks),
    mk('ZB0129', 'March 2026<br>Second Half', 'Mar. 16 – Mar. 31', zb5Weeks, '06/12/2026'),
    mk('SM0005', 'March 2026<br>Second Half', 'Mar. 16 – Mar. 31', sm5Weeks, '06/12/2026'),
    mk('ZB0130', 'April 2026<br>First Half', 'Apr. 1 – Apr. 15', zb6Weeks, '06/15/2026'),
    mk('SM0006', 'April 2026<br>First Half', 'Apr. 1 – Apr. 15', sm6Weeks, '06/15/2026'),
    mk('ZB0131', 'April 2026<br>Second Half', 'Apr. 16 – Apr. 30', zb7Weeks, '06/15/2026'),
    mk('SM0007', 'April 2026<br>Second Half', 'Apr. 16 – Apr. 30', sm7Weeks, '06/15/2026'),
    mk('ZB0132', 'May 2026<br>First Half', 'May 1 – May 15', zb8Weeks, '06/17/2026'),
    mk('SM0008', 'May 2026<br>First Half', 'May 1 – May 15', sm8Weeks, '06/17/2026'),
    mk('ZB0133', 'May 2026<br>Second Half', 'May 16 – May 31', zb9Weeks, '06/17/2026'),
    mk('SM0009', 'May 2026<br>Second Half', 'May 16 – May 31', sm9Weeks, '06/17/2026'),
  ];
}

// ── HTML renderer ───────────────────────────────────────────────────────────

export function renderBrandedInvoiceHtml(data: InvoiceData): string {
  const weekRows = data.weeks
    .map((week) => {
      const projectRows = week.projects
        .map((p) =>
          p.over
            ? // Over-cap lines render as a compact indented sub-line under the
              // billable project row above (same work-period/task — no need to
              // repeat the project name + Org/Boundary/Task detail).
              `
          <tr class="project-row over-row">
            <td class="project-cell over-cell">
              <div class="over-label">Over 15h weekly cap</div>
            </td>
            <td class="hours-cell">${p.hours} hrs</td>
            <td class="amount-cell">$${p.amount.toFixed(2)}</td>
          </tr>`
            : `
          <tr class="project-row">
            <td class="project-cell">
              <div class="project-label">${p.projectLabel}</div>
              <div class="project-detail">${p.orgDetail}</div>
            </td>
            <td class="hours-cell">${p.hours} hrs</td>
            <td class="amount-cell">$${p.amount.toFixed(2)}</td>
          </tr>`,
        )
        .join('');

      return `
        <tr class="week-header-row">
          <td class="week-range" colspan="3">${week.weekRange}</td>
        </tr>
        ${projectRows}`;
    })
    .join('');

  const billToAddress = data.billTo.address?.join('<br>') ?? '';
  const billFromAddress = data.billFrom.address?.join('<br>') ?? '';

  // Over-cap lines (worked past the weekly cap): billed at the real rate into the
  // gross Subtotal, then removed via Adjustments. data.totalAmount is the net
  // billable (over-cap excluded), so the Total reflects only what's charged.
  const overageAmt = data.weeks.reduce(
    (s, w) => s + w.projects.reduce((s2, p) => s2 + (p.over ? p.amount : 0), 0), 0);
  const subtotal = data.totalAmount + overageAmt; // gross, with overage

  return `
  <style scoped>
    :root {
      --ink: #1a1a2e;
      --muted: #64748b;
      --border: #e2e8f0;
      --bg-subtle: #f8fafc;
      --accent: #4338ca;
      --accent-light: #eef2ff;
      --white: #ffffff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: var(--ink);
      background: #f1f5f9;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .invoice-page { max-width: 850px; margin: 0 auto; background: var(--white); border-radius: 0; overflow: hidden; }
    .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 1rem 2rem 0.75rem; border-bottom: 3px solid var(--accent); }
    .brand { display: flex; align-items: center; gap: 1rem; }
    .brand img { width: 200px; height: 200px; border-radius: 12px; object-fit: contain; }
    .brand-info { display: flex; flex-direction: column; gap: 0.1rem; }
    .brand-info h1 { font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; }
    .brand-info .from-address { font-size: 0.75rem; color: var(--muted); line-height: 1.4; }
    .invoice-title-block { text-align: right; padding-top: 0; }
    .invoice-title-block .label { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; color: var(--accent); line-height: 1; }
    .invoice-title-block .submitted { font-size: 0.75rem; color: var(--accent); font-weight: 600; margin-top: 0.25rem; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; padding: 0.75rem 2rem 0; }
    .info-block h3 { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); margin-bottom: 0.2rem; }
    .info-block .info-name { font-size: 0.8rem; font-weight: 700; margin-bottom: 0.1rem; }
    .info-block .info-detail { font-size: 0.75rem; color: var(--muted); line-height: 1.4; }
    .info-block .info-value { font-size: 0.8rem; font-weight: 600; line-height: 1.2; }
    .period-row { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.5rem 2rem; }
    .period-row h3 { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .period-row h3::after { content: ':'; }
    .period-row .period-value { font-size: 0.8rem; font-weight: 600; }
    .bank-info { display: flex; gap: 2rem; padding: 0.5rem 2rem; background: var(--bg-subtle); border-bottom: 1px solid var(--border); }
    .bank-item { display: flex; align-items: baseline; gap: 0.4rem; }
    .bank-item .bank-label { font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
    .bank-item .bank-label::after { content: ':'; }
    .bank-item .bank-value { font-size: 0.8rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .line-items { padding: 0 2rem; }
    .line-items table { width: 100%; border-collapse: collapse; }
    .line-items thead th { font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); padding: 0.6rem 0.5rem 0.4rem; text-align: left; border-bottom: 2px solid var(--border); }
    .line-items thead th.hours-col, .line-items thead th.amount-col { text-align: right; width: 90px; }
    .week-header-row td { padding: 0.22rem 0.5rem 0.18rem; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent); background: var(--accent-light); border-bottom: 1px solid var(--border); }
    .project-row td { padding: 0.22rem 0.5rem; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.35; }
    .project-row .project-cell { padding-right: 1rem; }
    .project-label { font-size: 0.8rem; font-weight: 600; }
    .project-detail { font-size: 0.78rem; color: #475569; margin-top: 0.15rem; }
    .project-detail strong { color: var(--accent); font-weight: 700; }
    .over-row .over-cell { padding-left: 1.5rem; }
    .over-label { font-size: 0.72rem; color: var(--muted); font-style: italic; }
    .over-row .hours-cell, .over-row .amount-cell { color: var(--muted); font-style: italic; font-weight: 500; }
    .project-row .hours-cell, .project-row .amount-cell { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 0.8rem; font-weight: 500; }
    .project-row .amount-cell { font-weight: 600; }
    .totals { padding: 0.75rem 2rem 1rem; }
    .totals-grid { display: flex; justify-content: flex-end; }
    .totals-table { border-collapse: collapse; }
    .totals-table td { padding: 0.2rem 0; font-size: 0.8rem; font-variant-numeric: tabular-nums; }
    /* hours + amount cells = 90px each, right-padded 0.5rem, so they sit directly
       under the line-item Qty + Amount columns above (same widths + right edge). */
    .totals-table .tt-label { text-align: right; padding-right: 0.75rem; white-space: nowrap; }
    .totals-table .tt-hrs, .totals-table .tt-amt { width: 90px; text-align: right; padding-right: 0.5rem; }
    .totals-table .tt-over-hrs { font-weight: 700; color: var(--ink); }
    .totals-table .subtotal td { color: var(--muted); }
    .totals-table .adjustments td { color: var(--muted); padding-bottom: 0.4rem; }
    .totals-table .total td { font-size: 1rem; font-weight: 800; border-top: 2px solid var(--ink); padding-top: 0.4rem; }
    .totals-table .total .tt-amt { color: var(--accent); }
    .invoice-footer { padding: 0.6rem 2rem; background: var(--bg-subtle); border-top: 1px solid var(--border); }
    .footer-row { display: flex; justify-content: space-between; align-items: flex-start; }
    .footer-email { font-size: 0.7rem; color: var(--muted); line-height: 1.4; }
    .footer-email strong { color: var(--ink); }
    .footer-thanks { font-size: 0.75rem; font-weight: 600; color: var(--accent); text-align: right; }
    @media print {
      body { background: white; }
      .invoice-page { margin: 0; box-shadow: none; border-radius: 0; max-width: none; }
      .project-row td { border-bottom-color: #e2e8f0; }
    }
  </style>
</head>
<body>
  <div class="invoice-page">
    <div class="invoice-header">
      <div class="brand">
        <img src="${W3_LOGO_DATA_URI}" alt="W3Geekery" />
        <div class="brand-info">
          <h1>${data.billFrom.name}</h1>
          <div class="from-address">
            ${billFromAddress}
            ${data.billFrom.phone ? `<br>${data.billFrom.phone}` : ''}
          </div>
        </div>
      </div>
      <div class="invoice-title-block">
        <div class="label">INVOICE</div>
        <div class="submitted">Submitted on ${data.submittedDate}</div>
      </div>
    </div>
    <div class="info-grid">
      <div class="info-block">
        <h3>Invoice For</h3>
        <div class="info-name">${data.billTo.name}</div>
        <div class="info-detail">${billToAddress}</div>
      </div>
      <div class="info-block">
        <h3>Payable To</h3>
        <div class="info-name">${data.payableTo}</div>
      </div>
      <div class="info-block">
        <h3>Invoice #</h3>
        <div class="info-value">${data.invoiceNumber}</div>
        <div style="margin-top: 1rem;">
          <h3>Due Date</h3>
          <div class="info-value">${data.dueDate}</div>
        </div>
      </div>
    </div>
    <div class="period-row">
      <h3>Period</h3>
      <div class="period-value">${data.period.title.replace(/<br\s*\/?>/g, ' ')} &middot; ${data.period.dateRange}</div>
    </div>
    ${data.bankRouting ? `
    <div class="bank-info">
      <div class="bank-item">
        <div class="bank-label">Bank Routing #</div>
        <div class="bank-value">${data.bankRouting}</div>
      </div>
      <div class="bank-item">
        <div class="bank-label">Bank Account #</div>
        <div class="bank-value">${data.bankAccount}</div>
      </div>
    </div>
    ` : ''}
    <div class="line-items">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="hours-col">Qty</th>
            <th class="amount-col">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${weekRows}
        </tbody>
      </table>
    </div>
    <div class="totals">
      <div class="totals-grid">
        <table class="totals-table">
          <tr class="subtotal">
            <td class="tt-label">Subtotal</td>
            <td class="tt-hrs"></td>
            <td class="tt-amt">$${subtotal.toFixed(2)}</td>
          </tr>
          <tr class="adjustments">
            <td class="tt-label">Adjustments</td>
            <td class="tt-hrs"></td>
            <td class="tt-amt">${overageAmt > 0 ? `-$${overageAmt.toFixed(2)}` : '$0.00'}</td>
          </tr>
          <tr class="total">
            <td class="tt-label">Total</td>
            <td class="tt-hrs"></td>
            <td class="tt-amt">$${data.totalAmount.toFixed(2)}</td>
          </tr>
        </table>
      </div>
    </div>
    <div class="invoice-footer">
      <div class="footer-row">
        <div class="footer-email">
          ${data.emailInvoiceTo ? `<strong>Email invoice to:</strong><br>${data.emailInvoiceTo}` : ''}
          ${data.emailNotes ? `<br>${data.emailNotes}` : ''}
        </div>
        <div class="footer-thanks">Thank you for your business.</div>
      </div>
    </div>
  </div>`;
}
