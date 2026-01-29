/**
 * 产品表格区块
 * 这是最核心的区块，负责渲染产品明细列表
 */
import { BaseBlock } from './base-block.js';
import { DataResolver } from '../data-resolver.js';

export class ProductTableBlock extends BaseBlock {
  static displayName = '产品表格';
  static icon = '📊';
  static category = 'content';

  static getDefaultConfig() {
    return {
      // 表格列配置
      columns: [
        { header: 'NO.', binding: '@index', width: '8%', align: 'center' },
        { header: 'DESCRIPTION', binding: 'model', width: '40%', align: 'left' },
        { header: 'QUANTITY', binding: 'quantity', width: '15%', align: 'center', suffix: 'PCS' },
        { header: 'UNIT PRICE', binding: 'unitPrice', width: '17%', align: 'right', prefix: 'USD', format: 'currency' },
        { header: 'AMOUNT', binding: 'amount', width: '20%', align: 'right', prefix: 'USD', format: 'currency' }
      ],
      // 表头配置
      showHeader: true,
      headerStyle: {
        background: '#f0f0f0',
        fontWeight: 'bold',
        borderColor: '#333',
        fontSize: 12
      },
      // 表格行配置
      rowStyle: {
        borderColor: '#333',
        fontSize: 11,
        minHeight: 30
      },
      // 汇总行配置
      showFooter: true,
      footerConfig: {
        labelColumn: 0,  // 标签显示在第几列
        labelColspan: 2,  // 标签跨几列
        label: 'TOTAL',
        showTotalQuantity: true,
        totalQuantityColumn: 2,
        showTotalAmount: true,
        totalAmountColumn: 4
      },
      // 额外配置
      showProductCategory: false,  // 是否显示产品类别行（如 PP CONTAINER BAG）
      productCategory: 'PP CONTAINER BAG',
      // 描述行格式（用于复杂的描述格式）
      descriptionFormat: 'standard'  // standard | detailed | compact | invoice | packing
    };
  }

  render(data) {
    const config = { ...ProductTableBlock.getDefaultConfig(), ...this.config };
    const order = data.order || {};
    const items = order.items || [];
    const calc = data.calc || {};

    // 渲染表头
    let html = '<table class="product-table" style="width: 100%; border-collapse: collapse; border: 1px solid #333;">';
    
    if (config.showHeader) {
      html += this.renderHeader(config);
    }

    // 渲染表体
    html += '<tbody>';
    
    // 可选：产品类别行
    if (config.showProductCategory && config.productCategory) {
      html += this.renderCategoryRow(config);
    }

    // 渲染产品行
    items.forEach((item, index) => {
      html += this.renderRow(item, index, config, data);
    });

    html += '</tbody>';

    // 渲染汇总行
    if (config.showFooter) {
      html += this.renderFooter(config, calc, items);
    }

    html += '</table>';

    return `<div class="block product-table-block">${html}</div>`;
  }

  /**
   * 渲染表头
   */
  renderHeader(config) {
    const style = config.headerStyle;
    let html = '<thead><tr style="background: ' + style.background + ';">';
    
    config.columns.forEach(col => {
      html += `<th style="
        border: 1px solid ${style.borderColor};
        padding: 8px;
        text-align: ${col.align || 'center'};
        font-weight: ${style.fontWeight};
        font-size: ${style.fontSize}pt;
        width: ${col.width || 'auto'};
      ">${col.header}</th>`;
    });
    
    html += '</tr></thead>';
    return html;
  }

  /**
   * 渲染产品类别行
   */
  renderCategoryRow(config) {
    const colspan = config.columns.length;
    return `<tr>
      <td colspan="${colspan}" style="
        border: 1px solid #333;
        padding: 6px 8px;
        font-weight: bold;
      ">${config.productCategory}</td>
    </tr>`;
  }

  /**
   * 渲染单行产品数据
   */
  renderRow(item, index, config, data) {
    const style = config.rowStyle;
    let html = '<tr>';

    config.columns.forEach(col => {
      // 准备项目数据（添加索引）
      const itemWithIndex = { ...item, _index: index };
      
      // 解析绑定值
      let value = DataResolver.resolve(col.binding, data, itemWithIndex);
      
      // 特殊处理：描述行格式
      if (col.binding === 'descriptionLine' || (col.binding === 'model' && config.descriptionFormat !== 'standard')) {
        value = this.formatDescription(item, index, config);
      }
      
      // 特殊处理：计算金额
      if (col.binding === 'amount' && (!value || value === '' || value === 0)) {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || item.price || 0);
        value = qty * price;
      }

      // 格式化值
      const formattedValue = DataResolver.format(value, {
        format: col.format,
        prefix: col.prefix || '',
        suffix: col.suffix || '',
        decimals: 2
      });

      html += `<td style="
        border: 1px solid ${style.borderColor};
        padding: 6px 8px;
        text-align: ${col.align || 'left'};
        font-size: ${style.fontSize}pt;
        vertical-align: top;
      ">${formattedValue}</td>`;
    });

