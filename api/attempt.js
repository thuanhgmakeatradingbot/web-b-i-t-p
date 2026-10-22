const { readAttemptToken } = require('./_lib/exam-core');
const { callScript, createSessionToken, examKeyOf, readSessionToken, trackingEnabled } = require('./_lib/attempt-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

// POST {action:'start', attemptToken, student:{name,class}}
//   -> giờ bắt đầu do máy chủ ghi (tiếp tục lượt cũ nếu cùng học sinh + đề chưa nộp)
// POST {action:'exit', sessionToken} -> ghi thêm 1 lần thoát fullscreen
module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const body = await readJson(req, { maxBytes: 64 * 1024 });

    if (body.action === 'start') {
      const payload = readAttemptToken(body.attemptToken);
      if (!(await trackingEnabled())) return sendJson(res, 200, { ok: true, tracked: false });

      const student = body.student && typeof body.student === 'object' ? body.student : {};
      const text = v => String(v == null ? '' : v).trim().slice(0, 100);
      const examKey = examKeyOf(payload);
      const timeMinutes = parseInt(payload.timeMinutes, 10) || 45;
      const data = await callScript('startAttempt', {
        examKey,
        exam: text(payload.title),
        name: text(student.name),
        class: text(student.class),
        timeMinutes
      });
      const startedAt = Number(data.startedAt) || Date.now();
      return sendJson(res, 200, {
        ok: true,
        tracked: true,
        resumed: !!data.resumed,
        sessionToken: createSessionToken({ attemptId: data.attemptId, examKey, startedAt, timeMinutes }),
        startedAt,
        serverNow: Date.now(),
        timeMinutes,
        exits: Number(data.exits) || 0
      });
    }

    if (body.action === 'exit') {
      const session = readSessionToken(body.sessionToken);
      const data = await callScript('attemptExit', { attemptId: session.attemptId });
      return sendJson(res, 200, { ok: true, exits: Number(data.exits) || 0 });
    }

    sendJson(res, 400, { ok: false, error: 'Unknown action.' });
  } catch (error) {
    sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
  }
};
