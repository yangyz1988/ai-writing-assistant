import { PromptTemplate } from './types';

const ADMIN_OUTPUT_RULES = '不得编造事实；保留原文中的日期、金额、姓名和责任人。信息不足时使用[待补充]标记。只输出最终成稿，不解释处理过程。';

const createAdminTemplate = (
  id: string,
  name: string,
  instruction: string,
  access: 'free' | 'pro',
): PromptTemplate => ({
  id,
  name,
  icon: '📋',
  access,
  builtin: true,
  prompt: access === 'pro' ? '' : `${instruction}${ADMIN_OUTPUT_RULES}`,
});

export const ADMIN_PROMPT_TEMPLATES: PromptTemplate[] = [
  createAdminTemplate('admin-formal-notice', '正式通知', '将原文改写为内部正式通知，依次包含标题、事项、时间、对象、执行要求和联系人。', 'free'),
  createAdminTemplate('admin-meeting-notice', '会议通知', '生成会议主题、时间、地点或链接、参会人员、议程、会前准备和参会要求。', 'free'),
  createAdminTemplate('admin-meeting-minutes', '会议纪要', '整理为会议主题、结论、待办事项、负责人、截止时间、风险和下次会议。', 'free'),
  createAdminTemplate('admin-weekly-report', '周报整理', '整理为本周完成、成果数据、问题与风险、下周计划和需要支持。', 'free'),
  createAdminTemplate('admin-formal-email', '正式邮件润色', '保留事实与诉求，补齐邮件主题、称呼、正文、行动请求和落款占位。', 'free'),
  createAdminTemplate('admin-cross-team-request', '跨部门协作请求', '说明背景、需配合事项、交付标准、负责人、截止时间和优先级。', 'free'),
  createAdminTemplate('admin-event-registration', '活动报名通知', '生成活动目的、参与对象、时间地点、报名方式、截止时间和注意事项。', 'pro'),
  createAdminTemplate('admin-policy-release', '制度发布通知', '说明生效日期、适用范围、核心变化、查阅路径和咨询渠道，使用审慎正式语气。', 'pro'),
  createAdminTemplate('admin-duty-schedule', '值班安排通知', '整理为日期、人员、职责、联系方式、交接要求和紧急升级方式。', 'pro'),
  createAdminTemplate('admin-safety-alert', '安全紧急提醒', '按风险、立即行动、禁止事项和联系人组织为简洁明确的提醒。', 'pro'),
  createAdminTemplate('admin-meeting-invitation', '会议邀请邮件', '输出邮件主题和正文，明确会议目的、时间地点、参会要求、材料和确认方式。', 'pro'),
  createAdminTemplate('admin-monthly-summary', '月度工作总结', '按目标达成、重点成果、问题复盘、资源需求和下月计划输出。', 'pro'),
  createAdminTemplate('admin-leadership-brief', '向领导汇报', '先写一句结论摘要，再列进展、风险和需要决策的事项，语气客观克制。', 'pro'),
  createAdminTemplate('admin-project-status', '项目进度同步', '按当前状态、已完成、下一里程碑、阻塞项、责任人和时间点输出。', 'pro'),
  createAdminTemplate('admin-follow-up-email', '催办邮件', '礼貌但明确地说明待办、原约定时间、影响和新的反馈截止时间。', 'pro'),
  createAdminTemplate('admin-visitor-confirmation', '客户接待确认', '涵盖来访时间、地点、联系人、议程、交通或停车提示和变更联系方式。', 'pro'),
  createAdminTemplate('admin-apology-delay', '致歉与延期说明', '说明影响、原因、补救措施、新交付时间和跟进人，不推诿责任。', 'pro'),
  createAdminTemplate('admin-im-message', 'IM 简洁沟通', '改写为适合企业微信或钉钉的分点消息，结尾明确希望对方完成的动作。', 'pro'),
  createAdminTemplate('admin-onboarding', '入职通知', '生成入职时间、地点、联系人、需携带材料、报到流程和交通提示。', 'pro'),
  createAdminTemplate('admin-interview-invitation', '面试邀请', '输出职位、时间、形式、时长、参会者、准备材料和确认方式。', 'pro'),
  createAdminTemplate('admin-interview-feedback', '面试反馈记录', '根据素材形成事实性评价，分能力匹配、亮点、风险和建议，不加入未提供信息。', 'pro'),
  createAdminTemplate('admin-training-notice', '培训通知', '写清培训目标、对象、时间、地点、课程安排、签到要求和课前准备。', 'pro'),
  createAdminTemplate('admin-leave-reply', '请假调休回复', '说明审批结果、日期、交接要求和系统操作，语气规范且有人情味。', 'pro'),
  createAdminTemplate('admin-supplies-request', '办公物资申请', '整理为申请原因、物资明细、数量、预算或优先级、使用人和期望到位日期。', 'pro'),
  createAdminTemplate('admin-approval-request', '请示稿', '按请示事项、事实依据、方案或预算、请示意见组织，并保留待审批项。', 'pro'),
  createAdminTemplate('admin-work-letter', '工作函', '形成标题、主送单位、事项说明、需配合内容、时限、联系人和落款。', 'pro'),
  createAdminTemplate('admin-circular', '通报', '客观说明事件、影响、处理决定、整改要求与时限，避免情绪化或定性过度。', 'pro'),
  createAdminTemplate('admin-rectification', '整改通知', '输出发现问题、整改标准、责任人、截止时间、复查方式和未完成后果。', 'pro'),
  createAdminTemplate('admin-sop', '流程说明', '转为 SOP：适用范围、前置条件、步骤、责任角色、时限和常见异常。', 'pro'),
  createAdminTemplate('admin-compliance', '合规正式化', '删除口语和模糊措辞，保留事实，标注需要法务或主管确认的高风险表述。', 'pro'),
];
