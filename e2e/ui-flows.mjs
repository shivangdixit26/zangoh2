// End-to-end UI check of the main supervisor flows. Run with the stack up: `npm run dev`, then `npm run e2e`.
// Note: it changes live demo data (takes over chats, sends messages); use Settings > Reset demo data afterwards.
import { chromium } from 'playwright-core';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const results = [];
const errors = [];
const step = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
};

// Headless Chrome has no microphone, so voice input is exercised with a scripted SpeechRecognition
// that behaves like Chrome's: interim result, final result, then `end`.
const FAKE_SPEECH = () => {
  class FakeRecognition {
    constructor() { this.lang = 'en-IN'; this.continuous = true; this.interimResults = true; }
    start() {
      setTimeout(() => this.onstart?.(), 50);
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'hi this is', confidence: 0.6 }], { isFinal: false })] }), 300);
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'hi this is a voice reply from the supervisor full stop', confidence: 0.92 }], { isFinal: true })] }), 700);
      this.timer = setTimeout(() => this.onend?.(), 1100);
    }
    stop() { clearTimeout(this.timer); this.onend?.(); }
    abort() { clearTimeout(this.timer); this.onerror?.({ error: 'aborted' }); this.onend?.(); }
  }
  // Recent Chrome ships the unprefixed constructor too, and the app prefers it.
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
};

// Uses your installed Google Chrome (no browser download). Override with CHROME_PATH if needed.
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
await context.addInitScript(FAKE_SPEECH);
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

// ---- Dashboard: metrics over Server-Sent Events every 2 s ---------------------
await step('dashboard metrics stream over SSE and refresh every ~2s', async () => {
  const sse = page.waitForResponse((r) => r.url().includes('/api/metrics/stream'), { timeout: 15000 });
  await page.goto(`${BASE}/`);
  const res = await sse;
  if (!(res.headers()['content-type'] ?? '').includes('text/event-stream')) throw new Error('metrics stream is not text/event-stream');
  const status = page.getByText(/Metrics streaming · updated/);
  await status.waitFor({ timeout: 10000 });
  const first = await status.textContent();
  await page.waitForTimeout(2600);
  const second = await status.textContent();
  if (first === second) throw new Error(`timestamp did not change: ${first}`);
});

