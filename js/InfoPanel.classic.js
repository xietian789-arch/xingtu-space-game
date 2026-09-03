// InfoPanel.js —— 经典脚本版本（适配 file:// 协议）
(function () {

/**
 * 根据 tag 文本返回对应配色 CSS 类
 * 卫星=橙红、载人=蓝、出舱=青、对接=紫、落月=金、
 * 探火=红、采样=暗金、建站=靛蓝、月背=橘
 * @param {string} tag
 * @returns {string} CSS 类名
 */
function tagClassOf(tag = '') {
  if (tag.includes('月背')) return 'tag-farside';
  if (tag.includes('采样') || tag.includes('取样')) return 'tag-sample';
  if (tag.includes('建站')) return 'tag-station';
  if (tag.includes('探火')) return 'tag-mars';
  if (tag.includes('落月')) return 'tag-moonlanding';
  if (tag.includes('对接')) return 'tag-docking';
  if (tag.includes('出舱')) return 'tag-eva';
  if (tag.includes('载人')) return 'tag-crewed';
  if (tag.includes('卫星')) return 'tag-satellite';
  return '';
}

/** 十个任务共用同一结构，但拥有独立编号、对象代码与克制的渐变识别色。 */
const DETAIL_UI = {
  dongfanghong1:       { variant: 'v01', index: '01', code: 'OBJECT 01', accent: '105, 205, 231', accent2: '151, 126, 215' },
  shenzhou5:           { variant: 'v02', index: '02', code: 'OBJECT 02', accent: '102, 178, 226', accent2: '137, 131, 214' },
  shenzhou7:           { variant: 'v03', index: '03', code: 'OBJECT 03', accent: '91, 205, 215', accent2: '107, 135, 211' },
  tiangong1_shenzhou8: { variant: 'v04', index: '04', code: 'OBJECT 04', accent: '132, 170, 224', accent2: '159, 118, 207' },
  change3:             { variant: 'v05', index: '05', code: 'OBJECT 05', accent: '205, 185, 116', accent2: '104, 181, 205' },
  zhurong_rover:       { variant: 'v06', index: '06', code: 'OBJECT 06', accent: '199, 128, 112', accent2: '100, 177, 201' },
  tianwen1:            { variant: 'v06', index: '06', code: 'OBJECT 06', accent: '199, 128, 112', accent2: '100, 177, 201' },
  change5:             { variant: 'v07', index: '07', code: 'OBJECT 07', accent: '194, 166, 103', accent2: '139, 126, 196' },
  tianhe:              { variant: 'v08', index: '08', code: 'OBJECT 08', accent: '94, 160, 218', accent2: '129, 122, 202' },
  css_complete:        { variant: 'v09', index: '09', code: 'OBJECT 09', accent: '103, 165, 218', accent2: '109, 190, 208' },
  change6:             { variant: 'v10', index: '10', code: 'OBJECT 10', accent: '202, 148, 101', accent2: '143, 119, 196' },
};

/** 每个任务补充一条易懂的原理说明，并配一幅非等比线稿示意。 */
const DETAIL_CONTENT = {
  dongfanghong1: {
    science: '人造卫星并不是“停”在太空中，而是以足够快的横向速度持续绕地球自由落体。只要速度、方向和高度合适，卫星下落的轨迹就会与地球曲率相匹配，从而形成稳定轨道。',
    keywords: ['轨道运动', '无线电信号'],
    title: '轨道广播卫星', note: '卫星本体、天线与太阳翼示意',
    svg: '<path class="info-illus__ghost" d="M28 266 Q238 184 454 252"/><circle class="info-illus__ghost" cx="240" cy="230" r="118"/><g transform="translate(240 144)"><rect class="info-illus__fill" x="-42" y="-28" width="84" height="56" rx="8"/><path class="info-illus__line" d="M-42-18H-124V18H-42M42-18H124V18H42M-115-18V18M-91-18V18M91-18V18M115-18V18M-124 0H-42M42 0H124"/><circle class="info-illus__line" cx="0" cy="0" r="16"/><path class="info-illus__line" d="M0-28V-54M-12-53H12M0 28V48"/><path class="info-illus__signal" d="M55-45q30 14 38 42M63-61q41 18 53 57"/></g>',
  },
  shenzhou5: {
    science: '载人飞船返回地球时会高速穿过大气层，飞船前方空气被强烈压缩并产生高温。返回舱依靠防热结构承受热流，再通过降落伞和着陆缓冲装置逐步降低速度。',
    keywords: ['再入防热', '生命保障'],
    title: '载人返回系统', note: '返回舱与降落伞减速过程',
    svg: '<path class="info-illus__ghost" d="M35 270H445"/><g transform="translate(236 170)"><path class="info-illus__fill" d="M-58 56L-39-43Q0-78 39-43L58 56Z"/><path class="info-illus__line" d="M-39-43Q0-78 39-43M-52 24H52M-58 56H58"/><circle class="info-illus__line" cx="0" cy="-22" r="13"/><path class="info-illus__secondary" d="M0-63V-104M-72-128Q0-184 72-128M-72-128Q-42-86 0-104M72-128Q42-86 0-104M-72-128H72"/><path class="info-illus__signal" d="M-72 76Q0 96 72 76"/></g>',
  },
  shenzhou7: {
    science: '舱外环境几乎没有气压，也缺少可供呼吸的氧气。舱外航天服相当于一艘微型飞船，需要同时提供气压、供氧、温度调节、通信与微流星体防护。',
    keywords: ['舱外航天服', '生命保障'],
    title: '舱外活动系统', note: '航天员、气闸与安全系绳',
    svg: '<g transform="translate(205 155)"><circle class="info-illus__fill" cx="0" cy="-54" r="30"/><rect class="info-illus__fill" x="-37" y="-22" width="74" height="84" rx="18"/><path class="info-illus__line" d="M-28-55Q0-74 28-55M-37 2L-78 32M37 2L79-26M-18 62L-32 116M18 62L38 112"/><rect class="info-illus__secondary-fill" x="-51" y="-13" width="18" height="58" rx="5"/><path class="info-illus__signal" d="M75-27Q144-48 182 17Q201 50 184 82"/><circle class="info-illus__secondary" cx="184" cy="82" r="7"/></g><g transform="translate(420 182)"><rect class="info-illus__ghost-fill" x="-24" y="-68" width="48" height="136"/><path class="info-illus__ghost" d="M-24-34H24M-24 32H24M-46-68H-24M24-68H46"/></g>',
  },
  tiangong1_shenzhou8: {
    science: '交会对接不是简单地“追上去”。两个航天器必须先调整到相近轨道，再逐步匹配相对位置、速度和姿态，最后以很低的相对速度接触、捕获并完成刚性连接。',
    keywords: ['轨道交会', '相对导航'],
    title: '空间交会对接', note: '两飞行器沿同一轴线接近',
    svg: '<path class="info-illus__axis" d="M42 160H438"/><g transform="translate(145 160)"><rect class="info-illus__fill" x="-52" y="-34" width="80" height="68" rx="9"/><path class="info-illus__line" d="M28-20H55V20H28M-52-22H-106V22H-52M-98-22V22M-78-22V22"/><circle class="info-illus__secondary" cx="61" cy="0" r="13"/></g><g transform="translate(335 160)"><path class="info-illus__fill" d="M-28-35H48L68 0L48 35H-28Z"/><path class="info-illus__line" d="M48-35V35M68 0H94M-28-22H-76V22H-28M-67-22V22M-48-22V22"/><circle class="info-illus__secondary" cx="-35" cy="0" r="13"/></g><path class="info-illus__signal" d="M224 133l13 27-13 27M257 133l-13 27 13 27"/>',
  },
  change3: {
    science: '“软着陆”要求探测器在接触月面前把速度降到安全范围，并主动避开坡地、石块等危险区域。着陆器落稳后，月球车才能驶离平台开展巡视与科学探测。',
    keywords: ['软着陆', '月面巡视'],
    title: '月面着陆与巡视', note: '着陆器和月球车协同示意',
    svg: '<path class="info-illus__surface" d="M22 252Q86 227 150 248T278 246T458 250"/><g transform="translate(180 160)"><path class="info-illus__fill" d="M-43-24H43L32 39H-32Z"/><path class="info-illus__line" d="M-30 39L-62 91M30 39L64 91M-76 91H-48M48 91H78M-22-24L-7-58H7L22-24M0-58V-91M-10-91H10"/><path class="info-illus__secondary" d="M-42-5H42"/></g><g transform="translate(348 226)"><rect class="info-illus__fill" x="-42" y="-29" width="84" height="38" rx="5"/><circle class="info-illus__line" cx="-30" cy="18" r="13"/><circle class="info-illus__line" cx="30" cy="18" r="13"/><path class="info-illus__line" d="M0-29V-62M0-62H19M-42-19H-76M42-19H76"/></g>',
  },
  zhurong_rover: {
    science: '火星距离遥远，地面指令无法即时抵达，因此火星车需要具备一定自主导航与避障能力。它还要在低温、沙尘和有限能源条件下安排探测与行驶。',
    keywords: ['自主导航', '火星环境'],
    title: '火星巡视探测', note: '桅杆、太阳翼与六轮底盘',
    svg: '<path class="info-illus__surface" d="M20 252Q105 221 186 248T326 238T460 250"/><circle class="info-illus__ghost" cx="392" cy="74" r="34"/><g transform="translate(238 184)"><rect class="info-illus__fill" x="-74" y="-35" width="148" height="54" rx="8"/><path class="info-illus__line" d="M-74-24H-138V15H-74M74-24H138V15H74M-130-24V15M-106-24V15M106-24V15M130-24V15M0-35V-94M0-94H28M18-94V-76"/><circle class="info-illus__secondary-fill" cx="29" cy="-85" r="7"/><path class="info-illus__line" d="M-54 19L-69 48M0 19V49M54 19L69 48"/><circle class="info-illus__line" cx="-76" cy="55" r="14"/><circle class="info-illus__line" cx="-25" cy="55" r="14"/><circle class="info-illus__line" cx="25" cy="55" r="14"/><circle class="info-illus__line" cx="76" cy="55" r="14"/></g>',
  },
  tianwen1: {
    science: '“绕、落、巡”分别承担全球观测、进入着陆和表面移动探测。环绕器还可充当地球与火星车之间的通信中继，让不同平台组成协同探测系统。',
    keywords: ['绕落巡', '通信中继'],
    title: '火星综合探测', note: '环绕、着陆与巡视三阶段',
    svg: '<circle class="info-illus__ghost-fill" cx="240" cy="182" r="94"/><path class="info-illus__surface" d="M154 214Q236 164 326 217"/><ellipse class="info-illus__ghost" cx="240" cy="182" rx="171" ry="120" transform="rotate(-18 240 182)"/><g transform="translate(107 87) scale(.72)"><rect class="info-illus__fill" x="-35" y="-22" width="70" height="44" rx="6"/><path class="info-illus__line" d="M-35-13H-94V13H-35M35-13H94V13H35"/></g><g transform="translate(245 150)"><path class="info-illus__fill" d="M-28-18H28L20 25H-20Z"/><path class="info-illus__line" d="M-18 25L-37 54M18 25L37 54"/></g><g transform="translate(270 226) scale(.55)"><rect class="info-illus__secondary-fill" x="-52" y="-24" width="104" height="38" rx="6"/><circle class="info-illus__line" cx="-37" cy="24" r="13"/><circle class="info-illus__line" cx="37" cy="24" r="13"/></g><path class="info-illus__signal" d="M132 108Q183 128 216 147"/>',
  },
  change5: {
    science: '月球采样返回是一条环环相扣的链路：月面采集和封装、月面起飞、月球轨道交会对接、样品转移，以及返回器高速再入地球。任一环节都需要精确衔接。',
    keywords: ['采样封装', '月轨对接'],
    title: '月球采样返回', note: '采样器、上升器与返回轨迹',
    svg: '<path class="info-illus__surface" d="M22 258Q98 226 171 251T304 247"/><g transform="translate(144 184)"><path class="info-illus__fill" d="M-38-20H38L28 34H-28Z"/><path class="info-illus__line" d="M-25 34L-50 74M25 34L50 74M-38-2H38M0-20V-68M-15-68H15L23-20H-23Z"/></g><path class="info-illus__signal" d="M169 111Q241 45 319 93"/><g transform="translate(344 93) rotate(18)"><path class="info-illus__fill" d="M-32-17H32L23 24H-23Z"/><path class="info-illus__line" d="M-32-17Q0-42 32-17M-23 24H23"/></g><circle class="info-illus__ghost" cx="395" cy="230" r="49"/><path class="info-illus__signal" d="M371 189q32-34 65-8"/>',
  },
  tianhe: {
    science: '核心舱是空间站的“中枢”。它既要提供航天员长期生活所需的密闭环境、能源和生命保障，也承担姿态控制、信息管理以及多个方向的交会对接。',
    keywords: ['生命保障', '组合体控制'],
    title: '空间站核心舱', note: '核心舱、节点舱与太阳翼',
    svg: '<path class="info-illus__axis" d="M35 160H445"/><g transform="translate(240 160)"><rect class="info-illus__fill" x="-102" y="-35" width="204" height="70" rx="32"/><path class="info-illus__line" d="M-68-35V35M62-35V35M102-18H138V18H102M-102-17H-132V17H-102"/><circle class="info-illus__secondary" cx="-42" cy="0" r="20"/><path class="info-illus__line" d="M0-35V-69M0 35V69M-17-69H17M-17 69H17M-132-15H-211V15H-132M138-15H211V15H138M-198-15V15M-174-15V15M174-15V15M198-15V15"/></g>',
  },
  css_complete: {
    science: '空间站采用模块化建造：不同舱段分别承担控制、生活和科学实验任务，通过在轨交会对接组成整体。“T”字构型让两侧实验舱获得较好的视野与太阳翼工作空间。',
    keywords: ['模块化建造', '在轨实验室'],
    title: 'T 字空间站构型', note: '核心舱与两座实验舱组合',
    svg: '<path class="info-illus__axis" d="M38 162H442M240 40V280"/><g transform="translate(240 160)"><rect class="info-illus__fill" x="-42" y="-104" width="84" height="208" rx="34"/><circle class="info-illus__secondary" cx="0" cy="0" r="24"/><rect class="info-illus__fill" x="-164" y="-32" width="122" height="64" rx="28"/><rect class="info-illus__fill" x="42" y="-32" width="122" height="64" rx="28"/><path class="info-illus__line" d="M-164-16H-218V16H-164M164-16H218V16H164M-207-16V16M207-16V16M-22-104V-145M22-104V-145M-22-145H22M-22 104V145M22 104V145M-22 145H22"/></g>',
  },
  change6: {
    science: '月球背面始终背向地球，着陆器无法与地面直接通信，需要中继卫星在月球上空转发信号。采集到的月背样品能帮助科学家比较月球正面与背面的地质差异。',
    keywords: ['月背通信', '中继卫星'],
    title: '月背采样任务', note: '着陆区与中继通信链路',
    svg: '<circle class="info-illus__ghost-fill" cx="218" cy="194" r="100"/><path class="info-illus__surface" d="M132 224Q212 176 304 228"/><g transform="translate(214 184)"><path class="info-illus__fill" d="M-31-18H31L22 27H-22Z"/><path class="info-illus__line" d="M-20 27L-42 59M20 27L42 59M0-18V-54"/></g><g transform="translate(344 72) scale(.7)"><rect class="info-illus__fill" x="-31" y="-20" width="62" height="40" rx="6"/><path class="info-illus__line" d="M-31-12H-82V12H-31M31-12H82V12H31"/></g><circle class="info-illus__ghost" cx="428" cy="216" r="34"/><path class="info-illus__signal" d="M241 133Q285 72 321 75M370 84Q414 121 425 180"/><circle class="info-illus__secondary-fill" cx="214" cy="184" r="5"/>',
  },
};

class InfoPanel {
  /**
   * @param {Object} hooks
   * @param {Function} hooks.onClose 面板关闭后回调（主状态机据此恢复操控）
   */
  constructor(hooks = {}) {
    this.onClose = hooks.onClose || (() => {});

    this.mask = document.getElementById('info-panel');
    this.card = this.mask.querySelector('.info-card');
    this.closeBtn = document.getElementById('info-close-btn');
    this.elName = document.getElementById('info-name');
    this.elTag = document.getElementById('info-tag');
    this.elEra = document.getElementById('info-era');
    this.elIndex = document.getElementById('info-index');
    this.elDesc = document.getElementById('info-desc');
    this.elSig = document.getElementById('info-significance');
    this.elScience = document.getElementById('info-science');
    this.elKeywords = document.getElementById('info-keywords');
    this.elModelCode = document.getElementById('info-model-code');
    this.modelMount = document.getElementById('info-model-mount');
    this.illustration = document.getElementById('info-illustration');
    this.illustrationShell = this.mask.querySelector('.info-illustration-shell');
    this.illustrationTitle = document.getElementById('info-illustration-title');
    this.illustrationNote = document.getElementById('info-illustration-note');
    this.copy = this.mask.querySelector('.info-copy');
    this.visual = this.mask.querySelector('.info-visual');
    this.body = this.mask.querySelector('.info-body');
    this.sections = [...this.mask.querySelectorAll('.info-section')];
    this.orbits = [...this.mask.querySelectorAll('.info-orbit')];
    this.orbitNodes = [...this.mask.querySelectorAll('.info-orbit-node')];
    this.modelControls = this.mask.querySelector('.info-model-controls');

    this.visible = false;
    this.currentData = null;
    this._timeline = null;
    this._idleTweens = [];
    this._hideToken = 0;
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.closeBtn.addEventListener('click', () => this.hide());

    if (window.gsap && gsap.matchMedia) {
      this._motionMedia = gsap.matchMedia();
      this._motionMedia.add({
        reduce: '(prefers-reduced-motion: reduce)',
        full: '(prefers-reduced-motion: no-preference)',
      }, (context) => {
        this._reduceMotion = !!context.conditions.reduce;
      });
    }
  }

  /**
   * 展示代表物详情
   * @param {Object} data 代表物数据
   */
  show(data) {
    const layout = DETAIL_UI[data.id] || {
      variant: 'v01', index: '--', code: 'OBJECT --',
      accent: '105, 205, 231', accent2: '151, 126, 215',
    };

    this._hideToken += 1;
    this._killMotion();
    this.currentData = data;
    this.card.dataset.variant = layout.variant;
    this.card.style.setProperty('--info-accent-rgb', layout.accent);
    this.card.style.setProperty('--info-accent-2-rgb', layout.accent2);
    this.mask.style.setProperty('--info-accent-rgb', layout.accent);
    this.mask.style.setProperty('--info-accent-2-rgb', layout.accent2);
    this.elName.textContent = data.name;
    this.elName.dataset.outline = data.name;
    this.elTag.textContent = data.tag;
    this.elTag.className = 'info-tag ' + tagClassOf(data.tag);
    this.elEra.textContent = (data.era || '----').replace('年', '');
    this.elIndex.textContent = layout.index;
    this.elDesc.textContent = data.description;
    this.elSig.textContent = data.significance;
    this._renderEditorialContent(data);
    this.elModelCode.textContent = layout.code;
    this.modelMount.dataset.exhibitId = data.id;
    this.body.scrollTop = 0;
    this.markModelMounted(false);

    this.mask.classList.remove('hidden');
    this.mask.classList.add('show');
    this.mask.setAttribute('aria-hidden', 'false');
    this.visible = true;
    this._animateIn();
    this.closeBtn.focus({ preventScroll: true });

    // 通知详情模型查看器切换到当前任务，并复用稳定挂载容器。
    window.dispatchEvent(new CustomEvent('xingtu:detail-model-change', {
      detail: { data, mount: this.modelMount },
    }));
  }

  _renderEditorialContent(data) {
    const content = DETAIL_CONTENT[data.id] || {
      science: '航天任务需要在能源、通信、导航、热控与可靠性之间取得平衡。图中以简化方式呈现任务的主要对象与关系。',
      keywords: ['航天系统', '任务协同'],
      title: '航天任务示意', note: '非等比概念插图',
      svg: '<circle class="info-illus__ghost" cx="240" cy="160" r="92"/><path class="info-illus__axis" d="M54 160H426M240 38V282"/><circle class="info-illus__secondary-fill" cx="240" cy="160" r="12"/>',
    };

    this.elScience.textContent = content.science;
    this.elKeywords.innerHTML = '';
    content.keywords.forEach((keyword) => {
      const item = document.createElement('span');
      item.textContent = keyword;
      this.elKeywords.appendChild(item);
    });
    this.illustration.innerHTML = content.svg;
    this.illustrationTitle.textContent = content.title;
    this.illustrationNote.textContent = content.note;
  }

  /** 关闭面板并触发回调 */
  hide() {
    if (!this.visible) return;
    const token = ++this._hideToken;
    this._killMotion();
    this.mask.classList.remove('show');
    this.mask.setAttribute('aria-hidden', 'true');
    this.visible = false;

    const finish = () => {
      if (token !== this._hideToken || this.visible) return;
      this.mask.classList.add('hidden');
      if (window.gsap) {
        gsap.set([this.mask, this.card, this.copy, this.visual], { clearProps: 'transform,opacity,visibility' });
      }
    };

    if (!window.gsap || this._reduceMotion) {
      finish();
    } else {
      this._timeline = gsap.timeline({ onComplete: finish })
        .to([this.modelControls, ...this.sections], {
          autoAlpha: 0, y: 5, duration: .14, stagger: .025, ease: 'power1.in',
        })
        .to(this.visual, {
          autoAlpha: 0, x: 12, duration: .18, ease: 'power2.in',
        }, '<')
        .to(this.card, {
          autoAlpha: 0, y: 10, scale: .992, duration: .22, ease: 'power2.in',
        }, '<.02')
        .to(this.mask, { autoAlpha: 0, duration: .18, ease: 'power1.in' }, '<.03');
    }

    window.dispatchEvent(new CustomEvent('xingtu:detail-model-change', {
      detail: { data: null, mount: this.modelMount },
    }));
    this.currentData = null;
    this.onClose();
  }

  /** 后续模型代码的固定挂载点。 */
  getModelMount() {
    return this.modelMount;
  }

  /** 模型接入后调用，以隐藏占位标记并切换抓取光标。 */
  markModelMounted(mounted = true) {
    this.modelMount.classList.toggle('has-model', !!mounted);
  }

  _killMotion() {
    if (this._timeline) {
      this._timeline.kill();
      this._timeline = null;
    }
    this._idleTweens.forEach((tween) => tween.kill());
    this._idleTweens.length = 0;
    if (window.gsap) {
      gsap.killTweensOf([
        this.mask, this.card, this.copy, this.visual, ...this.sections,
        ...this.orbits, ...this.orbitNodes, this.modelControls,
      ]);
    }
  }

  _animateIn() {
    if (!window.gsap || this._reduceMotion) {
      this.mask.style.opacity = '1';
      this.mask.style.visibility = 'visible';
      return;
    }

    const copyParts = [
      this.mask.querySelector('.info-eyebrow'),
      this.mask.querySelector('.info-header'),
      ...this.sections,
      this.mask.querySelector('.info-footer'),
    ];

    gsap.set([this.mask, this.card, this.copy, this.visual, ...copyParts,
      ...this.orbits, ...this.orbitNodes, this.modelControls], {
      clearProps: 'transform,opacity,visibility',
    });
    gsap.set(this.mask, { autoAlpha: 1 });

    this._timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      .addLabel('open', 0)
      .fromTo(this.card,
        { autoAlpha: 0, y: 18, scale: .985 },
        { autoAlpha: 1, y: 0, scale: 1, duration: .42 },
        'open')
      .fromTo(this.copy,
        { autoAlpha: 0, x: -12 },
        { autoAlpha: 1, x: 0, duration: .38 },
        'open+=.08')
      .fromTo(this.visual,
        { autoAlpha: 0, x: 16 },
        { autoAlpha: 1, x: 0, duration: .44 },
        'open+=.10')
      .fromTo(copyParts,
        { autoAlpha: 0, y: 9 },
        { autoAlpha: 1, y: 0, duration: .32, stagger: .055 },
        'open+=.16')
      .fromTo(this.orbits,
        { autoAlpha: 0, scale: .86 },
        { autoAlpha: 1, scale: 1, duration: .55, stagger: .07 },
        'open+=.17')
      .fromTo(this.orbitNodes,
        { autoAlpha: 0, scale: .5 },
        { autoAlpha: 1, scale: 1, duration: .25, stagger: .08 },
        'open+=.30')
      .fromTo(this.modelControls,
        { autoAlpha: 0, y: 7 },
        { autoAlpha: 1, y: 0, duration: .30 },
        'open+=.35');

    // 仅在详情页可见时运行两个极慢的合成层旋转，关闭时立即清理。
    this._idleTweens.push(
      gsap.to(this.orbits[0], { rotation: 360, duration: 44, repeat: -1, ease: 'none' }),
      gsap.to(this.orbits[1], { rotation: -360, duration: 58, repeat: -1, ease: 'none' })
    );
  }
}

XINGTU.tagClassOf = tagClassOf;
XINGTU.InfoPanel = InfoPanel;

})();
