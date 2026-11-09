(function () {
  'use strict';

  var STORE_KEY = 'campus_triage_chat_v1';
  var messagesEl = document.getElementById('messages');
  var scrollEl = document.getElementById('chatScroll');
  var inputEl = document.getElementById('input');
  var formEl = document.getElementById('composer');
  var sendBtn = document.getElementById('sendBtn');
  var progressCount = document.getElementById('progressCount');
  var progressBar = document.getElementById('progressBar');
  var progressList = document.getElementById('progressList');
  var riskState = document.getElementById('riskState');
  var stepBadge = document.getElementById('stepBadge');
  var summaryBtn = document.getElementById('summaryBtn');
  var resultLink = document.getElementById('resultLink');
  var resetBtn = document.getElementById('resetBtn');

  var AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  var RISK_SVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4l8.5 15h-17L12 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.4v4.3M12 16.6v.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';

  var session = loadSession();
  var busy = false;

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function loadSession() {
    var fallback = { state: Mock.createState(), messages: [] };
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.messages)) return fallback;
      var state = Mock.createState();
      Object.assign(state, parsed.state || {});
      if (!Array.isArray(state.associated)) state.associated = [];
      if (!Array.isArray(state.unknown)) state.unknown = [];
      return { state: state, messages: parsed.messages };
    } catch (err) {
      return fallback;
    }
  }

  function saveSession() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(session));
    } catch (err) {
      /* 忽略存储异常，不影响演示 */
    }
  }

  function initialMessages() {
    var chips = Mock.DEMO_CHIPS.map(function (c) {
      return { label: c.label, value: c.value, kind: c.danger ? 'danger' : 'demo' };
    });
    return [
      {
        id: uid(),
        role: 'assistant',
        type: 'text',
        text: '你好，我是校园智能预问诊助手。我会通过几个简短问题，帮你整理症状、识别风险，并给出就诊科室和就诊前准备建议。'
      },
      {
        id: uid(),
        role: 'assistant',
        type: 'text',
        text: '先说明一下边界：我不能做诊断，也不能开药或给出用药剂量，只做就医前信息整理。如果出现剧烈胸痛、呼吸困难、意识不清等情况，请立即拨打 120 或前往急诊。'
      },
      {
        id: uid(),
        role: 'assistant',
        type: 'text',
        text: '先说说你现在哪里不舒服？可以直接用一句话描述，也可以点下面的示例快速体验。',
        chips: chips
      }
    ];
  }

  function avatarNode() {
    var a = el('div', 'avatar');
    a.setAttribute('aria-hidden', 'true');
    a.innerHTML = AVATAR_SVG;
    return a;
  }

  function buildChips(chips) {
    var wrap = el('div', 'chips');
    chips.forEach(function (c) {
      var btn = el('button', 'chip' + (c.kind === 'danger' ? ' chip-danger' : c.kind === 'demo' ? ' chip-demo' : ''), c.label);
      btn.type = 'button';
      btn.dataset.value = c.value || c.label;
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function buildTextMessage(msg) {
    var row = el('div', 'msg msg-' + msg.role);
    if (msg.role === 'assistant') row.appendChild(avatarNode());
    var stack = el('div', 'msg-stack');
    var bubble = el('div', 'bubble', msg.text);
    stack.appendChild(bubble);
    if (msg.chips && msg.chips.length) stack.appendChild(buildChips(msg.chips));
    row.appendChild(stack);
    return row;
  }

  function buildRiskMessage(msg) {
    var risk = msg.risk;
    var row = el('div', 'msg msg-assistant');
    row.appendChild(avatarNode());
    var stack = el('div', 'msg-stack');
    var card = el('div', 'risk-card');

    var head = el('div', 'risk-head');
    var icon = el('span', 'risk-icon');
    icon.innerHTML = RISK_SVG;
    head.appendChild(icon);
    head.appendChild(el('strong', '', '高危提醒 · 常规问诊已暂停'));
    head.appendChild(el('span', 'risk-level', risk.level));
    card.appendChild(head);

    var body = el('div', 'risk-body');
    body.appendChild(el('h3', '', risk.title));
    body.appendChild(el('p', '', risk.advice));
    var list = el('ul');
    [
      '立即停止活动，坐下或半卧休息，避免独自行动',
      '请同伴陪同，尽快前往校医院急诊或就近医院急诊',
      '情况紧急或症状加重时，立即拨打 120',
      '不要自行驾车，也不要等待症状自行缓解'
    ].forEach(function (t) { list.appendChild(el('li', '', t)); });
    body.appendChild(list);

    var actions = el('div', 'risk-actions');
    var go = el('button', 'btn btn-primary', '查看就医指引与摘要');
    go.type = 'button';
    go.dataset.goResult = '1';
    actions.appendChild(go);
    body.appendChild(actions);
    body.appendChild(el('span', 'risk-foot', '本提醒由预设高危规则触发，仅用于原型演示，不能替代医生判断。'));

    card.appendChild(body);
    stack.appendChild(card);
    row.appendChild(stack);
    return row;
  }

  function buildSummaryMessage(msg) {
    var row = el('div', 'msg msg-assistant');
    row.appendChild(avatarNode());
    var stack = el('div', 'msg-stack');
    var card = el('div', 'summary-card');

    card.appendChild(el('span', 'summary-eyebrow', '本次问诊摘要'));
    card.appendChild(el('p', 'summary-text', msg.summary));

    var grid = el('div', 'summary-fields');
    (msg.fields || []).forEach(function (f) {
      var item = el('div', 'summary-field');
      item.appendChild(el('span', '', f.label));
      var value = el('b', '', f.unknown ? '未明确' : f.value);
      if (f.unknown) value.style.color = '#9aaba6';
      item.appendChild(value);
      grid.appendChild(item);
    });
    card.appendChild(grid);

    var go = el('button', 'btn btn-primary', '查看完整摘要与就医指引');
    go.type = 'button';
    go.dataset.goResult = '1';
    card.appendChild(go);
    card.appendChild(el('p', 'summary-note', '可在结果页复制摘要、查看科室引导与就诊前准备'));

    stack.appendChild(card);
    row.appendChild(stack);
    return row;
  }

  function renderMessage(msg) {
    var node;
    if (msg.type === 'risk') node = buildRiskMessage(msg);
    else if (msg.type === 'summary') node = buildSummaryMessage(msg);
    else node = buildTextMessage(msg);
    node.dataset.id = msg.id || '';
    return node;
  }

  function appendMessage(msg) {
    if (!msg.id) msg.id = uid();
    messagesEl.appendChild(renderMessage(msg));
    scrollToBottom();
  }

  function renderAll() {
    messagesEl.innerHTML = '';
    session.messages.forEach(function (msg) { appendMessage(msg); });
  }

  function pushMessage(msg) {
    if (!msg.id) msg.id = uid();
    session.messages.push(msg);
    appendMessage(msg);
    saveSession();
  }

  function scrollToBottom(smooth) {
    requestAnimationFrame(function () {
      scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  function showTyping() {
    var row = el('div', 'msg msg-assistant typing-row');
    row.appendChild(avatarNode());
    var stack = el('div', 'msg-stack');
    var bubble = el('div', 'bubble');
    bubble.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    stack.appendChild(bubble);
    row.appendChild(stack);
    messagesEl.appendChild(row);
    scrollToBottom();
    return row;
  }

  function setBusy(value) {
    busy = value;
    sendBtn.disabled = value;
    inputEl.disabled = value;
    messagesEl.querySelectorAll('.chip').forEach(function (c) {
      c.style.pointerEvents = value ? 'none' : '';
      c.style.opacity = value ? '.55' : '';
    });
  }

  function finishTurn() {
    setBusy(false);
    updateProgress();
    saveSession();
    inputEl.focus();
  }

  function send(rawText) {
    if (busy) return;
    var text = String(rawText === undefined ? inputEl.value : rawText).trim();
    if (!text) return;

    inputEl.value = '';
    autoGrow();
    setBusy(true);
    pushMessage({ role: 'user', type: 'text', text: text });

    var typing = showTyping();
    setTimeout(function () {
      var result = Mock.respond(text, session.state);
      if (typing.parentNode) typing.parentNode.removeChild(typing);

      if (!result.replies.length) {
        finishTurn();
        return;
      }

      result.replies.forEach(function (reply, index) {
        setTimeout(function () {
          pushMessage(Object.assign({ role: 'assistant' }, reply));
          if (index === result.replies.length - 1) finishTurn();
        }, index * 420);
      });
    }, 620);
  }

  function updateProgress() {
    var state = session.state;
    var filled = 0;
    Mock.FIELD_ORDER.forEach(function (field) {
      var li = progressList.querySelector('[data-field="' + field + '"]');
      if (!li) return;
      var done = Mock.isFilled(state, field);
      var unknown = state.unknown.indexOf(field) >= 0;
      li.classList.toggle('done', done);
      li.classList.toggle('unknown', !done && unknown);
      var em = li.querySelector('em');
      if (done) {
        em.textContent = '已记录';
        filled += 1;
      } else if (unknown) {
        em.textContent = '未明确';
      } else {
        em.textContent = '待采集';
      }
    });

    progressCount.textContent = filled + '/5';
    progressBar.style.width = (filled / 5 * 100) + '%';

    if (state.risk) {
      riskState.classList.add('alert');
      riskState.querySelector('span').textContent = '已触发高危提醒 · ' + state.risk.level;
      stepBadge.textContent = '已暂停问诊';
      stepBadge.style.background = 'var(--red-soft)';
      stepBadge.style.color = 'var(--red-deep)';
      stepBadge.style.borderColor = '#efcac6';
    } else if (state.summaryReady) {
      riskState.classList.remove('alert');
      riskState.querySelector('span').textContent = '未触发高危规则 · 摘要已生成';
      stepBadge.textContent = '问诊完成';
    } else {
      riskState.classList.remove('alert');
      riskState.querySelector('span').textContent = '未触发高危规则';
      stepBadge.textContent = '问诊中';
    }

    var ready = Boolean(state.summaryReady);
    summaryBtn.disabled = !ready;
    resultLink.disabled = !ready;
    resultLink.title = ready ? '查看本次预问诊结果' : '完成本次问诊后可查看';
    summaryBtn.title = ready ? '' : '完成本次问诊后可查看';
  }

  function goResult() {
    if (!session.state.summaryReady) {
      toast('请先完成本次问诊');
      return;
    }
    saveSession();
    window.location.href = 'result.html';
  }

  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }

  var toastTimer = null;
  function toast(text) {
    var node = document.querySelector('.toast');
    if (!node) {
      node = el('div', 'toast');
      document.body.appendChild(node);
    }
    node.textContent = text;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove('show'); }, 1800);
  }

  function bindEvents() {
    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      }
    });

    inputEl.addEventListener('input', autoGrow);

    messagesEl.addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (chip) {
        if (!busy) send(chip.dataset.value || chip.textContent);
        return;
      }
      var go = e.target.closest('[data-go-result]');
      if (go) goResult();
    });

    summaryBtn.addEventListener('click', goResult);
    resultLink.addEventListener('click', goResult);

    resetBtn.addEventListener('click', function () {
      if (!window.confirm('确定要重新开始本次问诊吗？当前对话将被清空。')) return;
      try { sessionStorage.removeItem(STORE_KEY); } catch (err) { /* noop */ }
      window.location.reload();
    });
  }

  function init() {
    if (!session.messages.length) {
      session.messages = initialMessages();
      saveSession();
    }
    renderAll();
    updateProgress();
    bindEvents();
    scrollToBottom(false);
    setTimeout(function () { inputEl.focus(); }, 120);
  }

  init();
})();
