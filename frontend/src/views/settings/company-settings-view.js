/**
 * 公司设置视图
 * 处理公司信息的显示、编辑和保存
 */
import {
  isDocumentCenterNavEnabled,
  setDocumentCenterNavEnabled,
  isAnalyticsSummaryNavEnabled,
  setAnalyticsSummaryNavEnabled,
  isOrderPreviewNewDocsButtonEnabled,
  setOrderPreviewNewDocsButtonEnabled
} from '../../utils/ui-preferences.js';
import { refreshMainSidebarFromPreferences } from '../../components/layout.js';

export class CompanySettingsView {
  constructor(apiService) {
    this.apiService = apiService || window.ApiService;
    this.tpl = null;
  }

  /**
   * 渲染公司设置页面
   */
  async render() {
    try {
      console.log('[公司设置] 开始渲染');

      const nameCN = document.getElementById("sysCompanyNameCN");
      const nameEN = document.getElementById("sysCompanyNameEN");
      const addrCN = document.getElementById("sysCompanyAddressCN");
      const addrEN = document.getElementById("sysCompanyAddressEN");
      const telInput = document.getElementById("sysCompanyTel");
      const faxInput = document.getElementById("sysCompanyFax");
      const signAtInput = document.getElementById("sysCompanySignAt");
      const btnSaveCompany = document.getElementById("btnSaveCompany");
      const btnResetCompany = document.getElementById("btnResetCompany");

      const uiShowDc = document.getElementById('uiShowDocumentCenter');
      if (uiShowDc) {
        uiShowDc.checked = isDocumentCenterNavEnabled();
        uiShowDc.onchange = () => {
          setDocumentCenterNavEnabled(uiShowDc.checked);
          refreshMainSidebarFromPreferences();
          const raw = (location.hash.replace('#/', '') || '').trim().split('?')[0];
          if (raw === 'document-center' || raw.startsWith('document-center/')) {
            location.hash = '#/home';
          } else {
            const base = (location.hash.replace('#/', '') || 'home').split('/')[0];
            if (base === 'home' && typeof window.renderHome === 'function') {
              window.renderHome();
            }
          }
        };
      }

      const uiShowAnalyticsSummary = document.getElementById('uiShowAnalyticsSummary');
      if (uiShowAnalyticsSummary) {
        uiShowAnalyticsSummary.checked = isAnalyticsSummaryNavEnabled();
        uiShowAnalyticsSummary.onchange = () => {
          setAnalyticsSummaryNavEnabled(uiShowAnalyticsSummary.checked);
          refreshMainSidebarFromPreferences();
          const raw = (location.hash.replace('#/', '') || '').trim().split('?')[0];
          if (raw === 'analytics' || raw === 'analytics/summary') {
            location.hash = '#/analytics/export';
          } else {
            const base = (location.hash.replace('#/', '') || 'home').split('/')[0];
            if (base === 'home' && typeof window.renderHome === 'function') {
              window.renderHome();
            }
          }
        };
      }

      const uiShowPreviewNewDocs = document.getElementById('uiShowOrderPreviewNewDocs');
      if (uiShowPreviewNewDocs) {
        uiShowPreviewNewDocs.checked = isOrderPreviewNewDocsButtonEnabled();
        uiShowPreviewNewDocs.onchange = () => {
          setOrderPreviewNewDocsButtonEnabled(uiShowPreviewNewDocs.checked);
        };
      }

      if (!nameCN || !nameEN || !addrCN || !addrEN || !telInput || !faxInput || !signAtInput) {
        console.warn('[公司设置] 页面元素未找到', {
          nameCN: !!nameCN,
          nameEN: !!nameEN,
          addrCN: !!addrCN,
          addrEN: !!addrEN,
          telInput: !!telInput,
          faxInput: !!faxInput,
          signAtInput: !!signAtInput
        });
        return;
      }

      if (!this.apiService) {
        console.error('[公司设置] ApiService 未定义');
        return;
      }

      // 重置按钮绑定
      if (btnResetCompany) {
        btnResetCompany.onclick = () => this.handleReset(nameCN, nameEN, addrCN, addrEN, telInput, faxInput, signAtInput);
      }

      // 保存按钮绑定
      if (btnSaveCompany) {
        btnSaveCompany.onclick = () => this.handleSave(nameCN, nameEN, addrCN, addrEN, telInput, faxInput, signAtInput);
      }

      // 一键填充按钮绑定
      const btnQuickFillCompany = document.getElementById("btnQuickFillCompany");
      if (btnQuickFillCompany) {
        btnQuickFillCompany.onclick = () => this.handleQuickFill(nameCN, nameEN, addrCN, addrEN, telInput, faxInput, signAtInput);
      }

      console.log('[公司设置] 按钮事件已绑定，开始加载数据');

      // 读取现有模板设置
      this.tpl = {
        companyNameCN: "",
        companyNameEN: "",
        companyAddressCN: "",
        companyAddressEN: "",
        companyTel: "",
        companyFax: "",
        signAt: "",
        logoUrl: "",
        themeColor: "#2c3e50",
        fontSize: 14,
        headerProduction: "",
        headerInvoice: "",
        headerPacking: "",
        headerSales: "",
      };

      // 后端优先读取公司配置
      try {
        const company = await this.apiService.company.get();
        if (company) {
          this.tpl = { ...this.tpl, ...company };
        }

        // 初始化UI
        nameCN.value = this.tpl.companyNameCN || "";
        nameEN.value = this.tpl.companyNameEN || "";
        addrCN.value = this.tpl.companyAddressCN || "";
        addrEN.value = this.tpl.companyAddressEN || "";
        telInput.value = this.tpl.companyTel || "";
        faxInput.value = this.tpl.companyFax || "";
        if (signAtInput) signAtInput.value = this.tpl.signAt || "";

        // 单据表头内容配置相关代码已移至单据生成页面
        [nameCN, nameEN, addrCN, addrEN, telInput, faxInput].forEach(el => {
          if (el) el.oninput = () => { /* 预览功能已移至单据生成页面 */ };
        });
      } catch (error) {
        console.error('[公司设置] 加载公司配置失败:', error);
        // 回退使用默认模板
        nameCN.value = this.tpl.companyNameCN || "";
        nameEN.value = this.tpl.companyNameEN || "";
        addrCN.value = this.tpl.companyAddressCN || "";
        addrEN.value = this.tpl.companyAddressEN || "";
        telInput.value = this.tpl.companyTel || "";
        faxInput.value = this.tpl.companyFax || "";
        [nameCN, nameEN, addrCN, addrEN, telInput, faxInput].forEach(el => {
          if (el) el.oninput = () => { /* 预览功能已移至单据生成页面 */ };
        });
      }

      console.log('[公司设置] 渲染完成');
    } catch (error) {
      console.error('[公司设置] 渲染失败:', error);
      // 不重新抛出错误，避免中断其他初始化流程
      // 但记录详细错误信息以便调试
      console.error('[公司设置] 错误详情:', {
        message: error?.message,
        stack: error?.stack,
        apiService: !!this.apiService,
        apiServiceCompany: !!this.apiService?.company
      });
    }
  }

