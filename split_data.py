#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
数据分片脚本 - 将大数据文件分割成多个小文件
用于提高网页首次加载速度
"""

import json
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent / 'data'
CHUNK_SIZE = 500  # 每个分片的数据条数

def main():
    print("=" * 60)
    print("数据分片")
    print("=" * 60)
    
    # 加载完整数据
    input_file = DATA_DIR / 'qa_data_final.json'
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    all_data = data['data']
    total_count = len(all_data)
    chunk_count = (total_count + CHUNK_SIZE - 1) // CHUNK_SIZE
    
    print(f"总数据: {total_count} 条")
    print(f"分片大小: {CHUNK_SIZE} 条/文件")
    print(f"分片数量: {chunk_count} 个")
    
    # 创建分片目录
    chunks_dir = DATA_DIR / 'chunks'
    chunks_dir.mkdir(exist_ok=True)
    
    # 分片索引
    index_data = {
        'update_time': data['update_time'],
        'total_count': total_count,
        'source_stats': data.get('source_stats', {}),
        'image_count': data.get('image_count', 0),
        'chunk_size': CHUNK_SIZE,
        'chunk_count': chunk_count,
        'chunks': []
    }
    
    # 生成分片文件
    for i in range(chunk_count):
        start = i * CHUNK_SIZE
        end = min(start + CHUNK_SIZE, total_count)
        chunk_data = all_data[start:end]
        
        chunk_file = chunks_dir / f'chunk_{i}.json'
        chunk_info = {
            'index': i,
            'start': start,
            'end': end,
            'count': len(chunk_data),
            'file': f'chunks/chunk_{i}.json'
        }
        
        with open(chunk_file, 'w', encoding='utf-8') as f:
            json.dump({
                'chunk_index': i,
                'data': chunk_data
            }, f, ensure_ascii=False)
        
        index_data['chunks'].append(chunk_info)
        print(f"  生成: {chunk_file.name} ({len(chunk_data)} 条)")
    
    # 保存索引文件
    index_file = DATA_DIR / 'index.json'
    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)
    
    print(f"\n索引文件: {index_file}")
    print("=" * 60)

if __name__ == '__main__':
    main()
