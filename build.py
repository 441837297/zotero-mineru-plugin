#!/usr/bin/env python3
"""
MinerU Zotero Plugin Builder
打包脚本 - 修改配置后运行此脚本重新生成 xpi 文件
"""

import zipfile
import os
import sys
import io

# 确保输出使用 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def build_xpi():
    """打包插件为 xpi 文件"""

    # 文件列表
    files_to_include = [
        'manifest.json',
        'bootstrap.js',
        'prefs.js',
    ]

    # 目录列表
    dirs_to_include = [
        'chrome',
    ]

    output_file = 'zotero-mineru-converter-1.0.0.xpi'
    install_file = 'mineru-converter.xpi'

    # 删除旧的 xpi
    for f in [output_file, install_file]:
        if os.path.exists(f):
            os.remove(f)
            print(f"删除旧的: {f}")

    # 创建新的 xpi
    print(f"\n正在打包: {output_file}")

    with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        # 添加文件
        for file in files_to_include:
            if os.path.exists(file):
                zf.write(file, file)
                print(f"  添加: {file}")
            else:
                print(f"  警告: 文件不存在 {file}")

        # 添加目录内容
        for directory in dirs_to_include:
            if os.path.exists(directory):
                for root, dirs, files in os.walk(directory):
                    for file in files:
                        filepath = os.path.join(root, file)
                        # 排除不需要的文件
                        if not any(skip in filepath for skip in ['.git', '__pycache__', '.DS_Store']):
                            zf.write(filepath, filepath)
                            print(f"  添加: {filepath}")
            else:
                print(f"  警告: 目录不存在 {directory}")

    # 复制一份便于安装的文件名
    import shutil
    shutil.copy(output_file, install_file)
    print(f"\n✓ 打包完成！")
    print(f"  版本文件: {output_file}")
    print(f"  安装文件: {install_file}")
    print(f"\n使用方法：")
    print(f"  1. 在 Zotero 中：工具 → 插件 → Install Plugin From File")
    print(f"  2. 选择 {install_file}")
    print(f"  3. 重启 Zotero")

if __name__ == '__main__':
    build_xpi()
    input("\n按回车键退出...")
