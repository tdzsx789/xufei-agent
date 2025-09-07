const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

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

// 保持对窗口对象的全局引用
let mainWindow;
let serverProcess;
let kioskWindows = []; // 存储kiosk窗口的数组

// 读取配置文件
let config = {};
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('Config file loaded successfully:', config);
        
        // 检查address是否为空，如果为空则自动设置为默认地址
        if (!config.address || config.address.trim() === '') {
            console.log('Address is empty, setting default address');
            const defaultAddress = path.join(__dirname, 'app');
            config.address = defaultAddress;
            console.log('Default address set to:', defaultAddress);
            
            // 保存更新后的配置
            const configToSave = {
                interface: config.interface !== undefined ? config.interface : true,
                address: config.address,
                entrance: config.entrance || "main.html",
                subEntrance: config.subEntrance || "secondary.html"
            };
            fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
            console.log('Config file updated with default address');
            
            // 同时更新项目配置
            try {
                const projectPath = path.join(__dirname, 'project.json');
                const projectName = path.basename(defaultAddress) || 'app';
                const projectData = {
                    id: Date.now(),
                    name: projectName,
                    path: defaultAddress
                };
                fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));
                console.log('Project file updated with default address:', projectData);
            } catch (projectError) {
                console.error('Failed to update project file:', projectError);
            }
        }
    } else {
        console.log('Config file not found, using default config');
        const defaultAddress = path.join(__dirname, 'app');
        config = { interface: true, address: defaultAddress, entrance: "main.html", subEntrance: "secondary.html" };
        console.log('Default address set to:', defaultAddress);
        
        // 创建默认配置文件
        const configToSave = {
            interface: true,
            address: defaultAddress,
            entrance: "main.html",
            subEntrance: "secondary.html"
        };
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
        console.log('Default config file created');
        
        // 同时创建默认项目配置
        try {
            const projectPath = path.join(__dirname, 'project.json');
            const projectName = path.basename(defaultAddress) || 'app';
            const projectData = {
                id: Date.now(),
                name: projectName,
                path: defaultAddress
            };
            fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));
            console.log('Default project file created:', projectData);
        } catch (projectError) {
            console.error('Failed to create default project file:', projectError);
        }
    }
} catch (error) {
    console.error('Failed to read config file:', error);
    const defaultAddress = path.join(__dirname, 'app');
    config = { interface: true, address: defaultAddress, entrance: "main.html", subEntrance: "secondary.html" };
    console.log('Default address set to (error fallback):', defaultAddress);
    
    // 尝试创建默认配置文件（错误恢复）
    try {
        const configPath = path.join(__dirname, 'config.json');
        const configToSave = {
            interface: true,
            address: defaultAddress,
            entrance: "main.html",
            subEntrance: "secondary.html"
        };
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
        console.log('Default config file created (error recovery)');
        
        // 同时创建默认项目配置
        const projectPath = path.join(__dirname, 'project.json');
        const projectName = path.basename(defaultAddress) || 'app';
        const projectData = {
            id: Date.now(),
            name: projectName,
            path: defaultAddress
        };
        fs.writeFileSync(projectPath, JSON.stringify(projectData, null, 2));
        console.log('Default project file created (error recovery):', projectData);
    } catch (fallbackError) {
        console.error('Failed to create fallback config files:', fallbackError);
    }
}

// 创建kiosk窗口的辅助函数
function createKioskWindow(display, filePath, title = 'Kiosk Window') {
  console.log(`Creating kiosk window on display ${display.id} (${display.bounds.width}x${display.bounds.height})`);
  
  const kioskWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    x: display.bounds.x,
    y: display.bounds.y,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    show: false
  });
  
  // 隐藏鼠标光标
  kioskWindow.webContents.on('dom-ready', () => {
    kioskWindow.webContents.insertCSS(`
      * {
        cursor: none !important;
      }
      html, body, #root {
        cursor: none !important;
      }
    `);
  });
  
  // 加载文件
  kioskWindow.loadFile(filePath);
  kioskWindow.once('ready-to-show', () => {
    kioskWindow.show();
    console.log(`Kiosk window "${title}" is now visible on display ${display.id}`);
  });
  
  // 窗口关闭时从数组中移除
  kioskWindow.on('closed', () => {
    const index = kioskWindows.indexOf(kioskWindow);
    if (index > -1) {
      kioskWindows.splice(index, 1);
    }
  });
  
  kioskWindows.push(kioskWindow);
  return kioskWindow;
}

