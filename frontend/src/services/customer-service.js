/**
 * 客户服务
 * 负责客户相关的业务逻辑：数据加载、筛选、统计、删除等
 * ES6 模块化版本
 * 
 * @module services/customer-service
 * @example
 * ```javascript
 * import { CustomerService } from './services/customer-service.js';
 * 
 * const customerService = new CustomerService({
 *   stateManager: stateManager,
 *   apiService: window.ApiService
 * });
 * 
 * // 加载客户列表
 * const customers = await customerService.loadCustomers();
 * ```
 */

/**
 * 客户服务类
 * 封装客户相关的业务逻辑操作
 * 
 * @class CustomerService
 */
export class CustomerService {
  constructor(options = {}) {
    /**
     * 状态管理器
     */
    this.stateManager = options.stateManager || null;
    
    /**
     * API 服务
     */
    this.apiService = options.apiService || (window.ApiService || null);
    
    if (!this.stateManager) {
      throw new Error('CustomerService: stateManager is required');
    }
    if (!this.apiService) {
      throw new Error('CustomerService: apiService is required');
    }
  }
  
  /**
   * 加载客户列表
   * 从 API 加载客户数据并更新状态管理器
   * 
   * @param {Object} [options={}] - 加载选项（当前未使用，保留用于扩展）
   * @returns {Promise<Array<Object>>} 客户列表数组
   * @throws {Error} 如果 API 调用失败
   * @example
   * ```javascript
   * const customers = await customerService.loadCustomers();
   * ```
   */
  async loadCustomers(options = {}) {
    try {
      console.log('[CustomerService] 开始加载客户列表', options);
      
      // 清除缓存，确保获取最新数据
      if (window.CacheService) {
        window.CacheService.customers.clear();
        console.log('[CustomerService] 已清除客户缓存');
      }
      
      const result = await this.apiService.customers.list();
      
      // 处理分页结果或数组结果
      let customers = [];
      if (Array.isArray(result)) {
        customers = result;
      } else if (result && typeof result === 'object' && 'data' in result) {
        // 分页结果：{ total, page, pageSize, totalPages, data }
        customers = Array.isArray(result.data) ? result.data : [];
        console.log('[CustomerService] 收到分页结果:', {
          total: result.total,
          page: result.page,
          pageSize: result.pageSize,
          dataCount: customers.length
        });
      } else {
        console.warn('[CustomerService] API返回非数组数据:', result);
        customers = [];
      }
      
      // 更新状态
      this.stateManager.setState('customers', customers);
      console.log('[CustomerService] 客户列表加载成功:', customers.length, '条');
      
      // 调试：检查totalUSD数据
      if (customers.length > 0) {
        const sampleCustomer = customers[0];
        console.log('[CustomerService] 调试 - 第一个客户数据:', {
          id: sampleCustomer.id,
          name: sampleCustomer.name,
          totalUSD: sampleCustomer.totalUSD,
          totalUSDType: typeof sampleCustomer.totalUSD,
          totalUSDValue: sampleCustomer.totalUSD,
          hasTotalUSD: 'totalUSD' in sampleCustomer
        });
        
        // 检查所有客户的totalUSD
        const totalUSDStats = customers.map(c => ({
          id: c.id,
          name: c.name,
          totalUSD: c.totalUSD,
          totalUSDType: typeof c.totalUSD
        }));
        console.log('[CustomerService] 调试 - 所有客户的totalUSD:', totalUSDStats);
      }
      
      return customers;
    } catch (error) {
      console.error('[CustomerService] 加载客户列表失败:', error);
      this.stateManager.setState('customers', []);
      throw error;
    }
  }
  
  /**
   * 获取客户列表
   * @returns {Array} 客户列表
   */
  getCustomers() {
    return this.stateManager.getState('customers') || [];
  }
  
