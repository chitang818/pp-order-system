/**
 * 货代列表视图
 * 负责货代列表的渲染、筛选、分页和事件绑定
 * ES6 模块化版本
 */

import { timerManager } from '../../utils/timer-manager.js';
import { eventManager } from '../../utils/event-manager.js';
import { escapeHtml } from '../../utils/format-utils.js';

/**
 * 货代列表视图类
 */
export class ForwardersListView {
    constructor(options = {}) {
        this.apiService = options.apiService || window.ApiService;
        this.stateManager = options.stateManager || null;

        // 如果没有提供 stateManager，尝试查找全局的
        if (!this.stateManager && window.app && window.app.stateManager) {
            this.stateManager = window.app.stateManager;
        }

        this._initialized = false;
        this._currentPage = 1;
        this._pageSize = 20;
        this._total = 0;
        this._totalPages = 0;
        this._forwarders = [];
    }

    /**
     * 初始化视图
     */
    async init() {
        // 等待 DOM 元素加载完成
        let tbody = document.getElementById('forwardersTbody');
        let retries = 0;
        const maxRetries = 20;

        while (!tbody && retries < maxRetries) {
            console.log(`[ForwardersListView] 等待 forwardersTbody 元素加载... (${retries + 1}/${maxRetries})`);
            await new Promise(resolve => timerManager.setTimeout(resolve, 50));
            tbody = document.getElementById('forwardersTbody');
            retries++;
        }

        if (!tbody) {
            console.error('[ForwardersListView] forwardersTbody 元素未找到，初始化失败');
            return;
        }

        // 检查视图是否被重新加载
        const wasInitialized = tbody.hasAttribute('data-initialized');

        if (this._initialized && wasInitialized) {
            console.log('[ForwardersListView] 已初始化，仅重新渲染');
            this.render();
            return;
        }

        console.log('[ForwardersListView] 开始初始化...');

        // 标记为已初始化
        tbody.setAttribute('data-initialized', 'true');
        this._bindEvents();

        // 加载数据
        await this.loadForwarders();

        this._initialized = true;
        console.log('[ForwardersListView] 初始化完成');
    }

    /**
     * 加载货代数据
     */
    async loadForwarders(page = 1) {
        try {
            this._currentPage = page;
            this._renderSkeleton();

            const result = await this.apiService.forwarders.list({
                page: this._currentPage,
                pageSize: this._pageSize
            });

            if (result && result.data) {
                this._forwarders = result.data;
                this._total = result.total || 0;
                this._totalPages = result.totalPages || 1;
            } else if (Array.isArray(result)) {
                this._forwarders = result;
                this._total = result.length;
                this._totalPages = Math.ceil(result.length / this._pageSize);
            } else {
                this._forwarders = [];
                this._total = 0;
                this._totalPages = 0;
            }

            this.render();
            this._updatePagination();
        } catch (error) {
            console.error('[ForwardersListView] 加载数据失败:', error);
            window.NotificationSystem?.toast('加载货代数据失败', 'error');
            this._renderError();
        }
    }

