const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';
const blockedTopLevel = new Set(['KHTN', 'Toan-10', 'Sinh-10']);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendStatic(req, res) {
  const url = new URL(req.url, `http://${host}:${port}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(root, pathname));
  const relPath = path.relative(root, filePath);
  if (isBlockedStaticPath(relPath)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', contentTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  });
}

function isBlockedStaticPath(relPath) {
  if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) return true;

  const parts = relPath.split(path.sep);
  if (parts.some(part => part.startsWith('.'))) return true;
  if (blockedTopLevel.has(parts[0])) return true;
  if (parts[0] === 'api') return true;

  const lower = relPath.toLowerCase();
  if (lower.endsWith('.log') || lower.endsWith('.docx') || lower.endsWith('.bat')) return true;
  if (lower === 'dev-server.js') return true;
  return false;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${host}:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice('/api/'.length).replace(/\.js$/, '');
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
      return;
    }
    try {
      const handler = require(path.join(root, 'api', `${name}.js`));
      req.url = url.pathname + url.search;
      handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: error.message }));
    }
    return;
  }

  sendStatic(req, res);
});

function getLanUrls() {
  const urls = [];
  const interfaces = os.networkInterfaces();
  for (const values of Object.values(interfaces)) {
    for (const item of values || []) {
      if (item.family === 'IPv4' && !item.internal) {
        urls.push(`http://${item.address}:${port}/`);
      }
    }
  }
  return urls;
}

server.listen(port, host, () => {
  console.log(`Local: http://127.0.0.1:${port}/`);
  const lanUrls = getLanUrls();
  if (lanUrls.length) {
    console.log('LAN:');
    lanUrls.forEach(url => console.log(`  ${url}`));
  }
});
