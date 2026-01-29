/**
 * 变量选择器组件
 * 提供可视化的数据变量选择界面
 */
import { DataResolver } from '../block-engine/data-resolver.js';

export class VariableSelector {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.value = options.value || '';
    this.isOpen = false;
  }

  /**
   * 渲染变量选择器
   */
  render() {
    if (typeof this.container === 'string') {
      this.container = document.getElementById(this.container);
    }
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="variable-selector">
        <div class="variable-input-wrapper">
          <input type="text" 
                 class="variable-input" 
                 value="${this.escapeHtml(this.value)}"
                 placeholder="点击选择变量或手动输入">
          <button type="button" class="btn-select-variable" title="选择变量">📋</button>
        </div>
        <div class="variable-panel" style="display: none;">
          ${this.renderVariableTree()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * 渲染变量树
   */
  renderVariableTree() {
    const variables = this.getVariableTree();
    
    let html = '<div class="variable-tree">';
    variables.forEach(group => {
      html += `<div class="variable-group">
        <div class="variable-group-title">${group.title}</div>
        <div class="variable-list">`;
      
      group.variables.forEach(variable => {
        html += `<div class="variable-item" data-path="${variable.path}">
          <span class="variable-name">${variable.name}</span>
          <span class="variable-path">${variable.path}</span>
        </div>`;
      });
      
      html += `</div></div>`;
    });
    
    html += '</div>';
    return html;
  }

  /**
   * 获取变量树结构
   */
  getVariableTree() {
    return [
      {
        title: '订单信息',
        variables: [
          { name: '合同号', path: 'order.contractNo' },
          { name: '发票号', path: 'order.invoiceNo' },
          { name: '发票日期', path: 'order.invoiceDate' },
          { name: '发货日期', path: 'order.shipmentDate' },
          { name: '目的地', path: 'order.destination' },
          { name: '付款方式', path: 'order.payment' },
          { name: '保险', path: 'order.insurance' },
          { name: '总金额', path: 'order.totalValue' },
          { name: '特殊条款', path: 'order.specialClause' },
          { name: '备注', path: 'order.remarks' }
        ]
      },
      {
        title: '客户信息',
        variables: [
          { name: '客户名称', path: 'customer.name' },
          { name: '客户地址', path: 'customer.address' },
          { name: '电话', path: 'customer.tel' },
          { name: '传真', path: 'customer.fax' }
        ]
      },
      {
        title: '公司信息',
        variables: [
          { name: '公司名称(英文)', path: 'company.companyNameEN' },
          { name: '公司名称(中文)', path: 'company.companyNameCN' },
          { name: '公司地址(英文)', path: 'company.companyAddressEN' },
          { name: '公司地址(中文)', path: 'company.companyAddressCN' },
          { name: '公司电话', path: 'company.companyTel' },
          { name: '公司传真', path: 'company.companyFax' }
        ]
      },
      {
        title: '产品信息 (循环变量)',
        variables: [
          { name: '序号', path: '@index' },
          { name: '型号', path: 'model' },
          { name: '数量', path: 'quantity' },
          { name: '件数', path: 'packages' },
          { name: '单位', path: 'unit' },
          { name: '单价', path: 'unitPrice' },
          { name: '金额', path: 'amount' },
          { name: '包装', path: 'packing' }
        ]
      },
      {
        title: '计算值',
        variables: [
          { name: '总数量', path: 'calc.totalQuantity' },
          { name: '总件数', path: 'calc.totalPackages' },
          { name: '总金额', path: 'calc.totalAmount' },
          { name: '总金额(USD)', path: 'calc.totalAmountUSD' },
          { name: '总数量(PCS)', path: 'calc.totalQuantityPCS' }
        ]
      }
    ];
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    const btnSelect = this.container.querySelector('.btn-select-variable');
    const input = this.container.querySelector('.variable-input');
    const panel = this.container.querySelector('.variable-panel');
    const variableItems = this.container.querySelectorAll('.variable-item');

    // 打开/关闭变量面板
    if (btnSelect) {
      btnSelect.addEventListener('click', () => {
        this.isOpen = !this.isOpen;
        if (panel) {
          panel.style.display = this.isOpen ? 'block' : 'none';
        }
      });
    }

    // 选择变量
    variableItems.forEach(item => {
      item.addEventListener('click', () => {
        const path = item.dataset.path;
        if (input) {
          input.value = `{{${path}}}`;
          this.value = `{{${path}}}`;
          this.isOpen = false;
          if (panel) {
            panel.style.display = 'none';
          }
          this.notifyChange();
        }
      });
    });

    // 输入框变更
    if (input) {
      input.addEventListener('change', () => {
        this.value = input.value;
        this.notifyChange();
      });
    }

    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.isOpen = false;
        if (panel) {
          panel.style.display = 'none';
        }
      }
    });
  }

  /**
   * 通知变更
   */
  notifyChange() {
    if (this.options.onChange) {
      this.options.onChange(this.value);
    }
  }

  /**
   * HTML转义
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

