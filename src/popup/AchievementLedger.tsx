import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ACHIEVEMENT_LEDGER_STORAGE_KEY,
  AchievementCategory,
  AchievementDraft,
  AchievementRecord,
  MissingFact,
  createAchievementRecord,
  generateWeeklyReport,
  getMissingFacts,
  getWeeklyRecords,
  normalizeAchievementRecord,
  serializeLedger,
  toAchievementDraft,
  updateAchievementRecord,
} from '../shared/achievement-ledger';
import { Language } from '../shared/i18n/types';
import { CommitmentReview } from './CommitmentReview';

interface AchievementLedgerProps {
  language: Language;
}

const CATEGORY_LABELS: Record<Language, Record<AchievementCategory, string>> = {
  zh: { achievement: '成果', metric: '数据', problem: '问题', collaboration: '协作', feedback: '反馈', plan: '计划' },
  en: { achievement: 'Achievement', metric: 'Metric', problem: 'Problem', collaboration: 'Collaboration', feedback: 'Feedback', plan: 'Plan' },
};

const COPY = {
  zh: {
    title: '工作成果账本', subtitle: '记录事实，确认后再生成周报。所有数据仅保存在本机。',
    add: '记录一项成果', edit: '编辑', editing: '编辑成果记录', capture: '读取网页选区', captured: '已读取网页选区和页面来源，请核对后保存。', noSelection: '当前页面没有可读取的选中文本。', cancel: '取消', save: '保存记录', empty: '本周还没有记录',
    source: '事实原文', sourcePlaceholder: '记录你完成了什么，或粘贴脱敏后的工作素材',
    summary: '成果摘要', summaryPlaceholder: '一句话说明完成了什么；留空时使用事实原文',
    date: '发生日期', project: '所属项目', projectPlaceholder: '可选，例如：商店发布', category: '类型',
    impact: '结果或影响', impactPlaceholder: '对用户、团队或业务产生了什么影响',
    metrics: '数字或证据', metricsPlaceholder: '可选，例如：耗时降低 30%', role: '本人角色', rolePlaceholder: '可选，例如：负责人',
    sourceTitle: '来源页面', sourceUrl: '来源地址', sourceConfirm: '我已核对该页面来源', sourceBadge: '来源已确认', sourcePending: '来源待核对',
    next: '下一步', nextPlaceholder: '可选，填写后进入下周计划', confirm: '事实已核对，可用于周报',
    missing: '建议补充', confirmed: '已确认', unconfirmed: '待确认', delete: '删除', deleteConfirm: '确定删除这条成果记录吗？',
    report: '生成本周周报', copy: '复制周报', copied: '已复制', export: '导出账本',
    reportHint: '至少确认一条本周事实后才能生成。未确认记录不会进入周报。', required: '请填写事实原文或成果摘要。',
    reportError: '没有可用于周报的已确认记录。', all: '全部记录', week: '本周记录', missingFacts: { impact: '结果或影响', metrics: '数字或证据', role: '本人承担的角色' },
  },
  en: {
    title: 'Achievement Ledger', subtitle: 'Capture facts and confirm them before generating a weekly report. Data stays on this device.',
    add: 'Add record', edit: 'Edit', editing: 'Edit achievement', capture: 'Read page selection', captured: 'Selection and page source loaded. Review before saving.', noSelection: 'No readable selection is available on this page.', cancel: 'Cancel', save: 'Save record', empty: 'No records this week',
    source: 'Source fact', sourcePlaceholder: 'Describe what happened or paste sanitized work notes',
    summary: 'Summary', summaryPlaceholder: 'One sentence; source fact is used when blank',
    date: 'Date', project: 'Project', projectPlaceholder: 'Optional', category: 'Category',
    impact: 'Impact', impactPlaceholder: 'Impact on users, team, or business', metrics: 'Metrics or evidence', metricsPlaceholder: 'Optional, e.g. 30% faster',
    sourceTitle: 'Source page', sourceUrl: 'Source URL', sourceConfirm: 'I verified this page source', sourceBadge: 'Source verified', sourcePending: 'Source unverified',
    role: 'Your role', rolePlaceholder: 'Optional', next: 'Next action', nextPlaceholder: 'Optional; included in next-week plan',
    confirm: 'Fact checked and ready for reports', missing: 'Consider adding', confirmed: 'Confirmed', unconfirmed: 'Unconfirmed',
    delete: 'Delete', deleteConfirm: 'Delete this achievement record?', report: 'Generate weekly report', copy: 'Copy report', copied: 'Copied',
    export: 'Export ledger', reportHint: 'Confirm at least one record. Unconfirmed records are excluded.', required: 'Enter a source fact or summary.',
    reportError: 'No confirmed records are available for this report.', all: 'All records', week: 'This week', missingFacts: { impact: 'impact', metrics: 'metrics or evidence', role: 'your role' },
  },
};

const today = (): string => new Date().toISOString().slice(0, 10);
const emptyDraft = (): AchievementDraft => ({
  occurredAt: today(), project: '', category: 'achievement', sourceText: '', summary: '', impact: '', metrics: '', role: '', nextAction: '', confirmed: false,
  sourceTitle: '', sourceUrl: '', sourceConfirmed: false,
});

