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
    // 在打包后的环境中，配置文件在resources目录中
    const isPackaged = app.isPackaged;
    const configPath = isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(__dirname, 'config.json');
    
    if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
        console.log('Config file loaded successfully:', config);
    } else {
        console.log('Config file not found, using default config');
        config = { interface: true, entrance: "main.html", subEntrance: "secondary.html" };
        
        // 创建默认配置文件
        const configToSave = {
            interface: true,
            entrance: "main.html",
            subEntrance: "secondary.html"
        };
        fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
        console.log('Default config file created');
    }
} catch (error) {
    console.error('Failed to read config file:', error);
    config = { interface: true, entrance: "main.html", subEntrance: "secondary.html" };
    console.log('Using default config (error fallback)');
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
  console.log('=== createWindow() called ===');
  console.log('forceShow:', forceShow);
  console.log('config.interface:', config.interface);
  console.log('Current mainWindow:', mainWindow ? 'exists' : 'null');
  
  // 根据配置决定是否显示界面，除非强制显示
  if (config.interface === false && !forceShow) {
    console.log('Interface disabled, opening entrance file in kiosk mode');
    
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
      const entrancePath = path.join(__dirname, 'app', config.entrance || 'main.html');
      console.log('Opening entrance file on primary display:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Primary Display - Entrance');
      
      // 副显示器显示subEntrance文件
      const subEntrancePath = path.join(__dirname, 'app', config.subEntrance);
      console.log('Opening subEntrance file on secondary display:', subEntrancePath);
      createKioskWindow(displays[1], subEntrancePath, 'Secondary Display - SubEntrance');
      
    } else {
      // 单显示器模式或没有subEntrance配置
      console.log('Single monitor mode or no subEntrance configured');
      const entrancePath = path.join(__dirname, 'app', config.entrance || 'main.html');
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
  console.log('=== startNodeServer() called ===');
  console.log('Starting Node server...');
  
  // 发送启动日志到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-log', {
      type: 'info',
      message: `[${new Date().toLocaleTimeString()}] 正在启动Node服务...`
    });
  }
  
  // 确定server的路径
  const isPackaged = app.isPackaged;
  let serverPath;
  let useExecutable = false;
  
  if (isPackaged) {
    // 在打包环境中，优先使用打包的server.exe
    const serverExePath = path.join(process.resourcesPath, 'server.exe');
    if (fs.existsSync(serverExePath)) {
      serverPath = serverExePath;
      useExecutable = true;
      console.log('Using packaged server.exe');
    } else {
      // 回退到server.js
      serverPath = path.join(process.resourcesPath, 'server.js');
      console.log('Using server.js (server.exe not found)');
    }
  } else {
    serverPath = path.join(__dirname, 'server.js');
  }
  
  console.log('Server path:', serverPath);
  console.log('Is packaged:', isPackaged);
  
  // 发送路径信息到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-log', {
      type: 'info',
      message: `[${new Date().toLocaleTimeString()}] 服务路径: ${serverPath}`
    });
  }
  
  // 检查server.js文件是否存在
  if (!fs.existsSync(serverPath)) {
    const errorMsg = `[${new Date().toLocaleTimeString()}] 错误: server.js文件不存在于 ${serverPath}`;
    console.error(errorMsg);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', {
        type: 'error',
        message: errorMsg
      });
    }
    return;
  }
  
  // 确定启动方式
  let nodeExecutable;
  let serverArgs = [];
  
  if (useExecutable) {
    // 使用打包的server.exe，不需要Node.js
    nodeExecutable = serverPath;
    serverArgs = [];
    console.log('Using server.exe directly, no Node.js required');
  } else {
    // 使用Node.js运行server.js
    nodeExecutable = 'node';
    serverArgs = [serverPath];
    if (isPackaged) {
      console.log('Using system PATH node executable');
    }
  }
  
  console.log('Node executable:', nodeExecutable);
  
  // 发送Node可执行文件信息到渲染进程
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-log', {
      type: 'info',
      message: `[${new Date().toLocaleTimeString()}] Node可执行文件: ${nodeExecutable}`
    });
  }
  
  // 启动server
  serverProcess = spawn(nodeExecutable, serverArgs, {
    cwd: isPackaged ? process.resourcesPath : __dirname,
    stdio: 'pipe',
    env: { ...process.env }
  });

  serverProcess.stdout.on('data', (data) => {
    const logMessage = `[${new Date().toLocaleTimeString()}] Server output: ${data}`;
    console.log(logMessage);
    
    // 发送日志到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', {
        type: 'info',
        message: logMessage
      });
    }
  });

  serverProcess.stderr.on('data', (data) => {
    const logMessage = `[${new Date().toLocaleTimeString()}] Server error: ${data}`;
    console.error(logMessage);
    
    // 发送错误日志到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', {
        type: 'error',
        message: logMessage
      });
    }
  });

  serverProcess.on('close', (code) => {
    const logMessage = `[${new Date().toLocaleTimeString()}] Server process exited with code: ${code}`;
    console.log(logMessage);
    
    // 发送关闭日志到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', {
        type: 'warning',
        message: logMessage
      });
    }
  });

  serverProcess.on('error', (err) => {
    const logMessage = `[${new Date().toLocaleTimeString()}] Error starting server: ${err.message}`;
    console.error(logMessage);
    console.error('Error details:', err);
    
    // 发送错误日志到渲染进程
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-log', {
        type: 'error',
        message: logMessage
      });
      
      // 发送详细错误信息
      mainWindow.webContents.send('server-log', {
        type: 'error',
        message: `[${new Date().toLocaleTimeString()}] 错误详情: ${JSON.stringify(err, null, 2)}`
      });
    }
  });
  
  // 添加进程启动事件监听
  serverProcess.on('spawn', () => {
    console.log('=== serverProcess.on(spawn) triggered ===');
    const logMessage = `[${new Date().toLocaleTimeString()}] Node服务进程已启动 (PID: ${serverProcess.pid})`;
    console.log(logMessage);
    console.log('mainWindow exists:', mainWindow ? 'yes' : 'no');
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log('Sending log to mainWindow...');
      mainWindow.webContents.send('server-log', {
        type: 'success',
        message: logMessage
      });
    } else {
      console.log('mainWindow not available, skipping log send');
    }
  });
}

