import { test as base, chromium, expect, type BrowserContext, type CDPSession } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { startTestServer, stopTestServer } from './test-server';

type ExtensionFixtures = {
  context: BrowserContext;
  extensionId: string;
};

type CdpNode = {
  nodeId: number;
  attributes?: string[];
  children?: CdpNode[];
  shadowRoots?: CdpNode[];
};

const edgeCandidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const extensionPath = path.resolve('dist');
    const executablePath = edgeCandidates.find(existsSync);
    if (!executablePath) throw new Error('Microsoft Edge executable was not found');

    const userDataDir = mkdtempSync(path.join(tmpdir(), 'ai-writing-assistant-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    try {
      await use(context);
    } finally {
      await context.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  extensionId: async ({ context }, use) => {
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker');
    await use(new URL(serviceWorker.url()).host);
  },
});

function findNodeByClass(node: CdpNode, className: string): CdpNode | null {
  const attributes = node.attributes || [];
  const classIndex = attributes.indexOf('class');
  if (classIndex >= 0 && attributes[classIndex + 1]?.split(/\s+/).includes(className)) return node;

  for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
    const match = findNodeByClass(child, className);
    if (match) return match;
  }
  return null;
}

async function getNodeByClass(session: CDPSession, className: string): Promise<CdpNode | null> {
  const { root } = await session.send('DOM.getDocument', { depth: -1, pierce: true });
  return findNodeByClass(root as CdpNode, className);
}

async function clickNodeByClass(session: CDPSession, className: string): Promise<void> {
  await expect.poll(async () => Boolean(await getNodeByClass(session, className))).toBe(true);
  const node = await getNodeByClass(session, className);
  if (!node) throw new Error(`Unable to find .${className}`);
  const { object } = await session.send('DOM.resolveNode', { nodeId: node.nodeId });
  if (!object.objectId) throw new Error(`Unable to resolve .${className}`);
  await session.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function () { this.click(); }',
  });
}

async function mockDeepSeek(context: BrowserContext): Promise<void> {
  await context.route('https://api.deepseek.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: 'Codex' } }],
        usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
      }),
    });
  });
}

test.beforeEach(async ({ context }) => {
  await mockDeepSeek(context);
});

test('popup tests unsaved credentials and switches to current provider defaults', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.getByRole('button', { name: /API配置|API Config/ }).click();

  await expect(page.locator('#model')).toHaveValue('deepseek-v4-flash');
  await page.selectOption('#provider', 'anthropic');
  await expect(page.locator('#model')).toHaveValue('claude-haiku-4-5-20251001');
  await page.selectOption('#provider', 'deepseek');

  await page.fill('#apiKey', 'e2e-test-key');
  await page.getByRole('button', { name: /测试连接|Test Connection/ }).click();
  await expect(page.locator('.test-result')).toContainText(/连接成功|Connection successful/);
});

