/**
 * 货代服务
 * 封装货代相关的业务逻辑
 * 基于客户服务创建
 */

const db = require('../db');
const { promisify } = require('util');

// 将回调函数转换为 Promise
const listForwardersAsync = promisify(db.listForwarders);
const getForwarderAsync = promisify(db.getForwarder);
const createForwarderAsync = promisify(db.createForwarder);
const updateForwarderAsync = promisify(db.updateForwarder);
const deleteForwarderAsync = promisify(db.deleteForwarder);

class ForwarderService {
    /**
     * 获取货代列表
     * @param {Object} options - 查询选项（可选）
     * @param {number} options.page - 页码
     * @param {number} options.pageSize - 每页数量
     * @returns {Promise<Array|Object>} 如果提供了分页参数，返回 { total, page, pageSize, totalPages, data }，否则返回数组
     */
    static async listForwarders(options = {}) {
        try {
            const result = await listForwardersAsync(options);

            // 如果返回的是分页结果对象，直接返回
            if (result && typeof result === 'object' && 'total' in result) {
                return result;
            }

            // 否则返回数组（保持向后兼容）
            return result || [];
        } catch (error) {
            console.error('[ForwarderService] 获取货代列表失败:', error);
            throw new Error('获取货代列表失败: ' + error.message);
        }
    }

    /**
     * 获取单个货代
     * @param {number|string} id - 货代ID
     * @returns {Promise<Object>}
     * @throws {Error} 货代不存在时抛出错误
     */
    static async getForwarder(id) {
        try {
            const forwarder = await getForwarderAsync(id);
            if (!forwarder) {
                const error = new Error('货代不存在');
                error.code = 'NOT_FOUND';
                throw error;
            }
            return forwarder;
        } catch (error) {
            if (error.code === 'NOT_FOUND') {
                throw error;
            }
            console.error('[ForwarderService] 获取货代失败:', error);
            throw new Error('获取货代信息失败: ' + error.message);
        }
    }

    /**
     * 创建货代
     * @param {Object} forwarderData - 货代数据
     * @returns {Promise<Object>}
     */
    static async createForwarder(forwarderData) {
        try {
            // 业务逻辑验证（输入验证已在中间件中完成）
            if (!forwarderData || !forwarderData.name || forwarderData.name.trim() === '') {
                const error = new Error('货代名称不能为空');
                error.code = 'VALIDATION_ERROR';
                throw error;
            }

            // 调用数据库层创建货代
            const forwarder = await createForwarderAsync(forwarderData);

            return forwarder;
        } catch (error) {
            console.error('[ForwarderService] 创建货代失败:', error);
            // 处理重复名称错误
            if (error.code === 'SQLITE_CONSTRAINT' || error.message.includes('UNIQUE constraint')) {
                const duplicateError = new Error('该货代名称已存在，请使用其他名称');
                duplicateError.code = 'DUPLICATE_NAME';
                throw duplicateError;
            }
            if (error.code === 'VALIDATION_ERROR' || error.code === 'DUPLICATE_NAME') {
                throw error;
            }
            throw new Error('创建货代失败: ' + error.message);
        }
    }

    /**
     * 更新货代
     * @param {number|string} id - 货代ID
     * @param {Object} forwarderData - 货代数据
     * @returns {Promise<Object>}
     */
    static async updateForwarder(id, forwarderData) {
        try {
            // 检查货代是否存在
            const existingForwarder = await getForwarderAsync(id);
            if (!existingForwarder) {
                const error = new Error('货代不存在');
                error.code = 'NOT_FOUND';
                throw error;
            }

            // 业务逻辑验证
            if (forwarderData.name && forwarderData.name.trim() === '') {
                const error = new Error('货代名称不能为空');
                error.code = 'VALIDATION_ERROR';
                throw error;
            }

            // 调用数据库层更新货代
            const forwarder = await updateForwarderAsync(Number(id), forwarderData);

            if (!forwarder) {
                const error = new Error('货代不存在');
                error.code = 'NOT_FOUND';
                throw error;
            }

            return forwarder;
        } catch (error) {
            console.error('[ForwarderService] 更新货代失败:', error);
            // 处理重复名称错误
            if (error.code === 'SQLITE_CONSTRAINT' || error.message.includes('UNIQUE constraint')) {
                const duplicateError = new Error('该货代名称已存在，请使用其他名称');
                duplicateError.code = 'DUPLICATE_NAME';
                throw duplicateError;
            }
            if (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR' || error.code === 'DUPLICATE_NAME') {
                throw error;
            }
            throw new Error('更新货代失败: ' + error.message);
        }
    }

    /**
     * 删除货代
     * @param {number|string} id - 货代ID
     * @returns {Promise<Object>}
     */
    static async deleteForwarder(id) {
        try {
            // 检查货代是否存在
            const existingForwarder = await getForwarderAsync(id);
            if (!existingForwarder) {
                const error = new Error('货代不存在');
                error.code = 'NOT_FOUND';
                throw error;
            }

            // 调用数据库层删除货代
            await deleteForwarderAsync(Number(id));

            return {
                success: true,
                message: '货代删除成功',
                deletedId: id
            };
        } catch (error) {
            console.error('[ForwarderService] 删除货代失败:', error);
            if (error.code === 'NOT_FOUND') {
                throw error;
            }
            throw new Error('删除货代失败: ' + error.message);
        }
    }
}

module.exports = ForwarderService;
