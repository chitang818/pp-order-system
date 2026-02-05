// 使用 Node.js 18+ 内置的 fetch
async function queryDestinations() {
    try {
        const API_BASE = 'http://127.0.0.1:3000/api';

        // 先登录获取 token（使用管理员账号）
        console.log('正在登录...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });

        if (!loginRes.ok) {
            throw new Error(`登录失败: ${loginRes.status} ${loginRes.statusText}`);
        }

        const loginData = await loginRes.json();
        const token = loginData.data.token;

        // 查询所有订单
        console.log('正在查询订单数据...\n');
        const ordersRes = await fetch(`${API_BASE}/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!ordersRes.ok) {
            throw new Error(`查询订单失败: ${ordersRes.status} ${ordersRes.statusText}`);
        }

        const ordersData = await ordersRes.json();
        const orders = ordersData.data || [];

        console.log(`📦 查询到订单总数: ${orders.length} 单\n`);

        // 调试：查看前几个订单的字段
        if (orders.length > 0) {
            console.log('📋 订单字段示例 (前3单):');
            orders.slice(0, 3).forEach((order, idx) => {
                console.log(`\n订单 ${idx + 1}:`);
                console.log('  - 合同号:', order.contractNo || order.contract_no || '(无)');
                console.log('  - destination:', order.destination);
                console.log('  - portOfDestination:', order.portOfDestination);
                console.log('  - port_of_destination:', order.port_of_destination);
                console.log('  - 所有字段:', Object.keys(order).join(', '));
            });
            console.log('\n');
        }

        // 统计目的港 - 尝试多个可能的字段名
        const destinationMap = new Map();

        orders.forEach(order => {
            // 尝试多个可能的字段名
            const dest = order.destination
                || order.portOfDestination
                || order.port_of_destination
                || order.destinationPort
                || order.destination_port;

            if (dest && typeof dest === 'string' && dest.trim()) {
                const destTrimmed = dest.trim();
                destinationMap.set(destTrimmed, (destinationMap.get(destTrimmed) || 0) + 1);
            }
        });

        // 转换为数组并排序
        const results = Array.from(destinationMap.entries())
            .map(([destination, count]) => ({ destination, count }))
            .sort((a, b) => b.count - a.count || a.destination.localeCompare(b.destination));

        // 输出结果
        console.log('========================================');
        console.log('📊 目的港统计结果');
        console.log('========================================\n');

        if (results.length === 0) {
            console.log('❌ 未找到填写了目的港的订单');
            console.log('\n可能原因:');
            console.log('  1. 订单的目的港字段为空');
            console.log('  2. 目的港字段名称与预期不符');
            console.log('  3. 所有订单都未填写目的港信息\n');
        } else {
            console.log('序号\t目的港名称\t\t\t订单数量');
            console.log('----------------------------------------');

            results.forEach((item, index) => {
                const padding = '\t'.repeat(Math.max(1, 4 - Math.floor(item.destination.length / 8)));
                console.log(`${index + 1}.\t${item.destination}${padding}${item.count} 单`);
            });

            console.log('========================================');
            const totalPorts = results.length;
            const totalOrders = results.reduce((sum, r) => sum + r.count, 0);
            console.log(`\n✅ 共计：${totalPorts} 个不同的目的港`);
            console.log(`✅ 填写目的港的订单：${totalOrders} 单`);
            console.log(`✅ 未填写目的港：${orders.length - totalOrders} 单`);
            console.log(`✅ 数据库总订单：${orders.length} 单\n`);
        }

    } catch (error) {
        console.error('❌ 查询失败:', error.message);
        console.error('\n提示：请确保后端服务正在运行 (http://127.0.0.1:3000)');
        process.exit(1);
    }
}

queryDestinations();