    html += '</tr>';
    return html;
  }

  /**
   * 格式化产品描述
   */
  formatDescription(item, index, config) {
    const model = item.model || '';
    const packages = Number(item.packages || 0);
    const quantity = Number(item.quantity || 0);
    const unit = item.unit || '';
    const packing = item.packing || '';
    
    // 获取包装单位英文
    let packageUnitEN = 'PACKAGES';
    if (unit === '托盘') packageUnitEN = packages > 1 ? 'PALLETS' : 'PALLET';
    else if (unit === '捆包') packageUnitEN = packages > 1 ? 'SACKS' : 'SACK';
    else if (unit === '件') packageUnitEN = packages > 1 ? 'BALES' : 'BALE';

    // 根据格式类型返回不同的描述
    switch (config.descriptionFormat) {
      case 'detailed':
        // 详细格式：序号) 型号 + 件数/单位 + 数量
        return `${index + 1}) ${model}<br/>${packages}${packageUnitEN} ----------${quantity}PCS`;
      
      case 'compact':
        // 紧凑格式：序号) 型号
        return `${index + 1}) ${model}`;
      
      case 'invoice':
        // 发票格式：序号)型号 + 件数单位------数量PCS
        return `${index + 1})${model}<br/>${packages}${packageUnitEN}----------${quantity}PCS`;
      
      case 'packing':
        // 装箱单格式：序号)型号 + 件数单位------数量PCS @每包数量
        const perPackage = packages > 0 ? Math.round(quantity / packages) : 0;
        return `${index + 1})${model}<br/>${packages}${packageUnitEN}----------${quantity}PCS @${perPackage}PCS`;
      
      default:
        // 标准格式：序号) 型号 + 包装信息
        let desc = `${index + 1}) ${model}`;
        if (packing) {
          desc += `<br/>${packing}`;
        }
        return desc;
    }
  }

  /**
   * 渲染汇总行
   */
  renderFooter(config, calc, items) {
    const footerConfig = config.footerConfig;
    const style = config.rowStyle;
    
    // 计算总件数和总数量
    const totalPackages = items.reduce((sum, item) => sum + Number(item.packages || 0), 0);
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    
    // 确保 totalAmount 是数字（编辑模式下 calc.totalAmount 可能是占位符字符串）
    let totalAmount = calc.totalAmount;
    if (typeof totalAmount !== 'number' || isNaN(totalAmount)) {
      totalAmount = items.reduce((sum, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || item.price || 0);
        return sum + (qty * price);
      }, 0);
    }

    // 获取汇总行的包装单位
    const units = items.map(it => it.unit || '').filter(u => u);
    const uniqueUnits = [...new Set(units)];
    let packageUnitEN = 'PACKAGES';
    if (uniqueUnits.length === 1) {
      const unit = uniqueUnits[0];
      if (unit === '托盘') packageUnitEN = totalPackages > 1 ? 'PALLETS' : 'PALLET';
      else if (unit === '捆包') packageUnitEN = totalPackages > 1 ? 'SACKS' : 'SACK';
      else if (unit === '件') packageUnitEN = totalPackages > 1 ? 'BALES' : 'BALE';
    }

    let html = '<tfoot>';
    
    // 汇总行1：总件数和数量
    html += '<tr>';
    let colIndex = 0;
    config.columns.forEach((col, idx) => {
      let cellContent = '';
      let colspan = 1;
      
      if (idx === footerConfig.labelColumn) {
        // 标签列
        colspan = footerConfig.labelColspan || 1;
        cellContent = `${totalPackages}${packageUnitEN}----------${totalQuantity}PCS`;
        html += `<td colspan="${colspan}" style="
          border: 1px solid ${style.borderColor};
          padding: 6px 8px;
          font-size: ${style.fontSize}pt;
        ">${cellContent}</td>`;
        colIndex += colspan;
        return;
      }
      
      if (idx < footerConfig.labelColumn + (footerConfig.labelColspan || 1) && idx > footerConfig.labelColumn) {
        // 被colspan合并的列，跳过
        return;
      }

      if (idx === footerConfig.totalAmountColumn && footerConfig.showTotalAmount) {
        cellContent = `USD${Number(totalAmount).toFixed(2)}`;
      }

      html += `<td style="
        border: 1px solid ${style.borderColor};
        padding: 6px 8px;
        text-align: ${col.align || 'right'};
        font-size: ${style.fontSize}pt;
        font-weight: bold;
      ">${cellContent}</td>`;
      colIndex++;
    });
    html += '</tr>';

    // 汇总行2：总计标签和金额（可选）
    if (footerConfig.label) {
      html += '<tr>';
      html += `<td colspan="${config.columns.length - 1}" style="
        border: 1px solid ${style.borderColor};
        padding: 6px 8px;
        text-align: right;
        font-size: ${style.fontSize}pt;
        font-weight: bold;
      ">${footerConfig.label}</td>`;
      html += `<td style="
        border: 1px solid ${style.borderColor};
        padding: 6px 8px;
        text-align: right;
        font-size: ${style.fontSize}pt;
        font-weight: bold;
      ">USD${Number(totalAmount).toFixed(2)}</td>`;
      html += '</tr>';
    }

    html += '</tfoot>';
    return html;
  }

  static getPropertyDefinitions() {
    return [
      {
        name: 'columns',
        label: '表格列配置',
        type: 'columns-editor',
        description: '配置表格的列定义'
      },
      {
        name: 'showHeader',
        label: '显示表头',
        type: 'boolean'
      },
      {
        name: 'headerStyle.background',
        label: '表头背景色',
        type: 'color'
      },
      {
        name: 'showFooter',
        label: '显示汇总行',
        type: 'boolean'
      },
      {
        name: 'footerConfig.label',
        label: '汇总标签',
        type: 'text'
      },
      {
        name: 'showProductCategory',
        label: '显示产品类别',
        type: 'boolean'
      },
      {
        name: 'productCategory',
        label: '产品类别名称',
        type: 'text'
      },
      {
        name: 'descriptionFormat',
        label: '描述格式',
        type: 'select',
        options: [
          { value: 'standard', label: '标准格式' },
          { value: 'detailed', label: '详细格式' },
          { value: 'compact', label: '紧凑格式' },
          { value: 'invoice', label: '发票格式' },
          { value: 'packing', label: '装箱单格式' }
        ]
      }
    ];
  }
}

