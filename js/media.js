/* ═══════════════════════════════════════════════════════════════
   GOD EYE · media.js — анализ изображений (EXIF, XMP, C2PA, хеши, dHash, ELA)
   и карта геолокации (Leaflet + OpenStreetMap / спутник Esri)
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const GE = window.GE, $ = GE.$, $$ = GE.$$, esc = GE.esc;

/* ═════════════ EXIF ═════════════ */
const TAGS0 = { 0x010E: 'ImageDescription', 0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x0131: 'Software', 0x0132: 'DateTime', 0x013B: 'Artist', 0x8298: 'Copyright', 0x8769: 'ExifIFD', 0x8825: 'GPSIFD' };
const TAGSX = { 0x829A: 'ExposureTime', 0x829D: 'FNumber', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized', 0x9010: 'OffsetTime', 0x9011: 'OffsetTimeOriginal', 0x920A: 'FocalLength', 0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension', 0xA420: 'ImageUniqueID', 0xA430: 'CameraOwnerName', 0xA431: 'BodySerialNumber', 0xA433: 'LensMake', 0xA434: 'LensModel', 0x9286: 'UserComment' };
const TAGSG = { 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude', 0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef', 0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0011: 'GPSImgDirection', 0x001D: 'GPSDateStamp' };
const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function parseTiff(v, start) {
  const le = v.getUint16(start) === 0x4949;
  const len = v.byteLength;
  const u16 = o => v.getUint16(start + o, le), u32 = o => v.getUint32(start + o, le), s32 = o => v.getInt32(start + o, le);
  const out = {};
  const val = (e, type, count) => {
    const total = (SIZES[type] || 1) * count;
    const off = total <= 4 ? e + 8 : u32(e + 8);
    if (start + off + total > len) return undefined;
    if (type === 2) { let s = ''; for (let i = 0; i < count; i++) { const c = v.getUint8(start + off + i); if (!c) break; s += String.fromCharCode(c); } try { s = decodeURIComponent(escape(s)); } catch (er) { /* latin1 */ } return s.trim(); }
    const arr = [];
    for (let i = 0; i < Math.min(count, 64); i++) {
      const o = off + i * SIZES[type];
      if (type === 3) arr.push(u16(o));
      else if (type === 4) arr.push(u32(o));
      else if (type === 9) arr.push(s32(o));
      else if (type === 5) arr.push(u32(o + 4) ? u32(o) / u32(o + 4) : 0);
      else if (type === 10) arr.push(s32(o + 4) ? s32(o) / s32(o + 4) : 0);
      else if (type === 1 || type === 7) arr.push(v.getUint8(start + o));
    }
    if (type === 7 && count > 8) { const s = String.fromCharCode(...arr.slice(8)).replace(/\0/g, '').trim(); return s || undefined; }
    return arr.length === 1 ? arr[0] : arr;
  };
  const ifd = (o, tags) => {
    if (o <= 0 || start + o + 2 > len) return;
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      if (start + e + 12 > len) break;
      const name = tags[u16(e)]; if (!name) continue;
      try { out[name] = val(e, u16(e + 2), u32(e + 4)); } catch (er) { /* битый тег */ }
    }
  };
  ifd(u32(4), TAGS0);
  if (out.ExifIFD) ifd(out.ExifIFD, TAGSX);
  if (out.GPSIFD) ifd(out.GPSIFD, TAGSG);
  delete out.ExifIFD; delete out.GPSIFD;
  const dms = a => Array.isArray(a) ? a[0] + (a[1] || 0) / 60 + (a[2] || 0) / 3600 : null;
  if (out.GPSLatitude && out.GPSLongitude) {
    let lat = dms(out.GPSLatitude), lon = dms(out.GPSLongitude);
    if (out.GPSLatitudeRef === 'S') lat = -lat;
    if (out.GPSLongitudeRef === 'W') lon = -lon;
    if (isFinite(lat) && isFinite(lon) && (lat || lon)) out._gps = { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
  }
  return out;
}