  /**
   * 筛选客户
   * @param {Object} filters - 筛选条件
   * @param {string} filters.name - 客户名称
   * @param {string} filters.tel - 联系电话
   * @param {string} filters.address - 地址
   * @param {string} filters.contact - 联系人
   * @returns {Array} 筛选后的客户列表
   */
  filterCustomers(filters = {}) {
    const customers = this.getCustomers();
    
    const {
      name = '',
      tel = '',
      address = '',
      contact = ''
    } = filters;
    
    const fName = name.trim().toLowerCase();
    const fTel = tel.trim().toLowerCase();
    const fAddress = address.trim().toLowerCase();
    const fContact = contact.trim().toLowerCase();
    
    console.log('[CustomerService] 筛选客户:', {
      fName, fTel, fAddress, fContact,
      totalCustomers: customers.length
    });
    
    const filtered = customers.filter((c) => {
      const nameMatch = fName ? String(c.name || '').toLowerCase().includes(fName) : true;
      const telMatch = fTel ? String(c.tel || '').toLowerCase().includes(fTel) : true;
      const addressMatch = fAddress ? String(c.address || '').toLowerCase().includes(fAddress) : true;
      const contactMatch = fContact ? String(c.contact || '').toLowerCase().includes(fContact) : true;
      return nameMatch && telMatch && addressMatch && contactMatch;
    });
    
    console.log('[CustomerService] 筛选结果:', filtered.length, '条');
    return filtered;
  }
  
  /**
   * 分页客户列表
   * @param {Array} customers - 客户列表
   * @param {number} page - 当前页码（从1开始）
   * @param {number} pageSize - 每页数量
   * @returns {Object} 分页结果 { data, page, pageSize, total, totalPages, startIndex, endIndex }
   */
  paginateCustomers(customers, page = 1, pageSize = 20) {
    const total = customers.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageData = customers.slice(startIndex, endIndex);
    
    return {
      data: pageData,
      page,
      pageSize,
      total,
      totalPages,
      startIndex,
      endIndex
    };
  }
  
  /**
   * 获取客户统计信息
   * @returns {Object} 统计信息
   */
  getCustomerStats() {
    const customers = this.getCustomers();
    
    const totalCount = customers.length;
    
    // 活跃客户数（有交易额的客户）
    const activeCount = customers.filter(c => (c.totalUSD || 0) > 0).length;
    
    // 总交易额
    const totalUSD = customers.reduce((sum, c) => {
      const value = Number(c.totalUSD || 0);
      console.log('[CustomerService] 调试 - 统计总交易额:', {
        customerName: c.name,
        totalUSD: c.totalUSD,
        totalUSDType: typeof c.totalUSD,
        numericValue: value,
        currentSum: sum,
        newSum: sum + value
      });
      return sum + value;
    }, 0);
    
    console.log('[CustomerService] 调试 - 统计结果:', {
      totalCount,
      activeCount,
      totalUSD,
      totalUSDType: typeof totalUSD
    });
    
    return {
      total: totalCount,
      active: activeCount,
      totalUSD: totalUSD
    };
  }
  
  /**
   * 删除客户
   * @param {number|string} customerId - 客户ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteCustomer(customerId) {
    try {
      if (!customerId && customerId !== 0) {
        throw new Error('客户ID不能为空');
      }
      
      console.log('[CustomerService] 删除客户:', customerId);
      
      // 使用 ApiService.json 确保包含 CSRF token
      const resp = await this.apiService.json(
        `/api/customers/${encodeURIComponent(customerId)}`,
        { method: 'DELETE' }
      );
      
      // 检查响应：成功或错误
      if (resp && (resp.success === true || resp.ok === true)) {
        // 从状态中移除客户
        const customers = this.getCustomers();
        const updatedCustomers = customers.filter(c => c.id !== customerId);
        this.stateManager.setState('customers', updatedCustomers);
        
        // 清除缓存
        if (window.CacheService) {
          window.CacheService.customers.clear();
        }
        
        console.log('[CustomerService] 客户删除成功:', customerId);
        return { success: true, customerId, message: resp.message || '删除成功' };
      } else if (resp && (resp.error === 'NOT_FOUND' || resp.message?.includes('不存在'))) {
        // 客户不存在（404 错误）
        console.warn('[CustomerService] 客户不存在:', customerId);
        return { success: false, message: '客户不存在' };
      } else {
        // 其他错误
        const errorMsg = resp?.message || '删除失败';
        console.error('[CustomerService] 客户删除失败:', errorMsg);
        return { success: false, message: errorMsg };
      }
    } catch (error) {
      console.error('[CustomerService] 删除客户异常:', error);
      throw error;
    }
  }
  
  /**
   * 根据ID获取客户
   * @param {number|string} customerId - 客户ID
   * @returns {Object|null} 客户对象
   */
  getCustomerById(customerId) {
    const customers = this.getCustomers();
    return customers.find(c => c.id === customerId) || null;
  }
  
