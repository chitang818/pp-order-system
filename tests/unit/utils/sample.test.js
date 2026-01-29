/**
 * 示例测试文件
 * 用于验证测试环境配置正确
 */

import { describe, it, expect } from 'vitest';

describe('示例测试套件', () => {
  it('基础断言测试', () => {
    expect(1 + 1).toBe(2);
  });

  it('字符串测试', () => {
    const message = 'Hello, World!';
    expect(message).toContain('World');
  });

  it('数组测试', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });

  it('对象测试', () => {
    const obj = { name: 'Test', value: 123 };
    expect(obj).toHaveProperty('name');
    expect(obj.value).toBe(123);
  });
});

describe('异步测试', () => {
  it('Promise 测试', async () => {
    const promise = Promise.resolve('success');
    await expect(promise).resolves.toBe('success');
  });

  it('异步函数测试', async () => {
    const getData = async () => {
      return { status: 'ok', data: [1, 2, 3] };
    };
    
    const result = await getData();
    expect(result.status).toBe('ok');
    expect(result.data).toHaveLength(3);
  });
});
