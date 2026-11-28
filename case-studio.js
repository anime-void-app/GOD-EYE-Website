/* ═══════════════════════════════════════════════════════════════
   GOD EYE · case-studio.js — ДЕТЕКТИВНЫЙ ШТАБ v4.0 (OMNISCIENT EDITION)
   Полноэкранная студия расследования убийств, «холодных дел» (Cold Cases)
   и личных забытых историй из прошлого:
   1. Стена улик с красными нитями (редактирование карточек, подписей нитей и экспорт в PNG)
   2. Матрица подозреваемых и алиби (Мотив · Средства · Возможность + индекс 0..99%)
   3. Поминутный таймлайн с автопоиском провалов времени
   4. Сейф улик и реестр лжи / противоречий в показаниях
   5. Живая интерактивная карта двора и места преступления (расстановка камер, свидетелей, улик + 3D-улица)
   6. Когнитивная реконструкция личных забытых дел (якоря памяти + архивы PastVu / Wayback)
   7. Автоматический Дедуктивный Разбор Следователя (сводка версий, слабых алиби и следующих шагов)
   Палитра: чёрный · белый · серебро · тёмно-красный. Без синего и фиолетового.
   ═══════════════════════════════════════════════════════════════ */
(function () {
'use strict';

if (window.__GE_CASE_STUDIO__) return;
window.__GE_CASE_STUDIO__ = true;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = p => (p || 'item') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

const ROLES = [
  'Подозреваемый',
  'Потерпевший / Жертва',
  'Ключевой свидетель',
  'Очевидец',
  'Человек из прошлого',
  'Родственник / Знакомый',
  'Эксперт / Следователь'
];

const ALIBI_ST = [
  ['unverified', 'Не проверено'],
  ['confirmed', 'Подтверждено независимым источником'],
  ['shaky', 'Сомнительное / только со слов'],
  ['broken', 'ОПРОВЕРГНУТО (ложь / нестыковка)']
];

const EV_TYPES = [
  'Вещественная улика',
  'Запись камеры / Фото',
  'Документ / Архив',
  'Цифровой след / Лог',
  'Показание свидетеля',
  'Деталь с места событий',
  'Личное воспоминание'
];

const TL_KINDS = [
  ['fact', 'Подтверждённый факт'],
  ['crime', 'Окно события / преступления'],
  ['witness', 'Показание (требует проверки)'],
  ['cam', 'Камера / чек / фиксация'],
  ['memory', 'Всплывшая деталь памяти']
];

const SCENE_PIN_KINDS = {
  epicenter: { label: 'Эпицентр события', glyph: '★', color: '#ff2e3b' },
  cam: { label: 'Камера наблюдения', glyph: '🎥', color: '#ffffff' },
  witness: { label: 'Позиция свидетеля', glyph: '👁', color: '#cacad2' },
  clue: { label: 'Найдена улика', glyph: '◈', color: '#ff8a90' },
  escape: { label: 'Путь подхода / отхода', glyph: '➜', color: '#e2232e' }
};

const state = {
  open: false,
  caseId: null,
  tab: 'board', // 'board' | 'suspects' | 'timeline' | 'evidence' | 'scene3d' | 'memory' | 'deduce'
  linkFrom: null,
  scenePinMode: 'epicenter',
  sceneMapBase: 'voyager',
  sceneMap: null
};

/* ─────────── Инициализация и синхронизация структуры дела ─────────── */
function ensureDetData(rec) {
  if (!rec.detective || typeof rec.detective !== 'object') {
    const parsedPeople = (window.GE && GE.parsePeople ? GE.parsePeople(rec.people) : []).map((p, idx) => ({
      id: uid('sus'),
      name: p.name,
      role: ROLES.find(r => r.toLowerCase().includes((p.role || '').toLowerCase())) || (p.role || 'Подозреваемый'),
      alibi: '',
      alibiStatus: 'unverified',
      motive: idx === 0 && Boolean(rec.motive),
      means: idx === 0 && Boolean(rec.means),
      opportunity: idx === 0 && Boolean(rec.opportunity),
      notes: p.note || ''
    }));
    const parsedTl = (window.GE && GE.parseTimeline ? GE.parseTimeline(rec.timeline) : []).map(e => ({
      id: uid('tl'),
      time: e.d || '',
      kind: 'fact',
      text: e.t || '',
      actor: ''
    }));
    const parsedEv = (window.GE && GE.caseLines ? GE.caseLines(rec.evidence) : []).map((line, i) => ({
      id: uid('ev'),
      code: 'E-' + String(i + 1).padStart(2, '0'),
      type: 'Документ / Архив',
      title: GE.stripBullet ? GE.stripBullet(line) : line,
      weight: 'strong',
      notes: ''
    }));
    const parsedCons = (window.GE && GE.caseLines ? GE.caseLines(rec.contradictions) : []).map(line => ({
      id: uid('con'),
      text: GE.stripBullet ? GE.stripBullet(line) : line,
      resolved: false
    }));

    rec.detective = {
      mode: rec.case_type === 'Личное забытое дело' ? 'personal' : 'crime',
      victimOrSubject: '',
      timeWindowStart: '',
      timeWindowEnd: '',
      scenePlace: rec.region || '',
      sceneLat: '',
      sceneLon: '',
      sceneNotes: '',
      sceneMarkers: [],
      suspects: parsedPeople,
      timeline: parsedTl,
      evidence: parsedEv,
      contradictions: parsedCons,
      pins: [],
      threads: [],
      memoryAnchors: {
        exact: '',
        fuzzy: '',
        sensory: '',
        era: '',
        checkedArchives: []
      },
      primeSuspectId: ''
    };
  }
  const d = rec.detective;
  d.suspects = Array.isArray(d.suspects) ? d.suspects : [];
  d.timeline = Array.isArray(d.timeline) ? d.timeline : [];
  d.evidence = Array.isArray(d.evidence) ? d.evidence : [];
  d.contradictions = Array.isArray(d.contradictions) ? d.contradictions : [];
  d.sceneMarkers = Array.isArray(d.sceneMarkers) ? d.sceneMarkers : [];
  d.pins = Array.isArray(d.pins) ? d.pins : [];
  d.threads = Array.isArray(d.threads) ? d.threads : [];
  d.memoryAnchors = Object.assign({ exact: '', fuzzy: '', sensory: '', era: '', checkedArchives: [] }, d.memoryAnchors || {});
  if (!d.pins.length && (d.suspects.length || d.evidence.length || rec.title)) {
    seedPinsFromData(rec);
  }
  return d;
}

function seedPinsFromData(rec) {
  const d = rec.detective;
  d.pins = [];
  d.threads = [];
  const centerPin = {
    id: uid('pin'),
    kind: 'core',
    title: d.victimOrSubject || rec.title || 'Центр дела',
    sub: d.scenePlace || rec.case_type || 'Ключевое событие',
    x: 420,
    y: 230
  };
  d.pins.push(centerPin);
  d.suspects.slice(0, 6).forEach((s, i) => {
    const ang = (i / Math.max(1, Math.min(6, d.suspects.length))) * Math.PI * 2 - Math.PI / 2;
    const p = {
      id: uid('pin'),
      refId: s.id,
      kind: /жертв|потерпев/i.test(s.role) ? 'victim' : /свидет|очевид/i.test(s.role) ? 'witness' : 'suspect',
      title: s.name,
      sub: s.role + (s.alibiStatus === 'broken' ? ' · АЛИБИ СЛОМАНО' : ''),
      x: Math.round(420 + Math.cos(ang) * 255),
      y: Math.round(230 + Math.sin(ang) * 165)
    };
    d.pins.push(p);
    d.threads.push({ id: uid('th'), from: centerPin.id, to: p.id, label: s.alibiStatus === 'broken' ? 'ложь в алиби' : s.role.split(' ')[0] });
  });
  d.evidence.slice(0, 6).forEach((ev, i) => {
    const p = {
      id: uid('pin'),
      refId: ev.id,
      kind: 'evidence',
      title: ev.code + ': ' + ev.title.slice(0, 34),
      sub: ev.type,
      x: 85 + (i % 2) * 670,
      y: 75 + Math.floor(i / 2) * 145
    };
    d.pins.push(p);
    const susPin = ev.suspectId ? d.pins.find(x => x.refId === ev.suspectId) : null;
    d.threads.push({ id: uid('th'), from: p.id, to: (susPin || centerPin).id, label: ev.code });
  });
}

function calcSuspectScore(s, d) {
  if (/жертв|потерпев/i.test(s.role)) return 0;
  let score = 10;
  if (/подозр/i.test(s.role)) score += 12;
  if (s.motive) score += 22;
  if (s.means) score += 18;
  if (s.opportunity) score += 22;
  if (s.alibiStatus === 'broken') score += 24;
  else if (s.alibiStatus === 'shaky') score += 10;
  else if (s.alibiStatus === 'confirmed') score -= 32;
  const linkedEv = (d.evidence || []).filter(e => e.suspectId === s.id);
  linkedEv.forEach(e => { score += e.weight === 'critical' ? 12 : e.weight === 'strong' ? 8 : 4; });
  return Math.max(0, Math.min(99, score));
}

function syncCaseRecord(rec) {
  if (!window.GE || !rec) return;
  const d = ensureDetData(rec);
  const peopleTxt = d.suspects.map(s => {
    const al = ALIBI_ST.find(x => x[0] === s.alibiStatus);
    const tail = [s.alibi ? 'алиби: ' + s.alibi : '', al && s.alibiStatus !== 'unverified' ? al[1] : '', s.notes || ''].filter(Boolean).join('; ');
    return `- ${s.name} — ${s.role}${tail ? ' — ' + tail : ''}`;
  }).join('\n');

  const tlTxt = d.timeline.map(t => `- ${t.time ? t.time + ' — ' : ''}${t.text}${t.actor ? ' (' + t.actor + ')' : ''}`).join('\n');
  const evTxt = d.evidence.map(e => `- [${e.code}] ${e.title}${e.notes ? ' — ' + e.notes : ''}`).join('\n');
  const conTxt = d.contradictions.map(c => `- ${c.resolved ? '[СНЯТО] ' : ''}${c.text}`).join('\n');

  const topSus = d.suspects
    .filter(s => !/жертв|потерпев/i.test(s.role))
    .map(s => ({ s, sc: calcSuspectScore(s, d) }))
    .sort((a, b) => b.sc - a.sc)[0];

  const patch = {
    detective: d,
    people: peopleTxt || rec.people || '',
    timeline: tlTxt || rec.timeline || '',
    evidence: evTxt || rec.evidence || '',
    contradictions: conTxt || rec.contradictions || ''
  };
  if (d.scenePlace && !rec.region) patch.region = d.scenePlace;
  if (topSus && topSus.sc >= 55 && !rec.motive && topSus.s.motive) patch.motive = `Установлен у фигуранта: ${topSus.s.name}`;
  GE.caseSet(rec.id, patch);
}

/* ─────────── Шаблоны быстрого старта и 2 полноценных демо-дела ─────────── */
function createPresetCase(kind) {
  if (!window.GE) return;
  const today = GE.today ? GE.today() : new Date().toISOString().slice(0, 10);

  if (kind === 'demo_murder') {
    const existing = GE.db.byType('case').find(c => c.title && c.title.includes('Убийство на Старом Причале'));
    if (existing) {
      open(existing.id);
      GE.toast('Открыто демонстрационное дело');
      return;
    }
    const loc = GE.db.add('geo', {
      title: 'Старый Причал · Наб. Обводного канала, 134',
      place: 'Санкт-Петербург, набережная Обводного канала, д. 134 (складской корпус № 4)',
      lat: 59.90742,
      lon: 30.27815,
      reliability: 'A',
      credibility: '1',
      tags: ['холодное-дело', 'место-преступления'],
      notes: 'Место обнаружения антиквара Виктора Ларина. Узкий проезд к воде, камера у въезда и боковая калитка со стороны двора.',
      retrieved: today
    });
    const vic = GE.db.add('person', {
      title: 'Ларин Виктор Павлович (потерпевший)',
      role: 'Антиквар, владелец архива редких карт',
      org_name: 'Антикварный салон «Северный Румб»',
      reliability: 'A',
      credibility: '1',
      tags: ['холодное-дело', 'потерпевший'],
      notes: 'Обнаружен в кабинете павильона № 4. Часы на запястье разбились при падении на отметке 22:38.',
      retrieved: today
    });
    const sus1 = GE.db.add('person', {
      title: 'Громов Илья Сергеевич',
      role: 'Деловой партнёр, соучредитель склада',
      org_name: 'Антикварный салон «Северный Румб»',
      reliability: 'B',
      credibility: '3',
      tags: ['холодное-дело', 'подозреваемый'],
      notes: 'Имел дубликат магнитного пропуска и крупный долг перед Лариным по результатам ревизии.',
      retrieved: today
    });
    const sus2 = GE.db.add('person', {
      title: 'Ковалёва Маргарита Олеговна',
      role: 'Частный оценщик коллекций',
      reliability: 'B',
      credibility: '2',
      tags: ['холодное-дело', 'свидетель'],
      notes: 'Приезжала на встречу в 21:50, покинула набережную на такси в 22:14.',
      retrieved: today
    });

    const sId1 = uid('sus'), sId2 = uid('sus'), sId3 = uid('sus'), vId = uid('sus');
    const eId1 = uid('ev'), eId2 = uid('ev'), eId3 = uid('ev'), eId4 = uid('ev');
    const cRec = GE.db.add('case', {
      title: 'Дело № 14-К: Убийство на Старом Причале (учебная реконструкция)',
      case_no: GE.nextCaseNo(),
      case_type: 'Убийство',
      status: 'Горячий след',
      priority: 'Критический',
      classif: 'Конфиденциально',
      stage: 'Анализ и версии',
      difficulty: 'Высокая',
      odds: 'Высокие',
      period: '14 ноября, 21:40 — 23:20',
      region: 'Санкт-Петербург, наб. Обводного канала, 134',
      reliability: 'B',
      credibility: '2',
      motive: 'Срыв ревизии каталога редких гравюр на сумму 18 млн ₽; Ларин готовил заявление о подмене оригиналов.',
      means: 'Тяжёлый бронзовый печатный пресс из мастерской павильона; доступ без взлома по штатному магнитному ключу.',
      opportunity: 'Единственный 24-минутный интервал отключения уличного прожектора (22:25–22:49) и знание слепой зоны камеры у арки.',
      briefing: 'Вечером 14 ноября в закрытом павильоне № 4 на Старом Причале обнаружен антиквар Виктор Ларин. Следов взлома дверей нет. На столе остались две чашки и раскрытый реестр ревизии с вырванным листом № 19.\n\n*Учебное демонстрационное дело GOD EYE на вымышленных персонажах и реальной городской геометрии для проверки 3D-осмотра улицы, карты двора, матрицы алиби и Дедуктивного Анализатора.*',
      leads: [
        '- [x] Зафиксировать точное окно наступления смерти по разбитым часам и логу сигнализации',
        '- [x] Сверить журнал магнитных пропусков на КПП и у боковой калитки',
        '- [ ] Сопоставить заявленное алиби Ильи Громова (заправка на ЗСД в 22:35) с дорожными камерами',
        '- [ ] Изучить карту двора во вкладке 5 и осмотреть арку дома 134 в 3D-режиме улицы',
        '- [ ] Запустить вкладку 7 «Дедуктивный Разбор» и вынести вердикт'
      ].join('\n'),
      questions: [
        '- Кто знал код снятия внутренней сигнализации павильона № 4?',
        '- Куда исчез лист № 19 из книги ревизии антикварного фонда?',
        '- Почему прожектор внутреннего двора был обесточен ровно в 22:25?'
      ].join('\n'),
      hypothesis: '**Основная версия:** преступление совершено лицом из ближнего круга, знакомым с расположением электрощита во дворе и имевшим магнитный ключ № 02.',
      linked: [loc.id, vic.id, sus1.id, sus2.id],
      tags: ['убийство', 'холодное-дело', 'реконструкция', 'демо'],
      retrieved: today,
      detective: {
        mode: 'crime',
        victimOrSubject: 'Виктор Ларин (антиквар, 58 лет)',
        timeWindowStart: '22:20',
        timeWindowEnd: '22:50',
        scenePlace: 'Санкт-Петербург, наб. Обводного канала, 134',
        sceneLat: 59.90742,
        sceneLon: 30.27815,
        sceneNotes: 'Двухэтажный кирпичный корпус у воды. Главный въезд под камерой К-1, но со стороны двора есть узкий проход за трансформаторной будкой.',
        sceneMarkers: [
          { id: uid('sm'), kind: 'epicenter', lat: 59.90742, lon: 30.27815, label: 'Павильон № 4 (место обнаружения)' },
          { id: uid('sm'), kind: 'cam', lat: 59.90785, lon: 30.27750, label: 'Камера К-1 у главного въезда' },
          { id: uid('sm'), kind: 'clue', lat: 59.90718, lon: 30.27875, label: 'Электрощит и боковая калитка (ключ № 02 в 22:24)' },
          { id: uid('sm'), kind: 'witness', lat: 59.90695, lon: 30.27730, label: 'Маршрут обхода сторожа Савельева' },
          { id: uid('sm'), kind: 'escape', lat: 59.90710, lon: 30.27940, label: 'След протектора седана в переулке (22:46)' }
        ],
        suspects: [
          { id: vId, name: 'Ларин Виктор Павлович', role: 'Потерпевший / Жертва', alibi: 'Находился в павильоне с 20:30', alibiStatus: 'confirmed', motive: false, means: false, opportunity: false, notes: 'Готовил акт ревизии недостачи 4 гравюр XVIII века.' },
          { id: sId1, name: 'Громов Илья Сергеевич', role: 'Подозреваемый', alibi: 'Утверждает, что в 22:30 заправлял машину на трассе в 14 км от причала', alibiStatus: 'broken', motive: true, means: true, opportunity: true, notes: 'По чеку заправки оплата прошла картой в 23:18, а его магнитный ключ № 02 сработал на боковой калитке причала в 22:24!' },
          { id: sId2, name: 'Ковалёва Маргарита Олеговна', role: 'Подозреваемый', alibi: 'Уехала с набережной на городском такси в 22:14', alibiStatus: 'confirmed', motive: true, means: false, opportunity: false, notes: 'Трек агрегатора такси и уличная камера у моста подтверждают посадку в 22:14.' },
          { id: sId3, name: 'Савельев Пётр (ночной сторож)', role: 'Ключевой свидетель', alibi: 'Обход дальнего ангара № 1 с 22:15 до 22:55', alibiStatus: 'shaky', motive: false, means: true, opportunity: true, notes: 'Слышал хлопок металлической калитки около 22:44, видел тёмный седан у соседнего переулка.' }
        ],
        timeline: [
          { id: uid('tl'), time: '21:50', kind: 'fact', text: 'Оценщик Маргарита Ковалёва заходит в павильон № 4 к Ларину', actor: 'Ковалёва М.' },
          { id: uid('tl'), time: '22:14', kind: 'cam', text: 'Камера К-1 фиксирует выход Ковалёвой и посадку в жёлтое такси у набережной', actor: 'Ковалёва М.' },
          { id: uid('tl'), time: '22:24', kind: 'cam', text: 'Считыватель боковой калитки фиксирует вход по магнитному пропуску № 02', actor: 'Ключ № 02 (Громов)' },
          { id: uid('tl'), time: '22:25', kind: 'crime', text: 'Отключён рубильник дворового прожектора у щитка за аркой', actor: 'Неизвестный' },
          { id: uid('tl'), time: '22:38', kind: 'crime', text: 'Остановка наручных часов потерпевшего от удара о каменный пол', actor: 'Ларин В. П.' },
          { id: uid('tl'), time: '23:18', kind: 'witness', text: 'Оплата топлива картой Громова на АЗС (на 48 минут позже заявленного им в показаниях!)', actor: 'Громов И. С.' }
        ],
        evidence: [
          { id: eId1, code: 'E-01', type: 'Цифровой след / Лог', title: 'Лог СКУД боковой калитки: пропуск № 02 в 22:24:11', weight: 'critical', suspectId: sId1, notes: 'Дубликат числится лично за И. С. Громовым, об утере он не заявлял.' },
          { id: eId2, code: 'E-02', type: 'Вещественная улика', title: 'Книга ревизии с вырванным листом № 19 (раздел комиссионных гравюр)', weight: 'strong', suspectId: sId1, notes: 'За неделю до гибели Ларин запрашивал у Громова отчёт именно по партии № 19.' },
          { id: eId3, code: 'E-03', type: 'Запись камеры / Фото', title: 'Чек и видео с АЗС: автомобиль Громова приехал только в 23:16', weight: 'critical', suspectId: sId1, notes: 'Полностью разрушает алиби на период 22:20–22:50.' },
          { id: eId4, code: 'E-04', type: 'Деталь с места событий', title: 'Следы свежей кирпичной крошки у дворового электрощита', weight: 'medium', suspectId: '', notes: 'Преступник точно знал, какой тумблер гасит только фонарь над входом в павильон № 4.' }
        ],
        contradictions: [
          { id: uid('con'), text: 'Громов заявил, что в 22:30 был на АЗС, однако терминал и камера АЗС зафиксировали его только в 23:16 (разрыв 46 минут — ровно на дорогу от причала).', resolved: false },
          { id: uid('con'), text: 'Громов утверждал, что не заезжал на склад с вторника, но его пропуск № 02 открыл боковой вход в 22:24.', resolved: false }
        ],
        pins: [],
        threads: [],
        memoryAnchors: {
          exact: 'Две нетронутые фарфоровые чашки на столе — Ларин хорошо знал вошедшего и сам впустил его в кабинет.',
          fuzzy: 'Сторож слышал звук запуска двигателя в переулке около 22:46.',
          sensory: 'Мокрый снег, температура −1°C, следы протектора у глухой стены.',
          era: 'Ноябрь, вечерняя смена порта',
          checkedArchives: ['Реестр юрлиц', 'Спутниковый снимок двора', 'Панорамы улицы 360°']
        },
        primeSuspectId: sId1
      }
    });
    GE.db.link(cRec.id, loc.id, 'место преступления');
    GE.db.link(cRec.id, vic.id, 'потерпевший');
    GE.db.link(cRec.id, sus1.id, 'главный подозреваемый');
    GE.db.link(cRec.id, sus2.id, 'проверенное алиби');
    GE.db.link(sus1.id, vic.id, 'долг и конфликт из-за ревизии');
    syncCaseRecord(cRec);
    GE.sfx && GE.sfx('phone');
    open(cRec.id);
    GE.toast('Учебное дело об убийстве развёрнуто!');
    return;
  }

  if (kind === 'demo_personal') {
    const existing = GE.db.byType('case').find(c => c.title && c.title.includes('Дом с красной калиткой'));
    if (existing) {
      state.tab = 'memory';
      open(existing.id);
      return;
    }
    const p1 = uid('sus'), p2 = uid('sus');
    const cRec = GE.db.add('case', {
      title: 'Дело № 07-П: Дом с красной калиткой у старой набережной (личное забытое дело)',
      case_no: GE.nextCaseNo(),
      case_type: 'Личное забытое дело',
      status: 'Расследуется',
      priority: 'Высокий',
      classif: 'Для служебного пользования',
      stage: 'Анализ и версии',
      difficulty: 'Средняя',
      odds: 'Высокие',
      period: 'Август 2009 года',
      region: 'Майский, ул. Набережная',
      briefing: 'Пример расследования личной забытой истории: восстановление точного адреса дома и мастерской родственника/друга семьи, где автор побывал один раз в детстве летом 2009 года. Сохранилась только одна бумажная фотография без подписи на обороте.',
      leads: [
        '- [x] Выделить на бумажном снимке неизменные ориентиры (изгиб реки/канала, опора ЛЭП, угол кирпичного дома)',
        '- [x] Отделить точные воспоминания от поздних домыслов во вкладке «Якоря памяти»',
        '- [ ] Пройти по улице Набережной в режиме «🚶 Улица 3D» и сличить номера домов',
        '- [ ] Проверить архивные снимки улицы за 2008–2012 годы на PastVu и в старых панорамах'
      ].join('\n'),
      hypothesis: '**Рабочая гипотеза:** искомый угловой дом с палисадником расположен в нечётном ряду улицы Набережной рядом с пешеходным переходом к воде.',
      tags: ['личное-дело', 'память', 'детство', 'реконструкция'],
      retrieved: today,
      detective: {
        mode: 'personal',
        victimOrSubject: 'Забытый адрес летней поездки 2009 года',
        timeWindowStart: '2009-08',
        timeWindowEnd: '2009-08',
        scenePlace: 'Майский, ул. Набережная, 141',
        sceneLat: 43.6237,
        sceneLon: 44.0723,
        sceneNotes: 'Частный сектор у воды, нечётная сторона улицы, широкая зелёная полоса вдоль дороги, длинная вечерняя тень на восток.',
        sceneMarkers: [
          { id: uid('sm'), kind: 'epicenter', lat: 43.6237, lon: 44.0723, label: 'Предполагаемый сектор поиска на ул. Набережной' },
          { id: uid('sm'), kind: 'clue', lat: 43.6242, lon: 44.0731, label: 'Поворот дороги и выход к береговой линии' }
        ],
        suspects: [
          { id: p1, name: 'Дядя Алексей (часовщик / радиолюбитель)', role: 'Человек из прошлого', alibi: 'Проживал у набережной до 2014 года', alibiStatus: 'confirmed', motive: false, means: true, opportunity: true, notes: 'На крыше его гаража стояла высокая радиоантенна — отличный визуальный ориентир на спутнике и панорамах!' },
          { id: p2, name: 'Сосед по улице (старожил)', role: 'Ключевой свидетель', alibi: 'Упоминался в старом семейном блокноте', alibiStatus: 'unverified', motive: false, means: false, opportunity: true, notes: 'Запись на полях: «Набережная, за поворотом после магазина».' }
        ],
        timeline: [
          { id: uid('tl'), time: '2009-08', kind: 'memory', text: 'Приезд с вокзала на маршрутке около 15 минут до улицы у воды', actor: 'Семья' },
          { id: uid('tl'), time: '18:40', kind: 'cam', text: 'Сделан единственный снимок у калитки: длинные тени падают строго вдоль забора (Солнце низко на западе)', actor: 'Фотоаппарат плёночный' },
          { id: uid('tl'), time: '2012', kind: 'fact', text: 'На спутниковом архиве видна замена шиферной крыши соседнего дома на металлочерепицу', actor: 'Спутник Esri Wayback' }
        ],
        evidence: [
          { id: uid('ev'), code: 'E-01', type: 'Запись камеры / Фото', title: 'Бумажный снимок 10×15 см: металлическая калитка и табличка с цифрой «14…»', weight: 'critical', suspectId: p1, notes: 'Последняя цифра закрыта веткой винограда — варианты домов: 141, 143, 145, 147.' },
          { id: uid('ev'), code: 'E-02', type: 'Личное воспоминание', title: 'Шум воды рядом и грунтовый спуск прямо напротив ворот', weight: 'strong', suspectId: p1, notes: 'Позволяет отсечь дома, удалённые от изгиба берега.' }
        ],
        contradictions: [
          { id: uid('con'), text: 'В памяти отложился двухэтажный дом, но на фото видно высокое чердачное окно одноэтажного дома с цоколем (типичное искажение детской памяти о масштабе!).', resolved: false }
        ],
        pins: [],
        threads: [],
        memoryAnchors: {
          exact: 'Красная металлическая калитка, виноград над входом, первые две цифры номера дома «14…», антенна во дворе.',
          fuzzy: 'Казалось, что дом двухэтажный, но по фото это высокий одноэтажный дом с мансардой.',
          sensory: 'Запах реки и спелых яблок, гравийная обочина, длинная закатная тень.',
          era: 'Август 2009 года, около 18:30–19:00',
          checkedArchives: ['PastVu', 'Спутник + 3D Дома']
        },
        primeSuspectId: p1
      }
    });
    syncCaseRecord(cRec);
    state.tab = 'scene3d';
    open(cRec.id);
    GE.toast('Открыт пример расследования личного забытого дела!');
    return;
  }

  if (kind === 'murder_blank') {
    const rec = GE.db.add('case', {
      title: 'Новое расследование: Убийство / Холодное дело',
      case_no: GE.nextCaseNo(),
      case_type: 'Убийство',
      status: 'Расследуется',
      priority: 'Высокий',
      classif: 'Конфиденциально',
      stage: 'Постановка задачи',
      difficulty: 'Высокая',
      odds: 'Средние',
      leads: [
        '- [ ] Установить точное временное окно события (последний достоверный контакт → обнаружение)',
        '- [ ] Нанести место события на карту двора (вкладка 5), расставить камеры и пути отхода, осмотреть в 3D',
        '- [ ] Внести всех фигурантов в матрицу Мотив · Средства · Возможность и проверить алиби каждого',
        '- [ ] Собрать поминутный таймлайн и выявить провалы во времени',
        '- [ ] Запустить вкладку 7 «Дедуктивный Разбор» для проверки нестыковок'
      ].join('\n'),
      questions: [
        '- Кому выгодно событие и что изменилось сразу после него?',
        '- Были ли следы подготовки или преступник действовал спонтанно?',
        '- Чьё алиби держится только на словах без независимого подтверждения?'
      ].join('\n'),
      tags: ['холодное-дело', 'криминалистика'],
      retrieved: today,
      detective: { mode: 'crime', victimOrSubject: '', timeWindowStart: '', timeWindowEnd: '', scenePlace: '', sceneLat: '', sceneLon: '', sceneNotes: '', sceneMarkers: [], suspects: [], timeline: [], evidence: [], contradictions: [], pins: [], threads: [], memoryAnchors: { exact: '', fuzzy: '', sensory: '', era: '', checkedArchives: [] }, primeSuspectId: '' }
    });
    open(rec.id);
    return;
  }

  if (kind === 'personal_forgotten') {
    const rec = GE.db.add('case', {
      title: 'Личное забытое дело: Реконструкция прошлого',
      case_no: GE.nextCaseNo(),
      case_type: 'Личное забытое дело',
      status: 'Сбор информации',
      priority: 'Обычный',
      classif: 'Для служебного пользования',
      stage: 'Сбор данных',
      difficulty: 'Средняя',
      odds: 'Высокие',
      briefing: 'Личное архивное расследование: восстановление забытого события, старого адреса, человека из прошлого, семейной истории, потерянной фотографии или старого цифрового следа.',
      leads: [
        '- [ ] Выписать во вкладке «Якоря памяти» всё, что помнится на 100%, отдельно от догадок',
        '- [ ] Привязать год/сезон к внешним событиям (погода, праздники, ремонт улицы, старые вывески)',
        '- [ ] Найти район на карте двора (вкладка 5) и пройти по улице в 3D-режиме',
        '- [ ] Проверить старые архивы (Wayback Machine, PastVu, газетные подшивки, старые форумы)',
        '- [ ] Соединить найденные зацепки на Доске Детектива'
      ].join('\n'),
      questions: [
        '- Какой точный год или время года соответствует деталям на фоне?',
        '- Какие ориентиры (школа, мост, река, номер автобуса, двор) сохранились до сегодняшнего дня?',
        '- У кого из знакомых или в каких открытых архивах могли остаться снимки или записи?'
      ].join('\n'),
      tags: ['личное-дело', 'память', 'реконструкция'],
      retrieved: today,
      detective: {
        mode: 'personal',
        victimOrSubject: 'Забытый эпизод / место / человек',
        timeWindowStart: '',
        timeWindowEnd: '',
        scenePlace: '',
        sceneLat: '',
        sceneLon: '',
        sceneNotes: '',
        sceneMarkers: [],
        suspects: [],
        timeline: [],
        evidence: [],
        contradictions: [],
        pins: [],
        threads: [],
        memoryAnchors: { exact: '', fuzzy: '', sensory: '', era: '', checkedArchives: [] },
        primeSuspectId: ''
      }
    });
    state.tab = 'memory';
    open(rec.id);
  }
}

/* ─────────── Стили Штаба Детектива v4.0 ─────────── */
function injectStyles() {
  if ($('#ge-cstudio-css')) return;
  const st = document.createElement('style');
  st.id = 'ge-cstudio-css';
  st.textContent = `
.cs-hub-banner{display:grid;gap:14px;padding:18px 20px;margin-bottom:16px;background:linear-gradient(135deg,rgba(139,0,0,.2),rgba(8,8,12,.97) 60%);border:1px solid rgba(226,35,46,.44);box-shadow:0 18px 46px rgba(0,0,0,.62);position:relative}
.cs-hub-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.cs-hub-kicker{font:600 10px/1 'JetBrains Mono',monospace;letter-spacing:.24em;color:#e2232e;text-transform:uppercase;margin-bottom:6px}
.cs-hub-title{font:600 19px/1.25 'Cinzel',Georgia,serif;color:#fff;letter-spacing:.06em}
.cs-hub-desc{font-size:12.5px;line-height:1.58;color:#b8b8c2;max-width:820px;margin-top:4px}
.cs-tpl-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:10px}
.cs-tpl-card{display:flex;flex-direction:column;gap:5px;padding:13px 14px;text-align:left;background:rgba(8,8,12,.94);border:1px solid rgba(205,205,218,.22);color:#e5e5eb;cursor:pointer;transition:border-color .2s,transform .18s,background .2s,box-shadow .2s}
.cs-tpl-card:hover{border-color:#e2232e;background:rgba(179,18,27,.16);transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.5)}
.cs-tpl-card.demo{border-color:rgba(226,35,46,.58);background:linear-gradient(180deg,rgba(179,18,27,.22),rgba(10,10,14,.95))}
.cs-tpl-card small{font:600 9.5px/1 'JetBrains Mono',monospace;letter-spacing:.16em;color:#e2232e;text-transform:uppercase}
.cs-tpl-card b{font:600 13.5px/1.3 'IBM Plex Sans',sans-serif;color:#fff}
.cs-tpl-card span{font-size:11.5px;line-height:1.45;color:#9d9da8}

.cstudio{position:fixed;inset:0;z-index:99500;display:none;flex-direction:column;background:#050508;color:#f3f3f5;font-family:'IBM Plex Sans',sans-serif;background-image:radial-gradient(rgba(205,205,218,.12) 1px,transparent 1px),linear-gradient(90deg,rgba(226,35,46,.045) 1px,transparent 1px),linear-gradient(0deg,rgba(226,35,46,.045) 1px,transparent 1px);background-size:24px 24px,120px 120px,120px 120px}
.cstudio.open{display:flex}
.cs-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 18px;background:rgba(7,7,10,.97);border-bottom:1px solid rgba(226,35,46,.38);flex-wrap:wrap}
.cs-head-l{display:flex;align-items:center;gap:12px;min-width:0}
.cs-stamp{padding:4px 9px;border:1px solid #e2232e;background:rgba(226,35,46,.18);color:#ff8a90;font:700 10px/1 'JetBrains Mono',monospace;letter-spacing:.18em;text-transform:uppercase;white-space:nowrap}
.cs-stamp.solved{border-color:#f3f3f5;background:rgba(255,255,255,.16);color:#fff}
.cs-h-title{font:600 16px/1.2 'IBM Plex Sans',sans-serif;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52vw}
.cs-h-sub{font:500 10.5px/1.2 'JetBrains Mono',monospace;color:#8b8b96;margin-top:3px}
.cs-tabs{display:flex;gap:3px;padding:0 16px;background:rgba(9,9,13,.96);border-bottom:1px solid rgba(205,205,218,.15);overflow-x:auto}
.cs-tabs button{padding:11px 13px;border:0;border-bottom:2px solid transparent;background:transparent;color:#9d9da8;font:500 12px/1 'IBM Plex Sans',sans-serif;cursor:pointer;white-space:nowrap;transition:color .18s,border-color .18s}
.cs-tabs button:hover{color:#fff}
.cs-tabs button.on{color:#fff;border-bottom-color:#e2232e;background:linear-gradient(0deg,rgba(226,35,46,.15),transparent)}
.cs-body{flex:1;overflow:auto;padding:18px;display:grid;gap:16px;align-content:start}
.cs-grid2{display:grid;grid-template-columns:1.18fr .82fr;gap:16px}
@media(max-width:980px){.cs-grid2{grid-template-columns:1fr}.cs-h-title{max-width:82vw}}
.cs-card{background:rgba(9,9,13,.94);border:1px solid rgba(205,205,218,.18);padding:14px 16px}
.cs-card h4{margin:0 0 10px;font:600 11px/1.2 'JetBrains Mono',monospace;letter-spacing:.18em;color:#e2232e;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}

.cs-board-wrap{position:relative;height:clamp(460px,66vh,740px);background:#060609;border:1px solid rgba(205,205,218,.24);overflow:hidden;background-image:radial-gradient(rgba(205,205,218,.18) 1px,transparent 1px),linear-gradient(90deg,rgba(226,35,46,.07) 1px,transparent 1px),linear-gradient(0deg,rgba(226,35,46,.07) 1px,transparent 1px);background-size:24px 24px,120px 120px,120px 120px}
.cs-board-svg{position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.cs-board-svg .th-hit{pointer-events:all;cursor:pointer}
.cs-pin{position:absolute;z-index:2;width:202px;padding:9px 11px;background:rgba(13,13,18,.96);border:1px solid rgba(205,205,218,.28);box-shadow:0 12px 28px rgba(0,0,0,.78);cursor:grab;user-select:none}
.cs-pin:active{cursor:grabbing}
.cs-pin::before{content:'';position:absolute;top:-5px;left:50%;width:9px;height:9px;margin-left:-4.5px;border-radius:50%;background:#e2232e;box-shadow:0 0 10px #e2232e}
.cs-pin.core{border-color:#e2232e;background:linear-gradient(180deg,rgba(139,0,0,.3),rgba(12,12,16,.97))}
.cs-pin.suspect{border-left:3px solid #e2232e}
.cs-pin.evidence{border-left:3px solid #f3f3f5}
.cs-pin.witness{border-left:3px solid #9d9da8}
.cs-pin.linking{outline:2px dashed #ff4b55;outline-offset:2px}
.cs-pin small{display:block;font:600 9px/1 'JetBrains Mono',monospace;letter-spacing:.14em;color:#e2232e;text-transform:uppercase;margin-bottom:4px}
.cs-pin b{display:block;font:600 12.5px/1.3 'IBM Plex Sans',sans-serif;color:#fff;word-break:break-word}
.cs-pin span{display:block;font-size:11px;color:#9d9da8;margin-top:3px;line-height:1.35}
.cs-pin-acts{display:flex;gap:4px;margin-top:7px}
.cs-pin-acts button{padding:2px 6px;font:500 9.5px/1.2 'JetBrains Mono',monospace;background:#14141b;border:1px solid rgba(205,205,218,.2);color:#cacad2;cursor:pointer}
.cs-pin-acts button:hover{border-color:#e2232e;color:#fff}
.cs-board-bar{position:absolute;z-index:4;top:10px;left:10px;right:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;pointer-events:none}
.cs-board-bar>*{pointer-events:auto}

.cs-sus-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px}
.cs-sus{background:rgba(12,12,17,.96);border:1px solid rgba(205,205,218,.2);padding:13px;display:grid;gap:8px;position:relative}
.cs-sus.prime{border-color:#e2232e;box-shadow:0 0 24px rgba(226,35,46,.2)}
.cs-meter{height:6px;background:#17171f;overflow:hidden;border:1px solid rgba(205,205,218,.14)}
.cs-meter>i{display:block;height:100%;background:linear-gradient(90deg,#7a0c13,#e2232e)}
.cs-mmo-pills{display:flex;gap:6px;flex-wrap:wrap}
.cs-mmo-pills label{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border:1px solid rgba(205,205,218,.2);font:500 11px/1 'JetBrains Mono',monospace;color:#cacad2;cursor:pointer}
.cs-mmo-pills input{accent-color:#e2232e}
.cs-alibi-tag{display:inline-block;padding:3px 7px;font:600 10px/1 'JetBrains Mono',monospace;border:1px solid rgba(205,205,218,.25)}
.cs-alibi-tag.broken{border-color:#e2232e;background:rgba(226,35,46,.22);color:#ff8a90}
.cs-alibi-tag.confirmed{border-color:rgba(243,243,245,.45);color:#fff;background:rgba(255,255,255,.08)}
.cs-alibi-tag.shaky{border-color:rgba(226,35,46,.45);color:#e5e5eb}

.cs-tl-row{display:grid;grid-template-columns:96px 1fr auto;gap:10px;align-items:start;padding:9px 11px;border-left:2px solid #cacad2;background:rgba(13,13,18,.92);margin-bottom:7px}
.cs-tl-row.crime{border-left-color:#e2232e;background:rgba(139,0,0,.16)}
.cs-tl-row.witness{border-left-style:dashed;border-left-color:#9d9da8}
.cs-gap-warn{padding:6px 10px;margin:2px 0 8px 18px;border:1px dashed rgba(226,35,46,.55);background:rgba(226,35,46,.12);color:#ff9ca1;font:500 11px/1.35 'JetBrains Mono',monospace}

.cs-scene-map{height:380px;width:100%;border:1px solid rgba(226,35,46,.38);background:#08080c;margin-top:8px}
.cs-sm-pin{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:#0a0a0e;border:2px solid #e2232e;color:#fff;font-size:13px;box-shadow:0 0 12px rgba(226,35,46,.7)}
.cs-deduce-kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}
.cs-kpi-box{padding:12px 14px;background:#0c0c11;border:1px solid rgba(205,205,218,.16)}
.cs-kpi-box b{display:block;font:600 24px/1.1 'Cinzel',serif;color:#fff;margin-top:4px}
.cs-kpi-box span{font:600 9.5px/1.2 'JetBrains Mono',monospace;color:#8b8b96;letter-spacing:.14em;text-transform:uppercase}
`;
  document.head.appendChild(st);
}

/* ─────────── Баннер в разделе «Дела» ─────────── */
function renderCasesHubBanner() {
  const sec = $('.view[data-entity="case"]');
  if (!sec) return;
  const ex = sec.querySelector('.ent-extra');
  if (!ex) return;
  const allCases = window.GE ? GE.db.byType('case') : [];
  const statsHtml = allCases.length && GE.caseStats ? `<div class="live-hud case-stats" style="margin-top:4px">${GE.caseStats()}</div>` : '';
  ex.innerHTML = `
    <div class="cs-hub-banner">
      <div class="cs-hub-top">
        <div>
          <div class="cs-hub-kicker">ДЕТЕКТИВНЫЙ ШТАБ v4.0 · КРИМИНАЛИСТИКА · ХОЛОДНЫЕ И ЛИЧНЫЕ ЗАБЫТЫЕ ДЕЛА</div>
          <div class="cs-hub-title">Полноэкранная студия расследований</div>
          <div class="cs-hub-desc">Раскрывайте сложные преступления, «холодные дела» и свои личные забытые истории из прошлого: стена улик с красными нитями и экспортом в PNG, матрица алиби «Мотив · Средства · Возможность», поминутный таймлайн, интерактивная карта двора с камерами, прогулка по 3D-улице и автоматический Дедуктивный Анализатор.</div>
        </div>
        ${allCases.length ? `<button type="button" class="btn btn-primary" data-cs-open="${esc(allCases[0].id)}">🕵️ Открыть последнее дело в Штабе</button>` : ''}
      </div>
      <div class="cs-tpl-row">
        <button type="button" class="cs-tpl-card demo" data-cs-tpl="demo_murder">
          <small>★ Демо 1 · Убийство (Cold Case)</small>
          <b>Дело № 14-К: Старый Причал</b>
          <span>4 фигуранта, сломанное алиби на АЗС, лог магнитного ключа № 02, карта двора с камерами и реальная 3D-улица.</span>
        </button>
        <button type="button" class="cs-tpl-card demo" data-cs-tpl="demo_personal">
          <small>★ Демо 2 · Личное забытое дело</small>
          <b>Дело № 07-П: Дом с красной калиткой</b>
          <span>Образец того, как по одному старому фото и обрывкам детской памяти найти точный дом и улицу спустя 15 лет.</span>
        </button>
        <button type="button" class="cs-tpl-card" data-cs-tpl="murder_blank">
          <small>Чистый бланк · Криминалистика</small>
          <b>Новое расследование преступления</b>
          <span>Окно события, подозреваемые и алиби, сейф улик, схема места происшествия и дедуктивный разбор.</span>
        </button>
        <button type="button" class="cs-tpl-card" data-cs-tpl="personal_forgotten">
          <small>Чистый бланк · Память и Архив</small>
          <b>Новое личное забытое дело</b>
          <span>Восстановление забытого адреса, человека из прошлого, семейной тайны или потерянного снимка.</span>
        </button>
      </div>
      ${statsHtml}
    </div>`;

  sec.querySelectorAll('[data-id]').forEach(row => {
    const id = row.dataset.id;
    if (!id || row.querySelector('[data-cs-open]')) return;
    const targetCell = row.querySelector('.card-foot') || row.querySelector('td:last-child');
    if (targetCell) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-primary';
      btn.dataset.csOpen = id;
      btn.style.marginLeft = '6px';
      btn.textContent = '🕵️ Штаб';
      targetCell.appendChild(btn);
    }
  });
}

function ensureModal() {
  injectStyles();
  let el = $('#ge-cstudio');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'ge-cstudio';
  el.className = 'cstudio';
  document.body.appendChild(el);
  return el;
}

function parseMinutes(str) {
  const m = String(str || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return (+m[1]) * 60 + (+m[2]);
}

function destroySceneMap() {
  if (state.sceneMap) {
    try { state.sceneMap.remove(); } catch (_) {}
    state.sceneMap = null;
  }
}

/* ─────────── Автоматический Дедуктивный Анализатор Следователя ─────────── */
function buildDeductionAnalysis(rec, d, ranked) {
  const checks = [
    Boolean(d.scenePlace || (d.sceneLat !== '' && d.sceneLon !== '')),
    Boolean(d.timeWindowStart || rec.period),
    d.suspects.length >= 2,
    d.suspects.some(s => s.alibiStatus !== 'unverified'),
    d.timeline.length >= 3,
    d.evidence.length >= 2,
    Boolean(rec.hypothesis || rec.conclusion)
  ];
  const readiness = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const brokenAlibis = d.suspects.filter(s => s.alibiStatus === 'broken');
  const unverifiedSus = d.suspects.filter(s => !/жертв|потерпев/i.test(s.role) && (s.alibiStatus === 'unverified' || s.alibiStatus === 'shaky'));
  const openCons = d.contradictions.filter(c => !c.resolved);

  const sortedTl = d.timeline.slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const gaps = [];
  let prevM = null, prevT = '';
  sortedTl.forEach(item => {
    const cm = parseMinutes(item.time);
    if (prevM !== null && cm !== null && cm - prevM >= 25) {
      gaps.push({ from: prevT, to: item.time, mins: cm - prevM });
    }
    if (cm !== null) { prevM = cm; prevT = item.time; }
  });

  const nextSteps = [];
  if (!d.sceneLat || !d.sceneLon) nextSteps.push('Привяжите точный адрес и дом во вкладке «5. Карта двора и 3D-улица», чтобы проверить слепые зоны камер и пути отхода.');
  if (unverifiedSus.length) nextSteps.push(`Проверьте независимыми источниками (камеры, чеки, биллинг, свидетели) алиби фигурантов: ${unverifiedSus.map(s => s.name).join(', ')}.`);
  if (brokenAlibis.length) nextSteps.push(`Сфокусируйте перекрёстную проверку на ${brokenAlibis.map(s => s.name).join(', ')} — заявленное алиби уже опровергнуто объективными уликами!`);
  if (gaps.length) nextSteps.push(`Заполните хронологический провал (${gaps[0].from} → ${gaps[0].to}, ${gaps[0].mins} мин): запросите записи камер и историю контактов за этот интервал.`);
  if (openCons.length) nextSteps.push(`Устраните ${openCons.length} неразрешённых противоречий во вкладке «4. Сейф улик и Нестыковки».`);
  if (!d.sceneMarkers.length && d.sceneLat !== '') nextSteps.push('Расставьте на схеме двора (вкладка 5) точки камер наблюдения и маршруты подхода/отхода.');
  if (!nextSteps.length) nextSteps.push('Доказательная база полна и непротиворечива — можно переходить во вкладку «6. Якоря памяти и Развязка» и ставить штамп «ДЕЛО РАСКРЫТО».');

  const top = ranked[0];
  let summaryText = '';
  if (top) {
    const reasons = [];
    if (top.s.motive) reasons.push('установлен прямой мотив');
    if (top.s.means) reasons.push('имелись средства/инструмент');
    if (top.s.opportunity) reasons.push('имел физический доступ в окно события');
    if (top.s.alibiStatus === 'broken') reasons.push('заявленное алиби опровергнуто фактами');
    const evCnt = d.evidence.filter(e => e.suspectId === top.s.id).length;
    if (evCnt) reasons.push(`привязано улик: ${evCnt}`);
    summaryText = `По совокупности признаков криминалистической матрицы приоритетная фигура — ${top.s.name} (индекс ${top.sc}%): ${reasons.join(', ') || 'требуется дополнительная проверка'}.`;
  } else {
    summaryText = 'Подозреваемые или ключевые лица ещё не внесены в матрицу (вкладка 2).';
  }

  return { readiness, brokenAlibis, unverifiedSus, openCons, gaps, nextSteps, summaryText };
}

function renderSvgThreads(d) {
  const pinMap = new Map(d.pins.map(p => [p.id, p]));
  return d.threads.map(th => {
    const a = pinMap.get(th.from), b = pinMap.get(th.to);
    if (!a || !b) return '';
    const x1 = a.x + 101, y1 = a.y + 4, x2 = b.x + 101, y2 = b.y + 4;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const lbl = th.label || 'связь';
    return `<g class="th-hit" data-th-id="${esc(th.id)}">
      <title>Нажмите, чтобы изменить подпись или убрать красную нить</title>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#e2232e" stroke-width="2.2" stroke-opacity="0.88"/>
      <rect x="${mx - 46}" y="${my - 9}" width="92" height="18" rx="2" fill="rgba(6,6,9,0.92)" stroke="rgba(226,35,46,0.55)"/>
      <text x="${mx}" y="${my + 3}" fill="#ff9ca1" font-size="9.5" font-family="JetBrains Mono,monospace" text-anchor="middle">${esc(lbl.slice(0, 15))}</text>
    </g>`;
  }).join('');
}

function exportBoardPng(rec, d) {
  const W = 1600, H = 960;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#050508';
  g.fillRect(0, 0, W, H);

  // Сетка Obsidian / OSINT
  g.strokeStyle = 'rgba(226,35,46,0.08)';
  g.lineWidth = 1;
  for (let x = 0; x < W; x += 120) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 120) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.fillStyle = 'rgba(205,205,218,0.16)';
  for (let x = 24; x < W; x += 24) for (let y = 24; y < H; y += 24) g.fillRect(x, y, 1.2, 1.2);

  // Заголовок плаката
  g.fillStyle = '#0b0b10';
  g.fillRect(0, 0, W, 64);
  g.strokeStyle = '#e2232e';
  g.beginPath(); g.moveTo(0, 64); g.lineTo(W, 64); g.stroke();
  g.fillStyle = '#e2232e';
  g.font = '700 13px "JetBrains Mono",monospace';
  g.fillText('GOD EYE v4.0 · СТЕНА УЛИК И КРАСНЫХ НИТЕЙ', 24, 26);
  g.fillStyle = '#ffffff';
  g.font = '600 18px "IBM Plex Sans",sans-serif';
  g.fillText(`${rec.case_no ? rec.case_no + ' · ' : ''}${rec.title}`, 24, 50);

  const scaleX = 1.45, scaleY = 1.35, offY = 70;
  const pinMap = new Map(d.pins.map(p => [p.id, p]));

  // Красные нити
  d.threads.forEach(th => {
    const a = pinMap.get(th.from), b = pinMap.get(th.to);
    if (!a || !b) return;
    const x1 = a.x * scaleX + 115, y1 = a.y * scaleY + offY;
    const x2 = b.x * scaleX + 115, y2 = b.y * scaleY + offY;
    g.strokeStyle = '#e2232e'; g.lineWidth = 2.6;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    if (th.label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      g.fillStyle = '#08080c'; g.fillRect(mx - 54, my - 11, 108, 22);
      g.strokeStyle = 'rgba(226,35,46,0.65)'; g.lineWidth = 1; g.strokeRect(mx - 54, my - 11, 108, 22);
      g.fillStyle = '#ff9ca1'; g.font = '600 11px "JetBrains Mono",monospace'; g.textAlign = 'center';
      g.fillText(th.label.slice(0, 16), mx, my + 4); g.textAlign = 'left';
    }
  });

  // Карточки
  d.pins.forEach(p => {
    const x = p.x * scaleX, y = p.y * scaleY + offY, w = 230, h = 84;
    g.fillStyle = '#0e0e14'; g.fillRect(x, y, w, h);
    g.strokeStyle = p.kind === 'core' || p.kind === 'suspect' ? '#e2232e' : '#cacad2';
    g.lineWidth = p.kind === 'core' ? 2.2 : 1.3;
    g.strokeRect(x, y, w, h);
    g.fillStyle = '#e2232e'; g.beginPath(); g.arc(x + w / 2, y, 5.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2232e'; g.font = '700 10px "JetBrains Mono",monospace';
    g.fillText((p.kind || 'ФАКТ').toUpperCase(), x + 10, y + 18);
    g.fillStyle = '#ffffff'; g.font = '600 13px "IBM Plex Sans",sans-serif';
    g.fillText(String(p.title || '').slice(0, 28), x + 10, y + 40);
    if (p.sub) {
      g.fillStyle = '#9d9da8'; g.font = '400 11px "IBM Plex Sans",sans-serif';
      g.fillText(String(p.sub).slice(0, 34), x + 10, y + 62);
    }
  });

  cv.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GODEYE_BOARD_${rec.case_no || 'CASE'}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    GE.toast && GE.toast('Стена улик сохранена в PNG!', { type: 'ok' });
  }, 'image/png');
}