export const AchievementLedger: React.FC<AchievementLedgerProps> = ({ language }) => {
  const copy = COPY[language];
  const [records, setRecords] = useState<AchievementRecord[]>([]);
  const [draft, setDraft] = useState<AchievementDraft>(emptyDraft);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [report, setReport] = useState('');
  const [commitmentSection, setCommitmentSection] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    chrome.storage.local.get([ACHIEVEMENT_LEDGER_STORAGE_KEY]).then((result) => {
      const stored = result[ACHIEVEMENT_LEDGER_STORAGE_KEY];
      if (Array.isArray(stored)) setRecords((stored as AchievementRecord[]).map(normalizeAchievementRecord));
    }).catch(() => setNotice('Unable to load local ledger'));
  }, []);

  const weeklyRecords = useMemo(() => getWeeklyRecords(records), [records]);
  const visibleRecords = showAll ? [...records].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : weeklyRecords;

  const persist = async (next: AchievementRecord[]) => {
    setRecords(next);
    await chrome.storage.local.set({ [ACHIEVEMENT_LEDGER_STORAGE_KEY]: next });
  };

  const save = async () => {
    try {
      const next = editingId
        ? records.map((record) => record.id === editingId ? updateAchievementRecord(record, draft) : record)
        : [createAchievementRecord(draft), ...records];
      await persist(next);
      setDraft(emptyDraft());
      setEditingId(null);
      setShowForm(false);
      setNotice('');
    } catch {
      setNotice(copy.required);
    }
  };

  const toggleConfirmed = async (id: string) => {
    await persist(records.map((record) => record.id === id ? { ...record, confirmed: !record.confirmed } : record));
  };

  const remove = async (id: string) => {
    if (!confirm(copy.deleteConfirm)) return;
    await persist(records.filter((record) => record.id !== id));
  };

  const edit = (record: AchievementRecord) => {
    setDraft(toAchievementDraft(record));
    setEditingId(record.id);
    setShowForm(true);
    setNotice('');
  };

  const closeForm = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setShowForm(false);
    setNotice('');
  };

  const createReport = () => {
    try {
      const baseReport = generateWeeklyReport(weeklyRecords, language);
      setReport(commitmentSection ? `${baseReport}\n\n${commitmentSection}` : baseReport);
      setNotice('');
    } catch {
      setNotice(copy.reportError);
    }
  };

  const handleCommitmentReviewChange = useCallback((section: string) => setCommitmentSection(section), []);

  const exportLedger = () => {
    const blob = new Blob([serializeLedger(records)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `achievement-ledger-${today()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const capturePageSelection = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('active_tab_unavailable');
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SELECTION' });
      if (!response?.success || typeof response.text !== 'string' || !response.text.trim()) throw new Error('selection_unavailable');
      setDraft({
        ...draft,
        sourceText: response.text.trim(),
        summary: draft.summary || response.text.trim(),
        sourceTitle: typeof response.title === 'string' ? response.title : '',
        sourceUrl: typeof response.url === 'string' ? response.url : '',
        sourceConfirmed: false,
      });
      setEditingId(null);
      setShowForm(true);
      setNotice(copy.captured);
    } catch {
      setNotice(copy.noSelection);
    }
  };

  const setField = <K extends keyof AchievementDraft>(key: K, value: AchievementDraft[K]) => setDraft({ ...draft, [key]: value });

  return (
    <section className="achievement-ledger-section">
      <div className="ledger-heading">
        <div><h2>{copy.title}</h2><p>{copy.subtitle}</p></div>
        <div className="ledger-heading-actions"><button className="secondary-button" onClick={capturePageSelection}>{copy.capture}</button><button className="add-mode-btn" onClick={() => showForm ? closeForm() : setShowForm(true)}>{showForm ? copy.cancel : `+ ${copy.add}`}</button></div>
      </div>

      {showForm && <div className="ledger-form">
        {editingId && <h3>{copy.editing}</h3>}
        <div className="ledger-form-row">
          <div className="form-group"><label htmlFor="ledger-date">{copy.date}</label><input id="ledger-date" type="date" value={draft.occurredAt} onChange={(event) => setField('occurredAt', event.target.value)} /></div>
          <div className="form-group"><label htmlFor="ledger-category">{copy.category}</label><select id="ledger-category" value={draft.category} onChange={(event) => setField('category', event.target.value as AchievementCategory)}>{Object.entries(CATEGORY_LABELS[language]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div>
        <div className="form-group"><label htmlFor="ledger-project">{copy.project}</label><input id="ledger-project" value={draft.project} onChange={(event) => setField('project', event.target.value)} placeholder={copy.projectPlaceholder} /></div>
        <div className="form-group"><label htmlFor="ledger-source">{copy.source} *</label><textarea id="ledger-source" rows={3} value={draft.sourceText} onChange={(event) => setField('sourceText', event.target.value)} placeholder={copy.sourcePlaceholder} /></div>
        <div className="ledger-form-row">
          <div className="form-group"><label htmlFor="ledger-source-title">{copy.sourceTitle}</label><input id="ledger-source-title" value={draft.sourceTitle} onChange={(event) => setField('sourceTitle', event.target.value)} /></div>
          <div className="form-group"><label htmlFor="ledger-source-url">{copy.sourceUrl}</label><input id="ledger-source-url" type="url" value={draft.sourceUrl} onChange={(event) => setField('sourceUrl', event.target.value)} /></div>
        </div>
        {(draft.sourceTitle || draft.sourceUrl) && <label className="ledger-confirm" htmlFor="ledger-source-confirmed"><input id="ledger-source-confirmed" type="checkbox" checked={draft.sourceConfirmed} onChange={(event) => setField('sourceConfirmed', event.target.checked)} /> {copy.sourceConfirm}</label>}
        <div className="form-group"><label htmlFor="ledger-summary">{copy.summary}</label><input id="ledger-summary" value={draft.summary} onChange={(event) => setField('summary', event.target.value)} placeholder={copy.summaryPlaceholder} /></div>
        <div className="form-group"><label htmlFor="ledger-impact">{copy.impact}</label><input id="ledger-impact" value={draft.impact} onChange={(event) => setField('impact', event.target.value)} placeholder={copy.impactPlaceholder} /></div>
        <div className="form-group"><label htmlFor="ledger-metrics">{copy.metrics}</label><input id="ledger-metrics" value={draft.metrics} onChange={(event) => setField('metrics', event.target.value)} placeholder={copy.metricsPlaceholder} /></div>
        <div className="ledger-form-row">
          <div className="form-group"><label htmlFor="ledger-role">{copy.role}</label><input id="ledger-role" value={draft.role} onChange={(event) => setField('role', event.target.value)} placeholder={copy.rolePlaceholder} /></div>
          <div className="form-group"><label htmlFor="ledger-next">{copy.next}</label><input id="ledger-next" value={draft.nextAction} onChange={(event) => setField('nextAction', event.target.value)} placeholder={copy.nextPlaceholder} /></div>
        </div>
        <label className="ledger-confirm" htmlFor="ledger-confirmed"><input id="ledger-confirmed" type="checkbox" checked={draft.confirmed} onChange={(event) => setField('confirmed', event.target.checked)} /> {copy.confirm}</label>
        <button className="save-mode-btn ledger-save" onClick={save}>{copy.save}</button>
      </div>}

      <div className="ledger-toolbar">
        <div className="ledger-filter"><button className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>{copy.week} ({weeklyRecords.length})</button><button className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>{copy.all} ({records.length})</button></div>
        <button className="secondary-button" disabled={records.length === 0} onClick={exportLedger}>{copy.export}</button>
      </div>

      {visibleRecords.length === 0 && <div className="empty-state"><p>{copy.empty}</p></div>}
      <div className="ledger-list">{visibleRecords.map((item) => {
        const missing = getMissingFacts(item);
        return <article className={`ledger-card ${item.confirmed ? 'confirmed' : ''}`} key={item.id}>
          <div className="ledger-card-head"><span>{CATEGORY_LABELS[language][item.category]} · {item.occurredAt}</span><span className={`ledger-status ${item.confirmed ? 'confirmed' : ''}`}>{item.confirmed ? copy.confirmed : copy.unconfirmed}</span></div>
          <strong>{item.project ? `【${item.project}】` : ''}{item.summary}</strong>
          {item.impact && <p>{item.impact}</p>}
          {item.metrics && <p className="ledger-evidence">{item.metrics}</p>}
          {item.source && <p className={`ledger-source ${item.sourceConfirmed ? 'confirmed' : ''}`} title={item.source.url}>{item.sourceConfirmed ? copy.sourceBadge : copy.sourcePending}: {item.source.title || item.source.url}</p>}
          {missing.length > 0 && <p className="ledger-missing">{copy.missing}: {missing.map((fact: MissingFact) => copy.missingFacts[fact]).join(language === 'zh' ? '、' : ', ')}</p>}
          <div className="ledger-card-actions"><button className="secondary-button" onClick={() => edit(item)}>{copy.edit}</button><button className="secondary-button" onClick={() => toggleConfirmed(item.id)}>{item.confirmed ? copy.unconfirmed : copy.confirmed}</button><button className="delete-btn" onClick={() => remove(item.id)}>{copy.delete}</button></div>
        </article>;
      })}</div>

      <CommitmentReview language={language} records={records} onReviewChange={handleCommitmentReviewChange} />

      <div className="ledger-report-actions"><button className="primary-button" onClick={createReport}>{copy.report}</button><small>{copy.reportHint}</small></div>
      {report && <div className="ledger-report"><textarea readOnly rows={12} value={report} /><button className="secondary-button" onClick={async () => { await navigator.clipboard.writeText(report); setNotice(copy.copied); }}>{copy.copy}</button></div>}
      {notice && <p className="account-notice" role="status">{notice}</p>}
    </section>
  );
};
