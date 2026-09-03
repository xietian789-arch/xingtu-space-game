// EditorPanel.js —— 经典脚本版本（浮动侧边栏 + TransformControls）
(function () {

const { tagClassOf } = XINGTU;

/** 这些字段的修改会立即同步到 3D 场景（实时预览） */
const PREVIEW_FIELDS = new Set([
  'f-name', 'f-tag', 'f-era',
  'f-pos-x', 'f-pos-y', 'f-pos-z',
  'f-rot-x', 'f-rot-y', 'f-rot-z',
  'f-scl-x', 'f-scl-y', 'f-scl-z',
  'f-scale', 'f-glow',
]);

class EditorPanel {
  /**
   * @param {GameData} gameData 数据层
   * @param {ExhibitManager} exhibitManager 代表物管理器
   * @param {HUD} hud HUD（用其 toast）
   * @param {Object} ctx 上下文
   * @param {THREE.Scene} ctx.scene
   * @param {THREE.Camera} ctx.camera
   * @param {THREE.WebGLRenderer} ctx.renderer
   * @param {THREE.Group} ctx.astronautGroup 宇航员 group
   * @param {Object} hooks
   */
  constructor(gameData, exhibitManager, hud, ctx = {}, hooks = {}) {
    this.gameData = gameData;
    this.exhibitManager = exhibitManager;
    this.hud = hud;
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.renderer = ctx.renderer;
    this.astronautGroup = ctx.astronautGroup;
    this.onDataChanged = hooks.onDataChanged || (() => {});
    this.onCloseRequested = hooks.onCloseRequested || (() => this.close());

    // DOM 元素
    this.mask = document.getElementById('editor-panel');
    this.listEl = document.getElementById('editor-list');
    this.dirtyMark = document.getElementById('editor-dirty');
    this.selectionInfo = document.getElementById('editor-selection-info');

    // 表单字段
    this.fields = {
      name: document.getElementById('f-name'),
      tag: document.getElementById('f-tag'),
      era: document.getElementById('f-era'),
      posX: document.getElementById('f-pos-x'),
      posY: document.getElementById('f-pos-y'),
      posZ: document.getElementById('f-pos-z'),
      rotX: document.getElementById('f-rot-x'),
      rotY: document.getElementById('f-rot-y'),
      rotZ: document.getElementById('f-rot-z'),
      sclX: document.getElementById('f-scl-x'),
      sclY: document.getElementById('f-scl-y'),
      sclZ: document.getElementById('f-scl-z'),
      scale: document.getElementById('f-scale'),
      scaleVal: document.getElementById('f-scale-val'),
      distance: document.getElementById('f-distance'),
      glow: document.getElementById('f-glow'),
      model: document.getElementById('f-model'),
      desc: document.getElementById('f-desc'),
      significance: document.getElementById('f-significance'),
    };

    /** 当前选中的代表物 id */
    this.selectedId = null;
    /** 未提交的草稿 */
    this.drafts = new Map();
    /** 面板是否打开 */
    this.visible = false;

    /** TransformControls */
    this.transformControls = null;
    /** 当前 transform 模式 */
    this.transformMode = 'translate';

    /** 射线检测 */
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    /** 宇航员基础缩放 */
    this.astronautBaseScale = 1.0;

    this._initTransformControls();
    this._bindButtons();
    this._bindModelReplace();
    this._bindForm();
    this._bindKeyboard();
    this._bindClickSelect();
  }

  /* ==================== TransformControls ==================== */

  _initTransformControls() {
    if (!THREE.TransformControls) return;
    this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setSize(0.8);
    this.scene.add(this.transformControls);

    // 拖拽时禁止相机控制
    this.transformControls.addEventListener('dragging-changed', (event) => {
      if (this._cameraCtrl) {
        this._cameraCtrl.enabled = !event.value;
      }
    });

    // 拖拽结束后同步数据
    this.transformControls.addEventListener('objectChange', () => {
      this._syncFromObject();
    });
  }

  /** 附加 TransformControls 到选中物体 */
  _attachTransform(obj) {
    if (!this.transformControls) return;
    this.transformControls.attach(obj);
    this.transformControls.setMode(this.transformMode);
  }

  _detachTransform() {
    if (!this.transformControls) return;
    this.transformControls.detach();
  }

  /** 切换 transform 模式 */
  _setTransformMode(mode) {
    this.transformMode = mode;
    if (this.transformControls) {
      this.transformControls.setMode(mode);
    }
    // 更新按钮状态
    document.querySelectorAll('.transform-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  /* ==================== 3D 点击选中 ==================== */

  _bindClickSelect() {
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (!this.visible) return;
      // 只响应左键
      if (e.button !== 0) return;
      // 如果点击的是 TransformControls 的 gizmo，不处理（避免与拖拽冲突）
      if (this.transformControls) {
        if (this.transformControls._dragging) return;
        const gizmoAxis = this.transformControls._intersectGizmo(e);
        if (gizmoAxis) return;
      }

      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);

      // 收集所有代表物的可点击对象
      const clickables = [];
      this.exhibitManager.records.forEach(rec => {
        if (rec.root) {
          clickables.push(rec.root);
        }
      });

      const intersects = this.raycaster.intersectObjects(clickables, true);
      if (intersects.length > 0) {
        // 找到被点击的代表物
        let hit = intersects[0].object;
        while (hit.parent && !hit.userData.id) {
          hit = hit.parent;
        }
        if (hit.userData.id) {
          this._selectExhibit(hit.userData.id);
        }
      }
    });
  }

  /* ==================== 打开 / 关闭 ==================== */

  open() {
    this.visible = true;
    this.renderList();
    // 默认选中宇航员
    if (!this.selectedId) {
      this.selectedId = '__astronaut__';
    }
    this._highlightSelected();
    this._updateEditorLabel();
    this._fillForm();
    this._updateSelectionInfo();
    this._attachSelectedTransform();
    this.mask.classList.remove('hidden');

    // 如果选中的是代表物（非宇航员），将相机拉近以便看清 gizmo
    if (this.selectedId !== '__astronaut__') {
      const rec = this.exhibitManager.records.get(this.selectedId);
      if (rec && rec.root && this._cameraCtrl) {
        // 临时将相机距离设为最小值，让 gizmo 清晰可见
        this._cameraCtrl.distance = this._cameraCtrl.minDistance;
      }
    }
  }

  close() {
    this.visible = false;
    this._detachTransform();
    // 清除所有编辑器标签
    this.exhibitManager.records.forEach(rec => {
      if (rec.labelEl) {
        rec.labelEl.classList.remove('editor-selected');
      }
    });
    this.mask.classList.add('hidden');
  }

  /** 注入相机控制器引用 */
  setCameraController(ctrl) {
    this._cameraCtrl = ctrl;
  }

  /* ==================== 列表 ==================== */

  /** 渲染底部代表物列表 */
  renderList() {
    const exhibits = this.gameData.getExhibits();
    this.listEl.innerHTML = '';

    // 第0项：宇航员（特殊项，放在最前面）
    const astroItem = document.createElement('div');
    astroItem.className = 'bottom-item';
    astroItem.dataset.id = '__astronaut__';
    if (this.selectedId === '__astronaut__') astroItem.classList.add('selected');
    const astroOrder = document.createElement('span');
    astroOrder.className = 'item-order';
    astroOrder.textContent = '0';
    const astroName = document.createElement('span');
    astroName.className = 'item-name';
    astroName.textContent = '宇航员';
    astroItem.append(astroOrder, astroName);
    astroItem.addEventListener('click', () => {
      this._selectAstronaut();
    });
    this.listEl.appendChild(astroItem);

    // 代表物列表
    exhibits.forEach((ex) => {
      const draft = this.drafts.get(ex.id) || ex;
      const item = document.createElement('div');
      item.className = 'bottom-item';
      item.dataset.id = ex.id;
      if (ex.id === this.selectedId) item.classList.add('selected');

      const order = document.createElement('span');
      order.className = 'item-order';
      order.textContent = draft.timeline_order;

      const name = document.createElement('span');
      name.className = 'item-name';
      name.textContent = draft.name;

      item.append(order, name);
      item.addEventListener('click', () => {
        this._selectExhibit(ex.id);
      });
      this.listEl.appendChild(item);
    });
  }

  _highlightSelected() {
    this.listEl.querySelectorAll('.bottom-item').forEach((item) => {
      item.classList.toggle('selected', item.dataset.id === this.selectedId);
    });
  }

  /** 选中一个代表物 */
  _selectExhibit(id) {
    this.selectedId = id;
    this._highlightSelected();
    this._updateEditorLabel();
    this._fillForm();
    this._updateSelectionInfo();
    this._attachSelectedTransform();

    // 将相机拉近以便看清 gizmo
    if (this._cameraCtrl) {
      this._cameraCtrl.distance = this._cameraCtrl.minDistance;
    }
  }

  /** 选中宇航员（特殊项） */
  _selectAstronaut() {
    this.selectedId = '__astronaut__';
    this._highlightSelected();
    this._updateEditorLabel();
    this._fillForm();
    this._updateSelectionInfo();
    this._detachTransform(); // 宇航员不需要 TransformControls
  }

  /** 更新编辑器标签显示：只有选中的设施显示名字 */
  _updateEditorLabel() {
    // 清除所有设施的 editor-selected 类
    this.exhibitManager.records.forEach(rec => {
      if (rec.labelEl) {
        rec.labelEl.classList.remove('editor-selected');
      }
    });
    // 给当前选中的设施添加 editor-selected 类
    if (this.selectedId && this.selectedId !== '__astronaut__') {
      const rec = this.exhibitManager.records.get(this.selectedId);
      if (rec && rec.labelEl) {
        rec.labelEl.classList.add('editor-selected');
      }
    }
  }

  /** 更新选中信息区 */
  _updateSelectionInfo() {
    if (this.selectedId === '__astronaut__') {
      this.selectionInfo.innerHTML = `
        <span class="selected-name">宇航员</span>
        <span class="selected-tag" style="background:#ff8844">玩家</span>
      `;
      return;
    }
    const d = this._getDraft();
    if (!d) {
      this.selectionInfo.innerHTML = '<span class="selection-hint">点击场景中的代表物进行选择</span>';
      return;
    }
    this.selectionInfo.innerHTML = `
      <span class="selected-name">${d.name}</span>
      <span class="selected-tag" style="background:${d.glow_color || 'var(--accent)'}">${d.tag}</span>
      <span style="margin-left:8px;font-size:11px;color:rgba(0,229,255,0.5)">${d.era}</span>
    `;
  }

  /** 将 TransformControls 附加到当前选中的 3D 对象 */
  _attachSelectedTransform() {
    if (!this.transformControls) {
      console.warn('[EditorPanel] TransformControls 未初始化');
      return;
    }
    if (this.selectedId === '__astronaut__') {
      this._detachTransform();
      console.log('[EditorPanel] 选中宇航员，gizmo 已分离');
      return;
    }
    const rec = this.exhibitManager.records.get(this.selectedId);
    if (rec && rec.root) {
      this._attachTransform(rec.root);
      console.log(`[EditorPanel] gizmo 已附加到「${rec.root.userData.name || this.selectedId}」，位置:`, rec.root.position.toArray());
    } else {
      console.warn(`[EditorPanel] 未找到代表物记录: ${this.selectedId}`);
    }
  }

  /* ==================== 表单 ==================== */

  /** 当前选中代表物的草稿 */
  _getDraft() {
    if (!this.selectedId) return null;
    if (!this.drafts.has(this.selectedId)) {
      const ex = this.gameData.getExhibit(this.selectedId);
      if (!ex) return null;
      this.drafts.set(this.selectedId, JSON.parse(JSON.stringify(ex)));
    }
    return this.drafts.get(this.selectedId);
  }

  /** 草稿 → 表单 */
  _fillForm() {
    const f = this.fields;

    // 宇航员特殊处理
    if (this.selectedId === '__astronaut__') {
      f.name.value = '宇航员';
      f.tag.value = '玩家';
      f.era.value = '';
      // 宇航员当前位置
      if (this.astronautGroup) {
        f.posX.value = this.astronautGroup.position.x.toFixed(2);
        f.posY.value = this.astronautGroup.position.y.toFixed(2);
        f.posZ.value = this.astronautGroup.position.z.toFixed(2);
        const s = this.astronautGroup.scale.x;
        f.sclX.value = s;
        f.sclY.value = s;
        f.sclZ.value = s;
        f.scale.value = s;
        f.scaleVal.textContent = s.toFixed(2);
      }
      f.rotX.value = 0;
      f.rotY.value = 0;
      f.rotZ.value = 0;
      f.distance.value = '';
      f.glow.value = '#ff8844';
      f.model.value = '';
      f.desc.value = '';
      f.significance.value = '';
      return;
    }

    const d = this._getDraft();
    if (!d) return;
    f.name.value = d.name ?? '';
    f.tag.value = d.tag ?? '';
    f.era.value = d.era ?? '';
    f.posX.value = d.position?.[0] ?? 0;
    f.posY.value = d.position?.[1] ?? 0;
    f.posZ.value = d.position?.[2] ?? 0;

    // 旋转（弧度→角度）
    const rot = d.rotation || [0, 0, 0];
    f.rotX.value = Math.round(rot[0] * 180 / Math.PI);
    f.rotY.value = Math.round(rot[1] * 180 / Math.PI);
    f.rotZ.value = Math.round(rot[2] * 180 / Math.PI);

    // 缩放
    const scl = d.scale_xyz || [d.scale ?? 1, d.scale ?? 1, d.scale ?? 1];
    f.sclX.value = scl[0];
    f.sclY.value = scl[1];
    f.sclZ.value = scl[2];
    f.scale.value = d.scale ?? 1;
    f.scaleVal.textContent = (d.scale ?? 1).toFixed(2);

    f.distance.value = d.interaction_distance ?? 12;
    f.glow.value = d.glow_color || '#4488FF';
    f.model.value = d.model_path ?? '';
    f.desc.value = d.description ?? '';
    f.significance.value = d.significance ?? '';
  }

  /** 从 3D 对象同步回表单（TransformControls 拖拽后） */
  _syncFromObject() {
    const rec = this.exhibitManager.records.get(this.selectedId);
    if (!rec || !rec.root) return;

    const draft = this._getDraft();
    if (!draft) return;

    const pos = rec.root.position;
    const rot = rec.root.rotation;
    const scl = rec.root.scale;

    draft.position = [pos.x, pos.y, pos.z];
    draft.rotation = [rot.x, rot.y, rot.z];
    draft.scale_xyz = [scl.x, scl.y, scl.z];
    draft.scale = (scl.x + scl.y + scl.z) / 3;

    this._fillForm();
    this._markDirty(true);
    this.onDataChanged();
  }

  /** 表单变化处理 */
  _bindForm() {
    Object.values(this.fields).forEach((el) => {
      if (!el) return;
      el.addEventListener('input', (e) => this._onFieldChange(e));
    });
  }

  _onFieldChange(e) {
    const f = this.fields;

    // 宇航员特殊处理
    if (this.selectedId === '__astronaut__') {
      if (this.astronautGroup) {
        // 位置
        const px = parseFloat(f.posX.value);
        const py = parseFloat(f.posY.value);
        const pz = parseFloat(f.posZ.value);
        if (!Number.isNaN(px)) this.astronautGroup.position.x = px;
        if (!Number.isNaN(py)) this.astronautGroup.position.y = py;
        if (!Number.isNaN(pz)) this.astronautGroup.position.z = pz;

        // 统一缩放
        const scale = parseFloat(f.scale.value);
        if (!Number.isNaN(scale) && scale > 0) {
          this.astronautGroup.scale.set(scale, scale, scale);
          f.scaleVal.textContent = scale.toFixed(2);
          f.sclX.value = scale;
          f.sclY.value = scale;
          f.sclZ.value = scale;
        }
      }

      this._markDirty(true);
      return;
    }

    const draft = this._getDraft();
    if (!draft) return;

    // 文本类字段
    draft.name = f.name.value;
    draft.tag = f.tag.value;
    draft.era = f.era.value;
    draft.model_path = f.model.value;
    draft.description = f.desc.value;
    draft.significance = f.significance.value;
    draft.glow_color = f.glow.value;

    // 位置
    const px = parseFloat(f.posX.value);
    const py = parseFloat(f.posY.value);
    const pz = parseFloat(f.posZ.value);
    if (!Number.isNaN(px)) draft.position[0] = px;
    if (!Number.isNaN(py)) draft.position[1] = py;
    if (!Number.isNaN(pz)) draft.position[2] = pz;

    // 旋转（角度→弧度）
    const rx = parseFloat(f.rotX.value) * Math.PI / 180;
    const ry = parseFloat(f.rotY.value) * Math.PI / 180;
    const rz = parseFloat(f.rotZ.value) * Math.PI / 180;
    draft.rotation = [
      Number.isNaN(rx) ? 0 : rx,
      Number.isNaN(ry) ? 0 : ry,
      Number.isNaN(rz) ? 0 : rz,
    ];

    // 分轴缩放
    const sx = parseFloat(f.sclX.value);
    const sy = parseFloat(f.sclY.value);
    const sz = parseFloat(f.sclZ.value);
    draft.scale_xyz = [
      Number.isNaN(sx) ? 1 : sx,
      Number.isNaN(sy) ? 1 : sy,
      Number.isNaN(sz) ? 1 : sz,
    ];

    // 统一缩放
    const scale = parseFloat(f.scale.value);
    if (!Number.isNaN(scale) && scale > 0) {
      draft.scale = scale;
      f.scaleVal.textContent = scale.toFixed(2);
      // 同步到分轴
      draft.scale_xyz = [scale, scale, scale];
      f.sclX.value = scale;
      f.sclY.value = scale;
      f.sclZ.value = scale;
    }

    const dist = parseFloat(f.distance.value);
    if (!Number.isNaN(dist) && dist > 0) draft.interaction_distance = dist;

    this._markDirty(true);

    // 实时预览
    if (PREVIEW_FIELDS.has(e.target.id)) {
      this.exhibitManager.rebuildExhibit(draft);
      this._attachSelectedTransform();
      this.renderList();
      this._highlightSelected();
      this.onDataChanged();
    }
  }

  /** 应用宇航员缩放 */
  _applyAstronautScale() {
    if (!this.astronautGroup) return;
    const s = this.astronautBaseScale;
    this.astronautGroup.scale.set(s, s, s);
  }

  _markDirty(dirty) {
    this.dirtyMark.classList.toggle('hidden', !dirty);
  }

  /* ==================== 快捷键 ==================== */

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (!this.visible) return;
      // 如果焦点在输入框，不处理
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'w':
          this._setTransformMode('translate');
          break;
        case 'e':
          this._setTransformMode('rotate');
          break;
      }
    });
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

    // Transform 模式按钮
    document.querySelectorAll('.transform-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setTransformMode(btn.dataset.mode);
      });
    });
  }

  /** 保存修改 */
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
    // 持久化到 localStorage，刷新页面后数据不丢失
    this.gameData.saveToStorage();
    this.onDataChanged();
    if (!silent) {
      this.hud.toast(count > 0
        ? `已保存 ${count} 项修改`
        : '没有需要保存的修改');
    }
  }

  /** 新增代表物 */
  addNew() {
    const created = this.gameData.addExhibit();
    this.exhibitManager.buildExhibit(created);
    this._selectExhibit(created.id);
    this.renderList();
    this.gameData.saveToStorage();
    this.onDataChanged();
    this.hud.toast(`已新增「${created.name}」`);
    this.listEl.querySelector(`.bottom-item[data-id="${created.id}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /** 删除代表物 */
  deleteSelected() {
    if (!this.selectedId) return;
    // 宇航员不可删除
    if (this.selectedId === '__astronaut__') {
      this.hud.toast('宇航员不可删除');
      return;
    }
    const ex = this.gameData.getExhibit(this.selectedId);
    if (!ex) return;

    if (!window.confirm(`确定删除「${ex.name}」吗？`)) return;

    this._detachTransform();
    this.gameData.removeExhibit(this.selectedId);
    this.exhibitManager.removeExhibit(this.selectedId);
    this.drafts.delete(this.selectedId);
    this.selectedId = '__astronaut__';
    this.renderList();
    this._fillForm();
    this._updateSelectionInfo();
    this._attachSelectedTransform();
    this.gameData.saveToStorage();
    this.onDataChanged();
    this.hud.toast(`已删除「${ex.name}」`);
  }

  /** 重新加载 */
  async reload() {
    try {
      // 清除 localStorage 缓存，强制从原始文件重新加载
      this.gameData.clearStorage();
      await this.gameData.reload();
    } catch (err) {
      this.hud.toast('重新加载失败：' + err.message);
      return;
    }
    this.drafts.clear();
    this._markDirty(false);
    this.exhibitManager.buildAll(this.gameData.getExhibits());
    this.selectedId = '__astronaut__';
    this.renderList();
    this._fillForm();
    this._updateSelectionInfo();
    this._attachSelectedTransform();
    this.onDataChanged();
    this.hud.toast('已重新加载全部数据');
  }

  /** 导出 JSON */
  exportJSON() {
    this.save(true);
    this.gameData.downloadJSON();
    this.hud.toast('exhibits.json 已下载');
  }

  /* ==================== 模型替换 ==================== */

  _bindModelReplace() {
    const btnReplace = document.getElementById('btn-replace-model');
    const fileInput = document.getElementById('file-model-input');

    btnReplace.addEventListener('click', () => {
      if (this.selectedId === '__astronaut__') {
        this.hud.toast('宇航员模型暂不支持替换');
        return;
      }
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) this._processModelReplace(file);
      e.target.value = ''; // 允许重复选择同一文件
    });
  }

  _setProgress(pct, text) {
    const row = document.getElementById('model-progress-row');
    const fill = document.getElementById('model-progress-fill');
    const txt = document.getElementById('model-progress-text');
    row.classList.remove('hidden');
    fill.style.width = pct + '%';
    txt.textContent = text;
  }

  async _processModelReplace(file) {
    if (this.selectedId === '__astronaut__') return;

    const btnReplace = document.getElementById('btn-replace-model');
    btnReplace.disabled = true;

    try {
      // 1. 读取文件
      this._setProgress(5, '读取文件…');
      const arrayBuffer = await file.arrayBuffer();
      const origSize = arrayBuffer.byteLength;

      // 2. 压缩 GLB
      this._setProgress(10, '压缩贴图…');
      const compressed = await this._compressGLB(arrayBuffer);

      // 3. 分片并设置 window 变量
      this._setProgress(85, '生成分片…');
      const prefix = this.selectedId.toUpperCase() + '_GLB_PART';
      const chunkSize = 12 * 1024 * 1024;
      const data = new Uint8Array(compressed);
      const numChunks = Math.ceil(data.byteLength / chunkSize);

      for (let i = 0; i < numChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, data.byteLength);
        window[prefix + i] = this._uint8ToBase64(data.slice(start, end));
      }
      // 清除多余旧分片
      const oldDraft = this._getDraft();
      if (oldDraft?.model_chunks?.prefix === prefix) {
        for (let i = numChunks; i < (oldDraft.model_chunks.count || 0); i++) {
          delete window[prefix + i];
        }
      }

      // 4. 更新数据并重建模型
      this._setProgress(95, '加载模型…');
      const draft = this._getDraft();
      draft.model_path = `models/${this.selectedId}.glb`;
      draft.model_chunks = { prefix, count: numChunks };
      this.gameData.updateExhibit(this.selectedId, draft);
      this.exhibitManager.rebuildExhibit(this.gameData.getExhibit(this.selectedId));
      this.gameData.saveToStorage();
      this._markDirty(false);
      this._fillForm();
      this.onDataChanged();

      // 5. 完成，隐藏进度
      document.getElementById('model-progress-row').classList.add('hidden');
      const ratio = ((1 - compressed.byteLength / origSize) * 100).toFixed(0);
      this.hud.toast(`模型已替换! ${(origSize / 1048576).toFixed(1)}MB → ${(compressed.byteLength / 1048576).toFixed(1)}MB`);

    } catch (err) {
      console.error('[ModelReplace] 失败:', err);
      document.getElementById('model-progress-row').classList.add('hidden');
      this.hud.toast('模型替换失败: ' + err.message);
    }

    btnReplace.disabled = false;
  }

  /**
   * 压缩 GLB：缩小贴图、base color 转 JPEG
   * @param {ArrayBuffer} glbBuffer 原始 GLB 数据
   * @returns {Promise<ArrayBuffer>} 压缩后的 GLB
   */
  async _compressGLB(glbBuffer) {
    const allBytes = new Uint8Array(glbBuffer);

    // 解析 GLB 头部
    const jsonChunkLen = new DataView(glbBuffer, 12, 4).getUint32(0, true);
    const jsonBytes = allBytes.slice(20, 20 + jsonChunkLen);
    const jsonStr = new TextDecoder().decode(jsonBytes).replace(/\s+$/, '');
    const gltf = JSON.parse(jsonStr);

    // 定位二进制数据
    let binChunkHdrOff = 20 + jsonChunkLen;
    const rem = binChunkHdrOff % 4;
    if (rem) binChunkHdrOff += (4 - rem);
    const binChunkDataLen = new DataView(glbBuffer, binChunkHdrOff, 4).getUint32(0, true);
    const binDataOff = binChunkHdrOff + 8;

    // 找到几何体数据的结束位置（第一个图片 bufferView 之前的最大 offset+length）
    const imageBVIndices = gltf.images.map(img => img.bufferView);
    let geoEnd = 0;
    for (let i = 0; i < gltf.bufferViews.length; i++) {
      if (!imageBVIndices.includes(i)) {
        const bv = gltf.bufferViews[i];
        const end = bv.byteOffset + bv.byteLength;
        if (end > geoEnd) geoEnd = end;
      }
    }

    // 复制几何体数据
    const geoData = allBytes.slice(binDataOff, binDataOff + geoEnd);

    // 逐张处理贴图
    const processedImages = [];
    for (let i = 0; i < gltf.images.length; i++) {
      this._setProgress(15 + Math.floor(65 * i / gltf.images.length), `压缩贴图 ${i + 1}/${gltf.images.length}…`);

      const img = gltf.images[i];
      const bv = gltf.bufferViews[img.bufferView];
      const imgBytes = allBytes.slice(binDataOff + bv.byteOffset, binDataOff + bv.byteOffset + bv.byteLength);

      // 用 Image 解码
      const blob = new Blob([imgBytes], { type: img.mimeType || 'image/png' });
      const url = URL.createObjectURL(blob);
      const image = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = (e) => reject(new Error(`贴图 ${i} 解码失败`));
        im.src = url;
      });
      URL.revokeObjectURL(url);

      // 计算目标尺寸：减半，max 2048，min 512
      const newW = Math.max(512, Math.min(2048, Math.floor(image.width / 2)));
      const newH = Math.max(512, Math.min(2048, Math.floor(image.height / 2)));

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, newW, newH);

      // base color (index 1) 转 JPEG，其余保持 PNG
      const isBaseColor = (i === 1);
      const mimeType = isBaseColor ? 'image/jpeg' : 'image/png';
      const quality = isBaseColor ? 0.82 : undefined;

      const newBlob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
      const newBuf = await newBlob.arrayBuffer();
      const newBytes = new Uint8Array(newBuf);

      processedImages.push({
        bytes: newBytes,
        mimeType,
        origBVIdx: img.bufferView,
      });

      console.info(`[ModelReplace] 贴图${i}: ${image.width}x${image.height} → ${newW}x${newH}, ${(bv.byteLength / 1048576).toFixed(2)}MB → ${(newBytes.byteLength / 1048576).toFixed(2)}MB (${mimeType})`);
    }

    // 构建新二进制缓冲
    const parts = [geoData];
    const newBVLayout = [];

    // 几何体 bufferViews（位置不变）
    for (let i = 0; i < gltf.bufferViews.length; i++) {
      if (!imageBVIndices.includes(i)) {
        newBVLayout.push({ ...gltf.bufferViews[i] });
      }
    }

    // 图片 bufferViews（追加到末尾，4字节对齐）
    let currentOffset = geoData.byteLength;
    for (const imgData of processedImages) {
      const pad = (4 - (currentOffset % 4)) % 4;
      currentOffset += pad;
      newBVLayout.push({ byteOffset: currentOffset, byteLength: imgData.bytes.byteLength });
      if (pad > 0) parts.push(new Uint8Array(pad));
      parts.push(imgData.bytes);
      currentOffset += imgData.bytes.byteLength;
    }

    // 合并
    const totalBinLen = currentOffset;
    const newBinData = new Uint8Array(totalBinLen);
    let writeOff = 0;
    for (const part of parts) {
      newBinData.set(part, writeOff);
      writeOff += part.byteLength;
    }

    // 更新 JSON
    gltf.buffers[0].byteLength = totalBinLen;
    gltf.bufferViews = newBVLayout;
    for (let i = 0; i < gltf.images.length; i++) {
      gltf.images[i].mimeType = processedImages[i].mimeType;
    }

    // 序列化 JSON（补空格到4字节对齐）
    let newJsonStr = JSON.stringify(gltf);
    const jsonPad = (4 - (new TextEncoder().encode(newJsonStr).byteLength % 4)) % 4;
    if (jsonPad > 0) newJsonStr += ' '.repeat(jsonPad);
    const newJsonBytes = new TextEncoder().encode(newJsonStr);

    // 组装 GLB
    const totalSize = 12 + 8 + newJsonBytes.byteLength + 8 + newBinData.byteLength;
    const glb = new Uint8Array(totalSize);
    const dv = new DataView(glb.buffer);
    let p = 0;

    // 头部
    glb[0] = 0x67; glb[1] = 0x6C; glb[2] = 0x54; glb[3] = 0x46; // "glTF"
    dv.setUint32(4, 2, true);  // version
    dv.setUint32(8, totalSize, true);
    p = 12;

    // JSON chunk
    dv.setUint32(p, newJsonBytes.byteLength, true);
    dv.setUint32(p + 4, 0x4E4F534A, true); // "JSON"
    p += 8;
    glb.set(newJsonBytes, p);
    p += newJsonBytes.byteLength;

    // BIN chunk
    dv.setUint32(p, newBinData.byteLength, true);
    dv.setUint32(p + 4, 0x004E4942, true); // "BIN\0"
    p += 8;
    glb.set(newBinData, p);

    return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  }

  /** Uint8Array → base64（处理大数组，分段编码避免栈溢出） */
  _uint8ToBase64(uint8Array) {
    const CHUNK = 0x8000; // 32KB per chunk
    let binary = '';
    for (let i = 0; i < uint8Array.length; i += CHUNK) {
      const slice = uint8Array.subarray(i, Math.min(i + CHUNK, uint8Array.length));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

}

XINGTU.EditorPanel = EditorPanel;

})();
