import { ApiService } from '../api/api.js';

/**
 * 自检管理器
 * 负责管理和运行系统自检项
 */
export class SelfDiagnosisManager {
    constructor() {
        /**
         * @type {Map<string, {id: string, name: string, run: Function}>}
         */
        this.tests = new Map();
        this.currentCallback = null;
        this._initDefaultTests();
    }

    /**
     * 注册测试项
     * @param {string} id 测试ID
     * @param {string} name 测试名称
     * @param {Function} runFn 测试函数，返回 Promise<string>
     */
    registerTest(id, name, runFn) {
        this.tests.set(id, { id, name, run: runFn });
    }

    /**
     * 初始化默认测试项
     * @private
     */
    _initDefaultTests() {
        this.registerTest('latency', '网络延迟检测', this.checkLatency.bind(this));
        this.registerTest('backend', '后端服务连接', this.checkBackend.bind(this));
        this.registerTest('auth', '认证状态', this.checkAuth.bind(this));
        this.registerTest('db', '数据库连接', this.checkDatabase.bind(this));
        this.registerTest('router', '路由配置完整性', this.checkRouterConfig.bind(this));
        this.registerTest('customers', '客户管理 API', this.checkCustomerAPI.bind(this));
        this.registerTest('products', '产品管理 API', this.checkProductAPI.bind(this));
        this.registerTest('orders', '订单管理 API', this.checkOrderAPI.bind(this));
        this.registerTest('configs', '配置管理 API', this.checkConfigAPI.bind(this));
        this.registerTest('users', '用户管理 API', this.checkUserAPI.bind(this));
    }

    /**
     * 记录日志
     * @param {string} testId 测试ID
     * @param {string} message 消息内容
     */
    log(testId, message) {
        if (this.currentCallback) {
            this.currentCallback({
                id: testId,
                status: 'step',
                message: `  → ${message}`
            });
        }
    }

    /**
     * 运行所有测试
     * @param {Function} onResult 回调函数 (result) => void
     */
    async runAll(onResult) {
        this.currentCallback = onResult;
        let passCount = 0;
        let failCount = 0;
        const startTime = performance.now();
        const testList = Array.from(this.tests.values());

        // 使用 for...of 循环确保按顺序执行
        for (const test of testList) {
            onResult({ id: test.id, name: test.name, status: 'running' });

            // 给 UI 一点渲染时间
            await new Promise(resolve => setTimeout(resolve, 50));

            try {
                const testStart = performance.now();
                const result = await test.run();
                const duration = Math.round(performance.now() - testStart);

                onResult({
                    id: test.id,
                    name: test.name,
                    status: 'success',
                    message: `${result} (${duration}ms)`
                });
                passCount++;
            } catch (error) {
                console.error(`[自检] ${test.name} 失败:`, error);

                let errorMsg = error.message || String(error);
                // 优化错误显示
                if (errorMsg.includes('Failed to fetch')) {
                    errorMsg = '无法连接到服务器';
                }

                onResult({
                    id: test.id,
                    name: test.name,
                    status: 'error',
                    message: `失败: ${errorMsg}`
                });
                failCount++;
            }
        }

        const totalDuration = Math.round(performance.now() - startTime);

        // 显示汇总统计
        onResult({
            id: 'summary',
            name: '检测汇总',
            status: failCount === 0 ? 'success' : 'error',
            message: `完成 ${testList.length} 项检测：✅ ${passCount} 通过，❌ ${failCount} 失败 (总耗时: ${totalDuration}ms)`
        });

        this.currentCallback = null;
    }

    // ==================== 测试实现 ====================

    async checkLatency() {
        this.log('latency', 'Ping 后端接口...');
        const start = performance.now();
        const health = await ApiService.diagnostics.checkHealth();
        const duration = Math.round(performance.now() - start);

        if (!health) throw new Error('无响应');

        let status = '极快';
        if (duration > 100) status = '良好';
        if (duration > 500) status = '一般';
        if (duration > 1000) status = '较慢';

        return `${duration}ms (${status})`;
    }

    async checkBackend() {
        this.log('backend', '检查后端健康状态...');
        const health = await ApiService.diagnostics.checkHealth();

        if (!health || !health.success) {
            throw new Error('后端健康检查失败');
        }

        this.log('backend', '验证数据库文件...');
        if (!health.db_file_exists) {
            throw new Error('数据库文件不存在');
        }

        return '✓ 服务在线';
    }

