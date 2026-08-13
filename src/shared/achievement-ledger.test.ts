import { describe, expect, it } from 'vitest';
import {
  AchievementRecord,
  createAchievementRecord,
  generateWeeklyReport,
  getMissingFacts,
  getWeeklyRecords,
  normalizeAchievementRecord,
  serializeLedger,
  toAchievementDraft,
  updateAchievementRecord,
} from './achievement-ledger';

const record = (overrides: Partial<AchievementRecord> = {}): AchievementRecord => ({
  id: 'achievement-1',
  occurredAt: '2026-08-12',
  capturedAt: Date.parse('2026-08-12T08:00:00Z'),
  project: '发布项目',
  category: 'achievement',
  sourceText: '完成发布检查',
  summary: '完成发布检查',
  impact: '减少上线风险',
  metrics: '发现 3 个问题',
  role: '负责人',
  nextAction: '',
  confirmed: true,
  source: undefined,
  sourceConfirmed: false,
  ...overrides,
});

describe('achievement ledger', () => {
  it('拒绝没有事实内容的记录，并用原文补齐摘要', () => {
    expect(() => createAchievementRecord({
      occurredAt: '', project: '', category: 'achievement', sourceText: ' ', summary: ' ',
      impact: '', metrics: '', role: '', nextAction: '', confirmed: false, sourceTitle: '', sourceUrl: '', sourceConfirmed: false,
    })).toThrow('record_content_required');

    expect(createAchievementRecord({
      occurredAt: '2026-08-12', project: '', category: 'achievement', sourceText: ' 完成上线 ', summary: '',
      impact: '', metrics: '', role: '', nextAction: '', confirmed: false, sourceTitle: '', sourceUrl: '', sourceConfirmed: false,
    }, 1, 0.5).summary).toBe('完成上线');
  });

  it('只返回本周记录并按日期倒序排列', () => {
    const result = getWeeklyRecords([
      record({ id: 'old', occurredAt: '2026-08-02' }),
      record({ id: 'mon', occurredAt: '2026-08-10' }),
      record({ id: 'wed', occurredAt: '2026-08-12' }),
    ], new Date('2026-08-13T12:00:00'));
    expect(result.map((item) => item.id)).toEqual(['wed', 'mon']);
  });

  it('每次最多提示两个高价值缺失事实', () => {
    expect(getMissingFacts(record({ impact: '', metrics: '', role: '' }))).toEqual(['impact', 'metrics']);
  });

  it('周报只使用用户确认过的事实', () => {
    const report = generateWeeklyReport([
      record(),
      record({ id: 'unconfirmed', summary: '不能进入周报', confirmed: false }),
      record({ id: 'risk', category: 'problem', summary: '依赖延迟', metrics: '', impact: '' }),
      record({ id: 'plan', category: 'plan', summary: '下周灰度', nextAction: '完成 10% 灰度' }),
    ]);
    expect(report).toContain('完成发布检查');
    expect(report).toContain('[F1]');
    expect(report).toContain('四、事实引用');
    expect(report).toContain('依赖延迟');
    expect(report).toContain('完成 10% 灰度');
    expect(report).not.toContain('不能进入周报');
  });

  it('没有确认事实时拒绝生成周报，导出包含版本号', () => {
    expect(() => generateWeeklyReport([record({ confirmed: false })])).toThrow('confirmed_records_required');
    expect(JSON.parse(serializeLedger([record()]))).toMatchObject({ version: 2, records: [{ id: 'achievement-1' }] });
  });

  it('英文界面生成英文周报结构', () => {
    const report = generateWeeklyReport([record()], 'en');
    expect(report).toContain('Weekly Work Review');
    expect(report).toContain('1. Achievements');
    expect(report).not.toContain('本周工作复盘');
  });

  it('编辑保留稳定 id 和捕获时间，并允许确认页面来源', () => {
    const original = record();
    const draft = { ...toAchievementDraft(original), summary: '更新后的事实', sourceTitle: '发布台', sourceUrl: 'https://example.com/release', sourceConfirmed: true };
    const updated = updateAchievementRecord(original, draft, 99);
    expect(updated).toMatchObject({ id: original.id, capturedAt: original.capturedAt, updatedAt: 99, summary: '更新后的事实', sourceConfirmed: true, source: { title: '发布台', url: 'https://example.com/release' } });
    expect(updated).not.toHaveProperty('sourceTitle');
    expect(updated).not.toHaveProperty('sourceUrl');
    expect(generateWeeklyReport([updated])).toContain('发布台 · https://example.com/release');
  });

  it('旧记录在读取时获得兼容默认值', () => {
    expect(normalizeAchievementRecord(record({ updatedAt: undefined }))).toMatchObject({ updatedAt: Date.parse('2026-08-12T08:00:00Z'), sourceConfirmed: false });
  });
});
