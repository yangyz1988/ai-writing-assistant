import { AchievementRecord } from './achievement-ledger';

export const WEEKLY_COMMITMENTS_STORAGE_KEY = 'weeklyCommitments';

export type CommitmentStatus = 'planned' | 'completed' | 'delayed' | 'canceled';

export interface WeeklyCommitment {
  id: string;
  weekId: string;
  description: string;
  expectedOutcome: string;
  project: string;
  status: CommitmentStatus;
  evidenceRecordIds: string[];
  explanation: string;
  sourceRecordId?: string;
  createdAt: number;
  updatedAt: number;
}

const localDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getWeekId = (value: Date | string): string => {
  const date = typeof value === 'string' ? new Date(`${value}T00:00:00`) : new Date(value);
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return localDate(result);
};

export const getNextWeekId = (value: Date | string): string => {
  const start = new Date(`${getWeekId(value)}T00:00:00`);
  start.setDate(start.getDate() + 7);
  return localDate(start);
};

export const deriveCommitmentsFromRecords = (
  records: AchievementRecord[],
  existing: WeeklyCommitment[],
  now = Date.now(),
): WeeklyCommitment[] => {
  const importedSourceIds = new Set(existing.map((item) => item.sourceRecordId).filter(Boolean));
  const derived = records
    .filter((record) => record.nextAction.trim() && !importedSourceIds.has(record.id))
    .map((record): WeeklyCommitment => ({
      id: `commitment-${record.id}`,
      weekId: getNextWeekId(record.occurredAt),
      description: record.nextAction.trim(),
      expectedOutcome: '',
      project: record.project,
      status: 'planned',
      evidenceRecordIds: [],
      explanation: '',
      sourceRecordId: record.id,
      createdAt: now,
      updatedAt: now,
    }));
  return [...existing, ...derived];
};

export const getCommitmentsForWeek = (
  commitments: WeeklyCommitment[],
  date = new Date(),
): WeeklyCommitment[] => commitments.filter((item) => item.weekId === getWeekId(date));

export const updateCommitmentReview = (
  commitment: WeeklyCommitment,
  input: Pick<WeeklyCommitment, 'status' | 'evidenceRecordIds' | 'explanation'>,
  records: AchievementRecord[],
  reviewDate = new Date(),
  now = Date.now(),
): WeeklyCommitment => {
  const eligibleIds = new Set(
    records
      .filter((record) => record.confirmed && getWeekId(record.occurredAt) === getWeekId(reviewDate))
      .map((record) => record.id),
  );
  const evidenceRecordIds = [...new Set(input.evidenceRecordIds)].filter((id) => eligibleIds.has(id));

  if (input.status === 'completed' && evidenceRecordIds.length === 0) {
    throw new Error('completion_evidence_required');
  }
  if ((input.status === 'delayed' || input.status === 'canceled') && !input.explanation.trim()) {
    throw new Error('status_explanation_required');
  }

  return {
    ...commitment,
    status: input.status,
    evidenceRecordIds,
    explanation: input.explanation.trim(),
    updatedAt: now,
  };
};

export const normalizeWeeklyCommitment = (value: WeeklyCommitment): WeeklyCommitment => ({
  ...value,
  expectedOutcome: value.expectedOutcome || '',
  evidenceRecordIds: Array.isArray(value.evidenceRecordIds) ? value.evidenceRecordIds : [],
  explanation: value.explanation || '',
  updatedAt: value.updatedAt || value.createdAt,
});

export const formatCommitmentReview = (
  commitments: WeeklyCommitment[],
  records: AchievementRecord[],
  language: 'zh' | 'en' = 'zh',
): string => {
  if (commitments.length === 0) return '';
  const copy = language === 'zh'
    ? { title: '五、上周承诺兑现', planned: '待核对', completed: '已完成', delayed: '延期', canceled: '取消', evidence: '证据', explanation: '说明' }
    : { title: '5. Previous Commitments', planned: 'Planned', completed: 'Completed', delayed: 'Delayed', canceled: 'Canceled', evidence: 'Evidence', explanation: 'Explanation' };
  const status = { planned: copy.planned, completed: copy.completed, delayed: copy.delayed, canceled: copy.canceled };
  const byId = new Map(records.map((record) => [record.id, record]));
  return [
    copy.title,
    ...commitments.map((item) => {
      const evidence = item.evidenceRecordIds.map((id) => byId.get(id)?.summary).filter(Boolean).join('；');
      const details = [evidence ? `${copy.evidence}: ${evidence}` : '', item.explanation ? `${copy.explanation}: ${item.explanation}` : ''].filter(Boolean).join('；');
      return `- [${status[item.status]}] ${item.project ? `【${item.project}】` : ''}${item.description}${details ? `（${details}）` : ''}`;
    }),
  ].join('\n');
};
