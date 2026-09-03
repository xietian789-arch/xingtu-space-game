# 星际探索 · 中国航天史太空穿梭

一个基于 Three.js 的网页航天探索游戏。玩家沿时间轴接近十个中国航天代表物，查看任务档案，并在最后抵达未来航标。

当前版本已包含主页、发射过场、游玩 HUD、十套靠近提示、十套详情界面、真实飞行器 GLB、ESC 分层暂停、程序化航行音乐与结局流程。主场景与详情页共享同一份模型缓存；模型加载失败时会自动保留程序化占位模型或科普插画，不会阻断游戏运行。

当前协作版本的完整流程为“贯穿全程的双层北极光虫洞 → 依次经过 10 个航天节点 → 嫦娥六号 → 未来航标 → 结局”。终点位置会由最后一个节点和 `future_beacon_gap` 自动推导，避免后续调整模型时把航天器留在终点后方；已完成 10/10 逐节点可达性与真实 GLB 映射验证。场景已关闭方形阴影贴图、矩形 Sprite 光晕和高速方块光粒子，青蓝紫内外两层光帘以不同速度流动，形成从起点延伸到远端的纵深。

## 本地启动

Windows 可直接运行 `启动游戏.bat`，也可以在项目目录启动任意静态服务器：

```bash
python -m http.server 8321
```

然后访问 `http://localhost:8321/`。不要只双击 `index.html` 测试模型；HTTP 环境才与 GitHub Pages 的加载方式一致。

## GitHub Pages 发布

本目录已包含 `.github/workflows/deploy-pages.yml`。将内容提交到 GitHub 仓库的 `main` 分支后，在仓库 **Settings → Pages → Source** 中选择 **GitHub Actions**，工作流会发布整个静态网站。

所有运行时文件均使用相对路径；请保持 `index.html` 位于仓库根目录。GLB 模型单文件均低于 GitHub 的 100 MB 硬限制，提交大模型时应使用 Git 命令行客户端，而不要使用网页端逐文件上传。

本仓库包含完整高精度 GLB，体积约 738 MB，首次克隆和推送需要一定时间。推荐使用 GitHub Desktop 或 Git 命令行，不要在 GitHub 网页中逐个上传模型。

## 协作快速开始

```bash
git clone <仓库地址>
cd <仓库目录>
git switch -c feature/你的修改名称
python -m http.server 8321
```

完成修改和本地验证后提交分支并发起 Pull Request。更完整的分支、模型、数据和验收规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 模型协作入口

需要补充飞行器模型的协作者请先阅读 [models/README.md](models/README.md)。核心流程只有三步：

1. 将优化后的 `.glb` 放入 `models/`；
2. 在 `data/exhibits.json` 对应条目填写 `model_path` 并调整 `scale`；
3. 运行 `node scripts/sync-exhibits.mjs`，同步离线回退数据后再提交。

模型加载失败时游戏会保留原来的占位模型，便于逐个替换和独立合并。

## 主要目录

```text
models/                 角色与十个飞行器模型
data/exhibits.json      飞行器名称、坐标、模型路径与交互距离
js/ExhibitManager.classic.js
                        游玩场景模型加载与占位模型
js/InfoPanel.classic.js 详情界面及模型挂载事件
js/DetailModelViewer.classic.js
                        详情页 3D 模型、拖拽旋转与滚轮缩放
js/ModelLibrary.classic.js
                        主场景与详情页共享的 GLB 缓存
textures/               首页和场景图片资源
media/                  发射过场视频
```

## 协作约定

- 一个 Pull Request 尽量只补充一个飞行器模型，便于检查尺寸和性能。
- 不要修改飞行器的 `id`、时间线顺序或坐标，除非任务明确要求。
- 不要把 Blender、Maya 等工程源文件直接放进网页资源目录；仓库中只提交运行所需的 `.glb`。
- 浏览器中确认模型、靠近 UI、详情界面和结局流程均能正常运行后再提交。
- 修改 `data/exhibits.json` 后必须运行 `node scripts/sync-exhibits.mjs`。
