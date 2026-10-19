# 英语阅读练习

用浏览器打开根目录的 `index.html` 进入练习。每篇生成的 `index.html` 都是完整的独立文件，可直接打开，无需服务器或网络。

## 内容、版式与交互分层

```text
english-reading/
├── index.html                     # 全部练习的目录
├── build.py                       # 标准库构建脚本
├── shared/
│   ├── template.html              # 公共页面结构
│   ├── app.js                     # 答题、评分、解析、保存、导出
│   └── styles/
│       ├── exam.css               # 基础界面与 TOEIC 风格考卷排版
│       └── reading.css            # 可切换的舒适阅读排版
└── claude-code/
    └── 2026-01-21-eight-trends/
        ├── lesson.json            # 文章和题目内容源
        ├── index.html             # 构建生成的独立成品
        └── verification/          # 浏览器检查与截图
```

`lesson.json` 保存标题、副标题、来源、正文、题目、答案、解析与证据定位。正文支持段落、`###` 小标题、`**加粗**` 和 HTTPS/HTTP Markdown 链接。运行时通过 DOM 安全渲染，正文中的 HTML 按普通文字显示。

页面结构、两种版式和交互逻辑由公共文件提供。新增文章只需编写内容数据并构建，文章内容不写入公共模板或样式。

## 两种版式

- **阅读版**：默认版式。单栏、较大字体、舒适行距、保留原文层次；先展示完整文章，点击「读完了，开始答题」后展开题目。
- **考卷版**：黑白 TOEIC Part 7 风格，正文无 P1/P2 编号。英文说明、普通题号、`(A)`–`(D)` 选项；桌面题目两栏，手机单栏。

「版式」和「阶段」独立：两种版式均可答题和查看解析，共用答案、标记、计时和错题筛选。版式与进度自动保存。答题阶段隐藏答案，解答阶段显示中文解析及原文定位。

第一篇保留 147–156 共 10 道拓展题，12 分钟为自定练习目标。文章原文完整嵌入，并保留作者与来源。

## 修改和新增练习

修改 `lesson.json` 后重新构建；修改共享模板、样式或逻辑后构建所有练习。请不要直接编辑生成的文章 `index.html`，构建时会覆盖。

```sh
# 在 english-reading 目录执行，构建全部文章
python3 build.py

# 构建指定文章
python3 build.py claude-code/2026-01-21-eight-trends/lesson.json
```

新练习按「来源 / YYYY-MM-DD-英文短标题」创建目录，日期使用原文发布日期。复制现有 `lesson.json` 作为数据示例，替换文章与题目，并设置新的 `id` 和 `storageKey`，使不同文章的进度独立。

`questions` 数量、`exercise.startNumber` 起始题号、`exercise.suggestedMinutes` 练习目标均由数据控制。构建脚本验证必要字段、四个选项和答案范围。完成后更新根目录的文章目录。

## 导出与打印

点击「导出单一 HTML」即可下载完整成品，包含原文、全部题目与解析、两种版式、样式和交互代码。导出文件默认使用当前版式，新浏览器中从未作答状态开始；打开后仍可切换版式、作答和评分。

导出不依赖 `shared/`、`lesson.json`、CDN 或网络。官网及延伸资料链接可联网访问。已有浏览器中再次打开同一练习会恢复该练习的本地进度。

手机触屏下，两种版式的题目均按窄屏单栏展示，切换、题号等按钮的触摸区域至少为 44×44 像素。已直接对下载的独立 HTML 验证 320、375、390、430 像素宽度下的阅读、作答、解析和原文定位；验证使用 Chromium 手机视口与触屏模拟。共享样式更新后，已有导出文件需要重新导出。

「打印当前版式」使用浏览器打印；阅读版可打印原文，展开题目后也可连题目一起打印。练习工具栏不会出现在打印稿中。

## 当前练习

| 发布日期 | 文章 | 题量 |
|---|---|---:|
| 2026-01-21 | [Eight trends defining how software gets built in 2026](claude-code/2026-01-21-eight-trends/index.html) | 10 |

原文来源：[Anthropic 官方文章](https://claude.com/resources/articles/eight-trends-defining-how-software-gets-built-in-2026)。阅读题目与中文解析为自编学习材料，题目排版参考 [ETS 官方样题](https://www.ets.org/content/dam/ets-org/pdfs/toeic/toeic-listening-reading-sample-test.pdf)。

## 浏览器验证

使用 Node.js 和 Playwright 运行检查；构建及成品运行不依赖 Node.js。

```sh
npm ci
npx playwright install chromium
npm test
npm run test:mobile
```

已有 Chrome 的环境也可以设置 `PLAYWRIGHT_CHANNEL=chrome` 使用系统浏览器。验证脚本检查版式切换、答题进度、评分、原文定位、导出文件离线运行和手机触屏布局，生成结果保留在本地 `verification/`，不提交 Git。
