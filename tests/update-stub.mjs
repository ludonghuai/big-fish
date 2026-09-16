/**
 * 开发期假源桩（设计档 docs/design/AUTO-UPDATE.md §3.2 / §3.3）——本地 http 服务。
 *   /latest.json            假 App 清单（version 0.9.9 + note + 各平台 sha256）
 *   /installer?tamper=1     安装包字节流（默认正确；tamper=1 篡改，供 AC4）
 *   /registry/npmmirror?fail=1  Harness 元数据（默认正常；fail=1 时 404，供 TC-24 源回退）
 *   /registry/npmjs         Harness 兜底元数据（正常）
 * 打包版手测：BIGFISH_UPDATE_URL / BIGFISH_DSH_REGISTRY_URL / BIGFISH_DSH_REGISTRY_FALLBACK_URL 指向本服务。
 * 用法：node tests/update-stub.mjs [port]  （默认 127.0.0.1:8931）
 */
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.argv[2]) || 8931;
const HOST = '127.0.0.1';

const INSTALLER = Buffer.from('BIGFISH-FAKE-INSTALLER-0.9.9-' + 'x'.repeat(4096));
const TAMPERED = Buffer.from('BIGFISH-TAMPERED-INSTALLER-' + 'y'.repeat(4096));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const REGISTRY_META = {
  'dist-tags': { latest: '0.1.5-rc.1', next: '0.1.5-rc.2' },
  versions: {
    '0.1.5-rc.1': {
      name: '@deepseek-ai/dsh',
      version: '0.1.5-rc.1',
      dist: {
        tarball: `http://${HOST}:${PORT}/tarball/dsh-0.1.5-rc.1.tgz`,
        integrity: 'sha512-stub-integrity',
      },
    },
  },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/latest.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      version: '0.9.9',
      note: '假清单桩：验证 AC1-AC4 的发现/下载/校验流程',
      urls: {
        win32: `http://${HOST}:${PORT}/installer`,
        darwin: `http://${HOST}:${PORT}/installer`,
        linux: `http://${HOST}:${PORT}/installer`,
      },
      sha256: { win32: sha256(INSTALLER), darwin: sha256(INSTALLER), linux: sha256(INSTALLER) },
    }));
    return;
  }
  if (url.pathname === '/installer') {
    const body = url.searchParams.get('tamper') === '1' ? TAMPERED : INSTALLER;
    if (url.searchParams.get('slow') === '1') {
      // 慢速流（每 100ms 一块，供取消/超时路径测试）
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.length });
      let i = 0;
      const timer = setInterval(() => {
        if (res.writableEnded || res.destroyed) { clearInterval(timer); return; }
        const chunk = body.subarray(i, i + 256);
        if (chunk.length === 0) { clearInterval(timer); res.end(); return; }
        i += chunk.length;
        res.write(chunk);
      }, 100);
      return;
    }
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.length });
    res.end(body);
    return;
  }
  if (url.pathname === '/registry/npmmirror') {
    if (url.searchParams.get('fail') === '1') { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(REGISTRY_META));
    return;
  }
  if (url.pathname === '/registry/npmjs') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(REGISTRY_META));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, HOST, () => {
  console.log(`update-stub listening on http://${HOST}:${PORT}`);
  console.log('  /latest.json             假 App 清单（version 0.9.9 + sha256）');
  console.log('  /installer?tamper=1      篡改包（AC4：sha256 不匹配拒装）');
  console.log('  /installer?slow=1       慢速流（取消/超时路径测试）');
  console.log('  /registry/npmmirror?fail=1  404（TC-24：npmmirror 失败 → npmjs 兜底）');
  console.log('  /registry/npmjs          兜底元数据（正常）');
});
