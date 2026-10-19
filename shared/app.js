'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const lesson = JSON.parse($('lesson-data').textContent);
  const defaults = JSON.parse($('export-defaults').textContent);
  const questions = lesson.questions;
  const total = questions.length;
  const start = lesson.exercise.startNumber;
  const key = lesson.storageKey;
  const letters = 'ABCD';
  const aidLevels = ['off', 'soft', 'strong'];
  const fresh = () => ({answers: Array(total).fill(null), flags: Array(total).fill(false), current: 0,
    mode: 'answer', layout: defaults.layout === 'exam' ? 'exam' : 'reading', questionsOpen: false,
    readingAid: aidLevels.includes(defaults.readingAid) ? defaults.readingAid : 'soft',
    elapsed: 0, wrongOnly: false, submitted: false});
  let state = fresh(), storageOK = true, running = false, startedAt = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    if (saved && typeof saved === 'object') {
      const upgraded = saved.layout === 'exam' || saved.layout === 'reading';
      state = {...fresh(),
        answers: Array.from({length: total}, (_, i) => Number.isInteger(saved.answers?.[i]) && saved.answers[i] >= 0 && saved.answers[i] < 4 ? saved.answers[i] : null),
        flags: Array.from({length: total}, (_, i) => saved.flags?.[i] === true),
        current: Number.isInteger(saved.current) && saved.current >= 0 && saved.current < total ? saved.current : 0,
        mode: upgraded && saved.mode === 'review' ? 'review' : 'answer',
        layout: upgraded ? saved.layout : fresh().layout,
        readingAid: aidLevels.includes(saved.readingAid) ? saved.readingAid : fresh().readingAid,
        questionsOpen: upgraded && saved.questionsOpen === true,
        elapsed: Number.isFinite(saved.elapsed) && saved.elapsed >= 0 ? saved.elapsed : 0,
        wrongOnly: upgraded && saved.wrongOnly === true, submitted: saved.submitted === true};
    }
  } catch { storageOK = false; }

  function el(tag, attributes = {}, text = '') {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (name === 'class') node.className = value;
      else node.setAttribute(name, value);
    }
    node.textContent = text;
    return node;
  }
  function safeURL(value) {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : '#'; }
    catch { return '#'; }
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch { storageOK = false; }
    $('save-status').textContent = storageOK ? '版式与答题进度自动保存在当前浏览器。' : '浏览器未允许本地保存；可正常使用，关闭页面后进度可能丢失。';
  }
  function announce(text) { $('live').textContent = text; }
  const answerCount = () => state.answers.filter(x => x !== null).length;
  const correctCount = () => questions.filter((q, i) => state.answers[i] === q.answer).length;
  const visibleIds = () => questions.map((_, i) => i).filter(i => state.mode !== 'review' || !state.wrongOnly || state.answers[i] !== questions[i].answer);
  const questionsVisible = () => state.layout === 'exam' || state.questionsOpen || state.mode === 'review';

  function syncTime() {
    if (running) { const now = Date.now(); state.elapsed += Math.max(0, now - startedAt); startedAt = now; }
  }
  function renderTime() {
    const seconds = Math.floor((state.elapsed + (running ? Math.max(0, Date.now() - startedAt) : 0)) / 1000);
    $('timer').textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
    $('timer-toggle').textContent = running ? '暂停' : state.elapsed ? '继续计时' : '开始计时';
    $('timer-toggle').disabled = state.mode === 'review';
  }
  function stopTimer() { syncTime(); running = false; renderTime(); save(); }
  function startTimer() { if (state.mode === 'review' || running) return; running = true; startedAt = Date.now(); renderTime(); }

  function appendInline(parent, text) {
    const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      if (match[0].startsWith('**')) parent.append(el('strong', {}, match[0].slice(2, -2)));
      else {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(match[0]);
        parent.append(el('a', {href: safeURL(link[2]), target: '_blank', rel: 'noopener noreferrer'}, link[1]));
      }
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }
  function renderArticle() {
    document.title = lesson.article.title + ' · 阅读练习';
    $('brand').textContent = '英语阅读练习 · ' + lesson.collection;
    $('lesson-label').textContent = '第 ' + String(lesson.ordinal || 1).padStart(2, '0') + ' 篇 · 阅读与练习';
    $('lesson-info').textContent = `${total} 道拓展题 · 练习目标 ${lesson.exercise.suggestedMinutes} 分钟`;
    $('article-title').textContent = lesson.article.title;
    $('article-subtitle').textContent = lesson.article.subtitle;
    $('article-meta').textContent = lesson.article.author + ' · ' + lesson.article.date;
    $('reading-kicker').textContent = lesson.collection + (lesson.article.sourceLabel ? ' / ' + lesson.article.sourceLabel : '');
    $('catalog-link').hidden = defaults.standalone === true;
    $('official-source').href = safeURL(lesson.article.url);
    $('passage-ref').textContent = `Questions ${start}–${start + total - 1} refer to the following article.`;
    $('source-note').textContent = lesson.exercise.note || '';
    $('questions-title').textContent = `阅读练习 · ${total} 题`;
    $('progress').setAttribute('aria-valuemax', total);
    const reader = $('reader');
    reader.replaceChildren();
    for (const block of lesson.article.body.trim().split(/\n\s*\n/).filter(Boolean)) {
      const heading = /^###\s+/.test(block);
      const node = el(heading ? 'h3' : 'p');
      appendInline(node, heading ? block.replace(/^###\s+/, '') : block);
      reader.append(node);
    }
  }

  let renderedAid = null;
  function applyWordEmphasis() {
    if (renderedAid === state.readingAid) return;
    const regions = [$('article-subtitle'), ...$('reader').querySelectorAll('p')];
    for (const region of regions) {
      for (const cue of region.querySelectorAll('.word-cue')) cue.replaceWith(document.createTextNode(cue.textContent));
      region.normalize();
      if (state.readingAid === 'off') continue;
      const walker = document.createTreeWalker(region, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.parentElement.closest('strong,b')) nodes.push(walker.currentNode);
      }
      for (const node of nodes) {
        const fragment = document.createDocumentFragment();
        let offset = 0;
        for (const match of node.textContent.matchAll(/\b[A-Za-z]+(?:['’][A-Za-z]+)?\b/g)) {
          const word = match[0];
          if (word.replace(/['’]/g, '').length < 3) continue;
          fragment.append(document.createTextNode(node.textContent.slice(offset, match.index)));
          const amount = Math.min(word.length - 1, Math.max(1, state.readingAid === 'strong' ? Math.ceil(word.length * 0.55) : Math.round(word.length * 0.35)));
          const cue = el('span', {class: 'word-cue'});
          cue.append(el('span', {class: 'word-cue-lead'}, word.slice(0, amount)), document.createTextNode(word.slice(amount)));
          fragment.append(cue); offset = match.index + word.length;
        }
        fragment.append(document.createTextNode(node.textContent.slice(offset)));
        node.replaceWith(fragment);
      }
    }
    renderedAid = state.readingAid;
  }

  function scrollToQuestions() { $('questions-section').scrollIntoView({behavior: 'smooth', block: 'start'}); }
  function locateEvidence(question) {
    const paragraphs = [...$('reader').querySelectorAll('p')];
    paragraphs.forEach(p => p.classList.remove('evidence-highlight'));
    const found = paragraphs.find(p => p.textContent.toLowerCase().includes(question.needle.toLowerCase()));
    if (found) { found.classList.add('evidence-highlight'); found.scrollIntoView({behavior: 'smooth', block: 'center'}); announce('已高亮相关原文段落。'); }
    else announce('未匹配到相关段落，请参考解析中的位置说明。');
  }
  function jumpQuestion(i) {
    state.current = i; state.questionsOpen = true; render(); save();
    const target = $('question-' + i);
    if (target) { target.scrollIntoView({behavior: 'smooth', block: 'start'}); target.querySelector('h2').focus({preventScroll: true}); }
  }
  function render() {
    const review = state.mode === 'review';
    const ids = visibleIds();
    if (ids.length && !ids.includes(state.current)) state.current = ids[0];
    document.body.dataset.layout = state.layout;
    document.body.dataset.readingAid = state.readingAid;
    $('reading-aid-controls').hidden = state.layout !== 'reading';
    for (const level of aidLevels) $('aid-' + level).setAttribute('aria-pressed', String(state.readingAid === level));
    applyWordEmphasis();
    document.body.classList.toggle('reviewing', review);
    $('reading-layout').setAttribute('aria-pressed', String(state.layout === 'reading'));
    $('exam-layout').setAttribute('aria-pressed', String(state.layout === 'exam'));
    $('answer-mode').setAttribute('aria-pressed', String(!review));
    $('review-mode').setAttribute('aria-pressed', String(review));
    $('exercise-tools').hidden = !questionsVisible();
    $('questions-section').hidden = !questionsVisible();
    $('actions').hidden = !questionsVisible();
    $('reading-finish').hidden = questionsVisible();
    $('close-questions').hidden = state.layout !== 'reading';
    $('flag-current').disabled = ids.length === 0;
    $('flag-current').setAttribute('aria-pressed', String(state.flags[state.current]));
    $('flag-current').textContent = (state.flags[state.current] ? '取消标记 ' : '标记 ') + (start + state.current);
    $('progress-label').textContent = `已答 ${answerCount()} / ${total}`;
    $('progress-fill').style.width = (answerCount() / total * 100) + '%';
    $('progress').setAttribute('aria-valuenow', answerCount());
    $('result').hidden = !review;
    $('review-controls').hidden = !review;
    $('wrong-only').checked = state.wrongOnly;
    $('filter-count').textContent = state.wrongOnly ? `${ids.length} 题` : '';
    $('submit').hidden = review;
    $('back-answer').hidden = !review;
    $('nav-legend').textContent = review ? '绿色表示正确 · 红色表示错误或未答 · 小圆点表示已标记' : '灰色表示已答 · 小圆点表示已标记 · 边框表示当前题';
    const nav = $('question-nav'); nav.replaceChildren();
    questions.forEach((question, i) => {
      const button = el('button', {type: 'button', 'aria-label': `第 ${start + i} 题，${state.answers[i] === null ? '未答' : '已答'}${state.flags[i] ? '，已标记' : ''}`}, String(start + i));
      button.classList.toggle('answered', state.answers[i] !== null);
      button.classList.toggle('current', state.current === i && ids.includes(i));
      button.classList.toggle('flagged', state.flags[i]);
      if (review) button.classList.add(state.answers[i] === question.answer ? 'correct' : 'incorrect');
      if (state.current === i) button.setAttribute('aria-current', 'step');
      button.disabled = !ids.includes(i);
      button.addEventListener('click', () => jumpQuestion(i)); nav.append(button);
    });
    renderTime();
    if (review) {
      const result = $('result'); result.replaceChildren();
      const top = el('div', {class: 'result-top'});
      top.append(el('span', {class: 'score'}, `${correctCount()} / ${total}`), el('span', {class: 'small'}, `正确率 ${Math.round(correctCount() / total * 100)}%`));
      result.append(top, el('p', {}, `${state.submitted ? '已交卷' : '解答预览'} · 答错 ${answerCount() - correctCount()} 题 · 未答 ${total - answerCount()} 题 · 用时 ${$('timer').textContent}`), el('span', {class: 'small muted'}, '逐题核对依据，理解干扰项。'));
    }
    $('question-container').replaceChildren();
    $('empty-filter').hidden = ids.length > 0;
    if (questionsVisible()) ids.forEach(renderQuestion);
  }

  function renderQuestion(i) {
    const question = questions[i], review = state.mode === 'review';
    const article = el('article', {class: 'question', id: 'question-' + i});
    if (review) article.append(el('div', {class: 'qmeta'}, question.type));
    const stem = el('h2', {class: 'stem', id: 'question-stem-' + i, lang: 'en', tabindex: '-1'});
    stem.append(el('span', {class: 'question-number'}, (start + i) + '. '), document.createTextNode(question.stem));
    article.append(stem);
    const field = el('fieldset', {class: 'options', lang: 'en'});
    field.append(el('legend', {}, 'Choose the best answer.'));
    question.options.forEach((text, j) => {
      const label = el('label', {class: 'option' + (review ? ' review' : '')});
      const radio = el('input', {type: 'radio', name: 'q' + i, value: j, 'aria-label': letters[j] + '. ' + text});
      radio.checked = state.answers[i] === j; radio.disabled = review;
      const body = el('span', {}, text);
      label.append(radio, el('span', {class: 'letter'}, letters[j]), body);
      if (!review && radio.checked) label.classList.add('selected');
      if (review && j === question.answer) { label.classList.add('is-answer'); body.append(el('span', {class: 'answer-label'}, radio.checked ? '正确答案 · 你的选择' : '正确答案')); }
      if (review && radio.checked && j !== question.answer) { label.classList.add('is-wrong'); body.append(el('span', {class: 'answer-label'}, '你的选择 · 错误')); }
      radio.addEventListener('change', () => {
        state.answers[i] = j; state.current = i; state.submitted = false; startTimer(); render(); save();
        document.querySelector(`input[name="q${i}"][value="${j}"]`).focus({preventScroll: true});
        announce(`第 ${start + i} 题已作答，已完成 ${answerCount()} 题。`);
      });
      field.append(label);
    });
    article.append(field);
    if (review) {
      const analysis = el('section', {class: 'analysis', 'aria-label': '答案解析'});
      analysis.append(el('h3', {}, `答案 ${letters[question.answer]} · ${state.answers[i] === null ? '本题未作答' : state.answers[i] === question.answer ? '回答正确' : '需要复习'}`), el('p', {}, question.explain));
      const evidence = el('div', {class: 'evidence'}), row = el('div', {class: 'row'});
      evidence.append(el('strong', {}, '原文依据位置'), el('p', {}, question.where));
      const locate = el('button', {type: 'button', class: 'small'}, '返回原文依据');
      locate.addEventListener('click', () => locateEvidence(question));
      row.append(locate, el('a', {href: safeURL(lesson.article.url), target: '_blank', rel: 'noopener noreferrer', class: 'small'}, '对照官网 ↗'));
      evidence.append(row); analysis.append(evidence, el('h3', {}, '干扰项分析'));
      const list = el('ul'); question.traps.forEach(text => list.append(el('li', {}, text))); analysis.append(list);
      const detail = el('details'); detail.append(el('summary', {}, '解题提示'), el('p', {}, question.tip)); analysis.append(detail);
      if (question.source) analysis.append(el('a', {href: safeURL(question.source), target: '_blank', rel: 'noopener noreferrer', class: 'small'}, '延伸资料 ↗'));
      article.append(analysis);
    }
    $('question-container').append(article);
  }

  function hideAlert() { $('submit-alert').hidden = true; }
  function setLayout(layout) {
    state.layout = layout;
    if (!questionsVisible()) stopTimer();
    hideAlert(); render(); save(); announce('已切换到' + (layout === 'reading' ? '阅读版' : '考卷版') + '，答题进度已保留。');
  }
  function setMode(mode, submitted = false) {
    if (mode === 'review') stopTimer();
    state.mode = mode; state.questionsOpen = true;
    if (submitted) state.submitted = true;
    if (mode === 'answer') state.wrongOnly = false;
    hideAlert(); render(); save();
    announce(mode === 'review' ? '已显示答案与解析。' : '已进入答题阶段，答案与解析已隐藏。');
  }
  $('reading-layout').addEventListener('click', () => setLayout('reading'));
  $('exam-layout').addEventListener('click', () => setLayout('exam'));
  for (const level of aidLevels) $('aid-' + level).addEventListener('click', () => {
    state.readingAid = level; render(); save();
    announce('词首强调已设为' + ({off: '原样', soft: '轻度', strong: '明显'})[level] + '。');
  });
  $('answer-mode').addEventListener('click', () => { setMode('answer'); scrollToQuestions(); });
  $('review-mode').addEventListener('click', () => setMode('review'));
  $('back-answer').addEventListener('click', () => setMode('answer'));
  $('open-questions').addEventListener('click', () => { state.questionsOpen = true; render(); save(); scrollToQuestions(); });
  $('close-questions').addEventListener('click', () => {
    stopTimer(); state.questionsOpen = false; state.mode = 'answer'; state.wrongOnly = false; hideAlert(); render(); save();
    $('article').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
  $('flag-current').addEventListener('click', () => { state.flags[state.current] = !state.flags[state.current]; render(); save(); });
  $('submit').addEventListener('click', () => {
    const missing = questions.map((_, i) => i).filter(i => state.answers[i] === null);
    if (missing.length) { $('submit-alert-text').textContent = `还有 ${missing.length} 题未答（${missing.map(i => start + i).join('、')}）。未答题按未得分处理。`; $('submit-alert').hidden = false; $('submit-alert').scrollIntoView({behavior: 'smooth', block: 'center'}); }
    else { setMode('review', true); $('result').scrollIntoView({behavior: 'smooth', block: 'center'}); }
  });
  $('go-unanswered').addEventListener('click', () => { const first = state.answers.findIndex(x => x === null); hideAlert(); if (first >= 0) jumpQuestion(first); });
  $('submit-anyway').addEventListener('click', () => { setMode('review', true); $('result').scrollIntoView({behavior: 'smooth', block: 'center'}); });
  $('wrong-only').addEventListener('change', event => { state.wrongOnly = event.target.checked; render(); save(); });
  $('show-all').addEventListener('click', () => { state.wrongOnly = false; render(); save(); });
  $('timer-toggle').addEventListener('click', () => { running ? stopTimer() : startTimer(); renderTime(); });
  $('restart').addEventListener('click', () => $('reset-dialog').showModal());
  $('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
  $('confirm-reset').addEventListener('click', () => {
    running = false; const {layout, readingAid} = state; state = fresh(); state.layout = layout; state.readingAid = readingAid; $('reset-dialog').close();
    hideAlert(); render(); save(); announce('新一轮练习已开始，当前版式已保留。');
  });
  $('print-paper').addEventListener('click', () => window.print());
  $('download-paper').addEventListener('click', () => {
    const doc = new DOMParser().parseFromString(document.documentElement.outerHTML, 'text/html');
    doc.getElementById('export-defaults').textContent = JSON.stringify({layout: state.layout, readingAid: state.readingAid, standalone: true});
    for (const id of ['question-container', 'result', 'question-nav', 'live']) doc.getElementById(id).replaceChildren();
    for (const node of doc.querySelectorAll('.evidence-highlight')) node.classList.remove('evidence-highlight');
    doc.getElementById('reset-dialog').removeAttribute('open');
    const blob = new Blob(['<!doctype html>\n' + doc.documentElement.outerHTML], {type: 'text/html;charset=utf-8'});
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = lesson.id + '-' + state.layout + '.html'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    announce('已导出单一 HTML，包含完整原文、题目、两种版式和解析。');
  });
  document.addEventListener('visibilitychange', () => { syncTime(); save(); });
  window.addEventListener('pagehide', () => { syncTime(); save(); });
  setInterval(() => { renderTime(); if (running) { syncTime(); save(); } }, 1000);
  renderArticle(); render(); save();
})();
