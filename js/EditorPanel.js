/**
 * EditorPanel.js —— 游戏内编辑面板模块
 * ------------------------------------------------------------
 * 职责：提供完整的游戏内代表物编辑界面：
 *  1. 左侧 30% 代表物列表（按 timeline_order 排序，可点击选中）
 *  2. 右侧 70% 属性编辑表单（名称 / tag / 年代 / 位置 / 缩放 /
 *     交互距离 / 描述 / 历史意义 / 模型路径 / 发光颜色）
 *  3. 保存修改 / 新增 / 删除 / 重新加载 / 导出 JSON
 *  4. 实时预览：位置 / 缩放 / 颜色 / 名称等修改立即同步到 3D 场景
 *  5. 未保存修改时标题栏显示红色星号 *
 *
 * 注意：浏览器安全限制下无法直接写回本地文件，
 * 「保存修改」只更新内存数据；「导出 JSON」以文件下载方式保存。
 */

import { tagClassOf } from './InfoPanel.js';

/** 这些字段的修改会立即同步到 3D 场景（实时预览） */
const PREVIEW_FIELDS = new Set([
  'f-name', 'f-tag', 'f-era',
  'f-pos-x', 'f-pos-y', 'f-pos-z',
  'f-scale', 'f-glow',
]);

class EditorPanel {
  /**
   * @param {GameData} gameData 数据层
   * @param {ExhibitManager} exhibitManager 代表物管理器
   * @param {HUD} hud HUD（用其 toast）
   * @param {Object} hooks
   * @param {Function} hooks.onDataChanged 数据增删 / 保存后通知主模块刷新 HUD
   * @param {Function} hooks.onCloseRequested 请求关闭面板（主模块负责恢复 pointer lock）
   */
  constructor(gameData, exhibitManager, hud, hooks = {}) {
    this.gameData = gameData;
    this.exhibitManager = exhibitManager;
    this.hud = hud;
    this.onDataChanged = hooks.onDataChanged || (() => {});
    this.onCloseRequested = hooks.onCloseRequested || (() => this.close());

    this.mask = document.getElementById('editor-panel');
    this.listEl = document.getElementById('editor-list');
    this.dirtyMark = document.getElementById('editor-dirty');

    // 表单字段
    this.fields = {
      name: document.getElementById('f-name'),
      tag: document.getElementById('f-tag'),
      era: document.getElementById('f-era'),
      posX: document.getElementById('f-pos-x'),
      posY: document.getElementById('f-pos-y'),
      posZ: document.getElementById('f-pos-z'),
      scale: document.getElementById('f-scale'),
      distance: document.getElementById('f-distance'),
      glow: document.getElementById('f-glow'),
      model: document.getElementById('f-model'),
      desc: document.getElementById('f-desc'),
      significance: document.getElementById('f-significance'),
    };

    /** 当前选中的代表物 id */
    this.selectedId = null;
    /** 未提交的草稿：id → 数据副本 */
    this.drafts = new Map();
    /** 面板是否打开 */
    this.visible = false;

    this._bindButtons();
    this._bindForm();
  }

  /* ==================== 打开 / 关闭 ==================== */

  open() {
    this.visible = true;
    this.renderList();
    if (!this.selectedId || !this.gameData.getExhibit(this.selectedId)) {
      const first = this.gameData.getExhibits()[0];
      this.selectedId = first ? first.id : null;
    }
    this._highlightSelected();
    this._fillForm();
    this.mask.classList.remove('hidden');
    void this.mask.offsetWidth;
    this.mask.classList.add('show');
  }

  close() {
    this.visible = false;
    this.mask.classList.remove('show');
    setTimeout(() => {
      if (!this.visible) this.mask.classList.add('hidden');
    }, 320);
  }

  /* ==================== 列表 ==================== */

