import { randomUUID } from 'node:crypto';
import { readTeamFiles, writeTeamFiles, withTeamTransaction } from './team-store.js';
import { readHistory, undoCorrection } from './match-history.js';
import { weeklyReport } from '../js/progress-model.js';
import { normalisePayload } from '../api/sync.js';
const WEEKLY = 'eclipse_weekly.json';
export function isProgressRequest(req) {
  return req.method === 'GET' && ['history', 'weekly'].includes(req.query?.feature)
    || req.method === 'PATCH' && ['undo_match', 'publish_weekly', 'unpublish_weekly'].includes(req.body?.action);
}
export async function progressRequest(req, res, identity) {
  const adminOnly = req.method !== 'GET' || req.query?.feature === 'history';
  if (adminOnly && identity.role !== 'admin') return res.status(403).json({ error: 'Faqat Captain uchun.' });
  const execute = async () => {
    const files = await readTeamFiles(), data = JSON.parse(files['eclipse_data.json'].content);
    if (req.query?.feature === 'history') return { ...readHistory(files), revision: data.revision };
    const reports = files[WEEKLY] ? JSON.parse(files[WEEKLY].content).reports : [];
    if (req.method === 'GET') return { reports };
    if (Buffer.byteLength(JSON.stringify(req.body || {})) > 4096) throw Object.assign(new Error('So‘rov juda katta.'), { status: 413 });
    if (req.body.action === 'undo_match') {
      const restored = undoCorrection(data, readHistory(files), req.body.id, req.body.expectedRevision);
      if (restored) await writeTeamFiles({ 'eclipse_data.json': { content: JSON.stringify(restored) } }, { undoOf: req.body.id });
      return { success: true, revision: restored?.revision ?? data.revision };
    }
    if (req.body.expectedRevision !== data.revision) throw Object.assign(new Error('Matchlar yangilangan. Previewni yangilang.'), { status: 409 });
    const report = weeklyReport(normalisePayload(data), req.body.date, req.body.scope);
    const id = `${report.start}_${report.scope}`;
    const remaining = reports.filter(r => r.id !== id);
    if (req.body.action === 'publish_weekly') {
      if (!report.count) throw Object.assign(new Error('Bo‘sh haftani publish qilib bo‘lmaydi.'), { status: 400 });
      if (remaining.length >= 104) throw Object.assign(new Error('104 ta hisobot chegarasi. Avval eski hisobotni unpublish qiling.'), { status: 409 });
      remaining.push({ ...report, id, publishedAt: new Date().toISOString(), publicationId: randomUUID() });
    }
    await writeTeamFiles({ [WEEKLY]: { content: JSON.stringify({ reports: remaining }) } });
    return { success: true, reports: remaining };
  };
  try { return res.status(200).json(req.method === 'GET' ? await execute() : await withTeamTransaction(execute)); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message, code: error.code }); }
}
