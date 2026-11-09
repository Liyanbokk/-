/* 校园智能预问诊 · 前端模拟引擎
 * 仅用于原型交互演示：所有话术、规则、知识条目均为模拟数据，不构成诊断或治疗建议。
 */
(function (global) {
  'use strict';

  var FIELD_ORDER = ['part', 'onset', 'duration', 'severity', 'associated'];
  var FIELD_LABELS = {
    part: '症状部位',
    onset: '起病时间',
    duration: '持续时间',
    severity: '严重程度',
    associated: '伴随表现'
  };

  var SYMPTOMS = [
    { name: '咽痛', part: '咽喉', re: /咽痛|喉咙痛|嗓子疼|嗓子痛|喉咙疼/ },
    { name: '发热', part: '', re: /发热|发烧|低热|高热|体温高/ },
    { name: '咳嗽', part: '呼吸道', re: /咳嗽|干咳|咳痰/ },
    { name: '鼻塞流涕', part: '鼻部', re: /鼻塞|流涕|流鼻涕|打喷嚏/ },
    { name: '腹痛', part: '腹部', re: /腹痛|肚子痛|肚子疼|胃痛/ },
    { name: '腹泻', part: '腹部', re: /腹泻|拉肚子/ },
    { name: '恶心', part: '腹部', re: /恶心/ },
    { name: '呕吐', part: '腹部', re: /呕吐|吐了/ },
    { name: '头痛', part: '头部', re: /头痛|头疼/ },
    { name: '头晕', part: '头部', re: /头晕|眩晕/ },
    { name: '胸闷', part: '胸部', re: /胸闷/ },
    { name: '胸痛', part: '胸部', re: /胸痛|胸口痛/ },
    { name: '心慌', part: '胸部', re: /心慌|心悸/ },
    { name: '皮疹瘙痒', part: '皮肤', re: /皮疹|起疹|瘙痒|发痒/ },
    { name: '失眠', part: '睡眠', re: /失眠|睡不着/ },
    { name: '乏力', part: '全身', re: /乏力|没力气|浑身没劲/ }
  ];

  var PART_WORDS = [
    { re: /咽喉|喉咙|嗓子/, part: '咽喉', fallback: '咽部不适' },
    { re: /太阳穴|头部|头疼|头痛|头晕/, part: '头部', fallback: '头部不适' },
    { re: /肚子|腹部|胃部|胃痛/, part: '腹部', fallback: '腹部不适' },
    { re: /胸口|胸部|心口|胸闷|胸痛/, part: '胸部', fallback: '胸部不适' },
    { re: /皮肤|身上起|皮疹/, part: '皮肤', fallback: '皮肤不适' },
    { re: /鼻子|鼻部|鼻塞/, part: '鼻部', fallback: '鼻部不适' },
    { re: /腰|背部/, part: '腰背部', fallback: '腰背部不适' },
    { re: /关节|膝盖|脚踝/, part: '关节', fallback: '关节不适' },
    { re: /全身|浑身/, part: '全身', fallback: '全身不适' }
  ];

  var ASSOCIATED = [
    { label: '发热', re: /发热|发烧|低热|高热/ },
    { label: '咳嗽', re: /咳嗽|干咳/ },
    { label: '咽痛', re: /咽痛|喉咙痛|嗓子疼/ },
    { label: '鼻塞/流涕', re: /鼻塞|流涕|流鼻涕/ },
    { label: '恶心', re: /恶心/ },
    { label: '呕吐', re: /呕吐|吐了/ },
    { label: '腹泻', re: /腹泻|拉肚子/ },
    { label: '头晕', re: /头晕|眩晕/ },
    { label: '头痛', re: /头痛|头疼/ },
    { label: '乏力', re: /乏力|没力气|浑身没劲/ },
    { label: '皮疹', re: /皮疹|瘙痒|发痒/ },
    { label: '心慌', re: /心慌|心悸/ }
  ];

  var RISK_RULES = [
    {
      id: 'chest',
      level: '紧急',
      title: '胸部不适伴大汗或呼吸困难',
      test: function (t) {
        return /(胸痛|胸口痛|胸闷|心口痛)/.test(t) &&
          /(大汗|出汗|呼吸困难|喘不上气|喘不过气|憋气|濒死|放射|左肩|晕)/.test(t);
      },
      advice: '你描述的症状包含胸部不适，并伴有大汗、呼吸困难或晕厥等表现。这组信号需要立即处理，可能存在紧急情况，不建议继续等待或自行观察。'
    },
    {
      id: 'breath',
      level: '紧急',
      title: '明显呼吸困难',
      test: function (t) { return /(呼吸困难|喘不上气|喘不过气|无法呼吸|窒息|憋得慌)/.test(t); },
      advice: '你提到明显的呼吸困难或憋气，这属于需要立即评估的高危信号，请优先线下急诊处理。'
    },
    {
      id: 'conscious',
      level: '紧急',
      title: '意识异常或晕厥',
      test: function (t) { return /(晕厥|晕倒|昏迷|意识不清|意识模糊|抽搐|抽风)/.test(t); },
      advice: '你提到晕厥、意识异常或抽搐，这属于需要立即处理的高危信号，请立即寻求现场帮助并前往急诊。'
    },
    {
      id: 'bleed',
      level: '较紧急',
      title: '出血相关表现',
      test: function (t) { return /(咯血|呕血|吐血|黑便|大量出血|鼻血止不住)/.test(t); },
      advice: '你提到出血相关表现，建议尽快线下就医评估，不要自行处理或继续等待。'
    },
    {
      id: 'headache',
      level: '较紧急',
      title: '剧烈头痛',
      test: function (t) { return /(剧烈头痛|头痛欲裂|头疼欲裂|爆炸样头痛)/.test(t); },
      advice: '你提到剧烈头痛，建议尽快线下就医评估，由医生判断是否需要紧急处理。'
    }
  ];

  var CHIPS = {
    part: ['咽喉', '头部', '腹部', '胸部', '皮肤'],
    onset: ['今天', '昨天', '2–3 天前', '一周以上'],
    duration: ['几小时', '1–2 天', '3 天以上', '说不清'],
    severity: ['轻微，不影响', '中等，有点影响', '较重，影响作息', '剧烈，难以忍受'],
    associated: ['发热', '恶心呕吐', '头晕', '咳嗽', '没有其他不适']
  };

  var DEMO_CHIPS = [
    { label: '示例：咽痛、低热两天', value: '咽痛、低热两天' },
    { label: '示例：腹痛伴腹泻一天', value: '腹痛伴腹泻一天' },
    { label: '示例：胸闷、大汗、喘不上气', value: '胸闷、大汗、喘不上气', danger: true }
  ];

  var CN_NUM = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '半': 0.5 };

  function toNumber(raw) {
    if (/^\d+$/.test(raw)) return Number(raw);
    if (CN_NUM[raw] !== undefined) return CN_NUM[raw];
    if (/^十[一二三四五六七八九]$/.test(raw)) return 10 + CN_NUM[raw[1]];
    return raw;
  }

  function createState() {
    return {
      symptom: '',
      part: '',
      onset: '',
      duration: '',
      severity: '',
      associated: [],
      associatedNegative: false,
      onsetInferred: false,
      unknown: [],
      risk: null,
      summaryReady: false,
      closed: false,
      turns: 0
    };
  }

  function isFilled(state, field) {
    if (field === 'associated') return state.associated.length > 0 || state.associatedNegative;
    return Boolean(state[field]);
  }

  function pendingField(state) {
    for (var i = 0; i < FIELD_ORDER.length; i++) {
      var f = FIELD_ORDER[i];
      if (state.unknown.indexOf(f) >= 0) continue;
      if (isFilled(state, f)) continue;
      if (f === 'onset' && state.duration) continue;
      return f;
    }
    return null;
  }

  function isUnknown(text) {
    return /(不清楚|不知道|说不清|说不好|记不清|不确定|没注意|忘了)/.test(text);
  }

  function detectRisk(text) {
    for (var i = 0; i < RISK_RULES.length; i++) {
      if (RISK_RULES[i].test(text)) {
        var r = RISK_RULES[i];
        return { id: r.id, level: r.level, title: r.title, advice: r.advice };
      }
    }
    return null;
  }

  function extract(text, state) {
    if (!state.part) {
      for (var i = 0; i < PART_WORDS.length; i++) {
        if (PART_WORDS[i].re.test(text)) {
          state.part = PART_WORDS[i].part;
          break;
        }
      }
    }

    if (!state.symptom) {
      var hits = SYMPTOMS.filter(function (s) { return s.re.test(text); });
      if (hits.length) {
        state.symptom = hits.map(function (h) { return h.name; }).join('、');
        var partHit = hits.filter(function (h) { return h.part && h.part !== '全身'; })[0];
        if (!state.part && partHit) state.part = partHit.part;
      } else {
        for (var j = 0; j < PART_WORDS.length; j++) {
          if (PART_WORDS[j].re.test(text) && !state.symptom) {
            state.symptom = PART_WORDS[j].fallback;
            break;
          }
        }
      }
    } else {
      ASSOCIATED.forEach(function (a) {
        if (!a.re.test(text)) return;
        if (state.symptom.indexOf(a.label) >= 0) return;
        if (state.associated.indexOf(a.label) >= 0) return;
        if (/(没有|无|不伴|不发热|不咳嗽)/.test(text)) return;
        state.associated.push(a.label);
      });
      if (/(没有其他|无其他|没有别的|没什么其他|没有不适|无不适|没有其他不适)/.test(text)) {
        state.associatedNegative = true;
      }
    }

    if (!state.onset) {
      var onsetText = text;
      var range = onsetText.match(/(\d+)\s*[–\-~至]\s*(\d+)\s*天前/);
      if (range) {
        state.onset = range[1] + '–' + range[2] + '天前';
      } else {
        var day = onsetText.match(/([0-9一两二三四五六七八九十]+)\s*天前/);
        if (day) {
          state.onset = toNumber(day[1]) + '天前';
        } else if (/一周前|上周/.test(onsetText)) {
          state.onset = '一周前';
        } else if (/几天前/.test(onsetText)) {
          state.onset = '几天前';
        } else if (/今天上午|今早|今天早上/.test(onsetText)) {
          state.onset = '今天上午';
        } else if (/今天/.test(onsetText)) {
          state.onset = '今天';
        } else if (/昨晚/.test(onsetText)) {
          state.onset = '昨晚';
        } else if (/昨天/.test(onsetText)) {
          state.onset = '昨天';
        } else if (/前天/.test(onsetText)) {
          state.onset = '前天';
        } else if (/刚才|刚刚/.test(onsetText)) {
          state.onset = '刚才';
        }
      }
    }

    if (!state.duration) {
      var durRange = text.match(/(\d+)\s*[–\-~至]\s*(\d+)\s*(天|日|小时|周)/);
      if (durRange) {
        state.duration = durRange[1] + '–' + durRange[2] + (durRange[3] === '日' ? '天' : durRange[3]);
      } else {
        var dur = text.match(/([0-9一两二三四五六七八九十半]+)\s*(天|日|小时|周|星期|个星期|个月)\s*(以上|多)?/);
        if (dur) {
          var unit = dur[2] === '日' ? '天' : (dur[2] === '个星期' || dur[2] === '星期' ? '周' : dur[2]);
          state.duration = toNumber(dur[1]) + unit + (dur[3] || '');
        } else if (/几小时/.test(text)) {
          state.duration = '数小时';
        } else if (/半天/.test(text)) {
          state.duration = '半天';
        }
      }
    }

    if (!state.severity) {
      if (/(剧烈|无法忍受|难以忍受|疼得厉害|非常严重)/.test(text)) {
        state.severity = '剧烈';
      } else if (/(较重|严重|影响作息|影响睡眠|很明显)/.test(text)) {
        state.severity = '较重';
      } else if (/(中等|有点影响|影响上课|明显)/.test(text)) {
        state.severity = '中等';
      } else if (/(轻微|轻度|一点点|不太|还好|不影响)/.test(text)) {
        state.severity = '轻微';
      }
    }

    if (!state.onset && state.duration) {
      state.onset = state.duration + '前';
      state.onsetInferred = true;
    }
  }

  function questionFor(field, state) {
    switch (field) {
      case 'part':
        return '主要是哪个部位不舒服？可以直接说，比如「喉咙」「肚子」「头」。';
      case 'onset':
        return '大概是什么时候开始的？';
      case 'duration':
        return '到现在持续多久了？';
      case 'severity':
        return '目前不适到什么程度？是否影响上课或睡眠？';
      case 'associated':
        return '除了' + (state.symptom || '这些不适') + '，还有没有其他伴随症状？';
      default:
        return '还有其他需要补充的信息吗？';
    }
  }

  function chipsFor(field) {
    return (CHIPS[field] || []).map(function (c) { return { label: c, value: c }; });
  }

  function snapshotFilled(state) {
    var map = {};
    FIELD_ORDER.forEach(function (f) { map[f] = isFilled(state, f); });
    return map;
  }

  function buildAck(state, before, unknownAnswer) {
    var parts = [];
    FIELD_ORDER.forEach(function (f) {
      if (before[f] || !isFilled(state, f)) return;
      if (f === 'part') parts.push('好的，不适主要集中在' + state.part + '。');
      if (f === 'onset' && !state.onsetInferred) parts.push(state.onset + '开始出现症状，我记下了。');
      if (f === 'duration') parts.push('持续约' + state.duration + '。');
      if (f === 'severity') parts.push('目前程度为' + state.severity + '。');
      if (f === 'associated') {
        parts.push(state.associated.length
          ? '伴随' + state.associated.join('、') + '，已记录。'
          : '暂未记录到其他伴随症状。');
      }
    });
    if (unknownAnswer) parts.push('没关系，这一项可以先留空，之后想起来可以再补充。');
    return parts.join('');
  }

  function respond(rawText, state) {
    var text = String(rawText || '').trim();
    var replies = [];
    state.turns += 1;
    if (!text) return { replies: replies, state: state };

    if (state.closed) {
      replies.push({
        type: 'text',
        text: '常规问诊已暂停。请优先按照上面的高危提示尽快线下就医，不要等待症状自行缓解。'
      });
      return { replies: replies, state: state };
    }

    var risk = detectRisk(text);
    if (risk) {
      extract(text, state);
      state.risk = risk;
      state.summaryReady = true;
      state.closed = true;
      replies.push({ type: 'risk', risk: risk });
      return { replies: replies, state: state };
    }

    if (state.summaryReady) {
      replies.push({
        type: 'text',
        text: '本次摘要已经生成。你可以查看上方摘要卡片，或点击「重新开始」发起新的问诊。'
      });
      return { replies: replies, state: state };
    }

    var before = snapshotFilled(state);
    var pendingBefore = pendingField(state);
    var unknownAnswer = isUnknown(text);

    extract(text, state);

    if (unknownAnswer && pendingBefore && !isFilled(state, pendingBefore) && state.unknown.indexOf(pendingBefore) < 0) {
      state.unknown.push(pendingBefore);
    }

    var ack = buildAck(state, before, unknownAnswer);
    var next = pendingField(state);

    if (!next) {
      state.summaryReady = true;
      if (ack) replies.push({ type: 'text', text: ack });
      replies.push({
        type: 'text',
        text: '信息收集完成。我整理了本次问诊摘要，请核对后查看完整结果与就医指引。'
      });
      replies.push({
        type: 'summary',
        summary: buildSummary(state),
        fields: fieldSnapshot(state)
      });
      return { replies: replies, state: state };
    }

    replies.push({
      type: 'text',
      text: (ack ? ack + '\n\n' : '') + questionFor(next, state),
      chips: chipsFor(next)
    });
    return { replies: replies, state: state };
  }

  function fieldSnapshot(state) {
    return FIELD_ORDER.map(function (f) {
      var value = '';
      if (f === 'associated') {
        value = state.associated.length
          ? state.associated.join('、')
          : (state.associatedNegative ? '无其他明显伴随症状' : '');
      } else {
        value = state[f] || '';
      }
      return {
        key: f,
        label: FIELD_LABELS[f],
        value: value || '待补充',
        unknown: state.unknown.indexOf(f) >= 0
      };
    });
  }

  function buildSummary(state) {
    var sym = state.symptom || '身体不适';
    var lead = '';
    if (state.onset && !state.onsetInferred) {
      lead = state.onset + '开始出现' + sym;
      if (state.duration) lead += '，已持续约' + state.duration;
    } else if (state.duration) {
      lead = '近' + state.duration + '出现' + sym;
    } else {
      lead = '近期出现' + sym;
    }
    var parts = [lead];
    if (state.severity) parts.push('程度' + state.severity);
    if (state.associated.length) {
      parts.push('伴' + state.associated.join('、'));
    } else if (state.associatedNegative) {
      parts.push('无其他明显伴随症状');
    }
    var summary = parts.join('，') + '。';
    if (state.unknown.length) {
      summary += '（' + state.unknown.map(function (f) { return FIELD_LABELS[f]; }).join('、') + '未明确）';
    }
    return summary;
  }

  var DEPT_RULES = [
    {
      re: /(胸闷|胸痛|心慌|心悸)/,
      primary: '心血管内科',
      alternative: '全科门诊',
      reason: '胸部不适需要先排除心肺方面的问题，心血管内科可进行初步评估；校医院未开设该专科时，可先到全科门诊。',
      prep: '就诊时避免剧烈活动，尽量由同伴陪同；如医生可能安排心电图检查，穿着便于检查的衣物。'
    },
    {
      re: /(咽痛|咳嗽|发热|鼻塞|流涕)/,
      primary: '呼吸内科',
      alternative: '全科门诊',
      reason: '症状集中在咽喉、呼吸道或伴有发热，呼吸内科可进行初步评估；校医院未开设该专科时，可先到全科门诊。',
      prep: '就诊时佩戴口罩，减少交叉感染风险；提前记录最高体温和测量时间。'
    },
    {
      re: /(腹痛|腹泻|恶心|呕吐|胃痛)/,
      primary: '消化内科',
      alternative: '全科门诊',
      reason: '症状集中在腹部或消化道，消化内科可进行初步评估；如腹痛突然加重，请直接前往急诊。',
      prep: '如医生可能安排抽血或腹部检查，提前咨询是否需要空腹；记录腹泻次数和性状。'
    },
    {
      re: /(头痛|头晕|失眠)/,
      primary: '神经内科',
      alternative: '全科门诊',
      reason: '以头痛、头晕或睡眠问题为主，神经内科可进行初步评估；校医院未开设该专科时，可先到全科门诊。',
      prep: '记录头痛或头晕的发作频率、持续时间和诱因，尽量由同伴陪同前往。'
    },
    {
      re: /(皮疹|瘙痒|过敏)/,
      primary: '皮肤科',
      alternative: '全科门诊',
      reason: '症状集中在皮肤，皮肤科可进行初步评估；校医院未开设该专科时，可先到全科门诊。',
      prep: '不要自行涂抹药膏，保留皮疹原始状态以便医生查看；记录可能的接触史或饮食史。'
    },
    {
      re: /(外伤|扭伤|擦伤|摔伤|骨折)/,
      primary: '外科门诊',
      alternative: '急诊（伤情较重时）',
      reason: '存在外伤或扭伤，外科门诊可进行初步评估；如出现明显肿胀、畸形或无法活动，请直接前往急诊。',
      prep: '减少受伤部位活动，不要自行复位；如为开放性伤口，先用清洁敷料覆盖。'
    }
  ];

  var KNOWLEDGE = {
    '呼吸内科': {
      title: '咽喉不适与发热的就诊提示',
      summary: '向医生说明起病时间、最高体温、是否伴咳嗽或咽痛加重，以及已经使用过的药物名称。',
      source: '校医院门诊服务信息（公开资料整理）',
      updated: '2026-10-08'
    },
    '消化内科': {
      title: '腹痛腹泻就诊前需要说明什么',
      summary: '记录腹痛位置、腹泻次数、粪便性状以及近期饮食情况，便于医生快速判断。',
      source: '健康科普知识库（示例条目）',
      updated: '2026-10-12'
    },
    '心血管内科': {
      title: '胸部不适就诊时应告诉医生什么',
      summary: '说明不适的诱因、持续时间、是否向肩背放射，以及是否伴心慌、出汗或呼吸困难。',
      source: '健康科普知识库（示例条目）',
      updated: '2026-09-26'
    },
    '神经内科': {
      title: '头痛头晕的就诊记录要点',
      summary: '记录发作时间、频率、诱因和缓解方式；如伴视物模糊、肢体无力或言语不清，应尽快就医。',
      source: '健康科普知识库（示例条目）',
      updated: '2026-09-20'
    },
    '皮肤科': {
      title: '皮疹就诊前的注意事项',
      summary: '就诊前避免搔抓和自行用药，拍照记录皮疹变化，并回忆近期接触物、饮食和用药情况。',
      source: '健康科普知识库（示例条目）',
      updated: '2026-10-02'
    },
    '外科门诊': {
      title: '外伤后的初步处理原则',
      summary: '受伤后减少活动，可先冷敷；如伤口出血不止、肢体变形或无法承重，请尽快前往急诊。',
      source: '校园常见意外处理指引（示例条目）',
      updated: '2026-09-15'
    },
    '全科门诊': {
      title: '校医院门诊就诊流程',
      summary: '携带校园卡先到导诊台分诊，向医生出示症状摘要，按指引完成挂号、检查与取药。',
      source: '校医院门诊服务信息（公开资料整理）',
      updated: '2026-10-18'
    }
  };

  var GENERAL_PREP = [
    '携带校园卡、医保卡（如使用）及少量现金',
    '记录体温和症状变化时间线（本页摘要可直接出示）',
    '如正在服用药物，记下药名、剂量和服用时间',
    '如有药物过敏史或既往病史，提前告知医生'
  ];

  var RISK_PREP = [
    '立即停止活动，由同伴陪同前往急诊',
    '携带校园卡和手机，保持通讯畅通',
    '不要自行驾车或独自前往',
    '如出现意识不清、呼吸困难加重，立即拨打 120',
    '准备好症状开始时间、用药情况和既往病史，便于急诊医生快速判断'
  ];

  function pickDept(state) {
    var corpus = [state.symptom, state.part, state.associated.join(' ')].join(' ');
    var matched = null;
    for (var i = 0; i < DEPT_RULES.length; i++) {
      if (DEPT_RULES[i].re.test(corpus)) {
        matched = DEPT_RULES[i];
        break;
      }
    }
    var dept = {
      primary: matched ? matched.primary : '全科门诊',
      alternative: matched ? matched.alternative : '校医院导诊台',
      reasons: [],
      note: '就诊科室最终以校医院当日排班和导诊建议为准；如症状明显加重，请及时复诊或前往急诊。'
    };
    dept.reasons = [
      '主要不适为' + (state.symptom || '身体不适') + (state.part ? '，症状部位集中在' + state.part : '') + '。',
      matched
        ? matched.reason
        : '当前症状不指向单一专科，建议先到全科门诊，由医生进行初步评估和分流。',
      state.risk
        ? '已触发「' + state.risk.title + '」高危信号，请优先前往急诊，不要按普通门诊流程等待。'
        : '本次对话未触发预设高危规则；如症状明显加重，请及时复诊或前往急诊。'
    ];
    if (matched) dept.specificPrep = matched.prep;
    return dept;
  }

  function buildKnowledge(dept, risk) {
    var items = [];
    items.push(risk
      ? {
        title: '哪些情况需要立即就医',
        summary: '胸痛伴大汗、明显呼吸困难、意识改变、晕厥、大量出血等属于需要优先处理的高危信号，应立即寻求紧急医疗帮助。',
        source: '校园常见急症识别指引（示例条目）',
        updated: '2026-09-18'
      }
      : {
        title: '就诊前如何准备症状信息',
        summary: '按时间顺序记录症状开始时间、变化过程、诱因和缓解因素，有助于医生快速了解情况。',
        source: '健康科普知识库（示例条目）',
        updated: '2026-10-20'
      });
    items.push({
      title: '体温与发热的居家记录',
      summary: '记录测量时间、体温数值和测量方式；如持续高热或伴明显不适，应尽快线下就医。',
      source: '中国疾控中心健康科普（示例引用）',
      updated: '2026-08-30'
    });
    items.push(risk
      ? {
        title: '到急诊后如何快速说明情况',
        summary: '直接说明最主要的症状、开始时间、是否伴大汗或呼吸困难，以及既往病史和正在使用的药物，便于医生快速判断。',
        source: '校园常见急症识别指引（示例条目）',
        updated: '2026-09-18'
      }
      : (function () {
        var deptItem = KNOWLEDGE[dept.primary] || KNOWLEDGE['全科门诊'];
        return {
          title: deptItem.title,
          summary: deptItem.summary,
          source: deptItem.source,
          updated: deptItem.updated
        };
      })());
    return items;
  }

  function buildResult(state) {
    var risk = state.risk;
    var dept = pickDept(state);

    if (risk) {
      dept.primary = '急诊科（优先）';
      dept.alternative = '校医院急诊（如开放）';
      dept.reasons = [
        '已触发「' + risk.title + '」高危信号，需要优先进行线下急诊评估。',
        '高危信号的判断以现场医生评估为准，请勿等待症状自行缓解。',
        '如无法立即到达校医院，请直接拨打 120 或前往就近医院急诊。'
      ];
      dept.note = '本次科室引导以“优先急诊”为原则，不按普通门诊流程等待。';
      dept.specificPrep = '';
    }

    var fields = fieldSnapshot(state);
    var confirmed = fields.filter(function (f) { return f.value !== '待补充' && !f.unknown; }).length;
    var prep = risk ? RISK_PREP.slice() : GENERAL_PREP.concat(dept.specificPrep ? [dept.specificPrep] : []);

    return {
      generatedAt: Date.now(),
      summary: buildSummary(state),
      fields: fields,
      missing: fields.filter(function (f) { return !f.value || f.value === '待补充' || f.unknown; }).map(function (f) { return f.label; }),
      dept: dept,
      prep: prep,
      knowledge: buildKnowledge(dept, risk),
      risk: risk,
      completeness: Math.round(confirmed / fields.length * 100),
      turns: state.turns
    };
  }

  function demoState() {
    var s = createState();
    s.symptom = '咽痛、发热';
    s.part = '咽喉';
    s.onset = '2天前';
    s.onsetInferred = true;
    s.duration = '2天';
    s.severity = '中等';
    s.associated = ['咳嗽'];
    s.associatedNegative = false;
    s.turns = 4;
    s.summaryReady = true;
    return s;
  }

  function demoRiskState() {
    var s = createState();
    s.symptom = '胸闷';
    s.part = '胸部';
    s.turns = 1;
    s.risk = detectRisk('胸闷、大汗、喘不上气');
    s.summaryReady = true;
    s.closed = true;
    return s;
  }

  var api = {
    FIELD_ORDER: FIELD_ORDER,
    FIELD_LABELS: FIELD_LABELS,
    DEMO_CHIPS: DEMO_CHIPS,
    createState: createState,
    respond: respond,
    buildResult: buildResult,
    buildSummary: buildSummary,
    buildAck: buildAck,
    fieldSnapshot: fieldSnapshot,
    detectRisk: detectRisk,
    pendingField: pendingField,
    isFilled: isFilled,
    demoState: demoState,
    demoRiskState: demoRiskState
  };

  global.Mock = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
