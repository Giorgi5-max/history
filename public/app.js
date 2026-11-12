import { books, booksById, lessons, lessonsById, pagesLabel } from "./catalog.js";
import { summarize } from "./summary.js";

const main = document.querySelector("main");
const announce = text => { document.querySelector("#announcement").textContent = text; };
const iconPaths = {
  temple: "M3 9 12 4l9 5H3Zm2 11h14M3 22h18M7 11v7m5-7v7m5-7v7",
  book: "M4 3h13a2 2 0 0 1 2 2v15H6a2 2 0 0 1-2-2V3Zm0 14h15M8 7h7m-7 4h5",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15",
  globe: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18m-9-9a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z",
  arrow: "M4 12h15m-6-6 6 6-6 6",
  chevron: "m9 6 6 6-6 6",
  headset: "M3 14v-2a9 9 0 0 1 18 0v2M3 14a2 2 0 0 1 2-2h2v7H5a2 2 0 0 1-2-2v-3Zm18 0a2 2 0 0 0-2-2h-2v7h2a2 2 0 0 0 2-2v-3Z",
  lines: "M5 5h14M5 10h14M5 15h10M5 20h7",
  check: "m5 12 4 4L19 6",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  video: "M4 5h16v14H4V5Zm6 4 5 3-5 3V9Z",
  mic: "M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5Zm-3 5v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6",
  lock: "M6 11h12a1 1 0 0 1 1 1v8H5v-8a1 1 0 0 1 1-1Zm2 0V7a4 4 0 0 1 8 0v4m-4 4v2",
  search: "M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0Zm-1.5 4.5L20 20",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2",
  upload: "M4 15v5h16v-5m-8 1V4m-5 5 5-5 5 5",
  play: "m8 5 12 7-12 7V5Z",
  stop: "M6 6h12v12H6z"
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name]}"/></svg>`;
}

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function readState(key, fallback) {
  try { return JSON.parse(localStorage.getItem(`istoria.v1.${key}`)) ?? fallback; }
  catch { return fallback; }
}

function writeState(key, value) {
  try { localStorage.setItem(`istoria.v1.${key}`, JSON.stringify(value)); }
  catch { /* The current session remains usable when storage is restricted. */ }
}

const progress = readState("progress", {});
const attempts = readState("attempts", {});
const lessonsCache = new Map();
const tabs = [
  ["read", "ტექსტი", "book"], ["listen", "მოსმენა", "headset"], ["summary", "რეზიუმე", "lines"],
  ["video", "ვიდეო", "video"], ["quiz", "ქვიზი", "list"]
];
const mediaKinds = {
  video: { title: "ახსნა-განმარტებითი ვიდეო", icon: "video", accept: ".mp4,.m4v,.webm,.mov", note: "3–4 წუთი · სასურველია MP4 · მაქსიმუმ 90 მბ" },
  audio: { title: "გაკვეთილის აუდიოჩანაწერი", icon: "headset", accept: ".mp3,.m4a,.wav,.ogg,.opus,.aac,.webm", note: "სასურველია MP3 ან M4A · მაქსიმუმ 35 მბ" },
  podcast: { title: "პოდკასტი", icon: "mic", accept: ".mp3,.m4a,.wav,.ogg,.opus,.aac,.webm", note: "სასურველია MP3 ან M4A · მაქსიმუმ 35 მბ" }
};

let renderVersion = 0;
let current = [];
let stopSpeech = () => {};
const href = (id, tab = "read") => `#/lesson/${id}/${tab}`;
const button = (label, target, symbol = "", style = "") =>
  `<a class="button ${style}" href="${target}">${symbol ? icon(symbol) : ""}${escape(label)}</a>`;
const crumb = links => `<div class="breadcrumb"><a href="#/">მთავარი</a>${links.map(([label, target]) => `${icon("chevron")}${target ? `<a href="${target}">${escape(label)}</a>` : `<span aria-current="page">${escape(label)}</span>`}`).join("")}</div>`;
const heading = (title, description = "") => `<div class="page-heading"><h1 class="display">${escape(title)}</h1>${description ? `<p>${escape(description)}</p>` : ""}</div>`;
const meter = (value, label) => `<div class="meter" role="progressbar" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><span style="width:${value}%"></span></div>`;
const count = book => book.groups.reduce((n, group) => n + group.lessons.length, 0);

