/**
 * 模板适用规则配置组件
 */
export class ApplicabilityConfig {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.options = options;
    this.applicability = {
      isDefault: false,
      productTypes: [],
      customerIds: [],
      customerNames: [],
      priority: 0
    };
  }

  /**
   * 渲染配置界面
   */
  render() {
    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error('适用规则配置容器未找到:', this.containerId);
      return;
    }
    
    container.innerHTML = `
      <div class="applicability-config">
        <h4 style="margin: 0 0 15px 0; font-size: 14px;">📋 模板适用规则</h4>
        
        <!-- 默认模板 -->
        <div class="config-section">
          <label class="checkbox-label">
            <input type="checkbox" id="isDefault" ${this.applicability.isDefault ? 'checked' : ''}>
            <span>设为默认模板</span>
          </label>
          <div class="hint">无其他匹配时使用此模板</div>
        </div>
        
        <!-- 产品品类 -->
        <div class="config-section">
          <label class="section-label">适用产品品类</label>
          <div class="checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" name="productType" value="A" 
                ${this.applicability.productTypes.includes('A') ? 'checked' : ''}>
              <span>A类品</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" name="productType" value="B"
                ${this.applicability.productTypes.includes('B') ? 'checked' : ''}>
              <span>B类品</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" name="productType" value="C"
                ${this.applicability.productTypes.includes('C') ? 'checked' : ''}>
              <span>C类品</span>
            </label>
          </div>
          <div class="hint">不勾选则适用于所有品类</div>
        </div>
        
        <!-- 适用客户 -->
        <div class="config-section">
          <label class="section-label">适用客户</label>
          <div class="customer-selector">
            <select id="customerSelect" class="form-select">
              <option value="">选择客户...</option>
              ${this.renderCustomerOptions()}
            </select>
            <button type="button" id="addCustomer" class="btn-add">添加</button>
          </div>
          <div class="selected-customers" id="selectedCustomers">
            ${this.renderSelectedCustomers()}
          </div>
          <div class="hint">不选择则适用于所有客户</div>
        </div>
        
        <!-- 优先级 -->
        <div class="config-section">
          <label class="section-label">优先级</label>
          <input type="number" id="priority" class="form-input" 
                 value="${this.applicability.priority}" min="0" max="100">
          <div class="hint">数字越大优先级越高（0-100）</div>
        </div>
      </div>
      
      <style>
        .applicability-config {
          padding: 15px;
          background: #f9f9f9;
          border-radius: 8px;
        }
        .config-section {
          margin-bottom: 20px;
        }
        .section-label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 13px;
        }
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
        }
        .checkbox-group {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
        }
        .hint {
          font-size: 11px;
          color: #999;
          margin-top: 5px;
        }
        .customer-selector {
          display: flex;
          gap: 10px;
          margin-bottom: 10px;
        }
        .form-select, .form-input {
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
        }
        .form-select {
          flex: 1;
        }
        .form-input {
          width: 100px;
        }
        .btn-add {
          padding: 8px 16px;
          background: #1890ff;
          color: #fff;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        .btn-add:hover {
          background: #40a9ff;
        }
        .selected-customers {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .customer-tag {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          background: #e6f7ff;
          border: 1px solid #91d5ff;
          border-radius: 4px;
          font-size: 12px;
        }
        .customer-tag .remove {
          cursor: pointer;
          color: #999;
        }
        .customer-tag .remove:hover {
          color: #ff4d4f;
        }
      </style>
    `;
    
    this.bindEvents();
  }

  /**
   * 渲染客户选项
   */
  renderCustomerOptions() {
    const customers = this.options.customers || [];
    return customers.map(c => 
      `<option value="${c.id}" data-name="${c.name}">${c.name}</option>`
    ).join('');
  }

  /**
   * 渲染已选客户
   */
  renderSelectedCustomers() {
    const names = this.applicability.customerNames || [];
    return names.map(name => `
      <div class="customer-tag" data-name="${name}">
        <span>${name}</span>
        <span class="remove" data-action="remove">✕</span>
      </div>
    `).join('');
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    // 默认模板切换
    container.querySelector('#isDefault')?.addEventListener('change', (e) => {
      this.applicability.isDefault = e.target.checked;
      this.notifyChange();
    });
    
    // 品类选择
    container.querySelectorAll('input[name="productType"]').forEach(input => {
      input.addEventListener('change', () => {
        this.applicability.productTypes = Array.from(
          container.querySelectorAll('input[name="productType"]:checked')
        ).map(i => i.value);
        this.notifyChange();
      });
    });
    
    // 添加客户
    container.querySelector('#addCustomer')?.addEventListener('click', () => {
      const select = container.querySelector('#customerSelect');
      const name = select.options[select.selectedIndex]?.dataset?.name;
      if (name && !this.applicability.customerNames.includes(name)) {
        this.applicability.customerNames.push(name);
        container.querySelector('#selectedCustomers').innerHTML = this.renderSelectedCustomers();
        this.bindCustomerRemove();
        this.notifyChange();
      }
    });
    
    // 优先级
    container.querySelector('#priority')?.addEventListener('change', (e) => {
      this.applicability.priority = parseInt(e.target.value) || 0;
      this.notifyChange();
    });
    
    this.bindCustomerRemove();
  }

  /**
   * 绑定客户移除事件
   */
  bindCustomerRemove() {
    const container = document.getElementById(this.containerId);
    if (!container) return;
    
    container.querySelectorAll('.customer-tag .remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tag = e.target.closest('.customer-tag');
        const name = tag.dataset.name;
        this.applicability.customerNames = this.applicability.customerNames.filter(n => n !== name);
        tag.remove();
        this.notifyChange();
      });
    });
  }

  /**
   * 设置值
   */
  setValue(applicability) {
    this.applicability = { ...this.applicability, ...applicability };
    this.render();
  }

  /**
   * 获取值
   */
  getValue() {
    return this.applicability;
  }

  /**
   * 通知变更
   */
  notifyChange() {
    if (this.options.onChange) {
      this.options.onChange(this.applicability);
    }
  }
}

