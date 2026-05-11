// MinerU Converter Plugin for Zotero
// 将 PDF 转换为 Markdown，并作为 Zotero 附件保存。
// Obsidian 索引与 Zotero Note 由 ocean-literature-harbor (OLH) 后续处理。
// References 清理由 LLM 在读取 Markdown 阶段处理，插件不删除 References。

Zotero.mineru = {
    menuId: "mineru-convert-menu",

    config: {
        condaPath: "C:\\ProgramData\\miniconda3",
        backend: "pipeline",
        tempRoot: "C:\\temp"
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

    showConfirm: function(title, msg) {
        var ps = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
            .getService(Components.interfaces.nsIPromptService);
        return ps.confirm(null, title, msg);
    },

    hooks: {
        refresh: function() {
            var win = Zotero.getMainWindow();
            if (!win || !win.document) return;
            Zotero.mineru.hooks.onMainWindowLoad(win);
        },

        onMainWindowLoad: function(win) {
            if (!win || !win.document) return;
            if (win.document.getElementById(Zotero.mineru.menuId)) return;
            Zotero.mineru.setupMenu(win);
        },

        onMainWindowUnload: function(win) {
            var doc = win.document;
            var item = doc.getElementById(Zotero.mineru.menuId);
            if (item) item.remove();
        },

        shutdown: function() {
            var win = Zotero.getMainWindow();
            if (win) Zotero.mineru.hooks.onMainWindowUnload(win);
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

    hasMineruMarkdownAttachment: async function(parentItem) {
        try {
            var attachmentIDs = parentItem.getAttachments();
            for (var j = 0; j < attachmentIDs.length; j++) {
                var att = await Zotero.Items.getAsync(attachmentIDs[j]);
                if (!att) continue;
                var title = att.getField("title") || "";
                // 检查是否为 .md 扩展名的附件
                if (att.isAttachment()) {
                    try {
                        var fpath = att.getFilePath();
                        if (fpath && fpath.toLowerCase().endsWith(".md")) return true;
                    } catch (e2) {}
                }
            }
        } catch (e) {
            Zotero.mineru.log("Duplicate check error: " + e);
        }
        return false;
    },

    convert: async function(item) {
        try {
            var pdfPath = item.getFilePath();
            if (!pdfPath) {
                Zotero.mineru.showAlert("无法获取PDF路径");
                return;
            }

            pdfPath = pdfPath.replace(/\//g, '\\');

            var parentItem = item.parentItem;
            if (!parentItem) {
                parentItem = item;
            }

            // 检查重复 Markdown 附件
            var hasExistingMD = await Zotero.mineru.hasMineruMarkdownAttachment(parentItem);
            if (hasExistingMD) {
                var userConfirmed = Zotero.mineru.showConfirm(
                    "MinerU",
                    "该文献似乎已有 MinerU Markdown 附件，是否仍然继续生成新的 Markdown 附件？"
                );
                if (!userConfirmed) {
                    Zotero.mineru.log("用户取消：已存在 MinerU Markdown 附件");
                    return;
                }
            }

            var baseName = Zotero.mineru.generateFileName(parentItem);
            var tempRoot = Zotero.mineru.config.tempRoot;
            var tempDir = tempRoot + "\\mineru_" + Date.now();
            var tempMdPath = tempDir + "\\output.md";

            Zotero.mineru.log("PDF: " + pdfPath);
            Zotero.mineru.log("Temp root: " + tempRoot);
            Zotero.mineru.log("Temp dir: " + tempDir);

            // 确保临时目录存在
            Zotero.mineru.ensureDirectory(tempRoot);

            // 将 PDF 复制到纯 ASCII 临时路径（避免 MinerU 中文路径 bug）
            var ts = Date.now();
            var tempPdfName = "mineru_input_" + ts + ".pdf";
            var tempPdf = tempRoot + "\\" + tempPdfName;
            var srcFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            srcFile.initWithPath(pdfPath);
            var tempDirObj = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            tempDirObj.initWithPath(tempRoot);
            srcFile.copyTo(tempDirObj, tempPdfName);

            // 显示进度
            var progress = new Zotero.ProgressWindow();
            progress.changeHeadline("MinerU 转换");
            progress.addDescription("正在转换: " + item.getDisplayTitle().substring(0, 40) + "...");
            progress.show();

            var tempBatch = tempRoot + "\\mineru_run_" + Date.now() + ".bat";

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

            Zotero.mineru.log("MD output: " + tempMdPath);

            progress.addDescription("导入 Markdown 到 Zotero...");

            // 导入到 Zotero（使用字符串路径，避免 nsIFile.copyToFollowingLinks 问题）
            var importedAttachment = await Zotero.Attachments.importFromFile({
                file: tempMdPath,
                parentItemID: parentItem.id,
                title: baseName
            });

            Zotero.mineru.log("Imported to Zotero, attachment id: " + importedAttachment.id);

            // 清理临时目录和临时 PDF
            Zotero.mineru.removeFile(tempPdf);
            var tempDirFile = Components.classes["@mozilla.org/file/local;1"]
                .createInstance(Components.interfaces.nsIFile);
            tempDirFile.initWithPath(tempDir);
            if (tempDirFile.exists()) {
                tempDirFile.remove(true);
            }

            progress.addDescription("✓ 完成：Markdown 已保存为 Zotero 附件");
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
        var creators = item.getCreators();
        var author = "Unknown";
        if (creators && creators.length > 0) {
            var firstCreator = creators[0];
            author = firstCreator.lastName || firstCreator.name || "Unknown";
        }

        var year = item.getField('year') || '';
        var title = item.getField('title') || '';
        title = title.substring(0, 40).trim();

        var sanitize = function(str) {
            return str.replace(/[\s<>:"/\\|?*]/g, '_');
        };

        author = sanitize(author);
        year = sanitize(year);
        title = sanitize(title);

        var fileName = author;
        if (year) fileName += "-" + year;
        if (title) fileName += "-" + title;

        if (!fileName || fileName === "Unknown") {
            fileName = "MinerU_" + Date.now();
        }

        return fileName;
    }
};

// Initialize
var win = Zotero.getMainWindow();
if (win && win.document.readyState === "complete") {
    Zotero.mineru.hooks.onMainWindowLoad(win);
} else if (win) {
    win.addEventListener("load", function onLoad() {
        win.removeEventListener("load", onLoad);
        Zotero.mineru.hooks.onMainWindowLoad(win);
    });
}