    async checkAuth() {
        this.log('auth', '检查本地 Token...');
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('未找到登录凭证 (Token)');
        }

        this.log('auth', '验证 Token 有效性...');
        try {
            const user = await ApiService.auth.me();
            if (!user || (!user.username && !user.account)) {
                throw new Error('Token 有效但无法获取用户信息');
            }
            return `✓ 已登录 (${user.username || user.account})`;
        } catch (e) {
            console.warn('Auth check failed:', e);
            throw new Error('Token 无效或已过期');
        }
    }

    async checkDatabase() {
        this.log('db', '获取存储统计信息...');
        const res = await ApiService.storage.getStats();
        if (!res) {
            throw new Error('无法获取数据库统计');
        }

        let sizeBytes = 0;
        // 兼容不同的响应格式
        if (typeof res.fileSize === 'number') {
            sizeBytes = res.fileSize;
        } else if (res.stats && typeof res.stats.databaseSize === 'number') {
            sizeBytes = res.stats.databaseSize;
        } else if (typeof res.size === 'number') {
            sizeBytes = res.size;
        }

        const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
        this.log('db', `数据库文件大小: ${sizeMB} MB`);
        return `✓ 连接正常 (${sizeMB} MB)`;
    }

    async checkRouterConfig() {
        this.log('router', '检查 Router 实例...');
        // 尝试从不同的全局变量获取路由器
        const app = window.app || window.__app;
        const router = app?.router || window.router;

        if (!router) {
            this.log('router', '警告: 未找到全局 Router 实例，跳过检查');
            return '⚠️ 未检测到 Router (可能未暴露)';
        }

        if (!router.routes || router.routes.length === 0) {
            throw new Error('路由表为空');
        }

        this.log('router', `检查 ${router.routes.length} 个核心路由...`);
        const criticalRoutes = ['home', 'orders', 'settings'];
        const missing = criticalRoutes.filter(r => !router.routes.includes(r));

        if (missing.length > 0) {
            throw new Error(`缺少关键路由: ${missing.join(', ')}`);
        }

        return `✓ 配置正常 (${router.routes.length} 个路由)`;
    }

    async checkCustomerAPI() {
        this.log('customers', '请求客户列表...');
        const res = await ApiService.customers.list();

        if (!Array.isArray(res)) {
            throw new Error('API 返回格式错误: 期望数组');
        }

        const count = res.length;
        this.log('customers', `获取到 ${count} 个客户`);
        return `✓ 正常 (${count} 条记录)`;
    }

    async checkProductAPI() {
        this.log('products', '请求产品列表...');
        const res = await ApiService.products.list();

        if (!Array.isArray(res)) {
            throw new Error('API 返回格式错误: 期望数组');
        }

        const count = res.length;
        this.log('products', `获取到 ${count} 个产品`);
        return `✓ 正常 (${count} 条记录)`;
    }

    async checkOrderAPI() {
        this.log('orders', '请求订单列表 (第一页)...');
        // 只请求第一页，减少负载
        const res = await ApiService.orders.list({ page: 1, pageSize: 1 });

        if (!res || (typeof res.total !== 'number' && !Array.isArray(res))) {
            // 兼容直接返回数组的情况
            if (Array.isArray(res)) {
                return `✓ 正常 (${res.length} 条记录)`;
            }
            throw new Error('API 返回格式错误: 期望分页对象');
        }

        const total = res.total;
        this.log('orders', `数据库中共有 ${total} 个订单`);
        return `✓ 正常 (${total} 条记录)`;
    }

    async checkConfigAPI() {
        this.log('configs', '请求系统配置...');
        const res = await ApiService.orderConfigs.list();

        if (!Array.isArray(res)) {
            throw new Error('API 返回格式错误: 期望数组');
        }

        const count = res.length;
        return `✓ 正常 (${count} 个配置项)`;
    }

    async checkUserAPI() {
        this.log('users', '请求系统用户...');
        try {
            const res = await ApiService.users.list();
            if (!Array.isArray(res)) {
                throw new Error('API 返回格式错误: 期望数组');
            }
            return `✓ 正常 (${res.length} 个用户)`;
        } catch (e) {
            // 普通用户可能没有权限获取用户列表
            if (e.status === 403 || e.message.includes('403') || e.message.includes('Permission')) {
                return '⚠️ 跳过 (权限不足)';
            }
            throw e;
        }
    }
}
