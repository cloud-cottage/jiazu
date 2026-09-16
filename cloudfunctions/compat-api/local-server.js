#!/usr/bin/env node
/**
 * 兼容层本地开发服务器（P1 只读验证）
 *
 * 用法:
 *   COMPAT_SOURCE=local node cloudfunctions/compat-api/local-server.js [port]
 *   （local 模式读 migrate-output/ + config/tree-meta.json，无需 CloudBase 凭据）
 *   COMPAT_SOURCE=cloud CB_ENV=<env> CB_KEY=<key> node cloudfunctions/compat-api/local-server.js [port]
 *
 * 验证: curl -H 'X-Tree-Id: ji_23395_01' http://localhost:3100/people/
 */
import http from 'http';
import { handleRequest } from './index.js';

const PORT = parseInt(process.argv[2] || '3100', 10);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  // 读取 body（写接口用）
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 2e6) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '请求体过大' }));
      return;
    }
  }
  const event = {
    path: url.pathname,
    httpMethod: req.method,
    queryStringParameters: Object.fromEntries(url.searchParams),
    headers: req.headers,
    body,
  };
  try {
    const r = await handleRequest(event);
    res.writeHead(r.statusCode, r.headers);
    res.end(r.body);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e?.message || 'internal error' }));
  }
});

server.listen(PORT, () => {
  console.log(`兼容层 API 本地服务: http://localhost:${PORT} (source=${process.env.COMPAT_SOURCE || 'cloud'})`);
  console.log('示例: curl -H "X-Tree-Id: ji_23395_01" http://localhost:' + PORT + '/people/');
});
