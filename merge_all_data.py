#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
合并所有数据源的QA数据
"""

import json
import re
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent / 'data'

# 敏感词列表
SENSITIVE_WORDS = [
    '傻逼', '操你', '妈的', '他妈', '草泥马', '王八蛋', '滚蛋', '操', '靠',
    '妈逼', '牛逼', '装逼', '傻X', 'SB', 'sb', '妈的', 'TMD', 'tmd',
    '操你妈', '日你', '我日', '草你', '去死', '死人', '混蛋', '贱人',
    '婊子', '王八', '畜生', '傻逼的', '他妈的', '操他妈', '草他妈', '妈的个'
]

def fix_single_text(text):
    """修复图片URL并清理HTML"""
    if not text:
        return ''
    
    # 解码HTML实体
    text = text.replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&amp;', '&').replace('&nbsp;', ' ')
    
    # 匹配图片URL
    pattern = r'https://hb-v4-attachment-oss\.huoban\.com/attachment/\d+/\d+\?[^"\'>\s]+'
    urls = re.findall(pattern, text)
    
    # 处理图片标签
    for url in urls:
        # 使用字符串替换而不是正则替换（避免转义问题）
        # 移除包含图片URL的<a>标签
        text = text.replace(f'<a href="{url}"', '').replace(f"<a href='{url}'", '')
        # 将<img>标签替换为Markdown格式
        text = text.replace(f'<img src="{url}"', f'![图片]({url})')
        text = text.replace(f"<img src='{url}'", f'![图片]({url})')
    
    # 清理剩余HTML标签
    text = re.sub(r'<[a-zA-Z/][^>]*>', '', text)
    
    # 清理多余空白
    text = re.sub(r'\n\s*\n+', '\n\n', text)
    text = text.strip()
    
    return text

def filter_sensitive_words(text):
    """替换敏感词"""
    if not text:
        return text
    for word in SENSITIVE_WORDS:
        if word in text:
            text = text.replace(word, '*' * len(word))
    return text

def process_item(item):
    """处理单个数据项"""
    problem = fix_single_text(item.get('problem', ''))
    solution = fix_single_text(item.get('solution', ''))
    
    problem = filter_sensitive_words(problem)
    solution = filter_sensitive_words(solution)
    
    return {
        'problem': problem,
        'solution': solution,
        'source': item.get('source', 'unknown')
    }

def main():
    print("=" * 60)
    print("合并QA数据")
    print("=" * 60)
    
    all_data = []
    source_stats = {}
    
    # 1. 加载修复后的"日常运维QA（已满）"数据
    fixed_file = DATA_DIR / 'qa_data_full_fixed.json'
    if fixed_file.exists():
        with open(fixed_file, 'r', encoding='utf-8') as f:
            fixed_data = json.load(f)
            items = fixed_data.get('data', [])
            print(f"加载 '日常运维QA（已满）': {len(items)} 条")
            for item in items:
                processed = process_item(item)
                all_data.append(processed)
            source_stats['日常运维QA（已满）'] = len(items)
    
    # 2. 加载其他两个数据源
    orig_file = DATA_DIR / 'qa_data.json'
    if orig_file.exists():
        with open(orig_file, 'r', encoding='utf-8') as f:
            orig_data = json.load(f)
            items = orig_data.get('data', [])
            
            # 按来源分组（排除已处理的）
            other_sources = {}
            for item in items:
                src = item.get('source', 'unknown')
                if src != '日常运维QA（已满）':
                    if src not in other_sources:
                        other_sources[src] = []
                    other_sources[src].append(item)
            
            for src, src_items in other_sources.items():
                print(f"加载 '{src}': {len(src_items)} 条")
                for item in src_items:
                    processed = process_item(item)
                    all_data.append(processed)
                source_stats[src] = len(src_items)
    
    # 3. 分配ID
    for i, item in enumerate(all_data, 1):
        item['id'] = i
    
    # 4. 统计图片数量
    total_images = sum(
        item['problem'].count('![图片](') + item['solution'].count('![图片](')
        for item in all_data
    )
    
    # 5. 保存合并后的数据
    output_file = DATA_DIR / 'qa_data_final.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'update_time': datetime.now().isoformat(),
            'total_count': len(all_data),
            'source_stats': source_stats,
            'image_count': total_images,
            'data': all_data
        }, f, ensure_ascii=False, indent=2)
    
    file_size = output_file.stat().st_size
    if file_size > 1024 * 1024:
        size_str = f"{file_size / 1024 / 1024:.2f} MB"
    else:
        size_str = f"{file_size / 1024:.2f} KB"
    
    print()
    print("=" * 60)
    print("合并完成")
    print("=" * 60)
    print(f"总数据量: {len(all_data)} 条")
    print(f"图片数量: {total_images} 张")
    print()
    print("各来源统计:")
    for src, count in source_stats.items():
        print(f"  - {src}: {count} 条")
    print()
    print(f"输出文件: {output_file}")
    print(f"文件大小: {size_str}")
    print("=" * 60)
    
    # 6. 更新 qa_data.json（用于部署）
    import shutil
    deploy_file = DATA_DIR / 'qa_data.json'
    shutil.copy2(output_file, deploy_file)
    print(f"已更新: {deploy_file}")

if __name__ == '__main__':
    main()
