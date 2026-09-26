// Публичные вебхуки от внешних систем. БЕЗ requireAuth — авторизация
// через shared-secret в заголовке X-Webhook-Secret.
import { Router } from 'express';
import { query, queryOne } from '../db.js';
import { recordingPathForCall } from '../recordingName.js';

const router = Router();

const JIBRI_WEBHOOK_SECRET = process.env.JIBRI_WEBHOOK_SECRET || '';

function checkSecret(req) {
  if (!JIBRI_WEBHOOK_SECRET) return false;
  const got = req.get('X-Webhook-Secret') || '';
  return got === JIBRI_WEBHOOK_SECRET;
}

// finalize.sh спрашивает читаемое имя файла перед тем, как положить mp4
// в /var/recordings. Query: roomName, durationSec (начало записи = сейчас −
// длительность). Ответ: { segments: ['Курс', 'Группа', 'День 01 — ….mp4'] }.
// Звонок не найден — 404, finalize тогда кладёт файл по имени комнаты.
router.get('/jibri/recording-name', async (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: 'unauthorized' });

  const roomName = String(req.query.roomName || '');
  if (!roomName) return res.status(400).json({ error: 'roomName_required' });
  const durationSec = Math.max(0, parseInt(req.query.durationSec) || 0);

  const call = await queryOne(
    'SELECT id FROM activity_calls WHERE LOWER(room_name) = LOWER($1) ORDER BY created_at DESC LIMIT 1',
    [roomName]
  );
  if (!call) return res.status(404).json({ error: 'call_not_found', roomName });

  const segments = await recordingPathForCall(call.id, new Date(Date.now() - durationSec * 1000));
  if (!segments) return res.status(404).json({ error: 'call_not_found', roomName });
  res.json({ segments });
});

// Jibri finalize.sh вызывает этот эндпоинт когда запись готова и залита
// в локальное хранилище на recorder-сервере (nginx стрим оттуда).
// Body: { roomName, url, durationSec }
router.post('/jibri/recording-finished', async (req, res) => {
  if (!checkSecret(req)) return res.status(401).json({ error: 'unauthorized' });

  const { roomName, url, durationSec } = req.body || {};
  if (!roomName || !url) return res.status(400).json({ error: 'roomName_and_url_required' });

  // Lookup case-insensitive: Jitsi/Jibri иногда лоуэркейсит room name.
  const call = await queryOne(
    'SELECT id FROM activity_calls WHERE LOWER(room_name) = LOWER($1) ORDER BY created_at DESC LIMIT 1',
    [roomName]
  );
  if (!call) return res.status(404).json({ error: 'call_not_found', roomName });

  await query(
    `UPDATE activity_calls
        SET recording_url = $1,
            recording_duration_sec = $2,
            recording_finished_at = NOW(),
            status = 'completed'
      WHERE id = $3`,
    [url, durationSec || null, call.id]
  );
  res.json({ ok: true, callId: call.id });
});

export default router;
