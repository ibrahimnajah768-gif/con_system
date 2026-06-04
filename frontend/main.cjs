const { app, BrowserWindow } = require('electron');
const path = require('path');

// دالة لمعرفة هل التطبيق في وضع البرمجة أم وضع الإنتاج
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "نظام المِعمار لإدارة المقاولات v3",
    icon: path.join(__dirname, 'public/logo.png'), 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (isDev) {
    // 1. في وضع البرمجة: نفتح الرابط المحلي لـ Vite لكي نرى التعديلات فوراً
    win.loadURL('http://localhost:5173');
    // فتح أدوات المطور تلقائياً في وضع البرمجة (اختياري)
    // win.webContents.openDevTools(); 
  } else {
    // 2. في وضع الإنتاج (التطبيق النهائي): نفتح ملف الـ HTML الناتج من الـ Build
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  // إخفاء القوائم العلوي لجعل الشكل احترافي كأنه تطبيق حقيقي
  win.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});