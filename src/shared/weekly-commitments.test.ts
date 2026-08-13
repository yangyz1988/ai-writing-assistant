import { describe, expect, it } from 'vitest';
import { AchievementRecord } from './achievement-ledger';
import {
  WeeklyCommitment,
  deriveCommitmentsFromRecords,
  formatCommitmentReview,
  getCommitmentsForWeek,
  getNextWeekId,
  getWeekId,
  updateCommitmentReview,
} from './weekly-commitments';

const record = (overrides: Partial<AchievementRecord> = {}): AchievementRecord => ({
  id: 'r1', occurredAt: '2026-08-06', capturedAt: 1, project: '发布', category: 'plan', sourceText: '计划发布',
  summary: '计划发布', impact: '', metrics: '', role: '', nextAction: '完成商店灰度', confirmed: true,
  ...overrides,
});

const commitment = (overrides: Partial<WeeklyCommitment> = {}): WeeklyCommitment => ({
  id: 'c1', weekId: '2026-08-10', description: '完成商店灰度', expectedOutcome: '', project: '发布', status: 'planned',
  evidenceRecordIds: [], explanation: '', sourceRecordId: 'r1', createdAt: 1, updatedAt: 1, ...overrides,
});

describe('weekly commitments', () => {
  it('以周一作为稳定周标识并计算下一周', () => {
    expect(getWeekId('2026-08-13')).toBe('2026-08-10');
    expect(getNextWeekId('2026-08-06')).toBe('2026-08-10');
  });

  it('从成果下一步导入承诺且不会重复导入', () => {
    expect(deriveCommitmentsFromRecords([record()], [], 10)).toMatchObject([{ weekId: '2026-08-10', description: '完成商店灰度', sourceRecordId: 'r1' }]);
    expect(deriveCommitmentsFromRecords([record()], [commitment()], 10)).toHaveLength(1);
  });

  it('只返回目标周承诺', () => {
    expect(getCommitmentsForWeek([commitment(), commitment({ id: 'other', weekId: '2026-08-17' })], new Date('2026-08-13'))).toHaveLength(1);
  });

  it('没有本周确认成果证据时不能标记完成', () => {
    expect(() => updateCommitmentReview(commitment(), { status: 'completed', evidenceRecordIds: [], explanation: '' }, [], new Date('2026-08-13'))).toThrow('completion_evidence_required');
    expect(() => updateCommitmentReview(commitment(), { status: 'completed', evidenceRecordIds: ['old'] , explanation: '' }, [record({ id: 'old', occurredAt: '2026-08-06' })], new Date('2026-08-13'))).toThrow('completion_evidence_required');
  });

  it('完成状态仅保留本周确认过的证据', () => {
    const evidence = record({ id: 'done', occurredAt: '2026-08-12', category: 'achievement', nextAction: '' });
    const updated = updateCommitmentReview(commitment(), { status: 'completed', evidenceRecordIds: ['done', 'unknown'], explanation: '' }, [evidence], new Date('2026-08-13'), 20);
    expect(updated).toMatchObject({ status: 'completed', evidenceRecordIds: ['done'], updatedAt: 20 });
  });

  it('延期或取消必须填写说明', () => {
    expect(() => updateCommitmentReview(commitment(), { status: 'delayed', evidenceRecordIds: [], explanation: ' ' }, [], new Date('2026-08-13'))).toThrow('status_explanation_required');
    expect(updateCommitmentReview(commitment(), { status: 'canceled', evidenceRecordIds: [], explanation: '优先级调整' }, [], new Date('2026-08-13')).explanation).toBe('优先级调整');
  });

  it('生成包含状态和证据的承诺兑现章节', () => {
    const evidence = record({ id: 'done', occurredAt: '2026-08-12', summary: '完成 10% 灰度', nextAction: '' });
    const reviewed = commitment({ status: 'completed', evidenceRecordIds: ['done'] });
    expect(formatCommitmentReview([reviewed], [evidence])).toContain('[已完成]');
    expect(formatCommitmentReview([reviewed], [evidence])).toContain('证据: 完成 10% 灰度');
  });
});