document.querySelector(".brand-mark").innerHTML = icon("temple");
document.querySelector("#teacher-link").innerHTML = `${icon("lock")}მასწავლებლის პანელი`;

function navigation(route) {
  const active = route[0] === "lesson" ? "books" : (route[0] || "");
  document.querySelector("#navigation").innerHTML = [
    ["", "მთავარი"], ["books", "გაკვეთილები"], ["progress", "ჩემი პროგრესი"]
  ].map(([id, label]) => `<a href="#/${id}" ${id === active ? 'aria-current="page"' : ""}>${label}</a>`).join("");
  const teacher = document.querySelector("#teacher-link");
  if (active === "teacher") teacher.setAttribute("aria-current", "page");
  else teacher.removeAttribute("aria-current");
}

function home() {
  const last = lessonsById[readState("last", "")];
  main.innerHTML = `<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">VII კლასი · I ნაწილი</p>
      <h1>ისწავლე<br>ისტორია</h1>
      <p>წაიკითხე ან მოუსმინე გაკვეთილს, გაიმეორე მთავარი საკითხები და შეამოწმე ცოდნა ქვიზით.</p>
      <div class="hero-actions">${button(last ? "სწავლის გაგრძელება" : "გაკვეთილების ნახვა", last ? href(last.id) : "#/books", "arrow", "primary")}</div>
    </div>
    <div class="hero-visual" role="img" aria-label="კავკასიონის ხეობა, ბრინჯაოს ცულისა და თიხის ჭურჭლის მხატვრული ილუსტრაცია"></div>
  </section>
  <section class="section">
    <div class="section-head"><div><h2>აირჩიე სახელმძღვანელო</h2><p>საქართველოსა და მსოფლიოს ისტორია</p></div>${button("სრული სარჩევი", "#/books", "list", "small")}</div>
    <div class="course-grid">${books.map(book => `<a class="course" href="#/books/${book.id}">
      <span class="course-art ${book.id}">${icon(book.id === "ge" ? "map" : "globe")}</span>
      <div><h3>${book.title}</h3><p>${book.description}</p><p class="course-meta">${count(book)} პარაგრაფი</p></div>
      <span class="course-arrow">${icon("arrow")}</span>
    </a>`).join("")}</div>
    <div class="feature-strip">
      ${[["headset","მოსმენა და ვიდეო"],["lines","ავტომატური რეზიუმე"],["check","20 კითხვა თითოეულ პარაგრაფზე"]].map(([symbol, label]) => `<div class="feature">${icon(symbol)}${label}</div>`).join("")}
    </div>
  </section>`;
}

function lessonRow(lesson) {
  const score = progress[lesson.id]?.best;
  return `<li><a class="lesson-row" href="${href(lesson.id)}">
    <span class="lesson-num">${lesson.number}</span><strong>${lesson.title}</strong>
    <small>${Number.isInteger(score) ? `${score}/20 · ` : ""}${pagesLabel(lesson)}</small>${icon("chevron")}
  </a></li>`;
}

function catalog(bookId) {
  const selected = booksById[bookId];
  main.innerHTML = `${crumb([["გაკვეთილები"]])}${heading(selected?.title || "გაკვეთილების სარჩევი", "VII კლასი · მოსწავლის წიგნი · I ნაწილი")}
    <div class="catalog-tools">
      <div class="segment" aria-label="სახელმძღვანელო">
        ${[["", "ორივე წიგნი"], ...books.map(book => [book.id, book.title])].map(([id, label]) =>
          `<a href="#/books${id ? "/" + id : ""}" ${(selected?.id || "") === id ? 'aria-current="page"' : ""}>${label}</a>`).join("")}
      </div>
      <label class="search">${icon("search")}<span class="sr-only">პარაგრაფის ძებნა</span><input type="search" placeholder="მოძებნე პარაგრაფი" id="lesson-search"></label>
    </div><div id="catalog-list"></div>`;
  const search = main.querySelector("#lesson-search");
  const list = main.querySelector("#catalog-list");
  function update() {
    const needle = search.value.trim().toLocaleLowerCase("ka");
    let total = 0;
    list.innerHTML = (selected ? [selected] : books).flatMap(book => book.groups.map(group => {
      const entries = group.lessons.filter(lesson => `${lesson.number} ${lesson.title} ${group.name}`.toLocaleLowerCase("ka").includes(needle));
      total += entries.length;
      return entries.length ? `<section class="catalog-group"><h2>${selected ? "" : book.title + " · "}${group.name}</h2><ul class="lesson-list">${entries.map(lessonRow).join("")}</ul></section>` : "";
    })).join("") || '<p class="empty">ამ სახელით პარაგრაფი ვერ მოიძებნა.</p>';
    if (needle) announce(`ნაპოვნია ${total} პარაგრაფი`);
  }
  search.addEventListener("input", update);
  update();
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  let result;
  try { result = await response.json(); }
  catch { throw new Error("მონაცემების წაკითხვა ვერ მოხერხდა."); }
  if (!response.ok) throw new Error(result.error || "მოქმედება ვერ დასრულდა.");
  return result;
}