// 创建主窗口
function createWindow(forceShow = false) {
  // 根据配置决定是否显示界面，除非强制显示
  if (config.interface === false && !forceShow) {
    console.log('Interface disabled, opening entrance file in kiosk mode:', config.address);
    
    // 获取所有显示器
    const displays = screen.getAllDisplays();
    console.log(`Found ${displays.length} display(s)`);
    
    // 检查是否有subEntrance配置
    const hasSubEntrance = config.subEntrance && config.subEntrance.trim() !== '';
    console.log('Has subEntrance:', hasSubEntrance, 'subEntrance:', config.subEntrance);
    
    if (displays.length >= 2 && hasSubEntrance) {
      // 双显示器模式
      console.log('Dual monitor mode detected');
      
      // 主显示器显示entrance文件
      const entrancePath = path.join(config.address, config.entrance || 'main.html');
      console.log('Opening entrance file on primary display:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Primary Display - Entrance');
      
      // 副显示器显示subEntrance文件
      const subEntrancePath = path.join(config.address, config.subEntrance);
      console.log('Opening subEntrance file on secondary display:', subEntrancePath);
      createKioskWindow(displays[1], subEntrancePath, 'Secondary Display - SubEntrance');
      
    } else {
      // 单显示器模式或没有subEntrance配置
      console.log('Single monitor mode or no subEntrance configured');
      const entrancePath = path.join(config.address, config.entrance || 'main.html');
      console.log('Opening entrance file in kiosk mode:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Single Display - Entrance');
    }
    
    // 继续执行，显示小窗口
    console.log('Also showing interface window');
  }

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'icon.ico'),
    title: 'Xufei Agent - 网页启动器'
  });

  // 加载应用界面
  mainWindow.loadFile('index.html');

  // 打开开发者工具（开发时使用）
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // 当窗口被关闭时触发
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 启动Node服务
function startNodeServer() {
  console.log('Starting Node server...');
  
  // 启动server.js
  serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server output: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code: ${code}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Error starting server:', err);
  });
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  // 总是启动Node服务器
  startNodeServer();
  
  // 不注册全局快捷键
  
  // 根据配置决定是否创建窗口
  createWindow();

  app.on('activate', () => {
    // 在macOS上，当单击dock图标并且没有其他窗口打开时，
    // 通常在应用程序中重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口都被关闭时退出应用
app.on('window-all-closed', () => {
  // 在macOS上，除非用户用Cmd + Q确定地退出，
  // 否则绝大部分应用及其菜单栏会保持激活
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 当应用即将退出时清理资源
app.on('before-quit', () => {
  if (serverProcess) {
    console.log('Shutting down Node server...');
    serverProcess.kill();
  }
  
  // 关闭所有kiosk窗口
  kioskWindows.forEach(window => {
    if (window && !window.isDestroyed()) {
      window.close();
    }
  });
  kioskWindows = [];
});

// IPC通信处理
ipcMain.handle('get-project', () => {
  try {
    const data = fs.readFileSync('project.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
});

ipcMain.handle('save-project', (event, project) => {
  try {
    fs.writeFileSync('project.json', JSON.stringify(project, null, 2));
    return { success: true };
  } catch (error) {
    console.error('保存项目数据时出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-folder', async () => {
  const { dialog } = require('electron');
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目文件夹'
    });
    
    if (result.canceled) {
      return { success: false, cancelled: true };
    }
    
    const selectedPath = result.filePaths[0];
    
    // 更新config.json中的address字段
    try {
      config.address = selectedPath;
      const configPath = path.join(__dirname, 'config.json');
      console.log('Config file path:', configPath);
      console.log('Selected path:', selectedPath);
      
      // 使用JSON.stringify时，确保路径格式正确
      const configToSave = {
        interface: config.interface,
        address: selectedPath,
        entrance: config.entrance || "main.html",
        subEntrance: config.subEntrance || ""
      };
      
      console.log('Config to save:', configToSave);
      fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
      console.log('Config file updated successfully, new address:', selectedPath);
      
      // 验证文件是否真的被写入
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('Verified saved config:', savedConfig);
    } catch (configError) {
      console.error('Error updating config file:', configError);
      console.error('Error details:', configError.message);
      console.error('Error stack:', configError.stack);
    }
    
    return { 
      success: true, 
      path: selectedPath 
    };
  } catch (error) {
    console.error('选择文件夹时出错:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('open-folder', async (event, folderPath) => {
  const { shell } = require('electron');
  try {
    await shell.openPath(folderPath);
    return { success: true };
  } catch (error) {
    console.error('打开文件夹时出错:', error);
    return { success: false, error: error.message };
  }
});

// 获取当前配置
ipcMain.handle('get-config', () => {
  return {
    success: true,
    config: config
  };
});

// 更新配置
ipcMain.handle('update-config', (event, newConfig) => {
  try {
    // 合并新配置
    config = { ...config, ...newConfig };
    
    // 保存到文件，确保路径格式正确
    const configPath = path.join(__dirname, 'config.json');
    const configToSave = {
      interface: config.interface,
      address: config.address,
      entrance: config.entrance || "main.html",
      subEntrance: config.subEntrance || ""
    };
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
    
    console.log('Config updated successfully:', config);
    return { success: true, config: config };
  } catch (error) {
    console.error('Error updating config:', error);
    return { success: false, error: error.message };
  }
});

// 更新入口文件
ipcMain.handle('update-entrance', (event, entranceFile) => {
  try {
    config.entrance = entranceFile;
    
    // 保存到文件
    const configPath = path.join(__dirname, 'config.json');
    const configToSave = {
      interface: config.interface,
      address: config.address,
      entrance: config.entrance,
      subEntrance: config.subEntrance || ""
    };
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
    
    console.log('Entrance file updated successfully:', config.entrance);
    return { success: true, config: config };
  } catch (error) {
    console.error('Error updating entrance file:', error);
    return { success: false, error: error.message };
  }
});

// 更新副入口文件
ipcMain.handle('update-sub-entrance', (event, subEntranceFile) => {
  try {
    config.subEntrance = subEntranceFile;
    
    // 保存到文件
    const configPath = path.join(__dirname, 'config.json');
    const configToSave = {
      interface: config.interface,
      address: config.address,
      entrance: config.entrance || "main.html",
      subEntrance: config.subEntrance
    };
    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
    
    console.log('Sub-entrance file updated successfully:', config.subEntrance);
    return { success: true, config: config };
  } catch (error) {
    console.error('Error updating sub-entrance file:', error);
    return { success: false, error: error.message };
  }
});

// 启动kiosk模式
ipcMain.handle('launch-kiosk', () => {
  try {
    console.log('Launching kiosk mode...');
    
    // 获取所有显示器
    const displays = screen.getAllDisplays();
    console.log(`Found ${displays.length} display(s) for kiosk launch`);
    
    // 检查是否有subEntrance配置
    const hasSubEntrance = config.subEntrance && config.subEntrance.trim() !== '';
    console.log('Has subEntrance for kiosk launch:', hasSubEntrance, 'subEntrance:', config.subEntrance);
    
    if (displays.length >= 2 && hasSubEntrance) {
      // 双显示器模式
      console.log('Launching dual monitor kiosk mode');
      
      // 主显示器显示entrance文件
      const entrancePath = path.join(config.address, config.entrance || 'main.html');
      console.log('Opening entrance file on primary display:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Primary Display - Entrance');
      
      // 副显示器显示subEntrance文件
      const subEntrancePath = path.join(config.address, config.subEntrance);
      console.log('Opening subEntrance file on secondary display:', subEntrancePath);
      createKioskWindow(displays[1], subEntrancePath, 'Secondary Display - SubEntrance');
      
    } else {
      // 单显示器模式或没有subEntrance配置
      console.log('Launching single monitor kiosk mode');
      const entrancePath = path.join(config.address, config.entrance || 'main.html');
      console.log('Opening entrance file in kiosk mode:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Single Display - Entrance');
    }
    
    return { success: true, message: 'Kiosk mode launched successfully' };
  } catch (error) {
    console.error('Error launching kiosk mode:', error);
    return { success: false, error: error.message };
  }
});