GE.exif = buffer => {
  const v = new DataView(buffer), res = { exif: {}, xmp: {}, flags: [], format: '' };
  const bytes = new Uint8Array(buffer);
  if (v.byteLength > 4 && v.getUint16(0) === 0xFFD8) {
    res.format = 'JPEG';
    let off = 2;
    while (off + 4 < v.byteLength) {
      if (v.getUint8(off) !== 0xFF) break;
      const m = v.getUint8(off + 1), size = v.getUint16(off + 2);
      if (m === 0xE1 && v.getUint32(off + 4) === 0x45786966) { try { res.exif = parseTiff(v, off + 10); } catch (e) { /* ignore */ } }
      if (m === 0xDA) break;
      off += 2 + size;
    }
  } else if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    res.format = 'PNG';
    let off = 8; const texts = {};
    while (off + 8 < v.byteLength) {
      const len = v.getUint32(off), type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
      if (type === 'tEXt' || type === 'iTXt') {
        const chunk = bytes.subarray(off + 8, off + 8 + len), z = chunk.indexOf(0);
        const key = new TextDecoder('latin1').decode(chunk.subarray(0, z));
        let valB = chunk.subarray(z + 1);
        if (type === 'iTXt') { let p = 2; let n = 0; for (let i = p; i < valB.length && n < 2; i++) if (valB[i] === 0) { n++; p = i + 1; } valB = valB.subarray(p); }
        texts[key] = new TextDecoder().decode(valB).slice(0, 2000);
      }
      if (type === 'eXIf') { try { res.exif = parseTiff(v, off + 8); } catch (e) { /* ignore */ } }
      if (type === 'IEND') break;
      off += 12 + len;
    }
    res.pngText = texts;
  } else if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) res.format = 'WEBP';
  // XMP и C2PA — поиск по сырому тексту (первые 1.5 МБ)
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1572864)));
  const x0 = head.indexOf('<x:xmpmeta'), x1 = head.indexOf('</x:xmpmeta>');
  if (x0 >= 0 && x1 > x0) {
    let xmp = head.slice(x0, x1);
    try { xmp = decodeURIComponent(escape(xmp)); } catch (e) { /* ignore */ }
    const grab = n => { const m = xmp.match(new RegExp(n + '="([^"]+)"')) || xmp.match(new RegExp('<' + n + '>([^<]+)</' + n + '>')); return m ? m[1] : ''; };
    res.xmp = {
      CreatorTool: grab('xmp:CreatorTool'), CreateDate: grab('xmp:CreateDate'), ModifyDate: grab('xmp:ModifyDate'),
      DigitalSourceType: (grab('Iptc4xmpExt:DigitalSourceType') || (xmp.match(/digitalsourcetype\/(\w+)/i) || [])[1] || '').split('/').pop(),
      History: GE.uniq((xmp.match(/stEvt:softwareAgent="([^"]+)"/g) || []).map(s => s.split('"')[1])).join(', '),
      Credit: grab('photoshop:Credit'), City: grab('photoshop:City'), Country: grab('photoshop:Country')
    };
    Object.keys(res.xmp).forEach(k => { if (!res.xmp[k]) delete res.xmp[k]; });
  }
  res.c2pa = /c2pa|jumbf|contentauth/i.test(head.slice(0, 600000));
  return res;
};

/* ═════════════ Перцептивный хеш и ELA ═════════════ */
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
GE.dhash = img => {
  const c = document.createElement('canvas'); c.width = 9; c.height = 8;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 9, 8);
  const d = g.getImageData(0, 0, 9, 8).data; let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const i = (y * 9 + x) * 4, j = i + 4;
    const a = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114, b = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
    bits += a > b ? '1' : '0';
  }
  let hex = ''; for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
};
GE.hamming = (a, b) => { if (!a || !b || a.length !== b.length) return 99; let n = 0; for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } } return n; };
async function ela(img, q = 0.9, amp = 14) {
  const max = 1400, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
  const a = document.createElement('canvas'); a.width = w; a.height = h;
  const ga = a.getContext('2d', { willReadFrequently: true }); ga.drawImage(img, 0, 0, w, h);
  const A = ga.getImageData(0, 0, w, h);
  const b = await loadImg(a.toDataURL('image/jpeg', q));
  ga.drawImage(b, 0, 0, w, h);
  const B = ga.getImageData(0, 0, w, h), O = ga.createImageData(w, h);
  for (let i = 0; i < A.data.length; i += 4) {
    const d = (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2])) / 3;
    const v = Math.min(255, d * amp), hot = Math.max(0, v - 150) * 2.4;
    O.data[i] = v; O.data[i + 1] = Math.min(255, v * 0.22 + hot); O.data[i + 2] = Math.min(255, v * 0.22 + hot); O.data[i + 3] = 255;
  }
  ga.putImageData(O, 0, 0);
  return a;
}
const thumb = (img, max = 320) => {
  const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.72);
};

