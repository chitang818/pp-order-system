/**
 * 产品服务
 * 封装产品相关的业务逻辑
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listProductsAsync = promisify(db.listProducts);
const getProductAsync = promisify(db.getProduct);
const createProductAsync = promisify(db.createProduct);
const updateProductAsync = promisify(db.updateProduct);
const deleteProductAsync = promisify(db.deleteProduct);
const searchProductsAsync = promisify(db.searchProducts);

class ProductService {
  /**
   * 获取产品列表
   * @returns {Promise<Array>}
   */
  static async listProducts() {
    try {
      const products = await listProductsAsync();
      return products || [];
    } catch (error) {
      console.error('[ProductService] 获取产品列表失败:', error);
      throw new Error('获取产品列表失败: ' + error.message);
    }
  }

  /**
   * 获取单个产品
   * @param {number|string} id - 产品ID
   * @returns {Promise<Object>}
   * @throws {Error} 产品不存在时抛出错误
   */
  static async getProduct(id) {
    try {
      const product = await getProductAsync(id);
      if (!product) {
        const error = new Error('产品不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }
      return product;
    } catch (error) {
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      console.error('[ProductService] 获取产品失败:', error);
      throw new Error('获取产品信息失败: ' + error.message);
    }
  }

  /**
   * 搜索产品
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array>}
   */
  static async searchProducts(keyword) {
    try {
      if (!keyword || keyword.trim() === '') {
        return [];
      }
      const products = await searchProductsAsync(keyword);
      return products || [];
    } catch (error) {
      console.error('[ProductService] 搜索产品失败:', error);
      throw new Error('搜索产品失败: ' + error.message);
    }
  }

  /**
   * 创建产品
   * @param {Object} productData - 产品数据
   * @returns {Promise<Object>}
   */
  static async createProduct(productData) {
    try {
      // 业务逻辑验证（输入验证已在中间件中完成）
      if (!productData || !productData.model || productData.model.trim() === '') {
        const error = new Error('产品型号不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 调用数据库层创建产品
      const product = await createProductAsync(productData);

      return product;
    } catch (error) {
      console.error('[ProductService] 创建产品失败:', error);
      if (error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('创建产品失败: ' + error.message);
    }
  }

  /**
   * 更新产品
   * @param {number|string} id - 产品ID
   * @param {Object} productData - 产品数据
   * @returns {Promise<Object>}
   */
  static async updateProduct(id, productData) {
    try {
      // 检查产品是否存在
      const existingProduct = await getProductAsync(id);
      if (!existingProduct) {
        const error = new Error('产品不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      // 业务逻辑验证
      if (productData.model && productData.model.trim() === '') {
        const error = new Error('产品型号不能为空');
        error.code = 'VALIDATION_ERROR';
        throw error;
      }

      // 调用数据库层更新产品
      const product = await updateProductAsync(id, productData);

      if (!product) {
        const error = new Error('产品不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      return product;
    } catch (error) {
      console.error('[ProductService] 更新产品失败:', error);
      if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR') {
        throw error;
      }
      throw new Error('更新产品失败: ' + error.message);
    }
  }

  /**
   * 删除产品
   * @param {number|string} id - 产品ID
   * @returns {Promise<Object>}
   */
  static async deleteProduct(id) {
    try {
      // 检查产品是否存在
      const existingProduct = await getProductAsync(id);
      if (!existingProduct) {
        const error = new Error('产品不存在');
        error.code = 'NOT_FOUND';
        throw error;
      }

      // 调用数据库层删除产品
      await deleteProductAsync(id);

      return {
        success: true,
        message: '产品删除成功',
        deletedId: id
      };
    } catch (error) {
      console.error('[ProductService] 删除产品失败:', error);
      if (error.code === 'NOT_FOUND') {
        throw error;
      }
      throw new Error('删除产品失败: ' + error.message);
    }
  }
}

module.exports = ProductService;