// 当Electron完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  console.log('=== app.whenReady() called ===');
  
  // 总是启动Node服务器
  console.log('Starting Node server...');
  startNodeServer();
  
  // 不注册全局快捷键
  
  // 根据配置决定是否创建窗口
  console.log('Creating main window...');
  createWindow();

  app.on('activate', () => {
    console.log('=== app.on(activate) triggered ===');
    console.log('Current window count:', BrowserWindow.getAllWindows().length);
    // 在macOS上，当单击dock图标并且没有其他窗口打开时，
    // 通常在应用程序中重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      console.log('No windows open, creating new window...');
      createWindow();
    } else {
      console.log('Windows already exist, not creating new window');
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
    
    // 保存到文件
    const isPackaged = app.isPackaged;
    const configPath = isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(__dirname, 'config.json');
    const configToSave = {
      interface: config.interface,
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
    const isPackaged = app.isPackaged;
    const configPath = isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(__dirname, 'config.json');
    const configToSave = {
      interface: config.interface,
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
    const isPackaged = app.isPackaged;
    const configPath = isPackaged ? path.join(process.resourcesPath, 'config.json') : path.join(__dirname, 'config.json');
    const configToSave = {
      interface: config.interface,
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
      const entrancePath = path.join(__dirname, 'app', config.entrance || 'main.html');
      console.log('Opening entrance file on primary display:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Primary Display - Entrance');
      
      // 副显示器显示subEntrance文件
      const subEntrancePath = path.join(__dirname, 'app', config.subEntrance);
      console.log('Opening subEntrance file on secondary display:', subEntrancePath);
      createKioskWindow(displays[1], subEntrancePath, 'Secondary Display - SubEntrance');
      
    } else {
      // 单显示器模式或没有subEntrance配置
      console.log('Launching single monitor kiosk mode');
      const entrancePath = path.join(__dirname, 'app', config.entrance || 'main.html');
      console.log('Opening entrance file in kiosk mode:', entrancePath);
      createKioskWindow(displays[0], entrancePath, 'Single Display - Entrance');
    }
    
    return { success: true, message: 'Kiosk mode launched successfully' };
  } catch (error) {
    console.error('Error launching kiosk mode:', error);
    return { success: false, error: error.message };
  }
});

