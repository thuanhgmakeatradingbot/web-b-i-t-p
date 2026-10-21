const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readBlobFile } = require('./admin-store');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

loadLocalEnv();

function getSecret(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function decryptJsonFile(filePath, secretName) {
  let payload;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    payload = JSON.parse(content);
  } catch (e) {
    // File không tồn tại → return empty (bank sẽ được init trống)
    return [];
  }

  if (payload.alg !== 'aes-256-gcm') {
    console.warn('Bank file has unsupported format, starting with empty bank');
    return [];
  }

  try {
    const key = crypto.createHash('sha256').update(getSecret(secretName)).digest();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]).toString('utf8');

    return JSON.parse(plain);
  } catch (e) {
    // Secret khác → không giải mã được. Return empty để bắt đầu lại
    console.warn('Decrypt failed with current secret, starting with empty bank:', e.message);
    return [];
  }
}

async function decryptJsonFileAsync(filePath, secretName) {
  let content;

  // Thử Blob trước (Vercel)
  if (readBlobFile) {
    const blob = await readBlobFile(filePath);
    if (blob) content = blob;
  }

  // Fallback local
  if (!content) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return [];
    }
  }

  let payload;
  try {
    payload = JSON.parse(content);
  } catch (e) {
    return [];
  }

  if (payload.alg !== 'aes-256-gcm') return [];

  try {
    const key = crypto.createHash('sha256').update(getSecret(secretName)).digest();
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));

    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final()
    ]).toString('utf8');

    return JSON.parse(plain);
  } catch (e) {
    console.warn('Async decrypt failed:', e.message);
    return [];
  }
}

function encryptJsonPayload(value, secretName) {
  const key = crypto.createHash('sha256').update(getSecret(secretName)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), 'utf8')),
    cipher.final()
  ]);

  return {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: encrypted.toString('base64')
  };
}

function getTokenSecret() {
  return process.env.EXAM_TOKEN_SECRET || getSecret('QUESTION_BANK_SECRET');
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload) {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

function verifyPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Invalid attempt token');

  const [body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getTokenSecret())
    .update(body)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('Invalid attempt token');
  }

  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

module.exports = { decryptJsonFile, decryptJsonFileAsync, encryptJsonPayload, signPayload, verifyPayload };
