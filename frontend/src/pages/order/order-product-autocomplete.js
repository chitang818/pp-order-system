/**
 * 订单编辑页面 - 产品型号自动完成模块
 * 负责产品型号输入框的自动完成功能
 * 
 * 使用工厂函数模式，接收依赖并返回绑定函数
 */

import { ApiService } from '../../api/api.js';

/**
 * 创建产品型号自动完成处理器
 * @param {Object} dependencies - 依赖对象
 * @param {HTMLElement} dependencies.prodTbody - 产品明细表格tbody元素
 * @param {Function} dependencies.updateTotalRow - 更新合计行函数
 * @param {Function} dependencies.calculateTotalAmount - 计算总金额函数
 * @param {Function} dependencies.scheduleSaveDraft - 草稿保存调度函数
 * @param {Object} dependencies.currentProductTypeRef - 当前产品类型的引用对象（{current: number}）
 * @returns {Object} 自动完成绑定函数
 */
export function createProductAutocomplete(dependencies) {
  const {
    prodTbody,
    updateTotalRow,
    calculateTotalAmount,
    scheduleSaveDraft,
    currentProductTypeRef,
    switchTemplate,
    updateProductTypeDisplay
  } = dependencies;

  // 产品型号缓存
  let productModelsCache = [];
  let lastFetchTime = 0;
  const CACHE_DURATION = 10 * 60 * 1000; // 延长缓存时间到10分钟
  let searchCache = new Map(); // 搜索结果缓存
  const SEARCH_CACHE_SIZE = 100; // 增加搜索缓存大小到100个结果

  // 预加载产品数据 - 页面加载时预先获取
  let preloadPromise = null;
  function preloadProductModels() {
    if (!preloadPromise) {
      preloadPromise = fetchProductModels();
    }
    return preloadPromise;
  }

  // 获取产品型号列表 - 优化缓存策略和预加载
  async function fetchProductModels() {
    const now = Date.now();
    if (productModelsCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      return productModelsCache;
    }

    try {
      const result = await ApiService.products.list();
      console.log('API返回数据:', result);

      if (Array.isArray(result)) {
        productModelsCache = result.map(p => ({
          model: p.model,
          description: p.description || '',
          estimatedWeight: p.estimatedWeight || null,
          labelWeight: p.labelWeight || null,
          safetyFactor: p.safetyFactor || null,
          cleanliness: p.cleanliness || null,
          unit: p.unit || null,  // 添加件数单位字段
          productType: p.productType || 1,  // 添加产品类型字段（1=A类品，2=B类品，3=C类品）
          labelBatchNo: p.labelBatchNo || null,  // 添加标签批号字段（B类品）
          label: p.label || null  // 添加标签说明字段（B类品和C类品）
        })).filter(item => item.model && item.model.trim());
        lastFetchTime = now;
        console.log('产品型号缓存（包含件数单位）:', productModelsCache);

        // 清空搜索缓存，因为数据已更新
        searchCache.clear();

        return productModelsCache;
      } else {
        console.error('API返回数据格式错误:', result);
        return [];
      }
    } catch (error) {
      console.error('获取产品型号失败:', error);
      return [];
    }
  }

  // 创建自动完成下拉框 - 使用固定定位模态框方式
  function createAutocompleteDropdown(input) {
    // 创建模态背景
    const modal = document.createElement('div');
    modal.className = 'product-autocomplete-modal';

    const dropdown = document.createElement('div');
    dropdown.className = 'product-autocomplete-dropdown';

    // 将模态框和下拉框添加到body
    document.body.appendChild(modal);
    document.body.appendChild(dropdown);

    // 点击模态背景关闭弹窗
    modal.addEventListener('click', () => {
      hideAutocompleteDropdown(dropdown, modal);
    });

    return { modal, dropdown };
  }

  // 过滤匹配的产品型号 - 优化搜索算法和缓存，按当前产品类型排序
  function filterProductModels(query, models) {
    if (!query || !query.trim()) return [];

    // 获取当前产品类型（1=A类品，2=B类品，3=C类品）
    const currentProductType = currentProductTypeRef && currentProductTypeRef.current ? currentProductTypeRef.current : 1;

    // 缓存键包含查询和当前产品类型，确保不同产品类型下的排序结果独立缓存
    const cacheKey = `${query.toLowerCase().trim()}_type${currentProductType}`;

    // 检查搜索缓存
    if (searchCache.has(cacheKey)) {
      return searchCache.get(cacheKey);
    }

    const lowerQuery = query.toLowerCase().trim();

    // 优化搜索算法：使用更高效的过滤和排序
    const exactMatches = [];
    const prefixMatches = [];
    const containsMatches = [];

    // 分类匹配结果
    for (const item of models) {
      const modelLower = item.model.toLowerCase();
      const descLower = item.description ? item.description.toLowerCase() : '';

      if (modelLower === lowerQuery) {
        exactMatches.push(item);
      } else if (modelLower.startsWith(lowerQuery)) {
        prefixMatches.push(item);
      } else if (modelLower.includes(lowerQuery) || descLower.includes(lowerQuery)) {
        containsMatches.push(item);
      }
    }

    // 按当前产品类型排序：当前类型的产品排在最前面
    const sortByProductType = (a, b) => {
      const aType = a.productType || 1;
      const bType = b.productType || 1;

      // 如果一个是当前类型，另一个不是，当前类型排在前面
      if (aType === currentProductType && bType !== currentProductType) return -1;
      if (bType === currentProductType && aType !== currentProductType) return 1;

      // 如果都是当前类型或都不是，保持原有顺序（精确匹配 > 前缀匹配 > 包含匹配）
      return 0;
    };

    // 对每类结果按产品类型排序
    exactMatches.sort(sortByProductType);
    prefixMatches.sort(sortByProductType);
    containsMatches.sort(sortByProductType);

    // 按优先级合并结果，限制每类结果数量
    const results = [];
    results.push(...exactMatches.slice(0, 3));
    results.push(...prefixMatches.slice(0, 4));
    results.push(...containsMatches.slice(0, 3));

    // 最终限制为10个结果，并确保当前产品类型的产品排在最前面
    const finalResults = results.slice(0, 10);

    // 再次排序，确保当前产品类型的产品在最前面（即使已经排序过，也要确保）
    finalResults.sort(sortByProductType);

    // 缓存搜索结果
    if (searchCache.size >= SEARCH_CACHE_SIZE) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }
    searchCache.set(cacheKey, finalResults);

    return finalResults;
  }

  // 隐藏自动完成下拉框
  function hideAutocompleteDropdown(dropdown, modal) {
    dropdown.style.display = 'none';
    modal.style.display = 'none';
  }

  // 清除产品型号关联字段的函数
  function clearRelatedFields(modelInput) {
    try {
      const row = modelInput.closest('tr');
      if (!row) {
        console.warn('无法找到产品行，清空操作终止');
        return false;
      }

      // 获取当前产品类型（1=A类品，2=B类品，3=C类品）
      const currentProductType = currentProductTypeRef && currentProductTypeRef.current ? currentProductTypeRef.current : 1;

      console.log('产品型号已清空，开始清除关联字段...');

      // 定义需要清空的字段配置（所有产品类型通用字段）
      const fieldsConfig = [
        { selector: 'input[data-field="quantity"]', name: '数量', clearValue: '', resetBg: '' },
        { selector: 'input[data-field="packages"]', name: '件数', clearValue: '', resetBg: '' },
        { selector: 'input[data-field="unitPrice"]', name: '单价', clearValue: '', resetBg: '' },
        { selector: 'input[data-field="actualWeight"]', name: '实际重量', clearValue: '', resetBg: '' },
        { selector: 'input[data-field="estimatedWeightInput"]', name: '预估重量', clearValue: '', resetBg: '' },
        { selector: 'input[data-field="packing"]', name: '包装重量', clearValue: '', resetBg: '' },
        { selector: 'input[data-field="labelWeight"]', name: '标签重量', clearValue: '1000', resetBg: '#e8f5e8' },
        { selector: 'select[data-field="unit"]', name: '件数单位', clearValue: '', resetBg: '#ffcccc' },
        { selector: 'select[data-field="safetyFactor"]', name: '安全系数', clearValue: '', resetBg: '#ffcccc' },
        { selector: 'select[data-field="cleanliness"]', name: '清洁度', clearValue: '', resetBg: '#ffcccc' }
      ];

      // B类品特有字段：标签批号、标签说明（select）
      if (currentProductType === 2) {
        fieldsConfig.push(
          { selector: 'input[data-field="labelBatchNo"]', name: '标签批号', clearValue: '', resetBg: '#ffffff' },
          { selector: 'select[data-field="label"]', name: '标签说明', clearValue: '', resetBg: '#ffffff' }
        );
      }

      // C类品特有字段：标签说明（select）
      if (currentProductType === 3) {
        fieldsConfig.push({ selector: 'select[data-field="label"]', name: '标签说明', clearValue: '', resetBg: '#ffffff' });
      }

      let clearedCount = 0;
      let errorCount = 0;

      // 批量清空字段
      fieldsConfig.forEach(config => {
        try {
          const element = row.querySelector(config.selector);
          if (element) {
            element.value = config.clearValue;
            element.style.backgroundColor = config.resetBg;
            delete element.dataset.autoFilled;
            clearedCount++;
            console.log(`已清空字段: ${config.name}`);
          } else {
            // 对于可选的字段，如果不存在则不输出警告，因为这是正常的
            // 根据产品类型判断字段是否存在是正常的
            const isOptionalField =
              (config.selector === 'select[data-field="label"]' && currentProductType !== 2 && currentProductType !== 3) || // B类品和C类品的select标签说明
              (config.selector === 'input[data-field="labelBatchNo"]' && currentProductType !== 2); // B类品的标签批号

            if (!isOptionalField) {
              console.warn(`未找到字段元素: ${config.name} (${config.selector})`);
            }
          }
        } catch (error) {
          console.error(`清空字段 ${config.name} 时发生错误:`, error);
          errorCount++;
        }
      });

      // 清空计算字段（预估总净重）
      try {
        const estimatedWeightDisplay = row.querySelector('input[data-field="estimatedWeight"]');
        if (estimatedWeightDisplay) {
          estimatedWeightDisplay.value = '';
          estimatedWeightDisplay.style.backgroundColor = '#f5f5f5';
          clearedCount++;
          console.log('已清空字段: 预估总净重');
        }
      } catch (error) {
        console.error('清空预估总净重字段时发生错误:', error);
        errorCount++;
      }

      // 触发相关计算更新
      try {
        updateTotalRow();
        calculateTotalAmount();
        console.log('已更新合计行和总金额');
      } catch (error) {
        console.error('更新合计信息时发生错误:', error);
        errorCount++;
      }

      console.log(`产品型号关联字段清除完成 - 成功清空 ${clearedCount} 个字段，${errorCount} 个错误`);

      // 显示用户反馈
      if (errorCount === 0) {
        window.NotificationSystem.toast('产品型号关联字段已全部清空', 'success', 2000);
      } else {
        window.NotificationSystem.toast(`字段清空完成，但有 ${errorCount} 个字段处理失败`, 'warning', 3000);
      }

      return errorCount === 0;

    } catch (error) {
      console.error('清空产品型号关联字段时发生严重错误:', error);
      window.NotificationSystem.toast('清空字段时发生错误，请检查页面状态', 'error', 4000);
      return false;
    }
  }

  // 重新填充产品型号关联字段的函数
  function refillRelatedFields(modelInput, item) {
    const row = modelInput.closest('tr');
    if (!row) return;

    console.log(`产品型号已更改为 ${item.model}，开始重新填充关联字段...`);

    // 重新填充预估重量
    if (item.estimatedWeight !== null && item.estimatedWeight !== undefined && item.estimatedWeight !== '') {
      const estimatedWeightInput = row.querySelector('input[data-field="estimatedWeightInput"]');
      if (estimatedWeightInput) {
        // 格式化数字，保留2位小数（如 2.10 而不是 2.1）
        const weightValue = parseFloat(item.estimatedWeight);
        if (!isNaN(weightValue)) {
          estimatedWeightInput.value = weightValue.toFixed(2);
        } else {
          estimatedWeightInput.value = item.estimatedWeight;
        }
        estimatedWeightInput.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
        estimatedWeightInput.dataset.autoFilled = 'true';
      }
    }

    // 重新填充标签重量
    if (item.labelWeight !== null && item.labelWeight !== undefined && item.labelWeight !== '') {
      const labelWeightInput = row.querySelector('input[data-field="labelWeight"]');
      if (labelWeightInput) {
        // 标签重量显示为整数
        const weightValue = parseFloat(item.labelWeight);
        if (!isNaN(weightValue)) {
          labelWeightInput.value = Math.round(weightValue);
        } else {
          labelWeightInput.value = item.labelWeight;
        }
        labelWeightInput.style.backgroundColor = '#ffffff'; // 白色背景
        labelWeightInput.dataset.autoFilled = 'true';
      }
    }

    // 重新填充安全系数
    if (item.safetyFactor !== null && item.safetyFactor !== undefined && item.safetyFactor !== '') {
      const safetyFactorSelect = row.querySelector('select[data-field="safetyFactor"]');
      if (safetyFactorSelect) {
        const safetyFactorValue = String(item.safetyFactor).trim();
        const options = safetyFactorSelect.querySelectorAll('option');
        for (let option of options) {
          if (option.value === safetyFactorValue) {
            safetyFactorSelect.value = safetyFactorValue;
            safetyFactorSelect.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
            safetyFactorSelect.dataset.autoFilled = 'true';
            break;
          }
        }
      }
    }

    // 重新填充清洁度
    if (item.cleanliness) {
      const cleanlinessSelect = row.querySelector('select[data-field="cleanliness"]');
      if (cleanlinessSelect) {
        const cleanlinessValue = String(item.cleanliness).trim();
        const options = cleanlinessSelect.querySelectorAll('option');
        for (let option of options) {
          if (option.value === cleanlinessValue) {
            cleanlinessSelect.value = cleanlinessValue;
            cleanlinessSelect.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
            cleanlinessSelect.dataset.autoFilled = 'true';
            break;
          }
        }
      }
    }

    // 重新填充标签批号（B类品）
    if (item.labelBatchNo && item.labelBatchNo.trim() !== '') {
      const labelBatchNoInput = row.querySelector('input[data-field="labelBatchNo"]');
      if (labelBatchNoInput) {
        labelBatchNoInput.value = item.labelBatchNo.trim();
        labelBatchNoInput.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
        labelBatchNoInput.dataset.autoFilled = 'true';
        console.log(`已填充标签批号: ${item.labelBatchNo}`);
      }
    }

    // 重新填充标签说明（B类品和C类品）
    // B类品和C类品都使用select
    if (item.label && item.label.trim() !== '') {
      const labelValue = String(item.label).trim();

      // 使用select（B类品和C类品）
      const labelSelect = row.querySelector('select[data-field="label"]');
      if (labelSelect) {
        const options = labelSelect.querySelectorAll('option');
        for (let option of options) {
          if (option.value === labelValue) {
            labelSelect.value = labelValue;
            labelSelect.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
            labelSelect.dataset.autoFilled = 'true';
            console.log(`已填充标签说明（select）: ${labelValue}`);
            break;
          }
        }
      }
    }

    // 重新填充件数单位
    if (item.unit && item.unit.trim() !== '') {
      const unitSelect = row.querySelector('select[data-field="unit"]');
      if (unitSelect) {
        const unitValue = String(item.unit).trim();
        const options = unitSelect.querySelectorAll('option');
        for (let option of options) {
          if (option.value === unitValue) {
            unitSelect.value = unitValue;
            unitSelect.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
            unitSelect.dataset.autoFilled = 'true';
            break;
          }
        }
      }
    }

    console.log(`产品型号 ${item.model} 关联字段重新填充完成`);
  }

  // 只填充通用字段（不填充产品类型特有字段）
  // 通用字段：预估重量、标签重量、清洁度、件数单位
  function refillCommonFieldsOnly(modelInput, item) {
    const row = modelInput.closest('tr');
    if (!row) return;

    console.log(`产品型号已更改为 ${item.model}，开始填充通用字段（不填充产品类型特有字段）...`);

    // 填充预估重量（通用字段）
    if (item.estimatedWeight !== null && item.estimatedWeight !== undefined && item.estimatedWeight !== '') {
      const estimatedWeightInput = row.querySelector('input[data-field="estimatedWeightInput"]');
      if (estimatedWeightInput) {
        // 格式化数字，保留2位小数（如 2.10 而不是 2.1）
        const weightValue = parseFloat(item.estimatedWeight);
        if (!isNaN(weightValue)) {
          estimatedWeightInput.value = weightValue.toFixed(2);
        } else {
          estimatedWeightInput.value = item.estimatedWeight;
        }
        estimatedWeightInput.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
        estimatedWeightInput.dataset.autoFilled = 'true';
      }
    }

    // 填充标签重量（通用字段）
    if (item.labelWeight !== null && item.labelWeight !== undefined && item.labelWeight !== '') {
      const labelWeightInput = row.querySelector('input[data-field="labelWeight"]');
      if (labelWeightInput) {
        // 标签重量显示为整数
        const weightValue = parseFloat(item.labelWeight);
        if (!isNaN(weightValue)) {
          labelWeightInput.value = Math.round(weightValue);
        } else {
          labelWeightInput.value = item.labelWeight;
        }
        labelWeightInput.style.backgroundColor = '#ffffff'; // 白色背景
        labelWeightInput.dataset.autoFilled = 'true';
      }
    }

    // 填充清洁度（通用字段）
    if (item.cleanliness) {
      const cleanlinessSelect = row.querySelector('select[data-field="cleanliness"]');
      if (cleanlinessSelect) {
        const cleanlinessValue = String(item.cleanliness).trim();
        const options = cleanlinessSelect.querySelectorAll('option');
        for (let option of options) {
          if (option.value === cleanlinessValue) {
            cleanlinessSelect.value = cleanlinessValue;
            cleanlinessSelect.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
            cleanlinessSelect.dataset.autoFilled = 'true';
            break;
          }
        }
      }
    }

    // 填充件数单位（通用字段）
    if (item.unit && item.unit.trim() !== '') {
      const unitSelect = row.querySelector('select[data-field="unit"]');
      if (unitSelect) {
        const unitValue = String(item.unit).trim();
        const options = unitSelect.querySelectorAll('option');
        for (let option of options) {
          if (option.value === unitValue) {
            unitSelect.value = unitValue;
            unitSelect.style.backgroundColor = '#e8f5e8'; // 浅绿色背景
            unitSelect.dataset.autoFilled = 'true';
            break;
          }
        }
      }
    }

    console.log(`产品型号 ${item.model} 通用字段填充完成（未填充产品类型特有字段）`);
  }

  // 高亮匹配的文字（将匹配部分显示为红色，其他部分显示为蓝色）
  function highlightMatch(text, query) {
    if (!query || !query.trim()) {
      // 如果没有查询字符串，返回蓝色文字
      const span = document.createElement('span');
      span.style.color = '#2563eb';
      span.textContent = text;
      return span;
    }

    const queryLower = query.toLowerCase().trim();
    const textLower = text.toLowerCase();

    // 创建一个容器来存放高亮后的文字
    const container = document.createDocumentFragment();

    // 找到所有匹配的位置（不区分大小写）
    let lastIndex = 0;
    let matchIndex = textLower.indexOf(queryLower, lastIndex);

    if (matchIndex === -1) {
      // 如果没有找到匹配，返回蓝色文字
      const span = document.createElement('span');
      span.style.color = '#2563eb';
      span.textContent = text;
      return span;
    }

    // 找到所有匹配位置
    const matches = [];
    while (matchIndex !== -1) {
      matches.push({ start: matchIndex, end: matchIndex + queryLower.length });
      matchIndex = textLower.indexOf(queryLower, matchIndex + 1);
    }

    // 构建高亮后的DOM结构
    matches.forEach((match, index) => {
      // 添加匹配前的文字（蓝色）
      if (match.start > lastIndex) {
        const beforeSpan = document.createElement('span');
        beforeSpan.style.color = '#2563eb';
        beforeSpan.textContent = text.substring(lastIndex, match.start);
        container.appendChild(beforeSpan);
      }

      // 添加匹配的文字（红色）
      const matchSpan = document.createElement('span');
      matchSpan.style.color = '#dc2626'; // 红色
      matchSpan.style.fontWeight = 'bold';
      matchSpan.textContent = text.substring(match.start, match.end);
      container.appendChild(matchSpan);

      lastIndex = match.end;
    });

    // 添加最后剩余的文字（蓝色）
    if (lastIndex < text.length) {
      const afterSpan = document.createElement('span');
      afterSpan.style.color = '#2563eb';
      afterSpan.textContent = text.substring(lastIndex);
      container.appendChild(afterSpan);
    }

    return container;
  }

  // 显示自动完成下拉框 - 使用固定定位，增加重量信息显示
  function showAutocompleteDropdown(dropdown, modal, matches, input) {
    dropdown.innerHTML = '';

    // 获取当前输入框的值作为查询字符串
    const query = input ? (input.value || '').trim() : '';

    if (matches.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'product-autocomplete-no-results';
      noResults.textContent = '暂无匹配的产品型号';
      dropdown.appendChild(noResults);
    } else {
      matches.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'product-autocomplete-item';
        itemDiv.dataset.index = index;

        // 创建产品信息显示
        const modelSpan = document.createElement('div');
        modelSpan.style.fontWeight = 'bold';

        // 产品类型映射：1=A类品，2=B类品，3=C类品
        const productTypeMap = {
          1: 'A类品',
          2: 'B类品',
          3: 'C类品'
        };
        const productType = productTypeMap[item.productType] || 'A类品';

        // 产品型号（高亮匹配部分为红色，其他部分为蓝色）
        const modelTextSpan = highlightMatch(item.model, query);
        modelSpan.appendChild(modelTextSpan);

        // 产品类型（括号中，与详细信息颜色一致）
        const typeText = document.createTextNode(`(${productType})`);
        const typeTextSpan = document.createElement('span');
        typeTextSpan.style.color = '#666'; // 与详细信息颜色一致（浅灰色）
        typeTextSpan.appendChild(typeText);

        // 将产品型号和类型添加到容器
        modelSpan.appendChild(typeTextSpan);

        const infoDiv = document.createElement('div');
        infoDiv.style.fontSize = '12px';
        infoDiv.style.color = '#666';
        infoDiv.style.marginTop = '2px';

        let infoText = '';
        if (item.description) {
          infoText += `描述: ${item.description}`;
        }

        // 按照新的顺序显示产品信息：件数单位、预估重量、标签重量、安全系数、清洁度
        const productInfo = [];

        // 1. 件数单位 - 优先显示
        if (item.unit && item.unit.trim() !== '') {
          productInfo.push(`件数单位: ${item.unit}`);
        }

        // 2. 预估重量
        if (item.estimatedWeight) {
          productInfo.push(`预估: ${item.estimatedWeight}`);
        }

        // 3. 标签重量
        if (item.labelWeight) {
          productInfo.push(`标签: ${item.labelWeight}`);
        }

        // 4. 安全系数
        if (item.safetyFactor && item.safetyFactor.trim() !== '') {
          productInfo.push(`安全系数: ${item.safetyFactor}`);
        }

        // 5. 清洁度
        if (item.cleanliness && item.cleanliness.trim() !== '') {
          productInfo.push(`清洁度: ${item.cleanliness}`);
        }

        if (productInfo.length > 0) {
          if (infoText) infoText += ' | ';
          infoText += productInfo.join(', ');
        }

        if (infoText) {
          infoDiv.textContent = infoText;
        }

        itemDiv.appendChild(modelSpan);
        if (infoText) {
          itemDiv.appendChild(infoDiv);
        }

        // 点击选择
        itemDiv.addEventListener('click', async () => {
          // 获取当前订单的产品类型和选择的产品类型
          const currentOrderType = currentProductTypeRef && currentProductTypeRef.current ? currentProductTypeRef.current : 1;
          const selectedProductType = item.productType || 1;

          // 产品类型映射
          const productTypeMap = {
            1: 'A类品',
            2: 'B类品',
            3: 'C类品'
          };
          const currentTypeName = productTypeMap[currentOrderType] || 'A类品';
          const selectedTypeName = productTypeMap[selectedProductType] || 'A类品';

          // 如果产品类型不匹配，显示确认对话框
          if (selectedProductType !== currentOrderType) {
            const confirmed = await window.ModalDialog.confirm(
              `当前订单产品类型为"${currentTypeName}"，但选择的产品"${item.model}"是"${selectedTypeName}"。\n\n是否切换订单产品类型为"${selectedTypeName}"？\n\n选择"是"：切换产品类型并自动填充所有字段\n选择"否"：保持当前产品类型，只填充通用字段`,
              {
                title: '产品类型不匹配',
                icon: '⚠️',
                confirmText: '是，切换产品类型',
                cancelText: '否，保持当前类型',
                size: 'medium'
              }
            );

            if (confirmed) {
              // 用户选择切换产品类型
              console.log(`[产品自动完成] 用户确认切换产品类型: ${currentTypeName} → ${selectedTypeName}`);

              // 保存当前输入框的值和行信息
              const currentRow = input.closest('tr');
              const currentModelValue = item.model;

              // 切换产品类型
              if (switchTemplate && typeof switchTemplate === 'function') {
                switchTemplate(selectedProductType);
                // 等待切换完成（DOM更新需要时间）
                await new Promise(resolve => setTimeout(resolve, 200));
              } else {
                console.warn('[产品自动完成] switchTemplate 函数未提供，无法切换产品类型');
              }

              // 切换后，需要重新找到对应的输入框（因为DOM可能已更新）
              // 尝试通过行号或索引找到对应的行
              let targetInput = input;
              let targetRow = currentRow;

              // 如果行还存在，使用原行；否则尝试通过产品型号找到
              if (!targetRow || !targetRow.parentNode) {
                const allRows = prodTbody.querySelectorAll('tr');
                for (let row of allRows) {
                  const modelInput = row.querySelector('input[data-field="model"]');
                  if (modelInput && modelInput.value === currentModelValue) {
                    targetInput = modelInput;
                    targetRow = row;
                    break;
                  }
                }
              }

              // 清除当前行的所有关联字段
              clearRelatedFields(targetInput);

              // 设置新的产品型号
              targetInput.value = currentModelValue;

              // 重新填充新产品的关联字段（包括所有字段）
              refillRelatedFields(targetInput, item);

              hideAutocompleteDropdown(dropdown, modal);
              // 设置刚选择标记
              if (targetInput._autocompleteData) {
                targetInput._autocompleteData.justSelected();
              }
              targetInput.focus();
              // 触发change事件以保存草稿
              targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              // 用户选择保持当前产品类型，只填充通用字段
              console.log(`[产品自动完成] 用户选择保持当前产品类型: ${currentTypeName}`);

              // 清除当前行的所有关联字段
              clearRelatedFields(input);

              // 设置新的产品型号
              input.value = item.model;

              // 只填充通用字段（不填充产品类型特有字段）
              refillCommonFieldsOnly(input, item);

              hideAutocompleteDropdown(dropdown, modal);
              // 设置刚选择标记
              if (input._autocompleteData) {
                input._autocompleteData.justSelected();
              }
              input.focus();
              // 触发change事件以保存草稿
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else {
            // 产品类型匹配，正常填充
            // 先清除当前行的所有关联字段
            clearRelatedFields(input);

            // 设置新的产品型号
            input.value = item.model;

            // 重新填充新产品的关联字段
            refillRelatedFields(input, item);

            hideAutocompleteDropdown(dropdown, modal);
            // 设置刚选择标记
            if (input._autocompleteData) {
              input._autocompleteData.justSelected();
            }
            input.focus();
            // 触发change事件以保存草稿
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });

        dropdown.appendChild(itemDiv);
      });
    }

    // 计算弹窗位置
    const inputRect = input.getBoundingClientRect();
    const dropdownHeight = Math.min(300, matches.length * 50 + 20);

    // 优先显示在输入框下方，如果空间不够则显示在上方
    let top = inputRect.bottom + 5;
    if (top + dropdownHeight > window.innerHeight - 20) {
      top = inputRect.top - dropdownHeight - 5;
      if (top < 20) {
        // 如果上方也不够，则居中显示
        top = (window.innerHeight - dropdownHeight) / 2;
      }
    }

    dropdown.style.left = inputRect.left + 'px';
    dropdown.style.top = top + 'px';
    dropdown.style.width = Math.max(inputRect.width, 300) + 'px';

    modal.style.display = 'block';
    dropdown.style.display = 'block';
  }

  // 处理键盘导航
  function handleKeyboardNavigation(e, dropdown, modal, input) {
    const items = dropdown.querySelectorAll('.product-autocomplete-item');
    if (items.length === 0) return;

    const currentHighlighted = dropdown.querySelector('.product-autocomplete-item.highlighted');
    let currentIndex = currentHighlighted ? parseInt(currentHighlighted.dataset.index) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentIndex = Math.min(currentIndex + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentIndex = Math.max(currentIndex - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (currentIndex >= 0 && items[currentIndex]) {
        input.value = items[currentIndex].textContent;
        hideAutocompleteDropdown(dropdown, modal);
        // 设置刚选择标记
        if (input._autocompleteData) {
          input._autocompleteData.justSelected();
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    } else if (e.key === 'Escape') {
      hideAutocompleteDropdown(dropdown, modal);
      return;
    } else {
      return;
    }

    // 更新高亮状态
    items.forEach(item => item.classList.remove('highlighted'));
    if (currentIndex >= 0 && items[currentIndex]) {
      items[currentIndex].classList.add('highlighted');
    }
  }

  // 为产品型号输入框绑定自动完成功能
  function bindProductModelAutocomplete(input) {
    if (input.dataset.autocompleteInitialized) return;
    input.dataset.autocompleteInitialized = 'true';

    const { modal, dropdown } = createAutocompleteDropdown(input);
    let debounceTimer;
    let justSelected = false; // 标记是否刚刚选择了项目

    // 存储引用以便后续使用
    input._autocompleteData = {
      modal,
      dropdown,
      justSelected: () => { justSelected = true; }
    };

    // 输入事件 - 优化防抖和搜索逻辑
    input.addEventListener('input', async (e) => {
      // 如果是刚刚选择的，重置标记并不显示下拉框
      if (justSelected) {
        justSelected = false;
        return;
      }

      const query = e.target.value.trim();
      const previousValue = input.dataset.previousValue || '';

      // 实时监听产品型号输入框的变化事件
      try {
        // 如果产品型号被清空或删除，立即触发清空操作
        if (!query || query === '') {
          console.log('检测到产品型号输入框被清空，触发关联字段清空操作');
          const clearResult = clearRelatedFields(input);
          if (!clearResult) {
            console.warn('清空关联字段操作未完全成功');
          }
          hideAutocompleteDropdown(dropdown, modal);
          input.dataset.previousValue = '';
          return;
        }

        // 如果内容发生变化（包括部分删除），也触发清空操作
        if (previousValue && query !== previousValue && query.length < previousValue.length) {
          console.log(`检测到产品型号内容被部分删除: "${previousValue}" -> "${query}"`);
          const clearResult = clearRelatedFields(input);
          if (!clearResult) {
            console.warn('清空关联字段操作未完全成功');
          }
        }

        // 更新前一个值
        input.dataset.previousValue = query;

        // 防抖处理自动完成功能
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          if (!query || query.length < 1) {
            hideAutocompleteDropdown(dropdown, modal);
            return;
          }

          try {
            // 使用预加载的数据或获取新数据
            const models = await (preloadPromise || fetchProductModels());
            const matches = filterProductModels(query, models);
            showAutocompleteDropdown(dropdown, modal, matches, input);
          } catch (error) {
            console.error('获取产品型号数据时发生错误:', error);
            window.NotificationSystem.toast('获取产品数据失败，请稍后重试', 'error', 3000);
          }
        }, 100); // 优化防抖时间从150ms减少到100ms以提升响应速度

      } catch (error) {
        console.error('处理产品型号输入变化时发生错误:', error);
        window.NotificationSystem.toast('处理输入变化时发生错误', 'error', 3000);
      }
    });

    // 键盘导航 - 增加异常处理
    input.addEventListener('keydown', (e) => {
      try {
        if (dropdown.style.display === 'block') {
          handleKeyboardNavigation(e, dropdown, modal, input);
        }

        // 添加删除键和退格键的特殊处理
        if (e.key === 'Delete' || e.key === 'Backspace') {
          // 延迟执行，确保输入框值已更新
          setTimeout(() => {
            try {
              const currentValue = input.value.trim();
              if (!currentValue || currentValue === '') {
                console.log('检测到删除键清空产品型号，触发关联字段清空操作');
                const clearResult = clearRelatedFields(input);
                if (!clearResult) {
                  console.warn('删除键触发的清空操作未完全成功');
                }
              }
            } catch (error) {
              console.error('删除键延迟处理发生错误:', error);
            }
          }, 10);
        }
      } catch (error) {
        console.error('键盘事件处理发生错误:', error);
        try {
          hideAutocompleteDropdown(dropdown, modal);
        } catch (hideError) {
          console.error('隐藏下拉框时发生错误:', hideError);
        }
      }
    });

    // 失去焦点时隐藏下拉框（延迟执行以允许点击选择）- 增加异常处理
    input.addEventListener('blur', () => {
      try {
        setTimeout(() => {
          try {
            if (!dropdown.matches(':hover')) {
              hideAutocompleteDropdown(dropdown, modal);
            }
          } catch (error) {
            console.error('失焦延迟处理发生错误:', error);
            // 即使出错也要尝试隐藏下拉框
            try {
              hideAutocompleteDropdown(dropdown, modal);
            } catch (hideError) {
              console.error('强制隐藏下拉框时发生错误:', hideError);
            }
          }
        }, 150);
      } catch (error) {
        console.error('失焦事件处理发生错误:', error);
      }
    });
  }

  // 初始化产品型号自动完成功能（绑定到表格和监听新行）
  function initProductModelAutocomplete() {
    if (!prodTbody) {
      console.warn('[产品型号自动完成] 产品表格tbody未找到，跳过初始化');
      return;
    }

    // 监听产品表格变化，为新添加的产品型号输入框绑定自动完成功能
    const productModelObserver = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        mutation.addedNodes.forEach(function (node) {
          if (node.nodeType === 1 && node.tagName === 'TR') {
            const modelInput = node.querySelector('input[data-field="model"]');
            if (modelInput) {
              bindProductModelAutocomplete(modelInput);
            }
          }
        });
      });
    });

    productModelObserver.observe(prodTbody, { childList: true, subtree: false });

    // 为已存在的产品型号输入框绑定自动完成功能
    const existingInputs = prodTbody.querySelectorAll('input[data-field="model"]');
    existingInputs.forEach(input => {
      bindProductModelAutocomplete(input);
    });

    // 页面加载完成后预加载产品数据以提升响应速度
    setTimeout(() => {
      preloadProductModels().then(() => {
        console.log('产品数据预加载完成，提升自动匹配响应速度');
      }).catch(error => {
        console.warn('产品数据预加载失败:', error);
      });
    }, 500); // 延迟500ms执行，避免影响页面初始化
  }

  // 返回导出的函数集合
  return {
    preloadProductModels,
    fetchProductModels,
    createAutocompleteDropdown,
    filterProductModels,
    hideAutocompleteDropdown,
    clearRelatedFields,
    refillRelatedFields,
    showAutocompleteDropdown,
    handleKeyboardNavigation,
    bindProductModelAutocomplete,
    initProductModelAutocomplete
  };
}

