// ExhibitManager.js —— 经典脚本版本（适配 file:// 协议）
(function () {

const { Group, Color, MeshStandardMaterial, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, ConeGeometry, TorusGeometry, IcosahedronGeometry, DodecahedronGeometry, BufferGeometry, Line, LineBasicMaterial, Vector3, PointLight, Box3, Sphere } = THREE;
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
    var asteroidUrl = XINGTU.resolveModelPath ? XINGTU.resolveModelPath('models/asteroid.glb') : 'models/asteroid.glb';
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
      
      if (this.asteroidModelLoaded && this.asteroidModel) {
        // 使用GLB模型克隆（随机岩石色，逐陨石独立材质）
        asteroid = this.asteroidModel.clone();
        this._applyAsteroidColor(asteroid);
      } else {
        // 回退：使用简单几何体
        const asteroidGeometries = [
          new IcosahedronGeometry(1, 0),
          new SphereGeometry(1, 5, 4),
          new DodecahedronGeometry(1, 0),
          new ConeGeometry(1, 2, 5),
          new BoxGeometry(1.5, 1.5, 1.5),
        ];
        const geom = asteroidGeometries[Math.floor(Math.random() * asteroidGeometries.length)];
        
        const rock = this._randomRockColor();
        
        const material = new MeshStandardMaterial({
          color: new Color().setHSL(rock.h, rock.s, rock.l),
          roughness: 0.7 + Math.random() * 0.3,
          metalness: Math.random() * 0.15,
          flatShading: Math.random() > 0.3,
        });
        
        asteroid = new Mesh(geom, material);
        asteroidGeometries.forEach(g => g.dispose());
      }
      
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
        
        if (this.asteroidModelLoaded && this.asteroidModel) {
          // 使用GLB模型克隆（随机岩石色，逐陨石独立材质）
          asteroid = this.asteroidModel.clone();
          this._applyAsteroidColor(asteroid);
        } else {
          // 回退：使用简单几何体
          const asteroidGeometries = [
            new IcosahedronGeometry(1, 0),
            new SphereGeometry(1, 5, 4),
            new DodecahedronGeometry(1, 0),
            new ConeGeometry(1, 2, 5),
            new BoxGeometry(1.5, 1.5, 1.5),
          ];
          const geom = asteroidGeometries[Math.floor(Math.random() * asteroidGeometries.length)];
          
          const rock = this._randomRockColor();
          
          const material = new MeshStandardMaterial({
            color: new Color().setHSL(rock.h, rock.s, rock.l),
            roughness: 0.7 + Math.random() * 0.3,
            metalness: Math.random() * 0.15,
            flatShading: Math.random() > 0.3,
          });
          
          asteroid = new Mesh(geom, material);
        }
        
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

  /** 距离触发陨石GLB懒加载 */
  _checkAsteroidLazyLoad(playerPosition) {
    if (this.asteroidModelLoaded || this.asteroidModelLoading) return;
    for (const zone of this.asteroidZones) {
      if (playerPosition.distanceTo(zone) < 250) {
        this._triggerAsteroidLoad();
        return;
      }
    }
  }

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

  /** 太阳能板（薄方块 + 连接杆） */
  _solarPanel(mats, w, x, y = 0, rotZ = 0) {
    const grp = new Group();
    const board = this._mesh(new BoxGeometry(w, 0.05, 0.8), mats.panel, x, y, 0);
    const strut = this._mesh(new CylinderGeometry(0.03, 0.03, Math.max(0.3, Math.abs(x) - 0.4), 6), mats.dark, x / 2, y, 0);
    strut.rotation.z = Math.PI / 2;
    grp.add(board, strut);
    grp.rotation.z = rotZ;
    return grp;
  }

  /* ---- 1. 东方红一号：二十面体球状卫星 + 四片太阳能板 ---- */
  _buildDongfanghong(g, mats, materials) {
    g.add(this._mesh(new IcosahedronGeometry(0.85, 1), mats.metal));
    // 四面展开的太阳能板
    const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    angles.forEach((a) => {
      const panel = this._mesh(new BoxGeometry(1.9, 0.05, 0.72), mats.panel, 1.65, 0, 0);
      const holder = new Group();
      holder.add(panel);
      holder.rotation.y = a;
      g.add(holder);
    });
    // 底部四根天线
    for (let i = 0; i < 4; i++) {
      const ant = this._mesh(new CylinderGeometry(0.015, 0.015, 1.3, 5), mats.dark);
      const holder = new Group();
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
    g.add(this._mesh(new CylinderGeometry(0.5, 0.5, 1.3, 20), mats.metal, 0, 0.95, 0));
    // 返回舱（圆锥，锥尖朝上）
    const cone = this._mesh(new ConeGeometry(0.78, 1.1, 20), mats.metal, 0, -0.25, 0);
    g.add(cone);
    // 推进舱（底部圆柱）
    g.add(this._mesh(new CylinderGeometry(0.62, 0.55, 0.7, 20), mats.dark, 0, -1.15, 0));
    // 两侧太阳能板
    g.add(this._solarPanel(mats, 1.9, 1.55, -1.1));
    g.add(this._solarPanel(mats, 1.9, -1.55, -1.1));
  }

  /* ---- 3. 神舟七号：神舟造型 + 出舱宇航员小人 ---- */
  _buildShenzhou7(g, mats, materials) {
    this._buildShenzhou(g, mats);
    // 出舱宇航员（两个球 + 圆柱）
    const astro = new Group();
    const head = this._mesh(new SphereGeometry(0.16, 14, 12), mats.metal, 0, 0.42, 0);
    const bodyM = this._mesh(new CylinderGeometry(0.13, 0.15, 0.5, 12), mats.metal, 0, 0.02, 0);
    const joint = this._mesh(new SphereGeometry(0.11, 12, 10), mats.dark, 0, -0.3, 0);
    astro.add(head, bodyM, joint);
    astro.position.set(1.25, 0.55, 0.5);
    astro.rotation.z = -0.4; // 漂浮姿态
    g.add(astro);
    // 安全系绳
    const ropePts = [new Vector3(0.5, 0.4, 0.2), new Vector3(0.9, 0.62, 0.42), new Vector3(1.22, 0.58, 0.5)];
    const rope = new Line(
      new BufferGeometry().setFromPoints(ropePts),
      new LineBasicMaterial({ color: 0xccd6ee, transparent: true, opacity: 0.7 })
    );
    g.add(rope);
  }

  /* ---- 4. 天宫一号 + 神舟八号：两圆柱水平对接 + 环状对接机构 ---- */
  _buildDocking(g, mats) {
    // 天宫一号（大圆柱，沿 X 轴）
    const big = this._mesh(new CylinderGeometry(0.7, 0.7, 2.5, 22), mats.metal, -1.05, 0, 0);
    big.rotation.z = Math.PI / 2;
    g.add(big);
    // 神舟八号（小圆柱）
    const small = this._mesh(new CylinderGeometry(0.45, 0.45, 1.7, 18), mats.dark, 1.45, 0, 0);
    small.rotation.z = Math.PI / 2;
    g.add(small);
    // 对接机构环
    const ring = this._mesh(new TorusGeometry(0.5, 0.09, 12, 26), mats.metal, 0.42, 0, 0);
    ring.rotation.y = Math.PI / 2;
    g.add(ring);
    // 天宫一号上下两片太阳能板
    g.add(this._mesh(new BoxGeometry(1.7, 0.05, 0.8), mats.panel, -1.05, 1.55, 0));
    g.add(this._mesh(new BoxGeometry(1.7, 0.05, 0.8), mats.panel, -1.05, -1.55, 0));
  }

  /* ---- 5. 嫦娥三号：圆盘着陆器 + 四条着陆腿 + 六轮月球车 ---- */
  _buildChange3(g, mats) {
    // 着陆器主体（圆盘）
    g.add(this._mesh(new CylinderGeometry(1.05, 1.25, 0.5, 24), mats.metal, 0, 0.45, 0));
    g.add(this._mesh(new CylinderGeometry(0.55, 0.7, 0.35, 18), mats.dark, 0, 0.85, 0));
    // 四条着陆腿
    for (let i = 0; i < 4; i++) {
      const holder = new Group();
      const leg = this._mesh(new CylinderGeometry(0.045, 0.06, 1.25, 8), mats.dark, 1.15, -0.28, 0);
      leg.rotation.z = 0.62;
      const foot = this._mesh(new CylinderGeometry(0.16, 0.2, 0.07, 10), mats.dark, 1.52, -0.62, 0);
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
    const rover = new Group();
    rover.add(this._mesh(new BoxGeometry(0.62, 0.3, 0.45), mats.metal, 0, 0.18, 0));
    // 顶部太阳能板
    rover.add(this._mesh(new BoxGeometry(0.66, 0.03, 0.5), mats.panel, 0, 0.38, 0));
    // 六个轮子
    const wheelGeo = new CylinderGeometry(0.11, 0.11, 0.07, 12);
    [-0.26, 0, 0.26].forEach((x) => {
      [0.26, -0.26].forEach((z) => {
        const w = this._mesh(wheelGeo, mats.dark, x, -0.02, z);
        w.rotation.x = Math.PI / 2;
        rover.add(w);
      });
    });
    // 桅杆 + 相机头
    rover.add(this._mesh(new CylinderGeometry(0.025, 0.025, 0.35, 8), mats.dark, 0.22, 0.55, 0.12));
    rover.add(this._mesh(new BoxGeometry(0.12, 0.09, 0.09), mats.metal, 0.22, 0.74, 0.12));
    return rover;
  }

  /* ---- 6. 天问一号 + 祝融号：圆柱环绕器 + 火星车 ---- */
  _buildTianwen1(g, mats) {
    // 环绕器（圆柱主体 + 大天线 + 太阳能板）
    g.add(this._mesh(new CylinderGeometry(0.55, 0.55, 1.0, 20), mats.metal, 0, 0.75, 0));
    const dish = this._mesh(new SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), mats.metal, 0, 1.45, 0);
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
    g.add(this._mesh(new CylinderGeometry(0.58, 0.58, 1.05, 20), mats.metal, 0, 0.85, 0));
    g.add(this._solarPanel(mats, 1.7, 1.45, 0.85));
    g.add(this._solarPanel(mats, 1.7, -1.45, 0.85));
    // 着陆器（下方）
    g.add(this._mesh(new CylinderGeometry(0.72, 0.95, 0.62, 20), mats.dark, 0, -0.25, 0));
    // 四条短着陆腿
    for (let i = 0; i < 4; i++) {
      const holder = new Group();
      const leg = this._mesh(new CylinderGeometry(0.04, 0.05, 0.85, 8), mats.dark, 0.95, -0.75, 0);
      leg.rotation.z = 0.55;
      holder.add(leg);
      holder.rotation.y = (Math.PI / 2) * i + Math.PI / 4;
      g.add(holder);
    }
    // 返回舱（侧面小圆锥）
    const cap = this._mesh(new ConeGeometry(0.34, 0.6, 16), mats.metal, 1.0, 0.25, 0.35);
    cap.rotation.z = -Math.PI / 2.4;
    g.add(cap);
  }

  /* ---- 8. 天和核心舱：大圆柱 + 两侧大型太阳能板 + 对接口 ---- */
  _buildTianhe(g, mats) {
    // 核心舱主体（沿 X 轴的大圆柱）
    const bodyM = this._mesh(new CylinderGeometry(0.72, 0.72, 3.4, 24), mats.metal, 0, 0, 0);
    bodyM.rotation.z = Math.PI / 2;
    g.add(bodyM);
    // 节点舱（前端略粗短圆柱）
    const node = this._mesh(new CylinderGeometry(0.55, 0.72, 0.7, 20), mats.dark, 2.0, 0, 0);
    node.rotation.z = Math.PI / 2;
    g.add(node);
    // 对接口标记（圆环）
    const port = this._mesh(new TorusGeometry(0.4, 0.07, 10, 24), mats.metal, 2.45, 0, 0);
    port.rotation.y = Math.PI / 2;
    g.add(port);
    // 两侧大型太阳能板（沿 Z 方向展开）
    [1, -1].forEach((side) => {
      const panelGrp = new Group();
      const board = this._mesh(new BoxGeometry(1.05, 0.05, 2.5), mats.panel, 0, 0, side * 1.9);
      const strut = this._mesh(new CylinderGeometry(0.035, 0.035, 1.1, 6), mats.dark, 0, 0, side * 0.55);
      strut.rotation.x = Math.PI / 2;
      panelGrp.add(board, strut);
      panelGrp.position.x = -0.6;
      g.add(panelGrp);
    });
  }

  /* ---- 9. 中国空间站：T 字构型（天和 + 问天 + 梦天） ---- */
  _buildCSS(g, mats) {
    // 天和核心舱（中央，沿 X 轴）
    const core = this._mesh(new CylinderGeometry(0.55, 0.55, 2.6, 20), mats.metal, 0, 0, 0);
    core.rotation.z = Math.PI / 2;
    g.add(core);
    // 问天 / 梦天实验舱（两侧，沿 Z 轴，形成 T 字）
    [1, -1].forEach((side) => {
      const lab = this._mesh(new CylinderGeometry(0.5, 0.5, 2.2, 20), mats.metal, 0, 0, side * 1.75);
      lab.rotation.x = Math.PI / 2;
      g.add(lab);
      // 每个实验舱自带太阳能板
      const board = this._mesh(new BoxGeometry(2.2, 0.05, 0.85), mats.panel, 0, 0, side * 1.9);
      board.position.y = side > 0 ? 1.15 : -1.15;
      g.add(board);
    });
    // 核心舱太阳能板
    [1, -1].forEach((side) => {
      const board = this._mesh(new BoxGeometry(0.9, 0.05, 1.9), mats.panel, side * 1.75, 0, 0);
      board.position.z = side * 1.35;
      board.rotation.y = side > 0 ? -0.4 : 0.4;
      g.add(board);
    });
    // 对接口标记
    const port = this._mesh(new TorusGeometry(0.32, 0.06, 10, 20), mats.dark, 1.5, 0, 0);
    port.rotation.y = Math.PI / 2;
    g.add(port);
  }

  /* ---- 10. 嫦娥六号：嫦娥五号造型 + 底部月球表面 ---- */
  _buildChange6(g, mats, materials) {
    this._buildChange5(g, mats);
    // 月球背面示意：灰色半球盘
    const moonMat = new MeshStandardMaterial({
      color: 0x96969e,
      metalness: 0.05,
      roughness: 0.95,
      emissive: new Color(mats.metal.emissive),
      emissiveIntensity: 0.04,
    });
    materials.push(moonMat);
    const moon = this._mesh(
      new SphereGeometry(1.9, 28, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      moonMat,
      0, -1.15, 0
    );
    g.add(moon);
    // 月面陨石坑装饰（平放在月面顶部）
    [[0.7, 0.5, 0.22], [-0.8, -0.3, 0.3], [0.2, -0.9, 0.16]].forEach(([x, z, r]) => {
      const crater = this._mesh(new TorusGeometry(r, r * 0.28, 8, 18), moonMat, x, -1.13, z);
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

    // ---- 距离触发式懒加载：玩家靠近时才下载 GLB 模型 ----
    if (playerPosition) {
      this._checkAsteroidLazyLoad(playerPosition);
      for (const rec of this.records.values()) {
        if (rec.glbLoaded || rec.glbTriggered) continue;
        if (!rec.data.model_path) continue;
        const dist = playerPosition.distanceTo(rec.root.position);
        if (dist < 150) {
          rec.glbTriggered = true;
          console.info(`[ExhibitManager] 玩家接近 ${rec.data.name}（${dist.toFixed(0)}u），开始加载 GLB…`);
          this._tryLoadGltf(
            rec.data.model_path,
            rec.modelGroup,
            rec.materials,
            rec.data.model_chunks,
            rec.companionPath,
            () => {
              rec.glbLoaded = true;
              const r = this.records.get(rec.data.id);
              if (!r) return;
              const c = r.modelGroup.userData.uiCenter;
              const topY = r.modelGroup.userData.uiTopY;
              if (c && isFinite(topY)) {
                r.labelObj.position.set(c.x, topY + 1.1, c.z);
              }
              this._attachRimLight(r, new Color(r.data.glow_color || '#4488FF'));
            }
          );
        }
      }
    }

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
