const fs = require('fs');
const path = require('path');

// 安全删除dist文件夹
function cleanDistFolder() {
  const distPath = path.join(__dirname, '..', 'dist');
  
  try {
    if (fs.existsSync(distPath)) {
      console.log('Cleaning dist folder...');
      
      // 尝试删除文件夹
      try {
        fs.rmSync(distPath, { recursive: true, force: true });
        console.log('Successfully cleaned dist folder');
      } catch (error) {
        if (error.code === 'EBUSY') {
          console.log('Some files are locked, will continue with build');
        } else {
          console.log('Error cleaning dist folder:', error.message);
        }
      }
    } else {
      console.log('Dist folder does not exist, nothing to clean');
    }
  } catch (error) {
    console.log('Error during cleanup:', error.message);
  }
}

// 执行清理
cleanDistFolder();