  /** 渲染左侧代表物列表（按 timeline_order 排序） */
  renderList() {
    const exhibits = this.gameData.getExhibits();
    this.listEl.innerHTML = '';

    exhibits.forEach((ex) => {
      const draft = this.drafts.get(ex.id) || ex;
      const li = document.createElement('li');
      li.dataset.id = ex.id;
      if (ex.id === this.selectedId) li.classList.add('selected');

      const top = document.createElement('div');
      top.className = 'ex-item-top';
      const order = document.createElement('span');
      order.className = 'ex-order';
      order.textContent = draft.timeline_order;
      const name = document.createElement('span');
      name.className = 'ex-name';
      name.textContent = draft.name;
      top.append(order, name);

      const bottom = document.createElement('div');
      bottom.className = 'ex-item-bottom';
      const tag = document.createElement('span');
      tag.className = 'ex-tag ' + tagClassOf(draft.tag);
      tag.textContent = draft.tag;
      const era = document.createElement('span');
      era.className = 'ex-era';
      era.textContent = draft.era;
      bottom.append(tag, era);

      li.append(top, bottom);
      li.addEventListener('click', () => {
        this.selectedId = ex.id;
        this._highlightSelected();
        this._fillForm();
      });
      this.listEl.appendChild(li);
    });
  }

  _highlightSelected() {
    this.listEl.querySelectorAll('li').forEach((li) => {
      li.classList.toggle('selected', li.dataset.id === this.selectedId);
    });
  }

  /* ==================== 表单 ==================== */

  /** 当前选中代表物的草稿（无草稿则取数据层深拷贝） */
  _getDraft() {
    if (!this.selectedId) return null;
    if (!this.drafts.has(this.selectedId)) {
      const ex = this.gameData.getExhibit(this.selectedId);
      if (!ex) return null;
      this.drafts.set(this.selectedId, JSON.parse(JSON.stringify(ex)));
    }
    return this.drafts.get(this.selectedId);
  }

  /** 草稿 / 数据 → 表单 */
  _fillForm() {
    const d = this._getDraft();
    if (!d) return;
    const f = this.fields;
    f.name.value = d.name ?? '';
    f.tag.value = d.tag ?? '';
    f.era.value = d.era ?? '';
    f.posX.value = d.position?.[0] ?? 0;
    f.posY.value = d.position?.[1] ?? 0;
    f.posZ.value = d.position?.[2] ?? 0;
    f.scale.value = d.scale ?? 1;
    f.distance.value = d.interaction_distance ?? 12;
    f.glow.value = d.glow_color || '#4488FF';
    f.model.value = d.model_path ?? '';
    f.desc.value = d.description ?? '';
    f.significance.value = d.significance ?? '';
  }

  /** 表单任意字段变化 → 写入草稿 + 未保存标记 + 实时预览 */
  _bindForm() {
    Object.values(this.fields).forEach((el) => {
      el.addEventListener('input', (e) => this._onFieldChange(e));
    });
  }

  _onFieldChange(e) {
    const draft = this._getDraft();
    if (!draft) return;
    const f = this.fields;

    // 文本类字段
    draft.name = f.name.value;
    draft.tag = f.tag.value;
    draft.era = f.era.value;
    draft.model_path = f.model.value;
    draft.description = f.desc.value;
    draft.significance = f.significance.value;
    draft.glow_color = f.glow.value;

    // 数值字段（输入非法时保留旧值）
    const px = parseFloat(f.posX.value);
    const py = parseFloat(f.posY.value);
    const pz = parseFloat(f.posZ.value);
    if (!Number.isNaN(px)) draft.position[0] = px;
    if (!Number.isNaN(py)) draft.position[1] = py;
    if (!Number.isNaN(pz)) draft.position[2] = pz;

    const scale = parseFloat(f.scale.value);
    if (!Number.isNaN(scale) && scale > 0) draft.scale = scale;

    const dist = parseFloat(f.distance.value);
    if (!Number.isNaN(dist) && dist > 0) draft.interaction_distance = dist;

    this._markDirty(true);

    // 实时预览：仅场景相关字段变化时重建 3D 对象
    if (PREVIEW_FIELDS.has(e.target.id)) {
      this.exhibitManager.rebuildExhibit(draft);
      this.renderList(); // 列表中的名称 / tag / 年代同步刷新
      this._highlightSelected();
      this.onDataChanged();
    }
  }

