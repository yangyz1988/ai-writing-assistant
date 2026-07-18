import { test as base, chromium, expect, type BrowserContext, type CDPSession } from '@playwright/test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

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
