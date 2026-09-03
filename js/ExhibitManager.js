/**
 * ExhibitManager.js —— 代表物管理器模块
 * ------------------------------------------------------------
 * 职责：
 *  1. 从 exhibits.json 数据动态生成所有代表物（THREE.Group）
 *  2. 按 id / tag 选择程序化占位模型造型（后续可替换为 .glb 真实模型）
 *  3. CSS2DRenderer 中文名称标签、发光材质、局部光源
 *  4. 持续自转 + 呼吸灯发光动画 + 交互高亮
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();

class ExhibitManager {
  /**
   * @param {THREE.Scene} scene 主场景
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, Object>} id → 代表物运行时记录 */
    this.records = new Map();
  }

  /* ==================== 构建 ==================== */

  /** 清空并重建全部代表物 */
  buildAll(exhibits) {
    // 移除旧的
    for (const id of Array.from(this.records.keys())) {
      this.removeExhibit(id);
    }
    exhibits.forEach((data) => this.buildExhibit(data));
  }

  /**
   * 构建单个代表物
   * @param {Object} data exhibits.json 中的一条记录
   */
  buildExhibit(data) {
    if (this.records.has(data.id)) this.removeExhibit(data.id);

    const root = new THREE.Group();
    root.name = data.id;
    root.position.fromArray(data.position || [0, 0, -60]);
    const s = data.scale || 1;
    root.scale.setScalar(s);
    root.userData.id = data.id;

    const modelGroup = new THREE.Group();
    root.add(modelGroup);

    // ---- 材质（统一金属质感 + 发光） ----
    const materials = [];
    const glowColor = new THREE.Color(data.glow_color || '#4488FF');
    const metal = new THREE.MeshStandardMaterial({
      color: 0xb9c5da,
      metalness: 0.6,
      roughness: 0.3,
      emissive: glowColor,
      emissiveIntensity: 0.5,
    });
    const panel = new THREE.MeshStandardMaterial({
      color: 0x16295e,
      metalness: 0.7,
      roughness: 0.25,
      emissive: glowColor,
      emissiveIntensity: 0.35,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x3a4152,
      metalness: 0.6,
      roughness: 0.4,
      emissive: glowColor,
      emissiveIntensity: 0.15,
    });
    materials.push(metal, panel, dark);
    // 记录各材质发光强度的比例（呼吸灯 / 高亮时按此比例缩放）
    metal.userData.ratio = 1;
    panel.userData.ratio = 0.7;
    dark.userData.ratio = 0.3;

    // ---- 占位模型 ----
    this._buildPlaceholder(data, modelGroup, { metal, panel, dark }, materials);

    // 若配置了 model_path，尝试加载真实 .glb 替换占位模型
    if (data.model_path) {
      this._tryLoadGltf(data.model_path, modelGroup, materials);
    }

    // ---- 局部光源 ----
    const light = new THREE.PointLight(glowColor, 2, 20, 1.5);
    root.add(light);

    // ---- CSS2D 名称标签 ----
    const labelEl = document.createElement('div');
    labelEl.className = 'exhibit-label';
    labelEl.innerHTML = `
      <span class="label-name"></span>
      <span class="label-tag"></span>
      <span class="label-era"></span>
    `;
    labelEl.querySelector('.label-name').textContent = data.name;
    labelEl.querySelector('.label-tag').textContent = data.tag;
    labelEl.querySelector('.label-era').textContent = data.era;

    // 标签悬浮高度：按模型包围盒顶部 + 余量
    const box = new THREE.Box3().setFromObject(modelGroup);
    const labelY = (isFinite(box.max.y) ? box.max.y : 1.5) + 1.1;
    const labelObj = new CSS2DObject(labelEl);
    labelObj.position.set(0, labelY, 0);
    root.add(labelObj);

    this.scene.add(root);

    this.records.set(data.id, {
      data,
      root,
      modelGroup,
      materials,
      light,
      labelEl,
      labelObj,
      phase: Math.random() * Math.PI * 2, // 呼吸灯随机相位
      highlight: false,
    });
  }

  /** 若提供了 .glb 路径则加载替换占位模型（失败时保留占位模型） */
  _tryLoadGltf(path, modelGroup, materials) {
    gltfLoader.load(
      path,
      (gltf) => {
        // 清空占位模型，换为真实模型
        while (modelGroup.children.length) {
          const c = modelGroup.children[0];
          modelGroup.remove(c);
          this._disposeObject(c);
        }
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        modelGroup.add(gltf.scene);
        console.info(`[ExhibitManager] 已加载模型 ${path}`);
      },
      undefined,
      (err) => {
        console.warn(`[ExhibitManager] 模型加载失败，保留占位模型：${path}`, err);
      }
    );
  }

  /* ==================== 占位模型工厂 ==================== */

  /**
   * 根据 id / tag 选择造型方案构建占位模型
   * @param {Object} data 代表物数据
   * @param {THREE.Group} g 目标模型组
   * @param {Object} mats { metal, panel, dark } 基础材质
   * @param {Array} materials 材质登记数组（用于呼吸动画）
   */
  _buildPlaceholder(data, g, mats, materials) {
    const builders = {
      dongfanghong1: this._buildDongfanghong,
      shenzhou5: this._buildShenzhou,
      shenzhou7: this._buildShenzhou7,
      tiangong1_shenzhou8: this._buildDocking,
      change3: this._buildChange3,
      tianwen1: this._buildTianwen1,
      change5: this._buildChange5,
      tianhe: this._buildTianhe,
      css_complete: this._buildCSS,
      change6: this._buildChange6,
    };
    const builder = builders[data.id] || this._pickGenericBuilder(data.tag);
    builder.call(this, g, mats, materials);
  }

  /** 新增代表物时按 tag 关键词选择通用造型 */
  _pickGenericBuilder(tag = '') {
    if (tag.includes('月背')) return this._buildChange6;
    if (tag.includes('采样') || tag.includes('取样')) return this._buildChange5;
    if (tag.includes('建站')) return this._buildCSS;
    if (tag.includes('探火')) return this._buildTianwen1;
    if (tag.includes('落月')) return this._buildChange3;
    if (tag.includes('对接')) return this._buildDocking;
    if (tag.includes('出舱')) return this._buildShenzhou7;
    if (tag.includes('载人')) return this._buildShenzhou;
    return this._buildDongfanghong; // 默认：卫星造型
  }

  /** 辅助：快捷创建 Mesh */
  _mesh(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /** 太阳能板（薄方块 + 连接杆） */
  _solarPanel(mats, w, x, y = 0, rotZ = 0) {
    const grp = new THREE.Group();
    const board = this._mesh(new THREE.BoxGeometry(w, 0.05, 0.8), mats.panel, x, y, 0);
    const strut = this._mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.max(0.3, Math.abs(x) - 0.4), 6), mats.dark, x / 2, y, 0);
    strut.rotation.z = Math.PI / 2;
    grp.add(board, strut);
    grp.rotation.z = rotZ;
    return grp;
  }

  /* ---- 1. 东方红一号：二十面体球状卫星 + 四片太阳能板 ---- */
  _buildDongfanghong(g, mats, materials) {
    g.add(this._mesh(new THREE.IcosahedronGeometry(0.85, 1), mats.metal));
    // 四面展开的太阳能板
    const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    angles.forEach((a) => {
      const panel = this._mesh(new THREE.BoxGeometry(1.9, 0.05, 0.72), mats.panel, 1.65, 0, 0);
      const holder = new THREE.Group();
      holder.add(panel);
      holder.rotation.y = a;
      g.add(holder);
    });
    // 底部四根天线
    for (let i = 0; i < 4; i++) {
      const ant = this._mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.3, 5), mats.dark);
      const holder = new THREE.Group();
      ant.position.y = -0.6;
      ant.rotation.x = 0.6;
      holder.add(ant);
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
  }

  /* ---- 2. 神舟五号：圆锥返回舱 + 圆柱轨道舱 + 太阳能板 ---- */
  _buildShenzhou(g, mats) {
    // 轨道舱（圆柱）
    g.add(this._mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.3, 20), mats.metal, 0, 0.95, 0));
    // 返回舱（圆锥，锥尖朝上）
    const cone = this._mesh(new THREE.ConeGeometry(0.78, 1.1, 20), mats.metal, 0, -0.25, 0);
    g.add(cone);
    // 推进舱（底部圆柱）
    g.add(this._mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.7, 20), mats.dark, 0, -1.15, 0));
    // 两侧太阳能板
    g.add(this._solarPanel(mats, 1.9, 1.55, -1.1));
    g.add(this._solarPanel(mats, 1.9, -1.55, -1.1));
  }

  /* ---- 3. 神舟七号：神舟造型 + 出舱宇航员小人 ---- */
  _buildShenzhou7(g, mats, materials) {
    this._buildShenzhou(g, mats);
    // 出舱宇航员（两个球 + 圆柱）
    const astro = new THREE.Group();
    const head = this._mesh(new THREE.SphereGeometry(0.16, 14, 12), mats.metal, 0, 0.42, 0);
    const bodyM = this._mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 12), mats.metal, 0, 0.02, 0);
    const joint = this._mesh(new THREE.SphereGeometry(0.11, 12, 10), mats.dark, 0, -0.3, 0);
    astro.add(head, bodyM, joint);
    astro.position.set(1.25, 0.55, 0.5);
    astro.rotation.z = -0.4; // 漂浮姿态
    g.add(astro);
    // 安全系绳
    const ropePts = [new THREE.Vector3(0.5, 0.4, 0.2), new THREE.Vector3(0.9, 0.62, 0.42), new THREE.Vector3(1.22, 0.58, 0.5)];
    const rope = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ropePts),
      new THREE.LineBasicMaterial({ color: 0xccd6ee, transparent: true, opacity: 0.7 })
    );
    g.add(rope);
  }

  /* ---- 4. 天宫一号 + 神舟八号：两圆柱水平对接 + 环状对接机构 ---- */
  _buildDocking(g, mats) {
    // 天宫一号（大圆柱，沿 X 轴）
    const big = this._mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.5, 22), mats.metal, -1.05, 0, 0);
    big.rotation.z = Math.PI / 2;
    g.add(big);
    // 神舟八号（小圆柱）
    const small = this._mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.7, 18), mats.dark, 1.45, 0, 0);
    small.rotation.z = Math.PI / 2;
    g.add(small);
    // 对接机构环
    const ring = this._mesh(new THREE.TorusGeometry(0.5, 0.09, 12, 26), mats.metal, 0.42, 0, 0);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    // 天宫一号上下两片太阳能板
    g.add(this._mesh(new THREE.BoxGeometry(1.7, 0.05, 0.8), mats.panel, -1.05, 1.55, 0));
    g.add(this._mesh(new THREE.BoxGeometry(1.7, 0.05, 0.8), mats.panel, -1.05, -1.55, 0));
  }

  /* ---- 5. 嫦娥三号：圆盘着陆器 + 四条着陆腿 + 六轮月球车 ---- */
  _buildChange3(g, mats) {
    // 着陆器主体（圆盘）
    g.add(this._mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.5, 24), mats.metal, 0, 0.45, 0));
    g.add(this._mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.35, 18), mats.dark, 0, 0.85, 0));
    // 四条着陆腿
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      const leg = this._mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.25, 8), mats.dark, 1.15, -0.28, 0);
      leg.rotation.z = 0.62;
      const foot = this._mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.07, 10), mats.dark, 1.52, -0.62, 0);
      holder.add(leg, foot);
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
    // 玉兔号月球车（六轮）
    const rover = this._buildRover(mats);
    rover.position.set(1.9, -0.62, 0.8);
    rover.rotation.y = 0.6;
    rover.scale.setScalar(0.9);
    g.add(rover);
  }

  /** 小车通用造型：盒体 + 六轮 + 桅杆 */
  _buildRover(mats) {
    const rover = new THREE.Group();
    rover.add(this._mesh(new THREE.BoxGeometry(0.62, 0.3, 0.45), mats.metal, 0, 0.18, 0));
    // 顶部太阳能板
    rover.add(this._mesh(new THREE.BoxGeometry(0.66, 0.03, 0.5), mats.panel, 0, 0.38, 0));
    // 六个轮子
    const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.07, 12);
    [-0.26, 0, 0.26].forEach((x) => {
      [0.26, -0.26].forEach((z) => {
        const w = this._mesh(wheelGeo, mats.dark, x, -0.02, z);
        w.rotation.x = Math.PI / 2;
        rover.add(w);
      });
    });
    // 桅杆 + 相机头
    rover.add(this._mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), mats.dark, 0.22, 0.55, 0.12));
    rover.add(this._mesh(new THREE.BoxGeometry(0.12, 0.09, 0.09), mats.metal, 0.22, 0.74, 0.12));
    return rover;
  }

  /* ---- 6. 天问一号 + 祝融号：圆柱环绕器 + 火星车 ---- */
  _buildTianwen1(g, mats) {
    // 环绕器（圆柱主体 + 大天线 + 太阳能板）
    g.add(this._mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 20), mats.metal, 0, 0.75, 0));
    const dish = this._mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), mats.metal, 0, 1.45, 0);
    dish.rotation.x = Math.PI;
    g.add(dish);
    g.add(this._solarPanel(mats, 2.1, 1.75, 0.75));
    g.add(this._solarPanel(mats, 2.1, -1.75, 0.75));
    // 祝融号火星车
    const rover = this._buildRover(mats);
    rover.position.set(1.55, -0.85, 0.7);
    rover.rotation.y = -0.5;
    rover.scale.setScalar(0.85);
    g.add(rover);
  }

  /* ---- 7. 嫦娥五号：圆柱轨道器 + 着陆器 + 返回舱 ---- */
  _buildChange5(g, mats) {
    // 轨道器（上方圆柱 + 太阳能板）
    g.add(this._mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.05, 20), mats.metal, 0, 0.85, 0));
    g.add(this._solarPanel(mats, 1.7, 1.45, 0.85));
    g.add(this._solarPanel(mats, 1.7, -1.45, 0.85));
    // 着陆器（下方）
    g.add(this._mesh(new THREE.CylinderGeometry(0.72, 0.95, 0.62, 20), mats.dark, 0, -0.25, 0));
    // 四条短着陆腿
    for (let i = 0; i < 4; i++) {
      const holder = new THREE.Group();
      const leg = this._mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.85, 8), mats.dark, 0.95, -0.75, 0);
      leg.rotation.z = 0.55;
      holder.add(leg);
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
    // 返回舱（侧面小圆锥）
    const cap = this._mesh(new THREE.ConeGeometry(0.34, 0.6, 16), mats.metal, 1.0, 0.25, 0.35);
    cap.rotation.z = -Math.PI / 2.4;
    g.add(cap);
  }

  /* ---- 8. 天和核心舱：大圆柱 + 两侧大型太阳能板 + 对接口 ---- */
  _buildTianhe(g, mats) {
    // 核心舱主体（沿 X 轴的大圆柱）
    const bodyM = this._mesh(new THREE.CylinderGeometry(0.72, 0.72, 3.4, 24), mats.metal, 0, 0, 0);
    bodyM.rotation.z = Math.PI / 2;
    g.add(bodyM);
    // 节点舱（前端略粗短圆柱）
    const node = this._mesh(new THREE.CylinderGeometry(0.55, 0.72, 0.7, 20), mats.dark, 2.0, 0, 0);
    node.rotation.z = Math.PI / 2;
    g.add(node);
    // 对接口标记（圆环）
    const port = this._mesh(new THREE.TorusGeometry(0.4, 0.07, 10, 24), mats.metal, 2.45, 0, 0);
    port.rotation.y = Math.PI / 2;
    g.add(port);
    // 两侧大型太阳能板（沿 Z 方向展开）
    [1, -1].forEach((side) => {
      const panelGrp = new THREE.Group();
      const board = this._mesh(new THREE.BoxGeometry(1.05, 0.05, 2.5), mats.panel, 0, 0, side * 1.9);
      const strut = this._mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), mats.dark, 0, 0, side * 0.55);
      strut.rotation.x = Math.PI / 2;
      panelGrp.add(board, strut);
      panelGrp.position.x = -0.6;
      g.add(panelGrp);
    });
  }

  /* ---- 9. 中国空间站：T 字构型（天和 + 问天 + 梦天） ---- */
  _buildCSS(g, mats) {
    // 天和核心舱（中央，沿 X 轴）
    const core = this._mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.6, 20), mats.metal, 0, 0, 0);
    core.rotation.z = Math.PI / 2;
    g.add(core);
    // 问天 / 梦天实验舱（两侧，沿 Z 轴，形成 T 字）
    [1, -1].forEach((side) => {
      const lab = this._mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.2, 20), mats.metal, 0, 0, side * 1.75);
      lab.rotation.x = Math.PI / 2;
      g.add(lab);
      // 每个实验舱自带太阳能板
      const board = this._mesh(new THREE.BoxGeometry(2.2, 0.05, 0.85), mats.panel, 0, 0, side * 1.9);
      board.position.y = side > 0 ? 1.15 : -1.15;
      g.add(board);
    });
    // 核心舱太阳能板
    [1, -1].forEach((side) => {
      const board = this._mesh(new THREE.BoxGeometry(0.9, 0.05, 1.9), mats.panel, side * 1.75, 0, 0);
      board.position.z = side * 1.35;
      board.rotation.y = side > 0 ? -0.4 : 0.4;
      g.add(board);
    });
    // 对接口标记
    const port = this._mesh(new THREE.TorusGeometry(0.32, 0.06, 10, 20), mats.dark, 1.5, 0, 0);
    port.rotation.y = Math.PI / 2;
    g.add(port);
  }

  /* ---- 10. 嫦娥六号：嫦娥五号造型 + 底部月球表面 ---- */
  _buildChange6(g, mats, materials) {
    this._buildChange5(g, mats);
    // 月球背面示意：灰色半球盘
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0x96969e,
      metalness: 0.05,
      roughness: 0.95,
      emissive: new THREE.Color(mats.metal.emissive),
      emissiveIntensity: 0.04,
    });
    materials.push(moonMat);
    const moon = this._mesh(
      new THREE.SphereGeometry(1.9, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      moonMat,
      0, -1.15, 0
    );
    g.add(moon);
    // 月面陨石坑装饰（平放在月面顶部）
    [[0.7, 0.5, 0.22], [-0.8, -0.3, 0.3], [0.2, -0.9, 0.16]].forEach(([x, z, r]) => {
      const crater = this._mesh(new THREE.TorusGeometry(r, r * 0.28, 8, 18), moonMat, x, -1.13, z);
      crater.rotation.x = Math.PI / 2;
      g.add(crater);
    });
  }

  /* ==================== 更新 ==================== */

  /**
   * 每帧更新：自转 + 呼吸灯发光
   * @param {number} time 累计时间（秒）
   * @param {number} dt 帧间隔（秒）
   */
  update(time, dt) {
    const frame = dt * 60; // 归一化到 60fps，保证不同刷新率下速度一致
    for (const rec of this.records.values()) {
      // 持续缓慢自转（规格：rotation.y += 0.003 / 帧）
      rec.modelGroup.rotation.y += 0.003 * frame;

      // 呼吸灯：emissiveIntensity 在 0.3 ~ 1.0 波动；高亮时提升到 2.0
      const breath = 0.65 + 0.35 * Math.sin(time * 2 + rec.phase);
      const target = rec.highlight ? 2.0 : breath;
      rec.materials.forEach((m) => {
        // 材质基础强度不同（panel/dark 更低），按比例缩放
        const baseRatio = m.userData?.ratio ?? 1;
        m.emissiveIntensity += (target * baseRatio - m.emissiveIntensity) * Math.min(1, dt * 8);
      });
      rec.light.intensity = rec.highlight ? 3.4 : 2;
    }
  }

  /* ==================== 交互高亮 ==================== */

  /**
   * 设置高亮的代表物（其余取消高亮）
   * @param {string|null} id
   */
  setHighlight(id) {
    for (const [recId, rec] of this.records) {
      const on = recId === id;
      if (rec.highlight !== on) {
        rec.highlight = on;
        rec.labelEl.classList.toggle('highlight', on);
      }
    }
  }

  /* ==================== 查询 ==================== */

  /** 获取代表物世界坐标 */
  getPosition(id) {
    const rec = this.records.get(id);
    return rec ? rec.root.position : null;
  }

  /* ==================== 编辑支持 ==================== */

  /** 数据变更后重建单个代表物（实时预览） */
  rebuildExhibit(data) {
    this.removeExhibit(data.id);
    this.buildExhibit(data);
  }

  /** 移除并释放代表物资源 */
  removeExhibit(id) {
    const rec = this.records.get(id);
    if (!rec) return;
    this.scene.remove(rec.root);
    this._disposeObject(rec.root);
    rec.labelEl.remove();
    this.records.delete(id);
  }

  /** 递归释放几何体 / 材质 / 贴图 */
  _disposeObject(obj) {
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }
}

export default ExhibitManager;