/* ─────────── Рендер Штаба Детектива ─────────── */
function renderStudio() {
  destroySceneMap();
  const el = ensureModal();
  el.style.display = state.open ? 'flex' : 'none';
  el.classList.toggle('open', state.open);
  if (!state.open || !state.caseId || !window.GE) return;
  const rec = GE.db.get(state.caseId);
  if (!rec) { close(); return; }
  const d = ensureDetData(rec);
  const solved = rec.status === 'Раскрыто';

  const ranked = d.suspects
    .filter(s => !/жертв|потерпев/i.test(s.role))
    .map(s => ({ s, sc: calcSuspectScore(s, d) }))
    .sort((a, b) => b.sc - a.sc);
  const topSus = ranked[0];

  el.innerHTML = `
    <div class="cs-head">
      <div class="cs-head-l">
        <span class="cs-stamp ${solved ? 'solved' : ''}">${esc(GE.caseStamp ? GE.caseStamp(rec) : 'ДЕЛО')}</span>
        <div style="min-width:0">
          <div class="cs-h-title">${esc(rec.case_no ? rec.case_no + ' · ' : '')}${esc(rec.title)}</div>
          <div class="cs-h-sub">Фигурантов: ${d.suspects.length} · Улик: ${d.evidence.length} · Событий: ${d.timeline.length} · Нестыковок: ${d.contradictions.filter(x => !x.resolved).length}${topSus ? ` · Лидер версий: ${esc(topSus.s.name)} (${topSus.sc}%)` : ''}</div>
        </div>
      </div>
      <div class="row" style="gap:6px">
        <button type="button" class="btn btn-sm" id="cs-to-graph">Граф связей</button>
        <button type="button" class="btn btn-sm" id="cs-edit-raw">Поля досье</button>
        <button type="button" class="btn btn-sm" id="cs-export-md">В Obsidian (.md)</button>
        <button type="button" class="btn btn-sm btn-primary" id="cs-close">Закрыть Штаб ✕</button>
      </div>
    </div>
    <div class="cs-tabs">
      <button type="button" data-cstab="board" class="${state.tab === 'board' ? 'on' : ''}">1. Доска улик (Красные нити)</button>
      <button type="button" data-cstab="suspects" class="${state.tab === 'suspects' ? 'on' : ''}">2. Подозреваемые и Алиби (${d.suspects.length})</button>
      <button type="button" data-cstab="timeline" class="${state.tab === 'timeline' ? 'on' : ''}">3. Поминутный Таймлайн (${d.timeline.length})</button>
      <button type="button" data-cstab="evidence" class="${state.tab === 'evidence' ? 'on' : ''}">4. Сейф улик и Ложь (${d.evidence.length})</button>
      <button type="button" data-cstab="scene3d" class="${state.tab === 'scene3d' ? 'on' : ''}">5. Карта двора и 3D-улица</button>
      <button type="button" data-cstab="memory" class="${state.tab === 'memory' ? 'on' : ''}">6. Якоря памяти и Развязка</button>
      <button type="button" data-cstab="deduce" class="${state.tab === 'deduce' ? 'on' : ''}">7. ★ Дедуктивный Разбор</button>
    </div>
    <div class="cs-body" id="cs-body">
      ${renderTabContent(rec, d, ranked)}
    </div>`;

  wireStudioEvents(el, rec, d, ranked);
}

