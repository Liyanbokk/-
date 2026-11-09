(function () {
  'use strict';

  var STORE_KEY = 'campus_triage_chat_v1';
  var demoMode = false;
  var state = loadState();
  var result = Mock.buildResult(state);

  var generatedAt = document.getElementById('generatedAt');
  var turnCount = document.getElementById('turnCount');
  var completeness = document.getElementById('completeness');
  var demoFlag = document.getElementById('demoFlag');
  var riskBanner = document.getElementById('riskBanner');
  var summaryText = document.getElementById('summaryText');
  var fieldGrid = document.getElementById('fieldGrid');
  var missingNote = document.getElementById('missingNote');
  var deptTop = document.getElementById('deptTop');
  var deptName = document.getElementById('deptName');
  var deptAlt = document.getElementById('deptAlt');
  var reasons = document.getElementById('reasons');
  var deptNote = document.getElementById('deptNote');
  var prepList = document.getElementById('prepList');
  var knowledgeList = document.getElementById('knowledgeList');
  var sideTurns = document.getElementById('sideTurns');
  var sideFilled = document.getElementById('sideFilled');
  var sideMissing = document.getElementById('sideMissing');
  var sideRisk = document.getElementById('sideRisk');
  var copyBtn = document.getElementById('copyBtn');
  var copyBtn2 = document.getElementById('copyBtn2');
  var printBtn = document.getElementById('printBtn');
  var restartBtn = document.getElementById('restartBtn');

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function loadState() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'risk') {
      demoMode = true;
      return Mock.demoRiskState();
    }
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.state && parsed.state.summaryReady) {
          var merged = Mock.createState();
          Object.assign(merged, parsed.state);
          if (!Array.isArray(merged.associated)) merged.associated = [];
          if (!Array.isArray(merged.unknown)) merged.unknown = [];
          return merged;
        }
      }
    } catch (err) {
      /* 忽略，使用示例数据 */
    }
    demoMode = true;
    return Mock.demoState();
  }

  function formatTime(ts) {
    var d = new Date(ts);
    function pad(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderRisk() {
    if (!result.risk) return;
    var banner = el('div', 'risk-banner');
    var icon = el('div', 'risk-banner-icon');
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4l8.5 15h-17L12 4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.4v4.3M12 16.6v.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
    banner.appendChild(icon);

    var body = el('div');
    body.appendChild(el('span', 'risk-tag', '高危提醒 · 建议优先线下就医'));
    body.appendChild(el('h2', '', '本次问诊触发了「' + result.risk.title + '」'));
    body.appendChild(el('p', '', result.risk.advice));

    var list = el('ul');
    [
      '立即停止活动，由同伴陪同前往急诊',
      '情况紧急或症状加重时，立即拨打 120',
      '不要自行驾车或等待症状自行缓解',
      '就诊时告知医生症状开始时间与用药情况'
    ].forEach(function (t) { list.appendChild(el('li', '', t)); });
    body.appendChild(list);

    banner.appendChild(body);
    riskBanner.appendChild(banner);
  }

  function renderSummary() {
    summaryText.textContent = result.summary;
    result.fields.forEach(function (f) {
      var item = el('div', 'field');
      var value = f.unknown ? '未明确' : f.value;
      if (value === '待补充') {
        value = result.risk ? '未采集' : '待补充';
        item.classList.add('is-missing');
      }
      if (f.unknown) item.classList.add('is-missing');
      item.appendChild(el('span', '', f.label));
      item.appendChild(el('b', '', value));
      fieldGrid.appendChild(item);
    });

    if (result.risk) {
      missingNote.classList.add('alert');
      missingNote.style.display = 'block';
      missingNote.textContent = '因触发高危提醒，本次问诊提前结束，部分信息未采集。请优先线下就医，缺失信息可在就诊时由医生补充。';
    } else if (result.missing.length) {
      missingNote.style.display = 'block';
      missingNote.textContent = '尚未明确：' + result.missing.join('、') + '。你可以在就诊时向医生说明，或返回对话补充。';
    }
  }

  function renderDept() {
    if (result.risk) deptTop.classList.add('is-risk');
    deptName.textContent = result.dept.primary;
    deptAlt.textContent = result.dept.alternative;
    result.dept.reasons.forEach(function (reason, index) {
      var li = el('li');
      li.appendChild(el('span', 'num', String(index + 1)));
      li.appendChild(el('span', '', reason));
      reasons.appendChild(li);
    });
    deptNote.textContent = result.dept.note;
  }

  function renderPrep() {
    result.prep.forEach(function (text) {
      var li = el('li');
      var label = el('label');
      var input = document.createElement('input');
      input.type = 'checkbox';
      label.appendChild(input);
      label.appendChild(el('span', '', text));
      li.appendChild(label);
      prepList.appendChild(li);
    });
  }

  function renderKnowledge() {
    result.knowledge.forEach(function (item) {
      var card = el('div', 'knowledge-item');
      card.appendChild(el('h3', '', item.title));
      card.appendChild(el('p', '', item.summary));
      var meta = el('div', 'knowledge-meta');
      var source = el('span', 'source-pill');
      source.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 4h9l4 4v12H6V4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12h7M9 16h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      source.appendChild(document.createTextNode(item.source));
      meta.appendChild(source);
      meta.appendChild(el('span', 'update-pill', '更新于 ' + item.updated));
      card.appendChild(meta);
      knowledgeList.appendChild(card);
    });
  }

  function renderSide() {
    var confirmed = result.fields.filter(function (f) {
      return f.value !== '待补充' && !f.unknown;
    }).length;
    sideTurns.textContent = result.turns + ' 轮';
    sideFilled.textContent = confirmed + '/5';
    sideMissing.textContent = result.missing.length ? result.missing.length + ' 项' : '无';
    sideMissing.title = result.missing.join('、');
    if (result.risk) {
      sideRisk.textContent = '已触发 · ' + result.risk.level;
      sideRisk.classList.add('alert');
    } else {
      sideRisk.textContent = '未触发';
    }
  }

  function buildCopyText() {
    var lines = [];
    lines.push('【就诊前症状摘要】');
    lines.push(result.summary);
    result.fields.forEach(function (f) {
      var value = f.unknown ? '未明确' : (f.value === '待补充' ? '未采集' : f.value);
      lines.push(f.label + '：' + value);
    });
    lines.push('');
    lines.push('建议就诊：' + result.dept.primary + (result.dept.alternative ? '（备选：' + result.dept.alternative + '）' : ''));
    lines.push('就诊前准备：');
    result.prep.forEach(function (p) { lines.push('· ' + p); });
    if (result.risk) {
      lines.push('');
      lines.push('【高危提醒】' + result.risk.title + '：' + result.risk.advice);
    }
    lines.push('');
    lines.push('提示：本摘要由校园智能预问诊助手整理，仅作就医前信息参考，不构成诊断。');
    return lines.join('\n');
  }

  function copySummary() {
    var text = buildCopyText();
    function done() { toast('摘要已复制到剪贴板'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        done();
      } catch (err) {
        toast('复制失败，请手动选择文本');
      }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
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
    copyBtn.addEventListener('click', copySummary);
    copyBtn2.addEventListener('click', copySummary);
    printBtn.addEventListener('click', function () { window.print(); });
    restartBtn.addEventListener('click', function () {
      if (!window.confirm('确定要清空本次结果并重新开始吗？')) return;
      try { sessionStorage.removeItem(STORE_KEY); } catch (err) { /* noop */ }
      window.location.href = 'index.html';
    });
  }

  function init() {
    generatedAt.textContent = formatTime(result.generatedAt);
    turnCount.textContent = result.turns + ' 轮';
    completeness.textContent = result.completeness + '%';
    if (demoMode) demoFlag.style.display = 'inline-flex';

    renderRisk();
    renderSummary();
    renderDept();
    renderPrep();
    renderKnowledge();
    renderSide();
    bindEvents();
  }

  init();
})();
