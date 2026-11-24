/* ═══════════════════════════════════════════════════════════════
   GOD EYE · catalog.js — поисковые движки по типам целей и каталог инструментов
   Только открытые, общедоступные сервисы. Никаких утечек, взломов и слежки.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE;
const E = encodeURIComponent;
const LL = q => { const m = String(q).split(/[,;\s]+/).filter(Boolean); return [m[0], m[1]]; };
const G = q => 'https://www.google.com/search?q=' + E(q);

/* Типы целей */
GE.QTYPES = {
  auto:     { l: 'Авто', ex: '' },
  text:     { l: 'Текст / фраза', ex: '«Северный Маяк» пресс-релиз' },
  username: { l: 'Никнейм', ex: '@torvalds' },
  domain:   { l: 'Домен', ex: 'example.com' },
  ip:       { l: 'IP-адрес', ex: '1.1.1.1' },
  email:    { l: 'Email', ex: 'press@example.com' },
  url:      { l: 'Ссылка', ex: 'https://example.com/news?utm_source=x' },
  image:    { l: 'Фото по URL', ex: 'https://upload.wikimedia.org/…/photo.jpg' },
  coords:   { l: 'Координаты', ex: '59.9390, 30.3158' },
  place:    { l: 'Место / адрес', ex: 'Дворцовая площадь, Санкт-Петербург' },
  org:      { l: 'Организация', ex: 'Wikimedia Foundation' },
  hash:     { l: 'Хеш файла', ex: 'sha256 / sha1 / md5' }
};

