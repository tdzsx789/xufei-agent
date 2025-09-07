const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// 设置控制台编码为UTF-8
if (process.platform === 'win32') {
    try {
        // 设置控制台代码页为UTF-8
        require('child_process').exec('chcp 65001', (error) => {
            if (error) {
                console.log('设置控制台编码失败，使用默认编码');
            }
        });
    } catch (e) {
        console.log('无法设置控制台编码');
    }
}

// 读取配置文件
let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('Config file loaded successfully:', config);
    } else {
        console.log('Config file not found, using default config');
        config = { interface: true, address: __dirname, entrance: "main.html" };
    }
} catch (error) {
    console.error('Failed to read config file:', error);
    config = { interface: true, address: __dirname, entrance: "main.html" };
}

const app = express();
const PORT = 5260;

// D盘stored_images文件夹路径
const STORED_IMAGES_PATH = 'D:\\stored_images';

// 中间件
app.use(cors());
app.use(express.json());

// 静态文件服务 - 提供图片访问
app.use('/images', express.static(STORED_IMAGES_PATH));

// 配置multer用于文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // 确保目标文件夹存在
        if (!fs.existsSync(STORED_IMAGES_PATH)) {
            fs.mkdirSync(STORED_IMAGES_PATH, { recursive: true });
        }
        cb(null, STORED_IMAGES_PATH);
    },
    filename: function (req, file, cb) {
        // 生成唯一文件名：时间戳_原文件名
        const timestamp = Date.now();
        const originalName = file.originalname;
        const fileName = `${timestamp}_${originalName}`;
        cb(null, fileName);
    }
});

// 文件过滤器 - 只允许图片文件
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|bmp|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件 (jpeg, jpg, png, gif, bmp, webp)'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 限制文件大小为10MB
    }
});

// 检查并创建stored_images文件夹
function checkAndCreateStoredImagesFolder() {
    try {
        console.log('Checking D:\\stored_images folder...');
        
        if (!fs.existsSync(STORED_IMAGES_PATH)) {
            console.log('stored_images folder does not exist, creating...');
            fs.mkdirSync(STORED_IMAGES_PATH, { recursive: true });
            console.log('stored_images folder created successfully!');
            return { success: true, created: true, message: 'Folder created successfully' };
        } else {
            console.log('stored_images folder already exists');
            return { success: true, created: false, message: 'Folder already exists' };
        }
    } catch (error) {
        console.error('Error checking/creating stored_images folder:', error);
        return { 
            success: false, 
            created: false, 
            message: `Error: ${error.message}` 
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
app.get('/status', (req, res) => {
    res.json({ 
        status: 'running', 
        timestamp: new Date().toISOString(),
        message: 'Node service running normally'
    });
});

// 获取配置信息
app.get('/config', (req, res) => {
    res.json({
        success: true,
        config: config
    });
});

// 根据配置决定是否显示界面
app.get('/shouldShowInterface', (req, res) => {
    res.json({
        success: true,
        showInterface: config.interface === true,
        address: config.address
    });
});

app.get('/folder-status', (req, res) => {
    const folderStatus = getFolderStatus();
    res.json(folderStatus);
});

// 图片上传接口 - 支持单个文件上传
app.post('/storeImage', upload.single('image'), (req, res) => {
    try {
        // 首先确保文件夹存在
        const folderResult = checkAndCreateStoredImagesFolder();
        
        if (!folderResult.success) {
            return res.status(500).json({
                success: false,
                message: `文件夹创建失败: ${folderResult.message}`,
                uploadedFiles: []
            });
        }

        // 处理上传的文件
        const uploadedFile = req.file;

        if (uploadedFile) {
            const fileInfo = {
                originalName: uploadedFile.originalname,
                fileName: uploadedFile.filename,
                path: uploadedFile.path,
                size: uploadedFile.size,
                mimetype: uploadedFile.mimetype,
                uploadTime: new Date().toISOString()
            };
        }

        // 获取文件夹中的文件列表
        let fileList = [];
        try {
            const files = fs.readdirSync(STORED_IMAGES_PATH);
            fileList = files.map(file => {
                const filePath = path.join(STORED_IMAGES_PATH, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime
                };
            });
        } catch (error) {
            console.error('Error reading file list:', error);
        }

        res.json({
            success: true,
            message: `Folder status: ${folderResult.message}`,
            uploadedFile: uploadedFile ? {
                originalName: uploadedFile.originalname,
                fileName: uploadedFile.filename,
                path: uploadedFile.path,
                size: uploadedFile.size,
                mimetype: uploadedFile.mimetype,
                uploadTime: new Date().toISOString()
            } : null,
            folderPath: STORED_IMAGES_PATH,
            fileList: fileList,
            totalFiles: fileList.length
        });

    } catch (error) {
        console.error('Error processing image upload:', error);
        res.status(500).json({
            success: false,
            message: `Error processing upload: ${error.message}`,
            uploadedFile: null
        });
    }
});

// 错误处理中间件 - 处理multer错误
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'File size exceeds limit (max 10MB)'
            });
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'Upload file count exceeds limit (only 1 file allowed)'
            });
        }
    }
    
    if (error.message.includes('只允许上传图片文件')) {
        return res.status(400).json({
            success: false,
            message: 'Only image files are allowed (jpeg, jpg, png, gif, bmp, webp)'
        });
    }
    
    next(error);
});