/* ═════════════ Раздел «Изображения» ═════════════ */
const IMG = GE.img = {};
IMG.init = () => {
  const slot = $('.view[data-entity="image"] .ent-extra'); if (!slot) return;
  slot.innerHTML = `
    <div class="panel" style="margin-bottom:16px">
      <div class="panel-h">Анализ изображения<small>файл обрабатывается локально и никуда не отправляется</small></div>
      <div class="two-col">
        <label class="drop" id="img-drop"><input type="file" accept="image/*" id="img-file">
          <div>${GE.icon('image', 'ic')}<div style="margin-top:10px"><b>Перетащите фото сюда</b>, выберите файл или вставьте из буфера (Ctrl+V)</div><div class="muted" style="font-size:12px;margin-top:4px">JPEG, PNG, WEBP · EXIF, GPS, XMP, метки ИИ, C2PA, SHA-256, dHash, ELA</div></div>
        </label>
        <div class="stack">
          <label class="field"><span>Или ссылка на опубликованное изображение</span><input class="input mono" id="img-url" placeholder="https://…/photo.jpg"></label>
          <div class="row"><button class="btn btn-primary" id="img-url-go">${GE.icon('search')}Обратный поиск по ссылке</button></div>
          <div class="notice silver" style="margin:0">${GE.icon('eye', 'ic')}<div><b>Методика проверки:</b> 1) найдите самую раннюю публикацию (TinEye, Яндекс, Google Lens); 2) сверьте EXIF и контекст; 3) геолоцируйте по ориентирам; 4) проверьте время по теням (SunCalc); 5) зафиксируйте источники и архивные копии.</div></div>
        </div>
      </div>
      <div id="img-result"></div>
    </div>`;
  const file = $('#img-file'), drop = $('#img-drop');
  file.addEventListener('change', () => file.files[0] && IMG.analyze(file.files[0]));
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) IMG.analyze(f); });
  document.addEventListener('paste', e => {
    if (GE.currentView !== 'images') return;
    const it = Array.from(e.clipboardData?.items || []).find(i => i.type.startsWith('image/'));
    if (it) { e.preventDefault(); IMG.analyze(it.getAsFile()); }
  });
  $('#img-url-go').onclick = () => {
    const u = GE.safeUrl($('#img-url').value);
    if (!u) return GE.toast('Нужна ссылка вида https://…', { type: 'err' });
    location.hash = `#/search?q=${encodeURIComponent(u)}&t=image`;
  };
};

