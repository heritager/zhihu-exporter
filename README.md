# Zhihu Exporter

一个用于导出知乎内容的 Userscript。

支持两类导出入口：

- 答主页导出：导出答主的回答、文章、想法
- 问题导出：导出同一问题下全部回答

支持两种导出模式：

- `Legacy Single Markdown`
- `NotebookLM + Obsidian Zip`

## Features

- 支持 `https://www.zhihu.com/people/*`
- 支持 `https://www.zhihu.com/question/*`
- 导出进度可视化
- 支持中断导出
- Markdown 清洗与结构化输出
- 可选 Obsidian 风格链接 / 标准 Markdown 链接
- 可生成 NotebookLM 学习包
- 可生成 Obsidian 多文件笔记结构
- 可下载图片到 `assets/images`
- 保留旧版单 Markdown 导出兼容模式

## Install

1. 安装 Tampermonkey 或 Violentmonkey
2. 如果你使用的是新版 Chrome，请打开扩展页的开发者模式，允许用户脚本注入
3. 打开下方脚本链接并安装

`https://raw.githubusercontent.com/heritager/zhihu-exporter/main/src/zhihu-export.user.js`

## Usage

1. 进入知乎答主主页或问题页
2. 点击右上角导出面板按钮
3. 选择导出内容、链接风格与导出模式
4. 如果选择 `NotebookLM + Obsidian Zip`，可额外开启图片下载
5. 可选择：
   - `正常下载`
   - `保存到指定文件夹（Obsidian）`
6. 如果使用目录直写，请先点击“选择文件夹”并授予写入权限
7. 等待导出完成

## Export Modes

### 1. Legacy Single Markdown

兼容旧模式，导出一个大 Markdown 文件，适合快速归档或直接阅读。

### 2. NotebookLM + Obsidian Zip

导出一个 Zip 包，目录结构类似：

```text
export-root/
- manifest.json
- obsidian/
  - 00_Index.md
  - 01_Topics.md
  - answers/
  - articles/
  - pins/
- notebooklm/
  - 00_Overview.md
  - 01_Study_Prompts.md
  - source-01.md
  - source-02.md
- assets/
  - images/
```

其中：

- `obsidian/` 适合直接放进 Obsidian vault
- `notebooklm/` 适合直接上传到 NotebookLM
- `assets/images/` 保存本地图片资源
- `manifest.json` 记录导出映射与统计信息

## Save Target

`NotebookLM + Obsidian Zip` 模式支持两种保存方式：

- `Download normally`
  - 使用浏览器默认下载流程
- `Save to chosen folder (Obsidian)`
  - 直接将生成好的 Zip 写入你选择的本地文件夹
  - 当前版本只写入单个 Zip，不会自动解包
  - 页面刷新后需要重新选择目录

推荐在 Obsidian 工作流中这样使用：

1. 在 Chrome / Edge 中打开知乎页面
2. 选择 `NotebookLM + Obsidian Zip`
3. 切换到 `Save to chosen folder (Obsidian)`
4. 点击 `Choose Folder`
5. 选择你的 Obsidian vault 中一个用于导入的目录
6. 导出后按需手动解压 Zip

## NotebookLM Notes

- 新模式会把内容打成多个 `source-xx.md`
- 设计目标是控制 source 数量，避免导出过碎
- `00_Overview.md` 和 `01_Study_Prompts.md` 用来帮助快速进入学习

## Obsidian Notes

- 每条内容一个 note
- 索引页使用 wiki links
- 笔记包含 frontmatter
- 图片会改写为本地相对路径

## Compatibility

- Tampermonkey / Violentmonkey
- Chrome / Edge / Firefox（基于 userscript 引擎支持）

目录直写补充说明：

- `showDirectoryPicker` 目前主要在 Chrome / Edge 可用
- 不支持 File System Access API 的浏览器会自动回退为普通下载
- 若目录授权失效或写入失败，也会自动回退为普通下载并给出提示

## Compliance

- 仅导出你在当前会话下可见的数据
- 请遵守知乎平台条款及当地法律法规

## Development

```powershell
git clone https://github.com/heritager/zhihu-exporter.git
cd zhihu-exporter
```

本项目为纯前端 Userscript，无构建步骤，直接编辑 `src/zhihu-export.user.js` 即可。

## License

MIT
