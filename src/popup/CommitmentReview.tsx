import React, { useEffect, useMemo, useState } from 'react';
import { AchievementRecord, getWeeklyRecords } from '../shared/achievement-ledger';
import { Language } from '../shared/i18n/types';
import {
  CommitmentStatus,
  WEEKLY_COMMITMENTS_STORAGE_KEY,
  WeeklyCommitment,
  deriveCommitmentsFromRecords,
  formatCommitmentReview,
  getCommitmentsForWeek,
  normalizeWeeklyCommitment,
  updateCommitmentReview,
} from '../shared/weekly-commitments';

interface CommitmentReviewProps {
  language: Language;
  records: AchievementRecord[];
  onReviewChange: (section: string) => void;
}

const COPY = {
  zh: {
    title: '上周承诺核对', hint: '从旧记录的“下一步”导入本周承诺。完成状态必须绑定本周已确认成果。', empty: '没有需要核对的本周承诺。',
    status: '状态', planned: '待核对', completed: '已完成', delayed: '延期', canceled: '取消', evidence: '成果证据', explanation: '说明',
    explanationPlaceholder: '延期或取消时必填', save: '保存核对', saved: '承诺核对已保存。', evidenceRequired: '标记完成前，必须选择至少一条本周已确认成果。',
    explanationRequired: '延期或取消必须填写说明。', noEvidence: '本周还没有可绑定的已确认成果。',
  },
  en: {
    title: 'Previous Commitment Review', hint: 'Imports this week commitments from earlier next actions. Completion requires confirmed evidence from this week.', empty: 'No commitments require review this week.',
    status: 'Status', planned: 'Planned', completed: 'Completed', delayed: 'Delayed', canceled: 'Canceled', evidence: 'Achievement evidence', explanation: 'Explanation',
    explanationPlaceholder: 'Required for delayed or canceled', save: 'Save review', saved: 'Commitment review saved.', evidenceRequired: 'Select at least one confirmed achievement from this week before marking completed.',
    explanationRequired: 'Delayed or canceled commitments require an explanation.', noEvidence: 'No confirmed achievements are available this week.',
  },
};

export const CommitmentReview: React.FC<CommitmentReviewProps> = ({ language, records, onReviewChange }) => {
  const copy = COPY[language];
  const [commitments, setCommitments] = useState<WeeklyCommitment[]>([]);
  const [notice, setNotice] = useState('');
  const weeklyEvidence = useMemo(() => getWeeklyRecords(records).filter((record) => record.confirmed), [records]);
  const currentCommitments = useMemo(() => getCommitmentsForWeek(commitments), [commitments]);

  useEffect(() => {
    chrome.storage.local.get([WEEKLY_COMMITMENTS_STORAGE_KEY]).then(async (result) => {
      const stored = Array.isArray(result[WEEKLY_COMMITMENTS_STORAGE_KEY])
        ? (result[WEEKLY_COMMITMENTS_STORAGE_KEY] as WeeklyCommitment[]).map(normalizeWeeklyCommitment)
        : [];
      const next = deriveCommitmentsFromRecords(records, stored);
      setCommitments(next);
      await chrome.storage.local.set({ [WEEKLY_COMMITMENTS_STORAGE_KEY]: next });
      onReviewChange(formatCommitmentReview(getCommitmentsForWeek(next), records, language));
    }).catch(() => setNotice('Unable to load commitments'));
  }, [records, language, onReviewChange]);

  const patchCommitment = (id: string, patch: Partial<WeeklyCommitment>) => {
    setCommitments((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const save = async (id: string) => {
    const target = commitments.find((item) => item.id === id);
    if (!target) return;
    try {
      const reviewed = updateCommitmentReview(target, target, records);
      const next = commitments.map((item) => item.id === id ? reviewed : item);
      setCommitments(next);
      await chrome.storage.local.set({ [WEEKLY_COMMITMENTS_STORAGE_KEY]: next });
      onReviewChange(formatCommitmentReview(getCommitmentsForWeek(next), records, language));
      setNotice(copy.saved);
    } catch (error) {
      setNotice(error instanceof Error && error.message === 'completion_evidence_required' ? copy.evidenceRequired : copy.explanationRequired);
    }
  };

  const statusOptions: Array<[CommitmentStatus, string]> = [
    ['planned', copy.planned], ['completed', copy.completed], ['delayed', copy.delayed], ['canceled', copy.canceled],
  ];

  return <section className="commitment-review">
    <h3>{copy.title}</h3><p className="commitment-hint">{copy.hint}</p>
    {currentCommitments.length === 0 && <div className="empty-state"><p>{copy.empty}</p></div>}
    <div className="commitment-list">{currentCommitments.map((item) => <article className="commitment-card" key={item.id}>
      <strong>{item.project ? `【${item.project}】` : ''}{item.description}</strong>
      <div className="form-group"><label htmlFor={`commitment-status-${item.id}`}>{copy.status}</label><select id={`commitment-status-${item.id}`} value={item.status} onChange={(event) => patchCommitment(item.id, { status: event.target.value as CommitmentStatus })}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <fieldset className="commitment-evidence"><legend>{copy.evidence}</legend>
        {weeklyEvidence.length === 0 && <small>{copy.noEvidence}</small>}
        {weeklyEvidence.map((record) => <label key={record.id}><input type="checkbox" checked={item.evidenceRecordIds.includes(record.id)} onChange={(event) => patchCommitment(item.id, { evidenceRecordIds: event.target.checked ? [...item.evidenceRecordIds, record.id] : item.evidenceRecordIds.filter((id) => id !== record.id) })} /> {record.summary}</label>)}
      </fieldset>
      <div className="form-group"><label htmlFor={`commitment-explanation-${item.id}`}>{copy.explanation}</label><input id={`commitment-explanation-${item.id}`} value={item.explanation} onChange={(event) => patchCommitment(item.id, { explanation: event.target.value })} placeholder={copy.explanationPlaceholder} /></div>
      <button className="secondary-button" onClick={() => save(item.id)}>{copy.save}</button>
    </article>)}</div>
    {notice && <p className="account-notice" role="status">{notice}</p>}
  </section>;
};