test('selected textarea text is rewritten and emits an input event', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.getByRole('button', { name: /API配置|API Config/ }).click();
  await popup.fill('#apiKey', 'e2e-test-key');
  await popup.getByRole('button', { name: /保存设置|Save Settings/ }).click();
  await expect(popup.locator('.test-result')).toContainText(/配置已保存|Settings saved/);
  await popup.close();

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/editor');
  await page.waitForSelector('#ai-writing-assistant-root', { state: 'attached' });

  await page.locator('#editor').evaluate((element) => {
    const editor = element as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(6, 11);
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  const session = await context.newCDPSession(page);
  await clickNodeByClass(session, 'ai-writing-mode-btn');
  await clickNodeByClass(session, 'ai-preview-confirm');

  await expect(page.locator('#editor')).toHaveValue('hello Codex');
  await expect(page.locator('#editor')).toHaveAttribute('data-input-events', '1');
});

let testServer: Server;

test.beforeAll(async () => {
  testServer = await startTestServer();
});

test.afterAll(async () => {
  await stopTestServer(testServer);
});

test('selected page text becomes a confirmed ledger record and weekly report', async ({ context, extensionId }) => {
  const sourcePage = await context.newPage();
  await sourcePage.goto('http://127.0.0.1:4173/editor');
  await sourcePage.waitForSelector('#ai-writing-assistant-root', { state: 'attached' });
  await sourcePage.locator('#editor').fill('完成发布检查并发现三个上线风险');
  await sourcePage.locator('#editor').evaluate((element) => {
    const editor = element as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(0, editor.value.length);
    editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  const worker = context.serviceWorkers()[0];
  const sourceTabId = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('Active source tab was not found');
    return tab.id;
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await worker.evaluate(async (tabId) => { await chrome.tabs.update(tabId, { active: true }); }, sourceTabId);
  await popup.getByRole('button', { name: /读取网页选区|Read page selection/ }).evaluate((button) => (button as HTMLButtonElement).click());

  const sourceInput = popup.getByLabel(/事实原文|Source fact/);
  await expect(sourceInput).toHaveValue('完成发布检查并发现三个上线风险');
  await expect(popup.getByLabel(/来源地址|Source URL/)).toHaveValue('http://127.0.0.1:4173/editor');
  await popup.getByLabel(/我已核对该页面来源|I verified this page source/).check();
  await popup.getByLabel(/所属项目|Project/).fill('商店发布');
  await popup.getByLabel(/结果或影响|Impact/).fill('降低正式发布失败概率');
  await popup.getByLabel(/数字或证据|Metrics or evidence/).fill('发现 3 个风险');
  await popup.getByLabel(/本人角色|Your role/).fill('发布负责人');
  await popup.getByLabel(/下一步|Next action/).fill('完成风险整改');
  await popup.getByLabel(/事实已核对|Fact checked/).check();
  await popup.getByRole('button', { name: /保存记录|Save record/ }).click();

  await expect(popup.locator('.ledger-card')).toContainText('完成发布检查并发现三个上线风险');
  await expect(popup.locator('.ledger-card')).toContainText(/已确认|Confirmed/);
  await expect(popup.locator('.ledger-card')).toContainText(/来源已确认|Source verified/);

  await popup.getByRole('button', { name: /编辑|Edit/ }).click();
  await popup.getByLabel(/成果摘要|Summary/).fill('完成发布前风险检查');
  await popup.getByRole('button', { name: /保存记录|Save record/ }).click();
  await expect(popup.locator('.ledger-card')).toContainText('完成发布前风险检查');
  await popup.getByRole('button', { name: /生成本周周报|Generate weekly report/ }).click();
  await expect(popup.locator('.ledger-report textarea')).toContainText('发现 3 个风险');
  await expect(popup.locator('.ledger-report textarea')).toContainText('完成风险整改');
  await expect(popup.locator('.ledger-report textarea')).toContainText('[F1]');
  await expect(popup.locator('.ledger-report textarea')).toContainText('http://127.0.0.1:4173/editor');
  await popup.screenshot({ path: 'test-results/achievement-ledger.png', fullPage: true });
});

test('previous commitment requires confirmed weekly evidence before completion', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  const weekStart = new Date();
  const day = weekStart.getDay() || 7;
  weekStart.setDate(weekStart.getDate() - day + 1);
  const previousWeek = new Date(weekStart);
  previousWeek.setDate(previousWeek.getDate() - 7);
  const dateValue = (date: Date) => date.toISOString().slice(0, 10);

  await popup.getByRole('button', { name: /添加记录|Add record/ }).click();
  await popup.getByLabel(/发生日期|Date/).fill(dateValue(previousWeek));
  await popup.getByLabel(/事实原文|Source fact/).fill('制定本周发布计划');
  await popup.getByLabel(/下一步|Next action/).fill('完成商店灰度');
  await popup.getByLabel(/事实已核对|Fact checked/).check();
  await popup.getByRole('button', { name: /保存记录|Save record/ }).click();

  await popup.getByRole('button', { name: /添加记录|Add record/ }).click();
  await popup.getByLabel(/事实原文|Source fact/).fill('商店灰度已完成');
  await popup.getByLabel(/成果摘要|Summary/).fill('完成 10% 商店灰度');
  await popup.getByLabel(/事实已核对|Fact checked/).check();
  await popup.getByRole('button', { name: /保存记录|Save record/ }).click();

  const review = popup.locator('.commitment-card').filter({ hasText: '完成商店灰度' });
  await expect(review).toBeVisible();
  await review.getByLabel(/状态|Status/).selectOption('completed');
  await review.getByRole('button', { name: /保存核对|Save review/ }).click();
  await expect(popup.getByRole('status')).toContainText(/必须选择至少一条|Select at least one/);
  await review.getByLabel('完成 10% 商店灰度').check();
  await review.getByRole('button', { name: /保存核对|Save review/ }).click();
  await expect(popup.getByRole('status')).toContainText(/已保存|saved/i);

  await popup.getByRole('button', { name: /生成本周周报|Generate weekly report/ }).click();
  await expect(popup.locator('.ledger-report textarea')).toContainText(/上周承诺兑现|Previous Commitments/);
  await expect(popup.locator('.ledger-report textarea')).toContainText(/已完成|Completed/);
  await expect(popup.locator('.ledger-report textarea')).toContainText('完成 10% 商店灰度');
});
