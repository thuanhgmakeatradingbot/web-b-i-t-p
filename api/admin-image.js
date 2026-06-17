const fs = require('fs');
const path = require('path');
const { getQuestionBank } = require('./_lib/bank-store');
const { getExamList } = require('./_lib/exam-list-store');
const { requireAdmin } = require('./_lib/admin-store');
const { allowMethods, readJson, sendJson } = require('./_lib/http');

const DEFAULT_REPO = {
  owner: 'thuanhgmakeatradingbot',
  repo: 'web-b-i-t-p',
  branch: 'main'
};
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

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

async function githubContents(filePath, cfg) {
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
  return res.json();
}

async function putGithubBase64(filePath, base64, message, cfg) {
  const existing = await githubContents(filePath, cfg);
  const body = {
    message,
    branch: cfg.branch,
    content: base64
  };
  if (existing && existing.sha) body.sha = existing.sha;

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
}

async function deleteGithubFile(item, cfg) {
  const current = item.sha ? item : await githubContents(item.path, cfg);
  if (!current || !current.sha) return false;

  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${githubPath(item.path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: JSON.stringify({
      message: `Don anh khong dung: ${item.path}`,
      branch: cfg.branch,
      sha: current.sha
    })
  });
  if (!res.ok) throw new Error(`GitHub delete failed ${res.status}: ${await res.text()}`);
  return true;
}

function safeImagePath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/');
  if (!/^images\/[A-Za-z0-9._-]+$/.test(normalized)) throw new Error('Invalid image path.');
  return normalized;
}

function imageReferences(extraRefText) {
  return [
    String(extraRefText || ''),
    JSON.stringify(getQuestionBank()),
    JSON.stringify(getExamList())
  ].join('\n');
}

async function listImages() {
  const cfg = repoConfig();
  if (cfg.token) {
    const data = await githubContents('images', cfg);
    return (Array.isArray(data) ? data : [])
      .filter(item => item.type === 'file')
      .map(item => ({ name: item.name, path: item.path, sha: item.sha, size: item.size || 0 }));
  }

  const dir = path.join(process.cwd(), 'images');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => fs.statSync(path.join(dir, name)).isFile())
    .map(name => {
      const full = path.join(dir, name);
      return { name, path: `images/${name}`, size: fs.statSync(full).size };
    });
}

async function orphanImages(extraRefText) {
  const refs = imageReferences(extraRefText);
  return (await listImages()).filter(item => refs.indexOf(item.name) === -1);
}

async function uploadImage(body) {
  const ext = String(body.ext || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ALLOWED_EXT.has(ext)) throw new Error('Unsupported image type.');

  const base64 = String(body.base64 || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Image is empty or too large.');

  const filePath = `images/img-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext === 'jpeg' ? 'jpg' : ext}`;
  const cfg = repoConfig();
  if (cfg.token) {
    await putGithubBase64(filePath, bytes.toString('base64'), `Them anh cau hoi: ${filePath}`, cfg);
  } else {
    const target = path.join(process.cwd(), filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  return { path: filePath };
}

async function deleteImages(items) {
  const cfg = repoConfig();
  let deleted = 0;
  for (const raw of items || []) {
    const item = { ...raw, path: safeImagePath(raw.path) };
    if (cfg.token) {
      if (await deleteGithubFile(item, cfg)) deleted++;
    } else {
      const target = path.join(process.cwd(), item.path);
      const rel = path.relative(path.join(process.cwd(), 'images'), target);
      if (!rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(target)) {
        fs.unlinkSync(target);
        deleted++;
      }
    }
  }
  return deleted;
}

module.exports = async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const body = await readJson(req, { maxBytes: 8 * 1024 * 1024 });
    if (body.action === 'upload') {
      return sendJson(res, 200, { ok: true, ...(await uploadImage(body)) });
    }
    if (body.action === 'orphans') {
      return sendJson(res, 200, { ok: true, items: await orphanImages(body.extraRefText) });
    }
    if (body.action === 'delete') {
      return sendJson(res, 200, { ok: true, deleted: await deleteImages(body.items) });
    }
    sendJson(res, 400, { ok: false, error: 'Unknown image action.' });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
  }
};
