const { ipcRenderer } = require('electron');

// DOM元素
const launchBtn = document.getElementById('launchBtn');
const serverStatus = document.getElementById('serverStatus');
const logContent = document.getElementById('logContent');
const clearLogBtn = document.getElementById('clearLogBtn');
const toggleLogBtn = document.getElementById('toggleLogBtn');
const logContainer = document.getElementById('logContainer');

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    console.log('应用初始化开始...');
    
    // 添加调试信息到日志区域
    addLogMessage('info', '应用初始化开始...');
    
    // 加载配置信息
    await loadConfig();
    
    // 检查服务器状态
    checkServerStatus();
    
    // 添加初始化完成信息
    addLogMessage('success', '应用初始化完成');
});

// 加载配置信息
async function loadConfig() {
    try {
        const configData = await ipcRenderer.invoke('get-config');
        if (configData.success) {
            console.log('✅ 当前配置:', configData.config);
            addLogMessage('info', `当前配置: interface=${configData.config.interface}`);
        }
    } catch (error) {
        console.error('加载配置信息时出错:', error);
    }
}

// 更新启动按钮状态
function updateLaunchButton() {
    launchBtn.disabled = false;
    launchBtn.textContent = '🚀 启动项目';
}

// 启动项目
async function launchProject() {
    try {
        addLogMessage('info', '正在启动项目...');
        
        // 启动kiosk模式
        const launchResult = await ipcRenderer.invoke('launch-kiosk');
        if (launchResult.success) {
            showNotification('项目已启动全屏模式', 'success');
            addLogMessage('success', '项目启动成功');
        } else {
            showNotification(`启动失败: ${launchResult.error}`, 'error');
            addLogMessage('error', `启动失败: ${launchResult.error}`);
        }
    } catch (error) {
        console.error('启动项目时出错:', error);
        showNotification('启动项目失败', 'error');
        addLogMessage('error', `启动项目失败: ${error.message}`);
    }
}

// 检查服务器状态
async function checkServerStatus() {
    try {
        console.log('正在检查服务器状态...');
        addLogMessage('info', '正在检查服务器状态...');
        
        const response = await fetch('http://localhost:5260/status');
        if (response.ok) {
            serverStatus.textContent = '✅ 运行中';
            serverStatus.className = 'status-value success';
            addLogMessage('success', '服务器状态检查成功 - 服务运行中');
        } else {
            serverStatus.textContent = '❌ 连接失败';
            serverStatus.className = 'status-value error';
            addLogMessage('error', `服务器响应错误: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('检查服务器状态时出错:', error);
        serverStatus.textContent = '❌ 服务未启动';
        serverStatus.className = 'status-value error';
        addLogMessage('error', `服务器连接失败: ${error.message}`);
        addLogMessage('info', '请检查Node服务是否正常启动');
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // 3秒后自动移除
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// 日志处理功能
function addLogMessage(type, message) {
    const logItem = document.createElement('div');
    logItem.className = `log-item ${type}`;
    logItem.textContent = message;
    
    logContent.appendChild(logItem);
    
    // 自动滚动到底部
    logContent.scrollTop = logContent.scrollHeight;
    
    // 限制日志条数，避免内存泄漏
    const logItems = logContent.querySelectorAll('.log-item');
    if (logItems.length > 100) {
        logItems[0].remove();
    }
}

function clearLogs() {
    logContent.innerHTML = '<div class="log-item info">日志已清空</div>';
}

function toggleLogContainer() {
    logContainer.classList.toggle('collapsed');
    const isCollapsed = logContainer.classList.contains('collapsed');
    toggleLogBtn.textContent = isCollapsed ? '展开' : '收起';
}

// 监听来自主进程的日志消息
ipcRenderer.on('server-log', (event, logData) => {
    console.log('收到服务器日志:', logData);
    addLogMessage(logData.type, logData.message);
    
    // 更新服务状态
    if (logData.type === 'error') {
        serverStatus.textContent = '服务错误';
        serverStatus.className = 'status-value error';
    } else if (logData.type === 'warning') {
        serverStatus.textContent = '服务已停止';
        serverStatus.className = 'status-value warning';
    } else if (logData.message.includes('Server output')) {
        serverStatus.textContent = '服务运行中';
        serverStatus.className = 'status-value success';
    }
});

// 添加IPC连接测试
console.log('IPC监听器已设置');
addLogMessage('info', 'IPC监听器已设置，等待服务器日志...');

// 事件监听器
launchBtn.addEventListener('click', launchProject);
clearLogBtn.addEventListener('click', clearLogs);
toggleLogBtn.addEventListener('click', toggleLogContainer);

// 定期检查状态
setInterval(() => {
    checkServerStatus();
}, 10000); // 每10秒检查一次

// 全局函数（供HTML调用）
window.launchProject = launchProject;