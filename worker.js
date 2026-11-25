/* ═══════════════════════════════════════════════════════════════
   GOD EYE · worker.js — серверный CORS-прокси для live-проверок
   Развёртывается на Cloudflare Workers (бесплатно, 100k запросов/день).
   Браузер шлёт запрос вида:
     https://<ваш-worker>.workers.dev/?url=<закодированный-URL>
   Worker ходит на целевой сайт с сервера (без CORS-ограничений),
   добавляет Access-Control-Allow-Origin: * и возвращает ответ.

   ⚠️ ЧЕСТНО ПРО ОГРАНИЧЕНИЯ:
   - Открывает сайты, которые НЕ блокируют серверный трафик
     (Telegram, Mastodon, PeerTube, большинство мелких API…).
   - Instagram / TikTok / Facebook / VK активно блокируют
     датацентровые IP (включая Cloudflare) — их этот прокси
     гарантированно не пройдёт. Для них нужны официальные API.

   ДЕПЛОЙ (2 минуты):
     1) cloudflare.com → Workers & Pages → Create → Create Worker
     2) Вставить этот файл → Deploy
     3) Скопировать URL вида https://имя.ваше.workers.dev
     4) Вписать URL в index.html (настройка GE.settings.proxy)
   ═══════════════════════════════════════════════════════════════ */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const ALLOWED_PROTO = new Set(['http:', 'https:']);

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const u = new URL(request.url);

    // /health — проверка, что воркер жив
    if (u.pathname === '/health') {
      return json({ ok: true, ts: Date.now() }, 200);
    }

    const target = u.searchParams.get('url');
    if (!target) return json({ error: 'missing ?url= param' }, 400);

    let parsed;
    try { parsed = new URL(target); } catch { return json({ error: 'invalid url' }, 400); }
    if (!ALLOWED_PROTO.has(parsed.protocol)) return json({ error: 'forbidden protocol' }, 400);

    try {
      const resp = await fetch(target, {
        redirect: 'follow',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/json,application/xhtml+xml,*/*',
          'Accept-Language': 'ru,en;q=0.8',
        },
      });

      const headers = new Headers(resp.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('X-Proxied-Status', String(resp.status));
      headers.set('X-Proxied-Url', target);
      headers.delete('content-security-policy');
      headers.delete('x-frame-options');

      return new Response(resp.body, {
        status: resp.status,
        statusText: resp.statusText,
        headers,
      });
    } catch (e) {
      return json({ error: 'upstream failed', detail: String(e) }, 502);
    }
  },
};
