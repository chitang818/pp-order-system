/**
 * 虚拟滚动工具类 (VirtualScroller)
 * 用于优化大数据量列表的渲染性能，只渲染可视区域内的元素
 */
export class VirtualScroller {
    /**
     * @param {Object} options 配置项
     * @param {HTMLElement|Window} options.scrollContainer 滚动容器，默认为 window
     * @param {HTMLElement} options.contentContainer 内容容器 (e.g., tbody, ul, div)
     * @param {Array} options.items 数据列表
     * @param {number} options.itemHeight 列表项固定高度 (px)
     * @param {Function} options.renderCallback 渲染回调 (items) => void
     * @param {number} options.buffer 缓冲区大小 (条数)，默认 10
     */
    constructor(options) {
        this.scrollContainer = options.scrollContainer || window;
        this.contentContainer = options.contentContainer;
        this.items = options.items || [];
        this.itemHeight = options.itemHeight || 55; // 默认行高，需根据 CSS 调整
        this.renderCallback = options.renderCallback;
        this.buffer = options.buffer || 10;
        this._colSpan = this._detectColSpan();

        this.state = {
            scrollTop: 0,
            viewportHeight: 0,
            lastStartIndex: -1,
            lastEndIndex: -1
        };

        this._onScroll = this._onScroll.bind(this);
        this._onResize = this._onResize.bind(this);
        this._rafId = null;

        this.init();
    }

    _detectColSpan() {
        try {
            if (!this.contentContainer) return 1;
            if (String(this.contentContainer.tagName || '').toUpperCase() === 'TBODY') {
                const table = this.contentContainer.closest('table');
                const thCount = table?.querySelectorAll('thead th')?.length || 0;
                return thCount > 0 ? thCount : 1;
            }
        } catch (_) { }
        return 1;
    }

    _getContentOffsetTop() {
        try {
            if (!this.contentContainer) return 0;
            
            // 如果滚动容器是 window，直接返回内容相对于文档的偏移
            if (this.scrollContainer === window) {
                const contentRect = this.contentContainer.getBoundingClientRect();
                return contentRect.top + window.scrollY;
            }
            
            // 如果滚动容器是元素，计算内容相对于滚动容器的偏移
            const contentRect = this.contentContainer.getBoundingClientRect();
            const containerRect = this.scrollContainer.getBoundingClientRect();
            
            // 内容在滚动容器内的相对位置 = 内容顶部 - 容器顶部 + 容器已滚动距离
            const relativeTop = contentRect.top - containerRect.top;
            return relativeTop + this.scrollContainer.scrollTop;
        } catch (e) {
            console.warn('[VirtualScroller] _getContentOffsetTop 计算失败:', e);
            return 0;
        }
    }

    _ensureSpacerRow(id) {
        if (!this.contentContainer) return null;
        let tr = this.contentContainer.querySelector(`#${id}`);
        if (!tr) {
            tr = document.createElement('tr');
            tr.id = id;
            tr.style.pointerEvents = 'none';
            tr.style.border = '0';

            const td = document.createElement('td');
            td.setAttribute('colspan', String(this._colSpan || 1));
            td.style.padding = '0';
            td.style.border = '0';
            td.style.height = '0px';
            tr.appendChild(td);
        }
        return tr;
    }

    init() {
        // 先更新尺寸，确保 viewportHeight 正确
        this.updateDimensions();

        const target = this.scrollContainer === window ? window : this.scrollContainer;
        target.addEventListener('scroll', this._onScroll, { passive: true });
        window.addEventListener('resize', this._onResize);

        // 延迟初始渲染，确保 DOM 已完全布局
        // 使用 requestAnimationFrame 确保在下一帧渲染，此时布局已完成
        requestAnimationFrame(() => {
            this.updateDimensions(); // 再次更新尺寸，确保准确
            this.refresh();
        });
    }

    destroy() {
        const target = this.scrollContainer === window ? window : this.scrollContainer;
        target.removeEventListener('scroll', this._onScroll);
        window.removeEventListener('resize', this._onResize);
        if (this._rafId) cancelAnimationFrame(this._rafId);
    }

    setItems(newItems) {
        this.items = newItems || [];
        this.refresh();
    }

    refresh() {
        this.state.lastStartIndex = -1; // Force re-render
        this.state.lastEndIndex = -1; // Force re-render
        this.updateDimensions();
        // 使用 requestAnimationFrame 确保在布局完成后渲染
        requestAnimationFrame(() => {
            this.updateRender();
        });
    }

