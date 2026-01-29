/**
 * 区块注册表
 * 管理所有可用的区块类型
 */
export class BlockRegistry {
  static blocks = new Map();

  /**
   * 注册区块类型
   * @param {string} type - 区块类型标识
   * @param {class} BlockClass - 区块类
   */
  static register(type, BlockClass) {
    this.blocks.set(type, BlockClass);
  }

  /**
   * 获取区块类
   * @param {string} type - 区块类型标识
   * @returns {class|null}
   */
  static get(type) {
    return this.blocks.get(type) || null;
  }

  /**
   * 创建区块实例
   * @param {Object} config - 区块配置
   * @returns {BaseBlock|null}
   */
  static createBlock(config) {
    const BlockClass = this.get(config.type);
    if (!BlockClass) {
      console.warn(`未知的区块类型: ${config.type}`);
      return null;
    }
    return new BlockClass(config);
  }

  /**
   * 获取所有已注册的区块类型
   * @returns {Array}
   */
  static getAllTypes() {
    return Array.from(this.blocks.entries()).map(([type, BlockClass]) => ({
      type,
      name: BlockClass.displayName || type,
      icon: BlockClass.icon || '📦',
      category: BlockClass.category || 'other',
      defaultConfig: BlockClass.getDefaultConfig()
    }));
  }

  /**
   * 检查区块类型是否已注册
   * @param {string} type - 区块类型标识
   * @returns {boolean}
   */
  static has(type) {
    return this.blocks.has(type);
  }

  /**
   * 取消注册区块类型
   * @param {string} type - 区块类型标识
   */
  static unregister(type) {
    this.blocks.delete(type);
  }

  /**
   * 清空所有注册的区块
   */
  static clear() {
    this.blocks.clear();
  }
}

