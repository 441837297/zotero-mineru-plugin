# MinerU Zotero 7 插件

将 PDF 转换为 Markdown 的 Zotero 7 插件，基于 [MinerU](https://github.com/opendatalab/MinerU) 本地 GPU 加速解析。

## 为什么开发

使用 AI 工具阅读论文时，**Markdown 格式比 PDF 识别准确率更高**（公式、表格、图片位置都能保留）。本插件让你可以在 Zotero 中一键转换 PDF，同时保存到 Zotero 附件和 Obsidian，实现**文献管理 → AI 阅读**的无缝工作流。

## 功能特点

- **一键转换**：右键 PDF 附件即可转换为 Markdown
- **本地 GPU 加速**：利用显卡解析，无需上传云端，保护隐私
- **双保存机制**：同时保存到 Zotero 附件和 Obsidian 目录
- **自动命名**：文件名格式为 `author-year-title`

## 前置要求

### 1. 安装 MinerU

```bash
# 创建 conda 环境
conda create -n mineru python=3.10 -y
conda activate mineru

# 安装 MinerU
pip install mineru

# 下载模型（约 3-5GB，首次需要）
mineru download
# 如果下载慢，先执行: set MINERU_MODEL_SOURCE=modelscope
```

### 2. 配置插件

**必须修改** `chrome/content/scripts/mineru.js` 中的配置：

```javascript
config: {
    // Obsidian 笔记目录（转换后的文件保存到这里）
    obsidianDir: "C:\\Users\\用户名\\Documents\\Obsidian\\papers\\_inbox",

    // Conda 安装路径（用于激活 mineru 环境）
    // 查找方法: 命令行运行 `where conda`
    condaPath: "C:\\ProgramData\\miniconda3",

    // 解析后端: pipeline (6GB显存,推荐) 或 vlm-auto-engine (8GB显存,精度更高)
    backend: "pipeline"
}
```

**修改后重新打包**：
```bash
# 运行打包脚本
python build.py
```
生成 `mineru-converter.xpi` 安装包。

## 安装

1. 在 [Releases](../../releases) 下载 `mineru-converter.xpi`
2. Zotero → 工具 → 插件 → 齿轮图标 → Install Plugin From File
3. 选择 `.xpi` 文件，**重启 Zotero**

## 使用

1. 在 Zotero 中**右键点击** PDF 附件
2. 选择 **"用 MinerU 转换为 Markdown"**
3. 等待转换完成（约30-60秒）

转换后的 Markdown 同时保存在：
- **Zotero**：文献条目的附件中
- **Obsidian**：配置的 `_inbox` 目录

## 故障排除

| 问题 | 解决方法 |
|------|---------|
| 菜单没有出现 | 确认安装后已重启 Zotero；查看帮助→调试输出 |
| 转换没有反应 | 确认 `conda activate mineru` 后能运行 `mineru --version`；检查 `condaPath` 配置 |
| 显存不足 | 切换到 `pipeline` 后端；关闭其他占用显存的程序 |
| 模型下载失败 | `set MINERU_MODEL_SOURCE=modelscope` 后重新 `mineru download` |

## 相关链接

- MinerU: https://github.com/opendatalab/MinerU
- Zotero 插件开发: https://www.zotero.org/support/dev/zotero_7_for_developers

## 许可

MIT License