  /**
   * 处理重置操作
   */
  async handleReset(nameCN, nameEN, addrCN, addrEN, telInput, faxInput, signAtInput) {
    // 确认操作
    const confirmed = await window.ModalDialog.confirm(
      '确定要清空所有公司配置信息吗？此操作将删除数据库中的公司设置，且不可恢复！',
      {
        title: '确认重置公司设置',
        icon: '⚠️',
        confirmText: '确定清空',
        cancelText: '取消'
      }
    );

    if (!confirmed) {
      window.NotificationSystem?.toast('重置操作已取消', 'info', 2000);
      return;
    }

    try {
      // 调用后端API删除公司配置
      const resp = await this.apiService.company.reset();

      // 兼容多种返回格式：
      // 1. 直接返回数据对象 (如果有 id)
      // 2. 返回包含 success/ok 的包装对象
      if (resp && (resp.id || resp.success || resp.ok)) {
        // 清空所有输入框
        if (nameCN) nameCN.value = "";
        if (nameEN) nameEN.value = "";
        if (addrCN) addrCN.value = "";
        if (addrEN) addrEN.value = "";
        if (telInput) telInput.value = "";
        if (faxInput) faxInput.value = "";
        if (signAtInput) signAtInput.value = "";

        // 重置模板数据为空值
        this.tpl = {
          companyNameCN: "",
          companyNameEN: "",
          companyAddressCN: "",
          companyAddressEN: "",
          companyTel: "",
          companyFax: "",
          signAt: "",
          logoUrl: "",
          themeColor: "#2c3e50",
          fontSize: 14,
          headerProduction: "",
          headerInvoice: "",
          headerPacking: "",
          headerSales: "",
        };

        window.NotificationSystem?.toast('✅ 公司配置已清空，数据库中的公司设置已删除', 'success', 3000);
        console.log('[公司设置] 公司配置已清空，数据库中的公司设置已删除');
      } else {
        throw new Error(resp?.message || resp?.error || '未知错误');
      }
    } catch (e) {
      console.error('[公司设置] 重置失败:', e);
      const errorMsg = (e && e.message) ? e.message : '网络或服务器错误';
      window.NotificationSystem?.toast('重置失败：' + errorMsg, 'error');
    }
  }

