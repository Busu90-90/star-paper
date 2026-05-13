import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = {
  app: readFileSync(new URL('./app.js', import.meta.url), 'utf8'),
  reports: readFileSync(new URL('./app.reports.js', import.meta.url), 'utf8'),
  html: readFileSync(new URL('./index.html', import.meta.url), 'utf8'),
  supabase: readFileSync(new URL('./supabase.js', import.meta.url), 'utf8'),
  schema: readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'),
};

test('mock data feature is absent from production files', () => {
  const forbidden = [
    'loadMockPortfolioData',
    'clearMockData',
    'MOCK_PORTFOLIO_VERSION',
    'mockSeedVersion',
    'mockKey',
    'mock_key',
    'seed-booking-',
    'seed-expense-',
    'seed-income-',
    'Load Mock Data',
  ];

  for (const [name, content] of Object.entries(files)) {
    for (const token of forbidden) {
      assert.equal(content.includes(token), false, `${name} still contains ${token}`);
    }
  }
});

test('report controls keep production actions', () => {
  assert.match(files.html, /Generate\s*&amp;\s*Download PDF/);
  assert.match(files.html, /Export CSV/);
  assert.match(files.html, /Closing Thoughts/);
});

test('pdf export interface remains available', () => {
  assert.match(files.html, /id="spPdfExportModal"/);
  assert.match(files.html, /id="spPdfArtistSelect"/);
  assert.match(files.html, /id="spPdfDateStart"/);
  assert.match(files.html, /id="spPdfDateEnd"/);
  assert.match(files.reports, /function\s+openPdfExportModal\s*\(/);
  assert.match(files.reports, /async\s+function\s+generateMomentumPDF\s*\(/);
  assert.match(files.reports, /window\.openPdfExportModal\s*\|\|=/);
  assert.match(files.reports, /window\.generateMomentumPDF\s*\|\|=/);
});

test('cloud persistence surface remains available', () => {
  assert.match(files.app, /window\.SP_collectAllData\s*=\s*function\s+collectAllData/);
  assert.match(files.app, /async\s+function\s+saveUserData\s*\(/);
  assert.match(files.app, /function\s+syncCloudExtras\s*\(/);
  assert.match(files.supabase, /function\s+rowToBooking\s*\(/);
  assert.match(files.supabase, /function\s+bookingToRow\s*\(/);
  assert.match(files.supabase, /function\s+rowToExpense\s*\(/);
  assert.match(files.supabase, /function\s+expenseToRow\s*\(/);
  assert.match(files.supabase, /function\s+rowToOtherIncome\s*\(/);
  assert.match(files.supabase, /function\s+otherIncomeToRow\s*\(/);
  assert.match(files.supabase, /async\s+function\s+saveData\s*\(/);
  assert.match(files.supabase, /async\s+function\s+saveAllData\s*\(/);
});
