/**
 * SpaceEnvironment.js —— 太空环境模块
 * ------------------------------------------------------------
 * 职责：构建深空氛围 —— 星空粒子、深空雾效、时间线光带、星云装饰、环境光。
 * 全部内容由程序化生成，不依赖任何外部贴图文件。
 */

import * as THREE from 'three';

class SpaceEnvironment {
  /**
   * @param {THREE.Scene} scene 主场景
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {THREE.Points[]} 星空粒子层 */
    this.starLayers = [];
    this.nebulae = [];
  }

  /**
   * 根据 settings 构建全部环境元素
   * @param {Object} settings exhibits.json 中的 settings 字段
   */
  build(settings) {
    const starCount = settings.star_count || 5000;
    const lineColor = settings.timeline_line_color || '#4488FF';

    this._buildStars(starCount);
    this._buildFog();
    this._buildTimelineBand(lineColor);
    this._buildNebulae();
    this._buildAmbient();
  }

  /* ---------------- 星空 ---------------- */

  /**
   * 星空背景：BufferGeometry 随机粒子点。
   * 为实现「大小随机」，将星星分为大 / 中 / 小三层。
   */
  _buildStars(totalCount) {
    // 三层星星的尺寸与占比
    const layers = [
      { size: 2.2, ratio: 0.12, opacity: 1.0 },   // 少量亮星
      { size: 1.3, ratio: 0.3, opacity: 0.85 },   // 中等
      { size: 0.7, ratio: 0.58, opacity: 0.7 },   // 大量暗星
    ];
    const range = 500; // 分布范围 ±500

    layers.forEach((layer) => {
      const count = Math.floor(totalCount * layer.ratio);
      const positions = new Float32Array(count * 3);

      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 2 * range;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2 * range;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * range - 300; // 中心偏向航线中段
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: layer.size,
        sizeAttenuation: true,
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        fog: false, // 星星作为背景不受深空雾影响
      });

      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this.starLayers.push(points);
    });
  }

  /* ---------------- 深空雾效 ---------------- */

  /** FogExp2 指数雾，营造深空纵深感 */
  _buildFog() {
    this.scene.fog = new THREE.FogExp2(0x000010, 0.0015);
  }

  /* ---------------- 时间线光带 ---------------- */

  /**
   * 沿 Z 轴（z=0 → z=-650）的发光线条，象征 1970—2024 的时间轴
   */
  _buildTimelineBand(color) {
    const length = 650;
    const group = new THREE.Group();

    // 核心亮线
    const coreGeo = new THREE.BoxGeometry(0.16, 0.16, length);
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    const core = new THREE.Mesh(coreGeo, coreMat);

    // 外层光晕（加色混合的半透明粗线）
    const haloGeo = new THREE.BoxGeometry(0.9, 0.9, length);
    const haloMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);

    group.add(core, halo);
    group.position.set(0, -3.5, -length / 2); // 航线正下方，从 z=0 延伸到 z=-650
    this.scene.add(group);
    this.timelineBand = group;
  }

  /* ---------------- 星云装饰 ---------------- */

  /**
   * 星云：在代表物之间的过渡区域放置大尺寸半透明渐变平面，
   * 贴图由 Canvas 程序化生成（径向渐变），无需外部资源。
   */
  _buildNebulae() {
    const palettes = [
      ['rgba(70, 110, 255, 0.55)', 'rgba(30, 50, 140, 0.22)', 'rgba(0,0,0,0)'],
      ['rgba(150, 90, 255, 0.5)', 'rgba(70, 40, 150, 0.2)', 'rgba(0,0,0,0)'],
      ['rgba(60, 200, 220, 0.42)', 'rgba(20, 90, 120, 0.18)', 'rgba(0,0,0,0)'],
      ['rgba(255, 120, 80, 0.35)', 'rgba(120, 50, 40, 0.16)', 'rgba(0,0,0,0)'],
      ['rgba(90, 140, 255, 0.45)', 'rgba(40, 60, 160, 0.2)', 'rgba(0,0,0,0)'],
      ['rgba(200, 120, 255, 0.4)', 'rgba(90, 50, 140, 0.18)', 'rgba(0,0,0,0)'],
    ];

    // 分布在航线两侧与前后，位于代表物之间的过渡区
    const placements = [
      { pos: [-70, 25, -95], size: 190, rot: 0.4 },
      { pos: [80, -30, -160], size: 230, rot: -0.7 },
      { pos: [-90, -20, -260], size: 210, rot: 1.1 },
      { pos: [75, 35, -350], size: 250, rot: 2.0 },
      { pos: [-80, 15, -470], size: 220, rot: -1.4 },
      { pos: [60, -35, -580], size: 200, rot: 0.8 },
    ];

    placements.forEach((p, i) => {
      const tex = this._makeNebulaTexture(palettes[i % palettes.length]);
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const geo = new THREE.PlaneGeometry(p.size, p.size);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...p.pos);
      mesh.rotation.set(
        Math.random() * Math.PI,
        p.rot,
        Math.random() * Math.PI
      );
      mesh.userData.spin = (Math.random() - 0.5) * 0.02; // 极缓慢自转
      this.scene.add(mesh);
      this.nebulae.push(mesh);
    });
  }

  /** 用 Canvas 生成径向渐变星云贴图 */
  _makeNebulaTexture([inner, middle, outer]) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(
      size / 2, size / 2, 0,
      size / 2, size / 2, size / 2
    );
    grad.addColorStop(0, inner);
    grad.addColorStop(0.45, middle);
    grad.addColorStop(1, outer);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // 叠加少量随机亮斑，模拟星云内部不均匀结构
    for (let i = 0; i < 26; i++) {
      const r = 6 + Math.random() * 26;
      const x = size * 0.2 + Math.random() * size * 0.6;
      const y = size * 0.2 + Math.random() * size * 0.6;
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
      g2.addColorStop(0, inner);
      g2.addColorStop(1, outer);
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------------- 环境光 ---------------- */

  /** 非常暗的蓝紫色环境光 */
  _buildAmbient() {
    this.scene.add(new THREE.AmbientLight(0x111122, 0.3));
  }

  /* ---------------- 帧更新 ---------------- */

  /**
   * @param {number} time 累计时间（秒）
   * @param {number} dt 帧间隔（秒）
   */
  update(time, dt) {
    // 星层极缓慢旋转，制造漂浮感
    this.starLayers.forEach((p, i) => {
      p.rotation.y += dt * 0.002 * (i + 1) * 0.5;
    });
    // 星云缓慢自转
    this.nebulae.forEach((n) => {
      n.rotation.z += n.userData.spin * dt;
    });
  }
}

export default SpaceEnvironment;