// ---- Intervention flow --------------------------------------------------------
await page.goto(`${BASE}/conversations/c-84241`);
await page.getByRole('heading', { name: /Ava Thompson · Case #84241/ }).waitFor({ timeout: 15000 });

await step('take over from AI', async () => {
  await page.getByRole('button', { name: 'Take over', exact: true }).click();
  await page.getByText("You're in control").waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Return to AI' }).waitFor();
});

await step('template library during intervention: select, fill variables, preview, use', async () => {
  await page.getByRole('button', { name: /Template/ }).first().click();
  await page.getByRole('heading', { name: 'Response Templates' }).waitFor();
  await page.getByPlaceholder('Search title, message, or tag').fill('refund delay');
  await page.getByRole('button', { name: /Refund delay apology/ }).first().click();
  await page.getByText(/1 variable needs a value/).waitFor();
  const name = page.getByLabel('Customer first name');
  if ((await name.inputValue()) !== 'Ava') throw new Error('customer name was not auto-filled');
  await page.getByLabel('Follow-up time').fill('5 pm today');
  await name.fill('Ms Thompson');
  await page.getByText('Edited', { exact: true }).waitFor();
  await page.getByText('Entered by you', { exact: true }).waitFor();
  await page.getByText(/variables resolved/).waitFor();
  await page.getByText(/Live preview · completed message/).waitFor();
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  const value = await page.getByLabel('Supervisor reply').inputValue();
  if (!value.includes('5 pm today') || !value.includes('Ms Thompson')) throw new Error(`composer text wrong: ${value}`);
  if (/\{\{/.test(value)) throw new Error('unresolved variables left in composer');
});

await step('send templated reply as supervisor', async () => {
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByText('Template: Refund delay apology').waitFor({ timeout: 5000 });
});

await step('unfilled variable blocks sending', async () => {
  await page.getByLabel('Supervisor reply').fill('Hi {{user_name}}, update by {{follow_up_time}}');
  if (!(await page.getByRole('button', { name: 'Send reply' }).isDisabled())) throw new Error('send should be disabled with {{variables}} in text');
  await page.getByLabel('Supervisor reply').fill('');
});

await step('voice input: dictated reply is transcribed and added to the conversation', async () => {
  await page.getByRole('button', { name: 'Reply by voice' }).click();
  await page.getByText(/Listening \(/).waitFor({ timeout: 3000 });
  await page.getByText(/Sending your voice reply in/).waitFor({ timeout: 5000 });
  const value = await page.getByLabel('Supervisor reply').inputValue();
  if (value !== 'Hi this is a voice reply from the supervisor.') throw new Error(`transcript wrong: "${value}"`);
  await page.getByText('Sent by voice').waitFor({ timeout: 8000 });
  await page.getByText('Hi this is a voice reply from the supervisor.', { exact: true }).first().waitFor();
});

await step('return control to AI with notes; AI resumes', async () => {
  await page.getByRole('button', { name: 'Return to AI' }).click();
  await page.getByLabel('Handoff notes').fill('Replacement approved, ships today. Confirm tracking.');
  await page.getByRole('button', { name: 'Return to AI', exact: true }).last().click();
  await page.getByText('Not visible to the customer').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Take over', exact: true }).waitFor({ timeout: 5000 });
  await page.getByText(/sending a replacement/).waitFor({ timeout: 8000 });
});

await step('co-pilot recommendation renders', async () => {
  await page.goto(`${BASE}/conversations/c-84291`);
  await page.getByText('Co-pilot recommendation').waitFor({ timeout: 10000 });
  await page.getByText(/Approve expedited refund of ₹8,420/).waitFor({ timeout: 10000 });
});

// ---- Agent configuration --------------------------------------------------
await step('editing max tokens creates a draft and the simulation reflects it', async () => {
  await page.goto(`${BASE}/agents/csr-returns`);
  await page.getByText('Simulation console').waitFor({ timeout: 10000 });
  await page.getByLabel('Max tokens').evaluate((el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, '48');
  await page.getByText('Draft changes').waitFor({ timeout: 5000 });
  await page.getByText(/CR-\d+ • 1 field modified/).waitFor({ timeout: 5000 });
  await page.getByText('Truncated', { exact: true }).waitFor({ timeout: 10000 });
});

await step('escalation threshold edit + review & deploy modal lists changes', async () => {
  const refund = page.getByLabel('Refund value');
  await refund.fill('9000');
  await refund.blur();
  await page.getByText(/2 fields modified/).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Review & deploy' }).click();
  await page.getByRole('cell', { name: 'Max tokens' }).waitFor();
  await page.getByRole('cell', { name: 'Refund value' }).waitFor();
  await page.getByText(/Risk: (Moderate|High)/).first().waitFor();
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await page.getByText(/Live v4\.\d/).waitFor({ timeout: 5000 });
});

await step('apply a preset loads it into the draft', async () => {
  await page.getByRole('button', { name: /Presets/ }).click();
  await page.getByText('Conservative (high-risk queues)').waitFor();
  await page.getByRole('button', { name: 'Apply' }).nth(1).click();
  await page.getByText('Draft changes').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Review & deploy' }).click();
  await page.getByRole('button', { name: 'Discard draft' }).click();
});

// ---- Templates ----------------------------------------------------------
await step('create a template with {{variables}}, a new category and private sharing', async () => {
  await page.goto(`${BASE}/templates`);
  await page.getByText('By category').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /Create template/ }).click();
  await page.getByPlaceholder('Template name').fill('E2E warranty apology');
  await page.getByRole('button', { name: 'Category: General' }).click();
  await page.getByRole('option', { name: '+ New category…' }).click();
  await page.getByLabel('New category name').fill('Warranty');
  await page.getByLabel('Content').fill('Hi {{User Name}}, sorry!');
  await page.getByText(/isn't a valid variable/).waitFor();
  await page.getByLabel('Content').fill('Hi {{user_name}}, sorry about case {{case_id}}. **We fixed it.**');
  await page.getByText('Customer first name', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Share with Team/ }).click(); // new templates are shared by default; make it private
  await page.getByText('Private: only you can see and use it.').waitFor();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Template created').waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /Warranty/ }).first().waitFor();
  await page.getByRole('button', { name: /E2E warranty apology/ }).first().waitFor();
});

await step('private template is hidden from another supervisor', async () => {
  const other = await page.request.get(`${BASE}/api/templates`, { headers: { 'x-supervisor': 'Rahul Mehta' } });
  const items = (await other.json()).items;
  if (items.some((t) => t.name === 'E2E warranty apology')) throw new Error('private template leaked to another supervisor');
});

await step('delete template via card action', async () => {
  await page.getByRole('button', { name: /E2E warranty apology/ }).first().click();
  await page.getByRole('button', { name: 'Delete E2E warranty apology' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Deleted "E2E warranty apology"').waitFor({ timeout: 5000 });
});

// ---- Dashboard filters, alerts, search ----------------------------------
await step('dashboard filters and alerts menu', async () => {
  await page.goto(`${BASE}/`);
  await page.getByText('AI containment').waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: 'All priorities' }).click();
  await page.getByRole('option', { name: 'Critical' }).click();
  if (!page.url().includes('priority=critical')) throw new Error('filter not reflected in URL');
  await page.getByRole('button', { name: /Alerts, \d+ open/ }).click();
  await page.getByText('Acknowledge all').waitFor();
});

await step('global search finds a conversation', async () => {
  await page.keyboard.press('Escape');
  await page.getByLabel('Search conversations, agents and templates').fill('marcus');
  await page.getByRole('button', { name: /Marcus Lee · #84275/ }).click();
  await page.getByRole('heading', { name: /Marcus Lee · Case #84275/ }).waitFor({ timeout: 8000 });
});

// ---- Mobile ---------------------------------------------------------------
await step('dashboard is usable at phone width (no horizontal scroll, card queue, bottom nav)', async () => {
  const phone = await context.newPage();
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(`${BASE}/`);
  await phone.getByText('AI containment').waitFor({ timeout: 10000 });
  await phone.getByText(/Metrics streaming/).waitFor({ timeout: 10000 });
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (overflow > 1) throw new Error(`page scrolls horizontally by ${overflow}px`);
  if (await phone.locator('table').first().isVisible()) throw new Error('wide table shown on phone');
  await phone.getByRole('link', { name: 'Conversations' }).last().waitFor();
  await phone.getByRole('button', { name: 'Open search' }).click();
  await phone.getByLabel('Search conversations, agents and templates').waitFor();
  await phone.close();
});

console.log(results.join('\n'));
console.log(`\nbrowser errors: ${errors.length}`);
errors.slice(0, 10).forEach((e) => console.log(' ', e));
await browser.close();
process.exitCode = results.some((r) => r.startsWith('FAIL')) || errors.length ? 1 : 0;
