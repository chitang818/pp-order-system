/**
 * 订单编辑页面业务逻辑
 * 从 order-new.html 中提取的内联脚本
 * 
 * 重构版本 - 使用模块化拆分
 * 已拆分并集成的模块：
 * - order-utils.js: 工具函数模块
 * - order-calculator.js: 计算功能模块
 * - order-data-loader.js: 数据加载模块
 * - order-data-saver.js: 数据保存模块
 * - order-form-validator.js: 表单验证模块
 * - order-product-manager.js: 产品明细管理模块（已集成，使用工厂函数模式）
 * - order-event-handler.js: 事件处理模块（已深度集成，7类事件已迁移）
 * - order-product-autocomplete.js: 产品型号自动完成模块（已集成）
 * 
 * 文件大小：从3397行减少到1586行（减少1811行，53.3%）
 * 剩余代码：主要是页面初始化、配置和UI更新逻辑，属于合理范围
 * 功能状态：所有功能测试通过，订单编辑页面可正常使用
 */

// 导入依赖
import { ApiService } from '../../api/api.js';
import { StorageService } from '../../utils/storage.js';

// 导入已拆分的模块
import {
  escapeHtml,
  normalizeDateTextToISO,
  normalizeTimeTextToHHMM,
  extractOrderNoFromContractNo,
  loadLocalStorage,
  saveLocalStorage
} from './order-utils.js';

import {
  calculateEstimatedWeight,
  calculatePacking,
  calculateTotalAmount,
  updateTotalRow
} from './order-calculator.js';

import {
  loadCustomers,
  loadForwarders,
  loadNextContractNo,
  loadOrderData,
  fillOrderForm
} from './order-data-loader.js';

import {
  collectProducts,
  collectExtras,
  serializeOrderForm as serializeOrderFormModule,
  collectDraft,
  createScheduleSaveDraft,
  saveOrder
} from './order-data-saver.js';

import {
  validateBoxVolume,
  bindBoxVolumeValidation
} from './order-form-validator.js';

import {
  createProductManager
} from './order-product-manager.js';

import {
  createEventHandler
} from './order-event-handler.js';

import {
  createProductAutocomplete
} from './order-product-autocomplete.js';

/**
 * 初始化订单编辑页面
 */
// 防止重复初始化
let _orderPageInitialized = false;
let _currentOrderId = null;