async function loadLesson(id) {
  if (!lessonsCache.has(id)) {
    const request = requestJson(`/lessons/${id}.json`);
    lessonsCache.set(id, request);
    request.catch(() => lessonsCache.delete(id));
  }
  return lessonsCache.get(id);
}

function lessonShell(lesson, tab) {
  const book = booksById[lesson.book];
  const side = book.groups.flatMap(group => group.lessons).map(entry => `<a href="${href(entry.id)}" ${entry.id === lesson.id ? 'aria-current="page"' : ""}><span>${entry.number}.</span><span>${entry.title}</span></a>`).join("");
  main.innerHTML = `${crumb([["გაკვეთილები", "#/books"], [book.title, `#/books/${book.id}`], [`§ ${lesson.number}`]])}
    <div class="lesson-layout">
      <details class="lesson-side" ${matchMedia("(min-width: 651px)").matches ? "open" : ""}><summary>პარაგრაფების სარჩევი</summary><nav aria-label="პარაგრაფები">${side}</nav></details>
      <article class="lesson-content">
        <header class="lesson-head">
          <p class="eyebrow">§ ${lesson.number} · ${lesson.group}</p>
          <h1 class="display">${lesson.title}</h1>
          <div class="meta"><span>${icon("book")} ${pagesLabel(lesson)}</span><span>${icon("list")} 20 კითხვა</span></div>
        </header>
        <nav class="lesson-tabs" aria-label="პარაგრაფის რესურსები">${tabs.map(([id, label, symbol]) => `<a href="${href(lesson.id, id)}" ${id === tab ? 'aria-current="page"' : ""}>${icon(symbol)}${label}</a>`).join("")}</nav>
        <div class="lesson-panel" id="lesson-panel"><p role="status" class="panel-help">გაკვეთილი იტვირთება…</p></div>
      </article>
    </div>`;
  const sideNav = main.querySelector(".lesson-side nav");
  const sideLink = sideNav.querySelector('[aria-current="page"]');
  if (sideNav.clientHeight && sideLink.offsetTop > sideNav.clientHeight) sideNav.scrollTop = sideLink.offsetTop - 88;
  return main.querySelector("#lesson-panel");
}

function callout(lesson) {
  return `<div class="quiz-callout"><div><h2>შეამოწმე ცოდნა</h2><p>უპასუხე 20 კითხვას და გადახედე შედეგებს.</p></div>${button("ქვიზის დაწყება", href(lesson.id, "quiz"), "arrow", "primary")}</div>`;
}

function renderReading(panel, lesson, data, sectionNumber) {
  const book = booksById[lesson.book];
  panel.innerHTML = `<div class="reading">${data.sections.map((section, i) => `<section id="reading-section-${i}" tabindex="-1"><h2>${escape(section.title)}</h2>${section.text.map(text => `<p>${escape(text)}</p>`).join("")}</section>`).join("")}</div>
    <p class="source">სახელმძღვანელო — ${book.title}, VII კლასი, I ნაწილი, ${book.authors}. 2026. ${pagesLabel(lesson)}.</p>${callout(lesson)}`;
  if (/^[0-3]$/.test(sectionNumber || "")) {
    const section = panel.querySelector(`#reading-section-${sectionNumber}`);
    section.focus();
    section.scrollIntoView({ block: "start" });
  }
}

function renderSummary(panel, lesson, data) {
  const bullets = summarize(data.sections, lesson.title);
  panel.innerHTML = `<h2 class="panel-title">გაკვეთილის რეზიუმე</h2>
    <p class="panel-help">აპი გაკვეთილის ტექსტიდან ძირითად წინადადებებს ავტომატურად არჩევს.</p>
    <ul class="summary-list">${bullets.map(text => `<li>${escape(text)}</li>`).join("")}</ul>${callout(lesson)}`;
}

