/**
 * InfoPanel.js —— 代表物详情面板模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 全屏遮罩 + 居中卡片式布局，展示代表物的名称 / tag / 年代 /
 *     描述 / 历史意义
 *  2. 弹出与关闭的淡入淡出动画
 *  3. 关闭按钮 + ESC 返回（ESC 由主状态机统一监听）
 */

/**
 * 根据 tag 文本返回对应配色 CSS 类
 * 卫星=橙红、载人=蓝、出舱=青、对接=紫、落月=金、
 * 探火=红、采样=暗金、建站=靛蓝、月背=橘
 * @param {string} tag
 * @returns {string} CSS 类名
 */
export function tagClassOf(tag = '') {
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

class InfoPanel {
  /**
   * @param {Object} hooks
   * @param {Function} hooks.onClose 面板关闭后回调（主状态机据此恢复操控）
   */
  constructor(hooks = {}) {
    this.onClose = hooks.onClose || (() => {});

    this.mask = document.getElementById('info-panel');
    this.elName = document.getElementById('info-name');
    this.elTag = document.getElementById('info-tag');
    this.elEra = document.getElementById('info-era');
    this.elDesc = document.getElementById('info-desc');
    this.elSig = document.getElementById('info-significance');

    this.visible = false;

    document.getElementById('info-close-btn').addEventListener('click', () => this.hide());
    document.getElementById('info-ok-btn').addEventListener('click', () => this.hide());
  }

  /**
   * 展示代表物详情
   * @param {Object} data 代表物数据
   */
  show(data) {
    this.elName.textContent = data.name;
    this.elTag.textContent = data.tag;
    this.elTag.className = 'info-tag ' + tagClassOf(data.tag);
    this.elEra.textContent = data.era;
    this.elDesc.textContent = data.description;
    this.elSig.textContent = data.significance;

    this.mask.classList.remove('hidden');
    // 强制回流后再加 show，保证过渡动画生效
    void this.mask.offsetWidth;
    this.mask.classList.add('show');
    this.visible = true;
  }

  /** 关闭面板并触发回调 */
  hide() {
    if (!this.visible) return;
    this.mask.classList.remove('show');
    this.visible = false;
    // 等淡出动画结束再隐藏 DOM
    setTimeout(() => {
      if (!this.visible) this.mask.classList.add('hidden');
    }, 320);
    this.onClose();
  }
}

export default InfoPanel;
