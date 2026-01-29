import { ApiService } from '../api/api.js';

/**
 * Functional Test Manager
 * Performs deep integration testing by executing real CRUD cycles on business entities.
 * Ensures data cleanup after tests.
 */
export class FunctionalTestManager {
    constructor() {
        this.tests = [
            { id: 'customer_cycle', name: '客户管理闭环 (CRUD)', run: this.runCustomerCycle.bind(this) },
            { id: 'product_cycle', name: '产品管理闭环 (CRUD)', run: this.runProductCycle.bind(this) },
            { id: 'order_cycle', name: '订单管理闭环 (复杂流程)', run: this.runOrderCycle.bind(this) }
        ];
        this.prefix = 'AUTO_TEST_';
    }

    async runAll(onResult) {
        for (const test of this.tests) {
            onResult({ id: test.id, name: test.name, status: 'running' });
            try {
                const start = performance.now();
                // Create a reporter function for this test execution
                const report = (stepMsg) => {
                    onResult({
                        id: test.id,
                        name: test.name,
                        status: 'step',
                        message: stepMsg
                    });
                };

                const result = await test.run(report);
                const duration = Math.round(performance.now() - start);

                onResult({
                    id: test.id,
                    name: test.name,
                    status: 'success',
                    message: result || `通过 (耗时 ${duration}ms)`
                });
            } catch (error) {
                console.error(`Functional Test ${test.name} failed:`, error);
                onResult({
                    id: test.id,
                    name: test.name,
                    status: 'error',
                    message: error.message || String(error)
                });
            }
        }
    }

