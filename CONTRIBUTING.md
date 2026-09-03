# 《星途》协作指南

## 1. 推荐工作流

1. 克隆仓库，不要通过 GitHub 网页逐个下载或上传模型。
2. 从 `main` 创建独立分支，例如 `feature/change6-model` 或 `fix/route-lighting`。
3. 在本地 HTTP 服务中验证，不要直接双击 `index.html`。
4. 每个 Pull Request 聚焦一项修改，并在说明中列出测试范围。

```bash
git switch main
git pull
git switch -c feature/your-change
python -m http.server 8321
```

浏览器访问 `http://localhost:8321/`。

## 2. 项目入口

- `index.html`：页面结构和脚本入口。
- `data/exhibits.json`：十个航天节点、模型路径、位置、比例与交互距离。
- `js/main.classic.js`：主状态机、启航、暂停、终点和结局流程。
- `js/SpaceEnvironment.classic.js`：虫洞、粒子、星空、星云和环境灯。
- `js/ExhibitManager.classic.js`：航天器模型、标签、光晕和接近高亮。
- `models/`：运行时 GLB；详细替换规则见 `models/README.md`。

## 3. 航线约束

航线参数统一存放在 `data/exhibits.json` 的 `settings` 中。修改节点坐标时必须同时满足：

- `timeline_order` 从 1 到 10 连续且按年代前进；
- 每个节点的 Z 坐标按顺序递减；
- 最后一个航天器位于未来航标之前；运行时会按“最后一个节点 Z 坐标减去 `future_beacon_gap`”自动计算航标位置；
- 所有节点和未来航标均位于 `flight_z_min` 与 `flight_z_max` 之间；
- 虫洞入口与未来航标重合，虫洞只允许出现在最后一个航天器之后；远端 `route_end_z` 必须覆盖飞行下限。

修改数据后运行：

```bash
node scripts/sync-exhibits.mjs
```

这一步会更新 `data/exhibits.js`，保证离线回退数据与 JSON 一致。

## 4. 模型约束

- GitHub 单文件硬限制为 100 MB；任何新 GLB 必须低于该限制。
- 仓库已有多个 50–90 MB 模型，提交与推送请使用 GitHub Desktop 或 Git 命令行。
- 网页目录只放运行时 `.glb`，不要提交 Blender、Maya、C4D 工程文件。
- 替换模型时保持原有 `id`，并检查主场景比例、详情页旋转、交互距离和加载时间。

## 5. 提交前验收

- 首页、开始按钮和启航过场正常。
- 十个航天器都能抵达并显示“查看档案”。
- 最后一个节点之后能抵达未来航标并触发结局。
- 粒子与光晕没有正方形色块或过曝白斑。
- 浏览器控制台没有新增 error。
- `data/exhibits.json` 与 `data/exhibits.js` 已同步。

## 6. Pull Request 建议

PR 描述应包含：修改目的、涉及文件、验证方式、前后对比图，以及是否变更 GLB 或航线坐标。不要在同一个 PR 中混合无关的模型、UI 和流程重构。
