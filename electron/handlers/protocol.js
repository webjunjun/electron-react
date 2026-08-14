import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// 自定义应用协议名。用它替代生产环境的 file://，让页面运行在
// 安全上下文（secure context）中，行为与普通网站一致：
// - 渲染进程打包资源：app://bundle/...  → out/renderer/...
// - 本地任意文件：    app://local/<绝对路径> → 供 PixiJS 等直接加载本地图片
export const APP_SCHEME = 'app';

// 必须在 app ready **之前** 调用：把 app 协议声明为特权协议。
// standard + secure 让它成为安全上下文；supportFetchAPI + stream 让 fetch/Assets 可用。
export const registerAppProtocolSchemes = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
};

// 必须在 app ready **之后** 调用：注册 app 协议的请求处理器。
// @param rendererRoot 渲染进程打包产物目录（out/renderer）
export const registerAppProtocolHandler = (rendererRoot) => {
  protocol.handle(APP_SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url);

    if (host === 'bundle') {
      // 打包资源：根路径映射到 index.html
      const rel = decodeURIComponent(pathname);
      const filePath = path.join(rendererRoot, rel === '/' ? 'index.html' : rel);
      return net.fetch(pathToFileURL(filePath).toString());
    }

    if (host === 'local') {
      // 本地文件：pathname 形如 /D:/imgs/a.png，去掉前导斜杠还原绝对路径
      const filePath = decodeURIComponent(pathname).replace(/^\//, '');
      const res = await net.fetch(pathToFileURL(filePath).toString());
      // 开发环境页面运行在 http://localhost:3000，跨源加载 app://local 资源
      // （PixiJS 通过 fetch 加载纹理）需要放行 CORS
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      return new Response(res.body, { status: res.status, headers });
    }

    return new Response('Not Found', { status: 404 });
  });
};
