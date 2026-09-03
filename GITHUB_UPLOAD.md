# 上传到 GitHub

## 推荐：GitHub Desktop

1. 在 GitHub 新建一个空仓库，不要勾选自动生成 README、许可证或 `.gitignore`。
2. 解压本协作包。
3. 在 GitHub Desktop 中选择 **File → Add local repository**，选择解压后的项目目录。
4. 如果提示该目录还不是仓库，选择在此目录创建仓库。
5. 提交全部文件，然后选择 **Publish repository**。
6. 需要公开试玩时，进入仓库 **Settings → Pages**，将 Source 设为 **GitHub Actions**。

## Git 命令行

在解压后的项目根目录执行：

```bash
git init
git add .
git commit -m "Initial collaborative Xingtu game"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

仓库包含约 738 MB 的高精度 GLB，首次提交与推送需要较长时间。所有单文件均低于 GitHub 100 MB 硬限制，但不要使用 GitHub 网页端逐个上传这些模型。

## 邀请协作者

在 GitHub 仓库的 **Settings → Collaborators** 中邀请对方。协作者应创建自己的功能分支，并通过 Pull Request 合并到 `main`；具体规则见 `CONTRIBUTING.md`。
