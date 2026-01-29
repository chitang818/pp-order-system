/**
 * 后端工具函数测试
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

describe('路径处理测试', () => {
  it('path.join 测试', () => {
    const result = path.join('data', 'erp.sqlite');
    expect(result).toMatch(/data/);
    expect(result).toMatch(/erp\.sqlite/);
  });

  it('path.resolve 测试', () => {
    const result = path.resolve('data', 'erp.sqlite');
    expect(result).toContain('erp.sqlite');
    expect(path.isAbsolute(result)).toBe(true);
  });
});

describe('环境变量测试', () => {
  it('NODE_ENV 默认值', () => {
    const nodeEnv = process.env.NODE_ENV || 'development';
    expect(['development', 'production', 'test']).toContain(nodeEnv);
  });
});