app.post('/create-folder', (req, res) => {
    const result = checkAndCreateStoredImagesFolder();
    res.json(result);
});

app.get('/folder-info', (req, res) => {
    const folderStatus = getFolderStatus();
    res.json(folderStatus);
});

// 获取所有图片的访问地址
app.get('/getImages', (req, res) => {
    try {
        // 检查文件夹是否存在
        if (!fs.existsSync(STORED_IMAGES_PATH)) {
            return res.json({
                success: true,
                message: 'stored_images folder does not exist',
                images: []
            });
        }

        // 获取文件夹中的文件列表
        const files = fs.readdirSync(STORED_IMAGES_PATH);
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(ext);
        });

        // 生成图片的访问地址
        const images = imageFiles.map(file => {
            const filePath = path.join(STORED_IMAGES_PATH, file);
            const stats = fs.statSync(filePath);
            
            return {
                filename: file,
                url: `http://localhost:${PORT}/images/${file}`, // 用于前端访问的URL
                localPath: filePath, // 本地文件路径
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            };
        });

        res.json({
            success: true,
            message: `Found ${images.length} images`,
            images: images,
            totalCount: images.length
        });

    } catch (error) {
        console.error('Error getting image list:', error);
        res.status(500).json({
            success: false,
            message: `Error getting image list: ${error.message}`,
            images: []
        });
    }
});

// 获取已上传的图片列表
app.get('/storeImage', (req, res) => {
    try {
        const folderResult = checkAndCreateStoredImagesFolder();
        
        if (!folderResult.success) {
            return res.status(500).json({
                success: false,
                message: `Folder access failed: ${folderResult.message}`,
                fileList: []
            });
        }

        // 获取文件夹中的文件列表
        let fileList = [];
        try {
            const files = fs.readdirSync(STORED_IMAGES_PATH);
            fileList = files.map(file => {
                const filePath = path.join(STORED_IMAGES_PATH, file);
                const stats = fs.statSync(filePath);
                return {
                    name: file,
                    size: stats.size,
                    created: stats.birthtime,
                    modified: stats.mtime,
                    isImage: /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(file)
                };
            });
        } catch (error) {
            console.error('Error reading file list:', error);
        }

        res.json({
            success: true,
            message: `Folder status: ${folderResult.message}`,
            folderPath: STORED_IMAGES_PATH,
            fileList: fileList,
            totalFiles: fileList.length,
            imageFiles: fileList.filter(file => file.isImage).length
        });

    } catch (error) {
        console.error('Error getting image list:', error);
        res.status(500).json({
            success: false,
            message: `Error getting image list: ${error.message}`,
            fileList: []
        });
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
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// 404处理
app.use((req, res) => {
    res.status(404).json({
        error: 'Requested resource not found',
        path: req.path
    });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Node server started on port: ${PORT}`);
    console.log(`Service address: http://localhost:${PORT}`);
    console.log('Server ready!');
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\nReceived shutdown signal, closing server...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nReceived termination signal, closing server...');
    process.exit(0);
});

// 未捕获的异常处理
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise rejection:', reason);
    process.exit(1);
});