    /**
     * 渲染列表
     */
    render() {
        const tbody = document.getElementById('forwardersTbody');
        if (!tbody) return;

        if (this._forwarders.length === 0) {
            tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 40px; color: #6b7280;">
            <div style="font-size: 48px; margin-bottom: 10px; opacity: 0.5;">🚢</div>
            <div>暂无货代数据</div>
            <button class="btn primary small" style="margin-top: 15px;" id="btnEmptyNewForwarder">新建货代</button>
          </td>
        </tr>
      `;

            const btnEmpty = document.getElementById('btnEmptyNewForwarder');
            if (btnEmpty) {
                eventManager.on(btnEmpty, 'click', () => this._handleNewForwarder());
            }
            return;
        }

        tbody.innerHTML = this._forwarders.map(forwarder => `
      <tr>
        <td>
          <div style="font-weight: 500; color: #111827;">${escapeHtml(forwarder.name)}</div>
          <div style="font-size: 12px; color: #6b7280;">ID: ${forwarder.id}</div>
        </td>
        <td>
          <div style="font-size: 13px;">${escapeHtml(forwarder.contact || '-')}</div>
          <div style="font-size: 12px; color: #6b7280;">${escapeHtml(forwarder.tel || '-')}</div>
        </td>
        <td>
          <div style="font-size: 13px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(forwarder.address || '')}">
            ${escapeHtml(forwarder.address || '-')}
          </div>
        </td>
        <td>
          <div style="font-size: 13px;">${escapeHtml(forwarder.email || '-')}</div>
        </td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button class="btn icon-only" data-action="editForwarder" data-id="${forwarder.id}" title="编辑">
              ✏️
            </button>
            <button class="btn icon-only danger" data-action="delForwarder" data-id="${forwarder.id}" data-name="${escapeHtml(forwarder.name)}" title="删除">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 新建货代按钮
        const btnNew = document.getElementById('btnNewForwarder');
        if (btnNew && !btnNew.hasAttribute('data-bound')) {
            btnNew.setAttribute('data-bound', 'true');
            eventManager.on(btnNew, 'click', () => this._handleNewForwarder());
        }

        // 表格操作按钮委托
        const tbody = document.getElementById('forwardersTbody');
        if (tbody && !tbody.hasAttribute('data-events-bound')) {
            tbody.setAttribute('data-events-bound', 'true');
            eventManager.on(tbody, 'click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;

                const action = btn.dataset.action;
                const id = btn.dataset.id;
                const name = btn.dataset.name;

                if (action === 'editForwarder') {
                    this._handleEditForwarder(id);
                } else if (action === 'delForwarder') {
                    this._handleDeleteForwarder(id, name);
                }
            });
        }

        // 分页事件
        const btnPrev = document.getElementById('btnForwarderPrev');
        const btnNext = document.getElementById('btnForwarderNext');

        if (btnPrev && !btnPrev.hasAttribute('data-bound')) {
            btnPrev.setAttribute('data-bound', 'true');
            eventManager.on(btnPrev, 'click', () => {
                if (this._currentPage > 1) {
                    this.loadForwarders(this._currentPage - 1);
                }
            });
        }

        if (btnNext && !btnNext.hasAttribute('data-bound')) {
            btnNext.setAttribute('data-bound', 'true');
            eventManager.on(btnNext, 'click', () => {
                if (this._currentPage < this._totalPages) {
                    this.loadForwarders(this._currentPage + 1);
                }
            });
        }
    }

    /**
     * 处理新建货代
     */
    async _handleNewForwarder() {
        try {
            const { showForwarderEditDialog } = await import('../../components/dialogs/forwarder-edit-dialog.js');
            const result = await showForwarderEditDialog();

            if (result && result.success) {
                await this.loadForwarders(1);
            }
        } catch (error) {
            console.error('[ForwardersListView] 新建货代失败:', error);
        }
    }

    /**
     * 处理编辑货代
     */
    async _handleEditForwarder(id) {
        try {
            const forwarder = await this.apiService.forwarders.get(id);
            const { showForwarderEditDialog } = await import('../../components/dialogs/forwarder-edit-dialog.js');
            const result = await showForwarderEditDialog(forwarder);

            if (result && result.success) {
                // 保持在当前页
                await this.loadForwarders(this._currentPage);
            }
        } catch (error) {
            console.error('[ForwardersListView] 编辑货代失败:', error);
            window.NotificationSystem?.toast('加载货代数据失败', 'error');
        }
    }

    /**
     * 处理删除货代
     */
    async _handleDeleteForwarder(id, name) {
        if (confirm(`确定要删除货代 "${name}" 吗？此操作不可恢复。`)) {
            try {
                await this.apiService.forwarders.delete(id);
                window.NotificationSystem?.toast('货代删除成功', 'success');
                await this.loadForwarders(this._currentPage);
            } catch (error) {
                console.error('[ForwardersListView] 删除货代失败:', error);
                window.NotificationSystem?.toast('删除失败: ' + error.message, 'error');
            }
        }
    }

    /**
     * 渲染骨架屏
     */
    _renderSkeleton() {
        const tbody = document.getElementById('forwardersTbody');
        if (!tbody) return;

        tbody.innerHTML = Array(5).fill(0).map(() => `
      <tr>
        <td><div class="skeleton-line" style="width: 60%"></div></td>
        <td><div class="skeleton-line" style="width: 40%"></div></td>
        <td><div class="skeleton-line" style="width: 80%"></div></td>
        <td><div class="skeleton-line" style="width: 50%"></div></td>
        <td><div class="skeleton-line" style="width: 30%"></div></td>
      </tr>
    `).join('');
    }

    /**
     * 渲染错误状态
     */
    _renderError() {
        const tbody = document.getElementById('forwardersTbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #dc3545;">加载数据失败，请重试</td></tr>';
    }

    /**
     * 更新分页控件状态
     */
    _updatePagination() {
        const btnPrev = document.getElementById('btnForwarderPrev');
        const btnNext = document.getElementById('btnForwarderNext');
        const pageInfo = document.getElementById('forwarderPageInfo');

        if (btnPrev) btnPrev.disabled = this._currentPage <= 1;
        if (btnNext) btnNext.disabled = this._currentPage >= this._totalPages;
        if (pageInfo) pageInfo.textContent = `第 ${this._currentPage} / ${this._totalPages || 1} 页`;
    }
}