  _markDirty(dirty) {
    this.dirtyMark.classList.toggle('hidden', !dirty);
  }

  /* ==================== 工具栏按钮 ==================== */

  _bindButtons() {
    document.getElementById('editor-save').addEventListener('click', () => this.save());
    document.getElementById('editor-add').addEventListener('click', () => this.addNew());
    document.getElementById('editor-delete').addEventListener('click', () => this.deleteSelected());
    document.getElementById('editor-reload').addEventListener('click', () => this.reload());
    document.getElementById('editor-export').addEventListener('click', () => this.exportJSON());
    document.getElementById('editor-close-btn').addEventListener('click', () => {
      this.onCloseRequested && this.onCloseRequested();
    });
  }

  /** 保存修改：草稿写回内存数据并刷新场景 */
  save(silent = false) {
    let count = 0;
    for (const [id, draft] of this.drafts) {
      if (this.gameData.updateExhibit(id, draft)) {
        this.exhibitManager.rebuildExhibit(this.gameData.getExhibit(id));
        count++;
      }
    }
    this.drafts.clear();
    this._markDirty(false);
    this.onDataChanged();
    if (!silent) {
      this.hud.toast(count > 0
        ? `已保存 ${count} 项修改（内存数据已更新，导出 JSON 可持久化）`
        : '没有需要保存的修改');
    }
  }

  /** 新增代表物：列表末尾添加空白记录，自动分配 id */
  addNew() {
    const created = this.gameData.addExhibit();
    this.exhibitManager.buildExhibit(created);
    this.selectedId = created.id;
    this.renderList();
    this._fillForm();
    this.onDataChanged();
    this.hud.toast(`已新增「${created.name}」，请在右侧编辑属性`);
    // 滚动到可见
    this.listEl.querySelector(`li[data-id="${created.id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  /** 删除代表物（带确认对话框） */
  deleteSelected() {
    if (!this.selectedId) return;
    const ex = this.gameData.getExhibit(this.selectedId);
    if (!ex) return;

    if (!window.confirm(`确定删除「${ex.name}」吗？\n删除立即生效，可通过「重新加载」恢复原始数据。`)) {
      return;
    }
    this.gameData.removeExhibit(this.selectedId);
    this.exhibitManager.removeExhibit(this.selectedId);
    this.drafts.delete(this.selectedId);
    this.selectedId = this.gameData.getExhibits()[0]?.id ?? null;
    this.renderList();
    this._fillForm();
    this.onDataChanged();
    this.hud.toast(`已删除「${ex.name}」`);
  }

  /** 重新加载：丢弃内存修改，重新从 exhibits.json 读取 */
  async reload() {
    try {
      await this.gameData.reload();
    } catch (err) {
      this.hud.toast('重新加载失败：' + err.message);
      return;
    }
    this.drafts.clear();
    this._markDirty(false);
    this.exhibitManager.buildAll(this.gameData.getExhibits());
    this.selectedId = this.gameData.getExhibits()[0]?.id ?? null;
    this.renderList();
    this._fillForm();
    this.onDataChanged();
    this.hud.toast('已从 exhibits.json 重新加载全部数据');
  }

  /** 导出 JSON：序列化当前数据并触发下载 */
  exportJSON() {
    // 先提交未保存草稿，保证导出内容最新
    this.save(true);
    this.gameData.downloadJSON();
    this.hud.toast('exhibits.json 已下载，请用它覆盖 data/exhibits.json（并同步 data/exhibits.js 镜像）');
  }
}

export default EditorPanel;
