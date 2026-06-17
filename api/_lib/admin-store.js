const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sendJson } = require('./http');

const DEFAULT_REPO = {
  owner: 'thuanhgmakeatradingbot',
  repo: 'web-b-i-t-p',
  branch: 'main'
};

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

function adminSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.EXAM_TOKEN_SECRET || '';
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signAdminPayload(payload) {
  const secret = adminSecret();
  if (!secret) throw new Error('Missing ADMIN_SESSION_SECRET on server.');
  const body = base64urlJson(payload);
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyAdminToken(token) {
  try {
    const secret = adminSecret();
    if (!secret) throw new Error('Missing ADMIN_SESSION_SECRET on server.');
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;

    const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest('base64url');
    const a = Buffer.from(parts[1]);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (payload.role !== 'admin') return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (error) {
    if (/Missing ADMIN_SESSION_SECRET/.test(error.message)) throw error;
    return null;
  }
}

function createAdminToken() {
  const now = Date.now();
  const exp = now + 12 * 60 * 60 * 1000;
  const token = signAdminPayload({
    role: 'admin',
    iat: now,
    exp,
    nonce: crypto.randomBytes(12).toString('base64url')
  });
  return { token, expiresAt: exp };
}

function getBearerToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const match = String(auth).match(/^Bearer\s+(.+)$/i);
  if (match) return match[1];
  return req.headers['x-admin-token'] || req.headers['X-Admin-Token'] || '';
}

function requireAdmin(req, res) {
  const payload = verifyAdminToken(getBearerToken(req));
  if (!payload) {
    sendJson(res, 401, { ok: false, error: 'Phien admin khong hop le hoac da het han.' });
    return false;
  }
  req.admin = payload;
  return true;
}

function repoConfig() {
  return {
    owner: process.env.GITHUB_OWNER || DEFAULT_REPO.owner,
    repo: process.env.GITHUB_REPO || DEFAULT_REPO.repo,
    branch: process.env.GITHUB_BRANCH || DEFAULT_REPO.branch,
    token: process.env.GITHUB_TOKEN || ''
  };
}

function githubPath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

async function getGithubSha(filePath, cfg) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${githubPath(filePath)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read failed ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.sha || null;
}

async function putGithubFile(filePath, content, message, cfg) {
  const sha = await getGithubSha(filePath, cfg);
  const body = {
    message,
    branch: cfg.branch,
    content: Buffer.from(content, 'utf8').toString('base64')
  };
  if (sha) body.sha = sha;

  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${githubPath(filePath)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`GitHub write failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function saveTextFile(filePath, content, message) {
  const cfg = repoConfig();
  if (cfg.token) {
    await putGithubFile(filePath, content, message, cfg);
    return { mode: 'github', path: filePath };
  }

  const target = path.join(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return { mode: 'local', path: target };
}

function publicExamList(examList) {
  const out = {};
  for (const subject of Object.keys(examList || {})) {
    out[subject] = (examList[subject] || []).map(exam => {
      const { items, answer, answers, correctAnswers, explanations, ...meta } = exam;
      return meta;
    });
  }
  return out;
}

function buildPublicExamListText(examList) {
  const header =
`/* ============================================================
   DANH SACH DE THI - BAN PUBLIC CHI CHUA METADATA
   ------------------------------------------------------------
   Noi dung cau hoi va dap an da duoc chuyen sang API server.
   Trinh duyet chi dung file nay de hien thi danh sach de.
   ============================================================ */

window.EXAM_LIST = `;
  return header + JSON.stringify(publicExamList(examList), null, 2) + ';\n';
}

module.exports = {
  buildPublicExamListText,
  createAdminToken,
  requireAdmin,
  saveTextFile,
  verifyAdminToken
};