function fileEndpoint(id, kind, media) {
  return `/api/media/${id}/${kind}?v=${encodeURIComponent(media.updated)}`;
}

function box(kind, lesson, media) {
  const entry = media?.[kind];
  const info = mediaKinds[kind];
  const noFile = { video: "ვიდეოს მასწავლებელი დაამატებს. დაგეგმილი ხანგრძლივობა 3–4 წუთია.", audio: "მასწავლებლის აუდიოჩანაწერი ჯერ არ არის დამატებული.", podcast: "პოდკასტი ჯერ არ არის დამატებული." };
  const body = entry
    ? `<${kind === "video" ? "video" : "audio"} controls preload="metadata" ${kind === "video" ? "playsinline" : ""} src="${fileEndpoint(lesson.id, kind, entry)}" aria-label="${info.title}"></${kind === "video" ? "video" : "audio"}>`
    : `<p>${noFile[kind]}</p>`;
  return `<section class="media-box"><h3>${icon(info.icon)}${info.title}</h3>${body}</section>`;
}

function bindNarration(panel, lesson, data) {
  const play = panel.querySelector("#speak");
  const status = panel.querySelector("#speech-status");
  const speech = window.speechSynthesis;
  let generation = 0;
  let playing = false;
  const playLabel = `${icon("play")}ტექსტის წაკითხვა`;
  const reset = () => {
    playing = false;
    play.innerHTML = playLabel;
  };
  const stop = () => {
    generation += 1;
    if (playing) speech?.cancel();
    reset();
  };
  stopSpeech = stop;
  play.addEventListener("click", () => {
    if (playing) {
      stop();
      status.textContent = "მოსმენა შეწყდა.";
      return;
    }
    const voice = speech?.getVoices().find(item => /^ka(?:[-_]|$)/i.test(item.lang));
    if (!voice) {
      status.textContent = "ამ მოწყობილობაზე ქართული სინთეზური ხმა მიუწვდომელია. როცა მასწავლებელი ჩანაწერს დაამატებს, აქვე მოუსმენ.";
      return;
    }
    const chunks = [lesson.title, ...data.sections.flatMap(section => [section.title, ...section.text.flatMap(text => text.match(/[^.!?]+[.!?]?/g) || [text])])];
    const token = ++generation;
    playing = true;
    status.textContent = "იკითხება გაკვეთილის ტექსტი.";
    play.innerHTML = `${icon("stop")}შეწყვეტა`;
    const next = index => {
      if (token !== generation) return;
      if (index === chunks.length) {
        reset();
        status.textContent = "მოსმენა დასრულდა.";
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = "ka-GE";
      utterance.voice = voice;
      utterance.rate = 0.93;
      utterance.onend = () => next(index + 1);
      utterance.onerror = () => {
        if (generation !== token) return;
        reset();
        status.textContent = "ტექსტის წაკითხვა შეწყდა. სცადე ხელახლა.";
      };
      speech.speak(utterance);
    };
    next(0);
  });
}

async function renderMedia(panel, lesson, data, tab) {
  const isVideo = tab === "video";
  const mediaEl = document.createElement("div");
  mediaEl.className = "media-grid";
  mediaEl.innerHTML = `<p class="panel-help" role="status">რესურსები იტვირთება…</p>`;
  panel.innerHTML = `<h2 class="panel-title">${isVideo ? "გაკვეთილის ვიდეო" : "მოუსმინე გაკვეთილს"}</h2>`;
  panel.append(mediaEl);
  let media;
  let failed = false;
  try { ({ media } = await requestJson(`/api/media/${lesson.id}`)); }
  catch { failed = true; }
  if (!panel.isConnected) return;
  mediaEl.innerHTML = `${failed ? '<p class="media-error" role="status">ატვირთული რესურსები დროებით მიუწვდომელია.</p>' : ""}
    ${isVideo ? box("video", lesson, media) : `${box("audio", lesson, media)}
      ${!media?.audio ? `<section class="media-box"><h3>${icon("headset")}გაკვეთილის ავტომატური გახმოვანება</h3><button class="button" id="speak" type="button">${icon("play")}ტექსტის წაკითხვა</button><p id="speech-status" role="status"></p></section>` : ""}
      ${box("podcast", lesson, media)}`}`;
  if (!isVideo && !media?.audio) bindNarration(panel, lesson, data);
  panel.querySelectorAll("audio,video").forEach(player => player.addEventListener("error", () => {
    if (player.nextElementSibling?.classList.contains("media-error")) return;
    const error = document.createElement("p");
    error.className = "media-error";
    error.textContent = "ფაილის დაკვრა ვერ მოხერხდა. სცადე გვერდის განახლება.";
    player.after(error);
  }));
}

function makeQuiz(id, questions) {
  let seed = Array.from(id).reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 19);
  const shuffle = list => {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const j = seed % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const positions = shuffle(questions.map((_, index) => index % 4));
  return questions.map((question, index) => {
    const [answer, ...others] = question.options;
    const options = shuffle(others);
    options.splice(positions[index], 0, answer);
    return { ...question, options, correct: positions[index] };
  });
}

function renderQuiz(panel, lesson, data) {
  const quiz = makeQuiz(lesson.id, data.questions);
  let attempt = attempts[lesson.id] ?? { current: 0, answers: {}, finished: false };
  function save() {
    attempts[lesson.id] = attempt;
    writeState("attempts", attempts);
  }
  function move(index) {
    attempt.current = index;
    save();
    draw();
    panel.querySelector("legend")?.focus({ preventScroll: true });
  }
  function finish() {
    attempt.finished = true;
    const score = quiz.filter((question, index) => question.correct === attempt.answers[index]).length;
    progress[lesson.id] = { best: Math.max(score, progress[lesson.id]?.best || 0), last: score };
    writeState("progress", progress);
    save();
    draw();
    panel.querySelector(".result").focus({ preventScroll: true });
    announce(`შედეგი: ${score} სწორი პასუხი ოციდან`);
  }
  function draw() {
    const answered = Object.keys(attempt.answers).length;
    if (attempt.finished) {
      const score = quiz.filter((question, index) => question.correct === attempt.answers[index]).length;
      panel.innerHTML = `<div class="result" tabindex="-1"><strong>${score} / 20</strong><p>სწორი პასუხები · საუკეთესო შედეგი ${progress[lesson.id]?.best ?? score}/20</p></div>
        <ol class="review">${quiz.map((question, index) => {
          const ok = question.correct === attempt.answers[index];
          return `<li class="${ok ? "ok" : ""}"><strong>${index + 1}. ${escape(question.prompt)}</strong><p>${ok ? "სწორია" : "სწორი პასუხია"} · ${escape(question.options[question.correct])}</p>
            ${ok ? "" : `<p>შენი პასუხი · ${escape(question.options[attempt.answers[index]])}</p><a class="button small" href="${href(lesson.id)}/${question.section}">გადაიკითხე ტექსტი</a>`}</li>`;
        }).join("")}</ol><div class="quiz-actions"><button class="button primary" id="retake">ხელახლა დაწყება</button>${button("ჩემი პროგრესი", "#/progress")}</div>`;
      panel.querySelector("#retake").onclick = () => {
        attempt = { current: 0, answers: {}, finished: false };
        move(0);
      };
      return;
    }
    const index = attempt.current;
    const question = quiz[index];
    panel.innerHTML = `<div class="quiz-header"><h2>ცოდნის შემოწმება</h2><span>პასუხი გაცემულია ${answered}/20 კითხვაზე</span></div>
      ${meter(answered * 5, "ქვიზის შევსება")}
      <form class="quiz-form">
        <fieldset><legend tabindex="-1">${index + 1}. ${escape(question.prompt)}</legend>
        <div class="answers">${question.options.map((option, optionIndex) => `<label class="answer"><input type="radio" name="answer" value="${optionIndex}" ${optionIndex === attempt.answers[index] ? "checked" : ""}><span>${escape(option)}</span></label>`).join("")}</div></fieldset>
        <div class="quiz-actions">
          <button class="button" type="button" id="previous" ${index === 0 ? "disabled" : ""}>წინა</button>
          ${index < quiz.length - 1 ? '<button class="button primary" type="button" id="next">შემდეგი</button>' : '<button class="button primary" type="submit">შედეგის ნახვა</button>'}
        </div><p class="message" role="status" id="quiz-message"></p>
      </form>
      <div class="question-nav" aria-label="კითხვები">${quiz.map((_, i) => `<button type="button" data-index="${i}" ${i === index ? 'aria-current="step"' : ""} aria-label="კითხვა ${i + 1}${Object.hasOwn(attempt.answers, i) ? ", პასუხი გაცემულია" : ""}" class="${Object.hasOwn(attempt.answers, i) ? "answered" : ""}">${i + 1}</button>`).join("")}</div>
      ${answered === 20 && index < 19 ? '<div class="quiz-actions"><button class="button" type="button" id="all-done">შედეგის ნახვა</button></div>' : ""}`;
    panel.querySelector(".quiz-form").onchange = event => {
      attempt.answers[index] = Number(event.target.value);
      save();
      draw();
      panel.querySelector("input:checked")?.focus({ preventScroll: true });
    };
    panel.querySelector("#previous").onclick = () => move(index - 1);
    panel.querySelector("#next")?.addEventListener("click", () => move(index + 1));
    panel.querySelector("#all-done")?.addEventListener("click", finish);
    panel.querySelectorAll("[data-index]").forEach(control => control.onclick = () => move(Number(control.dataset.index)));
    panel.querySelector("form").onsubmit = event => {
      event.preventDefault();
      const missing = quiz.findIndex((_, i) => !Object.hasOwn(attempt.answers, i));
      if (missing < 0) finish();
      else {
        move(missing);
        panel.querySelector("#quiz-message").textContent = "შედეგის სანახავად უპასუხე ყველა კითხვას.";
      }
    };
  }
  draw();
}

async function lessonPage(id, requestedTab, section) {
  const lesson = lessonsById[id];
  if (!lesson) return missing();
  const tab = tabs.some(([value]) => value === requestedTab) ? requestedTab : "read";
  writeState("last", id);
  const panel = lessonShell(lesson, tab);
  try {
    const data = await loadLesson(id);
    if (!panel.isConnected) return;
    if (tab === "read") renderReading(panel, lesson, data, section);
    if (tab === "summary") renderSummary(panel, lesson, data);
    if (tab === "quiz") renderQuiz(panel, lesson, data);
    if (tab === "listen" || tab === "video") await renderMedia(panel, lesson, data, tab);
  } catch {
    if (panel.isConnected) panel.innerHTML = '<p class="empty" role="alert">გაკვეთილი ვერ ჩაიტვირთა. განაახლე გვერდი და სცადე ხელახლა.</p>';
  }
}

function progressPage() {
  const completed = lessons.filter(lesson => Number.isInteger(progress[lesson.id]?.best));
  main.innerHTML = `${crumb([["ჩემი პროგრესი"]])}${heading("ჩემი პროგრესი", "შედეგები ინახება ამ ბრაუზერში.")}
    <div class="progress-grid">${books.map(book => {
      const done = completed.filter(lesson => lesson.book === book.id).length;
      return `<section class="progress-card"><h2>${book.title}</h2><strong>${done} / ${count(book)}</strong><p class="panel-help">დასრულებული ქვიზი</p>${meter(Math.round(done / count(book) * 100), book.title)}</section>`;
    }).join("")}</div>
    ${completed.length ? `<ul class="lesson-list">${completed.map(lessonRow).join("")}</ul>` : `<p class="empty">აქ გამოჩნდება შენი შედეგები პირველი ქვიზის დასრულების შემდეგ.</p><div class="quiz-actions">${button("გაკვეთილების ნახვა", "#/books", "arrow", "primary")}</div>`}`;
}

function uploadFile(url, file, report) {
  return new Promise((resolve, reject) => {
    const upload = new XMLHttpRequest();
    upload.open("PUT", url);
    upload.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    upload.upload.onprogress = event => { if (event.lengthComputable) report(event.loaded / event.total); };
    upload.onerror = () => reject(new Error("კავშირი გაწყდა. ატვირთვა ხელახლა სცადეთ."));
    upload.onload = () => {
      try {
        const response = JSON.parse(upload.responseText);
        if (upload.status < 200 || upload.status >= 300) return reject(new Error(response.error || "ატვირთვა ვერ დასრულდა."));
        resolve(response.file);
      } catch { reject(new Error("ატვირთვა ვერ დასრულდა.")); }
    };
    upload.send(file);
  });
}

let teacherBook = "ge";
let teacherLesson = "ge-1";

function loginView(configured, status = "") {
  main.innerHTML = `${crumb([["მასწავლებლის პანელი"]])}<section class="login">
    <span class="login-icon">${icon("lock")}</span><h1>მასწავლებლის პანელი</h1>
    <p>შეიყვანეთ პინი, რათა გაკვეთილს ვიდეო, აუდიოჩანაწერი ან პოდკასტი დაუმატოთ.</p>
    <form><label for="pin">რვაციფრიანი პინი</label>
      <input class="field" name="pin" id="pin" type="password" inputmode="numeric" maxlength="8" pattern="[0-9]{8}" autocomplete="current-password" required>
      <p class="message" id="teacher-message" role="status">${escape(status)}</p>
      <button class="button primary" type="submit" ${configured ? "" : "disabled"}>შესვლა</button>
    </form></section>`;
  const form = main.querySelector("form");
  form.onsubmit = async event => {
    event.preventDefault();
    const submit = form.querySelector("button");
    const message = form.querySelector("#teacher-message");
    submit.disabled = true;
    message.textContent = "მოწმდება პინი…";
    try {
      await requestJson("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: form.elements.pin.value }) });
      if (form.isConnected) await admin();
    } catch (error) {
      message.textContent = error.message;
      form.elements.pin.select();
      submit.disabled = false;
    }
  };
}

async function admin() {
  main.innerHTML = `${crumb([["მასწავლებლის პანელი"]])}
    <div class="admin-top">${heading("მასწავლებლის პანელი", "აირჩიეთ პარაგრაფი და ატვირთეთ სასწავლო რესურსები.")}
      <button class="button" id="logout" type="button">გასვლა</button>
    </div>
    <div class="admin-fields">
      <label>სახელმძღვანელო<select class="field" id="admin-book">${books.map(book => `<option value="${book.id}" ${book.id === teacherBook ? "selected" : ""}>${book.title}</option>`).join("")}</select></label>
      <label>პარაგრაფი<select class="field" id="admin-lesson"></select></label>
    </div>
    <div class="admin-media" id="uploads"></div>`;
  const bookInput = main.querySelector("#admin-book");
  const lessonInput = main.querySelector("#admin-lesson");
  const uploads = main.querySelector("#uploads");
  let loading = 0;
  function fillLessons() {
    const entries = lessons.filter(lesson => lesson.book === teacherBook);
    if (!entries.some(lesson => lesson.id === teacherLesson)) teacherLesson = entries[0].id;
    lessonInput.innerHTML = entries.map(lesson => `<option value="${lesson.id}" ${lesson.id === teacherLesson ? "selected" : ""}>${lesson.number}. ${lesson.title}</option>`).join("");
  }
  async function refresh(confirmation = "") {
    const version = ++loading;
    const id = teacherLesson;
    uploads.innerHTML = '<p class="panel-help" role="status">რესურსები იტვირთება…</p>';
    let media;
    try { ({ media } = await requestJson(`/api/media/${id}`)); }
    catch (error) {
      if (version === loading) uploads.innerHTML = `<p class="empty" role="alert">${escape(error.message)}</p><div><button class="button" type="button" id="reload-media">ხელახლა ცდა</button></div>`;
      uploads.querySelector("#reload-media")?.addEventListener("click", () => refresh());
      return;
    }
    if (!uploads.isConnected || version !== loading) return;
    uploads.innerHTML = `${confirmation ? `<p class="panel-help" role="status">${escape(confirmation)}</p>` : ""}
      ${Object.entries(mediaKinds).map(([kind, info]) => {
        const entry = media[kind];
        return `<form class="upload" data-kind="${kind}">
          <h2>${icon(info.icon)}${info.title}</h2><p>${info.note}</p>
          <p>${entry ? `ატვირთულია · ${escape(entry.name)}` : "ფაილი ჯერ არ არის ატვირთული."}</p>
          <div class="upload-controls">
            <input type="file" name="file" aria-label="${info.title}" accept="${info.accept}" required>
            <button type="submit" class="button primary small">${icon("upload")}${entry ? "ჩანაცვლება" : "ატვირთვა"}</button>
            ${entry ? `<a class="button small" href="${fileEndpoint(id, kind, entry)}" target="_blank" rel="noopener">გახსნა</a><button type="button" class="button small" data-remove>წაშლა</button>` : ""}
          </div><progress max="1" value="0" hidden aria-label="ატვირთვის პროგრესი"></progress><p class="message" role="status"></p>
        </form>`;
      }).join("")}
      <div>${button("პარაგრაფის გახსნა", href(id), "arrow")}</div>`;
    uploads.querySelectorAll("form").forEach(form => {
      const kind = form.dataset.kind;
      const url = `/api/media/${id}/${kind}`;
      const message = form.querySelector(".message");
      const progressBar = form.querySelector("progress");
      const submit = form.querySelector('[type="submit"]');
      const remove = form.querySelector("[data-remove]");
      function busy(value) {
        bookInput.disabled = value;
        lessonInput.disabled = value;
        main.querySelector("#logout")?.toggleAttribute("disabled", value);
        uploads.querySelectorAll("input, button").forEach(input => input.disabled = value);
      }
      form.onsubmit = async event => {
        event.preventDefault();
        const file = form.elements.file.files[0];
        if (!file) return;
        const limit = (kind === "video" ? 90 : 35) * 1024 * 1024;
        if (file.size > limit || file.size === 0) {
          message.textContent = "აირჩიეთ ფაილი მითითებული ზომის ფარგლებში.";
          return;
        }
        busy(true);
        progressBar.hidden = false;
        message.textContent = "ფაილი იტვირთება…";
        try {
          await uploadFile(url, file, value => progressBar.value = value);
          if (uploads.isConnected) await refresh(`${mediaKinds[kind].title} წარმატებით აიტვირთა.`);
        } catch (error) {
          message.textContent = error.message;
          progressBar.hidden = true;
        } finally {
          if (uploads.isConnected) busy(false);
        }
      };
      if (remove) remove.onclick = async () => {
        if (!window.confirm("წავშალოთ ამ პარაგრაფის რესურსი?")) return;
        busy(true);
        try {
          await requestJson(url, { method: "DELETE" });
          if (uploads.isConnected) await refresh("რესურსი წაიშალა.");
        } catch (error) { message.textContent = error.message; }
        finally { if (uploads.isConnected) busy(false); }
      };
    });
  }
  fillLessons();
  bookInput.onchange = () => { teacherBook = bookInput.value; fillLessons(); refresh(); };
  lessonInput.onchange = () => { teacherLesson = lessonInput.value; refresh(); };
  main.querySelector("#logout").onclick = async event => {
    const target = event.currentTarget;
    target.disabled = true;
    try {
      await requestJson("/api/logout", { method: "POST" });
      if (target.isConnected) loginView(true);
    } catch (error) {
      target.disabled = false;
      if (target.isConnected) announce(error.message);
    }
  };
  await refresh();
}

async function teacherPage() {
  const version = renderVersion;
  main.innerHTML = `${crumb([["მასწავლებლის პანელი"]])}<p class="panel-help" role="status">მასწავლებლის პანელი იტვირთება…</p>`;
  try {
    const session = await requestJson("/api/session");
    if (version !== renderVersion) return;
    if (session.authenticated) await admin();
    else loginView(session.configured, session.configured ? "" : "მასწავლებლის პანელის შესვლის პარამეტრები ჯერ არ არის დაყენებული.");
  } catch (error) {
    if (version === renderVersion) loginView(false, error.message);
  }
}

function missing() {
  main.innerHTML = `${heading("გვერდი ვერ მოიძებნა")}${button("გაკვეთილების სარჩევი", "#/books", "arrow", "primary")}`;
}

function render() {
  if (location.hash === "#main") {
    main.focus();
    return;
  }
  const route = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const keepScroll = current[0] === "lesson" && route[0] === "lesson" && current[1] === route[1];
  current = route;
  renderVersion += 1;
  stopSpeech();
  stopSpeech = () => {};
  navigation(route);
  document.title = `${lessonsById[route[1]]?.title || "ისტორია"} · VII კლასი`;
  if (!keepScroll) window.scrollTo(0, 0);
  switch (route[0]) {
    case undefined: home(); break;
    case "books": catalog(route[1]); break;
    case "lesson": lessonPage(route[1], route[2], route[3]); break;
    case "progress": progressPage(); break;
    case "teacher": teacherPage(); break;
    default: missing();
  }
}

document.querySelector(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  main.focus();
});
window.addEventListener("hashchange", render);
window.addEventListener("pagehide", () => stopSpeech());
render();
