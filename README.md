# Zhihu Exporter

一个用于导出知乎内容的 Userscript。

支持两种导出模式：

- 答主页导出：导出答主的回答、文章、想法
- 问题导出：导出同一问题下全部回答

导出格式为 Markdown，默认对 Obsidian 友好。

## Features

- 支持 `https://www.zhihu.com/people/*`
- 支持 `https://www.zhihu.com/question/*`
- 导出进度可视化
- 支持中断导出
- Markdown 清洗与结构化输出
- 可选 Obsidian 风格链接/标准 Markdown 链接

## Install

1. 安装 Tampermonkey 或 Violentmonkey
2. 打开下方脚本链接并安装

`https://raw.githubusercontent.com/<yourname>/zhihu-exporter/main/src/zhihu-export.user.js`

## Usage

1. 进入知乎答主主页或问题页
2. 点击右上角导出面板按钮
3. 选择导出项与格式选项
4. 等待导出完成，浏览器自动下载 `.md` 文件

## Project Structure

```text
zhihu-exporter/
- src/
  - zhihu-export.user.js
- docs/
  - screenshots/
- README.md
- LICENSE
- CHANGELOG.md
- CONTRIBUTING.md
- .gitignore
```

## Compatibility

- Tampermonkey / Violentmonkey
- Chrome / Edge / Firefox（基于 userscript 引擎支持）

## Compliance

- 仅导出你在当前会话下可见的数据
- 请遵守知乎平台条款及当地法律法规

## Development

```powershell
git clone https://github.com/<yourname>/zhihu-exporter.git
cd zhihu-exporter
```

本项目为纯前端 Userscript，无构建步骤，直接编辑 `src/zhihu-export.user.js` 即可。

## License

MIT
