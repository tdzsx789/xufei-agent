const fs = require('fs');
const path = require('path');

// 重命名win-unpacked文件夹为"项目工程"
function renameWinUnpackedFolder() {
  const distPath = path.join(__dirname, '..', 'dist');
  const winUnpackedPath = path.join(distPath, 'win-unpacked');
  const newFolderPath = path.join(distPath, '项目工程');
  
  try {
    // 检查win-unpacked文件夹是否存在
    if (fs.existsSync(winUnpackedPath)) {
      // 如果目标文件夹已存在，先尝试删除
      if (fs.existsSync(newFolderPath)) {
        try {
          // 等待一下再删除
          setTimeout(() => {
            try {
              fs.rmSync(newFolderPath, { recursive: true, force: true });
            } catch (e) {
              console.log('Could not remove existing folder, will skip rename');
            }
          }, 1000);
        } catch (e) {
          console.log('Could not remove existing folder, will skip rename');
        }
      }
      
      // 重命名文件夹
      try {
        fs.renameSync(winUnpackedPath, newFolderPath);
        console.log('Successfully renamed win-unpacked to "项目工程"');
        
        // 重命名exe文件
        const exePath = path.join(newFolderPath, 'Xufei Agent.exe');
        const newExePath = path.join(newFolderPath, 'start.exe');
        
        if (fs.existsSync(exePath)) {
          if (fs.existsSync(newExePath)) {
            fs.unlinkSync(newExePath);
          }
          fs.renameSync(exePath, newExePath);
          console.log('Successfully renamed "Xufei Agent.exe" to "start.exe"');
        }
      } catch (renameError) {
        console.log('Could not rename folder, it may be in use. Folder remains as win-unpacked');
      }
    } else {
      console.log('win-unpacked folder not found, skipping rename');
    }
  } catch (error) {
    console.error('Error renaming folder:', error);
  }
}

// 执行重命名
renameWinUnpackedFolder();