  /**
   * 处理保存操作
   */
  async handleSave(nameCN, nameEN, addrCN, addrEN, telInput, faxInput, signAtInput) {
    const next = {
      ...this.tpl,
      companyNameCN: nameCN.value.trim(),
      companyNameEN: nameEN.value.trim(),
      companyAddressCN: addrCN.value.trim(),
      companyAddressEN: addrEN.value.trim(),
      companyTel: telInput.value.trim(),
      companyFax: faxInput.value.trim(),
      signAt: signAtInput ? signAtInput.value.trim() : (this.tpl.signAt || '')
    };

    try {
      console.log('[公司设置] 正在提交保存:', next);
      const resp = await this.apiService.company.update(next);
      console.log('[公司设置] 保存返回结果:', resp);

      // API层已经解包了 result.data，所以 resp 是直接的公司数据对象
      // 只要没有抛出异常且 resp 存在，就表示成功
      // 为了兼容性，保留 success/ok 检查，但优先检查数据有效性（如存在 id）
      if (resp && (resp.id || resp.success || resp.ok)) {
        window.NotificationSystem?.toast("保存成功：已写入服务器配置", "success");

        // 清除缓存并重新加载数据以确保显示正确
        if (window.CacheService) {
          window.CacheService.company.clear();
        }

        // 重新加载公司设置数据并更新显示
        try {
          const company = await this.apiService.company.get();
          this.tpl = { ...this.tpl, ...(company || {}) };

          // 更新UI显示
          nameCN.value = this.tpl.companyNameCN || "";
          nameEN.value = this.tpl.companyNameEN || "";
          addrCN.value = this.tpl.companyAddressCN || "";
          addrEN.value = this.tpl.companyAddressEN || "";
          telInput.value = this.tpl.companyTel || "";
          faxInput.value = this.tpl.companyFax || "";
          if (signAtInput) signAtInput.value = this.tpl.signAt || "";
        } catch (e) {
          // 如果重新加载失败，至少保持当前输入的值
          console.warn('[公司设置] 重新加载失败:', e);
        }
      } else {
        console.error('[公司设置] 保存返回了非预期结果:', resp);
        window.NotificationSystem?.toast("保存失败：服务器返回数据无效", "error");
      }
    } catch (e) {
      console.error('[公司设置] 保存过程发生错误:', e);
      const msg = (e && e.message) ? e.message : '网络或服务器错误';
      window.NotificationSystem?.toast("保存失败：" + msg, "error");
    }
  }

  /**
   * 处理一键填充操作
   */
  async handleQuickFill(nameCN, nameEN, addrCN, addrEN, telInput, faxInput, signAtInput) {
    const confirmed = await window.ModalDialog.confirm(
      '确定要填充默认公司信息吗？这将覆盖当前输入框中的内容。',
      {
        title: '一键填充',
        icon: '⚡',
        confirmText: '确定填充',
        cancelText: '取消'
      }
    );

    if (!confirmed) return;

    // 默认数据配置
    const defaultData = {
      nameCN: "青岛盛驰包装制品有限公司",
      nameEN: "QINGDAO SHENGCHI PACKAGING PRODUCT CO.,LTD",
      addrCN: "山东省青岛市胶州市洋河镇艾山工业园挪大路7号",
      addrEN: "NO7 NUODALU AISHAN INDUSTRIAL PARK YANGHE TOWN JIAOZHOU DISTRICT QINGDAO SHANDONG CHINA",
      tel: "0532-83161609",
      fax: "0532-83161772",
      signAt: "QINGDAO,CHINA"
    };

    // 填充数据
    if (nameCN) nameCN.value = defaultData.nameCN;
    if (nameEN) nameEN.value = defaultData.nameEN;
    if (addrCN) addrCN.value = defaultData.addrCN;
    if (addrEN) addrEN.value = defaultData.addrEN;
    if (telInput) telInput.value = defaultData.tel;
    if (faxInput) faxInput.value = defaultData.fax;
    if (signAtInput) signAtInput.value = defaultData.signAt;

    window.NotificationSystem?.toast('已填充默认公司信息，请记得保存', 'success');
  }
}