function renderTabContent(rec, d, ranked) {
  if (state.tab === 'board') {
    return `
      <div class="cs-board-wrap" id="cs-board">
        <div class="cs-board-bar">
          <button type="button" class="btn btn-sm btn-primary" id="cs-add-pin">+ Карточка на стену</button>
          <button type="button" class="btn btn-sm" id="cs-rebuild-pins">Собрать из дела</button>
          <button type="button" class="btn btn-sm" id="cs-ring-pins">◎ Разложить по кругу</button>
          <button type="button" class="btn btn-sm" id="cs-png-pins">📷 Скачать PNG доски</button>
          <span class="badge" style="background:rgba(8,8,12,.92)">${state.linkFrom ? 'Кликните «🧶 Нить» на второй карточке…' : 'Перетаскивайте карточки · клик по подписи красной нити меняет или удаляет её'}</span>
        </div>
        <svg class="cs-board-svg" id="cs-board-svg">${renderSvgThreads(d)}</svg>
        ${d.pins.map(p => `
          <div class="cs-pin ${esc(p.kind || '')} ${state.linkFrom === p.id ? 'linking' : ''}" data-pin="${esc(p.id)}" style="left:${p.x}px;top:${p.y}px">
            <small>${esc({ core: 'ЦЕНТР ДЕЛА', suspect: 'ПОДОЗРЕВАЕМЫЙ', victim: 'ПОТЕРПЕВШИЙ', witness: 'СВИДЕТЕЛЬ', evidence: 'УЛИКА', note: 'ВЕРСИЯ / ФАКТ' }[p.kind] || 'ЗАЦЕПКА')}</small>
            <b>${esc(p.title)}</b>
            ${p.sub ? `<span>${esc(p.sub)}</span>` : ''}
            <div class="cs-pin-acts">
              <button type="button" data-pin-link="${esc(p.id)}">🧶 Нить</button>
              <button type="button" data-pin-edit="${esc(p.id)}" title="Редактировать карточку">✎</button>
              <button type="button" data-pin-del="${esc(p.id)}" title="Убрать со стены">✕</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="cs-grid2">
        <div class="cs-card">
          <h4>Фабула расследования</h4>
          <textarea class="textarea" id="cs-briefing" style="min-height:110px" placeholder="Опишите суть преступления, пропажи или забытого события из прошлого…">${esc(rec.briefing || '')}</textarea>
        </div>
        <div class="cs-card">
          <h4>Дедуктивный рейтинг подозреваемых <button type="button" class="btn btn-sm" data-goto-tab="deduce">Полный разбор →</button></h4>
          ${ranked.length ? ranked.slice(0, 4).map(({ s, sc }) => `
            <div style="margin-bottom:9px">
              <div class="row" style="justify-content:space-between;font-size:12.5px;margin-bottom:3px">
                <b>${esc(s.name)}</b>
                <span class="mono" style="color:${sc >= 65 ? '#ff7b82' : '#cacad2'}">${sc}% индекс улик</span>
              </div>
              <div class="cs-meter"><i style="width:${sc}%"></i></div>
            </div>`).join('') : '<div class="muted" style="font-size:12.5px">Добавьте фигурантов во вкладке «2. Подозреваемые и Алиби».</div>'}
        </div>
      </div>`;
  }

  if (state.tab === 'suspects') {
    return `
      <div class="cs-card">
        <h4>Добавить фигуранта / подозреваемого / человека из прошлого</h4>
        <div class="form-grid g6">
          <label class="field sp2"><span>Имя / прозвище / описание</span><input class="input" id="ns-name" placeholder="например: Громов Илья Сергеевич"></label>
          <label class="field sp2"><span>Роль в деле</span><select class="select" id="ns-role">${ROLES.map(r => `<option>${esc(r)}</option>`).join('')}</select></label>
          <label class="field sp2"><span>Проверка алиби</span><select class="select" id="ns-alst">${ALIBI_ST.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
          <label class="field sp3"><span>Заявленное алиби (где был в момент события)</span><input class="input" id="ns-alibi" placeholder="например: Заявлял, что был на АЗС в 22:30…"></label>
          <label class="field sp3"><span>Зацепки, мотив, связь с местом или жертвой</span><input class="input" id="ns-notes" placeholder="Долг, конфликт, ключ от входа, старое знакомство…"></label>
        </div>
        <div class="row" style="margin-top:10px;justify-content:space-between">
          <div class="cs-mmo-pills">
            <label><input type="checkbox" id="ns-m"> Мотив</label>
            <label><input type="checkbox" id="ns-me"> Средства</label>
            <label><input type="checkbox" id="ns-op"> Возможность (был рядом)</label>
          </div>
          <button type="button" class="btn btn-primary" id="ns-add">+ Внести фигуранта в дело</button>
        </div>
      </div>
      <div class="cs-sus-list">
        ${d.suspects.length ? d.suspects.map(s => {
          const sc = calcSuspectScore(s, d);
          const alLabel = (ALIBI_ST.find(x => x[0] === s.alibiStatus) || ALIBI_ST[0])[1];
          return `
            <div class="cs-sus ${sc >= 65 ? 'prime' : ''}" data-sid="${esc(s.id)}">
              <div class="row" style="justify-content:space-between;align-items:flex-start">
                <div>
                  <div style="font:600 9.5px 'JetBrains Mono',monospace;color:#e2232e;text-transform:uppercase">${esc(s.role)}</div>
                  <div style="font:600 15px/1.25 'IBM Plex Sans',sans-serif;color:#fff;margin-top:2px">${esc(s.name)}</div>
                </div>
                <button type="button" class="btn btn-sm btn-ghost" data-del-sus="${esc(s.id)}" title="Удалить">✕</button>
              </div>
              ${!/жертв|потерпев/i.test(s.role) ? `
                <div>
                  <div class="row" style="justify-content:space-between;font:500 10.5px 'JetBrains Mono',monospace;color:#cacad2;margin-bottom:3px"><span>Индекс подозрения (МСВ + Алиби + Улики)</span><b>${sc}%</b></div>
                  <div class="cs-meter"><i style="width:${sc}%"></i></div>
                </div>
                <div class="cs-mmo-pills">
                  <label><input type="checkbox" data-sus-chk="motive" ${s.motive ? 'checked' : ''}> Мотив</label>
                  <label><input type="checkbox" data-sus-chk="means" ${s.means ? 'checked' : ''}> Средства</label>
                  <label><input type="checkbox" data-sus-chk="opportunity" ${s.opportunity ? 'checked' : ''}> Возможность</label>
                </div>` : ''}
              <div>
                <span class="cs-alibi-tag ${esc(s.alibiStatus)}">${esc(alLabel)}</span>
                <select class="select" data-sus-alst style="margin-top:6px;min-height:28px;font-size:11.5px">${ALIBI_ST.map(([k, l]) => `<option value="${k}" ${s.alibiStatus === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
              </div>
              ${s.alibi ? `<div style="font-size:12px;color:#e5e5eb"><b>Алиби:</b> ${esc(s.alibi)}</div>` : ''}
              ${s.notes ? `<div style="font-size:12px;color:#9d9da8">${esc(s.notes)}</div>` : ''}
            </div>`;
        }).join('') : '<div class="muted">Фигурантов пока нет — добавьте подозреваемых, потерпевшего и свидетелей выше.</div>'}
      </div>`;
  }

  if (state.tab === 'timeline') {
    const sorted = d.timeline.slice().sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    let prevMin = null;
    const rowsHtml = sorted.map(item => {
      const curMin = parseMinutes(item.time);
      let gapHtml = '';
      if (prevMin !== null && curMin !== null && curMin - prevMin >= 25) {
        gapHtml = `<div class="cs-gap-warn">⚠ ПРОВАЛ ВО ВРЕМЕНИ: ${curMin - prevMin} мин без подтверждённых событий — проверьте камеры, звонки и перемещения фигурантов!</div>`;
      }
      if (curMin !== null) prevMin = curMin;
      const kLabel = (TL_KINDS.find(k => k[0] === item.kind) || TL_KINDS[0])[1];
      return `${gapHtml}
        <div class="cs-tl-row ${esc(item.kind)}">
          <div class="mono" style="font-weight:600;color:#fff;font-size:12.5px">${esc(item.time || '—')}</div>
          <div>
            <div style="font:600 9.5px 'JetBrains Mono',monospace;color:#e2232e;text-transform:uppercase">${esc(kLabel)}${item.actor ? ' · ' + esc(item.actor) : ''}</div>
            <div style="font-size:13px;color:#f3f3f5;margin-top:2px">${esc(item.text)}</div>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" data-del-tl="${esc(item.id)}">✕</button>
        </div>`;
    }).join('');

    return `
      <div class="cs-card">
        <h4>Окно преступления / ключевого события и добавление шага по минутам</h4>
        <div class="form-grid g6" style="margin-bottom:10px">
          <label class="field sp2"><span>Начало окна события</span><input class="input mono" id="tl-win-a" value="${esc(d.timeWindowStart || '')}" placeholder="например: 22:20"></label>
          <label class="field sp2"><span>Конец окна события</span><input class="input mono" id="tl-win-b" value="${esc(d.timeWindowEnd || '')}" placeholder="например: 22:50"></label>
          <label class="field sp2"><span>Потерпевший / Предмет поиска</span><input class="input" id="tl-subj" value="${esc(d.victimOrSubject || '')}" placeholder="Кого или что исследуем"></label>
        </div>
        <hr style="border:0;border-top:1px solid rgba(205,205,218,.14);margin:12px 0">
        <div class="form-grid g6">
          <label class="field sp1"><span>Время / дата</span><input class="input mono" id="nt-time" placeholder="22:35"></label>
          <label class="field sp2"><span>Тип фиксации</span><select class="select" id="nt-kind">${TL_KINDS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
          <label class="field sp1"><span>Участник</span><input class="input" id="nt-actor" placeholder="Громов И."></label>
          <label class="field sp2"><span>Что произошло</span><input class="input" id="nt-text" placeholder="Вход через калитку, звонок, чек…"></label>
        </div>
        <div class="row" style="margin-top:10px;justify-content:flex-end">
          <button type="button" class="btn btn-primary" id="nt-add">+ Добавить в хронологию</button>
        </div>
      </div>
      <div class="cs-card">
        <h4>Хронологическая лента и детектор провалов времени</h4>
        ${rowsHtml || '<div class="muted">Хронология пуста. Вносите события с точностью до минут — система сама подсветит подозрительные паузы.</div>'}
      </div>`;
  }

  if (state.tab === 'evidence') {
    return `
      <div class="cs-grid2">
        <div class="cs-card">
          <h4>Сейф улик, документов и зацепок</h4>
          <div class="form-grid g6" style="margin-bottom:10px">
            <label class="field sp2"><span>Тип улики</span><select class="select" id="ne-type">${EV_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}</select></label>
            <label class="field sp2"><span>Указывает на фигуранта</span><select class="select" id="ne-sus"><option value="">— ни на кого / общая —</option>${d.suspects.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></label>
            <label class="field sp2"><span>Вес улики</span><select class="select" id="ne-w"><option value="critical">Прямая / Ключевая</option><option value="strong">Косвенная сильная</option><option value="medium">Зацепка для проверки</option></select></label>
            <label class="field sp6"><span>Описание улики</span><input class="input" id="ne-title" placeholder="например: Лог магнитного ключа № 02 на боковой двери в 22:24"></label>
            <label class="field sp6"><span>Примечание / источник / как проверено</span><input class="input" id="ne-notes" placeholder="Сверено с камерой, архивом или фото…"></label>
          </div>
          <button type="button" class="btn btn-primary" id="ne-add">+ Зарегистрировать улику</button>
          <div style="margin-top:14px;display:grid;gap:8px">
            ${d.evidence.map(e => {
              const sus = d.suspects.find(s => s.id === e.suspectId);
              return `<div style="padding:10px 12px;border:1px solid rgba(205,205,218,.18);background:#0c0c11;display:flex;justify-content:space-between;gap:10px">
                <div>
                  <div class="mono" style="font-size:10.5px;color:#e2232e"><b>${esc(e.code)}</b> · ${esc(e.type)}${sus ? ' · против: ' + esc(sus.name) : ''}</div>
                  <div style="font-size:13px;color:#fff;margin-top:2px"><b>${esc(e.title)}</b></div>
                  ${e.notes ? `<div style="font-size:11.5px;color:#9d9da8;margin-top:2px">${esc(e.notes)}</div>` : ''}
                </div>
                <button type="button" class="btn btn-sm btn-ghost" data-del-ev="${esc(e.id)}">✕</button>
              </div>`;
            }).join('') || '<div class="muted" style="font-size:12.5px">Улик пока нет.</div>'}
          </div>
        </div>
        <div class="cs-card">
          <h4>Выявленные противоречия и ложь в показаниях</h4>
          <div class="row" style="margin-bottom:10px">
            <input class="input" id="nc-text" placeholder="В чём именно расходятся слова и факты…" style="flex:1">
            <button type="button" class="btn btn-primary" id="nc-add">+ Записать</button>
          </div>
          <div style="display:grid;gap:8px">
            ${d.contradictions.map(c => `
              <div style="padding:10px;border-left:3px solid ${c.resolved ? '#8b8b96' : '#e2232e'};background:#0c0c11;display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
                <label style="display:flex;gap:8px;font-size:12.5px;color:${c.resolved ? '#8b8b96' : '#f3f3f5'};cursor:pointer">
                  <input type="checkbox" data-con-chk="${esc(c.id)}" ${c.resolved ? 'checked' : ''} style="accent-color:#e2232e;margin-top:3px">
                  <span>${esc(c.text)}</span>
                </label>
                <button type="button" class="btn btn-sm btn-ghost" data-del-con="${esc(c.id)}">✕</button>
              </div>`).join('') || '<div class="muted" style="font-size:12.5px">Записывайте сюда расхождения между словами свидетелей, чеками и реальной географией места.</div>'}
          </div>
        </div>
      </div>`;
  }

  if (state.tab === 'scene3d') {
    const hasCoords = d.sceneLat !== '' && d.sceneLon !== '' && Number.isFinite(+d.sceneLat) && Number.isFinite(+d.sceneLon);
    return `
      <div class="cs-grid2">
        <div class="cs-card">
          <h4>Интерактивная схема двора и места происшествия
            <span class="row" style="gap:4px">
              <button type="button" class="btn btn-sm ${state.sceneMapBase === 'voyager' ? 'btn-primary' : ''}" data-sm-base="voyager">Дворы и Дома</button>
              <button type="button" class="btn btn-sm ${state.sceneMapBase === 'sat' ? 'btn-primary' : ''}" data-sm-base="sat">Спутник</button>
            </span>
          </h4>
          <div class="row" style="gap:5px;flex-wrap:wrap;margin-bottom:6px">
            ${Object.entries(SCENE_PIN_KINDS).map(([k, v]) => `<button type="button" class="btn btn-sm ${state.scenePinMode === k ? 'btn-primary' : ''}" data-smpin="${k}">${v.glyph} ${esc(v.label)}</button>`).join('')}
            <button type="button" class="btn btn-sm" id="sc-clr-pins">Очистить метки (${d.sceneMarkers.length})</button>
          </div>
          <div class="muted" style="font-size:11.5px">Выберите тип метки выше и кликните прямо по дому, подъезду, камере или переулку на карте двора:</div>
          <div id="cs-scene-map" class="cs-scene-map"></div>
        </div>

        <div class="cs-card">
          <h4>Точный адрес, заметки осмотра и 3D-улица</h4>
          <div class="form-grid g6">
            <label class="field sp6"><span>Город, улица, номер дома (например: Майский Набережная 141)</span>
              <div class="row"><input class="input" id="sc-place" value="${esc(d.scenePlace || '')}" placeholder="Город, улица, дом…" style="flex:1"><button type="button" class="btn btn-primary" id="sc-geocode">Найти дом</button></div>
            </label>
            <label class="field sp3"><span>Широта (Lat)</span><input class="input mono" id="sc-lat" value="${esc(d.sceneLat)}" placeholder="59.90742"></label>
            <label class="field sp3"><span>Долгота (Lon)</span><input class="input mono" id="sc-lon" value="${esc(d.sceneLon)}" placeholder="30.27815"></label>
            <label class="field sp6"><span>Заметки осмотра двора, подъездов, камер и путей отхода</span>
              <textarea class="textarea" id="sc-notes" style="min-height:92px" placeholder="Где расположены арки, проходные дворы, фонари, окна свидетелей…">${esc(d.sceneNotes || '')}</textarea>
            </label>
          </div>
          <div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn" id="sc-save">Сохранить описание</button>
            <button type="button" class="btn btn-primary" id="sc-open-3d" ${hasCoords ? '' : 'disabled'}>🚶 Осмотреть улицу и дома в 3D</button>
            <button type="button" class="btn" id="sc-open-2d" ${hasCoords ? '' : 'disabled'}>В большой Гео-центр 2D</button>
          </div>
          ${hasCoords ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:12px">
              <a class="btn btn-sm" href="https://yandex.ru/maps/?ll=${(+d.sceneLon).toFixed(6)},${(+d.sceneLat).toFixed(6)}&z=19&l=stv,sta&panorama%5Bpoint%5D=${(+d.sceneLon).toFixed(6)},${(+d.sceneLat).toFixed(6)}" target="_blank" rel="noopener noreferrer">Яндекс.Панорамы 360°</a>
              <a class="btn btn-sm" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${(+d.sceneLat).toFixed(6)},${(+d.sceneLon).toFixed(6)}" target="_blank" rel="noopener noreferrer">Street View 360°</a>
              <a class="btn btn-sm" href="https://pastvu.com/?g=${(+d.sceneLat).toFixed(5)},${(+d.sceneLon).toFixed(5)}&z=17" target="_blank" rel="noopener noreferrer">PastVu Ретро-фото</a>
              <a class="btn btn-sm" href="https://shademap.app/@${(+d.sceneLat).toFixed(5)},${(+d.sceneLon).toFixed(5)},17z" target="_blank" rel="noopener noreferrer">ShadeMap 3D-тени</a>
            </div>` : ''}
        </div>
      </div>`;
  }

  if (state.tab === 'deduce') {
    const an = buildDeductionAnalysis(rec, d, ranked);
    return `
      <div class="cs-deduce-kpi">
        <div class="cs-kpi-box"><span>Полнота базы дела</span><b>${an.readiness}%</b></div>
        <div class="cs-kpi-box"><span>Лидер подозрений</span><b style="font-size:17px">${esc(ranked[0] ? ranked[0].s.name : '—')}</b></div>
        <div class="cs-kpi-box"><span>Сломанных алиби</span><b style="color:${an.brokenAlibis.length ? '#ff4b55' : '#fff'}">${an.brokenAlibis.length}</b></div>
        <div class="cs-kpi-box"><span>Провалов таймлайна</span><b style="color:${an.gaps.length ? '#ff8a90' : '#fff'}">${an.gaps.length}</b></div>
        <div class="cs-kpi-box"><span>Открытых нестыковок</span><b style="color:${an.openCons.length ? '#ff8a90' : '#fff'}">${an.openCons.length}</b></div>
      </div>
      <div class="cs-grid2">
        <div class="cs-card">
          <h4>Аналитическая сводка следователя</h4>
          <div style="padding:12px;border-left:3px solid #e2232e;background:#0c0c12;font-size:13.5px;line-height:1.6;color:#f3f3f5;margin-bottom:14px">
            ${esc(an.summaryText)}
          </div>
          <h4>Следующие рекомендуемые шаги расследования</h4>
          <div style="display:grid;gap:8px">
            ${an.nextSteps.map((st, idx) => `<div style="padding:9px 11px;background:#0c0c11;border:1px solid rgba(205,205,218,.15);font-size:12.5px"><b style="color:#e2232e;font-family:'JetBrains Mono',monospace">ШАГ 0${idx + 1}:</b> ${esc(st)}</div>`).join('')}
          </div>
          <div class="row" style="margin-top:12px">
            <button type="button" class="btn btn-primary" id="deduce-to-conc">Перенести аналитический вывод в Развязку дела →</button>
          </div>
        </div>
        <div class="cs-card">
          <h4>Сравнительная таблица всех фигурантов</h4>
          <div style="display:grid;gap:8px">
            ${ranked.length ? ranked.map(({ s, sc }) => {
              const evCount = d.evidence.filter(e => e.suspectId === s.id).length;
              const alLbl = (ALIBI_ST.find(x => x[0] === s.alibiStatus) || ALIBI_ST[0])[1];
              return `<div style="padding:10px 12px;background:#0c0c11;border:1px solid ${sc >= 65 ? '#e2232e' : 'rgba(205,205,218,.16)'}">
                <div class="row" style="justify-content:space-between"><b>${esc(s.name)}</b><span class="mono" style="color:${sc >= 65 ? '#ff7b82' : '#cacad2'}">${sc}%</span></div>
                <div style="font-size:11.5px;color:#9d9da8;margin-top:4px">МСВ: ${[s.motive ? 'Мотив ✓' : '', s.means ? 'Средства ✓' : '', s.opportunity ? 'Возможность ✓' : ''].filter(Boolean).join(' · ') || 'нет отметок'} · Улик: ${evCount}</div>
                <div style="font-size:11.5px;color:#e5e5eb;margin-top:2px">Алиби: <b>${esc(alLbl)}</b></div>
              </div>`;
            }).join('') : '<div class="muted">Нет фигурантов для сравнения.</div>'}
          </div>
        </div>
      </div>`;
  }

  // Вкладка 6: Якоря памяти и Развязка дела
  const ma = d.memoryAnchors;
  return `
    <div class="cs-grid2">
      <div class="cs-card">
        <h4>Реконструкция личного забытого дела (методика когнитивного опроса памяти)</h4>
        <div class="stack" style="gap:10px">
          <label class="field"><span>1. Что я помню на 100% точно (факты без домыслов)</span>
            <textarea class="textarea" id="ma-exact" style="min-height:68px" placeholder="Например: красная калитка, первые цифры дома «14…», река через дорогу, антенна во дворе…">${esc(ma.exact || '')}</textarea>
          </label>
          <label class="field"><span>2. Сенсорные приметы среды (звуки, вывески, транспорт, сезон, тени)</span>
            <textarea class="textarea" id="ma-sensory" style="min-height:68px" placeholder="Маршрутка 15 минут от вокзала, длинные вечерние тени, гравийный спуск к воде…">${esc(ma.sensory || '')}</textarea>
          </label>
          <label class="field"><span>3. Эпоха / диапазон лет и привязка к событиям</span>
            <input class="input" id="ma-era" value="${esc(ma.era || '')}" placeholder="Например: август 2009 года">
          </label>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <a class="btn btn-sm" href="https://pastvu.com/" target="_blank" rel="noopener noreferrer">PastVu (старые фото улиц)</a>
            <a class="btn btn-sm" href="https://web.archive.org/" target="_blank" rel="noopener noreferrer">Wayback Machine (старые сайты)</a>
            <button type="button" class="btn btn-sm btn-primary" id="ma-save">Сохранить якоря памяти</button>
          </div>
        </div>
      </div>
      <div class="cs-card">
        <h4>Финальная версия и Развязка дела</h4>
        <div class="stack" style="gap:10px">
          <label class="field"><span>Главный подозреваемый / установленная разгадка</span>
            <select class="select" id="verdict-sus">
              <option value="">— выберите фигуранта или укажите в выводе —</option>
              ${d.suspects.map(s => `<option value="${esc(s.id)}" ${d.primeSuspectId === s.id ? 'selected' : ''}>${esc(s.name)} (${esc(s.role)})</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Рабочая гипотеза (кто, как и почему)</span>
            <textarea class="textarea" id="verdict-hyp" style="min-height:74px" placeholder="Соберите единую картину события…">${esc(rec.hypothesis || '')}</textarea>
          </label>
          <label class="field"><span>Итоговый вывод / развязка</span>
            <textarea class="textarea" id="verdict-conc" style="min-height:84px" placeholder="Чем завершилось расследование и какими уликами доказан вывод…">${esc(rec.conclusion || '')}</textarea>
          </label>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn" id="verdict-save">Сохранить выводы</button>
            <button type="button" class="btn btn-primary" id="verdict-solve">★ Поставить штамп «ДЕЛО РАСКРЫТО»</button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ─────────── Инициализация встроенной карты двора во вкладке 5 ─────────── */
function initSceneCourtyardMap(el, rec, d) {
  const mapEl = $('#cs-scene-map', el);
  if (!mapEl || !window.L) return;
  const hasCoords = d.sceneLat !== '' && d.sceneLon !== '' && Number.isFinite(+d.sceneLat) && Number.isFinite(+d.sceneLon);
  const center = hasCoords ? [+d.sceneLat, +d.sceneLon] : [55.7539, 37.6208];
  const zoom = hasCoords ? 18 : 5;

  const map = state.sceneMap = window.L.map(mapEl, {
    zoomControl: true,
    attributionControl: false,
    maxZoom: 21,
    preferCanvas: true
  }).setView(center, zoom);

  if (state.sceneMapBase === 'sat') {
    window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 17, maxZoom: 21 }).addTo(map);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxNativeZoom: 20, maxZoom: 21 }).addTo(map);
  } else {
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxNativeZoom: 20, maxZoom: 21 }).addTo(map);
  }

  const markersLayer = window.L.layerGroup().addTo(map);
  const renderMarkers = () => {
    markersLayer.clearLayers();
    d.sceneMarkers.forEach(m => {
      const cfg = SCENE_PIN_KINDS[m.kind] || SCENE_PIN_KINDS.clue;
      const mk = window.L.marker([m.lat, m.lon], {
        icon: window.L.divIcon({
          className: '',
          html: `<div class="cs-sm-pin" style="border-color:${cfg.color}" title="${esc(m.label)}">${cfg.glyph}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
      }).addTo(markersLayer);
      const pop = document.createElement('div');
      pop.innerHTML = `<div class="mono" style="font-size:10px;color:#e2232e">${esc(cfg.label)}</div><b>${esc(m.label)}</b><div class="mono" style="font-size:10.5px;color:#9d9da8;margin:4px 0">${m.lat.toFixed(6)}, ${m.lon.toFixed(6)}</div><button type="button" class="btn btn-sm">Удалить метку</button>`;
      pop.querySelector('button').onclick = () => {
        d.sceneMarkers = d.sceneMarkers.filter(x => x.id !== m.id);
        syncCaseRecord(rec);
        renderMarkers();
      };
      mk.bindPopup(pop);
    });
  };
  renderMarkers();

  map.on('click', e => {
    const cfg = SCENE_PIN_KINDS[state.scenePinMode] || SCENE_PIN_KINDS.epicenter;
    const label = prompt(`Подпись для метки «${cfg.label}»:`, cfg.label) || cfg.label;
    const lat = +e.latlng.lat.toFixed(6), lon = +e.latlng.lng.toFixed(6);
    d.sceneMarkers.push({ id: uid('sm'), kind: state.scenePinMode, lat, lon, label: label.trim() });
    if (d.sceneLat === '' || state.scenePinMode === 'epicenter') {
      d.sceneLat = lat;
      d.sceneLon = lon;
      const laInp = $('#sc-lat', el), loInp = $('#sc-lon', el);
      if (laInp) laInp.value = lat;
      if (loInp) loInp.value = lon;
      $('#sc-open-3d', el)?.removeAttribute('disabled');
      $('#sc-open-2d', el)?.removeAttribute('disabled');
    }
    syncCaseRecord(rec);
    renderMarkers();
  });

  setTimeout(() => map.invalidateSize(), 80);
}

/* ─────────── События интерактивного Штаба ─────────── */
function wireStudioEvents(el, rec, d, ranked) {
  $('#cs-close', el).onclick = close;
  $('#cs-edit-raw', el).onclick = () => { close(); GE.editRecord('case', rec.id); };
  $('#cs-to-graph', el).onclick = () => { close(); location.hash = '#/connections'; };
  $('#cs-export-md', el).onclick = () => {
    syncCaseRecord(rec);
    if (GE.vault && GE.vault.downloadOne) GE.vault.downloadOne(rec);
    else {
      const md = `# ${rec.case_no ? rec.case_no + ' — ' : ''}${rec.title}\n\nСтатус: **${rec.status}**\nМесто: ${d.scenePlace || rec.region || '—'}\n\n## Фабула\n${rec.briefing || ''}\n\n## Фигуранты и алиби\n${rec.people || ''}\n\n## Поминутный таймлайн\n${rec.timeline || ''}\n\n## Улики\n${rec.evidence || ''}\n\n## Противоречия\n${rec.contradictions || ''}\n\n## Вывод\n${rec.conclusion || rec.hypothesis || ''}\n`;
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(rec.case_no || 'CASE')}_${rec.title.slice(0, 24).replace(/[^\wа-яА-ЯёЁ-]+/g, '_')}.md`;
      a.click();
    }
    GE.toast('Досье расследования выгружено в формате Obsidian Markdown');
  };

  $$('[data-cstab]', el).forEach(b => {
    b.onclick = () => { state.tab = b.dataset.cstab; state.linkFrom = null; renderStudio(); };
  });
  $$('[data-goto-tab]', el).forEach(b => {
    b.onclick = () => { state.tab = b.dataset.gotoTab; renderStudio(); };
  });

  if (state.tab === 'board') {
    const brief = $('#cs-briefing', el);
    if (brief) brief.onchange = () => { GE.caseSet(rec.id, { briefing: brief.value }); GE.toast('Фабула сохранена'); };

    $('#cs-rebuild-pins', el).onclick = () => {
      seedPinsFromData(rec);
      syncCaseRecord(rec);
      renderStudio();
      GE.toast('Доска собрана из фигурантов и улик дела');
    };
    $('#cs-ring-pins', el).onclick = () => {
      const board = $('#cs-board', el);
      const cx = Math.max(260, (board.clientWidth || 900) / 2 - 100);
      const cy = Math.max(180, (board.clientHeight || 520) / 2 - 40);
      const core = d.pins.find(p => p.kind === 'core') || d.pins[0];
      const rest = d.pins.filter(p => p !== core);
      if (core) { core.x = Math.round(cx); core.y = Math.round(cy); }
      rest.forEach((p, idx) => {
        const ang = (idx / Math.max(1, rest.length)) * Math.PI * 2 - Math.PI / 2;
        p.x = Math.max(12, Math.round(cx + Math.cos(ang) * Math.min(340, cx - 24)));
        p.y = Math.max(52, Math.round(cy + Math.sin(ang) * Math.min(200, cy - 48)));
      });
      syncCaseRecord(rec);
      renderStudio();
    };
    $('#cs-png-pins', el).onclick = () => exportBoardPng(rec, d);
    $('#cs-add-pin', el).onclick = () => {
      const title = prompt('Заголовок карточки на стене улик (имя, улика, место или версия):');
      if (!title || !title.trim()) return;
      const sub = prompt('Краткая подпись / зацепка (необязательно):') || '';
      d.pins.push({ id: uid('pin'), kind: 'note', title: title.trim(), sub: sub.trim(), x: 180 + Math.round(Math.random() * 340), y: 120 + Math.round(Math.random() * 200) });
      syncCaseRecord(rec);
      renderStudio();
    };

    const board = $('#cs-board', el);
    $('#cs-board-svg', board).onclick = ev => {
      const g = ev.target.closest('[data-th-id]');
      if (!g) return;
      const th = d.threads.find(t => t.id === g.dataset.thId);
      if (!th) return;
      const next = prompt('Новая подпись красной нити (оставьте пустым, чтобы УДАЛИТЬ нить):', th.label || 'связь');
      if (next === null) return;
      if (!next.trim()) d.threads = d.threads.filter(t => t.id !== th.id);
      else th.label = next.trim();
      syncCaseRecord(rec);
      renderStudio();
    };

    board.querySelectorAll('[data-pin-edit]').forEach(btn => {
      btn.onclick = ev => {
        ev.stopPropagation();
        const pin = d.pins.find(p => p.id === btn.dataset.pinEdit);
        if (!pin) return;
        const nt = prompt('Заголовок карточки:', pin.title);
        if (nt === null || !nt.trim()) return;
        const ns = prompt('Подпись / деталь:', pin.sub || '');
        pin.title = nt.trim();
        if (ns !== null) pin.sub = ns.trim();
        syncCaseRecord(rec);
        renderStudio();
      };
    });
    board.querySelectorAll('[data-pin-del]').forEach(btn => {
      btn.onclick = ev => {
        ev.stopPropagation();
        const pid = btn.dataset.pinDel;
        d.pins = d.pins.filter(p => p.id !== pid);
        d.threads = d.threads.filter(t => t.from !== pid && t.to !== pid);
        syncCaseRecord(rec);
        renderStudio();
      };
    });
    board.querySelectorAll('[data-pin-link]').forEach(btn => {
      btn.onclick = ev => {
        ev.stopPropagation();
        const pid = btn.dataset.pinLink;
        if (!state.linkFrom) { state.linkFrom = pid; renderStudio(); }
        else if (state.linkFrom === pid) { state.linkFrom = null; renderStudio(); }
        else {
          const lbl = prompt('Подпись красной нити (например: мотив, ложное алиби, ключ, был рядом):', 'связь') || '';
          d.threads.push({ id: uid('th'), from: state.linkFrom, to: pid, label: lbl.trim() });
          state.linkFrom = null;
          syncCaseRecord(rec);
          renderStudio();
        }
      };
    });

    board.querySelectorAll('.cs-pin').forEach(pinEl => {
      pinEl.addEventListener('pointerdown', ev => {
        if (ev.target.closest('button')) return;
        const pid = pinEl.dataset.pin;
        const pin = d.pins.find(p => p.id === pid);
        if (!pin) return;
        pinEl.setPointerCapture(ev.pointerId);
        const startX = ev.clientX, startY = ev.clientY, origX = pin.x, origY = pin.y;
        const onMove = mv => {
          pin.x = Math.max(8, Math.min(board.clientWidth - 210, origX + mv.clientX - startX));
          pin.y = Math.max(46, Math.min(board.clientHeight - 88, origY + mv.clientY - startY));
          pinEl.style.left = pin.x + 'px';
          pinEl.style.top = pin.y + 'px';
          $('#cs-board-svg', board).innerHTML = renderSvgThreads(d);
        };
        const onUp = () => {
          pinEl.removeEventListener('pointermove', onMove);
          pinEl.removeEventListener('pointerup', onUp);
          syncCaseRecord(rec);
        };
        pinEl.addEventListener('pointermove', onMove);
        pinEl.addEventListener('pointerup', onUp);
      });
    });
  }

  if (state.tab === 'suspects') {
    $('#ns-add', el).onclick = () => {
      const name = $('#ns-name', el).value.trim();
      if (!name) return GE.toast('Введите имя или описание фигуранта', { type: 'err' });
      const s = {
        id: uid('sus'), name,
        role: $('#ns-role', el).value,
        alibiStatus: $('#ns-alst', el).value,
        alibi: $('#ns-alibi', el).value.trim(),
        notes: $('#ns-notes', el).value.trim(),
        motive: $('#ns-m', el).checked,
        means: $('#ns-me', el).checked,
        opportunity: $('#ns-op', el).checked
      };
      d.suspects.push(s);
      d.pins.push({ id: uid('pin'), refId: s.id, kind: /жертв|потерпев/i.test(s.role) ? 'victim' : 'suspect', title: s.name, sub: s.role, x: 140 + (d.pins.length * 55) % 520, y: 120 + (d.pins.length * 45) % 260 });
      syncCaseRecord(rec);
      renderStudio();
      GE.toast('Фигурант добавлен в расследование');
    };

    el.querySelectorAll('[data-sid]').forEach(card => {
      const sus = d.suspects.find(x => x.id === card.dataset.sid);
      if (!sus) return;
      card.querySelectorAll('[data-sus-chk]').forEach(chk => {
        chk.onchange = () => { sus[chk.dataset.susChk] = chk.checked; syncCaseRecord(rec); renderStudio(); };
      });
      const alSel = card.querySelector('[data-sus-alst]');
      if (alSel) alSel.onchange = () => { sus.alibiStatus = alSel.value; syncCaseRecord(rec); renderStudio(); };
    });
    el.querySelectorAll('[data-del-sus]').forEach(b => {
      b.onclick = () => { d.suspects = d.suspects.filter(s => s.id !== b.dataset.delSus); syncCaseRecord(rec); renderStudio(); };
    });
  }

  if (state.tab === 'timeline') {
    ['tl-win-a', 'tl-win-b', 'tl-subj'].forEach(id => {
      const inp = $('#' + id, el);
      if (inp) inp.onchange = () => {
        d.timeWindowStart = $('#tl-win-a', el).value.trim();
        d.timeWindowEnd = $('#tl-win-b', el).value.trim();
        d.victimOrSubject = $('#tl-subj', el).value.trim();
        syncCaseRecord(rec);
      };
    });
    $('#nt-add', el).onclick = () => {
      const text = $('#nt-text', el).value.trim();
      if (!text) return GE.toast('Опишите событие таймлайна', { type: 'err' });
      d.timeline.push({ id: uid('tl'), time: $('#nt-time', el).value.trim(), kind: $('#nt-kind', el).value, actor: $('#nt-actor', el).value.trim(), text });
      syncCaseRecord(rec);
      renderStudio();
    };
    el.querySelectorAll('[data-del-tl]').forEach(b => {
      b.onclick = () => { d.timeline = d.timeline.filter(t => t.id !== b.dataset.delTl); syncCaseRecord(rec); renderStudio(); };
    });
  }

  if (state.tab === 'evidence') {
    $('#ne-add', el).onclick = () => {
      const title = $('#ne-title', el).value.trim();
      if (!title) return GE.toast('Введите описание улики', { type: 'err' });
      const code = 'E-' + String(d.evidence.length + 1).padStart(2, '0');
      const evObj = { id: uid('ev'), code, type: $('#ne-type', el).value, suspectId: $('#ne-sus', el).value, weight: $('#ne-w', el).value, title, notes: $('#ne-notes', el).value.trim() };
      d.evidence.push(evObj);
      d.pins.push({ id: uid('pin'), refId: evObj.id, kind: 'evidence', title: `${code}: ${title.slice(0, 32)}`, sub: evObj.type, x: 120 + (d.pins.length * 60) % 520, y: 150 + (d.pins.length * 40) % 240 });
      syncCaseRecord(rec);
      renderStudio();
      GE.toast('Улика ' + code + ' занесена в сейф');
    };
    el.querySelectorAll('[data-del-ev]').forEach(b => {
      b.onclick = () => { d.evidence = d.evidence.filter(e => e.id !== b.dataset.delEv); syncCaseRecord(rec); renderStudio(); };
    });
    $('#nc-add', el).onclick = () => {
      const text = $('#nc-text', el).value.trim();
      if (!text) return;
      d.contradictions.push({ id: uid('con'), text, resolved: false });
      syncCaseRecord(rec);
      renderStudio();
    };
    el.querySelectorAll('[data-con-chk]').forEach(chk => {
      chk.onchange = () => {
        const item = d.contradictions.find(c => c.id === chk.dataset.conChk);
        if (item) { item.resolved = chk.checked; syncCaseRecord(rec); renderStudio(); }
      };
    });
    el.querySelectorAll('[data-del-con]').forEach(b => {
      b.onclick = () => { d.contradictions = d.contradictions.filter(c => c.id !== b.dataset.delCon); syncCaseRecord(rec); renderStudio(); };
    });
  }

  if (state.tab === 'scene3d') {
    initSceneCourtyardMap(el, rec, d);
    $$('[data-smpin]', el).forEach(b => {
      b.onclick = () => { state.scenePinMode = b.dataset.smpin; renderStudio(); };
    });
    $$('[data-sm-base]', el).forEach(b => {
      b.onclick = () => { state.sceneMapBase = b.dataset.smBase; renderStudio(); };
    });
    $('#sc-clr-pins', el).onclick = () => {
      d.sceneMarkers = [];
      syncCaseRecord(rec);
      renderStudio();
    };

    const saveScene = () => {
      d.scenePlace = $('#sc-place', el).value.trim();
      const la = $('#sc-lat', el).value.trim(), lo = $('#sc-lon', el).value.trim();
      d.sceneLat = la === '' ? '' : +la;
      d.sceneLon = lo === '' ? '' : +lo;
      d.sceneNotes = $('#sc-notes', el).value.trim();
      syncCaseRecord(rec);
    };
    $('#sc-save', el).onclick = () => { saveScene(); renderStudio(); GE.toast('Описание и координаты места сохранены'); };
    $('#sc-geocode', el).onclick = async () => {
      const q = $('#sc-place', el).value.trim();
      if (!q) return GE.toast('Введите город, улицу и номер дома', { type: 'err' });
      const parsed = GE.parseCoords && GE.parseCoords(q);
      if (parsed) {
        $('#sc-lat', el).value = parsed.lat.toFixed(6);
        $('#sc-lon', el).value = parsed.lon.toFixed(6);
        saveScene(); renderStudio(); return;
      }
      try {
        GE.toast('Ищу точный дом на карте…');
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`);
        const arr = await r.json();
        if (!arr || !arr.length) return GE.toast('Дом не найден — уточните город и улицу', { type: 'warn' });
        $('#sc-lat', el).value = (+arr[0].lat).toFixed(6);
        $('#sc-lon', el).value = (+arr[0].lon).toFixed(6);
        if (!d.sceneMarkers.length) {
          d.sceneMarkers.push({ id: uid('sm'), kind: 'epicenter', lat: +(+arr[0].lat).toFixed(6), lon: +(+arr[0].lon).toFixed(6), label: q });
        }
        saveScene();
        renderStudio();
        GE.toast('Дом найден и отмечен на карте двора!');
      } catch (_) {
        GE.toast('Геокодер временно недоступен — кликните по карте вручную', { type: 'err' });
      }
    };
    const btn3d = $('#sc-open-3d', el);
    if (btn3d) btn3d.onclick = () => {
      saveScene();
      if (window.GE3D && typeof window.GE3D.openStreet === 'function') {
        window.GE3D.openStreet(+d.sceneLat, +d.sceneLon, d.scenePlace || rec.title);
      } else if (window.GE3D) {
        window.GE3D.openAt(+d.sceneLat, +d.sceneLon, d.scenePlace || rec.title, 18.8);
      }
    };
    const btn2d = $('#sc-open-2d', el);
    if (btn2d) btn2d.onclick = () => {
      saveScene();
      close();
      location.hash = '#/geolocation';
      setTimeout(() => {
        if (GE.geo && GE.geo.ensure) {
          GE.geo.ensure();
          if (GE.geo.map) {
            GE.geo.map.setView([+d.sceneLat, +d.sceneLon], 18);
            GE.geo.pick && GE.geo.pick(+d.sceneLat, +d.sceneLon, d.scenePlace || rec.title);
          }
        }
      }, 150);
    };
  }

  if (state.tab === 'deduce') {
    $('#deduce-to-conc', el).onclick = () => {
      const an = buildDeductionAnalysis(rec, d, ranked);
      const nextConc = (rec.conclusion ? rec.conclusion + '\n\n' : '') + `[Дедуктивный разбор]: ${an.summaryText}`;
      const patch = { conclusion: nextConc };
      if (ranked[0]) d.primeSuspectId = ranked[0].s.id;
      GE.caseSet(rec.id, patch);
      syncCaseRecord(rec);
      state.tab = 'memory';
      renderStudio();
      GE.toast('Вывод перенесён во вкладку Развязки!');
    };
  }

  if (state.tab === 'memory') {
    $('#ma-save', el).onclick = () => {
      d.memoryAnchors.exact = $('#ma-exact', el).value.trim();
      d.memoryAnchors.sensory = $('#ma-sensory', el).value.trim();
      d.memoryAnchors.era = $('#ma-era', el).value.trim();
      syncCaseRecord(rec);
      GE.toast('Якоря памяти сохранены в досье');
    };
    const saveVerdict = markSolved => {
      d.primeSuspectId = $('#verdict-sus', el).value;
      const hyp = $('#verdict-hyp', el).value.trim();
      const conc = $('#verdict-conc', el).value.trim();
      const patch = { hypothesis: hyp, conclusion: conc };
      if (markSolved) {
        patch.status = 'Раскрыто';
        patch.stage = 'Выводы и отчёт';
        patch.outcome = 'Раскрыто — подтверждено';
      }
      GE.caseSet(rec.id, patch, markSolved ? 'Дело раскрыто' : 'Обновлены выводы');
      syncCaseRecord(rec);
      if (markSolved) {
        GE.sfx && GE.sfx('solved');
        GE.toast('ДЕЛО РАСКРЫТО! Штамп поставлен в досье.');
      } else {
        GE.toast('Выводы сохранены');
      }
      renderStudio();
    };
    $('#verdict-save', el).onclick = () => saveVerdict(false);
    $('#verdict-solve', el).onclick = () => saveVerdict(true);
  }
}