/** Автоопределение типа цели */
GE.detectType = raw => {
  const q = String(raw || '').trim();
  if (!q) return 'text';
  if (/^https?:\/\/\S+\.(jpe?g|png|webp|gif|bmp|avif|heic)(\?\S*)?$/i.test(q)) return 'image';
  if (/^https?:\/\//i.test(q)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[a-zа-я]{2,}$/i.test(q)) return 'email';
  if (/^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(q)) return 'ip';
  if (/^[0-9a-f:]+$/i.test(q) && q.includes(':') && q.split(':').length > 3) return 'ip';
  if (/^-?\d{1,2}(\.\d+)?\s*[,;\s]\s*-?\d{1,3}(\.\d+)?$/.test(q) && GE.parseCoords(q)) return 'coords';
  if (/\d+°/.test(q) && GE.parseCoords(q)) return 'coords';
  if (/^([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(q)) return 'hash';
  if (/^(?!-)([a-z0-9а-яё-]{1,63}\.)+([a-z]{2,24}|рф|xn--[a-z0-9-]+)$/i.test(q)) return 'domain';
  if (/^@[\w.]{2,40}$/.test(q)) return 'username';
  if (/^[A-Za-z0-9_.-]{3,32}$/.test(q) && /[_\d]|[a-z][A-Z]/.test(q)) return 'username';
  if (/\b(ООО|АО|ПАО|ЗАО|ИП|ГУП|МУП|НКО|LLC|Inc|Ltd|GmbH|S\.A\.|Corp|Foundation|Фонд)\b/i.test(q)) return 'org';
  return 'text';
};
GE.normQuery = (q, type) => {
  q = String(q || '').trim();
  if (type === 'username') return q.replace(/^@/, '');
  if (type === 'domain') return q.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (type === 'coords') { const c = GE.parseCoords(q); return c ? `${c.lat.toFixed(6)},${c.lon.toFixed(6)}` : q; }
  return q;
};

/** Разбор координат: «59.93, 30.31», «59°56'20.4"N 30°18'56.9"E», «N 59 56.34 E 30 18.95» */
GE.parseCoords = s => {
  s = String(s || '').trim().replace(/,(?=\d{3})/g, '.');
  let m = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (m) { const lat = +m[1], lon = +m[2]; if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon }; return null; }
  const parts = s.toUpperCase().match(/(\d{1,3})[°\s]+(\d{1,2})?['′\s]*(\d{1,2}(?:[.,]\d+)?)?["″\s]*([NSEWСЮВЗ])?/g);
  if (!parts || parts.length < 2) return null;
  const conv = p => {
    const x = p.match(/(\d{1,3})[°\s]+(\d{1,2})?['′\s]*(\d{1,2}(?:[.,]\d+)?)?["″\s]*([NSEWСЮВЗ])?/);
    let v = +x[1] + (+(x[2] || 0)) / 60 + (+(String(x[3] || 0).replace(',', '.'))) / 3600;
    if (/[SWЮЗ]/.test(x[4] || '')) v = -v;
    return v;
  };
  const lat = conv(parts[0]), lon = conv(parts[1]);
  if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  return null;
};

/* ─────────── Поисковые движки ───────────
   c — категория, t — типы целей, u — построитель ссылки */
GE.ENGINES = [
  // Веб-поиск
  { n: 'Google', d: 'Основной индекс; поддерживает операторы site:, filetype:, intitle:', c: 'Веб-поиск', t: ['text', 'org', 'place', 'username', 'email', 'domain', 'hash'], u: q => G(/\s/.test(q) && !/["]/.test(q) ? q : `"${q}"`) },
  { n: 'Яндекс', d: 'Сильнее по русскоязычному сегменту и СНГ', c: 'Веб-поиск', t: ['text', 'org', 'place', 'username', 'email', 'domain'], u: q => 'https://yandex.ru/search/?text=' + E(q) },
  { n: 'Bing', d: 'Отдельный индекс — часто находит то, чего нет в Google', c: 'Веб-поиск', t: ['text', 'org', 'place', 'username', 'email', 'domain'], u: q => 'https://www.bing.com/search?q=' + E(`"${q}"`) },
  { n: 'DuckDuckGo', d: 'Приватный поиск без персонализации выдачи', c: 'Веб-поиск', t: ['text', 'org', 'username', 'domain'], u: q => 'https://duckduckgo.com/?q=' + E(q) },
  { n: 'Brave Search', d: 'Независимый индекс', c: 'Веб-поиск', t: ['text', 'org', 'username'], u: q => 'https://search.brave.com/search?q=' + E(q) },
  { n: 'Startpage', d: 'Результаты Google без трекинга', c: 'Веб-поиск', t: ['text', 'org'], u: q => 'https://www.startpage.com/do/search?q=' + E(q) },
  { n: 'Mojeek', d: 'Собственный независимый краулер', c: 'Веб-поиск', t: ['text'], u: q => 'https://www.mojeek.com/search?q=' + E(q) },

  // Новости и справка
  { n: 'Google Новости', d: 'Публикации СМИ по запросу', c: 'Новости и справка', t: ['text', 'org', 'place'], u: q => 'https://news.google.com/search?q=' + E(q) + '&hl=ru' },
  { n: 'Яндекс Новости (поиск)', d: 'Русскоязычные СМИ', c: 'Новости и справка', t: ['text', 'org'], u: q => 'https://yandex.ru/search/?text=' + E(q) + '&lr=225&within=77' },
  { n: 'Википедия RU', d: 'Справочные статьи', c: 'Новости и справка', t: ['text', 'org', 'place'], u: q => 'https://ru.wikipedia.org/w/index.php?search=' + E(q) },
  { n: 'Wikipedia EN', d: 'Англоязычные статьи', c: 'Новости и справка', t: ['text', 'org', 'place'], u: q => 'https://en.wikipedia.org/w/index.php?search=' + E(q) },
  { n: 'Wikidata', d: 'Структурированные факты и идентификаторы', c: 'Новости и справка', t: ['text', 'org', 'place'], u: q => 'https://www.wikidata.org/w/index.php?search=' + E(q) },
  { n: 'Google Scholar', d: 'Научные публикации', c: 'Новости и справка', t: ['text', 'org'], u: q => 'https://scholar.google.com/scholar?q=' + E(q) },
  { n: 'Google Книги', d: 'Упоминания в книгах', c: 'Новости и справка', t: ['text', 'org'], u: q => 'https://www.google.com/search?tbm=bks&q=' + E(q) },

  // Документы
  { n: 'PDF-документы', d: 'Google: только PDF', c: 'Документы', t: ['text', 'org', 'domain'], u: q => G(`"${q}" filetype:pdf`) },
  { n: 'Таблицы XLS/CSV', d: 'Google: публичные таблицы', c: 'Документы', t: ['text', 'org', 'domain'], u: q => G(`"${q}" (filetype:xlsx OR filetype:xls OR filetype:csv)`) },
  { n: 'Презентации', d: 'Google: PPT/PPTX', c: 'Документы', t: ['text', 'org'], u: q => G(`"${q}" (filetype:pptx OR filetype:ppt)`) },
  { n: 'Документы на сайте', d: 'Все документы домена', c: 'Документы', t: ['domain'], u: q => G(`site:${q} (filetype:pdf OR filetype:docx OR filetype:xlsx OR filetype:pptx)`) },
  { n: 'Internet Archive', d: 'Книги, видео, тексты, коллекции', c: 'Документы', t: ['text', 'org'], u: q => 'https://archive.org/search?query=' + E(q) },
  { n: 'Scribd', d: 'Опубликованные документы', c: 'Документы', t: ['text', 'org'], u: q => 'https://www.scribd.com/search?query=' + E(q) },

  // Соцсети и платформы (публичный поиск)
  { n: 'Telegram (через Google)', d: 'Публичные каналы и посты t.me', c: 'Соцсети', t: ['text', 'org', 'username'], u: q => G(`site:t.me "${q}"`) },
  { n: 'VK (через Google)', d: 'Публичные страницы и сообщества', c: 'Соцсети', t: ['text', 'org', 'username'], u: q => G(`site:vk.com "${q}"`) },
  { n: 'X / Twitter', d: 'Поиск публичных постов (может требовать вход)', c: 'Соцсети', t: ['text', 'org', 'username'], u: q => 'https://x.com/search?q=' + E(q) + '&f=live' },
  { n: 'Reddit', d: 'Обсуждения и упоминания', c: 'Соцсети', t: ['text', 'org', 'username', 'domain'], u: q => 'https://www.reddit.com/search/?q=' + E(q) },
  { n: 'YouTube', d: 'Видео и каналы', c: 'Соцсети', t: ['text', 'org', 'place'], u: q => 'https://www.youtube.com/results?search_query=' + E(q) },
  { n: 'TikTok', d: 'Публичные видео', c: 'Соцсети', t: ['text', 'place'], u: q => 'https://www.tiktok.com/search?q=' + E(q) },
  { n: 'Хабр', d: 'Технические публикации', c: 'Соцсети', t: ['text', 'org'], u: q => 'https://habr.com/ru/search/?q=' + E(q) },
  { n: 'LinkedIn (через Google)', d: 'Публичные страницы компаний', c: 'Соцсети', t: ['org'], u: q => G(`site:linkedin.com/company "${q}"`) },

  // Никнеймы — открытые профили
  { n: 'Точный поиск ника', d: 'Google: точное вхождение', c: 'Профили по нику', t: ['username'], u: q => G(`"${q}"`) },
  { n: 'GitHub', d: 'github.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://github.com/' + E(q) },
  { n: 'GitLab', d: 'gitlab.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://gitlab.com/' + E(q) },
  { n: 'Reddit', d: 'reddit.com/user/…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.reddit.com/user/' + E(q) },
  { n: 'X / Twitter', d: 'x.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://x.com/' + E(q) },
  { n: 'Instagram', d: 'instagram.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.instagram.com/' + E(q) + '/' },
  { n: 'Threads', d: 'threads.net/@…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.threads.net/@' + E(q) },
  { n: 'TikTok', d: 'tiktok.com/@…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.tiktok.com/@' + E(q) },
  { n: 'YouTube', d: 'youtube.com/@…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.youtube.com/@' + E(q) },
  { n: 'Telegram', d: 't.me/… — публичный канал или профиль', c: 'Профили по нику', t: ['username'], u: q => 'https://t.me/' + E(q) },
  { n: 'VK', d: 'vk.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://vk.com/' + E(q) },
  { n: 'Twitch', d: 'twitch.tv/…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.twitch.tv/' + E(q) },
  { n: 'Medium', d: 'medium.com/@…', c: 'Профили по нику', t: ['username'], u: q => 'https://medium.com/@' + E(q) },
  { n: 'Хабр', d: 'habr.com/ru/users/…', c: 'Профили по нику', t: ['username'], u: q => 'https://habr.com/ru/users/' + E(q) + '/' },
  { n: 'Pinterest', d: 'pinterest.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.pinterest.com/' + E(q) + '/' },
  { n: 'Steam', d: 'steamcommunity.com/id/…', c: 'Профили по нику', t: ['username'], u: q => 'https://steamcommunity.com/id/' + E(q) },
  { n: 'Keybase', d: 'keybase.io/… — подтверждённые аккаунты', c: 'Профили по нику', t: ['username'], u: q => 'https://keybase.io/' + E(q) },
  { n: 'Docker Hub', d: 'hub.docker.com/u/…', c: 'Профили по нику', t: ['username'], u: q => 'https://hub.docker.com/u/' + E(q) },
  { n: 'npm', d: 'npmjs.com/~…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.npmjs.com/~' + E(q) },
  { n: 'Behance', d: 'behance.net/…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.behance.net/' + E(q) },
  { n: 'SoundCloud', d: 'soundcloud.com/…', c: 'Профили по нику', t: ['username'], u: q => 'https://soundcloud.com/' + E(q) },
  { n: 'Chess.com', d: 'chess.com/member/…', c: 'Профили по нику', t: ['username'], u: q => 'https://www.chess.com/member/' + E(q) },
  { n: 'WhatsMyName', d: 'Агрегатор: проверка ника на сотнях площадок', c: 'Профили по нику', t: ['username'], u: q => 'https://whatsmyname.app/?q=' + E(q) },

  // Домены
  { n: 'ICANN Lookup', d: 'Официальная регистрационная информация (RDAP)', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://lookup.icann.org/en/lookup?name=' + E(q) },
  { n: 'who.is', d: 'WHOIS и DNS-записи', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://who.is/whois/' + E(q) },
  { n: 'DomainTools WHOIS', d: 'WHOIS-профиль домена', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://whois.domaintools.com/' + E(q) },
  { n: 'crt.sh', d: 'Сертификаты TLS и поддомены (Certificate Transparency)', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://crt.sh/?q=' + E('%.' + q) },
  { n: 'SecurityTrails', d: 'История DNS', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://securitytrails.com/domain/' + E(q) + '/dns' },
  { n: 'DNSDumpster', d: 'Карта DNS и хостов', c: 'Домен и инфраструктура', t: ['domain'], u: () => 'https://dnsdumpster.com/' },
  { n: 'MXToolbox', d: 'Почтовые записи и черные списки', c: 'Домен и инфраструктура', t: ['domain', 'email'], u: q => 'https://mxtoolbox.com/SuperTool.aspx?action=mx%3a' + E(q.split('@').pop()) },
  { n: 'BuiltWith', d: 'Технологии сайта, аналитика, CMS', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://builtwith.com/' + E(q) },
  { n: 'Netcraft', d: 'Отчёт о сайте и хостинге', c: 'Домен и инфраструктура', t: ['domain', 'url'], u: q => 'https://sitereport.netcraft.com/?url=' + E(/^https?:/.test(q) ? q : 'https://' + q) },
  { n: 'urlscan.io', d: 'Снимки и сканы страниц домена', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://urlscan.io/domain/' + E(q) },
  { n: 'VirusTotal', d: 'Репутация домена', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://www.virustotal.com/gui/domain/' + E(q) },
  { n: 'Shodan', d: 'Открытые сервисы хостов домена', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://www.shodan.io/domain/' + E(q) },
  { n: 'AlienVault OTX', d: 'Индикаторы угроз по домену', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://otx.alienvault.com/indicator/domain/' + E(q) },
  { n: 'Similarweb', d: 'Оценка трафика', c: 'Домен и инфраструктура', t: ['domain'], u: q => 'https://www.similarweb.com/website/' + E(q) + '/' },
  { n: 'Поддомены в Google', d: 'site:*.домен -www', c: 'Домен и инфраструктура', t: ['domain'], u: q => G(`site:*.${q} -site:www.${q}`) },
  { n: 'Страницы сайта в Google', d: 'Что проиндексировано', c: 'Домен и инфраструктура', t: ['domain'], u: q => G(`site:${q}`) },
  { n: 'Упоминания домена', d: 'Внешние упоминания без самого сайта', c: 'Домен и инфраструктура', t: ['domain'], u: q => G(`"${q}" -site:${q}`) },

  // IP
  { n: 'ipinfo.io', d: 'ASN, провайдер, геолокация сети', c: 'IP-адрес', t: ['ip'], u: q => 'https://ipinfo.io/' + E(q) },
  { n: 'Shodan Host', d: 'Открытые порты и баннеры', c: 'IP-адрес', t: ['ip'], u: q => 'https://www.shodan.io/host/' + E(q) },
  { n: 'Censys', d: 'Сервисы и сертификаты хоста', c: 'IP-адрес', t: ['ip'], u: q => 'https://search.censys.io/hosts/' + E(q) },
  { n: 'AbuseIPDB', d: 'Жалобы на злоупотребления', c: 'IP-адрес', t: ['ip'], u: q => 'https://www.abuseipdb.com/check/' + E(q) },
  { n: 'VirusTotal IP', d: 'Репутация адреса', c: 'IP-адрес', t: ['ip'], u: q => 'https://www.virustotal.com/gui/ip-address/' + E(q) },
  { n: 'GreyNoise', d: 'Фоновое сканирование интернета', c: 'IP-адрес', t: ['ip'], u: q => 'https://viz.greynoise.io/ip/' + E(q) },
  { n: 'Hurricane Electric BGP', d: 'Маршрутизация, префиксы, ASN', c: 'IP-адрес', t: ['ip'], u: q => 'https://bgp.he.net/ip/' + E(q) },
  { n: 'RIPEstat', d: 'Данные регионального регистратора', c: 'IP-адрес', t: ['ip'], u: q => 'https://stat.ripe.net/' + E(q) },
  { n: 'Обратный IP (ViewDNS)', d: 'Какие домены на этом адресе', c: 'IP-адрес', t: ['ip', 'domain'], u: q => 'https://viewdns.info/reverseip/?host=' + E(q) + '&t=1' },

  // Email (только публичное и защитное)
  { n: 'Точный поиск email', d: 'Google: где адрес опубликован', c: 'Email', t: ['email'], u: q => G(`"${q}"`) },
  { n: 'Bing: email', d: 'Публичные упоминания адреса', c: 'Email', t: ['email'], u: q => 'https://www.bing.com/search?q=' + E(`"${q}"`) },
  { n: 'Have I Been Pwned', d: 'Проверка своего адреса на утечки (защитная)', c: 'Email', t: ['email'], u: () => 'https://haveibeenpwned.com/' },
  { n: 'Домен адреса', d: 'Перейти к анализу почтового домена', c: 'Email', t: ['email'], u: q => '#/search?q=' + E(q.split('@').pop()) + '&t=domain' },
  { n: 'Hunter: проверка адреса', d: 'Существует ли ящик (публичная проверка)', c: 'Email', t: ['email'], u: q => 'https://hunter.io/email-verifier/' + E(q) },

  // Ссылки
  { n: 'Wayback Machine', d: 'Архивные копии страницы', c: 'Ссылка и архивы', t: ['url', 'domain'], u: q => 'https://web.archive.org/web/*/' + q },
  { n: 'Сохранить в Wayback', d: 'Создать архивную копию сейчас', c: 'Ссылка и архивы', t: ['url'], u: q => 'https://web.archive.org/save/' + q },
  { n: 'archive.today', d: 'Независимый архив страниц', c: 'Ссылка и архивы', t: ['url', 'domain'], u: q => 'https://archive.ph/' + q },
  { n: 'Ghostarchive', d: 'Архив страниц и видео', c: 'Ссылка и архивы', t: ['url'], u: q => 'https://ghostarchive.org/search?term=' + E(q) },
  { n: 'urlscan.io', d: 'Безопасный скан страницы', c: 'Ссылка и архивы', t: ['url'], u: q => 'https://urlscan.io/search/#' + E('page.url:"' + q + '"') },
  { n: 'VirusTotal URL', d: 'Проверка ссылки', c: 'Ссылка и архивы', t: ['url'], u: q => 'https://www.virustotal.com/gui/search/' + E(q) },
  { n: 'Кто ссылается', d: 'Google: упоминания адреса страницы', c: 'Ссылка и архивы', t: ['url'], u: q => G(`"${q.replace(/^https?:\/\//, '')}"`) },

  // Изображения
  { n: 'Google Lens', d: 'Обратный поиск и распознавание объектов', c: 'Обратный поиск фото', t: ['image'], u: q => 'https://lens.google.com/uploadbyurl?url=' + E(q) },
  { n: 'Яндекс Картинки', d: 'Сильный поиск по местам и похожим фото', c: 'Обратный поиск фото', t: ['image'], u: q => 'https://yandex.ru/images/search?rpt=imageview&url=' + E(q) },
  { n: 'Bing Visual Search', d: 'Похожие изображения', c: 'Обратный поиск фото', t: ['image'], u: q => 'https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:' + E(q) },
  { n: 'TinEye', d: 'Самая ранняя публикация и изменённые копии', c: 'Обратный поиск фото', t: ['image'], u: q => 'https://tineye.com/search?url=' + E(q) },
  { n: 'Архив изображения', d: 'Когда файл впервые появился в Wayback', c: 'Обратный поиск фото', t: ['image'], u: q => 'https://web.archive.org/web/*/' + q },

  // Координаты
  { n: 'Google Карты', d: 'Схема и спутник', c: 'Карты и спутники', t: ['coords'], u: q => 'https://www.google.com/maps/search/?api=1&query=' + E(q) },
  { n: 'Google Street View', d: 'Панорамы улиц', c: 'Карты и спутники', t: ['coords'], u: q => 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + E(q) },
  { n: 'Google Earth', d: '3D-рельеф и исторические снимки', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://earth.google.com/web/@${a},${b},300a,1200d,35y,0h,0t,0r`; } },
  { n: 'Яндекс Карты', d: 'Подробные карты России и СНГ, панорамы', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://yandex.ru/maps/?ll=${b},${a}&z=17&pt=${b},${a}`; } },
  { n: 'OpenStreetMap', d: 'Открытая карта, объекты и теги', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://www.openstreetmap.org/?mlat=${a}&mlon=${b}#map=17/${a}/${b}`; } },
  { n: 'Bing Maps (спутник)', d: 'Альтернативные спутниковые снимки', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://www.bing.com/maps?cp=${a}~${b}&lvl=17&style=a`; } },
  { n: 'Mapillary', d: 'Краудсорсинговые уличные снимки', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://www.mapillary.com/app/?lat=${a}&lng=${b}&z=17`; } },
  { n: 'Wikimapia', d: 'Подписанные пользователями объекты', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://wikimapia.org/#lat=${a}&lon=${b}&z=17`; } },
  { n: 'Sentinel EO Browser', d: 'Свежие спутниковые снимки Sentinel', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://apps.sentinel-hub.com/eo-browser/?zoom=14&lat=${a}&lng=${b}`; } },
  { n: 'SunCalc', d: 'Положение солнца и тени — время съёмки', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://www.suncalc.org/#/${a},${b},17/`; } },
  { n: 'Википедия рядом', d: 'Статьи об объектах поблизости', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://ru.wikipedia.org/wiki/Special:Nearby#/coord/${a},${b}`; } },
  { n: 'Overpass Turbo', d: 'Запросы к данным OSM вокруг точки', c: 'Карты и спутники', t: ['coords'], u: q => { const [a, b] = LL(q); return `https://overpass-turbo.eu/?C=${a};${b};16`; } },

  // Места
  { n: 'Google Карты: поиск места', d: 'Найти адрес или объект', c: 'Карты и спутники', t: ['place'], u: q => 'https://www.google.com/maps/search/' + E(q) },
  { n: 'Яндекс Карты: поиск', d: 'Найти адрес или объект', c: 'Карты и спутники', t: ['place'], u: q => 'https://yandex.ru/maps/?text=' + E(q) },
  { n: 'OpenStreetMap: поиск', d: 'Nominatim', c: 'Карты и спутники', t: ['place'], u: q => 'https://www.openstreetmap.org/search?query=' + E(q) },

  // Организации
  { n: 'OpenCorporates', d: 'Крупнейшая открытая база компаний мира', c: 'Реестры организаций', t: ['org', 'text'], u: q => 'https://opencorporates.com/companies?q=' + E(q) },
  { n: 'ЕГРЮЛ ФНС', d: 'Официальная выписка (ввод на сайте)', c: 'Реестры организаций', t: ['org'], u: () => 'https://egrul.nalog.ru/' },
  { n: 'Rusprofile', d: 'Сводка по компаниям РФ', c: 'Реестры организаций', t: ['org'], u: q => 'https://www.rusprofile.ru/search?query=' + E(q) },
  { n: 'Companies House (UK)', d: 'Реестр компаний Великобритании', c: 'Реестры организаций', t: ['org'], u: q => 'https://find-and-update.company-information.service.gov.uk/search?q=' + E(q) },
  { n: 'SEC EDGAR (США)', d: 'Отчётность публичных компаний', c: 'Реестры организаций', t: ['org'], u: q => 'https://www.sec.gov/cgi-bin/browse-edgar?company=' + E(q) + '&owner=include&action=getcompany' },
  { n: 'GLEIF LEI', d: 'Глобальные идентификаторы юрлиц', c: 'Реестры организаций', t: ['org'], u: () => 'https://search.gleif.org/' },
  { n: 'OpenSanctions', d: 'Санкционные списки и PEP', c: 'Реестры организаций', t: ['org', 'text'], u: q => 'https://www.opensanctions.org/search/?q=' + E(q) },
  { n: 'ICIJ Offshore Leaks', d: 'Офшорные структуры из расследований', c: 'Реестры организаций', t: ['org', 'text'], u: q => 'https://offshoreleaks.icij.org/search?q=' + E(q) },
  { n: 'Crunchbase', d: 'Стартапы, инвестиции, руководство', c: 'Реестры организаций', t: ['org'], u: q => 'https://www.crunchbase.com/textsearch?q=' + E(q) },
  { n: 'Google Patents', d: 'Патенты и заявители', c: 'Реестры организаций', t: ['org', 'text'], u: q => 'https://patents.google.com/?q=' + E(q) },

  // Код
  { n: 'GitHub Code', d: 'Поиск по публичному коду', c: 'Код', t: ['text', 'domain', 'username', 'org'], u: q => 'https://github.com/search?type=code&q=' + E(`"${q}"`) },
  { n: 'grep.app', d: 'Быстрый поиск по репозиториям', c: 'Код', t: ['text', 'domain'], u: q => 'https://grep.app/search?q=' + E(q) },
  { n: 'Sourcegraph', d: 'Поиск по open-source коду', c: 'Код', t: ['text', 'domain'], u: q => 'https://sourcegraph.com/search?q=' + E(q) },

  // Хеши
  { n: 'VirusTotal', d: 'Поиск файла по хешу', c: 'Хеши', t: ['hash'], u: q => 'https://www.virustotal.com/gui/search/' + E(q) },
  { n: 'MalwareBazaar', d: 'База образцов по хешу', c: 'Хеши', t: ['hash'], u: q => 'https://bazaar.abuse.ch/browse.php?search=' + E((q.length === 64 ? 'sha256:' : q.length === 40 ? 'sha1:' : 'md5:') + q) }
];

/* Примеры для быстрого старта */
GE.EXAMPLES = [
  ['domain', 'wikipedia.org'], ['username', '@torvalds'], ['coords', '59.9390, 30.3158'],
  ['ip', '1.1.1.1'], ['org', 'Wikimedia Foundation'], ['url', 'https://example.com/?utm_source=demo']
];

/* Пресеты конструктора операторов */
GE.DORK_PRESETS = [
  { l: 'PDF на сайте', set: { filetype: 'pdf' }, need: 'site' },
  { l: 'Пресс-релизы', set: { any: 'пресс-релиз, press release', } },
  { l: 'Упоминания вне сайта', fn: d => ({ none: d.none, exact: d.exact || d.site, site: '' }), hint: 'исключает сам сайт' },
  { l: 'Отчёты и презентации', set: { any: 'отчёт, report, презентация', filetype: '' } },
  { l: 'Таблицы данных', set: { filetype: 'xlsx' } },
  { l: 'Свежее за год', fn: () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return { after: d.toISOString().slice(0, 10) }; } }
];

/* ─────────── Каталог внешних инструментов ─────────── */
GE.TOOLS = [
  { n: 'OSINT Framework', c: 'Справочники', d: 'Дерево сотен OSINT-инструментов по категориям.', u: 'https://osintframework.com' },
  { n: 'Bellingcat Toolkit', c: 'Справочники', d: 'Подборка инструментов от команды расследователей Bellingcat с описаниями.', u: 'https://bellingcat.gitbook.io/toolkit' },
  { n: 'Awesome OSINT', c: 'Справочники', d: 'Большой список на GitHub: от поиска до анализа.', u: 'https://github.com/jivoi/awesome-osint' },
  { n: 'First Draft / Verification Handbook', c: 'Справочники', d: 'Методичка по проверке фактов, фото и видео.', u: 'https://datajournalism.com/read/handbook/verification-3' },
  { n: 'Google Lens', c: 'Изображения', d: 'Обратный поиск и распознавание объектов, текста, мест.', u: 'https://lens.google.com' },
  { n: 'Яндекс Картинки', c: 'Изображения', d: 'Обратный поиск; хорошо находит места и похожие фото.', u: 'https://yandex.ru/images' },
  { n: 'TinEye', c: 'Изображения', d: 'Поиск самой ранней публикации и изменённых копий.', u: 'https://tineye.com' },
  { n: 'Forensically', c: 'Изображения', d: 'Клонирование, ELA, шум, метаданные — в браузере.', u: 'https://29a.ch/photo-forensics/' },
  { n: 'FotoForensics', c: 'Изображения', d: 'Анализ уровня ошибок и метаданных.', u: 'https://fotoforensics.com' },
  { n: 'Content Credentials Verify', c: 'Изображения', d: 'Проверка цифровой подписи C2PA (происхождение и правки, метки ИИ).', u: 'https://contentcredentials.org/verify' },
  { n: 'Jimpl', c: 'Изображения', d: 'Онлайн-просмотр EXIF и карта съёмки.', u: 'https://jimpl.com' },
  { n: 'InVID / WeVerify', c: 'Видео', d: 'Плагин проверки видео: ключевые кадры, обратный поиск, метаданные.', u: 'https://www.invid-project.eu/tools-and-services/invid-verification-plugin/' },
  { n: 'YouTube DataViewer (Amnesty)', c: 'Видео', d: 'Точное время загрузки и миниатюры для обратного поиска.', u: 'https://citizenevidence.amnestyusa.org/' },
  { n: 'Google Earth Web', c: 'Геолокация', d: 'Рельеф, 3D, исторические снимки.', u: 'https://earth.google.com/web/' },
  { n: 'SunCalc', c: 'Геолокация', d: 'Положение солнца и длина теней — время и место съёмки.', u: 'https://www.suncalc.org' },
  { n: 'Overpass Turbo', c: 'Геолокация', d: 'Запросы к OpenStreetMap: найти все объекты с признаками.', u: 'https://overpass-turbo.eu' },
  { n: 'Sentinel EO Browser', c: 'Геолокация', d: 'Бесплатные спутниковые снимки Sentinel/Landsat.', u: 'https://apps.sentinel-hub.com/eo-browser/' },
  { n: 'Mapillary', c: 'Геолокация', d: 'Уличные фото по всему миру.', u: 'https://www.mapillary.com' },
  { n: 'GeoNames', c: 'Геолокация', d: 'База географических названий и координат.', u: 'https://www.geonames.org' },
  { n: 'Wayback Machine', c: 'Архивы', d: 'История страниц сайта с 1996 года.', u: 'https://web.archive.org' },
  { n: 'archive.today', c: 'Архивы', d: 'Мгновенные снимки страниц.', u: 'https://archive.ph' },
  { n: 'Common Crawl', c: 'Архивы', d: 'Открытый архив веб-краулинга.', u: 'https://commoncrawl.org' },
  { n: 'ICANN Lookup', c: 'Домены и сети', d: 'Официальные регистрационные данные доменов.', u: 'https://lookup.icann.org' },
  { n: 'crt.sh', c: 'Домены и сети', d: 'Certificate Transparency — поиск поддоменов.', u: 'https://crt.sh' },
  { n: 'DNSDumpster', c: 'Домены и сети', d: 'Визуальная карта DNS домена.', u: 'https://dnsdumpster.com' },
  { n: 'Shodan', c: 'Домены и сети', d: 'Поиск устройств и сервисов в интернете.', u: 'https://www.shodan.io' },
  { n: 'Censys', c: 'Домены и сети', d: 'Хосты, сертификаты и сервисы.', u: 'https://search.censys.io' },
  { n: 'urlscan.io', c: 'Домены и сети', d: 'Безопасный просмотр и анализ страниц.', u: 'https://urlscan.io' },
  { n: 'BuiltWith', c: 'Домены и сети', d: 'Технологический стек сайтов.', u: 'https://builtwith.com' },
  { n: 'OpenCorporates', c: 'Организации', d: 'Открытая база компаний из 140+ юрисдикций.', u: 'https://opencorporates.com' },
  { n: 'ЕГРЮЛ / ЕГРИП ФНС', c: 'Организации', d: 'Официальная выписка о юрлице в РФ.', u: 'https://egrul.nalog.ru' },
  { n: 'ГИР БО ФНС', c: 'Организации', d: 'Бухгалтерская отчётность организаций РФ.', u: 'https://bo.nalog.ru' },
  { n: 'Госзакупки (ЕИС)', c: 'Организации', d: 'Контракты и закупки госзаказчиков РФ.', u: 'https://zakupki.gov.ru' },
  { n: 'Companies House', c: 'Организации', d: 'Реестр компаний Великобритании с директорами.', u: 'https://find-and-update.company-information.service.gov.uk' },
  { n: 'OpenSanctions', c: 'Организации', d: 'Санкции, PEP, связанные лица.', u: 'https://www.opensanctions.org' },
  { n: 'ICIJ Offshore Leaks', c: 'Организации', d: 'Офшорные компании из журналистских расследований.', u: 'https://offshoreleaks.icij.org' },
  { n: 'GLEIF', c: 'Организации', d: 'Идентификаторы юрлиц LEI и структуры владения.', u: 'https://search.gleif.org' },
  { n: 'WhatsMyName', c: 'Профили', d: 'Проверка никнейма на сотнях площадок.', u: 'https://whatsmyname.app' },
  { n: 'TGStat', c: 'Профили', d: 'Каталог и статистика публичных Telegram-каналов.', u: 'https://tgstat.ru' },
  { n: 'Social Searcher', c: 'Профили', d: 'Поиск упоминаний в публичных соцсетях.', u: 'https://www.social-searcher.com' },
  { n: 'Flightradar24', c: 'Транспорт', d: 'Публичные данные о полётах.', u: 'https://www.flightradar24.com' },
  { n: 'MarineTraffic', c: 'Транспорт', d: 'Публичные AIS-данные о судах.', u: 'https://www.marinetraffic.com' },
  { n: 'OpenRailwayMap', c: 'Транспорт', d: 'Железнодорожная инфраструктура.', u: 'https://www.openrailwaymap.org' },
  { n: 'Have I Been Pwned', c: 'Защита', d: 'Проверка своих адресов на утечки.', u: 'https://haveibeenpwned.com' },
  { n: 'VirusTotal', c: 'Защита', d: 'Проверка файлов и ссылок.', u: 'https://www.virustotal.com' },
  { n: 'CyberChef', c: 'Данные', d: '«Швейцарский нож» преобразования данных.', u: 'https://gchq.github.io/CyberChef/' },
  { n: 'Google Dataset Search', c: 'Данные', d: 'Поиск открытых наборов данных.', u: 'https://datasetsearch.research.google.com' },
  { n: 'Wikidata Query', c: 'Данные', d: 'SPARQL-запросы к открытой базе фактов Wikidata.', u: 'https://query.wikidata.org' },
  { n: 'Obsidian', c: 'Данные', d: 'Ваша локальная база знаний GOD EYE.', u: 'https://obsidian.md' }
];

/* Справочник происхождения EXIF-тегов «ИИ»-генерации (IPTC DigitalSourceType) */
GE.AI_SOURCE = {
  trainedAlgorithmicMedia: 'Создано генеративной моделью (ИИ)',
  compositeWithTrainedAlgorithmicMedia: 'Композит с участием генеративной модели (ИИ)',
  algorithmicMedia: 'Создано алгоритмически',
  compositeSynthetic: 'Синтетический композит',
  digitalCapture: 'Цифровая съёмка',
  negativeFilm: 'Скан плёнки', positiveFilm: 'Скан слайда', print: 'Скан отпечатка',
  minorHumanEdits: 'Небольшие правки человеком', compositeCapture: 'Композит из снимков',
  screenCapture: 'Снимок экрана', digitalArt: 'Цифровой рисунок'
};
})();
