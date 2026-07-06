/**
 * Excel导出服务
 * 负责将订单数据导出为Excel格式
 */

const OrderService = require('./OrderService');

let _XLSX = null;
function getXLSX() {
  if (!_XLSX) _XLSX = require('xlsx');
  return _XLSX;
}

class ExcelExportService {
  /**
   * 生成Excel文件
   * @param {number|string} orderId - 订单ID
   * @param {number|string} templateId - 模板ID（可选，用于未来扩展）
   * @returns {Promise<Buffer>} Excel文件Buffer
   */
  static async generateExcel(orderId, templateId = null) {
    try {
      // 1. 获取订单数据
      const order = await OrderService.getOrder(orderId);
      if (!order) {
        throw new Error('订单不存在');
      }

      // 2. 创建工作簿
      const XLSX = getXLSX();
      const workbook = XLSX.utils.book_new();

      // 3. 创建订单信息工作表
      const orderData = [
        ['合同号', order.contractNo || ''],
        ['发票号', order.invoiceNo || ''],
        ['提单号', order.blNo || ''],
        ['客户名称', order.customerName || ''],
        ['发票日期', order.invoiceDate || ''],
        ['发货日期', order.shipmentDate || ''],
        ['起运港', order.shipFrom || ''],
        ['目的港', order.shipTo || ''],
        ['船名/航次', order.shippedPerSs || ''],
        ['货代', order.forwarder || ''],
        ['总金额(USD)', order.totalUSD || 0],
        ['订单状态', order.status || '']
      ];
      const orderSheet = XLSX.utils.aoa_to_sheet(orderData);
      XLSX.utils.book_append_sheet(workbook, orderSheet, '订单信息');

      // 4. 创建产品列表工作表
      const productData = [
        ['型号', '数量', '件数', '重量', '实际重量', '单价', '金额', '单位', '包装']
      ];
      (order.items || []).forEach(item => {
        productData.push([
          item.model || '',
          item.quantity || 0,
          item.packages || 0,
          item.weight || 0,
          item.actualWeight || 0,
          item.unitPrice || 0,
          item.amount || 0,
          item.unit || '',
          item.packing || ''
        ]);
      });
      
      // 添加合计行
      if (order.items && order.items.length > 0) {
        const totalQuantity = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
        const totalPackages = order.items.reduce((sum, item) => sum + (item.packages || 0), 0);
        const totalWeight = order.items.reduce((sum, item) => sum + (item.weight || 0), 0);
        const totalAmount = order.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        
        productData.push([
          '合计',
          totalQuantity,
          totalPackages,
          totalWeight,
          '',
          '',
          totalAmount,
          '',
          ''
        ]);
      }
      
      const productSheet = XLSX.utils.aoa_to_sheet(productData);
      XLSX.utils.book_append_sheet(workbook, productSheet, '产品列表');

      // 5. 生成Excel Buffer
      const excelBuffer = XLSX.write(workbook, { 
        type: 'buffer', 
        bookType: 'xlsx',
        cellStyles: false
      });

      return excelBuffer;
    } catch (error) {
      console.error('[ExcelExportService] 生成Excel失败:', error);
      throw new Error('生成Excel失败: ' + error.message);
    }
  }
}

module.exports = ExcelExportService;

