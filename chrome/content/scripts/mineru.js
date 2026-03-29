// MinerU Converter Plugin for Zotero
// 将 PDF 转换为 Markdown，保存到 Zotero 并复制到 Obsidian

// Use Zotero.mineru namespace like doc2x does
Zotero.mineru = {
    menuId: "mineru-convert-menu",

    // 配置
    config: {
        obsidianDir: "C:\\Users\\zhisheng\\Documents\\zhisheng_obsidian\\papers\\_inbox",
        condaPath: "C:\\ProgramData\\miniconda3",
        backend: "pipeline"  // 可选: pipeline, vlm-auto-engine
    },

    _getWin: function() {
        return Zotero.getMainWindow();
    },

    log: function(msg) {
        Zotero.debug("[MinerU] " + msg);
    },

    showAlert: function(msg) {
        var win = Zotero.getMainWindow();
        if (win && win.alert) {
            win.alert(msg);
        } else {
            this.log("ALERT: " + msg);
        }
    },

    hooks: {
        refresh: function() {
            // Called after script is loaded, init main window if available
            var win = Zotero.getMainWindow();
            if (!win || !win.document) {
                // Window not ready, will be called by onMainWindowLoad callback
                return;
            }
            Zotero.mineru.hooks.onMainWindowLoad(win);
        },

        onMainWindowLoad: function(win) {
            // Ensure menu is set up
            if (!win || !win.document) return;

            // Check if menu already exists
            if (win.document.getElementById(Zotero.mineru.menuId)) {
                return; // Already set up
            }

            Zotero.mineru.setupMenu(win);
        },

        onMainWindowUnload: function(win) {
            var doc = win.document;
            var item = doc.getElementById(Zotero.mineru.menuId);
            if (item) item.remove();
        },

        shutdown: function() {
            var win = Zotero.getMainWindow();
            if (win) {
                Zotero.mineru.hooks.onMainWindowUnload(win);
            }
        }
    },

    setupMenu: function(win) {
        var doc = win.document;
        var menu = doc.getElementById("zotero-itemmenu");
        if (!menu) return;

        var old = doc.getElementById(Zotero.mineru.menuId);
        if (old) old.remove();

        var item = doc.createXULElement("menuitem");
        item.id = Zotero.mineru.menuId;
        item.setAttribute("label", "用 MinerU 转换为 Markdown");

        item.addEventListener("command", function() {
            Zotero.mineru.convertSelected();
        });

        menu.appendChild(item);

        menu.addEventListener("popupshowing", function() {
            try {
                item.hidden = !Zotero.mineru.hasPDFSelected();
            } catch (e) {}
        });
    },

    hasPDFSelected: function() {
        var win = Zotero.getMainWindow();
        var zpane = win && win.ZoteroPane;
        if (!zpane) return false;
        var items = zpane.getSelectedItems();
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.isAttachment() && item.attachmentContentType === "application/pdf") {
                return true;
            }
        }
        return false;
    },

    convertSelected: function() {
        Zotero.mineru.log("convertSelected started");
        try {
            var win = Zotero.getMainWindow();
            var zpane = win && win.ZoteroPane;
            if (!zpane) {
                Zotero.mineru.showAlert("无法获取 ZoteroPane");
                return;
            }
            var items = zpane.getSelectedItems();
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item.isAttachment() && item.attachmentContentType === "application/pdf") {
                    Zotero.mineru.convert(item);
                }
            }
        } catch (e) {
            Zotero.mineru.log("convertSelected error: " + e);
            Zotero.mineru.showAlert("选择项错误: " + e.message);
        }
    },

    convert: async function(item) {
        try {
            var pdfPath = item.getFilePath();
            if (!pdfPath) {
                Zotero.mineru.showAlert("无法获取PDF路径");
                return;
            }

            // 确保路径使用反斜杠（Windows 格式）
            pdfPath = pdfPath.replace(/\//g, '\\');

            var parentItem = item.parentItem;
            if (!parentItem) {
                parentItem = item;
            }

            // 生成文件名：author-year-title 格式
            var baseName = Zotero.mineru.generateFileName(parentItem);

            // 路径设置
            var tempDir = "C:\\temp\\mineru_" + Date.now();
            var tempMdPath = tempDir + "\\output.md";
            var finalObsidianPath = Zotero.mineru.config.obsidianDir + "\\" + baseName + ".md";

            Zotero.mineru.log("PDF: " + pdfPath);
            Zotero.mineru.log("Temp: " + tempDir);
            Zotero.mineru.log("Obsidian: " + finalObsidianPath);

            // 确保目录存在
            Zotero.mineru.ensureDirectory(Zotero.mineru.config.obsidianDir);
            Zotero.mineru.ensureDirectory("C:\\temp");

            // 将 PDF 复制到纯 ASCII 临时路径（避免 MinerU 中文路径 bug）
            var ts = Date.now();
            var tempPdfName = "mineru_input_" + ts + ".pdf";
            var tempPdf = "C:\\temp\\" + tempPdfName;
            var srcFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            srcFile.initWithPath(pdfPath);
            var tempDir_obj = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            tempDir_obj.initWithPath("C:\\temp");
            srcFile.copyTo(tempDir_obj, tempPdfName);

            // 显示进度
            var progress = new Zotero.ProgressWindow();
            progress.changeHeadline("MinerU 转换");
            progress.addDescription("正在转换: " + item.getDisplayTitle().substring(0, 40) + "...");
            progress.show();

            var tempBatch = "C:\\temp\\mineru_run_" + Date.now() + ".bat";

            // 创建批处理文件（chcp 65001 解决中文/特殊字符路径问题）
            var batchContent =
                '@echo off\r\n' +
                'chcp 65001 >nul\r\n' +
                'call "' + Zotero.mineru.config.condaPath + '\\Scripts\\activate.bat" mineru\r\n' +
                'if errorlevel 1 exit /b 1\r\n' +
                'set MINERU_MODEL_SOURCE=modelscope\r\n' +
                'mineru -p "' + tempPdf + '" -o "' + tempDir + '" -b ' + Zotero.mineru.config.backend + '\r\n' +
                'if errorlevel 1 exit /b 1\r\n' +
                'for /r "' + tempDir + '" %%f in (*.md) do (\r\n' +
                '    copy "%%f" "' + tempMdPath + '" >nul\r\n' +
                '    if not errorlevel 1 exit /b 0\r\n' +
                ')\r\n' +
                'exit /b 1\r\n';
            Zotero.mineru.writeScript(tempBatch, batchContent);

            Zotero.mineru.log("Batch: " + tempBatch);
            progress.addDescription("执行 MinerU... (约30-60秒)");

            // 执行转换
            var result = await Zotero.Utilities.Internal.exec(tempBatch, []);
            Zotero.mineru.log("Exit code: " + result);

            // 清理批处理文件
            Zotero.mineru.removeFile(tempBatch);

            // 检查结果
            var tempMdFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            tempMdFile.initWithPath(tempMdPath);
            if (!tempMdFile.exists()) {
                progress.addDescription("✗ 转换失败");
                progress.startCloseTimer(5000);
                return;
            }

            progress.addDescription("导入到 Zotero...");

            // 1. 导入到 Zotero
            var importedAttachment = await Zotero.Attachments.importFromFile({
                file: tempMdFile,
                parentItemID: parentItem.id,
                title: baseName
            });

            Zotero.mineru.log("Imported to Zotero: " + importedAttachment.id);

            // 2. 复制到 Obsidian
            progress.addDescription("复制到 Obsidian...");

            var obsidianDirFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            obsidianDirFile.initWithPath(Zotero.mineru.config.obsidianDir);

            var obsidianFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            obsidianFile.initWithPath(finalObsidianPath);

            if (obsidianFile.exists()) {
                obsidianFile.remove(false);
            }

            tempMdFile.copyTo(obsidianDirFile, baseName + ".md");
            Zotero.mineru.log("Copied to Obsidian: " + finalObsidianPath);

            // 3. 清理临时目录和临时 PDF
            Zotero.mineru.removeFile(tempPdf);
            var tempDirFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            tempDirFile.initWithPath(tempDir);
            if (tempDirFile.exists()) {
                tempDirFile.remove(true);
            }

            progress.addDescription("✓ 完成!");
            progress.startCloseTimer(3000);

        } catch (e) {
            Zotero.mineru.log("Convert error: " + e);
            Zotero.mineru.showAlert("转换错误: " + e.message);
        }
    },

    ensureDirectory: function(dirPath) {
        try {
            var dir = Zotero.File.pathToFile(dirPath);
            if (!dir.exists()) {
                dir.create(Components.interfaces.nsIFile.DIRECTORY_TYPE, 0o755);
            }
        } catch (e) {
            Zotero.mineru.log("Directory error: " + e);
        }
    },

    writeScript: function(filePath, content) {
        var file = Zotero.File.pathToFile(filePath);
        var foStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
            .createInstance(Components.interfaces.nsIFileOutputStream);
        foStream.init(file, 0x02 | 0x08 | 0x20, 0o666, 0);

        var converter = Components.classes["@mozilla.org/intl/converter-output-stream;1"]
            .createInstance(Components.interfaces.nsIConverterOutputStream);
        converter.init(foStream, "utf-8", 0, 0);
        converter.writeString(content);
        converter.close();
    },

    removeFile: function(filePath) {
        try {
            var file = Zotero.File.pathToFile(filePath);
            if (file.exists()) {
                file.remove(false);
            }
        } catch (e) {}
    },

    generateFileName: function(item) {
        // 获取作者
        var creators = item.getCreators();
        var author = "Unknown";
        if (creators && creators.length > 0) {
            var firstCreator = creators[0];
            author = firstCreator.lastName || firstCreator.name || "Unknown";
        }

        // 获取年份
        var year = item.getField('year') || '';

        // 获取标题（前40个字符）
        var title = item.getField('title') || '';
        title = title.substring(0, 40).trim();

        // 清理特殊字符
        var sanitize = function(str) {
            return str.replace(/[\s<>:"/\\|?*]/g, '_');
        };

        author = sanitize(author);
        year = sanitize(year);
        title = sanitize(title);

        // 组合文件名：author-year-title
        var fileName = author;
        if (year) fileName += "-" + year;
        if (title) fileName += "-" + title;

        // 如果文件名为空，使用默认格式
        if (!fileName || fileName === "Unknown") {
            fileName = "MinerU_" + Date.now();
        }

        return fileName;
    }
};

// Initialize
var win = Zotero.getMainWindow();
if (win && win.document.readyState === "complete") {
    window.MinerUConverter.setupMenu(win);
} else if (win) {
    win.addEventListener("load", function onLoad() {
        win.removeEventListener("load", onLoad);
        window.MinerUConverter.setupMenu(win);
    });
}
