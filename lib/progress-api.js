import { randomUUID } from 'node:crypto';
import { readTeamFiles, writeTeamFiles, withTeamTransaction } from './team-store.js';
import { readHistory, undoCorrection } from './match-history.js';
import { weeklyReport } from '../js/progress-model.js';
import { normalisePayload } from '../api/sync.js';
import { focusBaseline, focusSignals, adjacentWeek, weekRangeForFocus } from './weekly-focus.js';
import { readQuality, summarizeQuality } from './scan-quality.js';
const WEEKLY = 'eclipse_weekly.json';
export function isProgressRequest(req) {
  return req.method === 'GET' && ['history', 'weekly', 'scan_quality'].includes(req.query?.feature)
    || req.method === 'PATCH' && ['undo_match', 'publish_weekly', 'unpublish_weekly', 'save_weekly_focus'].includes(req.body?.action);
}
export async function progressRequest(req, res, identity) {
  const adminOnly = req.method !== 'GET' || ['history', 'scan_quality'].includes(req.query?.feature);
  if (adminOnly && identity.role !== 'admin') return res.status(403).json({ error: 'Faqat Captain uchun.' });
  const execute = async () => {
    const files = await readTeamFiles(), data = JSON.parse(files['eclipse_data.json'].content);
    if (req.query?.feature === 'history') return { ...readHistory(files), revision: data.revision };
    if (req.query?.feature === 'scan_quality') return summarizeQuality(readQuality(files));
    const weekly = files[WEEKLY] ? JSON.parse(files[WEEKLY].content) : { reports: [] };
    const { reports, focuses = [], focusRevision = 0 } = weekly;
    if (req.method === 'GET') return { reports, focuses, focusRevision };
    if (Buffer.byteLength(JSON.stringify(req.body || {})) > 4096) throw Object.assign(new Error('So‘rov juda katta.'), { status: 413 });
    if (req.body.action === 'undo_match') {
      const restored = undoCorrection(data, readHistory(files), req.body.id, req.body.expectedRevision);
      if (restored) await writeTeamFiles({ 'eclipse_data.json': { content: JSON.stringify(restored) } }, { undoOf: req.body.id });
      return { success: true, revision: restored?.revision ?? data.revision };
    }
    if (req.body.expectedRevision !== data.revision) throw Object.assign(new Error('Matchlar yangilangan. Previewni yangilang.'), { status: 409 });
    if (req.body.action === 'save_weekly_focus') {
      if (req.body.expectedFocusRevision !== focusRevision) throw Object.assign(new Error('Fokus boshqa sessiyada yangilangan. Yangilash tugmasini bosing; qoralamangiz saqlanadi.'), { status: 409 });
      const task = typeof req.body.task === 'string' ? req.body.task.trim() : '';
      if (!task || task.length > 280) throw new Error('Captain vazifasi 1–280 belgidan iborat bo‘lsin.');
      const range = weekRangeForFocus(req.body.date), scope = req.body.scope;
      const id = `${range.start}_${scope}`, existing = focuses.find(f => f.id === id);
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tashkent' });
      if (range.end < today || range.start > today) throw new Error('Fokusni faqat joriy hafta uchun saqlash mumkin.');
      const normalized = normalisePayload(data);
      const baseline = existing?.metric === req.body.metric ? existing.baseline : focusBaseline(normalized, adjacentWeek(range.start, -1), scope, req.body.metric);
      const next = focuses.filter(f => f.id !== id);
      if (next.length >= 104) throw new Error('104 ta fokus chegarasi. Avval backup va arxivni ko‘rib chiqing.');
      next.push({ id, ...range, scope, task, metric: req.body.metric, baseline,
        signals: existing?.signals || focusSignals(normalized, adjacentWeek(range.start, -1), scope), savedAt: new Date().toISOString() });
      await writeTeamFiles({ [WEEKLY]: { content: JSON.stringify({ ...weekly, focuses: next, focusRevision: focusRevision + 1 }) } });
      return { success: true, focuses: next, focusRevision: focusRevision + 1 };
    }
    const report = weeklyReport(normalisePayload(data), req.body.date, req.body.scope);
    const id = `${report.start}_${report.scope}`;
    const remaining = reports.filter(r => r.id !== id);
    if (req.body.action === 'publish_weekly') {
      if (!report.count) throw Object.assign(new Error('Bo‘sh haftani publish qilib bo‘lmaydi.'), { status: 400 });
      if (remaining.length >= 104) throw Object.assign(new Error('104 ta hisobot chegarasi. Avval eski hisobotni unpublish qiling.'), { status: 409 });
      remaining.push({ ...report, id, publishedAt: new Date().toISOString(), publicationId: randomUUID() });
    }
    await writeTeamFiles({ [WEEKLY]: { content: JSON.stringify({ ...weekly, reports: remaining }) } });
    return { success: true, reports: remaining };
  };
  try { return res.status(200).json(req.method === 'GET' ? await execute() : await withTeamTransaction(execute)); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message, code: error.code }); }
}
