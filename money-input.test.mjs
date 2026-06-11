import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

// Extracts a top-level `function name(...) { ... }` block via brace matching so
// the pure money helpers can run outside the app.js closure.
function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `app.js missing function ${name}`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`Could not extract function ${name}`);
}

const helpers = new Function(`
  ${extractFunction(app, 'parseMoneyInputValue')}
  ${extractFunction(app, 'formatMoneyInputDisplay')}
  ${extractFunction(app, 'applyMoneyInputFormatting')}
  return { parseMoneyInputValue, formatMoneyInputDisplay, applyMoneyInputFormatting };
`)();

test('parseMoneyInputValue keeps the UGX integer discipline', () => {
  assert.equal(helpers.parseMoneyInputValue('24,000,000'), 24000000);
  assert.equal(helpers.parseMoneyInputValue('UGX 5,000'), 5000);
  assert.equal(helpers.parseMoneyInputValue(' 1 250 000 '), 1250000);
  assert.equal(helpers.parseMoneyInputValue(''), 0);
  assert.equal(helpers.parseMoneyInputValue(null), 0);
  assert.equal(helpers.parseMoneyInputValue('abc'), 0);
  assert.equal(helpers.parseMoneyInputValue(3500000), 3500000);
});

test('parseMoneyInputValue preserves a leading minus for balances', () => {
  assert.equal(helpers.parseMoneyInputValue('-3,500'), -3500);
  assert.equal(helpers.parseMoneyInputValue('-0'), 0);
});

test('parseMoneyInputValue ignores decimal separators (UGX is integer-only)', () => {
  // Live formatting strips dots while typing; pasted decimals collapse to digits.
  assert.equal(helpers.parseMoneyInputValue('12.75'), 1275);
});

test('formatMoneyInputDisplay groups thousands and round-trips with parse', () => {
  assert.equal(helpers.formatMoneyInputDisplay(24000000), '24,000,000');
  assert.equal(helpers.formatMoneyInputDisplay('1250'), '1,250');
  assert.equal(helpers.formatMoneyInputDisplay('-7500'), '-7,500');
  assert.equal(helpers.formatMoneyInputDisplay('0024'), '24');
  assert.equal(helpers.formatMoneyInputDisplay(''), '');
  assert.equal(helpers.formatMoneyInputDisplay(null), '');
  for (const amount of [0, 1, 999, 1000, 24000000, -1234567]) {
    assert.equal(helpers.parseMoneyInputValue(helpers.formatMoneyInputDisplay(amount)), amount);
  }
});

test('applyMoneyInputFormatting formats live and keeps the caret after its digit', () => {
  const input = {
    value: '24000',
    selectionStart: 5,
    selectionEnd: 5,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  helpers.applyMoneyInputFormatting(input);
  assert.equal(input.value, '24,000');
  assert.equal(input.selectionStart, 6);

  const midCaret = {
    value: '24000',
    selectionStart: 4, // after the 4th digit
    selectionEnd: 4,
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  helpers.applyMoneyInputFormatting(midCaret);
  assert.equal(midCaret.value, '24,000');
  assert.equal(midCaret.selectionStart, 5); // still after the 4th digit

  const unchanged = {
    value: '24,000',
    selectionStart: 6,
    selectionEnd: 6,
    setSelectionRange() {
      assert.fail('setSelectionRange must not run when the value is already formatted');
    },
  };
  helpers.applyMoneyInputFormatting(unchanged);
  assert.equal(unchanged.value, '24,000');
});

test('money inputs are wired through the central parse helper', () => {
  for (const id of ['bookingFee', 'bookingDeposit', 'expenseAmount', 'otherIncomeAmount']) {
    assert.match(
      app,
      new RegExp(`parseMoneyInputValue\\(document\\.getElementById\\('${id}'\\)`),
      `${id} must be read through parseMoneyInputValue`
    );
  }
  assert.match(app, /const value = parseMoneyInputValue\(input\.value\);/, 'revenue goal saves must parse grouped input');
  assert.match(app, /const value = parseMoneyInputValue\(amountInput\.value\);/, 'BBF saves must parse grouped input');
});

test('payment methods include Ugandan mobile money rails', () => {
  assert.match(app, /mtn_momo: 'MTN MoMo'/);
  assert.match(app, /airtel_money: 'Airtel Money'/);
  assert.match(app, /function normalizePaymentMethod\(/);
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  for (const selectId of ['expensePaymentMethod', 'bookingDepositMethod', 'otherIncomeMethod']) {
    const block = html.slice(html.indexOf(`id="${selectId}"`), html.indexOf(`id="${selectId}"`) + 700);
    assert.match(block, /value="mtn_momo"/, `${selectId} must offer MTN MoMo`);
    assert.match(block, /value="airtel_money"/, `${selectId} must offer Airtel Money`);
  }
});
