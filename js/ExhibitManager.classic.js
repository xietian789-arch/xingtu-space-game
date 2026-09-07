// ExhibitManager.js —— 经典脚本版本（适配 file:// 协议）
(function () {

const { Group, Color, MeshStandardMaterial, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, IcosahedronGeometry, DodecahedronGeometry, CapsuleGeometry, BufferGeometry, Line, LineBasicMaterial, Vector3, PointLight, Box3, Sphere } = THREE;
const CSS2DObject = THREE.CSS2DObject;
const GLTFLoader = THREE.GLTFLoader;

const gltfLoader = new GLTFLoader();

class ExhibitManager {
  /**
   * @param {THREE.Scene} scene 主场景
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, Object>} id → 代表物运行时记录 */
    this.records = new Map();
    /** @type {Array<THREE.Mesh>} 所有陨石障碍物（用于碰撞检测） */
    this.asteroids = [];
    /** @type {THREE.Group|null} 预加载的陨石GLB模型 */
    this.asteroidModel = null;
    /** @type {boolean} 陨石模型是否已加载完成 */
    this.asteroidModelLoaded = false;
    /** @type {boolean} 陨石模型是否已开始加载（避免重复触发） */
    this.asteroidModelLoading = false;
    /** @type {Array} 陨石懒加载区域 */
    this.asteroidZones = [];
  }

  /** 触发陨石GLB模型懒加载（玩家靠近时调用） */
  _triggerAsteroidLoad() {
    if (this.asteroidModelLoading || this.asteroidModelLoaded) return;
    this.asteroidModelLoading = true;
    console.info('[ExhibitManager] 玩家接近陨石区域，开始加载陨石模型…');
    var asteroidUrl = XINGTU.resolveModelPath ? XINGTU.resolveModelPath('models/asteroid.glb') + '&t=1' : 'models/asteroid.glb';
    gltfLoader.load(
      asteroidUrl,
      (gltf) => {
        this.asteroidModel = gltf.scene;
        this.asteroidModelLoaded = true;
        console.info('[ExhibitManager] 陨石模型加载成功');
      },
      undefined,
      (err) => {
        console.warn('[ExhibitManager] 陨石模型加载失败，将使用简单几何体:', err);
      }
    );
  }

  /* ==================== 构建 ==================== */

  /** 清空并重建全部代表物 */
  buildAll(exhibits) {
    // 移除旧的
    for (const id of Array.from(this.records.keys())) {
      this.removeExhibit(id);
    }
    // 清空旧陨石
    this.asteroids = [];
    
    exhibits.forEach((data) => this.buildExhibit(data));
    
    // 计算陨石懒加载区域（代表物之间的中段位置）
    this._buildAsteroidZones(exhibits);
    // 先用简单几何体快速填充陨石，不等 GLB 下载
    this._addAsteroidsBetweenExhibits(exhibits);
    this._addAsteroidsBeforeFirstExhibit();
  }
  
  /** 计算陨石懒加载区域（相邻代表物中点） */
  _buildAsteroidZones(exhibits) {
    this.asteroidZones = [];
    const sorted = [...exhibits].sort((a, b) => (a.position[2] || 0) - (b.position[2] || 0));
    if (sorted.length > 0) {
      this.asteroidZones.push(new Vector3(0, 0, (sorted[0].position[2] || 0) / 2));
    }
    for (let i = 0; i < sorted.length - 1; i++) {
      const z1 = sorted[i].position[2];
      const z2 = sorted[i + 1].position[2];
      this.asteroidZones.push(new Vector3(0, 0, (z1 + z2) / 2));
    }
  }

  /** 随机岩石色：从岩石色板选色相/饱和度基底，再叠加轻微抖动。 */
  _randomRockColor() {
    const palettes = [
      [0.06, 0.34], // 赭石
      [0.02, 0.40], // 红棕
      [0.09, 0.46], // 棕褐
      [0.16, 0.24], // 橄榄绿
      [0.58, 0.18], // 灰蓝
      [0.62, 0.10], // 炭灰
      [0.75, 0.16], // 淡紫岩
      [0.11, 0.32], // 沙金
    ];
    const [hue, sat] = palettes[Math.floor(Math.random() * palettes.length)];
    return {
      h: hue + (Math.random() - 0.5) * 0.02,
      s: Math.min(0.6, sat * (0.7 + Math.random() * 0.6)),
      l: 0.34 + Math.random() * 0.3,
    };
  }

  /**
   * 为陨石应用随机岩石色。
   * 注意：GLB 克隆体与原件共享材质，必须逐 mesh 克隆材质再着色，
   * 否则所有陨石会互相覆盖成同一种颜色。
   */
  _applyAsteroidColor(asteroid) {
    asteroid.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      const rock = this._randomRockColor();
      child.material = child.material.clone();
      child.material.color.setHSL(rock.h, rock.s, rock.l);
    });
  }

  /**
   * 双峰尺寸分布：有大有小，整体放大。
   * @param {number} [largeProb=0.4] 巨岩概率；飞行器之间传更大值让障碍物更显眼。
   */
  _randomAsteroidScale(largeProb = 0.4) {
    const base = Math.random() < largeProb
      ? 4.2 + Math.random() * 7.8   // 大：4.2-12.0（原 3.2-9.2）
      : 1.0 + Math.random() * 2.2;  // 小：1.0-3.2（原 0.7-2.5）
    const jitter = () => 0.65 + Math.random() * 0.7;
    return { x: base * jitter(), y: base * jitter(), z: base * jitter() };
  }

  /**
   * 计算陨石的世界包围球并写入 userData（含缩放/旋转/模型偏心），
   * 供碰撞检测直接使用；半径收紧到 85%，贴近岩面才触发碰撞。
   */
  _setCollisionVolume(asteroid) {
    const box = new Box3().setFromObject(asteroid);
    const sphere = box.getBoundingSphere(new Sphere());
    asteroid.userData.collisionRadius = sphere.radius * 0.85;
    asteroid.userData.collisionCenter = sphere.center.clone();
  }

  /**
   * 为代表物模型注入边缘光（Fresnel 轮廓光）：
   * 修改材质着色器，强度由 uRimIntensity uniform 每帧按近距渐变驱动。
   * GLB 克隆材质可能被多个代表物共享，注入前先按代表物克隆；
   * 占位模型材质为本代表物独有，直接原地注入。
   * @param {Object} rec records 记录
   * @param {THREE.Color} baseColor 边缘光基色（通常取发光色）
   */
  _attachRimLight(rec, baseColor) {
    rec.rimMaterials = [];
    const rimColor = baseColor.clone().lerp(new Color(0xffffff), 0.45);
    rec.modelGroup.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      let mat = child.material;
      if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
      if (!mat.userData.rimInjected) {
        if (!rec.materials.includes(mat)) {
          // GLB 材质可能共享，克隆后注入，避免不同代表物互相影响
          mat = mat.clone();
          child.material = mat;
        }
        mat.userData.rimInjected = true;
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uRimColor = { value: rimColor.clone() }; 
          shader.uniforms.uRimIntensity = { value: 0 };
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>',
              '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimIntensity;')
            .replace('#include <emissivemap_fragment>',
              '#include <emissivemap_fragment>\n'
              + 'float xingtuRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);\n'
              + 'totalEmissiveRadiance += uRimColor * xingtuRim * uRimIntensity;');
          mat.userData.rimShader = shader;
        };
        mat.customProgramCacheKey = () => 'xingtu-rim';
      }
      rec.rimMaterials.push(mat);
    });
  }

  /** 在第一个展品（东方红一号）前面添加陨石 */
  _addAsteroidsBeforeFirstExhibit() {
    // 在 Z=-60 到 Z=50 之间添加 8-12 个陨石
    const count = 8 + Math.floor(Math.random() * 5); // 8-12 个
    
    for (let i = 0; i < count; i++) {
      const z = -60 + Math.random() * 110; // -60 到 +50
      
      // 陨石分布在虫洞内部，隧道半径28内
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * 22; // 0-22，留出一点余量
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      
      let asteroid;
      
      asteroid = this._buildProceduralAsteroid();
      const s = this._randomAsteroidScale();
      asteroid.scale.set(s.x, s.y, s.z);
      asteroid.position.set(x, y, z);
      asteroid.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      
      this._setCollisionVolume(asteroid);
      this.scene.add(asteroid);
      this.asteroids.push(asteroid); // 加入碰撞检测列表
    }
  }

  /** 在展品之间添加陨石障碍物 */
  _addAsteroidsBetweenExhibits(exhibits) {
    for (let i = 0; i < exhibits.length - 1; i++) {
      const ex1 = exhibits[i];
      const ex2 = exhibits[i + 1];
      
      // 计算两个展品之间的 Z 轴距离
      const z1 = ex1.position[2];
      const z2 = ex2.position[2];
      const midZ = (z1 + z2) / 2;
      
      // 在中间位置添加 2-5 个陨石（增加密度）
      const count = Math.floor(Math.random() * 4) + 2; // 2-5 个
      
      for (let j = 0; j < count; j++) {
        // 陨石分布在虫洞内部，隧道半径28内
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 22; // 0-22，留出一点余量
        const offsetX = Math.cos(angle) * distance;
        const offsetY = Math.sin(angle) * distance;
        const offsetZ = (Math.random() - 0.5) * 40; // 前后浮动 ±20
        
        const asteroidZ = midZ + offsetZ;
        
        let asteroid;
        
        asteroid = this._buildProceduralAsteroid();
        
        // 双峰尺寸：飞行器之间偏向巨岩（70% 大岩），障碍感更强
        const s = this._randomAsteroidScale(0.7);
        asteroid.scale.set(s.x, s.y, s.z);
        
        asteroid.position.set(offsetX, offsetY, asteroidZ);
        
        // 完全随机的旋转
        asteroid.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );
        
        this._setCollisionVolume(asteroid);
        this.scene.add(asteroid);
        this.asteroids.push(asteroid); // 加入碰撞检测列表
      }
    }
  }

  /** 获取所有陨石（用于碰撞检测） */
  getAsteroids() {
    return this.asteroids;
  }

  /** 构建程序化陨石（噪声变形二十面体） */
  _buildProceduralAsteroid() {
    const size = 0.8 + Math.random() * 0.6;
    const geo = this._buildAsteroidGeometry(size);
    const rock = this._randomRockColor();
    const mat = new MeshStandardMaterial({
      color: new Color().setHSL(rock.h, rock.s, rock.l),
      roughness: 0.7 + Math.random() * 0.3,
      metalness: Math.random() * 0.15,
      flatShading: true,
    });
    const mesh = new Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 陨石已改为程序化生成，无需加载 GLB */
  _checkAsteroidLazyLoad(playerPosition) { /* no-op */ }

  /**
   * 构建单个代表物
   * @param {Object} data exhibits.json 中的一条记录
   */
  buildExhibit(data) {
    if (this.records.has(data.id)) this.removeExhibit(data.id);

    // ---- 防御性补全：localStorage 旧数据可能缺少 model_chunks ----
    if (data.model_path && !data.model_chunks) {
      const chunkMap = {
        'models/astronaut.glb':      { prefix: 'ASTRONAUT_GLB_PART', count: 7 },
      };
      const info = chunkMap[data.model_path];
      if (info) {
        data.model_chunks = info;
        console.info(`[ExhibitManager] 自动补全 model_chunks: ${data.id} → ${info.prefix} x${info.count}`);
      }
    }

    const root = new Group();
    root.name = data.id;
    root.position.fromArray(data.position || [0, 0, -60]);
    const s = data.scale || 1;
    root.scale.setScalar(s);
    root.userData.id = data.id;

    const modelGroup = new Group();
    modelGroup.userData.modelSource = 'placeholder';
    modelGroup.userData.expectedModelPath = data.model_path || '';
    root.add(modelGroup);

    // ---- 材质（统一金属质感 + 发光） ----
    const materials = [];
    const glowColor = new Color(data.glow_color || '#4488FF');
    const metal = new MeshStandardMaterial({
      color: 0xdde5f5, // 提高基础亮度（原 0xb9c5da）
      metalness: 0.6,
      roughness: 0.3,
      emissive: glowColor,
      emissiveIntensity: 0.34,
    });
    const panel = new MeshStandardMaterial({
      color: 0x1e3a7a, // 提高面板亮度（原 0x16295e）
      metalness: 0.7,
      roughness: 0.25,
      emissive: glowColor,
      emissiveIntensity: 0.24,
    });
    const dark = new MeshStandardMaterial({
      color: 0x4a5a72, // 提高暗部亮度（原 0x3a4152）
      metalness: 0.6,
      roughness: 0.4,
      emissive: glowColor,
      emissiveIntensity: 0.12,
    });
    materials.push(metal, panel, dark);
    // 记录各材质发光强度的比例（呼吸灯 / 高亮时按此比例缩放）
    metal.userData.ratio = 1;
    panel.userData.ratio = 0.67;
    dark.userData.ratio = 0.33;

    // ---- 占位模型 ----
    this._buildPlaceholder(data, modelGroup, { metal, panel, dark }, materials);

    // GLB 模型延迟到玩家靠近时再加载（懒加载），减少初始网络压力
    // model_path / companion_model_path 记录在 rec.data 中，由 update() 距离触发

    // ---- 局部光源 ----
    const light = new PointLight(glowColor, 0.78, 24, 1.8);
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
    const box = new Box3().setFromObject(modelGroup);
    const labelY = (isFinite(box.max.y) ? box.max.y : 1.5) + 1.1;
    const labelObj = new CSS2DObject(labelEl);
    labelObj.position.set(0, labelY, 0);
    root.add(labelObj);

    this.scene.add(root);

    const rec = {
      data,
      root,
      modelGroup,
      materials,
      light,
      labelEl,
      labelObj,
      phase: Math.random() * Math.PI * 2, // 呼吸灯随机相位
      highlight: false,
      glbTriggered: false,
      glbLoaded: false,
      companionPath: data.companion_model_path || '',
    };
    this.records.set(data.id, rec);

    // 占位模型先行注入边缘光；GLB 加载完成后会重新注入
    this._attachRimLight(rec, glowColor);
  }

  /** 若提供了 .glb 路径则加载替换占位模型（失败时保留占位模型）
   *  @param {string} path GLB 文件路径（http:// 协议下使用）
   *  @param {THREE.Group} modelGroup 目标模型组
   *  @param {Array} materials 材质数组
   *  @param {Object} [chunks] 分片信息 { prefix, count }（file:// 协议下使用）
   *  @param {string} [companionPath] 同一任务内需要同屏显示的伴随模型
   *  @param {Function} [onApplied] 模型应用完成后的回调（含锚点计算）
   */
  _tryLoadGltf(path, modelGroup, materials, chunks, companionPath, onApplied) {
    const applyModel = (gltfScene, companionScene = null) => {
      while (modelGroup.children.length) {
        const c = modelGroup.children[0];
        modelGroup.remove(c);
        this._disposeObject(c);
      }
      const prepare = (scene) => scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      prepare(gltfScene);
      if (companionScene) prepare(companionScene);

      if (companionScene) {
        gltfScene.position.x = -0.48;
        companionScene.position.set(0.68, -0.34, 0.12);
        companionScene.scale.setScalar(0.68);
      }

      // 记录模型视觉中心（modelGroup 局部坐标）：
      // GLB 原点未必居中，HUD 锁定框与标签需以包围盒中心为锚，
      // 否则会偏离飞行器实际位置。此时场景尚未入图，得到的是纯局部坐标。
      try {
        gltfScene.updateMatrixWorld(true);
        const anchorBox = new Box3().setFromObject(gltfScene);
        if (companionScene) {
          companionScene.updateMatrixWorld(true);
          anchorBox.union(new Box3().setFromObject(companionScene));
        }
        if (isFinite(anchorBox.min.x) && isFinite(anchorBox.max.x)) {
          modelGroup.userData.uiCenter = anchorBox.getCenter(new Vector3());
          modelGroup.userData.uiTopY = anchorBox.max.y;
        }
      } catch (err) {
        console.warn('[ExhibitManager] 模型锚点计算失败，回退使用根位置：', err);
      }

      modelGroup.add(gltfScene);
      if (companionScene) modelGroup.add(companionScene);
      modelGroup.userData.modelSource = path;
      modelGroup.userData.companionSource = companionScene ? companionPath : '';

      if (onApplied) {
        try { onApplied(); } catch (err) {
          console.warn('[ExhibitManager] 模型应用回调报错:', err);
        }
      }

      // 不再添加 Sprite 光晕：其矩形面片会在部分浏览器中形成刺眼色块。
    };

    // 方式 1：分片 base64 加载（file:// 协议兼容）
    if (chunks && chunks.prefix && chunks.count) {
      console.info(`[ExhibitManager] 开始加载分片模型: prefix=${chunks.prefix}, count=${chunks.count}`);
      let totalBytes = 0;
      const chunkBuffers = [];
      let ok = true;

      for (let i = 0; i < chunks.count; i++) {
        const key = chunks.prefix + i;
        const b64 = window[key];
        if (!b64) { console.warn(`[ExhibitManager] 分片 ${key} 未找到 (typeof=${typeof window[key]})`); ok = false; break; }
        try {
          const bin = atob(b64);
          const bytes = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          chunkBuffers.push(bytes);
          totalBytes += bytes.length;
          console.info(`[ExhibitManager] 分片 ${key}: ${bytes.length} bytes OK`);
        } catch (err) {
          console.warn(`[ExhibitManager] 分片 ${key} base64解码失败:`, err);
          ok = false;
          break;
        }
      }

      if (ok && chunkBuffers.length > 0) {
        const combined = new Uint8Array(totalBytes);
        let offset = 0;
        for (const buf of chunkBuffers) { combined.set(buf, offset); offset += buf.length; }

        // 验证 glTF magic bytes
        const magic = String.fromCharCode(combined[0], combined[1], combined[2], combined[3]);
        console.info(`[ExhibitManager] 合并完成: ${totalBytes} bytes, magic="${magic}"`);

        if (magic !== 'glTF') {
          console.warn('[ExhibitManager] 非 glTF 数据，跳过解析');
          return;
        }

        try {
          // 关键：V8 内存池可能导致 combined.buffer 大于实际数据，必须 slice 出精确大小
          const exactBuffer = combined.buffer.slice(combined.byteOffset, combined.byteOffset + combined.byteLength);
          gltfLoader.parse(
            exactBuffer, '',
            (gltf) => {
              applyModel(gltf.scene);
              console.info(`[ExhibitManager] ✓ 模型加载成功，${gltf.scene.children.length} 个子对象`);
            },
            (err) => { console.warn('[ExhibitManager] GLB 解析回调报错:', err); }
          );
          console.info('[ExhibitManager] gltfLoader.parse() 已调用（异步解析中）');
        } catch (err) {
          console.warn('[ExhibitManager] gltfLoader.parse() 同步异常:', err);
        }
        return;
      }
    }

    // 方式 2：HTTP 直接加载；与详情页共享下载和解析结果。
    console.info(`[ExhibitManager] 分片加载不可用，尝试加载: ${path}`);
    if (XINGTU.ModelLibrary) {
      const requests = [XINGTU.ModelLibrary.clone(path)];
      if (companionPath) requests.push(XINGTU.ModelLibrary.clone(companionPath));
      Promise.all(requests)
        .then((scenes) => {
          applyModel(scenes[0], scenes[1] || null);
          console.info(`[ExhibitManager] 已加载模型 ${path}${companionPath ? ' + ' + companionPath : ''}`);
        })
        .catch((err) => {
          modelGroup.userData.modelSource = 'load-error';
          console.warn(`[ExhibitManager] 模型加载失败，保留占位模型：${path}`, err);
        });
      return;
    }

    gltfLoader.load(
      path,
      (gltf) => { applyModel(gltf.scene); console.info(`[ExhibitManager] 已加载模型 ${path}`); },
      undefined,
      (err) => { console.warn(`[ExhibitManager] 模型加载失败，保留占位模型：${path}`, err); }
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
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /* ---- 高精度太阳能板：框架 + 多块电池板 + 连接铰链 ---- */
  _solarPanel(mats, w, x, y = 0, rotZ = 0) {
    const grp = new Group();
    const segs = Math.max(2, Math.round(w / 0.42));
    const segW = (w - 0.04 * (segs - 1)) / segs;
    for (let i = 0; i < segs; i++) {
      const sx = x + (x >= 0 ? 1 : -1) * (i * (segW + 0.04) + segW / 2);
      grp.add(this._mesh(new BoxGeometry(segW, 0.025, 0.72), mats.panel, sx, y, 0));
    }
    grp.add(this._mesh(new BoxGeometry(Math.abs(w), 0.012, 0.012), mats.dark, x + (x >= 0 ? w / 2 : -w / 2), y, 0.37));
    grp.add(this._mesh(new BoxGeometry(Math.abs(w), 0.012, 0.012), mats.dark, x + (x >= 0 ? w / 2 : -w / 2), y, -0.37));
    const strutL = Math.max(0.25, Math.abs(x) - w / 2 + 0.15);
    const strut = this._mesh(new CylinderGeometry(0.022, 0.022, strutL, 6), mats.dark, x * 0.45, y, 0);
    strut.rotation.z = Math.PI / 2;
    grp.add(strut);
    grp.rotation.z = rotZ;
    return grp;
  }

  /* ---- 高精度太阳能板（Z轴方向展开） ---- */
  _solarPanelZ(mats, w, x, y, z) {
    const grp = new Group();
    const segs = Math.max(2, Math.round(w / 0.42));
    const segW = (w - 0.04 * (segs - 1)) / segs;
    for (let i = 0; i < segs; i++) {
      const sz = z + (i * (segW + 0.04) + segW / 2);
      grp.add(this._mesh(new BoxGeometry(0.72, 0.025, segW), mats.panel, x, y, sz));
    }
    grp.add(this._mesh(new BoxGeometry(0.012, 0.012, Math.abs(w)), mats.dark, x, y, z + w / 2));
    grp.add(this._mesh(new BoxGeometry(0.012, 0.012, Math.abs(w)), mats.dark, x, y, z - w / 2));
    return grp;
  }

  /* ---- 环形太阳能板（绕圆柱径向展开） ---- */
  _solarPanelRadial(mats, w, x, y, z, rotAxis = 'x') {
    const grp = this._solarPanel(mats, w, w / 2 + 0.1, 0, 0);
    grp.position.set(x, y, z);
    if (rotAxis === 'x') grp.rotation.x = Math.PI / 2;
    else if (rotAxis === 'z') grp.rotation.z = Math.PI / 2;
    return grp;
  }

  /* ---- 引擎喷口 ---- */
  _thruster(mat, glowMat, x = 0, y = 0, z = 0, s = 1) {
    const grp = new Group();
    grp.add(this._mesh(new CylinderGeometry(0.06 * s, 0.12 * s, 0.18 * s, 12), mat));
    if (glowMat) {
      const inner = this._mesh(new CylinderGeometry(0.04 * s, 0.09 * s, 0.1 * s, 10), glowMat, 0, -0.06 * s, 0);
      grp.add(inner);
    }
    grp.position.set(x, y, z);
    return grp;
  }

  /* ---- 圆柱体表面窗口/舷窗 ---- */
  _addPortholes(g, mat, count, radius, y, cylRadius) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const px = Math.cos(angle) * (cylRadius + 0.01);
      const pz = Math.sin(angle) * (cylRadius + 0.01);
      const p = this._mesh(new SphereGeometry(0.055, 8, 6), mat, px, y, pz);
      p.scale.set(1, 1, 0.4);
      g.add(p);
    }
  }

  /* ---- 抛物面天线 ---- */
  _antennaDish(mat, x, y, z, r = 0.3) {
    const grp = new Group();
    const dish = this._mesh(new SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.8), mat);
    dish.rotation.x = Math.PI;
    grp.add(dish);
    grp.add(this._mesh(new CylinderGeometry(0.012, 0.012, r * 0.7, 5), mat, 0, r * 0.25, 0));
    grp.position.set(x, y, z);
    return grp;
  }

  /* ---- RCS 推进器组（4个小型喷嘴） ---- */
  _rscThrusters(mat, x, y, z) {
    const grp = new Group();
    const geo = new ConeGeometry(0.035, 0.08, 6);
    [[0.08, 0, 0], [-0.08, 0, 0], [0, 0, 0.08], [0, 0, -0.08]].forEach(([dx, dy, dz]) => {
      const t = this._mesh(geo, mat, dx, dy, dz);
      t.lookAt(new Vector3(dx * 3, dy, dz * 3));
      grp.add(t);
    });
    grp.position.set(x, y, z);
    return grp;
  }

  /* ---- 玉兔号/祝融号月球车（高精度版） ---- */
  _buildRover(mats) {
    const rover = new Group();
    rover.add(this._mesh(new BoxGeometry(0.62, 0.22, 0.42), mats.metal, 0, 0.16, 0));
    rover.add(this._mesh(new BoxGeometry(0.58, 0.015, 0.38), mats.dark, 0, 0.28, 0));
    rover.add(this._mesh(new BoxGeometry(0.64, 0.02, 0.48), mats.panel, 0, 0.36, 0));
    // 太阳能板网格线
    for (let i = -2; i <= 2; i++) {
      rover.add(this._mesh(new BoxGeometry(0.64, 0.008, 0.006), mats.dark, 0, 0.375, i * 0.1));
    }
    const wheelGeo = new CylinderGeometry(0.09, 0.09, 0.06, 14);
    const hubGeo = new CylinderGeometry(0.04, 0.04, 0.07, 8);
    [-0.24, 0, 0.24].forEach((xp) => {
      [0.26, -0.26].forEach((zp) => {
        const w = this._mesh(wheelGeo, mats.dark, xp, -0.02, zp);
        w.rotation.x = Math.PI / 2;
        rover.add(w);
        const h = this._mesh(hubGeo, mats.metal, xp, -0.02, zp);
        h.rotation.x = Math.PI / 2;
        rover.add(h);
      });
    });
    rover.add(this._mesh(new CylinderGeometry(0.02, 0.02, 0.32, 8), mats.dark, 0.2, 0.52, 0.1));
    rover.add(this._mesh(new BoxGeometry(0.1, 0.07, 0.07), mats.metal, 0.2, 0.7, 0.1));
    rover.add(this._mesh(new SphereGeometry(0.025, 8, 6), mats.panel, 0.2, 0.75, 0.1));
    rover.add(this._mesh(new CylinderGeometry(0.035, 0.05, 0.06, 8), mats.dark, -0.18, 0.3, -0.15));
    return rover;
  }

  /* ---- 不规则陨石几何体（噪声变形） ---- */
  _buildAsteroidGeometry(size) {
    const geo = new IcosahedronGeometry(size, 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const len = Math.sqrt(x * x + y * y + z * z);
      const nx = x / len, ny = y / len, nz = z / len;
      const noise = 0.7 + 0.3 * Math.sin(nx * 5.7 + ny * 3.1) * Math.cos(nz * 4.3 + nx * 2.7)
        + 0.15 * Math.sin(nx * 11.3 + nz * 7.9) * Math.cos(ny * 9.1);
      pos.setXYZ(i, nx * size * noise, ny * size * noise, nz * size * noise);
    }
    geo.computeVertexNormals();
    return geo;
  }

  /* ---- 1. 东方红一号：多面体球状卫星 + 天线阵 + 四片太阳能板 ---- */
  _buildDongfanghong(g, mats, materials) {
    // 主体：二十面体（ faceted 球体）
    g.add(this._mesh(new IcosahedronGeometry(0.85, 1), mats.metal));
    // 赤道环形带
    g.add(this._mesh(new TorusGeometry(0.87, 0.025, 8, 28), mats.dark, 0, 0, 0));
    // 表面仪器模块（8个小凸起）
    for (let i = 0; i < 8; i++) {
      const phi = Math.acos(1 - 2 * (i + 0.5) / 8);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const bx = 0.82 * Math.sin(phi) * Math.cos(theta);
      const by = 0.82 * Math.cos(phi);
      const bz = 0.82 * Math.sin(phi) * Math.sin(theta);
      const box = this._mesh(new BoxGeometry(0.12, 0.06, 0.1), mats.dark, bx, by, bz);
      box.lookAt(0, 0, 0);
      g.add(box);
    }
    // 四片太阳能板（带框架细节）
    const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    angles.forEach((a) => {
      const holder = new Group();
      // 主面板（分段）
      const panelGrp = new Group();
      panelGrp.add(this._mesh(new BoxGeometry(0.88, 0.04, 0.68), mats.panel, 1.28, 0, 0));
      panelGrp.add(this._mesh(new BoxGeometry(0.82, 0.04, 0.68), mats.panel, 2.2, 0, 0));
      // 面板间连接铰链
      panelGrp.add(this._mesh(new BoxGeometry(0.06, 0.06, 0.12), mats.dark, 1.78, 0, 0));
      // 支撑臂
      panelGrp.add(this._mesh(new CylinderGeometry(0.025, 0.025, 0.85, 6), mats.dark, 0.45, 0, 0));
      const strut = this._mesh(new CylinderGeometry(0.018, 0.018, 1.4, 5), mats.dark, 1.5, 0, 0);
      strut.rotation.z = Math.PI / 2;
      panelGrp.add(strut);
      holder.add(panelGrp);
      holder.rotation.y = a;
      g.add(holder);
    });
    // 底部四根天线（更精细）
    for (let i = 0; i < 4; i++) {
      const holder = new Group();
      // 主天线杆
      const ant = this._mesh(new CylinderGeometry(0.012, 0.018, 1.4, 6), mats.dark);
      ant.position.y = -0.65;
      ant.rotation.x = 0.55;
      holder.add(ant);
      // 天线顶端小球
      const tip = this._mesh(new SphereGeometry(0.025, 6, 5), mats.metal, 0, -1.3, 0.55);
      holder.add(tip);
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
    // 顶部短天线
    g.add(this._mesh(new CylinderGeometry(0.01, 0.01, 0.4, 5), mats.dark, 0, 1.05, 0));
    g.add(this._mesh(new SphereGeometry(0.03, 6, 5), mats.metal, 0, 1.28, 0));
  }

  /* ---- 2. 神舟五号：轨道舱 + 返回舱 + 推进舱 + 太阳能板 ---- */
  _buildShenzhou(g, mats) {
    // === 轨道舱（顶部圆柱） ===
    g.add(this._mesh(new CylinderGeometry(0.48, 0.5, 1.1, 22), mats.metal, 0, 0.95, 0));
    // 轨道舱细节环
    g.add(this._mesh(new TorusGeometry(0.5, 0.02, 8, 22), mats.dark, 0, 0.55, 0));
    g.add(this._mesh(new TorusGeometry(0.49, 0.015, 8, 22), mats.dark, 0, 1.35, 0));
    // 舷窗
    this._addPortholes(g, mats.dark, 4, 0.48, 1.0, 0.5);
    // 对接口（顶部）
    g.add(this._mesh(new CylinderGeometry(0.2, 0.22, 0.18, 16), mats.dark, 0, 1.6, 0));
    g.add(this._mesh(new TorusGeometry(0.18, 0.03, 8, 16), mats.metal, 0, 1.7, 0));

    // === 返回舱（圆锥体） ===
    g.add(this._mesh(new ConeGeometry(0.75, 1.0, 22), mats.metal, 0, -0.15, 0));
    // 热防护层（底部隔热罩）
    g.add(this._mesh(new CylinderGeometry(0.75, 0.72, 0.06, 22), mats.dark, 0, -0.62, 0));
    // 舱体分界线
    g.add(this._mesh(new TorusGeometry(0.63, 0.018, 8, 22), mats.dark, 0, 0.15, 0));

    // === 推进舱（底部圆柱） ===
    g.add(this._mesh(new CylinderGeometry(0.6, 0.55, 0.65, 20), mats.dark, 0, -1.1, 0));
    // 推进舱细节
    g.add(this._mesh(new TorusGeometry(0.58, 0.015, 8, 20), mats.metal, 0, -0.85, 0));
    // 主引擎喷口
    g.add(this._thruster(mats.dark, mats.panel, 0, -1.48, 0, 1.8));
    // 4个小姿态控制推进器
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i;
      const px = Math.cos(angle) * 0.56;
      const pz = Math.sin(angle) * 0.56;
      g.add(this._thruster(mats.dark, null, px, -1.25, pz, 0.6));
    }

    // === 两侧太阳能板（高精度分段式） ===
    g.add(this._solarPanel(mats, 1.9, 1.55, -1.05));
    g.add(this._solarPanel(mats, 1.9, -1.55, -1.05));
    // RCS 推进器组
    g.add(this._rscThrusters(mats.dark, 0.52, 0.6, 0));
    g.add(this._rscThrusters(mats.dark, -0.52, 0.6, 0));
  }

  /* ---- 3. 神舟七号：神舟造型 + 出舱宇航员 ---- */
  _buildShenzhou7(g, mats, materials) {
    this._buildShenzhou(g, mats);
    // === 出舱宇航员（更精细） ===
    const astro = new Group();
    // 头盔
    const helmet = this._mesh(new SphereGeometry(0.14, 14, 12), mats.metal, 0, 0.4, 0);
    astro.add(helmet);
    // 面罩
    const visor = this._mesh(new SphereGeometry(0.1, 12, 10),
      new MeshStandardMaterial({ color: 0x1a2f55, metalness: 0.9, roughness: 0.1, emissive: 0x2255aa, emissiveIntensity: 0.5 }),
      0, 0.4, 0.08);
    visor.scale.set(1, 0.8, 0.6);
    astro.add(visor);
    // 身体
    astro.add(this._mesh(new CapsuleGeometry(0.11, 0.3, 4, 10), mats.metal, 0, 0.05, 0));
    // 生命维持背包
    astro.add(this._mesh(new BoxGeometry(0.16, 0.22, 0.1), mats.dark, 0, 0.08, -0.14));
    // 左臂（伸展）
    const armL = this._mesh(new CapsuleGeometry(0.05, 0.22, 4, 8), mats.metal, 0.18, 0.12, 0.08);
    armL.rotation.z = 0.8;
    armL.rotation.x = -0.3;
    astro.add(armL);
    // 右臂
    const armR = this._mesh(new CapsuleGeometry(0.05, 0.22, 4, 8), mats.metal, -0.15, 0.15, -0.05);
    armR.rotation.z = -0.6;
    astro.add(armR);
    // 左腿
    const legL = this._mesh(new CapsuleGeometry(0.06, 0.2, 4, 8), mats.metal, 0.08, -0.25, 0.04);
    legL.rotation.z = 0.15;
    astro.add(legL);
    // 右腿
    const legR = this._mesh(new CapsuleGeometry(0.06, 0.2, 4, 8), mats.metal, -0.08, -0.25, -0.04);
    legR.rotation.z = -0.15;
    astro.add(legR);

    astro.position.set(1.25, 0.55, 0.5);
    astro.rotation.z = -0.4;
    g.add(astro);

    // === 安全系绳（曲线） ===
    const ropePts = [];
    for (let t = 0; t <= 1; t += 0.1) {
      const x = 0.5 + t * 0.72;
      const y = 0.4 + Math.sin(t * Math.PI) * 0.25;
      const z = 0.2 + t * 0.3;
      ropePts.push(new Vector3(x, y, z));
    }
    const rope = new Line(
      new BufferGeometry().setFromPoints(ropePts),
      new LineBasicMaterial({ color: 0xccd6ee, transparent: true, opacity: 0.7 })
    );
    g.add(rope);
  }

  /* ---- 4. 天宫一号 + 神舟八号：对接组合体 ---- */
  _buildDocking(g, mats) {
    // === 天宫一号（大圆柱，沿 X 轴） ===
    const tgBody = this._mesh(new CylinderGeometry(0.68, 0.68, 2.2, 24), mats.metal, -1.05, 0, 0);
    tgBody.rotation.z = Math.PI / 2;
    g.add(tgBody);
    // 前端缩窄段
    const tgFront = this._mesh(new CylinderGeometry(0.5, 0.68, 0.4, 20), mats.metal, -2.25, 0, 0);
    tgFront.rotation.z = Math.PI / 2;
    g.add(tgFront);
    // 后端
    const tgRear = this._mesh(new CylinderGeometry(0.68, 0.55, 0.3, 20), mats.dark, 0.15, 0, 0);
    tgRear.rotation.z = Math.PI / 2;
    g.add(tgRear);
    // 舱体细节环
    [-1.5, -0.8, -0.2].forEach(xp => {
      g.add(this._mesh(new TorusGeometry(0.69, 0.015, 8, 24), mats.dark, xp, 0, 0));
    });
    // 舷窗
    this._addPortholes(g, mats.dark, 3, -1.2, 0, 0.69);

    // === 神舟八号（小圆柱） ===
    const szBody = this._mesh(new CylinderGeometry(0.42, 0.42, 1.5, 18), mats.dark, 1.35, 0, 0);
    szBody.rotation.z = Math.PI / 2;
    g.add(szBody);
    // 返回舱锥段
    const szCone = this._mesh(new ConeGeometry(0.44, 0.5, 18), mats.dark, 2.25, 0, 0);
    szCone.rotation.z = -Math.PI / 2;
    g.add(szCone);
    // 细节环
    g.add(this._mesh(new TorusGeometry(0.43, 0.012, 8, 18), mats.metal, 1.0, 0, 0));

    // === 对接机构环 ===
    const dockRing = this._mesh(new TorusGeometry(0.48, 0.065, 12, 26), mats.metal, 0.42, 0, 0);
    dockRing.rotation.y = Math.PI / 2;
    g.add(dockRing);
    // 对接探针
    g.add(this._mesh(new CylinderGeometry(0.03, 0.03, 0.35, 6), mats.dark, 0.55, 0, 0));

    // === 天宫太阳能板（上下两片） ===
    g.add(this._mesh(new BoxGeometry(1.6, 0.04, 0.75), mats.panel, -1.05, 1.45, 0));
    g.add(this._mesh(new BoxGeometry(1.6, 0.04, 0.75), mats.panel, -1.05, -1.45, 0));
    // 太阳能板支撑臂
    g.add(this._mesh(new CylinderGeometry(0.02, 0.02, 0.7, 5), mats.dark, -1.05, 0.9, 0));
    g.add(this._mesh(new CylinderGeometry(0.02, 0.02, 0.7, 5), mats.dark, -1.05, -0.9, 0));
    // 神舟太阳能板（左右两片）
    g.add(this._solarPanel(mats, 1.2, 1.35, 0, Math.PI / 2));
    g.add(this._solarPanel(mats, 1.2, 1.35, 0, -Math.PI / 2));
  }

  /* ---- 5. 嫦娥三号：高精度着陆器 + 着陆腿 + 玉兔号 ---- */
  _buildChange3(g, mats) {
    // === 着陆器主体 ===
    g.add(this._mesh(new CylinderGeometry(1.0, 1.2, 0.42, 26), mats.metal, 0, 0.42, 0));
    g.add(this._mesh(new CylinderGeometry(0.52, 0.65, 0.28, 20), mats.dark, 0, 0.72, 0));
    g.add(this._mesh(new CylinderGeometry(0.3, 0.52, 0.2, 16), mats.metal, 0, 0.92, 0));
    g.add(this._mesh(new TorusGeometry(1.1, 0.02, 8, 26), mats.dark, 0, 0.25, 0));
    g.add(this._mesh(new TorusGeometry(0.58, 0.015, 8, 20), mats.dark, 0, 0.6, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(this._mesh(new BoxGeometry(0.1, 0.08, 0.08), mats.dark, Math.cos(a) * 0.75, 0.72, Math.sin(a) * 0.75));
    }
    // === 四条着陆腿（带减震垫） ===
    for (let i = 0; i < 4; i++) {
      const holder = new Group();
      holder.add(this._mesh(new CylinderGeometry(0.035, 0.05, 1.15, 8), mats.dark, 1.05, -0.22, 0));
      const brace = this._mesh(new CylinderGeometry(0.02, 0.02, 0.6, 6), mats.dark, 0.85, 0.05, 0);
      brace.rotation.z = 1.2;
      holder.add(brace);
      holder.add(this._mesh(new CylinderGeometry(0.15, 0.18, 0.05, 12), mats.dark, 1.42, -0.58, 0));
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
    // === 底部推进器 ===
    g.add(this._thruster(mats.dark, mats.panel, 0, 0.12, 0, 2.2));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      g.add(this._thruster(mats.dark, null, Math.cos(a) * 0.85, 0.15, Math.sin(a) * 0.85, 0.8));
    }
    // === 玉兔号月球车 ===
    const rover = this._buildRover(mats);
    rover.position.set(1.85, -0.58, 0.75);
    rover.rotation.y = 0.6;
    rover.scale.setScalar(0.9);
    g.add(rover);
    // 释放坡道
    const ramp = this._mesh(new BoxGeometry(0.3, 0.02, 0.8), mats.dark, 1.4, -0.2, 0.5);
    ramp.rotation.z = 0.45; ramp.rotation.y = 0.5;
    g.add(ramp);
  }

  /* ---- 6. 天问一号 + 祝融号：高精度环绕器 + 火星车 ---- */
  _buildTianwen1(g, mats) {
    g.add(this._mesh(new CylinderGeometry(0.52, 0.52, 0.9, 22), mats.metal, 0, 0.72, 0));
    g.add(this._mesh(new CylinderGeometry(0.35, 0.52, 0.2, 18), mats.dark, 0, 1.22, 0));
    g.add(this._mesh(new CylinderGeometry(0.52, 0.42, 0.15, 18), mats.dark, 0, 0.22, 0));
    g.add(this._mesh(new TorusGeometry(0.53, 0.015, 8, 22), mats.dark, 0, 0.5, 0));
    g.add(this._mesh(new TorusGeometry(0.53, 0.015, 8, 22), mats.dark, 0, 0.95, 0));
    this._addPortholes(g, mats.dark, 3, 0.5, 0.72, 0.53);
    g.add(this._antennaDish(mats.metal, 0, 1.45, 0, 0.38));
    g.add(this._mesh(new CylinderGeometry(0.025, 0.025, 0.2, 6), mats.dark, 0, 1.35, 0));
    g.add(this._solarPanel(mats, 2.1, 1.72, 0.72));
    g.add(this._solarPanel(mats, 2.1, -1.72, 0.72));
    g.add(this._thruster(mats.dark, mats.panel, 0, 0.1, 0, 1.2));
    const rover = this._buildRover(mats);
    rover.position.set(1.5, -0.82, 0.65);
    rover.rotation.y = -0.5;
    rover.scale.setScalar(0.85);
    g.add(rover);
  }

  /* ---- 7. 嫦娥五号：高精度轨道器 + 着陆器 + 返回舱 ---- */
  _buildChange5(g, mats) {
    g.add(this._mesh(new CylinderGeometry(0.55, 0.55, 0.95, 22), mats.metal, 0, 0.82, 0));
    g.add(this._mesh(new CylinderGeometry(0.35, 0.55, 0.18, 18), mats.dark, 0, 1.35, 0));
    g.add(this._mesh(new TorusGeometry(0.56, 0.015, 8, 22), mats.dark, 0, 0.5, 0));
    g.add(this._mesh(new TorusGeometry(0.56, 0.015, 8, 22), mats.dark, 0, 1.1, 0));
    this._addPortholes(g, mats.dark, 3, 0.55, 0.82, 0.56);
    g.add(this._solarPanel(mats, 1.7, 1.42, 0.82));
    g.add(this._solarPanel(mats, 1.7, -1.42, 0.82));
    g.add(this._mesh(new CylinderGeometry(0.68, 0.9, 0.55, 22), mats.dark, 0, -0.22, 0));
    g.add(this._mesh(new CylinderGeometry(0.9, 0.95, 0.08, 22), mats.dark, 0, -0.52, 0));
    g.add(this._mesh(new TorusGeometry(0.78, 0.015, 8, 22), mats.metal, 0, -0.1, 0));
    for (let i = 0; i < 4; i++) {
      const holder = new Group();
      holder.add(this._mesh(new CylinderGeometry(0.035, 0.045, 0.8, 8), mats.dark, 0.88, -0.7, 0));
      const brace = this._mesh(new CylinderGeometry(0.018, 0.018, 0.45, 6), mats.dark, 0.7, -0.35, 0);
      brace.rotation.z = 1.0;
      holder.add(brace);
      holder.add(this._mesh(new CylinderGeometry(0.12, 0.15, 0.04, 10), mats.dark, 1.18, -0.98, 0));
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
    const cap = this._mesh(new ConeGeometry(0.3, 0.55, 16), mats.metal, 0.95, 0.22, 0.32);
    cap.rotation.z = -Math.PI / 2.4;
    g.add(cap);
    g.add(this._mesh(new CylinderGeometry(0.3, 0.28, 0.04, 14), mats.dark, 1.18, 0.38, 0.32));
    g.add(this._thruster(mats.dark, mats.panel, 0, -0.58, 0, 1.5));
  }

  /* ---- 8. 天和核心舱：高精度大圆柱 + 太阳能板 + 机械臂 ---- */
  _buildTianhe(g, mats) {
    const body = this._mesh(new CylinderGeometry(0.7, 0.7, 3.0, 26), mats.metal, 0, 0, 0);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    [-1.0, -0.3, 0.4, 1.1].forEach(xp => {
      const ring = this._mesh(new TorusGeometry(0.71, 0.015, 8, 26), mats.dark, xp, 0, 0);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
    });
    this._addPortholes(g, mats.dark, 4, 0.7, 0, 0.71);
    this._addPortholes(g, mats.dark, 3, 0.7, -0.6, 0.71);
    const node = this._mesh(new CylinderGeometry(0.52, 0.7, 0.65, 22), mats.dark, 1.82, 0, 0);
    node.rotation.z = Math.PI / 2;
    g.add(node);
    g.add(this._mesh(new TorusGeometry(0.6, 0.018, 8, 22), mats.metal, 1.55, 0, 0));
    const port = this._mesh(new TorusGeometry(0.38, 0.055, 12, 24), mats.metal, 2.25, 0, 0);
    port.rotation.y = Math.PI / 2;
    g.add(port);
    g.add(this._mesh(new CylinderGeometry(0.25, 0.28, 0.2, 16), mats.dark, 2.2, 0, 0));
    g.add(this._mesh(new CylinderGeometry(0.15, 0.15, 0.12, 12), mats.metal, 2.32, 0, 0));
    g.add(this._mesh(new CylinderGeometry(0.7, 0.6, 0.3, 22), mats.dark, -1.65, 0, 0));
    g.add(this._thruster(mats.dark, mats.panel, -1.82, 0, 0, 2.0));
    for (let i = 0; i < 4; i++) {
      const a = (Math.PI / 2) * i + Math.PI / 4;
      g.add(this._thruster(mats.dark, null, -1.6, Math.cos(a) * 0.62, Math.sin(a) * 0.62, 0.7));
    }
    [1, -1].forEach((side) => {
      const pg = new Group();
      pg.add(this._mesh(new BoxGeometry(0.95, 0.035, 1.1), mats.panel, 0, 0, side * 1.15));
      pg.add(this._mesh(new BoxGeometry(0.95, 0.035, 1.1), mats.panel, 0, 0, side * 2.35));
      pg.add(this._mesh(new BoxGeometry(0.12, 0.05, 0.12), mats.dark, 0, 0, side * 1.72));
      const arm = this._mesh(new CylinderGeometry(0.028, 0.028, 0.9, 6), mats.dark, 0, 0, side * 0.55);
      arm.rotation.x = Math.PI / 2;
      pg.add(arm);
      pg.position.x = -0.5;
      g.add(pg);
    });
    const armSeg1 = this._mesh(new CylinderGeometry(0.03, 0.03, 1.2, 6), mats.dark, 0.5, 0.75, 0);
    armSeg1.rotation.z = 0.3;
    g.add(armSeg1);
    g.add(this._mesh(new CylinderGeometry(0.025, 0.025, 0.8, 6), mats.dark, 0.9, 1.1, 0));
    g.add(this._mesh(new SphereGeometry(0.05, 8, 6), mats.metal, 0.72, 0.92, 0));
  }

  /* ---- 9. 中国空间站 T 字构型：天和 + 问天 + 梦天 ---- */
  _buildCSS(g, mats) {
    const core = this._mesh(new CylinderGeometry(0.52, 0.52, 2.4, 22), mats.metal, 0, 0, 0);
    core.rotation.z = Math.PI / 2;
    g.add(core);
    [-0.6, 0, 0.6].forEach(xp => g.add(this._mesh(new TorusGeometry(0.53, 0.012, 8, 22), mats.dark, xp, 0, 0)));
    const node = this._mesh(new CylinderGeometry(0.4, 0.52, 0.4, 18), mats.dark, 1.4, 0, 0);
    node.rotation.z = Math.PI / 2;
    g.add(node);
    const fp = this._mesh(new TorusGeometry(0.3, 0.04, 10, 20), mats.metal, 1.7, 0, 0);
    fp.rotation.y = Math.PI / 2;
    g.add(fp);
    g.add(this._mesh(new CylinderGeometry(0.52, 0.42, 0.25, 18), mats.dark, -1.32, 0, 0));
    g.add(this._thruster(mats.dark, mats.panel, -1.48, 0, 0, 1.3));
    [1, -1].forEach((side) => {
      const lab = this._mesh(new CylinderGeometry(0.48, 0.48, 2.0, 20), mats.metal, 0, 0, side * 1.65);
      lab.rotation.x = Math.PI / 2;
      g.add(lab);
      g.add(this._mesh(new TorusGeometry(0.49, 0.012, 8, 20), mats.dark, 0, 0, side * 1.0));
      g.add(this._mesh(new TorusGeometry(0.49, 0.012, 8, 20), mats.dark, 0, 0, side * 2.2));
      const lp = this._mesh(new TorusGeometry(0.28, 0.035, 8, 18), mats.metal, 0, 0, side * 2.7);
      lp.rotation.x = Math.PI / 2;
      g.add(lp);
      this._addPortholes(g, mats.dark, 2, 0.48, 0, 0.49);
      const bY = side > 0 ? 1.1 : -1.1;
      g.add(this._mesh(new BoxGeometry(2.0, 0.03, 0.78), mats.panel, 0, bY, side * 2.0));
      g.add(this._mesh(new CylinderGeometry(0.02, 0.02, 0.5, 5), mats.dark, 0, bY * 0.6, side * 2.0));
    });
    [1, -1].forEach((side) => {
      const board = this._mesh(new BoxGeometry(0.85, 0.03, 1.7), mats.panel, side * 1.6, 0, 0);
      board.position.z = side * 1.2;
      board.rotation.y = side > 0 ? -0.35 : 0.35;
      g.add(board);
    });
    g.add(this._mesh(new CylinderGeometry(0.022, 0.022, 0.9, 6), mats.dark, 0.3, 0.58, 0));
    g.add(this._mesh(new SphereGeometry(0.035, 6, 5), mats.metal, 0.3, 0.58, 0));
  }

  /* ---- 10. 嫦娥六号：嫦娥五号 + 月球背面 ---- */
  _buildChange6(g, mats, materials) {
    this._buildChange5(g, mats);
    const moonMat = new MeshStandardMaterial({
      color: 0x96969e, metalness: 0.05, roughness: 0.95,
      emissive: new Color(mats.metal.emissive), emissiveIntensity: 0.04,
    });
    materials.push(moonMat);
    g.add(this._mesh(new SphereGeometry(1.85, 30, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), moonMat, 0, -1.12, 0));
    [[0.65, 0.45, 0.2], [-0.75, -0.28, 0.28], [0.18, -0.85, 0.14], [-0.3, 0.7, 0.12], [0.9, -0.5, 0.16]].forEach(([x, z, r]) => {
      const crater = this._mesh(new TorusGeometry(r, r * 0.25, 8, 16), moonMat, x, -1.1, z);
      crater.rotation.x = Math.PI / 2;
      g.add(crater);
    });
  }

  /* ==================== 更新 ==================== */

  /**
   * 每帧更新：自转 + 呼吸灯发光 + 近距表面光
   * @param {number} time 累计时间（秒）
   * @param {number} dt 帧间隔（秒）
   * @param {THREE.Vector3} [playerPosition] 宇航员世界坐标，用于近距发光渐变
   */
  update(time, dt, playerPosition) {
    // 节流：每 3 帧更新一次材质属性，减少 GPU uniform 上传
    this._frameTick = (this._frameTick || 0) + 1;
    const updateMaterials = (this._frameTick % 3 === 0);
    const frame = dt * 60;

    // 所有模型均为 Three.js 程序化建模，无需加载 GLB

    for (const rec of this.records.values()) {
      // 持续缓慢自转
      rec.modelGroup.rotation.y += 0.003 * frame;

      if (updateMaterials) {
        // 靠近时表面渐渐发光：以 UI 识别距离为起始半径，越近越亮。
        let proximity = 0;
        if (playerPosition) {
          const glowRadius = Number(rec.data.ui_reveal_distance ?? 30) + 8;
          const d = playerPosition.distanceTo(rec.root.position);
          proximity = Math.min(1, Math.max(0, 1 - d / glowRadius));
        }

        const breath = 0.32 + 0.10 * Math.sin(time * 1.5 + rec.phase);
        const proxGlow = breath + proximity * 0.6;
        const target = Math.max(rec.highlight ? 0.95 : 0, proxGlow);
        rec.materials.forEach((m) => {
          const baseRatio = m.userData?.ratio ?? 1;
          m.emissiveIntensity += (target * baseRatio - m.emissiveIntensity) * 0.25;
        });
        rec.light.intensity = (rec.highlight ? 1.35 : 0.72) + proximity * 0.9;

        // 边缘光：与近距发光同一渐变，锁定高亮时再增强一档。
        const rimTarget = proximity * 1.15 + (rec.highlight ? 0.45 : 0);
        rec.rimMaterials?.forEach((m) => {
          const u = m.userData.rimShader?.uniforms?.uRimIntensity;
          if (u) u.value += (rimTarget - u.value) * 0.25;
        });
      }
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

XINGTU.ExhibitManager = ExhibitManager;

})();