function open(caseId, tab) {
  if (!window.GE) return;
  if (!caseId) {
    const list = GE.db.byType('case');
    if (list.length) caseId = list[0].id;
    else { location.hash = '#/cases'; return; }
  }
  const rec = GE.db.get(caseId);
  if (!rec || rec.type !== 'case') return;
  state.caseId = caseId;
  if (tab) state.tab = tab;
  state.open = true;
  if (GE.closeDrawer) GE.closeDrawer();
  renderStudio();
}

function close() {
  destroySceneMap();
  state.open = false;
  state.linkFrom = null;
  const el = $('#ge-cstudio');
  if (el) {
    el.classList.remove('open');
    el.style.display = 'none';
  }
  if (window.GE && GE.renderEntity && location.hash === '#/cases') {
    GE.renderEntity('case');
    setTimeout(renderCasesHubBanner, 20);
  }
}

document.addEventListener('click', ev => {
  const tplBtn = ev.target && ev.target.closest ? ev.target.closest('[data-cs-tpl]') : null;
  if (tplBtn) {
    ev.preventDefault();
    createPresetCase(tplBtn.dataset.csTpl);
    return;
  }
  const topBtn = ev.target && ev.target.closest ? ev.target.closest('#top-cases-btn') : null;
  if (topBtn) {
    ev.preventDefault();
    const cases = window.GE ? GE.db.byType('case') : [];
    if (cases.length) open(cases[0].id);
    else location.hash = '#/cases';
    return;
  }
  const openBtn = ev.target && ev.target.closest ? ev.target.closest('[data-cs-open]') : null;
  if (openBtn) {
    ev.preventDefault();
    ev.stopPropagation();
    open(openBtn.dataset.csOpen);
  }
});

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && state.open && (!window.GE3D || !window.GE3D.state.open)) {
    ev.preventDefault();
    close();
  }
});