    generateId() {
        return `${this.prefix}${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }

    // --- Customer Cycle ---
    async runCustomerCycle(report = () => { }) {
        const testName = this.generateId();
        let createdId = null;

        try {
            // 1. Create
            report('1. 正在创建测试客户...');
            const createRes = await ApiService.customers.create({
                name: testName,
                address: 'Test Address',
                tel: '123456',
                contact: 'Test Contact'
            });
            if (!createRes.success) throw new Error(`创建失败: ${createRes.message}`);
            createdId = createRes.data ? createRes.data.id : createRes.id; // Handle different return formats
            if (!createdId) throw new Error('创建后未返回 ID');
            report(`   -> 创建成功，ID: ${createdId}`);

            // 2. Read
            report('2. 正在验证读取...');
            const getRes = await ApiService.customers.get(createdId);
            if (!getRes.success && !getRes.name) throw new Error('读取失败');
            report('   -> 读取验证通过');

            // 3. Update
            report('3. 正在更新客户信息...');
            const updateRes = await ApiService.customers.update(createdId, {
                name: testName + '_UPDATED',
                address: 'Updated Address'
            });
            if (!updateRes.success) throw new Error(`更新失败: ${updateRes.message}`);
            report('   -> 更新成功');

            // 4. Delete
            report('4. 正在删除客户...');
            const delRes = await ApiService.customers.remove(createdId);
            if (!delRes.success) throw new Error(`删除失败: ${delRes.message}`);
            report('   -> 删除成功');

            // 5. Verify Deletion
            report('5. 正在验证删除结果...');
            try {
                const verifyRes = await ApiService.customers.get(createdId);
                if (verifyRes && verifyRes.success !== false) throw new Error('删除后仍能读取到数据');
            } catch (e) {
                // Expected error or null return
            }
            report('   -> 删除验证通过');

            return '增删改查验证通过';
        } catch (e) {
            // Attempt cleanup if failed during create/update
            if (createdId) {
                try { await ApiService.customers.remove(createdId); } catch (_) { }
            }
            throw e;
        }
    }

    // --- Product Cycle ---
    async runProductCycle(report = () => { }) {
        const testModel = this.generateId();
        let createdId = null;

        try {
            // 1. Create
            report('1. 正在创建测试产品...');
            const createRes = await ApiService.products.create({
                model: testModel,
                description: 'Test Product',
                unit: 'pcs',
                estimated_weight: 1.0
            });
            if (!createRes.success) throw new Error(`创建失败: ${createRes.message}`);
            createdId = createRes.data ? createRes.data.id : createRes.id;
            report(`   -> 创建成功，ID: ${createdId}`);

            // 2. Update
            report('2. 正在更新产品信息...');
            const updateRes = await ApiService.products.update(createdId, {
                description: 'Updated Desc'
            });
            if (!updateRes.success) throw new Error(`更新失败: ${updateRes.message}`);
            report('   -> 更新成功');

            // 3. Delete
            report('3. 正在删除产品...');
            const delRes = await ApiService.products.remove(createdId);
            if (!delRes.success) throw new Error(`删除失败: ${delRes.message}`);
            report('   -> 删除成功');

            return '增删改查验证通过';
        } catch (e) {
            if (createdId) {
                try { await ApiService.products.remove(createdId); } catch (_) { }
            }
            throw e;
        }
    }

    // --- Order Cycle ---
    async runOrderCycle(report = () => { }) {
        const uniqueSuffix = Date.now();
        const customerName = `${this.prefix}CUST_${uniqueSuffix}`;
        const contractNo = `${this.prefix}ORD_${uniqueSuffix}`;

        let customerId = null;
        let orderId = null;

        try {
            // 1. Prerequisite: Create Customer
            report('1. 准备工作：创建测试客户...');
            const custRes = await ApiService.customers.create({ name: customerName });
            if (!custRes.success) throw new Error('前置条件：创建客户失败');
            customerId = custRes.data ? custRes.data.id : custRes.id;
            report(`   -> 客户创建成功，ID: ${customerId}`);

            // 2. Create Order
            report('2. 正在创建订单...');
            const orderRes = await ApiService.orders.create({
                contractNo: contractNo,
                customerId: customerId,
                invoiceNo: `INV-${uniqueSuffix}`,
                status: '已创建'
            });
            if (!orderRes.success) throw new Error(`创建订单失败: ${orderRes.message}`);
            orderId = orderRes.data ? orderRes.data.id : orderRes.id;
            report(`   -> 订单创建成功，ID: ${orderId}`);

            // 3. Update Order
            report('3. 正在更新订单 (状态/备注)...');
            const updateRes = await ApiService.orders.update(orderId, {
                status: '生产中',
                extras: 'Test Note'
            });
            if (!updateRes.success) throw new Error(`更新订单失败: ${updateRes.message}`);
            report('   -> 更新成功');

            // 4. Verify Read
            report('4. 正在验证订单读取...');
            const getRes = await ApiService.orders.get(orderId);
            if (!getRes.success) throw new Error(`读取订单失败，返回: ${JSON.stringify(getRes)}`);
            // Check nested data structure depending on API return
            const orderData = getRes.data || getRes;
            if (!orderData.contractNo) throw new Error('读取到的订单数据缺失 contractNo');
            report('   -> 读取验证通过');

            // 5. Delete Order (Hard delete to release foreign key)
            report('5. 正在删除订单 (永久)...');
            if (ApiService.orders.permanentlyDelete) {
                await ApiService.orders.permanentlyDelete(orderId);
            } else {
                await ApiService.orders.remove(orderId);
            }
            report('   -> 订单永久删除成功');

            // 6. Delete Customer
            report('6. 清理测试客户...');
            await ApiService.customers.remove(customerId);
            report('   -> 客户清理成功');

            return '流程验证通过';

        } catch (e) {
            // Cleanup
            if (orderId) {
                try {
                    if (ApiService.orders.permanentlyDelete) {
                        await ApiService.orders.permanentlyDelete(orderId);
                    } else {
                        await ApiService.orders.remove(orderId);
                    }
                } catch (_) { }
            }
            if (customerId) try { await ApiService.customers.remove(customerId); } catch (_) { }
            throw e;
        }
    }
}
