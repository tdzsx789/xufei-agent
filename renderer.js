const { ipcRenderer } = require('electron');

// DOM元素
const addProjectBtn = document.getElementById('addProjectBtn');
const launchBtn = document.getElementById('launchBtn');
const projectsList = document.getElementById('projectsList');
const serverStatus = document.getElementById('serverStatus');

// 项目数据（只保留一个项目）
let currentProject = null;

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    console.log('应用初始化开始...');
    
    // 加载项目数据
    await loadProject();
    
    // 加载配置信息
    await loadConfig();
    
    // 检查服务器状态
    checkServerStatus();
});

// 加载项目数据
async function loadProject() {
    try {
        const data = await ipcRenderer.invoke('get-project');
        currentProject = data;
        renderProject();
    } catch (error) {
        console.error('加载项目数据时出错:', error);
        currentProject = null;
        renderProject();
    }
}

// 加载配置信息
async function loadConfig() {
    try {
        const configData = await ipcRenderer.invoke('get-config');
        if (configData.success) {
            console.log('✅ 当前配置:', configData.config);
            // 可以在界面上显示配置信息
            showNotification(`当前配置: interface=${configData.config.interface}, address=${configData.config.address}`, 'info');
        }
    } catch (error) {
        console.error('加载配置信息时出错:', error);
    }
}

// 保存项目数据
async function saveProject() {
    try {
        await ipcRenderer.invoke('save-project', currentProject);
    } catch (error) {
        console.error('保存项目数据时出错:', error);
        showNotification('保存项目失败', 'error');
    }
}

// 渲染项目
function renderProject() {
    projectsList.innerHTML = '';
    
    if (!currentProject) {
        projectsList.innerHTML = '<p style="text-align: center; color: #a0aec0; padding: 20px;">暂无项目，点击"选择项目文件夹"开始创建</p>';
        updateLaunchButton();
        return;
    }
    
    const projectElement = createProjectElement(currentProject);
    projectsList.appendChild(projectElement);
    updateLaunchButton();
}

// 创建项目元素
function createProjectElement(project) {
    const projectDiv = document.createElement('div');
    projectDiv.className = 'project-item';
    projectDiv.innerHTML = `
        <div class="project-header">
            <div class="project-name">
                <span>${project.name}</span>
            </div>
            <div class="project-actions">
                <button class="btn btn-folder" onclick="openFolder()">📁 打开文件夹</button>
                <button class="btn btn-delete" onclick="deleteProject()">🗑️ 删除</button>
            </div>
        </div>
        <div class="project-path-label">项目路径:</div>
        <div class="project-path">
            ${project.path}
        </div>
    `;
    return projectDiv;
}

// 添加/更新项目
async function addProject() {
    try {
        const result = await ipcRenderer.invoke('select-folder');
        if (result.success && result.path) {
            // 从路径中提取文件夹名称作为项目名称
            const projectName = result.path.split('\\').pop() || result.path.split('/').pop() || '新项目';
            
            const isUpdate = currentProject !== null;
            currentProject = {
                id: Date.now(),
                name: projectName,
                path: result.path
            };
            
            // 保存项目数据
            await saveProject();
            
            // 更新配置文件中的地址
            try {
                const configResult = await ipcRenderer.invoke('update-config', {
                    address: result.path
                });
                if (configResult.success) {
                    console.log('✅ 配置文件已更新:', configResult.config);
                } else {
                    console.error('❌ 更新配置文件失败:', configResult.error);
                }
            } catch (configError) {
                console.error('❌ 更新配置文件时出错:', configError);
            }
            
            renderProject();
            showNotification(isUpdate ? '项目更新成功' : '项目添加成功', 'success');
        } else if (result.cancelled) {
            showNotification('已取消操作', 'info');
        } else {
            showNotification('选择文件夹失败', 'error');
        }
    } catch (error) {
        console.error('添加项目时出错:', error);
        showNotification('添加项目失败', 'error');
    }
}

// 打开文件夹
async function openFolder() {
    try {
        if (currentProject && currentProject.path) {
            await ipcRenderer.invoke('open-folder', currentProject.path);
            showNotification('正在打开文件夹', 'success');
        } else {
            showNotification('项目路径不存在', 'error');
        }
    } catch (error) {
        console.error('打开文件夹时出错:', error);
        showNotification('打开文件夹失败', 'error');
    }
}

// 删除项目
function deleteProject() {
    if (confirm(`确定要删除项目"${currentProject.name}"吗？`)) {
        currentProject = null;
        saveProject();
        renderProject();
        showNotification('项目删除成功', 'success');
    }
}

// 更新启动按钮状态
function updateLaunchButton() {
    if (currentProject && currentProject.path) {
        launchBtn.disabled = false;
        launchBtn.textContent = '🚀 启动项目';
    } else {
        launchBtn.disabled = true;
        launchBtn.textContent = '🚀 启动项目';
    }
}

// 启动项目
async function launchProject() {
    try {
        if (currentProject && currentProject.path) {
            // 首先更新配置中的address
            const configData = await ipcRenderer.invoke('get-config');
            if (configData.success) {
                // 更新配置中的address为当前项目路径
                const updateResult = await ipcRenderer.invoke('update-config', {
                    address: currentProject.path
                });
                
                if (updateResult.success) {
                    console.log('配置已更新，address设置为:', currentProject.path);
                    
                    // 启动kiosk模式
                    const launchResult = await ipcRenderer.invoke('launch-kiosk');
                    if (launchResult.success) {
                        showNotification('项目已启动全屏模式', 'success');
                    } else {
                        showNotification(`启动失败: ${launchResult.error}`, 'error');
                    }
                } else {
                    showNotification('更新配置失败', 'error');
                }
            } else {
                showNotification('获取配置失败', 'error');
            }
        } else {
            showNotification('项目路径不存在', 'error');
        }
    } catch (error) {
        console.error('启动项目时出错:', error);
        showNotification('启动项目失败', 'error');
    }
}

// 检查服务器状态
async function checkServerStatus() {
    try {
        const response = await fetch('http://localhost:5260/status');
        if (response.ok) {
            serverStatus.textContent = '✅ 运行中';
            serverStatus.className = 'status-value status-success';
        } else {
            serverStatus.textContent = '❌ 连接失败';
            serverStatus.className = 'status-value status-error';
        }
    } catch (error) {
        serverStatus.textContent = '❌ 未运行';
        serverStatus.className = 'status-error';
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

// 事件监听器
addProjectBtn.addEventListener('click', addProject);
launchBtn.addEventListener('click', launchProject);

// 定期检查状态
setInterval(() => {
    checkServerStatus();
}, 10000); // 每10秒检查一次

// 全局函数（供HTML调用）
window.addProject = addProject;
window.launchProject = launchProject;
window.openFolder = openFolder;
window.deleteProject = deleteProject;