function hookIntoGE() {
  if (!window.GE) return;
  injectStyles();
  const refreshIfCases = () => {
    if (location.hash === '#/cases') setTimeout(renderCasesHubBanner, 15);
  };
  window.addEventListener('hashchange', refreshIfCases);
  if (GE.on) {
    GE.on('db:change', refreshIfCases);
    GE.on('record:saved', refreshIfCases);
  }
  if (GE.wireCase && !GE.__csWired) {
    GE.__csWired = true;
    const origWire = GE.wireCase;
    GE.wireCase = function (dr, id) {
      origWire.call(this, dr, id);
      if (dr && !dr.querySelector('[data-cs-open]')) {
        const bar = document.createElement('div');
        bar.style.cssText = 'margin:0 0 14px;padding:11px 12px;border:1px solid rgba(226,35,46,.45);background:rgba(139,0,0,.16);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap';
        bar.innerHTML = `<span style="font-size:12px;color:#e5e5eb"><b>Детективный Штаб v4.0:</b> стена с нитями, алиби, карта двора и 3D-улица</span><button type="button" class="btn btn-sm btn-primary" data-cs-open="${esc(id)}">🕵️ Открыть в Штабе</button>`;
        const body = dr.querySelector('.dr-b');
        if (body) body.prepend(bar);
      }
    };
  }
  refreshIfCases();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookIntoGE);
else setTimeout(hookIntoGE, 0);

window.GECaseStudio = { open, close, createPresetCase, renderCasesHubBanner };
})();
