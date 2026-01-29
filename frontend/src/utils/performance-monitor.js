/**
 * 性能监控工具
 * 用于监控和记录代码执行性能
 */

export class PerformanceMonitor {
  static measures = new Map();
  
  /**
   * 开始性能测量
   * @param {string} name - 测量名称
   */
  static startMeasure(name) {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`${name}-start`);
    }
    
    // 同时使用高精度时间戳作为备用
    if (!this.measures.has(name)) {
      this.measures.set(name, {
        startTime: performance.now ? performance.now() : Date.now(),
        marks: []
      });
    }
  }
  
  /**
   * 结束性能测量
   * @param {string} name - 测量名称
   * @param {Object} options - 选项
   * @param {boolean} options.log - 是否输出日志
   * @param {number} options.warnThreshold - 警告阈值（毫秒）
   * @returns {number} 执行时间（毫秒）
   */
  static endMeasure(name, options = {}) {
    const { log = true, warnThreshold = 1000 } = options;
    
    let duration = 0;
    
    // 使用 Performance API
    if (typeof performance !== 'undefined' && performance.mark && performance.measure) {
      try {
        performance.mark(`${name}-end`);
        performance.measure(name, `${name}-start`, `${name}-end`);
        const measure = performance.getEntriesByName(name)[0];
        if (measure) {
          duration = measure.duration;
        }
      } catch (e) {
        console.warn('[PerformanceMonitor] Performance API 测量失败:', e);
      }
    }
    
    // 使用备用时间戳
    if (duration === 0 && this.measures.has(name)) {
      const measure = this.measures.get(name);
      duration = (performance.now ? performance.now() : Date.now()) - measure.startTime;
      this.measures.delete(name);
    }
    
    // 输出日志
    if (log) {
      const message = `[Performance] ${name}: ${duration.toFixed(2)}ms`;
      
      if (duration > warnThreshold) {
        console.warn(`${message} ⚠️ 执行时间过长`);
      } else {
        console.log(message);
      }
    }
    
    // 清理 Performance API 标记
    if (typeof performance !== 'undefined' && performance.clearMarks) {
      try {
        performance.clearMarks(`${name}-start`);
        performance.clearMarks(`${name}-end`);
        performance.clearMeasures(name);
      } catch (e) {
        // 忽略清理错误
      }
    }
    
    return duration;
  }
  
  /**
   * 测量异步函数执行时间
   * @param {string} name - 测量名称
   * @param {Function} asyncFn - 异步函数
   * @param {Object} options - 选项
   * @returns {Promise<*>} 函数执行结果
   */
  static async measureAsync(name, asyncFn, options = {}) {
    this.startMeasure(name);
    try {
      const result = await asyncFn();
      this.endMeasure(name, options);
      return result;
    } catch (error) {
      this.endMeasure(name, { ...options, log: false });
      throw error;
    }
  }
  
  /**
   * 测量同步函数执行时间
   * @param {string} name - 测量名称
   * @param {Function} syncFn - 同步函数
   * @param {Object} options - 选项
   * @returns {*} 函数执行结果
   */
  static measureSync(name, syncFn, options = {}) {
    this.startMeasure(name);
    try {
      const result = syncFn();
      this.endMeasure(name, options);
      return result;
    } catch (error) {
      this.endMeasure(name, { ...options, log: false });
      throw error;
    }
  }
  
  /**
   * 获取所有测量结果
   * @returns {Array<Object>} 测量结果数组
   */
  static getMeasures() {
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      return performance.getEntriesByType('measure').map(entry => ({
        name: entry.name,
        duration: entry.duration,
        startTime: entry.startTime
      }));
    }
    return [];
  }
  
  /**
   * 清除所有测量结果
   */
  static clearMeasures() {
    if (typeof performance !== 'undefined' && performance.clearMeasures) {
      performance.clearMeasures();
    }
    this.measures.clear();
  }
  
  /**
   * 获取性能报告
   * @returns {Object} 性能报告
   */
  static getReport() {
    const measures = this.getMeasures();
    const totalDuration = measures.reduce((sum, m) => sum + m.duration, 0);
    const avgDuration = measures.length > 0 ? totalDuration / measures.length : 0;
    const maxDuration = measures.length > 0 
      ? Math.max(...measures.map(m => m.duration)) 
      : 0;
    const minDuration = measures.length > 0 
      ? Math.min(...measures.map(m => m.duration)) 
      : 0;
    
    return {
      total: measures.length,
      totalDuration: totalDuration.toFixed(2),
      avgDuration: avgDuration.toFixed(2),
      maxDuration: maxDuration.toFixed(2),
      minDuration: minDuration.toFixed(2),
      measures: measures.sort((a, b) => b.duration - a.duration)
    };
  }
}