  /**
   * 根据名称获取客户
   * @param {string} name - 客户名称
   * @returns {Object|null} 客户对象
   */
  getCustomerByName(name) {
    const customers = this.getCustomers();
    const normalizedName = String(name || '').trim().toLowerCase();
    return customers.find(c => 
      String(c.name || '').trim().toLowerCase() === normalizedName
    ) || null;
  }
  
  /**
   * 解析客户ID（支持ID字符串或客户名称）
   * @param {string|number} idOrName - 客户ID或名称
   * @returns {Promise<number|null>} 客户ID，未找到返回null
   */
  async resolveCustomerId(idOrName) {
    if (!idOrName && idOrName !== 0) {
      return null;
    }
    
    // 尝试作为ID解析
    const idStr = String(idOrName).trim();
    if (idStr && Number.isFinite(Number(idStr))) {
      const id = Number(idStr);
      // 检查本地是否存在
      const customer = this.getCustomerById(id);
      if (customer) {
        return id;
      }
    }
    
    // 尝试作为名称查找
    const customers = this.getCustomers();
    const customer = customers.find(c => 
      String(c.name || '').trim().toLowerCase() === String(idOrName).trim().toLowerCase()
    );
    
    if (customer && customer.id != null) {
      return Number(customer.id);
    }
    
    // 如果本地没找到，尝试从服务器获取
    try {
      const serverCustomers = await this.apiService.customers.list();
      if (Array.isArray(serverCustomers)) {
        const found = serverCustomers.find(c => 
          String(c.name || '').trim().toLowerCase() === String(idOrName).trim().toLowerCase()
        );
        if (found && found.id != null) {
          return Number(found.id);
        }
      }
    } catch (error) {
      console.warn('[CustomerService] 从服务器解析客户ID失败:', error);
    }
    
    return null;
  }
  
  /**
   * 格式化联系方式
   * @param {Object} customer - 客户对象
   * @returns {string} 格式化后的联系方式
   */
  formatContact(customer) {
    const parts = [];
    if (customer.tel) parts.push(`Tel:${customer.tel}`);
    if (customer.fax) parts.push(`FAX:${customer.fax}`);
    const s = parts.join(' / ');
    return s || '-';
  }
  
  /**
   * 导出客户数据为CSV格式
   * @returns {string} CSV内容
   */
  exportToCSV() {
    const customers = this.getCustomers();
    
    if (customers.length === 0) {
      throw new Error('没有客户数据可导出');
    }
    
    const headers = ['客户名称', '联系电话', '传真', '地址', '联系人', '交易额(USD)'];
    const csvContent = [
      headers.join(','),
      ...customers.map(c => [
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.tel || '').replace(/"/g, '""')}"`,
        `"${(c.fax || '').replace(/"/g, '""')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${(c.contact || '').replace(/"/g, '""')}"`,
        c.totalUSD || 0
      ].join(','))
    ].join('\n');
    
    // 添加BOM，支持Excel正确识别UTF-8编码
    return '\uFEFF' + csvContent;
  }
  
  /**
   * 生成客户选择选项的HTML
   * @param {Object} options - 选项
   * @param {string} options.placeholder - 占位符文本
   * @param {string} options.currentValue - 当前选中的值
   * @param {Function} options.escapeHtml - HTML转义函数
   * @returns {string} HTML字符串
   */
  generateSelectOptions(options = {}) {
    const {
      placeholder = '选择客户',
      currentValue = '',
      escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
      }
    } = options;
    
    const customers = this.getCustomers();
    const optionsHtml = [
      `<option value="">${escapeHtml(placeholder)}</option>`,
      ...customers.map((c) => {
        const value = escapeHtml(String(c.id || c.name));
        const name = escapeHtml(c.name || '');
        const grade = c.grade ? ` (${escapeHtml(c.grade)})` : '';
        return `<option value="${value}">${name}${grade}</option>`;
      })
    ].join('');
    
    return optionsHtml;
  }
}

/**
 * 创建客户服务实例
 * @param {Object} options - 选项
 * @param {StateManager} options.stateManager - 状态管理器
 * @param {Object} options.apiService - API服务
 * @returns {CustomerService} 客户服务实例
 */
export function createCustomerService(options) {
  return new CustomerService(options);
}

