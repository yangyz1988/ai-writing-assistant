export const ACHIEVEMENT_LEDGER_STORAGE_KEY = 'achievementLedgerRecords';

export type AchievementCategory =
  | 'achievement'
  | 'metric'
  | 'problem'
  | 'collaboration'
  | 'feedback'
  | 'plan';

export type MissingFact = 'impact' | 'metrics' | 'role';

export interface AchievementSource {
  title: string;
  url: string;
}

export interface AchievementRecord {
  id: string;
  occurredAt: string;
  capturedAt: number;
  updatedAt?: number;
  project: string;
  category: AchievementCategory;
  sourceText: string;
  summary: string;
  impact: string;
  metrics: string;
  role: string;
  nextAction: string;
  confirmed: boolean;
  source?: AchievementSource;
  sourceConfirmed?: boolean;
}

export interface AchievementDraft {
  occurredAt: string;
  project: string;
  category: AchievementCategory;
  sourceText: string;
  summary: string;
  impact: string;
  metrics: string;
  role: string;
  nextAction: string;
  confirmed: boolean;
  sourceTitle: string;
  sourceUrl: string;
  sourceConfirmed: boolean;
}

export const createAchievementRecord = (
  draft: AchievementDraft,
  now = Date.now(),
  random = Math.random(),
): AchievementRecord => {
  const sourceText = draft.sourceText.trim();
  const summary = draft.summary.trim();
  if (!sourceText && !summary) throw new Error('record_content_required');

  return {
    id: `achievement-${now.toString(36)}-${random.toString(36).slice(2, 8)}`,
    capturedAt: now,
    updatedAt: now,
    occurredAt: draft.occurredAt || new Date(now).toISOString().slice(0, 10),
    project: draft.project.trim(),
    category: draft.category,
    sourceText,
    summary: summary || sourceText,
    impact: draft.impact.trim(),
    metrics: draft.metrics.trim(),
    role: draft.role.trim(),
    nextAction: draft.nextAction.trim(),
    confirmed: draft.confirmed,
    source: draft.sourceUrl.trim() || draft.sourceTitle.trim()
      ? { title: draft.sourceTitle.trim(), url: draft.sourceUrl.trim() }
      : undefined,
    sourceConfirmed: Boolean(draft.sourceConfirmed && (draft.sourceUrl.trim() || draft.sourceTitle.trim())),
  };
};

export const normalizeAchievementRecord = (value: AchievementRecord): AchievementRecord => ({
  ...value,
  updatedAt: value.updatedAt || value.capturedAt,
  source: value.source
    ? { title: value.source.title?.trim() || '', url: value.source.url?.trim() || '' }
    : undefined,
  sourceConfirmed: Boolean(value.source && value.sourceConfirmed),
});

export const updateAchievementRecord = (
  original: AchievementRecord,
  draft: AchievementDraft,
  now = Date.now(),
): AchievementRecord => ({
  ...createAchievementRecord(draft, now),
  id: original.id,
  capturedAt: original.capturedAt,
  updatedAt: now,
});

export const toAchievementDraft = (record: AchievementRecord): AchievementDraft => ({
  occurredAt: record.occurredAt,
  project: record.project,
  category: record.category,
  sourceText: record.sourceText,
  summary: record.summary,
  impact: record.impact,
  metrics: record.metrics,
  role: record.role,
  nextAction: record.nextAction,
  confirmed: record.confirmed,
  sourceTitle: record.source?.title || '',
  sourceUrl: record.source?.url || '',
  sourceConfirmed: Boolean(record.sourceConfirmed),
});

const startOfWeek = (date: Date): Date => {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return result;
};

export const getWeeklyRecords = (records: AchievementRecord[], now = new Date()): AchievementRecord[] => {
  const start = startOfWeek(now).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return records
    .filter((record) => {
      const occurredAt = new Date(`${record.occurredAt}T00:00:00`).getTime();
      return occurredAt >= start && occurredAt < end;
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
};

export const getMissingFacts = (record: AchievementRecord): MissingFact[] => {
  const missing: MissingFact[] = [];
  if (!record.impact) missing.push('impact');
  if (!record.metrics) missing.push('metrics');
  if (!record.role) missing.push('role');
  return missing.slice(0, 2);
};

export const generateWeeklyReport = (records: AchievementRecord[], language: 'zh' | 'en' = 'zh'): string => {
  const confirmed = records.filter((record) => record.confirmed);
  if (confirmed.length === 0) throw new Error('confirmed_records_required');

  const text = language === 'zh'
    ? { title: '本周工作复盘', achievements: '一、本周成果', noAchievements: '- 暂无已确认成果', problems: '二、问题与风险', noProblems: '- 暂无已确认问题', plans: '三、下周计划', pending: '- [待补充]', references: '四、事实引用', local: '本地记录', sourceUnconfirmed: '来源未确认' }
    : { title: 'Weekly Work Review', achievements: '1. Achievements', noAchievements: '- No confirmed achievements', problems: '2. Problems and Risks', noProblems: '- No confirmed problems', plans: '3. Next Week', pending: '- [To be added]', references: '4. Fact References', local: 'Local record', sourceUnconfirmed: 'Source unconfirmed' };

  const referenceById = new Map(confirmed.map((record, index) => [record.id, `F${index + 1}`]));

  const achievements = confirmed.filter((record) => record.category !== 'problem' && record.category !== 'plan');
  const problems = confirmed.filter((record) => record.category === 'problem');
  const plans = confirmed.filter((record) => record.category === 'plan' || record.nextAction);
  const line = (record: AchievementRecord): string => {
    const evidence = [record.metrics, record.impact].filter(Boolean).join('；');
    const project = record.project ? `【${record.project}】` : '';
    return `- [${referenceById.get(record.id)}] ${project}${record.summary}${evidence ? `（${evidence}）` : ''}`;
  };

  const referenceLine = (record: AchievementRecord): string => {
    const source = record.sourceConfirmed && record.source
      ? [record.source.title, record.source.url].filter(Boolean).join(' · ')
      : (record.source ? text.sourceUnconfirmed : text.local);
    return `- [${referenceById.get(record.id)}] ${record.occurredAt} · ${record.summary} · ${source}`;
  };

  return [
    text.title,
    '',
    text.achievements,
    ...(achievements.length ? achievements.map(line) : [text.noAchievements]),
    '',
    text.problems,
    ...(problems.length ? problems.map(line) : [text.noProblems]),
    '',
    text.plans,
    ...(plans.length
      ? plans.map((record) => `- [${referenceById.get(record.id)}] ${record.project ? `【${record.project}】` : ''}${record.nextAction || record.summary}`)
      : [text.pending]),
    '',
    text.references,
    ...confirmed.map(referenceLine),
  ].join('\n');
};

export const serializeLedger = (records: AchievementRecord[]): string => JSON.stringify({
  version: 2,
  exportedAt: new Date().toISOString(),
  records,
}, null, 2);