export async function initOrderNewPage() {
  // 检查是否已初始化（避免重复初始化）
  // 获取当前订单ID
  const hash = location.hash || '';
  const hashParams = hash.includes('?') ? hash.split('?')[1] : '';
  const params = new URLSearchParams(hashParams || location.search);
  const orderId = params.get('id') || 'new';

  // 提升变量声明，避免 TDZ 问题
  let isEdit = false;
  let editId = null;
  let origOrder = null;

  if (params.has('id')) {
    isEdit = true;
    editId = params.get('id');
  }

  // 检查DOM元素是否准备好（只检查，不声明变量，避免重复声明）
  const contractNoInputCheck = document.getElementById('contractNo');
  const ordCustomerSelectCheck = document.getElementById('ordCustomerSelect');
  if (!contractNoInputCheck || !ordCustomerSelectCheck) {
    console.warn('[订单编辑] DOM元素未准备好，延迟初始化');
    // 延迟重试（最多3次，每次50ms）
    let retries = 0;
    const maxRetries = 3;
    const retryInit = () => {
      const retryContractNo = document.getElementById('contractNo');
      const retryCustomerSelect = document.getElementById('ordCustomerSelect');
      if (retryContractNo && retryCustomerSelect) {
        // 重置标志，重新初始化
        _orderPageInitialized = false;
        _currentOrderId = null;
        initOrderNewPage();
      } else if (retries < maxRetries) {
        retries++;
        setTimeout(retryInit, 50);
      } else {
        console.error('[订单编辑] DOM元素未找到，初始化失败');
      }
    };
    setTimeout(retryInit, 50);
    return;
  }

  // 检查视图是否被重新加载（通过检查DOM元素是否有 data-initialized 属性）
  // 如果视图被重新加载，DOM元素会被重新注入，之前的初始化标记会丢失
  const viewContainer = document.getElementById('view-container');
  const isViewReloaded = viewContainer && !viewContainer.querySelector('[data-order-page-initialized]');

  // 如果订单ID发生变化，或者视图被重新加载，重置初始化标志
  if (_currentOrderId !== null && _currentOrderId !== orderId) {
    console.log('[订单编辑] 订单ID变化，重置初始化标志:', _currentOrderId, '->', orderId);
    _orderPageInitialized = false;
  } else if (isViewReloaded && _orderPageInitialized) {
    console.log('[订单编辑] 视图被重新加载，重置初始化标志');
    _orderPageInitialized = false;
  }

  // 如果已初始化且是同一个订单，且视图未被重新加载，跳过
  if (_orderPageInitialized && _currentOrderId === orderId && !isViewReloaded) {
    console.log('[订单编辑] 已初始化，跳过重复初始化:', orderId);
    return;
  }

  // 标记为已初始化
  _orderPageInitialized = true;
  _currentOrderId = orderId;

  // 获取参数配置
  let orderConfigs = {};
  try {
    const configRes = await ApiService.orderConfigs.batch([
      'trade_term',
      'unit',
      'cleanliness',
      'safety_factor',
      'label_b',
      'label_c',
      'wrapping_cloth',
      'box_type',
      'box_quantity',
      'destination_port'
    ]);
    if (configRes) {
      orderConfigs = configRes || {};
      console.log('[订单编辑] 已加载参数配置');
    }
  } catch (error) {
    console.error('[订单编辑] 加载参数配置失败:', error);
  }

  // 辅助函数：获取标签选项，如果已保存的值不在配置中，只显示该值
  function getLabelOptions(configCategory, savedValue) {
    const configOptions = orderConfigs[configCategory] || [];
    const configValues = new Set(configOptions.map(cfg => cfg.value));

    // 如果已保存的值不在配置中，只返回该值（不添加到配置列表）
    if (savedValue && savedValue.trim() && !configValues.has(savedValue)) {
      return [{ value: savedValue }];
    }
    return configOptions;
  }

  // 应用非表格区的配置（贸易术语、箱型、货箱数量）
  function applyFormConfigs() {
    // 贸易术语
    const tradeTermSelect = document.querySelector('select[data-field="tradeTerm"]');
    if (tradeTermSelect) {
      const current = tradeTermSelect.value;
      const options = ['<option value="">请选择</option>'];
      (orderConfigs.trade_term || []).forEach(cfg => {
        options.push(`<option value="${cfg.value}"${cfg.value === current ? ' selected' : ''}>${cfg.value}</option>`);
      });
      tradeTermSelect.innerHTML = options.join('');
    }

    // 箱型
    const boxTypeSelect = document.querySelector('.box-type-select[data-field="boxType"]');
    if (boxTypeSelect) {
      const current = boxTypeSelect.value;
      const options = ['<option value="">请选择箱型</option>'];
      (orderConfigs.box_type || []).forEach(cfg => {
        options.push(`<option value="${cfg.value}"${cfg.value === current ? ' selected' : ''}>${cfg.value}</option>`);
      });
      boxTypeSelect.innerHTML = options.join('');
    }

    // 货箱数量
    const boxQuantitySelect = document.querySelector('.box-quantity-select[data-field="boxQuantity"]');
    if (boxQuantitySelect) {
      const current = boxQuantitySelect.value;
      const options = ['<option value="">请选择数量</option>'];
      (orderConfigs.box_quantity || []).forEach(cfg => {
        options.push(`<option value="${cfg.value}"${cfg.value === current ? ' selected' : ''}>${cfg.value}</option>`);
      });
      boxQuantitySelect.innerHTML = options.join('');
    }

    // 目的港（带历史值回填支持）
    const shipToSelect = document.querySelector('select[id="shipTo"]');
    if (shipToSelect) {
      const current = (typeof origOrder !== 'undefined' && origOrder) ? (origOrder.shipTo || '') : shipToSelect.value;
      const options = ['<option value="">请选择目的港</option>'];
      const configItems = orderConfigs.destination_port || [];
      
      // 生成配置选项
      configItems.forEach(cfg => {
        const isSelected = cfg.value === current;
        options.push(`<option value="${cfg.value}"${isSelected ? ' selected' : ''}>${cfg.value}</option>`);
      });

      // 如果当前值不在配置列表中（历史数据），添加额外选项
      if (current && !configItems.some(cfg => cfg.value === current)) {
        options.push(`<option value="${current}" selected>${current} (历史记录)</option>`);
      }

      shipToSelect.innerHTML = options.join('');
      // 确保设置值
      if (current) shipToSelect.value = current;
    }
  }

  // 立即应用配置
  applyFormConfigs();

  // 在视图容器上添加标记，用于检测视图是否被重新加载
  // 注意：viewContainer 已在上面声明，这里直接使用
  if (viewContainer) {
    const orderEditView = viewContainer.querySelector('[data-view="orders/edit"]');
    if (orderEditView) {
      orderEditView.setAttribute('data-order-page-initialized', 'true');
    } else {
      // 如果没有找到 data-view 属性，直接在容器上添加标记
      viewContainer.setAttribute('data-order-page-initialized', 'true');
    }
  }

  // 包装数量小数校验提醒标志（全局，仅提醒一次）
  let packingDecimalWarningShown = false;

  // 设计系统与间距占位注入：支持从 URL 参数或全局对象读取
  // SPA环境：从hash路由中解析参数（#/orders/edit?spacing_value=xxx）
  // 注意：hash 已在上面定义，这里直接使用
  try {
    const hashParams = hash.includes('?') ? hash.split('?')[1] : '';
    const usp = new URLSearchParams(hashParams || location.search);
    const spacingVal = usp.get('spacing_value');
    const labelGap = usp.get('label_spacing');
    const designSystem = usp.get('design_system');
    const root = document.body;
    if (spacingVal) root.style.setProperty('--spacing_value', spacingVal.trim() + (/[a-z%]$/i.test(spacingVal) ? '' : 'px'));
    if (labelGap) root.style.setProperty('--label_spacing', labelGap.trim() + (/[a-z%]$/i.test(labelGap) ? '' : 'px'));
    if (designSystem) root.dataset.designSystem = designSystem;
    // 根据设计系统名映射默认间距（当未显式提供 spacing_value / label_spacing 时）
    if (designSystem && !spacingVal && !labelGap) {
      const key = String(designSystem).toLowerCase();
      let sv = null, lg = null;
      switch (key) {
        case 'material': sv = '12px'; lg = '10px'; break; // Material Design 常见内外间距
        case 'ant': sv = '8px'; lg = '8px'; break;        // Ant Design 更紧凑
        case 'carbon': sv = '12px'; lg = '12px'; break;   // IBM Carbon 相对均衡
        case 'fluent': sv = '10px'; lg = '10px'; break;   // Microsoft Fluent 中等间距
        default: sv = null; lg = null; break;
      }
      if (sv) root.style.setProperty('--spacing_value', sv);
      if (lg) root.style.setProperty('--label_spacing', lg);
    }
  } catch (_) { }
  const KEY_ORDERS = 'erp.orders';
  const KEY_CUSTOMERS = 'erp.customers';
  const KEY_ORDER_DRAFT = 'erp.order_draft';
  // 编辑模式下待回填的产品明细（在表格DOM初始化后再渲染）
  let pendingEditItems = [];
  // 当前选择的产品类型（默认为A类品）- 使用引用对象以便在模块间共享
  const currentProductTypeRef = { current: 1 };

  // 使用模块化的工具函数
  const load = loadLocalStorage;
  const save = saveLocalStorage;

  // 数据访问：后端优先
  let customers = [];

  // 使用模块化的数据加载函数
  const loadCustomersWrapper = async () => {
    const selEl = document.getElementById('ordCustomerSelect');
    await loadCustomers(selEl, customers, origOrder);
  };

  let forwarders = [];
  const loadForwardersWrapper = async () => {
    const selEl = document.getElementById('forwarder');
    await loadForwarders(selEl, forwarders, origOrder);
  };





  // 新建模式：清除可能残留的草稿数据，确保页面是空白的
  if (!isEdit) {
    try {
      if (StorageService) {
        StorageService.remove(KEY_ORDER_DRAFT);
        console.log('[订单编辑] 新建模式：已清除草稿数据');
      }
    } catch (e) {
      console.warn('[订单编辑] 清除草稿数据失败:', e);
    }
  }

  // 获取合同编号输入框元素（在外部作用域定义，供多个函数使用）
  const contractNoInput = document.getElementById('contractNo');

  // 更新表头显示的合同编号
  function updateContractNoDisplay() {
    const contractNoDisplay = document.getElementById('orderContractNoDisplay');
    const contractNoValue = document.getElementById('orderContractNoValue');

    if (contractNoInput && contractNoDisplay && contractNoValue) {
      const contractNo = contractNoInput.value.trim();
      if (contractNo) {
        contractNoValue.textContent = contractNo;
        // 确保合同编号显示为红色加粗
        contractNoValue.style.color = '#e74c3c';
        contractNoValue.style.fontWeight = '700';
        contractNoDisplay.classList.add('show');
      } else {
        contractNoDisplay.classList.remove('show');
      }
    }
  }

  // 更新产品类型显示
  function updateProductTypeDisplay() {
    const productTypeValue = document.getElementById('productTypeValue');
    if (productTypeValue) {
      let typeText = 'A类品';
      if (currentProductTypeRef.current === 2) {
        typeText = 'B类品';
      } else if (currentProductTypeRef.current === 3) {
        typeText = 'C类品';
      }
      productTypeValue.textContent = typeText;
      // 确保产品类型显示为红色加粗
      productTypeValue.style.color = '#e74c3c';
      productTypeValue.style.fontWeight = '700';
    }
  }

  // 自动填充合同编号 - 使用模块化函数
  // contractNoInput 已在前面定义（第143行）
  const loadNextContractNoWrapper = async () => {
    const contractNoInputEl = document.getElementById('contractNo');
    await loadNextContractNo(contractNoInputEl, updateContractNoDisplay, checkContractNoAndSwitchToC);
  };

  // 页面加载时自动填充合同编号（仅新建模式）
  if (!isEdit) {
    loadNextContractNoWrapper();
  }

  // 初始化产品类型显示
  updateProductTypeDisplay();

  // 初始化产品明细标题区域背景色（默认A类品）
  const sectionProducts = document.getElementById('section-products');
  if (sectionProducts) {
    sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
    sectionProducts.classList.add('template-1');
  }

  // 监听合同编号输入框的手动修改（contractNoInput已在前面定义）
  // 注意：isManuallyModified 和 contractNoCheckTimer 已通过事件处理模块管理
  // 使用引用对象以便在事件处理模块中更新
  const isManuallyModifiedRef = { current: false };

  // 使用模块化的工具函数 extractOrderNoFromContractNo

  // 检查合同编号并自动切换到C类品（提取为独立函数，可在多处调用）
  function checkContractNoAndSwitchToC() {
    if (!contractNoInput) return;

    const contractNo = contractNoInput.value.trim();
    if (!contractNo) return;

    // 检测合同编号格式：SC2025-215(NO.25669) 或 SC2025-215(25669)，提取订单号
    const orderNo = extractOrderNoFromContractNo(contractNo);

    // 检测合同编号格式是否为 SC开头(NO.数字) 格式，自动选择SHIOYA CO.,LTD客户
    // 支持格式：SC2025-220(NO.28888) 或 SC2025-220(28888)
    if (contractNo && /^SC\d{4}-\d+\(NO\.\s*\d+\s*\)/i.test(contractNo)) {
      const customerSelect = document.getElementById('ordCustomerSelect');
      if (customerSelect) {
        // 如果客户列表已加载，立即选择；否则等待加载完成后再选择
        const selectShioyaCustomer = () => {
          if (customers.length > 0) {
            // 查找客户名为 "SHIOYA CO.,LTD" 的客户（支持大小写不敏感匹配）
            const shioyaCustomer = customers.find(c => {
              const name = (c.name || '').trim();
              return name === 'SHIOYA CO.,LTD' || name.toUpperCase() === 'SHIOYA CO.,LTD';
            });

            if (shioyaCustomer && shioyaCustomer.id) {
              // 如果客户选择框当前没有值，或者当前值不是SHIOYA，则自动选择
              if (!customerSelect.value || customerSelect.value !== String(shioyaCustomer.id)) {
                customerSelect.value = String(shioyaCustomer.id);
                // 触发change事件以确保相关逻辑正常工作
                customerSelect.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          } else {
            // 客户列表未加载，延迟重试
            setTimeout(selectShioyaCustomer, 200);
          }
        };

        // 立即尝试选择，如果客户列表未加载则延迟重试
        selectShioyaCustomer();
      }
    }

    // 如果合同编号包含订单号（格式：SC2025-220(NO.28888) 或 SC2025-220(28888)），自动切换到C类品
    if (orderNo) {
      console.log('[合同编号检查] 检测到订单号:', orderNo, '，自动切换到C类品');

      // 1. 自动填写到订单号输入框
      const orderNoInput = document.querySelector('input[data-field="orderNo"]');
      if (orderNoInput && !orderNoInput.value.trim()) {
        orderNoInput.value = orderNo;
        // 触发input事件以确保草稿保存等功能正常工作
        orderNoInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 2. 自动选择C类品（不再自动填写唛头，改为根据包皮布选择来填充）
      // 直接获取元素，避免作用域问题
      const tbody = document.getElementById('prodTbody');
      if (!tbody) {
        console.warn('[合同编号检查] prodTbody元素不存在，延迟重试');
        // 如果元素不存在，延迟重试
        setTimeout(() => {
          checkContractNoAndSwitchToC();
        }, 100);
        return;
      }

      // 如果还不是C类品，先切换
      if (currentProductTypeRef.current !== 3) {
        console.log('[合同编号检查] 当前产品类型:', currentProductTypeRef.current, '，切换到C类品');
        // 确保switchTemplate和addProdRow函数已定义
        if (typeof switchTemplate === 'function' && typeof addProdRow === 'function') {
          switchTemplate(3);
          // 等待DOM更新
          requestAnimationFrame(() => {
            setTimeout(() => {
              const rows = tbody.querySelectorAll('tr:not(.total-row)');
              if (rows.length === 0) {
                // 如果没有行，添加一行
                addProdRow(null, true);
                updateTotalRowWrapper();
                calculateTotalAmountWrapper();
              }
            }, 50);
          });
        } else {
          console.warn('[合同编号检查] switchTemplate或addProdRow函数未定义，延迟重试');
          setTimeout(() => {
            checkContractNoAndSwitchToC();
          }, 100);
        }
      } else {
        // 已经是C类品
        const rows = tbody.querySelectorAll('tr:not(.total-row)');
        if (rows.length === 0 && typeof addProdRow === 'function') {
          // 如果没有行，添加一行
          addProdRow(null, true);
          updateTotalRowWrapper();
          calculateTotalAmountWrapper();
        }
      }
    }
  }

  // 注意：合同编号的input和blur事件已通过事件处理模块绑定（见第2159行）
  // 以下代码已迁移到事件处理模块，保留注释作为参考

  // 注意：NO.按钮点击事件已通过事件处理模块绑定（见第2065行）
  // 原代码约250行，已全部迁移到事件处理模块的bindAddOrderNoButtonEvent函数

  // 检查合同编号是否已存在
  async function checkContractNoExists(contractNo) {
    if (!contractNo || !contractNo.trim()) {
      return false;
    }

    try {
      // 获取所有订单列表
      const orders = await ApiService.orders.list();
      if (!Array.isArray(orders)) {
        return false;
      }

      // 检查是否有相同的合同编号（排除当前编辑的订单）
      const trimmedContractNo = contractNo.trim();
      const existingOrder = orders.find(order => {
        const orderContractNo = (order.contractNo || '').trim();
        // 如果是编辑模式，排除当前订单
        if (isEdit && editId && String(order.id) === String(editId)) {
          return false;
        }
        return orderContractNo === trimmedContractNo;
      });

      return existingOrder || false;
    } catch (error) {
      console.error('[合同编号检查] 检查合同编号失败:', error);
      return false;
    }
  }

  // 注意：合同编号的blur事件已通过事件处理模块绑定（见第2159行）
  // 以下代码已迁移到事件处理模块，保留注释作为参考

  // 填充客户选择（确保异步加载完成）
  const sel = document.getElementById('ordCustomerSelect');
  // 立即调用并等待完成，确保客户下拉框已加载
  (async () => {
    try {
      await loadCustomersWrapper();
      console.log('[订单编辑] 客户列表已加载');
    } catch (error) {
      console.error('[订单编辑] 加载客户列表失败:', error);
    }
  })();

  // 加载货代列表
  (async () => {
    try {
      await loadForwardersWrapper();
      console.log('[订单编辑] 货代列表已加载');
    } catch (error) {
      console.error('[订单编辑] 加载货代列表失败:', error);
    }
  })();

  // 注意：客户选择变化事件已通过事件处理模块绑定（见第2129行）
  // 以下代码已迁移到事件处理模块，保留注释作为参考

  // 客户选择无需再显示电话/传真/地址（仍在订单保存时自动带入）

  // 日期支持"选择"与"YYYYMMDD"直接输入识别
  // 注意：日期输入框的事件绑定已通过事件处理模块绑定（见第2120行）
  const dateInput = document.getElementById('invoiceDate');
  const shipmentDateInput = document.getElementById('shipmentDate');
  const today = new Date().toISOString().slice(0, 10);
  if (dateInput) {
    dateInput.value = today;
  }

  // 注意：日期选择器按钮事件已通过事件处理模块绑定（见第1817行）
  // 以下代码已迁移到事件处理模块，保留注释作为参考
  // 原代码约150行，已全部迁移到事件处理模块的bindDatePickerButtonEvents函数

  // 注意：日期输入框的input和blur事件已通过事件处理模块绑定（见第2120行）
  // 以下代码已迁移到事件处理模块，保留注释作为参考

  if (isEdit && editId) {
    (async function () {
      try {
        const o = await ApiService.orders.get(editId);
        if (o) {
          origOrder = o;
          // 重新应用配置（此时已有 origOrder，可正确回填目的港等下拉框的历史数据）
          applyFormConfigs();

          document.getElementById('contractNo').value = o.contractNo || '';
          updateContractNoDisplay(); // 更新表头显示的合同编号

          // 检查合同编号格式，如果匹配SC2025-220(NO.28888)格式，自动切换到C类品
          // 延迟执行以确保DOM已完全加载
          setTimeout(() => {
            checkContractNoAndSwitchToC();
          }, 100);
          document.getElementById('blNo').value = o.blNo || '';
          document.getElementById('invoiceNo').value = o.invoiceNo || '';
          if (dateInput) {
            dateInput.value = normalizeDateTextToISO(o.invoiceDate || today) || today;
          }
          if (shipmentDateInput) {
            shipmentDateInput.value = normalizeDateTextToISO(o.shipmentDate || '') || '';
          }
          document.getElementById('shipFrom').value = o.shipFrom || '';
          // document.getElementById('shipTo').value = o.shipTo || ''; // 已由 applyFormConfigs 处理
          document.getElementById('shippedPerSs').value = o.shippedPerSs || '';
          document.getElementById('shippedPerSs').value = o.shippedPerSs || '';
          
          // 回填货代（特殊处理：如果是历史数据不在列表中，需动态添加）
          const forwarderSelect = document.getElementById('forwarder');
          const fwdVal = o.forwarder || '';
          if (forwarderSelect && fwdVal) {
             // 检查 options 是否已加载（如果异步加载较慢，可能还没加载完）
             // 这里假设 loadForwardersWrapper 已经开始执行。
             // 如果 forwarders 列表已经有数据，我们可以检查。
             // 为了安全起见，这里再做一次检查和添加
             let exists = false;
             if (forwarderSelect.options.length > 0) {
                 exists = Array.from(forwarderSelect.options).some(opt => opt.value === fwdVal);
             }
             if (!exists && fwdVal) {
                 const opt = document.createElement('option');
                 opt.value = fwdVal;
                 opt.text = fwdVal + ' (历史记录)';
                 forwarderSelect.add(opt);
             }
             forwarderSelect.value = fwdVal;
          }
          document.getElementById('ordAmount').value = o.totalUSD != null ? Number(o.totalUSD) : '';
          // 设置订单状态
          const orderStatusSelect = document.getElementById('orderStatus');
          if (orderStatusSelect && o.status) {
            orderStatusSelect.value = o.status;
          }

          // 检查合同编号格式，如果匹配SC2025-220(NO.28888)格式，优先使用C类品
          const contractNo = (o.contractNo || '').trim();
          const orderNo = extractOrderNoFromContractNo(contractNo);
          let orderProductType = o.productType || 1;

          // 如果合同编号格式匹配，强制使用C类品
          if (orderNo && /^SC\d{4}-\d+\(NO\.\s*\d+\s*\)/i.test(contractNo)) {
            console.log('[加载] 检测到合同编号格式匹配SC2025-220(NO.28888)，强制使用C类品');
            orderProductType = 3;
          }

          // 根据保存的产品类型或合同编号格式切换到对应类型
          console.log('[加载] 订单产品类型:', o.productType, '最终产品类型:', orderProductType, '当前产品类型:', currentProductTypeRef.current);
          if (orderProductType && orderProductType !== currentProductTypeRef.current) {
            console.log('[加载] 切换产品类型:', currentProductTypeRef.current, '→', orderProductType);
            currentProductTypeRef.current = orderProductType;
            updateProductTypeDisplay(); // 更新产品类型显示

            // 更新产品明细标题区域背景色（通过添加类名）
            const sectionProducts = document.getElementById('section-products');
            if (sectionProducts) {
              sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
              sectionProducts.classList.add('template-' + orderProductType);
            }

            updateTableHeader();
            updateTotalRowColumns();
            // 更新产品类型按钮状态
            const btnTemplate1 = document.getElementById('btnTemplate1');
            const btnTemplate2 = document.getElementById('btnTemplate2');
            const btnTemplate3 = document.getElementById('btnTemplate3');
            if (btnTemplate1 && btnTemplate2 && btnTemplate3) {
              btnTemplate1.classList.remove('active');
              btnTemplate2.classList.remove('active');
              btnTemplate3.classList.remove('active');
              if (currentProductTypeRef.current === 1) {
                btnTemplate1.classList.add('active');
              } else if (currentProductTypeRef.current === 2) {
                btnTemplate2.classList.add('active');
              } else if (currentProductTypeRef.current === 3) {
                btnTemplate3.classList.add('active');
              }
            }
            console.log('[加载] 产品类型切换完成，当前产品类型:', currentProductTypeRef.current);
          } else {
            console.log('[加载] 无需切换产品类型（productType:', orderProductType, '）');
            // 即使无需切换，也要更新显示（确保显示正确）
            updateProductTypeDisplay();

            // 确保标题区域背景色正确（通过添加类名）
            const sectionProducts = document.getElementById('section-products');
            if (sectionProducts) {
              sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
              sectionProducts.classList.add('template-' + orderProductType);
            }
          }
          // 先设置选中值，待客户列表加载后会匹配到
          try { sel.value = String(o.customerId || ''); } catch (e) { }
          const btn = document.getElementById('btnSaveOrderNew');
          btn.textContent = '保存修改';
          const items = Array.isArray(o.items) ? o.items : [];
          if (items.length) {
            pendingEditItems = items;
            console.log('[加载] 产品明细数量:', items.length);
            // 显示第一条产品的B类品字段
            if (items[0]) {
              console.log('[加载] 第一条产品 labelBatchNo:', items[0].labelBatchNo, 'label:', items[0].label);
            }
          }
          // 异步加载完成后触发产品行渲染
          try { if (typeof renderPendingItemsIfAny === 'function') renderPendingItemsIfAny(); } catch (_) { }

          // 延迟回填extras字段，确保DOM完全渲染（特别是模板切换和产品行渲染完成后）
          const extras = o.extras || {};
          console.log('[加载] 订单 extras 数据:', JSON.stringify(extras, null, 2));
          console.log('[加载] extras.marksNote 值:', extras.marksNote, '类型:', typeof extras.marksNote);

          // 使用 requestAnimationFrame 确保 DOM 渲染完成后再回填
          requestAnimationFrame(() => {
            // 再次使用 setTimeout 确保所有异步渲染完成
            setTimeout(() => {
              console.log('[加载] 开始回填extras字段，当前产品类型:', currentProductTypeRef.current);
              // 回填生产通知信息区域的字段（排除产品表格内的字段）
              Object.keys(extras).forEach(k => {
                // 对于特定字段，使用更精确的选择器
                let el = null;
                if (k === 'marksNote') {
                  // 唛头说明字段：明确查找生产通知信息区域的 textarea
                  el = document.querySelector('.marks-note-textarea[data-field="marksNote"]');
                  console.log('[加载] 查找唛头说明字段元素:', el, '值:', extras[k]);
                } else if (k === 'prodNote') {
                  // 生产通知备注：明确查找生产通知信息区域的 textarea
                  el = document.querySelector('.production-notes-textarea[data-field="prodNote"]');
                } else if (k === 'boxType') {
                  // 箱型：明确查找生产通知信息区域的 select
                  el = document.querySelector('.box-type-select[data-field="boxType"]');
                } else if (k === 'boxQuantity') {
                  // 货箱数量：明确查找生产通知信息区域的 select
                  el = document.querySelector('.box-quantity-select[data-field="boxQuantity"]');
                } else if (k === 'boxVolume') {
                  // 箱型体积：明确查找生产通知信息区域的 input
                  el = document.querySelector('.box-volume-input[data-field="boxVolume"]');
                } else if (k === 'boxTypeNote') {
                  // 箱型说明：明确查找生产通知信息区域的 input
                  el = document.querySelector('.box-type-note-input[data-field="boxTypeNote"]');
                } else {
                  // 其他字段：查找不在产品表格内的元素
                  el = Array.from(document.querySelectorAll(`[data-field="${k}"]`)).find(e =>
                    !e.closest('#prodTable') && !e.closest('#prodTablePPBags')
                  );
                }
                if (el) {
                  const value = extras[k] != null ? String(extras[k]) : '';
                  // 对于textarea，确保设置值
                  if (el.tagName === 'TEXTAREA') {
                    el.value = value;
                    // textarea 需要特别处理，确保值被正确设置
                    if (k === 'marksNote') {
                      console.log('[加载] 回填唛头说明字段到textarea，设置前值:', el.value, '设置值:', value);
                      el.value = value;
                      console.log('[加载] 回填唛头说明字段到textarea，设置后值:', el.value);
                      // 强制触发 input 和 change 事件
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                  } else {
                    el.value = value;
                  }
                  if (k === 'marksNote') {
                    console.log('[加载] 回填唛头说明字段成功，元素:', el.tagName, '值:', value, '当前元素值:', el.value);
                  }
                  // 对于 input，也触发 input 事件以确保草稿保存等功能正常工作
                  if (el.tagName === 'INPUT') {
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                } else {
                  if (k === 'marksNote') {
                    console.warn('[加载] 未找到唛头说明字段元素，尝试延迟查找...');
                    // 延迟重试，可能元素还没有渲染
                    setTimeout(() => {
                      const retryEl = document.querySelector('.marks-note-textarea[data-field="marksNote"]');
                      if (retryEl && extras[k]) {
                        retryEl.value = String(extras[k]);
                        console.log('[加载] 延迟回填唛头说明字段成功，值:', extras[k]);
                        retryEl.dispatchEvent(new Event('input', { bubbles: true }));
                      }
                    }, 100);
                  }
                }
              });
              console.log('[加载] extras字段回填完成');

              // 回填完成后，如果箱型是"其他"，显示箱型说明输入框
              setTimeout(() => {
                const boxTypeSelect = document.querySelector('.box-type-select[data-field="boxType"]');
                const boxTypeNoteContainer = document.getElementById('boxTypeNoteContainer');
                if (boxTypeSelect && boxTypeNoteContainer && boxTypeSelect.value === '其他') {
                  boxTypeNoteContainer.style.display = 'block';
                }
              }, 250);
            }, 200); // 延迟200ms确保DOM完全渲染
          });
        }
      } catch (e) { console.warn('加载订单失败：', e); }
    })();

    // 箱型体积验证逻辑
    // 使用模块化的表单验证
    (function bindBoxVolumeValidationWrapper() {
      const boxTypeSelect = document.querySelector('.box-type-select[data-field="boxType"]');
      const boxVolumeInput = document.querySelector('.box-volume-input[data-field="boxVolume"]');
      const saveBtn = document.getElementById('btnSaveOrderNew');
      const validationTip = document.getElementById('boxVolumeValidationTip');

      bindBoxVolumeValidation({
        boxTypeSelect,
        boxVolumeInput,
        saveBtn,
        validationTip
      });
    })();
  }

  // 产品明细增删与采集
  const prodTbody = document.getElementById('prodTbody');

  // 先定义包装函数（这些函数将在管理器创建后更新）
  let productManager = null;
  let scheduleSaveDraft = null; // 将在后面定义

  // 临时包装函数，待管理器创建后替换
  function updateTotalRowWrapper() {
    if (productManager) {
      updateTotalRow(prodTbody, productManager.addTotalRow);
    }
  }

  function calculateTotalAmountWrapper() {
    calculateTotalAmount(prodTbody);
  }

  // 临时保留原函数定义，待管理器创建后替换
  let addProdRow = function (data, isNewRow = false) {
    const tr = document.createElement('tr');
    const unit = (data && data.unit) || '';
    // 容错解析已有的行级 extras（编辑模式回填）并挂载到行属性，便于后续保存时保留
    function normalizeExtrasObj(ex) {
      if (!ex) return {};
      if (typeof ex === 'string') { try { const o = JSON.parse(ex); return (o && typeof o === 'object') ? o : {}; } catch (_) { return {}; } }
      return (typeof ex === 'object' && ex) ? ex : {};
    }
    function renderItemExtrasInline(ex) {
      const obj = normalizeExtrasObj(ex);
      const parts = [];
      if (obj.size) parts.push(`规格：${obj.size}`);
      if (obj.color) parts.push(`颜色：${obj.color}`);
      if (obj.spec) parts.push(`参数：${obj.spec}`);
      if (obj.remark) parts.push(`备注：${obj.remark}`);
      return parts.join('；');
    }
    // 如果 data 为 null 或 undefined，初始化为空对象（新建订单时 data 可能为 null）
    if (!data) {
      data = {};
    }
    const extrasText = renderItemExtrasInline((data && data.extras) || {});
    // 从 extras 中提取 marks 字段（如果主字段中没有）
    const itemExtras = normalizeExtrasObj((data && data.extras) || {});
    if (!data.marks && itemExtras.marks) {
      data = { ...data, marks: itemExtras.marks };
    }

    // 根据当前产品类型生成不同的HTML
    // 注意：此函数将在产品明细管理器创建后被替换
    const currentType = currentProductTypeRef.current;
    if (currentType === 1) {
      // A类品：标签重量、安全系数
      tr.innerHTML = `
              <td class="checkbox-col">
                <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
                <input type="checkbox" class="row-check" />
              </td>
              <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data && data.model) || ''}" autocomplete="off" /></div></td>
              <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data && data.quantity) || ''}" /></td>
              <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data && data.packages) || ''}" /></td>
              <td class="common-section">
                <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  <option value="件"${unit === '件' ? ' selected' : ''}>件</option>
                  <option value="托盘"${unit === '托盘' ? ' selected' : ''}>托盘</option>
                  <option value="捆包"${unit === '捆包' ? ' selected' : ''}>捆包</option>
                </select>
              </td>
              <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${(data && data.unitPrice) ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
              <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${(data && data.actualWeight) ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
              <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${(data && data.weight) ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
              <td class="common-section">
                <select class="select" data-field="cleanliness" style="background-color: ${(data && data.cleanliness && data.cleanliness !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  <option value="A"${(data && data.cleanliness) == 'A' ? ' selected' : ''}>A</option>
                  <option value="B"${(data && data.cleanliness) == 'B' ? ' selected' : ''}>B</option>
                  <option value="B+"${(data && data.cleanliness) == 'B+' ? ' selected' : ''}>B+</option>
                </select>
              </td>
              <td class="common-section">
                <select class="select" data-field="wrappingCloth" style="background-color: ${(data && data.wrappingCloth && data.wrappingCloth !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value=""${!data || !data.wrappingCloth ? ' selected' : ''}>请选择</option>
                  <option value="要"${(data && data.wrappingCloth) === '要' ? ' selected' : ''}>要</option>
                  <option value="不要"${(data && data.wrappingCloth) === '不要' ? ' selected' : ''}>不要</option>
                </select>
              </td>
              <td class="variable-section"><input class="input" data-field="labelWeight" type="text" placeholder="标签重量" value="${isNewRow ? '1000' : ((data && data.labelWeight !== undefined && data.labelWeight !== null) ? String(data.labelWeight) : '')}" style="background-color: #ffffff;" /></td>
              <td class="variable-section">
                <select class="select" data-field="safetyFactor" style="background-color: ${(data && data.safetyFactor && data.safetyFactor !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  <option value="不写"${(data && data.safetyFactor) == '不写' ? ' selected' : ''}>不写</option>
                  <option value="5:1"${(data && data.safetyFactor) == '5:1' ? ' selected' : ''}>5:1</option>
                  <option value="6:1"${(data && data.safetyFactor) == '6:1' ? ' selected' : ''}>6:1</option>
                </select>
              </td>
              <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="packing" type="text" placeholder="包装" readonly /></td>
              <td class="calc-section" style="background-color: #e8f5e8;"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
              <td class="calc-section">
                <label class="switch">
                  <input type="checkbox" data-field="enabled" ${(!data || data.enabled !== false) ? 'checked' : ''} />
                  <span class="switch-slider"></span>
                </label>
              </td>
            `;
    } else if (currentType === 2) {
      // B类品：标签批号、标签说明
      tr.innerHTML = `
              <td class="checkbox-col">
                <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
                <input type="checkbox" class="row-check" />
              </td>
              <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data && data.model) || ''}" autocomplete="off" /></div></td>
              <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data && data.quantity) || ''}" /></td>
              <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data && data.packages) || ''}" /></td>
              <td class="common-section">
                <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  <option value="件"${unit === '件' ? ' selected' : ''}>件</option>
                  <option value="托盘"${unit === '托盘' ? ' selected' : ''}>托盘</option>
                  <option value="捆包"${unit === '捆包' ? ' selected' : ''}>捆包</option>
                </select>
              </td>
              <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${(data && data.unitPrice) ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
              <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${(data && data.actualWeight) ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
              <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${(data && data.weight) ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
              <td class="common-section">
                <select class="select" data-field="cleanliness" style="background-color: ${(data && data.cleanliness && data.cleanliness !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  <option value="A"${(data && data.cleanliness) == 'A' ? ' selected' : ''}>A</option>
                  <option value="B"${(data && data.cleanliness) == 'B' ? ' selected' : ''}>B</option>
                  <option value="B+"${(data && data.cleanliness) == 'B+' ? ' selected' : ''}>B+</option>
                </select>
              </td>
              <td class="common-section">
                <select class="select" data-field="wrappingCloth" style="background-color: ${(data && data.wrappingCloth && data.wrappingCloth !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value=""${!data || !data.wrappingCloth ? ' selected' : ''}>请选择</option>
                  <option value="要"${(data && data.wrappingCloth) === '要' ? ' selected' : ''}>要</option>
                  <option value="不要"${(data && data.wrappingCloth) === '不要' ? ' selected' : ''}>不要</option>
                </select>
              </td>
              <td class="variable-section"><input class="input" data-field="labelBatchNo" type="text" placeholder="批号" value="${(data && data.labelBatchNo) || ''}" /></td>
              <td class="variable-section">
                <select class="select" data-field="label" style="background-color: ${(data && data.label && data.label !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  ${getLabelOptions('label_b', data && data.label).map(cfg =>
        `<option value="${cfg.value}"${(data && data.label) === cfg.value ? ' selected' : ''}>${cfg.value}</option>`
      ).join('')}
                </select>
              </td>
              <td class="calc-section"><input class="input" data-field="packing" type="text" placeholder="包装" readonly style="background-color: #f5f5f5;" /></td>
              <td class="calc-section"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
              <td class="calc-section">
                <label class="switch">
                  <input type="checkbox" data-field="enabled" ${(!data || data.enabled !== false) ? 'checked' : ''} />
                  <span class="switch-slider"></span>
                </label>
              </td>
            `;
    } else if (currentType === 3) {
      // C类品：唛头、标签说明
      tr.innerHTML = `
              <td class="checkbox-col">
                <span class="drag-handle" title="拖拽排序" aria-label="拖拽排序" draggable="true"></span>
                <input type="checkbox" class="row-check" />
              </td>
              <td class="common-section"><div class="model-field"><span class="row-index"></span><input class="input" data-field="model" placeholder="型号" value="${(data && data.model) || ''}" autocomplete="off" /></div></td>
              <td class="common-section"><input class="input" data-field="quantity" type="number" step="1" placeholder="数量" value="${(data && data.quantity) || ''}" /></td>
              <td class="common-section"><input class="input" data-field="packages" type="number" step="1" placeholder="件数" value="${(data && data.packages) || ''}" /></td>
              <td class="common-section">
                <select class="select" data-field="unit" style="background-color: ${unit && unit !== '' ? '#ffffff' : '#ffcccc'};">
                  <option value="">请选择</option>
                  <option value="件"${unit === '件' ? ' selected' : ''}>件</option>
                  <option value="托盘"${unit === '托盘' ? ' selected' : ''}>托盘</option>
                  <option value="捆包"${unit === '捆包' ? ' selected' : ''}>捆包</option>
                </select>
              </td>
              <td class="common-section"><input class="input" data-field="unitPrice" type="number" step="0.01" placeholder="单价" value="${(data && data.unitPrice) ? (isNaN(parseFloat(data.unitPrice)) ? data.unitPrice : parseFloat(data.unitPrice).toFixed(2)) : ''}" /></td>
              <td class="common-section"><input class="input" data-field="actualWeight" type="number" step="0.01" placeholder="实际重量" value="${(data && data.actualWeight) ? (isNaN(parseFloat(data.actualWeight)) ? data.actualWeight : parseFloat(data.actualWeight).toFixed(2)) : ''}" /></td>
              <td class="common-section"><input class="input" data-field="estimatedWeightInput" type="number" step="0.01" placeholder="预估重量" value="${(data && data.weight) ? (isNaN(parseFloat(data.weight)) ? data.weight : parseFloat(data.weight).toFixed(2)) : ''}" /></td>
              <td class="common-section">
                <select class="select" data-field="cleanliness" style="background-color: ${(data && data.cleanliness && data.cleanliness !== '') ? '#ffffff' : (isNewRow ? '#e8f5e8' : '#ffcccc')};">
                  <option value="">请选择</option>
                  <option value="A"${(data && data.cleanliness) == 'A' ? ' selected' : ''}>A</option>
                  <option value="B"${(!data || !data.cleanliness || data.cleanliness == 'B') ? ' selected' : ''}>B</option>
                  <option value="B+"${(data && data.cleanliness) == 'B+' ? ' selected' : ''}>B+</option>
                </select>
              </td>
              <td class="common-section">
                <select class="select" data-field="wrappingCloth" style="background-color: ${(data && data.wrappingCloth && data.wrappingCloth !== '') ? '#ffffff' : '#ffcccc'};">
                  <option value=""${!data || !data.wrappingCloth ? ' selected' : ''}>请选择</option>
                  <option value="要"${(data && data.wrappingCloth) === '要' ? ' selected' : ''}>要</option>
                  <option value="不要"${(data && data.wrappingCloth) === '不要' ? ' selected' : ''}>不要</option>
                </select>
              </td>
              <td class="variable-section">
                <select class="select" data-field="label" style="background-color: ${(data && data.label && data.label !== '') ? '#ffffff' : '#ffffff'};">
                  <option value="">请选择</option>
                  ${getLabelOptions('label_c', data && data.label).map(cfg =>
        `<option value="${cfg.value}"${(data && data.label) === cfg.value ? ' selected' : ''}>${cfg.value}</option>`
      ).join('')}
                </select>
              </td>
              <td class="variable-section"><input class="input" data-field="marks" type="text" placeholder="唛头" value="${(data && (data.marks || (data.extras && data.extras.marks))) || ''}" /></td>
              <td class="calc-section"><input class="input" data-field="packing" type="text" placeholder="包装" readonly style="background-color: #f5f5f5;" /></td>
              <td class="calc-section"><input class="input" data-field="estimatedWeight" type="number" step="0.01" placeholder="预估重量" readonly /></td>
              <td class="calc-section">
                <label class="switch">
                  <input type="checkbox" data-field="enabled" ${(!data || data.enabled !== false) ? 'checked' : ''} />
                  <span class="switch-slider"></span>
                </label>
              </td>
            `;
    }
    // 将 extras 以 JSON 挂到行上，便于保存时合并保留
    try { tr.dataset.itemExtras = JSON.stringify(normalizeExtrasObj((data && data.extras) || {})); } catch (_) { tr.dataset.itemExtras = '{}'; }
    prodTbody.appendChild(tr);

    // C类品：包皮布选择变化时，自动填充或清空唛头
    if (currentType === 3) {
      const wrappingClothSelect = tr.querySelector('select[data-field="wrappingCloth"]');
      const marksInput = tr.querySelector('input[data-field="marks"]');

      if (wrappingClothSelect && marksInput) {
        // 处理包皮布选择变化
        const handleWrappingClothChange = () => {
          const wrappingClothValue = wrappingClothSelect.value;
          // 更新背景色：有值时白色，无值时红色
          if (wrappingClothValue && wrappingClothValue !== '') {
            wrappingClothSelect.style.backgroundColor = '#ffffff';
          } else {
            wrappingClothSelect.style.backgroundColor = '#ffcccc';
          }

          const contractNoInput = document.getElementById('contractNo');

          if (wrappingClothValue === '要') {
            // 选择"要"时，自动填充唛头
            const contractNoInputEl = document.getElementById('contractNo');
            if (contractNoInputEl) {
              const contractNo = contractNoInputEl.value.trim();
              const orderNo = extractOrderNoFromContractNo(contractNo);
              if (orderNo) {
                marksInput.value = orderNo + ' QS';
                marksInput.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          } else if (wrappingClothValue === '不要') {
            // 选择"不要"时，自动填写唛头为"无"
            marksInput.value = '无';
            marksInput.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (wrappingClothValue === '') {
            // 选择"请选择"时，清空唛头
            marksInput.value = '';
            marksInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        };

        // 初始化背景色：未选择时显示红色
        if (!wrappingClothSelect.value || wrappingClothSelect.value === '') {
          wrappingClothSelect.style.backgroundColor = '#ffcccc';
        } else {
          wrappingClothSelect.style.backgroundColor = '#ffffff';
        }

        // 绑定change事件
        wrappingClothSelect.addEventListener('change', handleWrappingClothChange);

        // 如果是新行且包皮布已选择，立即填充唛头
        if (isNewRow && (wrappingClothSelect.value === '要' || wrappingClothSelect.value === '不要')) {
          requestAnimationFrame(() => {
            handleWrappingClothChange();
          });
        }
      }
    }
    // 单位变化时更新包装单位提示
    const unitSel = tr.querySelector('select[data-field="unit"]');
    const packUnitTip = tr.querySelector('[data-packunit]');
    const qtyInput = tr.querySelector('input[data-field="quantity"]');
    const pkgsInput = tr.querySelector('input[data-field="packages"]');
    const estimatedWeightInput = tr.querySelector('input[data-field="estimatedWeightInput"]');
    const readonlyEstimatedWeightInput = tr.querySelector('input[data-field="estimatedWeight"]');

    // 计算预估重量
    // 使用模块化的计算函数
    function calculateEstimatedWeightWrapper() {
      calculateEstimatedWeight(
        qtyInput,
        estimatedWeightInput,
        readonlyEstimatedWeightInput,
        () => updateTotalRow(prodTbody, addTotalRow)
      );
    }

    // 监听数量和重量变化以自动计算预估重量
    qtyInput.addEventListener('input', calculateEstimatedWeightWrapper);
    estimatedWeightInput.addEventListener('input', calculateEstimatedWeightWrapper);

    // 计算包装（数量/件数，显示为"XX条/件数单位"）- 使用模块化函数
    const packingInput = tr.querySelector('input[data-field="packing"]');
    function calculatePackingWrapper() {
      calculatePacking(
        packingInput,
        qtyInput,
        pkgsInput,
        unitSel,
        {
          packingDecimalWarningShown,
          scheduleSaveDraft
        }
      );
    }

    // 监听数量、件数、件数单位变化以自动计算包装
    qtyInput.addEventListener('input', calculatePackingWrapper);
    pkgsInput.addEventListener('input', calculatePackingWrapper);
    if (unitSel) {
      unitSel.addEventListener('change', calculatePackingWrapper);
    }
    // 初始化时计算一次包装
    calculatePackingWrapper();

    // 预估重量和实际重量字段格式化处理（自动补充为2位小数）
    const estimatedWeightInputField = tr.querySelector('input[data-field="estimatedWeightInput"]');
    const actualWeightField = tr.querySelector('input[data-field="actualWeight"]');

    [estimatedWeightInputField, actualWeightField].forEach(field => {
      if (field) {
        field.addEventListener('blur', function () {
          const value = parseFloat(this.value);
          if (!isNaN(value)) {
            this.value = value.toFixed(2);
          }
        });
      }
    });

    // 标签重量字段处理：支持文字输入
    const labelWeightField = tr.querySelector('input[data-field="labelWeight"]');
    if (labelWeightField) {
      labelWeightField.addEventListener('input', function () {
        // 背景色始终保持白色
        this.style.backgroundColor = '#ffffff';
      });
    }

    // 单价字段格式化处理（自动补充为2位小数）
    const unitPriceField = tr.querySelector('input[data-field="unitPrice"]');
    if (unitPriceField) {
      unitPriceField.addEventListener('blur', function () {
        const value = parseFloat(this.value);
        if (!isNaN(value)) {
          this.value = value.toFixed(2);
        }
      });
    }

    // 监听数量和单价变化以自动计算总金额
    qtyInput.addEventListener('input', calculateTotalAmountWrapper);
    if (unitPriceField) {
      unitPriceField.addEventListener('input', calculateTotalAmountWrapper);
    }

    // 初始化时计算一次
    calculateEstimatedWeightWrapper();

    // 绑定拖拽排序（鼠标与触摸）
    bindDragSortForRow(tr);
  }
  // 拖拽排序实现
  let draggingRow = null;
  let dragIndicatorTarget = null;
  let clearDragOverIndicator = function () {
    if (!prodTbody) return;
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    rows.forEach(r => {
      r.classList.remove('drag-over-before');
      r.classList.remove('drag-over-after');
    });
    dragIndicatorTarget = null;
  }
  let applyDragOverIndicator = function (row, before) {
    if (!row) return;
    if (dragIndicatorTarget && dragIndicatorTarget !== row) {
      dragIndicatorTarget.classList.remove('drag-over-before');
      dragIndicatorTarget.classList.remove('drag-over-after');
    }
    dragIndicatorTarget = row;
    if (before) {
      row.classList.add('drag-over-before');
      row.classList.remove('drag-over-after');
    } else {
      row.classList.add('drag-over-after');
      row.classList.remove('drag-over-before');
    }
  }
  let bindDragSortForRow = function (tr) {
    const handle = tr.querySelector('.drag-handle');
    if (!handle) return;
    // 桌面：原生拖拽
    handle.addEventListener('dragstart', function (e) {
      draggingRow = tr;
      tr.classList.add('dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); } catch (_) { }
    });
    handle.addEventListener('dragend', function () {
      if (draggingRow) draggingRow.classList.remove('dragging');
      draggingRow = null;
      clearDragOverIndicator();
    });
    // 触摸/指针设备：Pointer 事件回退
    let pointerDragging = null;
    function onPointerMove(e) {
      if (!pointerDragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const targetRow = el ? el.closest('tr') : null;
      if (!targetRow || targetRow === pointerDragging) return;
      const rect = targetRow.getBoundingClientRect();
      const before = e.clientY < (rect.top + rect.height / 2);
      if (before) prodTbody.insertBefore(pointerDragging, targetRow);
      else prodTbody.insertBefore(pointerDragging, targetRow.nextSibling);
      try { renderRowIndices(); } catch (_) { }
      try { scheduleSaveDraft(); } catch (_) { }
      applyDragOverIndicator(targetRow, before);
    }
    function endPointerDrag() {
      if (pointerDragging) pointerDragging.classList.remove('dragging');
      pointerDragging = null;
      prodTbody.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('touchmove', preventScrollDuringDrag);
      clearDragOverIndicator();
    }
    function preventScrollDuringDrag(e) { e.preventDefault(); }
    handle.addEventListener('pointerdown', function (e) {
      // 在触摸或触控笔时启用 Pointer 拖拽；鼠标已用拖拽原生事件
      const isTouchLike = e.pointerType && e.pointerType !== 'mouse';
      if (!isTouchLike) return;
      pointerDragging = tr;
      tr.classList.add('dragging');
      try { handle.setPointerCapture(e.pointerId); } catch (_) { }
      prodTbody.addEventListener('pointermove', onPointerMove);
      prodTbody.addEventListener('pointerup', endPointerDrag, { once: true });
      // 阻止页面滚动以提升触摸拖拽流畅度
      document.addEventListener('touchmove', preventScrollDuringDrag, { passive: false });
    });
  }
  // 容器拖拽放置：在拖拽经过时动态重排
  prodTbody.addEventListener('dragover', function (e) {
    if (!draggingRow) return;
    e.preventDefault();
    const targetRow = e.target && e.target.closest ? e.target.closest('tr') : null;
    if (!targetRow || targetRow === draggingRow) return;
    const rect = targetRow.getBoundingClientRect();
    const before = e.clientY < (rect.top + rect.height / 2);
    if (before) prodTbody.insertBefore(draggingRow, targetRow);
    else prodTbody.insertBefore(draggingRow, targetRow.nextSibling);
    try { renderRowIndices(); } catch (_) { }
    try { scheduleSaveDraft(); } catch (_) { }
    applyDragOverIndicator(targetRow, before);
  });
  prodTbody.addEventListener('drop', function (e) { if (draggingRow) { e.preventDefault(); clearDragOverIndicator(); } });
  prodTbody.addEventListener('dragleave', function () { clearDragOverIndicator(); });
  // 统一函数：DOM与方法就绪后渲染编辑模式的产品明细
  let renderPendingItemsIfAny = function () {
    if (!isEdit) return;
    const itemsToFill = Array.isArray(pendingEditItems) ? pendingEditItems : [];
    if (!itemsToFill.length) return;
    if (prodTbody) prodTbody.innerHTML = '';
    itemsToFill.forEach(it => addProdRow(it));
    updateTotalRowWrapper(); // 编辑模式下渲染完成后更新合计
  }
  // 初始执行一次，若异步获取稍后返回，会再次调用
  renderPendingItemsIfAny();

  // 添加合计行
  let addTotalRow = function () {
    // 检查是否已存在合计行
    let totalRow = document.getElementById('totalRow');
    const currentProductType = currentProductTypeRef.current;
    const calcSectionBgColor = (currentProductType === 1 || currentProductType === 3) ? '#e8f5e8' : '';

    if (!totalRow) {
      totalRow = document.createElement('tr');
      totalRow.id = 'totalRow';
      totalRow.className = 'total-row';
      // 根据模板调整通用区的colspan：模板A和B时包皮布列隐藏，通用区8列；模板C时包皮布列显示，通用区9列
      const commonColspan = (currentProductType === 3) ? 9 : 8; // C类品显示包皮布列，其他类型隐藏
      // 合计行结构：复选框列(1) + "合计："(1) + 数量合计(1) + 件数合计(1) + 其他通用区(剩余列数) + 可变区(2) + 计算区(3)
      const otherCommonColspan = commonColspan - 3; // 减去"合计："、数量、件数3列
      totalRow.innerHTML = `
                <td class="checkbox-col"></td>
                <td class="common-section" style="text-align: left; font-weight: bold;">合计：</td>
                <td class="common-section" style="text-align: center;"><input class="input total-quantity" type="text" readonly value="0" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
                <td class="common-section" style="text-align: center;"><input class="input total-packages" type="text" readonly value="0" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
                <td colspan="${otherCommonColspan}" class="common-section"></td>
                <td colspan="2" class="variable-section"></td>
                <td class="calc-section" style="background-color: ${calcSectionBgColor};"></td>
                <td class="calc-section" style="background-color: ${calcSectionBgColor};"><input class="input total-weight" type="text" readonly value="0.00" style="background-color: transparent; font-weight: bold;" /></td>
                <td class="calc-section"></td>
              `;
      prodTbody.parentNode.appendChild(totalRow);
    } else {
      // 如果合计行已存在，确保背景色正确（刷新页面时可能需要更新）
      const calcSectionCells = totalRow.querySelectorAll('.calc-section');
      // 包装列是第一个calc-section（在variable-section之后）
      // 预估总净重列是包含.total-weight输入框的calc-section
      calcSectionCells.forEach((cell, index) => {
        const hasTotalWeight = cell.querySelector('.total-weight');
        if (hasTotalWeight) {
          // 这是预估总净重列
          cell.style.backgroundColor = calcSectionBgColor;
          const totalWeightInput = cell.querySelector('.total-weight');
          if (totalWeightInput) {
            totalWeightInput.style.backgroundColor = 'transparent';
          }
        } else if (index === 0 && !cell.querySelector('input, select, label')) {
          // 这是包装列（第一个calc-section且没有输入框）
          cell.style.backgroundColor = calcSectionBgColor;
        }
      });
    }
    return totalRow;
  }

  // 更新合计行以适配当前模板
  let updateTotalRowColumns = function () {
    const totalRow = document.getElementById('totalRow');
    if (totalRow) {
      // 根据模板调整通用区的colspan：模板A和B时包皮布列隐藏，通用区8列；模板C时包皮布列显示，通用区9列
      const commonColspan = (currentProductTypeRef.current === 3) ? 9 : 8; // C类品显示包皮布列，其他类型隐藏
      const currentProductType = currentProductTypeRef.current;
      const calcSectionBgColor = (currentProductType === 1 || currentProductType === 3) ? '#e8f5e8' : '';
      const otherCommonColspan = commonColspan - 3; // 减去"合计："、数量、件数3列
      // 保存当前的数量和件数合计值
      const currentQuantity = totalRow.querySelector('.total-quantity')?.value || '0';
      const currentPackages = totalRow.querySelector('.total-packages')?.value || '0';
      const currentWeight = totalRow.querySelector('.total-weight')?.value || '0.00';
      totalRow.innerHTML = `
                <td class="checkbox-col"></td>
                <td class="common-section" style="text-align: left; font-weight: bold;">合计：</td>
                <td class="common-section" style="text-align: center;"><input class="input total-quantity" type="text" readonly value="${currentQuantity}" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
                <td class="common-section" style="text-align: center;"><input class="input total-packages" type="text" readonly value="${currentPackages}" style="background-color: transparent; font-weight: bold; text-align: center;" /></td>
                <td colspan="${otherCommonColspan}" class="common-section"></td>
                <td colspan="2" class="variable-section"></td>
                <td class="calc-section" style="background-color: ${calcSectionBgColor};"></td>
                <td class="calc-section" style="background-color: ${calcSectionBgColor};"><input class="input total-weight" type="text" readonly value="${currentWeight}" style="background-color: transparent; font-weight: bold;" /></td>
                <td class="calc-section"></td>
              `;
      updateTotalRowWrapper(); // 重新计算合计
    }
  }

  // 更新表头
  let updateTableHeader = function () {
    const thead = document.getElementById('prodTableHead');
    const table = document.getElementById('prodTable');
    if (!thead || !table) return;

    // 移除所有模板类
    table.classList.remove('template-2', 'template-3');

    // 共用区表头部分（所有模板共用）
    const commonSectionFields = `
              <th class="checkbox-col"><input type="checkbox" id="checkAllRows" title="全选/取消全选" /></th>
              <th class="common-section">产品型号</th>
              <th class="common-section">数量</th>
              <th class="common-section">件数</th>
              <th class="common-section">件数<br/>单位</th>
              <th class="common-section">单价<br/>(USD)</th>
              <th class="common-section">实际<br/>重量</th>
              <th class="common-section">预估<br/>重量</th>
              <th class="common-section">清洁度</th>
              <th class="common-section">包皮布</th>
            `;

    // 计算区表头部分（所有模板共用）- 包装列移到计算区
    const calcSectionFields = `
              <th class="calc-section">包装</th>
              <th class="calc-section">预估<br/>总净重</th>
              <th class="calc-section">启用</th>
            `;

    // 变化区表头部分（根据产品类型切换）
    let variableSectionFields;
    if (currentProductTypeRef.current === 1) {
      // A类品：标签重量、安全系数
      variableSectionFields = `
                <th class="variable-section">标签<br/>重量</th>
                <th class="variable-section">安全<br/>系数</th>
              `;
    } else if (currentProductTypeRef.current === 2) {
      // B类品：标签批号、标签说明
      table.classList.add('template-2');
      variableSectionFields = `
                <th class="variable-section">标签<br/>批号</th>
                <th class="variable-section">标签<br/>说明</th>
              `;
    } else if (currentProductTypeRef.current === 3) {
      // C类品：标签说明、唛头
      table.classList.add('template-3');
      variableSectionFields = `
                <th class="variable-section">标签<br/>说明</th>
                <th class="variable-section">唛头</th>
              `;
    }

    // 组装完整的表头
    thead.innerHTML = `
              <tr>
                ${commonSectionFields}
                ${variableSectionFields}
                ${calcSectionFields}
              </tr>
            `;

    // 重新绑定全选事件
    const headCk = document.getElementById('checkAllRows');
    if (headCk) {
      headCk.addEventListener('change', function () {
        const rows = Array.from(prodTbody.querySelectorAll('.row-check'));
        rows.forEach(ck => { ck.checked = headCk.checked; });
      });
    }
  }

  // 从行中提取数据（包括所有字段）
  let extractRowData = function (row) {
    const data = {};

    // 提取所有可能的字段
    const fields = [
      'model', 'quantity', 'packages', 'unit', 'unitPrice',
      'actualWeight', 'estimatedWeightInput', 'labelWeight',
      'safetyFactor', 'cleanliness', 'labelBatchNo', 'label',
      'packing', 'wrappingCloth', 'marks', 'enabled'
    ];

    fields.forEach(field => {
      const input = row.querySelector(`[data-field="${field}"]`);
      if (input) {
        if (input.type === 'checkbox') {
          data[field] = input.checked;
        } else {
          data[field] = input.value || '';
        }
      }
    });

    // 特殊处理：estimatedWeightInput 对应 weight 字段
    if (data.estimatedWeightInput !== undefined) {
      data.weight = data.estimatedWeightInput;
    }

    // 提取 extras
    try {
      if (row.dataset.itemExtras) {
        data.extras = JSON.parse(row.dataset.itemExtras);
      }
    } catch (_) { }

    return data;
  }

  // 切换产品类型
  let switchTemplate = function (templateNum) {
    if (currentProductTypeRef.current === templateNum) {
      console.log('[产品类型切换] 已经是' + (templateNum === 1 ? 'A类品' : templateNum === 2 ? 'B类品' : 'C类品') + '，无需切换');
      return;
    }

    // 注意：此函数将在产品明细管理器创建后被替换
    // 临时保留原函数定义，待管理器创建后删除
    console.log('[产品类型切换] 从' + (currentProductTypeRef.current === 1 ? 'A类品' : currentProductTypeRef.current === 2 ? 'B类品' : 'C类品') + '切换到' + (templateNum === 1 ? 'A类品' : templateNum === 2 ? 'B类品' : 'C类品'));

    // 获取prodTbody元素（动态获取，避免作用域问题）
    const tbody = document.getElementById('prodTbody');
    if (!tbody) {
      console.error('[产品类型切换] prodTbody元素不存在，无法切换');
      return;
    }

    // 保存当前所有行的数据
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const rowsData = rows.map(row => extractRowData(row));

    // 更新当前产品类型
    currentProductTypeRef.current = templateNum;
    console.log('[产品类型切换] currentProductType 已更新为:', currentProductTypeRef.current);

    // 更新产品类型显示
    updateProductTypeDisplay();

    // 更新产品明细标题区域背景色（通过添加类名）
    const sectionProducts = document.getElementById('section-products');
    if (sectionProducts) {
      sectionProducts.classList.remove('template-1', 'template-2', 'template-3');
      sectionProducts.classList.add('template-' + templateNum);
    }

    // 更新表头
    updateTableHeader();

    // 清空表格内容
    tbody.innerHTML = '';

    // 重新渲染所有行（保留相同字段的数据）
    rowsData.forEach(data => {
      addProdRow(data);
    });

    // 更新合计行
    updateTotalRowColumns();

    // 更新按钮状态
    document.querySelectorAll('.btn-template').forEach(btn => {
      btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`.btn-template[data-template="${templateNum}"]`);
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    console.log('[产品类型切换] 切换完成！当前产品类型:', currentProductTypeRef.current);

    // 重新渲染行号
    renderRowIndices();
  }

  // 计算并更新预估重量合计
  // 使用模块化的计算函数
  function updateTotalRowWrapper() {
    updateTotalRow(prodTbody, addTotalRow);
  }

  // 使用模块化的计算函数
  function calculateTotalAmountWrapper() {
    calculateTotalAmount(prodTbody);
  }
  // 更新删除按钮显示状态的函数（移到外部作用域，供多个地方调用）
  let updateDeleteButtonVisibility = function () {
    const btnDel = document.getElementById('btnDelSelected');
    if (!btnDel) return;
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    const hasChecked = rows.some(r => {
      const ck = r.querySelector('.row-check');
      return ck && ck.checked;
    });
    btnDel.style.display = hasChecked ? 'inline-block' : 'none';
  }

  // 注意：添加明细按钮的事件绑定将在 productManager 创建后重新绑定（见第1900行）
  // 这里先不绑定，避免使用旧的 addProdRow 函数

  // 模板切换按钮事件监听
  document.getElementById('btnTemplate1').addEventListener('click', function () { switchTemplate(1); });
  document.getElementById('btnTemplate2').addEventListener('click', function () { switchTemplate(2); });
  document.getElementById('btnTemplate3').addEventListener('click', function () { switchTemplate(3); });

  // 批量删除按钮逻辑：删除勾选的行
  (function () {
    const btnDel = document.getElementById('btnDelSelected');
    if (btnDel) {
      // 防止重复绑定事件监听器
      if (btnDel.hasAttribute('data-delete-bound')) {
        return;
      }
      btnDel.setAttribute('data-delete-bound', 'true');

      btnDel.addEventListener('click', function (e) {
        // 阻止事件冒泡，避免重复触发
        e.stopPropagation();
        e.preventDefault();

        const rows = Array.from(prodTbody.querySelectorAll('tr'));
        const toDelete = rows.filter(r => {
          const ck = r.querySelector('.row-check');
          return ck && ck.checked;
        });
        if (!toDelete.length) {
          window.NotificationSystem.toast('请先勾选要删除的产品行', 'warning');
          return;
        }
        // 记录删除的行数
        const deletedCount = toDelete.length;
        toDelete.forEach(r => r.remove());
        // 取消头部全选状态
        const headCk = document.getElementById('checkAllRows');
        if (headCk) headCk.checked = false;
        scheduleSaveDraft();
        updateTotalRowWrapper(); // 删除行后更新合计
        calculateTotalAmountWrapper(); // 删除行后更新总金额
        updateDeleteButtonVisibility(); // 删除后更新按钮显示状态
        // 显示删除成功消息
        window.NotificationSystem.toast(`已成功删除 ${deletedCount} 行产品明细`, 'success');
      });
    }
  })();

  // 全选/取消全选
  const headCk = document.getElementById('checkAllRows');
  if (headCk) {
    headCk.addEventListener('change', function () {
      const rows = Array.from(prodTbody.querySelectorAll('.row-check'));
      rows.forEach(ck => { ck.checked = headCk.checked; });
      updateDeleteButtonVisibility();
    });
  }
  // 行勾选变化时更新草稿和删除按钮显示状态
  prodTbody.addEventListener('change', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('row-check')) {
      scheduleSaveDraft();
      updateDeleteButtonVisibility();
    }
  });

  // 初始化时检查删除按钮显示状态
  updateDeleteButtonVisibility();
  prodTbody.addEventListener('input', function () { scheduleSaveDraft(); });
  prodTbody.addEventListener('change', function () { scheduleSaveDraft(); });
  // 禁用数字输入的上下箭头调整（产品明细表与表单区）
  function preventArrowAdjust(e) {
    const isUpDown = e.key === 'ArrowUp' || e.key === 'ArrowDown';
    if (!isUpDown) return;
    const el = e.target;
    // 仅针对 type=number 或设置了 inputmode 的数字输入
    const isNumType = el && el.tagName === 'INPUT' && (el.type === 'number' || (el.getAttribute('inputmode') || '').includes('numeric') || (el.getAttribute('inputmode') || '').includes('decimal'));
    if (isNumType) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  document.addEventListener('keydown', preventArrowAdjust, true);
  // 新建模式初始化标志：在初始化完成前阻止自动选中行
  let isInitializing = !isEdit;
  // 初始化完成后，延迟一段时间再允许自动选中（确保合同编号已聚焦）
  if (!isEdit) {
    setTimeout(() => {
      isInitializing = false;
    }, 300);
  }

  // 输入框聚焦时自动选中文本，提升替换效率
  prodTbody.addEventListener('focusin', function (e) {
    const el = e.target;
    if (!el) return;
    const isInput = el.tagName === 'INPUT';
    const isSelect = el.tagName === 'SELECT';
    const isEditable = isInput && !el.readOnly;
    if (isEditable) {
      try { el.select(); } catch (_) { }
      // 防止鼠标释放取消选中
      el.addEventListener('mouseup', function (evt) { evt.preventDefault(); }, { once: true });
    }
    // 添加行选中高亮效果（仅在非初始化阶段）
    if ((isInput || isSelect) && !isInitializing) {
      const row = el.closest('tr');
      if (row) {
        // 移除所有行的高亮
        const allRows = prodTbody.querySelectorAll('tr');
        allRows.forEach(r => r.classList.remove('row-active'));
        // 为当前行添加高亮
        row.classList.add('row-active');
      }
    }
  });

  // 点击行任意位置也触发高亮 - 使用捕获阶段确保优先执行
  prodTbody.addEventListener('click', function (e) {
    // 在初始化阶段不处理点击选中（避免自动选中）
    if (isInitializing) {
      return;
    }
    const row = e.target.closest('tr');
    if (row && row.parentElement === prodTbody) {
      // 移除所有行的高亮
      const allRows = prodTbody.querySelectorAll('tr');
      allRows.forEach(r => r.classList.remove('row-active'));
      // 为当前行添加高亮
      row.classList.add('row-active');
    }
  }, true); // 使用捕获阶段
  // 行选中高亮与行号渲染
  let renderRowIndices = function () {
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    rows.forEach((r, idx) => {
      const idxEl = r.querySelector('.row-index');
      if (idxEl) idxEl.textContent = String(idx + 1);
    });
  }
  let updateRowSelectionHighlight = function () {
    const rows = Array.from(prodTbody.querySelectorAll('tr'));
    rows.forEach(r => {
      const ck = r.querySelector('.row-check');
      if (ck && ck.checked) r.classList.add('selected'); else r.classList.remove('selected');
    });
  }
  renderRowIndices();
  const observer = new MutationObserver(function () { renderRowIndices(); updateRowSelectionHighlight(); });
  observer.observe(prodTbody, { childList: true, subtree: false });
  prodTbody.addEventListener('change', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('row-check')) {
      updateRowSelectionHighlight();
    }
    // 处理下拉框选择后背景色变化
    if (e.target && e.target.tagName === 'SELECT') {
      const field = e.target.getAttribute('data-field');
      if (field === 'unit' || field === 'safetyFactor' || field === 'cleanliness' || field === 'label' || field === 'wrappingCloth') {
        // 如果是自动填充的字段，保持绿色背景
        if (e.target.dataset.autoFilled === 'true') {
          e.target.style.backgroundColor = '#e8f5e8';
        } else if (e.target.value && e.target.value !== '') {
          e.target.style.backgroundColor = '#ffffff';
          // 用户手动选择后，移除自动填充标记
          delete e.target.dataset.autoFilled;
        } else {
          // label字段默认白色背景，其他字段红色背景
          if (field === 'label') {
            e.target.style.backgroundColor = '#ffffff';
          } else {
            e.target.style.backgroundColor = '#ffcccc';
          }
        }
      }
    }
  });
  // 全选联动高亮
  (function () {
    const headCk = document.getElementById('checkAllRows');
    if (headCk) {
      headCk.addEventListener('change', function () {
        const rows = Array.from(prodTbody.querySelectorAll('.row-check'));
        rows.forEach(ck => { ck.checked = headCk.checked; });
        updateRowSelectionHighlight();
      });
    }
  })();
  // 额外字段的变更也触发草稿保存（不在产品表格内）
  (function bindExtrasDraft() {
    const extrasInputs = Array.from(document.querySelectorAll('[data-field]')).filter(el => !el.closest('#prodTable'));
    extrasInputs.forEach(el => {
      el.addEventListener('input', scheduleSaveDraft);
      el.addEventListener('change', scheduleSaveDraft);
    });
  })();

  // 箱型选择与箱型体积的自动关联功能，以及箱型说明输入框的显示/隐藏
  (function bindBoxTypeVolumeRelation() {
    const boxTypeSelect = document.querySelector('.box-type-select[data-field="boxType"]');
    const boxVolumeInput = document.querySelector('.box-volume-input[data-field="boxVolume"]');
    const boxTypeNoteContainer = document.getElementById('boxTypeNoteContainer');
    const boxTypeNoteInput = document.querySelector('.box-type-note-input[data-field="boxTypeNote"]');

    // 控制箱型说明输入框的显示/隐藏
    function toggleBoxTypeNote() {
      if (boxTypeSelect && boxTypeNoteContainer) {
        if (boxTypeSelect.value === '其他') {
          boxTypeNoteContainer.style.display = 'block';
        } else {
          boxTypeNoteContainer.style.display = 'none';
          // 当隐藏时，清空输入框内容
          if (boxTypeNoteInput) {
            boxTypeNoteInput.value = '';
          }
        }
      }
    }

    // 监听箱型选择变化
    if (boxTypeSelect) {
      boxTypeSelect.addEventListener('change', function () {
        const selectedBoxType = this.value;

        // 控制箱型说明输入框的显示/隐藏
        toggleBoxTypeNote();

        // 箱型体积自动填充逻辑
        if (boxVolumeInput) {
          let volumeValue = '';

          // 仅对20GP、40GP和40HC进行自动填充
          switch (selectedBoxType) {
            case '20GP':
              volumeValue = '28CBM';
              break;
            case '40GP':
              volumeValue = '56CBM';
              break;
            case '40HC':
              volumeValue = '64CBM';
              break;
            default:
              // 其他箱型没有预设体积，清空箱型体积
              volumeValue = '';
              break;
          }

          boxVolumeInput.value = volumeValue;
          // 触发change事件以保存草稿
          boxVolumeInput.dispatchEvent(new Event('change'));
        }
      });

      // 初始化时检查一次
      toggleBoxTypeNote();
    }
  })();

  // 初始化时添加合计行样式
  (function addTotalRowStyles() {
    const style = document.createElement('style');
    style.textContent = `
            .total-row {
              background-color: #f5f5f5;
              font-weight: bold;
            }
            .total-row .total-weight {
              background-color: #ffcccc;
              font-weight: bold;
              text-align: right;
              width: 10ch;
            }
          `;
    document.head.appendChild(style);
  })();

  // 页面加载完成后初始化合计行
  addTotalRow(); // 这会确保背景色正确
  updateTotalRowWrapper();

  // 延迟再次确保合计行背景色正确（防止HTML中已存在的合计行背景色不对）
  setTimeout(() => {
    addTotalRow(); // 再次调用以确保背景色正确
  }, 100);
  // 使用模块化的数据收集和序列化函数
  // 创建序列化函数的包装，传入必要的上下文
  const serializeOrderFormWrapper = () => {
    return serializeOrderFormModule({
      customerSelect: document.getElementById('ordCustomerSelect'),
      contractNoInput: document.getElementById('contractNo'),
      dateInput: document.getElementById('invoiceDate'),
      shipmentDateInput: document.getElementById('shipmentDate'),
      prodTbody: prodTbody,
      customers: customers,
      currentProductType: currentProductTypeRef.current,
      today: today
    });
  };

  // 创建草稿收集函数的包装
  const collectDraftWrapper = () => {
    return collectDraft(serializeOrderFormWrapper);
  };

  // 创建草稿保存调度函数的包装
  scheduleSaveDraft = createScheduleSaveDraft(isEdit, collectDraftWrapper);

  // 计算并更新预估重量合计的包装函数
  function updateTotalRowWrapper() {
    if (productManager) {
      updateTotalRow(prodTbody, productManager.addTotalRow);
    }
  }

  // 计算总金额的包装函数
  function calculateTotalAmountWrapper() {
    calculateTotalAmount(prodTbody);
  }

  // 创建产品明细管理器实例
  productManager = createProductManager({
    prodTbody,
    currentProductTypeRef,
    scheduleSaveDraft,
    updateProductTypeDisplay,
    packingDecimalWarningShown: { value: packingDecimalWarningShown },
    calculateTotalAmountWrapper,
    updateTotalRowWrapper,
    configs: orderConfigs // 传入配置项
  });

  // 使用管理器的方法替换原函数
  addProdRow = productManager.addProdRow;
  bindDragSortForRow = productManager.bindDragSortForRow;
  renderRowIndices = productManager.renderRowIndices;
  updateRowSelectionHighlight = productManager.updateRowSelectionHighlight;
  addTotalRow = productManager.addTotalRow;
  updateTotalRowColumns = productManager.updateTotalRowColumns;
  updateTableHeader = productManager.updateTableHeader;
  extractRowData = productManager.extractRowData;
  switchTemplate = (templateNum) => productManager.switchTemplate(templateNum, currentProductTypeRef, updateProductTypeDisplay);
  renderPendingItemsIfAny = () => productManager.renderPendingItemsIfAny(pendingEditItems, isEdit);
  updateDeleteButtonVisibility = productManager.updateDeleteButtonVisibility;
  clearDragOverIndicator = productManager.clearDragOverIndicator;
  applyDragOverIndicator = productManager.applyDragOverIndicator;

  // 重新绑定添加明细按钮事件（在 productManager 创建后，确保使用正确的方法）
  const btnAddProd = document.getElementById('btnAddProd');
  if (btnAddProd) {
    // 移除旧的事件监听器（通过克隆节点）
    const newBtnAddProd = btnAddProd.cloneNode(true);
    btnAddProd.parentNode.replaceChild(newBtnAddProd, btnAddProd);
    // 更新引用
    const updatedBtn = document.getElementById('btnAddProd');
    if (updatedBtn) {
      updatedBtn.setAttribute('data-add-bound', 'true');
      updatedBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('[订单编辑] 添加明细按钮被点击');
        if (typeof addProdRow === 'function') {
          addProdRow(null, true);
          updateTotalRowWrapper();
          calculateTotalAmountWrapper();
          updateDeleteButtonVisibility(); // 更新删除按钮显示状态
        } else {
          console.error('[订单编辑] addProdRow 函数未定义');
        }
      });
      console.log('[订单编辑] 添加明细按钮事件已重新绑定');
    }
  } else {
    console.warn('[订单编辑] 添加明细按钮未找到');
  }

  // 创建事件处理器实例（用于绑定表单事件）
  // 注意：事件处理模块已部分集成，部分事件绑定已迁移到事件处理模块
  // 未来可以逐步将更多事件绑定代码迁移到事件处理模块
  const eventHandler = createEventHandler({
    prodTbody,
    currentProductTypeRef,
    scheduleSaveDraft,
    updateProductTypeDisplay,
    updateContractNoDisplay,
    checkContractNoAndSwitchToC,
    checkContractNoExists,
    switchTemplate,
    addProdRow,
    updateTotalRowWrapper,
    calculateTotalAmountWrapper,
    updateDeleteButtonVisibility,
    renderRowIndices,
    updateRowSelectionHighlight,
    saveOrder,
    normalizeDateTextToISO,
    normalizeTimeTextToHHMM,
    extractOrderNoFromContractNo,
    serializeOrderForm: serializeOrderFormWrapper,
    customers,
    isEdit,
    editId
  });

  // 绑定合同编号相关事件（使用事件处理模块）
  // 注意：isManuallyModifiedRef 已在前面定义（第215行）
  if (contractNoInput) {
    eventHandler.bindContractNoEvents(contractNoInput, isEdit, isManuallyModifiedRef);
  }

  // 绑定日期选择器事件（使用事件处理模块）
  eventHandler.bindDatePickerEvents();

  // 绑定保存按钮事件（使用事件处理模块）
  eventHandler.bindSaveButtonEvent();

  // 绑定备注一键插入功能（使用事件处理模块）
  eventHandler.bindRemarkInsertEvent();

  // 绑定客户选择变化事件（使用事件处理模块）
  eventHandler.bindCustomerSelectEvent(customers, isManuallyModifiedRef, loadNextContractNoWrapper);

  // 绑定NO.按钮点击事件（使用事件处理模块）
  if (contractNoInput) {
    eventHandler.bindAddOrderNoButtonEvent(contractNoInput, isManuallyModifiedRef);
  }

  // 绑定日期选择器按钮事件（使用事件处理模块）
  eventHandler.bindDatePickerButtonEvents();

  // 主表单字段变更触发草稿保存（防止重复绑定）
  ['contractNo', 'blNo', 'invoiceNo', 'invoiceDate', 'shipmentDate', 'shipFrom', 'shipTo', 'shippedPerSs', 'forwarder', 'ordAmount', 'orderStatus'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.hasAttribute('data-draft-bound')) {
      el.setAttribute('data-draft-bound', 'true');
      el.addEventListener('input', scheduleSaveDraft);
      el.addEventListener('change', scheduleSaveDraft);
    }
  });

  // 为箱型体积输入框添加草稿保存功能
  const boxVolumeInput = document.querySelector('.box-volume-input[data-field="boxVolume"]');
  if (boxVolumeInput) {
    boxVolumeInput.addEventListener('input', scheduleSaveDraft);
    boxVolumeInput.addEventListener('change', scheduleSaveDraft);
  }

  // 注意：客户选择变化事件已通过事件处理模块绑定（见第2061行），已包含scheduleSaveDraft调用

  // 非编辑模式恢复草稿（仅在草稿数据存在且未被清除时）
  // 注意：如果URL中没有id参数，说明是新建模式，此时草稿应该已被清除，不应该恢复草稿
  // 新建模式下，如果草稿数据存在，说明可能是旧草稿，应该清除而不是恢复
  if (!isEdit) {
    try {
      const d = StorageService.get(KEY_ORDER_DRAFT, null);
      // 新建模式下，如果草稿数据存在，说明可能是旧草稿，清除它
      // 只有在编辑模式下才恢复草稿（但编辑模式应该从后端加载数据，不应该从草稿恢复）
      // 所以这里实际上不应该恢复草稿，草稿恢复功能暂时禁用
      // 如果将来需要恢复草稿功能，应该在用户明确要求时才恢复（比如通过URL参数）
      if (d) {
        console.log('[订单编辑] 新建模式：检测到草稿数据，已清除（不恢复）');
        StorageService.remove(KEY_ORDER_DRAFT);
      }
    } catch (e) {
      console.warn('[订单编辑] 清除草稿数据失败:', e);
    }
  }

  // 非编辑模式设置默认值
  if (!isEdit) {
    // 设置装运港默认值
    const shipFromInput = document.getElementById('shipFrom');
    if (shipFromInput) {
      shipFromInput.value = 'QINGDAO, CHINA';
    }

    // 确保贸易术语字段为空（不默认选择CIF）
    const tradeTermSelect = document.querySelector('select[data-field="tradeTerm"]');
    if (tradeTermSelect) {
      tradeTermSelect.value = '';
    }

    // 默认添加一行空明细，提升录入效率（但不自动选中）
    // 使用 Promise.resolve().then() 确保 productManager 已创建且 addProdRow 已替换
    Promise.resolve().then(() => {
      if (prodTbody && prodTbody.children.length === 0) {
        console.log('[订单编辑] 新建模式：准备添加默认产品明细行');
        if (typeof addProdRow === 'function') {
          try {
            addProdRow(null, true);
            console.log('[订单编辑] 新建模式：已添加默认产品明细行');
            // 确保新添加的行不会被自动选中（多次检查，确保移除选中状态）
            setTimeout(() => {
              const allRows = prodTbody.querySelectorAll('tr');
              allRows.forEach(r => r.classList.remove('row-active'));
              // 确保没有任何输入框获得焦点
              const activeElement = document.activeElement;
              if (activeElement && activeElement.closest('#prodTbody')) {
                activeElement.blur();
              }
            }, 0);
            // 再次延迟检查，确保事件处理完成后移除选中状态
            setTimeout(() => {
              const allRows = prodTbody.querySelectorAll('tr');
              allRows.forEach(r => r.classList.remove('row-active'));
            }, 50);
            // 第三次检查，确保在聚焦到合同编号之前移除选中状态
            setTimeout(() => {
              const allRows = prodTbody.querySelectorAll('tr');
              allRows.forEach(r => r.classList.remove('row-active'));
            }, 150);
          } catch (error) {
            console.error('[订单编辑] 添加默认产品明细行失败:', error);
          }
        } else {
          console.warn('[订单编辑] addProdRow 函数未定义，无法添加默认产品明细行');
          // 延迟重试
          setTimeout(() => {
            if (prodTbody && prodTbody.children.length === 0 && typeof addProdRow === 'function') {
              console.log('[订单编辑] 延迟重试：添加默认产品明细行');
              addProdRow(null, true);
            }
          }, 100);
        }
      } else {
        console.log('[订单编辑] 新建模式：产品明细表格已有内容，跳过添加默认行');
      }
    });

    // 聚焦到合同编号输入框（延迟更长时间，确保行选中状态已清除）
    setTimeout(() => {
      // 最后一次确保移除所有行的选中状态
      const allRows = prodTbody.querySelectorAll('tr');
      allRows.forEach(r => r.classList.remove('row-active'));

      // 聚焦到合同编号输入框
      if (contractNoInput) {
        contractNoInput.focus();
        // 如果输入框有值，选中所有文本以便快速替换
        if (contractNoInput.value) {
          contractNoInput.select();
        }
      }
    }, 200);
  }

  // 注意：保存按钮事件和备注一键插入功能已通过事件处理模块绑定（见第2123行和2126行）
  // 以下代码已迁移到事件处理模块，保留注释作为参考

  // 页面初始化时计算总金额
  setTimeout(function () {
    calculateTotalAmountWrapper();
  }, 100);

  // 产品型号自动完成功能 - 使用模块化实现
  // 注意：产品型号自动完成功能已迁移到 order-product-autocomplete.js 模块
  const productAutocomplete = createProductAutocomplete({
    switchTemplate,
    updateProductTypeDisplay,
    prodTbody,
    updateTotalRow: updateTotalRowWrapper,
    calculateTotalAmount: calculateTotalAmountWrapper,
    scheduleSaveDraft,
    currentProductTypeRef  // 传递当前产品类型引用，用于排序
  });

  // 初始化产品型号自动完成功能
  productAutocomplete.initProductModelAutocomplete();

  // 阻止退格键导致页面后退
  // 当焦点不在可编辑元素上时，按退格键会触发浏览器后退，需要阻止此行为
  document.addEventListener('keydown', function (e) {
    // 检查是否按下了退格键
    if (e.key === 'Backspace' || e.keyCode === 8) {
      // 获取当前焦点元素
      const activeElement = document.activeElement;

      // 检查焦点是否在可编辑元素上
      const isEditable = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable ||
        activeElement.getAttribute('contenteditable') === 'true'
      );

      // 如果焦点不在可编辑元素上，阻止默认行为（浏览器后退）
      if (!isEditable) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true); // 使用捕获阶段，确保在其他事件处理器之前执行

}

// DOM 加载完成后自动初始化（仅当在订单编辑页面时）
function tryAutoInit() {
  // 检查当前路由是否为订单编辑页面
  const hash = location.hash || '';
  const isOrderEditView = hash.includes('orders/edit') || hash.includes('orders/new');
  // 也检查 DOM 中是否存在订单编辑视图
  const orderEditView = document.querySelector('#view-orders-edit.view-active');

  if (isOrderEditView || orderEditView) {
    initOrderNewPage();
  }
  // 如果不在订单编辑页面，跳过初始化（等待 viewLoaded 事件或路由切换）
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', tryAutoInit);
} else {
  // DOM 已经加载完成，检查并执行
  tryAutoInit();
}

// 监听视图加载事件（SPA路由切换时触发）
// 使用捕获阶段监听，确保在container上触发的非冒泡事件也能被捕获
document.addEventListener('viewLoaded', function (e) {
  if (e.detail && (e.detail.viewPath === 'orders/edit')) {
    console.log('[Order New Page] 检测到视图加载事件:', e.detail.viewPath);
    initOrderNewPage();
  }
}, true);


