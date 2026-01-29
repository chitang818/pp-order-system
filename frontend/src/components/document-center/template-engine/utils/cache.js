/**
 * 缓存工具
 * 用于缓存解析后的AST，提高性能
 */

export class TemplateCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.accessOrder = [];
  }

  /**
   * 生成缓存键
   * @param {string} template - 模板字符串
   * @returns {string} 缓存键
   */
  getCacheKey(template) {
    // 使用简单的哈希函数
    let hash = 0;
    for (let i = 0; i < template.length; i++) {
      const char = template.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return `template_${Math.abs(hash)}`;
  }

  /**
   * 获取缓存的AST
   * @param {string} template - 模板字符串
   * @returns {Object|null} AST对象或null
   */
  get(template) {
    const key = this.getCacheKey(template);
    const cached = this.cache.get(key);
    
    if (cached) {
      // 更新访问顺序
      this.updateAccessOrder(key);
      return cached;
    }
    
    return null;
  }

  /**
   * 缓存AST
   * @param {string} template - 模板字符串
   * @param {Object} ast - AST对象
   */
  set(template, ast) {
    const key = this.getCacheKey(template);
    
    // 如果缓存已满，删除最久未使用的
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.accessOrder.shift();
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, ast);
    this.updateAccessOrder(key);
  }

  /**
   * 更新访问顺序
   */
  updateAccessOrder(key) {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
  }

  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: this.hits / (this.hits + this.misses) || 0
    };
  }
}

// 全局缓存实例
export const globalCache = new TemplateCache();

