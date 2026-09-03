// ModelLibrary.classic.js —— 全局 GLB 资源缓存，供主场景与详情页共同使用
(function () {

const THREE = window.THREE;
const XINGTU = window.XINGTU;
const loader = new THREE.GLTFLoader();
const entries = new Map();

/**
 * 模型路径解析：GitHub Pages 部署时走 jsDelivr CDN（国内加速），
 * 本地开发 / file:// 协议保持相对路径。
 * @param {string} path 相对路径，如 'models/xxx.glb'
 * @returns {string} 实际加载 URL
 */
function resolveModelPath(path) {
  if (!path) return path;
  var loc = window.location;
  // GitHub Pages 部署：自动切换到 jsDelivr CDN
  if (loc.hostname.indexOf('github.io') !== -1) {
    var m = loc.pathname.match(/^\/([^/]+)\//);
    if (m) {
      return 'https://cdn.jsdelivr.net/gh/' + loc.hostname.replace('.github.io', '') + '/' + m[1] + '@main/' + path;
    }
  }
  return path;
}

XINGTU.resolveModelPath = resolveModelPath;

/**
 * 只下载、解析一次 GLB。调用方拿到的是缓存源场景，挂载前必须 clone。
 * @param {string} path
 * @returns {Promise<THREE.Object3D>}
 */
function load(path) {
  if (!path) return Promise.reject(new Error('模型路径为空'));
  var url = resolveModelPath(path);
  if (entries.has(url)) return entries.get(url);

  console.info('[ModelLibrary] 加载模型: ' + url);
  const request = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf.scene),
      (xhr) => {
        if (xhr.total > 0) {
          var pct = Math.round(xhr.loaded / xhr.total * 100);
          console.info('[ModelLibrary] ' + path + ' 下载 ' + pct + '% (' + Math.round(xhr.loaded / 1048576) + '/' + Math.round(xhr.total / 1048576) + ' MB)');
        }
      },
      (error) => reject(error || new Error('模型加载失败：' + url))
    );
  }).catch((error) => {
    // 失败项不长期缓存，切换到 HTTP 启动后可以再次尝试。
    entries.delete(url);
    throw error;
  });

  entries.set(url, request);
  return request;
}

function clone(path) {
  return load(path).then((scene) => scene.clone(true));
}

XINGTU.ModelLibrary = { load, clone };

})();
