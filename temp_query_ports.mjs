import fetch from 'node-fetch';

const API_BASE = 'http://127.0.0.1:3000/api';

async function queryDestinations() {
    try {
        // 先登录获取 token（使用管理员账号）
        console.log('正在登录...');
        const loginRes = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'admin', password: 'admin123' })
        });

        if (!loginRes.ok) {
            throw new Error('登录失败');
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
            throw new Error('查询订单失败');
        }

        const ordersData = await ordersRes.json();
        const orders = ordersData.data || [];

        // 统计目的港
        const destinationMap = new Map();

        orders.forEach(order => {
            if (order.destination && order.destination.trim()) {
                const dest = order.destination.trim();
                destinationMap.set(dest, (destinationMap.get(dest) || 0) + 1);
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
            console.log('❌ 数据库中暂无订单数据或订单未填写目的港\n');
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
            console.log(`✅ 总订单数：${totalOrders} 单`);
            console.log(`✅ 数据库总订单：${orders.length} 单\n`);
        }

    } catch (error) {
        console.error('❌ 查询失败:', error.message);
        process.exit(1);
    }
}

queryDestinations();