    updateDimensions() {
        if (this.scrollContainer === window) {
            this.state.viewportHeight = window.innerHeight;
            this.state.scrollTop = window.scrollY;
        } else {
            // 对于元素滚动容器，使用 clientHeight（可视区域高度）
            this.state.viewportHeight = this.scrollContainer.clientHeight || this.scrollContainer.offsetHeight;
            this.state.scrollTop = this.scrollContainer.scrollTop || 0;
        }
        
        // 调试日志
        if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
            console.log(`[VirtualScroller] 更新尺寸:`, {
                viewportHeight: this.state.viewportHeight,
                scrollTop: this.state.scrollTop,
                totalItems: this.items.length,
                itemHeight: this.itemHeight
            });
        }
    }

    _onScroll() {
        // 更新滚动位置
        if (this.scrollContainer === window) {
            this.state.scrollTop = window.scrollY;
        } else {
            this.state.scrollTop = this.scrollContainer.scrollTop || 0;
        }
        
        // 调试日志：滚动时输出
        if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
            console.log(`[VirtualScroller] 滚动事件: scrollTop=${this.state.scrollTop}`);
        }
        
        this._requestTick();
    }

    _onResize() {
        this.updateDimensions();
        this._requestTick();
    }

    _requestTick() {
        if (!this._rafId) {
            this._rafId = requestAnimationFrame(() => {
                this.updateRender();
                this._rafId = null;
            });
        }
    }

    updateRender() {
        const { scrollTop, viewportHeight } = this.state;
        const totalItems = this.items.length;

        if (totalItems === 0) {
            // 如果没有数据，清空内容
            if (this.renderCallback) {
                this.renderCallback([]);
            }
            return;
        }

        // 修正：滚动容器内通常还有顶部区域（统计/筛选/表头等）
        // 计算内容区域在滚动容器内的相对位置
        const contentTop = this._getContentOffsetTop();
        
        // effectiveScrollTop：内容区域相对于滚动容器顶部的滚动距离
        // 如果 scrollTop < contentTop，说明还没有滚动到内容区域，effectiveScrollTop = 0
        // 如果 scrollTop >= contentTop，说明已经滚动到内容区域，effectiveScrollTop = scrollTop - contentTop
        let effectiveScrollTop = Math.max(0, scrollTop - contentTop);

        // 计算内容区域的实际可视高度
        // 如果 scrollTop < contentTop，说明内容区域还没有完全进入视口
        // 此时内容区域的可视高度 = viewportHeight - (contentTop - scrollTop)
        // 如果 scrollTop >= contentTop，说明内容区域已经完全进入视口
        // 此时内容区域的可视高度 = viewportHeight
        const contentViewportHeight = scrollTop < contentTop 
            ? Math.max(0, viewportHeight - (contentTop - scrollTop))
            : viewportHeight;

        // 计算可见范围：考虑缓冲区
        // startIndex：从 effectiveScrollTop 对应的位置开始，向上扩展 buffer 个
        let startIndex = Math.floor(effectiveScrollTop / this.itemHeight) - this.buffer;
        // endIndex：从 effectiveScrollTop + contentViewportHeight 对应的位置结束，向下扩展 buffer 个
        let endIndex = Math.ceil((effectiveScrollTop + contentViewportHeight) / this.itemHeight) + this.buffer;

        // 边界检查
        if (startIndex < 0) startIndex = 0;
        if (endIndex > totalItems) endIndex = totalItems;

        // 调试日志：只在开发环境输出
        if (process.env.NODE_ENV === 'development' || window.location.hostname === 'localhost') {
            const contentViewportHeight = scrollTop < contentTop 
                ? Math.max(0, viewportHeight - (contentTop - scrollTop))
                : viewportHeight;
            console.log(`[VirtualScroller] 计算可见范围:`, {
                scrollTop,
                contentTop,
                effectiveScrollTop,
                viewportHeight,
                contentViewportHeight,
                itemHeight: this.itemHeight,
                totalItems,
                startIndex,
                endIndex,
                visibleCount: endIndex - startIndex,
                calculation: {
                    startCalc: `Math.floor(${effectiveScrollTop} / ${this.itemHeight}) - ${this.buffer} = ${Math.floor(effectiveScrollTop / this.itemHeight) - this.buffer}`,
                    endCalc: `Math.ceil((${effectiveScrollTop} + ${contentViewportHeight}) / ${this.itemHeight}) + ${this.buffer} = ${Math.ceil((effectiveScrollTop + contentViewportHeight) / this.itemHeight) + this.buffer}`
                }
            });
        }

        // 只有当可视范围发生变化时才重新渲染
        if (startIndex === this.state.lastStartIndex && endIndex === this.state.lastEndIndex) {
            return;
        }

        this.state.lastStartIndex = startIndex;
        this.state.lastEndIndex = endIndex;

        const visibleItems = this.items.slice(startIndex, endIndex);
        const paddingTop = startIndex * this.itemHeight;
        const paddingBottom = (totalItems - endIndex) * this.itemHeight;

        // 先执行渲染回调（清空并填充可见行）
        if (this.renderCallback) {
            this.renderCallback(visibleItems);
        }

        // 渲染后插入 Spacer
        if (this.contentContainer) {
            // 创建或更新 Top Spacer
            const topSpacer = this._ensureSpacerRow('virtual-spacer-top');
            if (topSpacer && !topSpacer.isConnected) {
                this.contentContainer.prepend(topSpacer);
            }
            const topTd = topSpacer?.firstElementChild;
            if (topTd) topTd.style.height = `${paddingTop}px`;
            // 如果高度为0，可以隐藏，避免边框重叠等问题
            if (topSpacer) topSpacer.style.display = paddingTop > 0 ? '' : 'none';

            // 创建或更新 Bottom Spacer
            const bottomSpacer = this._ensureSpacerRow('virtual-spacer-bottom');
            if (bottomSpacer && !bottomSpacer.isConnected) {
                this.contentContainer.append(bottomSpacer);
            }
            const bottomTd = bottomSpacer?.firstElementChild;
            if (bottomTd) bottomTd.style.height = `${paddingBottom}px`;
            if (bottomSpacer) bottomSpacer.style.display = paddingBottom > 0 ? '' : 'none';
        }
    }
}
