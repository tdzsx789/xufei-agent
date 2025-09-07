const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// D盘stored_images文件夹路径
const STORED_IMAGES_PATH = 'D:\\stored_images';

// 检查并创建stored_images文件夹
function checkAndCreateStoredImagesFolder() {
    try {
        console.log('检查D盘stored_images文件夹...');
        
        if (!fs.existsSync(STORED_IMAGES_PATH)) {
            console.log('stored_images文件夹不存在，正在创建...');
            fs.mkdirSync(STORED_IMAGES_PATH, { recursive: true });
            console.log('✅ stored_images文件夹创建成功！');
            return { success: true, created: true, message: '文件夹创建成功' };
        } else {
            console.log('✅ stored_images文件夹已存在');
            return { success: true, created: false, message: '文件夹已存在' };
        }
    } catch (error) {
        console.error('❌ 检查/创建stored_images文件夹时出错:', error);
        return { 
            success: false, 
            created: false, 
            message: `错误: ${error.message}` 
        };
    }
}

// 获取文件夹状态
function getFolderStatus() {
    try {
        const exists = fs.existsSync(STORED_IMAGES_PATH);
        const stats = exists ? fs.statSync(STORED_IMAGES_PATH) : null;
        
        return {
            exists: exists,
            path: STORED_IMAGES_PATH,
            isDirectory: exists ? stats.isDirectory() : false,
            created: exists ? stats.birthtime : null,
            modified: exists ? stats.mtime : null
        };
    } catch (error) {
        return {
            exists: false,
            path: STORED_IMAGES_PATH,
            error: error.message
        };
    }
}

// 路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'web.html'));
});

app.get('/status', (req, res) => {
    res.json({ 
        status: 'running', 
        timestamp: new Date().toISOString(),
        message: 'Node服务运行正常'
    });
});

app.get('/folder-status', (req, res) => {
    const folderStatus = getFolderStatus();
    res.json(folderStatus);
});

app.post('/create-folder', (req, res) => {
    const result = checkAndCreateStoredImagesFolder();
    res.json(result);
});

app.get('/folder-info', (req, res) => {
    const folderStatus = getFolderStatus();
    res.json(folderStatus);
});

// 获取保存的URL
app.get('/stored-url', (req, res) => {
    try {
        const data = fs.readFileSync('stored_url.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.json({ url: '' });
    }
});

// 保存URL
app.post('/save-url', (req, res) => {
    try {
        const { url } = req.body;
        const data = { url: url, timestamp: new Date().toISOString() };
        fs.writeFileSync('stored_url.json', JSON.stringify(data, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('保存URL时出错:', error);
        res.json({ success: false, error: error.message });
    }
});

// 打开URL
app.post('/open-url', (req, res) => {
    try {
        const { url } = req.body;
        // 在Windows上使用start命令打开URL
        exec(`start ${url}`, (error) => {
            if (error) {
                console.error('打开URL时出错:', error);
                res.json({ success: false, error: error.message });
            } else {
                res.json({ success: true });
            }
        });
    } catch (error) {
        console.error('打开URL时出错:', error);
        res.json({ success: false, error: error.message });
    }
});

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        memory: process.memoryUsage(),
        folder: getFolderStatus()
    });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        error: '内部服务器错误',
        message: err.message
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        error: '未找到请求的资源',
        path: req.path
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 Web服务器已启动，端口: ${PORT}`);
    console.log(`📁 服务地址: http://localhost:${PORT}`);
    
    // 启动时检查并创建文件夹
    const result = checkAndCreateStoredImagesFolder();
    if (result.success) {
        console.log(`📂 ${result.message}`);
    } else {
        console.error(`❌ ${result.message}`);
    }
    
    console.log('✅ 服务器准备就绪！');
    console.log('🌐 请在浏览器中打开: http://localhost:3000');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 收到关闭信号，正在关闭服务器...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在关闭服务器...');
    process.exit(0);
});

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
    console.error('❌ 未捕获的异常:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
});