IMG.analyze = async f => {
  const out = $('#img-result');
  out.innerHTML = `<div class="row" style="margin-top:16px"><span class="spinner"></span><span class="muted">Анализ «${esc(f.name || 'изображение')}»…</span></div>`;
  GE.GodEye && GE.GodEye.scanAll();
  try {
    const buf = await GE.readAs(f);
    const meta = GE.exif(buf);
    const [sha1, sha256] = await Promise.all([GE.sha(buf, 'SHA-1'), GE.sha(buf, 'SHA-256')]);
    const url = URL.createObjectURL(f);
    const img = await loadImg(url);
    const dh = GE.dhash(img);
    const ex = meta.exif || {};
    const sim = GE.db.byType('image').map(r => ({ r, d: r.file_hash === sha256 ? -1 : GE.hamming(dh, r.dhash) })).filter(x => x.d <= 12).sort((a, b) => a.d - b.d);
    // флаги
    const flags = [];
    const dst = meta.xmp.DigitalSourceType;
    if (dst && /algorithmic|synthetic/i.test(dst)) flags.push(['warn', 'Метка ИИ (IPTC DigitalSourceType)', GE.AI_SOURCE[dst] || dst]);
    else if (dst) flags.push(['', 'Тип источника (IPTC)', GE.AI_SOURCE[dst] || dst]);
    const pngParams = meta.pngText && (meta.pngText.parameters || meta.pngText.prompt || meta.pngText.Dream || meta.pngText.workflow);
    if (pngParams) flags.push(['warn', 'Параметры генерации в PNG', 'В файле есть текстовые поля, характерные для генераторов изображений (Stable Diffusion/ComfyUI).']);
    if (meta.c2pa) flags.push(['warn', 'Content Credentials (C2PA)', 'В файле есть манифест происхождения. Проверьте его на contentcredentials.org/verify — там видны автор, правки и метки ИИ.']);
    const sw = ex.Software || meta.xmp.CreatorTool || meta.xmp.History || '';
    if (/photoshop|lightroom|gimp|snapseed|picsart|canva|affinity|pixelmator|facetune|midjourney|dall|firefly|stable/i.test(sw)) flags.push(['warn', 'Следы редактора', sw]);
    if (!Object.keys(ex).length) flags.push(['', 'EXIF отсутствует', 'Метаданные удалены — это типично для соцсетей и мессенджеров. Ищите более ранние копии обратным поиском.']);
    if (ex._gps) flags.push(['warn', 'Есть GPS-координаты', `${ex._gps.lat}, ${ex._gps.lon} — проверьте и не публикуйте координаты частных лиц.`]);
    if (ex.DateTimeOriginal && ex.DateTime && ex.DateTimeOriginal !== ex.DateTime) flags.push(['', 'Дата изменения ≠ дата съёмки', `Съёмка ${ex.DateTimeOriginal}, изменение ${ex.DateTime}`]);
    if (sim.length) flags.push(['warn', 'Похожие изображения в базе', sim.map(s => `${s.r.title} (${s.d < 0 ? 'идентичный файл' : 'расстояние ' + s.d})`).join('; ')]);
    const fmtExif = Object.entries(ex).filter(([k]) => k !== '_gps').map(([k, v]) => [k, Array.isArray(v) ? v.map(x => typeof x === 'number' ? +x.toFixed(4) : x).join(', ') : typeof v === 'number' ? +v.toFixed(4) : v]);
    const exp = ex.ExposureTime ? (ex.ExposureTime < 1 ? '1/' + Math.round(1 / ex.ExposureTime) : ex.ExposureTime) + ' с' : '';
    IMG.current = { f, sha256, dh, ex, meta, img, url };
    out.innerHTML = `
      <div class="img-analysis">
        <div>
          <div class="row" style="margin-bottom:8px"><div class="seg" id="img-mode"><button class="on" data-m="orig">ОРИГИНАЛ</button><button data-m="ela">ELA</button></div><span class="muted" style="font-size:11.5px">ELA подсвечивает области с разной историей сжатия — признак возможного монтажа</span></div>
          <div class="img-stage" id="img-stage"><img src="${url}" alt=""></div>
          <div class="row" style="margin-top:10px">
            <button class="btn btn-primary" id="img-save">${GE.icon('plus')}Сохранить в базу</button>
            ${ex._gps ? `<button class="btn" id="img-geo">${GE.icon('geo')}Точка на карте</button>` : ''}
            <a class="btn" target="_blank" rel="noopener" href="https://lens.google.com/">Google Lens</a>
            <a class="btn" target="_blank" rel="noopener" href="https://yandex.ru/images/">Яндекс</a>
            <a class="btn" target="_blank" rel="noopener" href="https://tineye.com/">TinEye</a>
            ${meta.c2pa ? `<a class="btn" target="_blank" rel="noopener" href="https://contentcredentials.org/verify">C2PA Verify</a>` : ''}
          </div>
          <div class="dim" style="font-size:11.5px;margin-top:6px">Сервисы обратного поиска для локального файла: нажмите кнопку и загрузите этот же файл на их странице.</div>
        </div>
        <div>
          ${flags.map(([c, t, d]) => `<div class="flag ${c}"><div><b>${esc(t)}.</b> ${esc(d)}</div></div>`).join('')}
          <div class="out-group" style="margin-top:14px"><h5>Файл</h5><dl class="kv">
            <dt>Имя</dt><dd>${esc(f.name || '—')}</dd><dt>Формат</dt><dd>${esc(meta.format || f.type)} · ${GE.bytes(f.size)}</dd>
            <dt>Размер</dt><dd>${img.naturalWidth} × ${img.naturalHeight} px</dd>
            ${f.lastModified ? `<dt>Изменён (ФС)</dt><dd>${esc(GE.fmtDate(new Date(f.lastModified).toISOString()))}</dd>` : ''}
          </dl></div>
          <div class="out-group"><h5>Хеши</h5><div class="hash-out">
            <div class="hash-row"><span>SHA-256</span><code>${sha256}</code><button class="btn btn-icon btn-sm btn-ghost" data-cp="${sha256}">${GE.icon('copy')}</button></div>
            <div class="hash-row"><span>SHA-1</span><code>${sha1}</code><button class="btn btn-icon btn-sm btn-ghost" data-cp="${sha1}">${GE.icon('copy')}</button></div>
            <div class="hash-row"><span>dHash</span><code>${dh}</code><button class="btn btn-icon btn-sm btn-ghost" data-cp="${dh}">${GE.icon('copy')}</button></div>
          </div></div>
          ${Object.keys(ex).length ? `<div class="out-group"><h5>Камера и съёмка</h5><dl class="kv">
            ${[['Камера', [ex.Make, ex.Model].filter(Boolean).join(' ')], ['Объектив', ex.LensModel], ['Дата съёмки', ex.DateTimeOriginal], ['Часовой пояс', ex.OffsetTimeOriginal || ex.OffsetTime], ['Выдержка', exp], ['Диафрагма', ex.FNumber && 'f/' + (+ex.FNumber).toFixed(1)], ['ISO', ex.ISO], ['Фокусное', ex.FocalLength && (+ex.FocalLength).toFixed(1) + ' мм'], ['ПО', ex.Software], ['Автор', ex.Artist], ['Copyright', ex.Copyright]].filter(x => x[1]).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}
            ${ex._gps ? `<dt>GPS</dt><dd class="mono">${ex._gps.lat}, ${ex._gps.lon}${ex.GPSAltitude ? ' · высота ' + (+ex.GPSAltitude).toFixed(0) + ' м' : ''}${ex.GPSImgDirection ? ' · направление ' + (+ex.GPSImgDirection).toFixed(0) + '°' : ''}</dd>` : ''}
          </dl></div>` : ''}
          ${Object.keys(meta.xmp).length ? `<div class="out-group"><h5>XMP</h5><dl class="kv">${Object.entries(meta.xmp).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : ''}
          ${meta.pngText && Object.keys(meta.pngText).length ? `<div class="out-group"><h5>Текстовые поля PNG</h5><dl class="kv">${Object.entries(meta.pngText).map(([k, v]) => `<dt>${esc(k)}</dt><dd style="max-height:120px;overflow:auto">${esc(v)}</dd>`).join('')}</dl></div>` : ''}
          ${fmtExif.length ? `<details class="out-group"><summary class="muted mono" style="cursor:pointer;font-size:11px;letter-spacing:.14em">ВСЕ ТЕГИ EXIF · ${fmtExif.length}</summary><dl class="kv" style="margin-top:8px">${fmtExif.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></details>` : ''}
        </div>
      </div>`;
    out.querySelectorAll('[data-cp]').forEach(b => b.onclick = () => GE.copy(b.dataset.cp));
    let elaCanvas = null;
    out.querySelectorAll('#img-mode [data-m]').forEach(b => b.onclick = async () => {
      out.querySelectorAll('#img-mode [data-m]').forEach(x => x.classList.toggle('on', x === b));
      const st = $('#img-stage');
      if (b.dataset.m === 'ela') {
        st.innerHTML = '<span class="spinner"></span>';
        try { elaCanvas = elaCanvas || await ela(img); st.innerHTML = ''; st.appendChild(elaCanvas); }
        catch (e) { st.innerHTML = '<div class="muted">ELA недоступен для этого файла.</div>'; }
      } else st.innerHTML = `<img src="${url}" alt="">`;
    });
    $('#img-save').onclick = () => GE.editRecord('image', null, {
      title: (f.name || 'Изображение').replace(/\.[^.]+$/, ''), file_hash: sha256, dhash: dh,
      captured: ex.DateTimeOriginal || ex.DateTime || meta.xmp.CreateDate || '',
      camera: [ex.Make, ex.Model].filter(Boolean).join(' ') || ex.Software || meta.xmp.CreatorTool || '',
      lat: ex._gps ? ex._gps.lat : '', lon: ex._gps ? ex._gps.lon : '',
      verdict: dst && /algorithmic/i.test(dst) ? 'Сгенерировано ИИ' : 'Не установлено',
      thumb: thumb(img), retrieved: GE.today(), tags: ['фото'],
      notes: flags.map(x => `- ${x[1]}: ${x[2]}`).join('\n')
    });
    if ($('#img-geo')) $('#img-geo').onclick = () => GE.editRecord('geo', null, { title: 'Место съёмки: ' + (f.name || 'фото'), lat: ex._gps.lat, lon: ex._gps.lon, accuracy: 'Точная', retrieved: GE.today(), notes: 'Координаты из EXIF файла ' + (f.name || '') });
    GE.log('IMG', `Проанализировано: ${f.name || 'изображение'}`); GE.save();
  } catch (err) {
    console.error(err);
    out.innerHTML = `<div class="flag warn" style="margin-top:16px"><b>Не удалось прочитать файл.</b>&nbsp;${esc(err.message || 'Неизвестный формат')}</div>`;
  }
};

/* ═════════════ Карта геолокации ═════════════ */
const GEO = GE.geo = { map: null, layer: null, tmp: null };
GEO.init = () => {
  const slot = $('.view[data-entity="geo"] .ent-extra'); if (!slot) return;
  slot.innerHTML = `
    <div class="map-wrap" id="map-wrap" style="margin-bottom:16px">
      <div id="geo-map"></div>
      <div class="map-ui">
        <input class="input" id="map-search" placeholder="Найти место или вставить координаты…">
        <div class="seg" style="background:rgba(5,5,6,.88)"><button class="on" data-layer="osm">СХЕМА</button><button data-layer="sat">СПУТНИК</button></div>
        <button class="btn btn-sm" id="map-fit" style="background:rgba(5,5,6,.88)">Все точки</button>
      </div>
      <div class="map-coords" id="map-coords">—</div>
    </div>`;
};
GEO.ensure = () => {
  if (GEO.map) { setTimeout(() => GEO.map.invalidateSize(), 50); return; }
  const el = $('#geo-map'); if (!el) return;
  if (!window.L) { el.innerHTML = '<div class="map-fallback">Карта не загрузилась: нет подключения к интернету или библиотека Leaflet заблокирована.<br>Записи локаций и ссылки на внешние карты продолжают работать.</div>'; return; }
  const map = GEO.map = L.map(el, { zoomControl: true, worldCopyJump: true, attributionControl: true }).setView([55.75, 37.62], 4);
  GEO.tiles = {
    osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }),
    sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri World Imagery' })
  };
  map.attributionControl.setPrefix('Leaflet');
  GEO.tiles.osm.addTo(map);
  GEO.layer = L.layerGroup().addTo(map);
  map.on('mousemove', e => { $('#map-coords').textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; });
  map.on('click', e => GEO.pick(e.latlng.lat, e.latlng.lng));
  $$('#map-wrap [data-layer]').forEach(b => b.onclick = () => {
    $$('#map-wrap [data-layer]').forEach(x => x.classList.toggle('on', x === b));
    Object.values(GEO.tiles).forEach(t => map.removeLayer(t));
    GEO.tiles[b.dataset.layer].addTo(map);
    $('#map-wrap').classList.toggle('sat', b.dataset.layer === 'sat');
  });
  $('#map-fit').onclick = () => GEO.fit();
  $('#map-search').addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    const v = e.target.value.trim(); if (!v) return;
    const c = GE.parseCoords(v);
    if (c) { map.setView([c.lat, c.lon], 16); GEO.pick(c.lat, c.lon); return; }
    try {
      const r = await GE.fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(v)}`);
      if (!r.length) return GE.toast('Место не найдено');
      map.setView([+r[0].lat, +r[0].lon], 15); GEO.pick(+r[0].lat, +r[0].lon, r[0].display_name);
    } catch (err) { GE.toast('Геокодер недоступен — введите координаты', { type: 'err' }); }
  });
  setTimeout(() => map.invalidateSize(), 60);
  GEO.refresh(); GEO.fit();
};
const icon = cls => window.L && L.divIcon({ className: '', html: `<div class="ge-marker ${cls || ''}"><i></i></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
GEO.pick = (lat, lon, name) => {
  if (GEO.tmp) GEO.map.removeLayer(GEO.tmp);
  const q = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  GEO.tmp = L.marker([lat, lon], { icon: icon('tmp') }).addTo(GEO.map);
  const div = document.createElement('div');
  div.innerHTML = `<b>${esc(name ? name.split(',').slice(0, 2).join(',') : 'Точка')}</b><div class="mono" style="font-size:11.5px;margin:4px 0 10px;color:#a5a5af">${q}</div>
    <div class="row" style="gap:6px"><button class="btn btn-sm btn-primary" data-a="add">+ Локация</button><button class="btn btn-sm" data-a="search">Поиск</button><button class="btn btn-sm" data-a="copy">Копировать</button></div>`;
  div.querySelector('[data-a=add]').onclick = () => GE.editRecord('geo', null, { title: name ? name.split(',')[0] : 'Точка ' + q, lat: +lat.toFixed(6), lon: +lon.toFixed(6), place: name || '', retrieved: GE.today() });
  div.querySelector('[data-a=search]').onclick = () => { location.hash = `#/search?q=${encodeURIComponent(q)}&t=coords`; };
  div.querySelector('[data-a=copy]').onclick = () => GE.copy(q);
  GEO.tmp.bindPopup(div).openPopup();
};
GEO.points = () => GE.db.all().filter(r => (r.type === 'geo' || r.type === 'image') && r.lat !== '' && r.lat != null && r.lon !== '' && r.lon != null && isFinite(r.lat) && isFinite(r.lon));
GEO.refresh = () => {
  if (!GEO.map || !GEO.layer) return;
  GEO.layer.clearLayers();
  GEO.points().forEach(r => {
    const m = L.marker([+r.lat, +r.lon], { icon: icon(r.type === 'image' ? 'img' : '') }).addTo(GEO.layer);
    const div = document.createElement('div');
    div.innerHTML = `<div class="mono" style="font-size:10px;letter-spacing:.2em;color:#e2232e">${GE.TYPES[r.type].code}</div><b>${esc(r.title)}</b><div style="font-size:12px;color:#a5a5af;margin:4px 0 10px">${esc(GE.recSub(r))}</div><button class="btn btn-sm">Открыть карточку</button>`;
    div.querySelector('button').onclick = () => GE.openRecord(r.id);
    m.bindPopup(div);
    m.on('mouseover', () => m.openPopup());
  });
};
GEO.fit = () => {
  if (!GEO.map) return;
  const pts = GEO.points();
  if (pts.length === 1) GEO.map.setView([+pts[0].lat, +pts[0].lon], 15);
  else if (pts.length) GEO.map.fitBounds(pts.map(r => [+r.lat, +r.lon]), { padding: [40, 40], maxZoom: 15 });
};
GEO.focus = r => { GEO.ensure(); if (GEO.map && r.lat !== '') { GEO.map.setView([+r.lat, +r.lon], 16); } };
})();
