import { useState, useEffect } from 'react'
import html2pdf from 'html2pdf.js' 


const API_BASE = 'https://consystem-production.up.railway.app';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [officeExpenses, setOfficeExpenses] = useState([]);
  const [offExpForm, setOffExpForm] = useState({ description: '', amount: '' });
  // ==========================================
  // --- حالات نظام الأمان (AUTHENTICATION) ---
  // ==========================================
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); 
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [isLampOn, setIsLampOn] = useState(false); 

  // ==========================================
  // --- الحالات العامة للنظام (CORE DATA) ---
  // ==========================================
  const [tab, setTab] = useState('dashboard'); 
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [suppliers, setSuppliers] = useState([]); 
  const [notifications, setNotifications] = useState([]); // [جديد]
  
  const [selectedProject, setSelectedProject] = useState(null);
  const [modalTab, setModalTab] = useState('payments');

  // ==========================================
  // --- حالات نماذج الإدخال (FORMS) ---
  // ==========================================
  const [payAmount, setPayAmount] = useState('');
  const [expForm, setExpForm] = useState({ description: '', amount: '' });
  const [matForm, setMatForm] = useState({ name: '', quantity: '', unit: 'كيس', price: '', supplierId: '' });
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [supForm, setSupForm] = useState({ name: '', phone: '', address: '' });
  const [salaryPayAmount, setSalaryPayAmount] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [payEmpId, setPayEmpId] = useState(''); // ضعه تحت سطر editingEmployeeId
  const [attachmentName, setAttachmentName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  // [جديد] نموذج المهام
  const [taskForm, setTaskForm] = useState({ description: '', percentage: '' });
  
  const [projForm, setProjForm] = useState({ name: '', client: '', budget: '', branchId: '' });
  const [empForm, setEmpForm] = useState({ name: '', position: '', salary: '', phone: '', branchId: '' });
  const [branchForm, setBranchForm] = useState({ name: '', location: '' });

  // ==========================================
  // --- وظائف الصوت التفاعلي (INTERACTIVE SOUND) ---
  // ==========================================
  const playSwitchSound = () => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(isLampOn ? 400 : 800, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
  };

  const toggleLamp = () => {
    playSwitchSound();
    setIsLampOn(!isLampOn);
  };
const [showPinModal, setShowPinModal] = useState(false); 
const [pinInput, setPinInput] = useState(''); 
const [targetTabAfterPin, setTargetTabAfterPin] = useState(null);
  // ==========================================
  // --- وظائف جلب البيانات (FETCHING) ---
  // ==========================================
  useEffect(() => {
    if (token) { 
        fetchData();
        fetchNotifications();
    }
  }, [token]);

  const fetchData = async () => {
  try {
    const results = await Promise.allSettled([
      fetch(`${API_BASE}/api/projects`).then(res => res.json()),
      fetch(`${API_BASE}/api/employees`).then(res => res.json()),
      fetch(`${API_BASE}/api/branches`).then(res => res.json()),
      fetch(`${API_BASE}/api/suppliers`).then(res => res.json()),
      fetch(`${API_BASE}/api/officeexpenses`).then(res => res.json())
    ]);

    // استخراج القيم فقط إذا نجح الطلب
    const p = results[0].status === 'fulfilled' ? results[0].value : [];
    const e = results[1].status === 'fulfilled' ? results[1].value : [];
    const b = results[2].status === 'fulfilled' ? results[2].value : [];
    const s = results[3].status === 'fulfilled' ? results[3].value : [];
    const oe = results[4].status === 'fulfilled' ? results[4].value : [];

    setProjects(p);
    setEmployees(e);
    setBranches(b);
    setSuppliers(s);
    setOfficeExpenses(oe);

    if (selectedProject) {
      const freshData = p.find(proj => proj.id === selectedProject.id);
      if (freshData) setSelectedProject(freshData);
    }
  } catch (err) { 
    console.error("خطأ في تحديث البيانات:", err); 
  }
};
  const fetchNotifications = async () => {
    try {
        const res = await fetch(`${API_BASE}/api/notifications`);
        const data = await res.json();
        setNotifications(data);
    } catch (err) { console.error("Notif error"); }
};

  // ==========================================
  // --- وظائف الحماية (SECURITY) ---
  // ==========================================
  const hashPin = async (string) => {
    const utf8 = new TextEncoder().encode(string);
    const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
  const checkAdminPin = (targetTab) => {
    if (isAdminUnlocked) {
        setTab(targetTab);
    } else {
        setTargetTabAfterPin(targetTab); // حفظ التبويب الذي نقرنا عليه
        setShowPinModal(true); // إظهار نافذة إدخال الرمز
    }
};
const handlePinSubmit = (e) => {
    e.preventDefault();
    
    // المقارنة المباشرة بالرمز "1234"
    // هذه الطريقة لا تحتاج HTTPS وستعمل في الموبايل فوراً
    if (pinInput === "1234") { 
        setIsAdminUnlocked(true); // فتح القفل
        setTab(targetTabAfterPin); // الانتقال للقسم المطلوب
        setShowPinModal(false); // إغلاق نافذة الرمز
        setPinInput(''); // تصفير الحقل
    } else {
        alert("❌ الرمز الذي أدخلته خطأ!");
        setPinInput('');
    }
};

  // ==========================================
  // --- العمليات البرمجية (OPERATIONS) ---
  // ==========================================
  const handleAuth = async (e) => {
    e.preventDefault();
    const url = isLoginView ? 'login' : 'register';
    try {
        const res = await fetch(`${API_BASE}/api/auth/${url}`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authForm),
        });
        const data = await res.json();
        if (res.ok) {
            if (isLoginView) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                setToken(data.token); setUser(data.user); setIsAdminUnlocked(false);
            } else { alert("تم التسجيل"); setIsLoginView(true); }
        } else { alert(data.error); }
    } catch (err) { alert("خطأ اتصال بالسيرفر"); }
};
const handleLogout = () => {
    localStorage.clear(); // مسح بيانات الدخول من المتصفح
    setToken(null);       // إغلاق الجلسة
    setUser(null);        // مسح بيانات المستخدم
    setSelectedProject(null); 
    setIsAdminUnlocked(false); // قفل الأقسام الإدارية
  };
  const deleteItem = async (type, id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من الحذف النهائي؟')) return;
    await fetch(`${API_BASE}/api/${type}/${id}`, { method: 'DELETE' });
    fetchData();
};

 const handleAddOrUpdateSubItem = async (endpoint, body, resetCallback, isUpdate = false, id = null) => {
    const method = isUpdate ? 'PATCH' : 'POST';
    
    // تأكدنا هنا أن الرابط يتوجه دائماً للسيرفر 3000
    const url = isUpdate 
        ? `${API_BASE}/api/${endpoint}/${id}` 
        : `${API_BASE}/api/${endpoint}`;
    
    try {
        const res = await fetch(url, {
            method, 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...body, projectId: selectedProject?.id }),
        });

        if (res.ok) {
            resetCallback(); 
            // تحديث البيانات بعد الإضافة الناجحة
            await fetchData(); 
            
            // سطر إضافي لضمان تحديث الواجهة فوراً
            const freshRes = await fetch(`${API_BASE}/api/projects`);
            const allProjects = await freshRes.json();
            setProjects(allProjects);
            if(selectedProject) setSelectedProject(allProjects.find(p => p.id === selectedProject.id));

            alert("✅ تمت الإضافة بنجاح");
        } else {
            alert("❌ فشل في الحفظ: تأكد من إدخال البيانات بشكل صحيح");
        }
    } catch (err) {
        alert("❌ السيرفر مغلق أو الرابط خطأ");
    }
};

 const handleEmployeeSubmit = async (e) => {
    e.preventDefault();
    
    // تأمين رقم الفرع
    const selectedBranchId = parseInt(empForm.branchId);
    if (isNaN(selectedBranchId)) {
        return alert("⚠️ يجب عليك إضافة فرع من تبويب الفروع أولاً، ثم اختياره للموظف");
    }

    const method = editingEmployeeId ? 'PATCH' : 'POST';
    const url = editingEmployeeId ? `${API_BASE}/api/employee/${editingEmployeeId}` : `${API_BASE}/api/employee`;
    
    try {
        const res = await fetch(url, { 
            method, 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({
                ...empForm,
                salary: parseFloat(empForm.salary),
                branchId: selectedBranchId // إرسال رقم صحيح
            }) 
        });
        
        if(res.ok) {
            setEditingEmployeeId(null); 
            setEmpForm({ name: '', position: '', salary: '', phone: '', branchId: '' });
            fetchData();
            alert("✅ تمت العملية بنجاح");
        }
    } catch (err) { alert("❌ خطأ في الاتصال"); }
};
 const handleAttendance = async (empId, val, date) => {
    if (val !== '1' && val !== '0') return;
    const status = val === '1' ? 'حاضر' : 'غائب';

    // 1. تحديث واجهة المستخدم فوراً (Optimistic Update)
    const updatedEmployees = employees.map(emp => {
        if (emp.id === empId) {
            const newAttendances = [...(emp.attendances || [])];
            // البحث عن السجل باستخدام التاريخ المحلي فقط لضمان الدقة
            const index = newAttendances.findIndex(a => {
                const localDate = new Date(a.date).toLocaleDateString('en-CA');
                return localDate === date;
            });

            if (index > -1) {
                newAttendances[index] = { ...newAttendances[index], status };
            } else {
                newAttendances.push({ employeeId: empId, status, date });
            }
            return { ...emp, attendances: newAttendances };
        }
        return emp;
    });
    setEmployees(updatedEmployees);

    // 2. إرسال البيانات للسيرفر في الخلفية
    try {
        await fetch(`${API_BASE}/api/attendance`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ employeeId: empId, status, date }) 
        });
    } catch (err) {
        fetchData(); // إعادة الجلب في حال فشل الاتصال
    }
};
const startEditEmployee = (emp) => {
    setEditingEmployeeId(emp.id);
    setEmpForm({ 
        name: emp.name, 
        position: emp.position, 
        salary: emp.salary, 
        phone: emp.phone || '', 
        branchId: emp.branchId 
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const handleSalaryPayment = async (empId) => {
    if (!salaryPayAmount) return alert("أدخل المبلغ");
    await fetch(`${API_BASE}/api/salary-payment`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ employeeId: empId, amount: salaryPayAmount, type: 'أسبوعي' }) 
    });
    setSalaryPayAmount(''); 
    fetchData();
};

  // [جديد] وظيفة المهام
 const toggleTask = async (taskId) => {
    await fetch(`${API_BASE}/api/tasks/${taskId}`, { method: 'PATCH' });
    const res = await fetch(`${API_BASE}/api/projects`);
    const updatedProjects = await res.json();
    setProjects(updatedProjects);
    if (selectedProject) {
        setSelectedProject(updatedProjects.find(p => p.id === selectedProject.id));
    }
};
  // [جديد] وظيفة الإشعارات
  const markNotifRead = async (id) => {
    await fetch(`${API_BASE}/api/notifications/${id}`, { method: 'PATCH' });
    fetchNotifications();
  };

  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    const reportContent = `
      <html dir="rtl">
        <head>
          <title>تقرير الرواتب</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
            body { font-family: 'Cairo', sans-serif; padding: 30px; }
            .header { text-align: center; border-bottom: 4px solid #111C44; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #111C44; color: white; padding: 12px; }
            td { padding: 12px; border: 1px solid #eee; text-align: center; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header"><h1>تقرير رواتب وحضور الكادر</h1><p>شركة المِعمار للمقاولات</p></div>
          <table>
            <thead><tr><th>المعرف</th><th>الاسم</th><th>المنصب</th><th>الراتب الكلي</th><th>الواصل</th><th>المتبقي</th><th>الحضور</th><th>الغياب</th></tr></thead>
            <tbody>
              ${employees.map(emp => {
                const paid = emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0;
                return `<tr>
                  <td>#${emp.id}</td><td>${emp.name}</td><td>${emp.position}</td>
                  <td>${emp.salary}$</td><td>${paid}$</td><td>${emp.salary - paid}$</td>
                  <td>${emp.attendances?.filter(a => a.status === 'حاضر').length} يوم</td>
                  <td>${emp.attendances?.filter(a => a.status === 'غائب').length} يوم</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); window.close(); };</script>
        </body>
      </html>`;
    printWindow.document.write(reportContent);
    printWindow.document.close();
  };

  const exportProjectReportPDF = () => {
    const printWindow = window.open('', '_blank');
    const received = selectedProject.payments?.reduce((s, p) => s + p.amount, 0) || 0;
    const spent = (selectedProject.expenses?.reduce((s, p) => s + p.amount, 0) || 0) + 
                  (selectedProject.materials?.reduce((s, p) => s + p.price, 0) || 0);
    const profit = received - spent;

    const reportContent = `
      <html dir="rtl">
        <head>
          <title>كشف حساب - ${selectedProject.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
            body { font-family: 'Cairo', sans-serif; padding: 40px; background: #fff; }
            .header { text-align: center; border-bottom: 5px solid #111C44; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { color: #111C44; font-size: 32px; margin: 0; }
            .project-info { display: flex; justify-content: space-between; margin-bottom: 30px; padding: 15px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; }
            .stats { display: flex; gap: 20px; margin-bottom: 40px; }
            .stat-card { flex: 1; padding: 25px; border-radius: 25px; text-align: center; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
            .stat-card h4 { margin: 0; font-size: 14px; color: #64748b; text-transform: uppercase; }
            .stat-card p { margin: 10px 0 0 0; font-size: 24px; font-weight: 900; }
            .table-section { margin-bottom: 40px; }
            .table-section h3 { color: #111C44; border-right: 6px solid #4f46e5; padding-right: 15px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; border-radius: 15px; overflow: hidden; }
            th { background: #111C44; color: white; padding: 15px; text-align: right; font-size: 14px; }
            td { padding: 15px; border-bottom: 1px solid #f1f5f9; font-size: 14px; font-weight: bold; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; text-align: center; }
            .stamp { width: 120px; height: 120px; border: 2px dashed #cbd5e1; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>كشف حساب مالي رسمي</h1>
            <p style="color: #64748b; font-weight: bold;">نظام المِعمار لإدارة المقاولات العامة</p>
          </div>
          <div class="project-info">
            <div><b>المشروع:</b> ${selectedProject.name}</div>
            <div><b>العميل:</b> ${selectedProject.client}</div>
            <div><b>التاريخ:</b> ${new Date().toLocaleDateString('ar-EG')}</div>
          </div>
          <div class="stats">
            <div class="stat-card" style="background: #f0fdf4;"><h4>إجمالي الواصل</h4><p style="color: #16a34a;">$ ${received.toLocaleString()}</p></div>
            <div class="stat-card" style="background: #fef2f2;"><h4>إجمالي المصروفات</h4><p style="color: #dc2626;">$ ${spent.toLocaleString()}</p></div>
            <div class="stat-card" style="background: #eff6ff;"><h4>الربح الصافي</h4><p style="color: #2563eb;">$ ${profit.toLocaleString()}</p></div>
          </div>
          <div class="table-section">
            <h3>سجل الدفعات المستلمة</h3>
            <table><thead><tr><th>ت</th><th>التاريخ</th><th>المبلغ</th></tr></thead>
            <tbody>${selectedProject.payments?.map((p, i) => `<tr><td>${i+1}</td><td>${new Date(p.date).toLocaleString('ar-EG')}</td><td>$ ${p.amount.toLocaleString()}</td></tr>`).join('')}</tbody></table>
          </div>
          <div class="table-section">
            <h3>كشف المصاريف والمواد</h3>
            <table><thead><tr><th>ت</th><th>البيان / المادة</th><th>الكمية</th><th>التكلفة</th></tr></thead>
            <tbody>
              ${selectedProject.expenses?.map((ex, i) => `<tr><td>${i+1}</td><td>${ex.description}</td><td>-</td><td>$ ${ex.amount.toLocaleString()}</td></tr>`).join('')}
              ${selectedProject.materials?.map((m, i) => `<tr><td>${i+1}</td><td>${m.name}</td><td>${m.quantity} ${m.unit}</td><td>$ ${m.price.toLocaleString()}</td></tr>`).join('')}
            </tbody></table>
          </div>
          <div class="footer">
            <div><p>ختم الإدارة المالية</p><div class="stamp">الختم الرسمي</div></div>
            <div><p>توقيع المدير العام</p><br><p>_________________</p></div>
          </div>
          <script>window.onload = function() { window.print(); window.close(); };</script>
        </body>
      </html>`;
    printWindow.document.write(reportContent);
    printWindow.document.close();
    
  };

 const handleFileUpload = async (e) => {
    e.preventDefault(); if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData(); 
    formData.append('file', selectedFile); 
    formData.append('projectId', selectedProject.id); 
    formData.append('name', attachmentName);
    
    const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData });
    if (res.ok) { 
        setAttachmentName(''); 
        setSelectedFile(null); 
        fetchData(); 
    }
    setUploading(false);
};
  const updateProjectStatus = async (status) => {
    // التعديل: أضفنا API_BASE
    await fetch(`${API_BASE}/api/project/${selectedProject.id}/status`, { 
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ status }) 
    });
    fetchData(); 
    setSelectedProject({ ...selectedProject, status });
};

  const getStatusStyle = (status) => {
    switch(status) {
        case 'مكتمل': return 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-100';
        case 'متوقف': return 'bg-amber-500 text-white border-amber-600 shadow-amber-100';
        case 'ملغي': return 'bg-red-600 text-white border-red-700 shadow-red-100';
        case 'قيد التنفيذ': return 'bg-blue-600 text-white border-blue-700 shadow-blue-100';
        default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  }
  

  const startEditMaterial = (m) => {
    setEditingMaterialId(m.id); setMatForm({ name: m.name, quantity: m.quantity, unit: m.unit, price: m.price, supplierId: m.supplierId || '' });
  };

  // ==========================================
  // --- شاشة تسجيل الدخول التفاعلية (The Lamp) ---
  // ==========================================
  if (!token) {
    return (
      <div className={`min-h-screen flex flex-col items-center justify-center transition-all duration-1000 ${isLampOn ? 'bg-[#f8fafc]' : 'bg-[#050505]'}`} dir="rtl">
        <div className="relative mb-20 flex flex-col items-center group">
            <div className="w-[3px] h-40 bg-gradient-to-b from-slate-900 to-slate-700 shadow-xl"></div>
            <div className={`w-36 h-36 rounded-full relative transition-all duration-700 z-20 ${isLampOn ? 'bg-white shadow-[0_0_100px_#fff,0_0_150px_#fbbf24]' : 'bg-slate-900 border border-slate-800'}`}>
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 w-48 h-10 bg-slate-950 rounded-t-full"></div>
            </div>
            <div onClick={toggleLamp} className="absolute top-40 flex flex-col items-center cursor-pointer active:translate-y-8 transition-all duration-300">
                <div className="w-[1px] h-32 bg-slate-600 group-hover:bg-amber-400"></div>
                <div className={`w-8 h-8 rounded-full border-4 shadow-xl transition-all ${isLampOn ? 'bg-amber-400 border-amber-600 scale-110' : 'bg-slate-800 border-slate-950'}`}></div>
                <span className={`text-[11px] mt-4 font-black tracking-widest ${isLampOn ? 'text-indigo-600 animate-pulse' : 'text-slate-600'}`}> {isLampOn ? 'إطفاء' : 'إسحب للإنارة'} </span>
            </div>
            {isLampOn && <div className="absolute top-20 w-[800px] h-[800px] bg-amber-400/10 rounded-full blur-[120px] -z-10 animate-in fade-in duration-1000"></div>}
        </div>
        <div className={`w-full max-w-lg px-6 transition-all duration-1000 transform ${isLampOn ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-32 scale-90 pointer-events-none'}`}>
            <div className="bg-white/90 backdrop-blur-2xl p-12 rounded-[4rem] shadow-2xl border border-white/50 text-right text-right">
                <div className="text-center mb-10"><h2 className="text-3xl font-black text-[#111C44]">نظام المِعمار v3</h2><p className="text-slate-500 mt-2 font-bold">{isLoginView ? 'تسجيل الدخول للإدارة' : 'تأسيس حساب مدير جديد'}</p></div>
                <form onSubmit={handleAuth} className="space-y-6 text-right">
                    {!isLoginView && <input type="text" placeholder="الاسم الكامل" value={authForm.name} onChange={e=>setAuthForm({...authForm, name:e.target.value})} className="w-full p-5 rounded-3xl bg-white border-2 font-bold text-lg outline-none text-right" required />}
                    <input type="email" placeholder="البريد الإلكتروني" value={authForm.email} onChange={e=>setAuthForm({...authForm, email:e.target.value})} className="w-full p-5 rounded-3xl bg-white border-2 font-bold text-lg outline-none text-right" required />
                    <input type="password" placeholder="كلمة السر" value={authForm.password} onChange={e=>setAuthForm({...authForm, password:e.target.value})} className="w-full p-5 rounded-3xl bg-white border-2 font-bold text-lg outline-none text-right" required />
                    <button className="w-full bg-[#111C44] text-white py-6 rounded-[2rem] font-black text-xl hover:bg-indigo-700 shadow-xl transition-all"> {isLoginView ? 'دخول للنظام' : 'تأكيد التسجيل'} </button>
                    <p className="text-center text-slate-400 font-bold">{isLoginView ? 'ليس لديك حساب؟ ' : 'لديك حساب؟ '} <button type="button" onClick={()=>setIsLoginView(!isLoginView)} className="text-indigo-600 font-black underline">اضغط هنا</button></p>
                </form>
            </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // --- واجهة النظام الرئيسية (Dashboard) ---
  // ==========================================
 return (
  <div className={`min-h-screen flex flex-col lg:flex-row font-sans transition-all duration-500 ${isDarkMode ? 'bg-[#0f172a] text-white' : 'bg-[#F4F7FE] text-slate-800'}`} dir="rtl">
    
    {/* --- 1. واجهة الموبايل (AppBar علوي ثابت) --- */}
    <header className={`lg:hidden sticky top-0 z-50 shadow-2xl transition-all ${isDarkMode ? 'bg-[#1e293b] border-b border-white/5' : 'bg-[#111C44] text-white'}`}>
      <div className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl bg-indigo-600 p-2 rounded-lg shadow-lg">🏗️</span>
          <h1 className="text-lg font-black italic tracking-tighter">نظام المِعمار v3</h1>
        </div>
        
        {/* زر التبديل بين الليلي والنهاري للموبايل */}
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)} 
          className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl text-xl active:scale-90 transition-all"
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>

      {/* شريط التنقل الأفقي (سلايدر أيقونات) */}
      <nav className="flex overflow-x-auto gap-2 px-4 pb-4 no-scrollbar">
        {[
          { id: 'dashboard', label: 'الرئيسية', icon: '🏠', admin: true },
          { id: 'projects', label: 'المشاريع', icon: '📊', admin: false },
          { id: 'employees', label: 'الكادر', icon: '👥', admin: false },
          { id: 'branches', label: 'الفروع', icon: '🏢', admin: true },
          { id: 'suppliers', label: 'الموردين', icon: '🤝', admin: false },
          { id: 'finances', label: 'الأرباح', icon: '💰', admin: true },
          { id: 'archive', label: 'الأرشيف', icon: '📁', admin: true },
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => item.admin ? checkAdminPin(item.id) : setTab(item.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl whitespace-nowrap text-xs font-black transition-all relative ${tab === item.id ? 'bg-indigo-600 shadow-lg scale-105' : 'bg-white/5 text-slate-300'}`}
          >
            <span>{item.icon}</span>
            {item.label}
            {item.admin && !isAdminUnlocked && <span className="text-[8px] absolute -top-1 -right-1 bg-red-500 p-1 rounded-full shadow-lg">🔒</span>}
          </button>
        ))}
      </nav>
    </header>

    {/* --- 2. واجهة اللابتوب (Sidebar جانبي) --- */}
    <aside className={`hidden lg:flex w-72 flex-col sticky top-0 h-screen shadow-2xl z-40 overflow-hidden transition-all ${isDarkMode ? 'bg-[#1e293b] border-l border-white/5' : 'bg-[#111C44] text-white'}`}>
      <div className="p-8 text-center shrink-0">
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-4xl shadow-2xl shadow-indigo-500/20 mb-4 transform hover:rotate-12 transition-transform cursor-pointer">🏗️</div>
          <h1 className="text-2xl font-black italic tracking-tighter">نظام المِعمار v3</h1>
          
          {/* زر التبديل للوضع الليلي في اللابتوب */}
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="mt-6 w-full flex items-center justify-center gap-3 p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all font-bold text-xs"
          >
            {isDarkMode ? 'الوضع النهاري ☀️' : 'الوضع الليلي 🌙'}
          </button>
      </div>

      <nav className="flex-1 px-4 space-y-3 mt-4 overflow-y-auto custom-scrollbar">
        {[
          { id: 'dashboard', label: 'الرئيسية', icon: '🏠', admin: true },
          { id: 'projects', label: 'المشاريع والمالية', icon: '📊', admin: false },
          { id: 'employees', label: 'الكادر الوظيفي', icon: '👥', admin: false },
          { id: 'branches', label: 'فروع الشركة', icon: '🏢', admin: true },
          { id: 'suppliers', label: 'الموردين والديون', icon: '🤝', admin: false },
          { id: 'finances', label: 'كشف الأرباح الكلي', icon: '💰', admin: true },
          { id: 'archive', label: 'أرشيف المشاريع', icon: '📁', admin: true },
        ].map(item => (
          <button 
            key={item.id} 
            onClick={() => item.admin ? checkAdminPin(item.id) : setTab(item.id)} 
            className={`w-full flex items-center justify-between gap-4 p-4 rounded-2xl transition-all duration-300 group ${tab === item.id ? 'bg-indigo-600 shadow-xl scale-105 font-black' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <div className="flex items-center gap-4">
              <span className="text-2xl group-hover:scale-110 transition-transform">{item.icon}</span>
              <span className="font-bold text-lg">{item.label}</span>
            </div>
            {item.admin && !isAdminUnlocked && (
              <div className="flex items-center justify-center w-6 h-6 bg-red-500/20 border border-red-500/50 rounded-lg animate-pulse">
                <span className="text-[10px]">🔒</span>
              </div>
            )}
          </button>
        ))}
      </nav>

      <div className="p-6 shrink-0 border-t border-white/5">
          <button onClick={handleLogout} className="w-full p-4 bg-red-500/10 text-red-500 rounded-2xl font-black hover:bg-red-500 hover:text-white transition-all text-center flex items-center justify-center gap-3">
            <span className="text-xl">🚪</span>
            <span>تسجيل خروج</span>
          </button>
      </div>
    </aside>

      {/* 2. Main Content */}
      <main className="flex-1 flex flex-col min-w-0 text-right">
        <header className="h-24 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-10 shrink-0 shadow-sm w-full">
            <div className="flex items-center gap-6">
                <h2 className="text-xl lg:text-3xl font-black text-slate-800 italic uppercase truncate">
                    {tab === 'dashboard' ? 'لوحة التحكم الشاملة' : tab === 'projects' ? 'إدارة المشاريع' : tab === 'employees' ? 'الموارد البشرية' : 'الموردين'}
                </h2>
                {/* [جديد] أيقونة الجرس للإشعارات */}
                <div className="relative group cursor-pointer">
                    <span className="text-2xl">🔔</span>
                    {notifications.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{notifications.length}</span>}
                    <div className="absolute top-10 right-0 w-80 bg-white shadow-2xl rounded-3xl border border-slate-100 hidden group-hover:block z-50 p-4 animate-in fade-in">
                        <p className="font-black text-xs border-b pb-2 mb-2 uppercase">الإشعارات الذكية</p>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {notifications.map(n => (
                                <div key={n.id} onClick={()=>markNotifRead(n.id)} className={`p-3 rounded-xl text-[10px] font-bold ${n.type==='danger'?'bg-red-50 text-red-600':'bg-indigo-50 text-indigo-600'} hover:opacity-80`}>{n.message}</div>
                            ))}
                            {notifications.length === 0 && <p className="text-center text-slate-400 py-4 text-xs italic">لا توجد تنبيهات جديدة</p>}
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border shadow-inner">
                <div className="text-left hidden sm:block"><p className="text-xs font-black text-slate-400 italic">مرحباً بك</p><p className="text-sm font-black text-slate-700">{user?.name || 'المدير العام'}</p></div>
                <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xl font-black shadow-md">A</div>
            </div>
        </header>

        <div className="p-4 lg:p-10 flex-1 overflow-y-auto w-full text-right">
            {/* العدادات العلوية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-12 text-right">
                {[
                    { label: 'السيولة المستلمة', val: `${projects.reduce((acc, p) => acc + (p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0), 0).toLocaleString()} $`, color: 'text-emerald-600' },
                    { label: 'المصاريف والمواد', val: `${projects.reduce((acc, p) => acc + (p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0), 0).toLocaleString()} $`, color: 'text-red-500' },
                    { label: 'المشاريع النشطة', val: projects.length, color: 'text-indigo-600' },
                    { label: 'إجمالي الكادر', val: employees.length, color: 'text-slate-800' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all text-right"><p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-2 text-right">{stat.label}</p><h3 className={`text-3xl font-black ${stat.color} text-right`}>{stat.val}</h3></div>
                ))}
            </div>

            {/* DASHBOARD */}
            {tab === 'dashboard' && isAdminUnlocked && (
                <div className="space-y-12 animate-in fade-in duration-700 text-right">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-[#111C44] p-10 rounded-[3.5rem] shadow-2xl text-center"><p className="text-indigo-300 font-black text-xs uppercase tracking-widest mb-4">إجمالي قيمة التعاقدات</p><h3 className="text-4xl font-black text-white">$ {projects.reduce((acc, p) => acc + p.budget, 0).toLocaleString()}</h3></div>
                        <div className="bg-white p-10 rounded-[3.5rem] border text-center shadow-sm"><p className="text-emerald-600 font-black text-xs uppercase tracking-widest mb-4">إجمالي ديون الموردين</p><h3 className="text-4xl font-black text-slate-800">$ {suppliers.reduce((acc, s) => acc + (s.materials?.reduce((sum, m) => sum + m.price, 0) || 0), 0).toLocaleString()}</h3></div>
                        <div className="bg-white p-10 rounded-[3.5rem] border text-center shadow-sm"><p className="text-amber-500 font-black text-xs uppercase tracking-widest mb-4">إجمالي ديون العملاء</p><h3 className="text-4xl font-black text-slate-800">$ {projects.reduce((acc, p) => acc + (p.budget - (p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0)), 0).toLocaleString()}</h3></div>
                    </div>
                    <div className="bg-white p-10 rounded-[3.5rem] border-r-[12px] border-red-500 shadow-xl relative"><div className="absolute top-8 left-10 bg-red-100 text-red-600 px-4 py-1 rounded-full text-[10px] font-black italic shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse border border-red-200">تنبيه المدير ⚠️</div><h2 className="text-2xl font-black mb-8 text-slate-800">مشاريع تحتاج متابعة فورية</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-right">{projects.filter(p => p.status === 'متوقف' || p.status === 'ملغي').map(p => (<div key={p.id} className="bg-red-50/50 p-6 rounded-3xl border border-red-100 flex justify-between items-center group cursor-pointer hover:bg-red-50 transition-all" onClick={() => {setTab('projects'); setSelectedProject(p)}}><div><h4 className="font-black text-slate-800 text-lg text-right">{p.name}</h4><p className="text-xs text-red-500 font-bold uppercase text-right">{p.status}</p></div><span className="text-2xl group-hover:translate-x-2 transition-transform">👈</span></div>))}</div></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-right"><div className="bg-white p-10 rounded-[3.5rem] border shadow-sm"><h3 className="text-xl font-black text-slate-800 mb-8">👥 الكادر الوظيفي</h3>
                    <div className="space-y-4">{branches.map(b => (<div key={b.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl text-right"><span className="font-black text-slate-700">{b.name}</span><span className="text-xs font-black bg-white px-5 py-2 rounded-xl shadow-sm border">{employees.filter(e => e.branchId === b.id).length} موظف</span></div>))}</div></div><div className="bg-white p-10 rounded-[3.5rem] border shadow-sm flex flex-col items-center justify-center text-center"><div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner animate-pulse">🏆</div><h3 className="text-2xl font-black text-slate-800">إنجازات الشركة</h3><p className="text-slate-400 mt-2 font-bold text-sm px-10">لقد أتممت بنجاح <span className="text-emerald-600 text-2xl font-black">{projects.filter(p=>p.status==='مكتمل').length}</span> مشروعاً عملاقاً!</p></div></div>
                </div>
            )}
{/* --- تبويب فروع الشركة (BRANCHES) --- */}
            {tab === 'branches' && (
                <div className="space-y-12 animate-in fade-in duration-700 text-right">
                    
                    {/* 1. نموذج تأسيس فرع جديد - يظهر للمدير (admin) */}
                    {user?.role === 'admin' && (
                        <section className="bg-white p-8 lg:p-12 rounded-[3.5rem] shadow-sm border border-slate-100 w-full relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-2 h-full bg-slate-900"></div>
                            <h2 className="text-2xl font-black mb-10 text-slate-800 border-r-8 border-slate-900 pr-6 italic uppercase tracking-tighter">
                                🏢 تأسيس مكتب أو فرع جديد للمنظومة
                            </h2>
                            <form onSubmit={async (e) => { 
    e.preventDefault(); 
    try {
        const res = await fetch(`${API_BASE}/api/branch`, {
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify({...branchForm, companyId: 1}) 
        }); 

        if (res.ok) {
            setBranchForm({name:'', location:''}); 
            // تحديث البيانات فوراً
            await fetchData(); 
            alert("✅ تم تأسيس الفرع بنجاح");
        } else {
            alert("❌ فشل في التأسيس");
        }
    } catch (err) {
        alert("❌ خطأ في الاتصال بالسيرفر");
    }
}} className="flex flex-col lg:flex-row gap-6 items-end">
    <input type="text" placeholder="اسم الفرع" value={branchForm.name} onChange={e=>setBranchForm({...branchForm, name: e.target.value})} className="flex-1 p-6 rounded-[2rem] bg-slate-50 border outline-none font-black" required />
    <input type="text" placeholder="الموقع" value={branchForm.location} onChange={e=>setBranchForm({...branchForm, location: e.target.value})} className="flex-1 p-6 rounded-[2rem] bg-slate-50 border outline-none font-black" required />
    <button className="bg-slate-900 text-white font-black px-12 py-6 rounded-[2rem] shadow-2xl">تأكيد الإضافة</button>
</form>
                        </section>
                    )}

                    {/* 2. شبكة عرض الفروع الحالية */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {branches.map(b => (
                            <div key={b.id} className="bg-white p-10 rounded-[3.5rem] border border-slate-100 flex items-center justify-between group transition-all hover:shadow-[0_30px_60px_rgba(0,0,0,0.05)] hover:-translate-y-2 relative overflow-hidden">
                                <div className="flex items-center gap-8 min-w-0">
                                    {/* أيقونة الفرع */}
                                    <div className="w-20 h-20 bg-[#111C44] text-white rounded-[2rem] flex items-center justify-center text-4xl shadow-xl shadow-indigo-900/20 shrink-0 transform group-hover:rotate-12 transition-transform">
                                        🏢
                                    </div>
                                    
                                    {/* معلومات الفرع */}
                                    <div className="min-w-0">
                                        <h4 className="text-2xl font-black text-slate-800 leading-tight mb-2 truncate">
                                            {b.name}
                                        </h4>
                                        <p className="text-slate-400 font-bold mt-1 italic text-sm truncate">
                                            📍 {b.location || 'لم يحدد الموقع'}
                                        </p>
                                        
                                        {/* عدادات ذكية فرعية داخل كرت الفرع */}
                                        <div className="flex gap-4 mt-4">
                                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg">
                                                المشاريع: {projects.filter(p => p.branchId === b.id).length}
                                            </span>
                                            <span className="text-[10px] font-black bg-emerald-50 text-emerald-600 px-3 py-1 rounded-lg">
                                                الموظفين: {employees.filter(e => e.branchId === b.id).length}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* زر الحذف (يظهر للمدير فقط عند تمرير الماوس) */}
                                {user?.role === 'admin' && (
                                    <button 
                                        onClick={() => deleteItem('branch', b.id)} 
                                        className="text-red-400 opacity-0 group-hover:opacity-100 font-black hover:text-red-600 transition-all underline text-sm shrink-0 pr-4"
                                    >
                                        حذف الفرع
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* في حال عدم وجود فروع */}
                        {branches.length === 0 && (
                            <div className="col-span-full p-20 text-center bg-slate-50 rounded-[4rem] border-2 border-dashed border-slate-200">
                                <p className="text-2xl font-black text-slate-300 italic">⚠️ لا توجد فروع مسجلة في النظام حالياً</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* PROJECTS */}
            {tab === 'projects' && (
  <div className="space-y-12 animate-in fade-in duration-500 text-right w-full">
    {/* 1. نموذج تسجيل مشروع جديد */}
    <section className="bg-white p-8 lg:p-10 rounded-[3rem] shadow-sm border border-slate-100 w-full text-right">
      <h2 className="text-xl font-black mb-8 text-slate-800 border-r-8 border-indigo-600 pr-4 italic underline decoration-indigo-200 text-right">
        ✨ تسجيل عقد مشروع جديد
      </h2>
      
      <form onSubmit={async (e) => { 
        e.preventDefault(); 
        try {
          // التحقق من اختيار الفرع
          const selectedBranchId = projForm.branchId || (branches.length > 0 ? branches[0].id : null);
          
          if (!selectedBranchId) {
            return alert("❌ يرجى إضافة فرع أولاً من تبويب الفروع");
          }

          const res = await fetch(`${API_BASE}/api/project`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({
              name: projForm.name,
              client: projForm.client,
              budget: parseFloat(projForm.budget), // تحويل الميزانية لرقم
              branchId: parseInt(selectedBranchId) // تحويل معرف الفرع لرقم
            })
          });

          if (res.ok) {
            setProjForm({ name: '', client: '', budget: '', branchId: '' });
            fetchData(); 
            alert("✅ تم إضافة المشروع بنجاح");
          } else {
            const errorData = await res.json();
            alert("❌ فشل الإضافة: " + (errorData.error || "خطأ في البيانات"));
          }
        } catch (err) {
          alert("❌ حدث خطأ في الاتصال بالسيرفر، تأكد من تشغيل الباك إند");
        }
      }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-right">
        
        <input type="text" placeholder="اسم المشروع" value={projForm.name} 
          onChange={e=>setProjForm({...projForm, name: e.target.value})} 
          className="p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all w-full shadow-inner text-right" required />
        
        <input type="text" placeholder="اسم العميل" value={projForm.client} 
          onChange={e=>setProjForm({...projForm, client: e.target.value})} 
          className="p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all w-full shadow-inner text-right" required />
        
        <input type="number" placeholder="الميزانية الكلية" value={projForm.budget} 
          onChange={e=>setProjForm({...projForm, budget: e.target.value})} 
          className="p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all w-full shadow-inner text-right" required />
        
        <select value={projForm.branchId} onChange={e=>setProjForm({...projForm, branchId: e.target.value})} 
          className="p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-black w-full text-indigo-600 shadow-sm text-right" required>
          <option value="">-- اختر الفرع --</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        
        <button type="submit" className="sm:col-span-2 lg:col-span-4 bg-indigo-600 text-white font-black py-5 rounded-[2rem] hover:bg-indigo-700 shadow-2xl transition-all text-xl active:scale-95">
          تأكيد وبدء المشروع
        </button>
      </form>
    </section>

    {/* 2. عرض شبكة المشاريع الحالية */}
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 w-full text-right">
      {projects.filter(p => !p.isArchived).map(p => { 
        const paid = p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0;
        const taskProgress = p.tasks?.reduce((sum, t) => sum + Number(t.percentage), 0) || 0;
        
        return (
          <div key={p.id} onClick={() => setSelectedProject(p)} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-2xl transition-all cursor-pointer group w-full overflow-hidden text-right relative">
            <div className="flex justify-between items-start mb-8">
              <span className={`text-[10px] font-black px-4 py-2 rounded-xl border-2 uppercase tracking-widest transition-all ${getStatusStyle(p.status)}`}>
                {p.status}
              </span>
              <button onClick={(e) => { e.stopPropagation(); deleteItem('project', p.id); }} className="text-red-400 opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 rounded-xl transition-all">
                🗑️
              </button>
            </div>
            
            <h4 className="text-2xl font-black text-slate-800 leading-tight block w-full text-right">{p.name}</h4>
            <p className="text-slate-400 font-bold mb-8 mt-2 italic block w-full text-right text-sm">العميل: {p.client}</p>
            
            {/* شريط الإنجاز الفعلي */}
            <div className="mb-4">
              <p className="text-[8px] font-black text-slate-400 mb-1">نسبة الإنجاز الفعلي للمهام: {taskProgress}%</p>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                <div className="bg-emerald-500 h-full transition-all duration-1000" style={{width: `${taskProgress}%`}}></div>
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-slate-50 pt-6 w-full text-right">
              <div className="flex-1 text-right">
                <p className="text-[10px] text-slate-300 font-black uppercase mb-1">الميزانية</p>
                <p className="font-black text-xl">{p.budget.toLocaleString()} $</p>
              </div>
              <div className="text-left text-emerald-600 flex-1">
                <p className="text-[10px] font-black uppercase mb-1">الواصل</p>
                <p className="font-black text-xl">{paid.toLocaleString()} $</p>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  </div>
)}
{/* --- تبويب أرشيف المشاريع (ARCHIVE) - نسخة مكبرة وتفاعلية --- */}
            {tab === 'archive' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 animate-in fade-in duration-500 text-right">
                    {projects.filter(p => p.isArchived).map(p => (
                        <div key={p.id} className="bg-white p-10 rounded-[4rem] shadow-xl border-2 border-slate-100 relative overflow-hidden group transition-all hover:scale-[1.02]">
                            
                            {/* خط جانبي رمادي يتحول لأزرق عند التمرير */}
                            <div className="absolute top-0 right-0 w-3 h-full bg-slate-200 group-hover:bg-indigo-500 transition-colors"></div>

                            <div className="flex justify-between items-start mb-6">
                                <h4 className="text-3xl font-black text-slate-800 leading-tight truncate px-2">{p.name}</h4>
                                <span className="bg-slate-100 text-slate-500 px-5 py-2 rounded-2xl text-xs font-black uppercase tracking-widest shadow-sm">مؤرشف 📁</span>
                            </div>

                            <p className="text-slate-400 font-bold text-xl mb-10 pr-2 italic">الجهة المستفيدة: {p.client}</p>

                            {/* أزرار التحكم داخل الأرشيف */}
                            <div className="flex flex-col lg:flex-row gap-4 mt-8 pt-8 border-t border-slate-100">
                                
                                {/* زر الفتح والمراجعة */}
                                <button 
                                    onClick={() => setSelectedProject(p)}
                                    className="flex-1 bg-[#111C44] text-white py-5 rounded-[2rem] font-black text-lg shadow-2xl hover:bg-indigo-900 transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                    👁️ عرض الحسابات والمرفقات
                                </button>

                                {/* زر إعادة التنشيط */}
                                <button 
                                    onClick={async() => {
    if(window.confirm('هل تريد إعادة هذا المشروع لقائمة المشاريع النشطة؟')) {
        // التعديل: استخدمنا API_BASE وحذفنا الخطأ الإملائي
        await fetch(`${API_BASE}/api/project/${p.id}/archive`, { method: 'PATCH' }); 
        fetchData();
        alert("✅ تمت إعادة المشروع للنشط");
    }
}}
                                    className="bg-emerald-50 text-emerald-600 px-10 py-5 rounded-[2rem] font-black text-lg border-2 border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                    ↩️ إعادة للنشط
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* رسالة في حال كان الأرشيف فارغاً */}
                    {projects.filter(p => p.isArchived).length === 0 && (
                        <div className="col-span-full py-32 text-center bg-white rounded-[5rem] border-4 border-dashed border-slate-100 animate-pulse">
                            <div className="text-9xl mb-6 opacity-10">📁</div>
                            <p className="text-3xl font-black text-slate-300 italic">لا توجد مشاريع مؤرشفة في السجل حالياً</p>
                        </div>
                    )}
                </div>
            )}
            {/* محتوى الموظفين والموردين والفروع (نفس كودك السابق) */}
           {tab === 'employees' && (
    <div className="space-y-8 animate-in zoom-in duration-300 text-right">
        
        {/* 1. نموذج الإدارة (إضافة وتعديل) */}
        <section className="bg-white p-8 lg:p-10 rounded-[3.5rem] shadow-sm border border-slate-100 w-full relative">
            <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                <h2 className="text-2xl font-black text-slate-800 border-r-8 border-emerald-500 pr-4 italic">
                    👥 إدارة الموظفين والرواتب
                </h2>
                <button onClick={exportPDF} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] hover:bg-indigo-700 shadow-xl flex items-center gap-3 font-black text-lg transition-all active:scale-95">
                    📄 سحب التقرير PDF
                </button>
            </div>
            
            <form onSubmit={handleEmployeeSubmit} className="grid grid-cols-1 sm:grid-cols-5 gap-4 bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100">
                <input type="text" placeholder="اسم الموظف" value={empForm.name} onChange={e=>setEmpForm({...empForm, name: e.target.value})} className="p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm outline-none text-right" required />
                <input type="text" placeholder="المنصب" value={empForm.position} onChange={e=>setEmpForm({...empForm, position: e.target.value})} className="p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm outline-none text-right" required />
                <input type="number" placeholder="الراتب $" value={empForm.salary} onChange={e=>setEmpForm({...empForm, salary: e.target.value})} className="p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm outline-none text-right" required />
                
                <select value={empForm.branchId} onChange={e=>setEmpForm({...empForm, branchId: e.target.value})} className="p-5 rounded-2xl bg-white border-2 border-indigo-100 font-black text-indigo-600 outline-none shadow-sm" required>
                    <option value="">-- اختر الفرع --</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>

                <button type="submit" className={`py-5 rounded-2xl font-black text-white shadow-xl transition-all text-lg ${editingEmployeeId ? 'bg-indigo-600 shadow-indigo-200' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {editingEmployeeId ? '🔄 تحديث البيانات' : 'حفظ الموظف +'}
                </button>
            </form>
        </section>

        {/* 2. مكتب صرف الرواتب (تم إصلاح اللون الأبيض) */}
        <section className="flex justify-center my-10">
            <div className="bg-[#111C44] p-10 rounded-[3.5rem] shadow-2xl w-full max-w-3xl border-4 border-amber-400 text-center">
                <h3 className="text-2xl font-black mb-8 italic text-white">💵 مكتب صرف الرواتب المركزي</h3>
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <select 
                        value={payEmpId}
                        className="p-5 rounded-2xl bg-white text-[#111C44] font-black outline-none w-full sm:w-72 shadow-lg"
                        onChange={(e) => setPayEmpId(e.target.value)}
                    >
                        <option value="">-- اختر الموظف للصرف --</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <input 
                        type="number" 
                        placeholder="المبلغ $" 
                        value={salaryPayAmount}
                        onChange={(e)=>setSalaryPayAmount(e.target.value)}
                        className="p-5 rounded-2xl bg-white text-[#111C44] font-black outline-none w-full sm:w-40 text-center shadow-lg"
                    />
                    <button 
    onClick={async () => {
        // 1. التأكد من اختيار موظف ومبلغ
        if(!payEmpId || !salaryPayAmount) return alert("اختر موظفاً وحدد المبلغ");

        // 2. العثور على بيانات الموظف المختار من القائمة
        const targetEmp = employees.find(e => e.id === parseInt(payEmpId));
        
        if (targetEmp) {
            // 3. حساب المبالغ المدفوعة سابقاً والمتبقي
            const alreadyPaid = targetEmp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0;
            const remaining = targetEmp.salary - alreadyPaid;
            const enteredAmount = parseFloat(salaryPayAmount);

            // 4. الشرط الجوهري: منع تجاوز المتبقي
            if (enteredAmount > remaining) {
                return alert(`❌ غير مقبول! المبلغ المدخل ($${enteredAmount}) يتجاوز المتبقي لهذا الموظف ($${remaining})`);
            }
        }

        // 5. إذا كان المبلغ سليماً، يتم التنفيذ
        await handleSalaryPayment(payEmpId);
        setPayEmpId(''); // تصفير الاختيار
        setSalaryPayAmount(''); // تصفير المبلغ
        alert("✅ تم صرف المبلغ بنجاح ضمن حدود الراتب");
    }}
    className="bg-amber-400 text-[#111C44] px-12 py-5 rounded-2xl font-black text-xl hover:bg-white transition-all active:scale-95 shadow-xl"
>
    تأكيد الدفع 💸
</button>       
                </div>
            </div>
        </section>

        {/* 3. الجدول الرئيسي (إصلاح الـ Enter والمسافات) */}
        <div className="bg-white p-4 lg:p-8 rounded-[4rem] shadow-2xl border border-slate-100 overflow-x-auto">
            <table className="w-full text-right border-separate border-spacing-y-4">
                <thead className="text-slate-400 text-[12px] font-black uppercase italic">
                    <tr>
                        <th className="p-4">الموظف</th>
                        {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map(d => (
                            <th key={d} className="text-center">{d}</th>
                        ))}
                        <th className="text-center min-w-[280px]">جدول الحسابات المالي ($)</th>
                        <th className="text-center">إجراءات</th>
                    </tr>
                </thead>
                <tbody className="font-bold">
                    {employees.map(emp => {
                        const totalPaid = emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0;
                        const days = [0, 1, 2, 3, 4, 5, 6];

                        return (
                            <tr key={emp.id} className="bg-white hover:bg-slate-50 transition-all rounded-3xl shadow-sm border border-slate-100">
                                <td className="p-5 border-l-4 border-indigo-500 rounded-r-3xl">
                                    <p className="text-lg text-slate-800 leading-none">{emp.name}</p>
                                    <p className="text-[10px] text-indigo-500 font-black mt-1">{emp.position}</p>
                                </td>

                                {days.map(dayNum => {
    const d = new Date();
    // ضبط الوقت للظهر (12:00) لتجنب قفز التاريخ عند تحويل المناطق الزمنية
    d.setHours(12, 0, 0, 0); 
    const diff = d.getDate() - d.getDay() + dayNum;
    const dateObj = new Date(d.setDate(diff));
    
    // استخدام تنسيق 'en-CA' ليعطينا YYYY-MM-DD بالتوقيت المحلي تماماً
    const dateStr = dateObj.toLocaleDateString('en-CA'); 

    // العثور على السجل بناءً على مطابقة التاريخ المحلي
    const record = emp.attendances?.find(a => {
        const localA = new Date(a.date).toLocaleDateString('en-CA');
        return localA === dateStr;
    });
    const status = record?.status;

    return (
        <td key={dayNum} className="p-1 text-center">
            <input 
                type="text" 
                maxLength="1"
                placeholder="-"
                // الـ key يضمن تحديث المربع فوراً عند تغير الحالة
                key={`${emp.id}-${dateStr}-${status}`}
                value={status === 'حاضر' ? '1' : status === 'غائب' ? '0' : ''}
                
                onChange={(e) => handleAttendance(emp.id, e.target.value, dateStr)}
                onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}

                className={`w-10 h-10 text-center rounded-xl border-2 font-black text-sm transition-all outline-none cursor-pointer
                    ${status === 'حاضر' ? 'bg-emerald-500 border-emerald-600 text-white shadow-md' : 
                      status === 'غائب' ? 'bg-red-500 border-red-600 text-white shadow-md' : 
                      'bg-slate-100 border-slate-200 focus:bg-white focus:border-indigo-400'}`}
            />
        </td>
    );
})}

                                {/* جدول الحسابات الصغير بمسافات متساوية flex-1 */}
                                <td className="p-4">
                                    <div className="bg-slate-50 p-4 rounded-2xl border flex justify-between items-center text-center px-4">
                                        <div className="flex-1 flex flex-col min-w-[60px]"><span className="text-[9px] text-slate-400 font-black">الشهري</span><span className="text-sm text-slate-700 font-black">${emp.salary}</span></div>
                                        <div className="w-[1px] h-8 bg-slate-200 mx-1"></div>
                                        <div className="flex-1 flex flex-col min-w-[60px]"><span className="text-[9px] text-emerald-500 font-black">الواصل</span><span className="text-sm text-emerald-600 font-black">${totalPaid}</span></div>
                                        <div className="w-[1px] h-8 bg-slate-200 mx-1"></div>
                                        <div className="flex-1 flex flex-col min-w-[60px]"><span className="text-[9px] text-red-500 font-black">المتبقي</span><span className="text-sm text-red-600 font-black">${emp.salary - totalPaid}</span></div>
                                    </div>
                                </td>

                                <td className="p-4 rounded-l-3xl">
                                    <div className="flex gap-4 justify-center">
                                        <button onClick={()=>startEditEmployee(emp)} className="hover:scale-125 transition-all text-xl">✏️</button>
                                        <button onClick={()=>deleteItem('employee', emp.id)} className="hover:scale-125 transition-all text-xl">🗑️</button>
                                    </div>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    </div>
)}

            {tab === 'suppliers' && (
                <div className="space-y-12 animate-in fade-in duration-500 text-right"><section className="bg-white p-8 lg:p-10 rounded-[3rem] shadow-sm border border-slate-100 w-full text-right"><h2 className="text-xl font-black mb-8 text-slate-800 border-r-8 border-[#111C44] pr-4 italic underline decoration-blue-100 text-right">🤝 إضافة مورد جديد</h2><form onSubmit={async (e) => { e.preventDefault(); await fetch(`${API_BASE}/api/suppliers`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(supForm)}); setSupForm({name:'', phone:'', address:''}); fetchData(); }} className="grid grid-cols-1 md:grid-cols-3 gap-6 text-right"><input type="text" placeholder="اسم المورد" value={supForm.name} onChange={e=>setSupForm({...supForm, name: e.target.value})} className="p-5 rounded-2xl bg-slate-50 font-bold shadow-inner text-right outline-none" required /><input type="text" placeholder="رقم الهاتف" value={supForm.phone} onChange={e=>setSupForm({...supForm, phone: e.target.value})} className="p-5 rounded-2xl bg-slate-50 font-bold shadow-inner text-right outline-none" /><input type="text" placeholder="العنوان" value={supForm.address} onChange={e=>setSupForm({...supForm, address: e.target.value})} className="p-5 rounded-2xl bg-slate-50 font-bold shadow-inner text-right outline-none" /><button className="md:col-span-3 bg-[#111C44] text-white font-black py-5 rounded-2xl text-lg shadow-xl hover:bg-indigo-900 transition-all">حفظ البيانات</button></form></section><div className="grid grid-cols-1 md:grid-cols-3 gap-8">{suppliers.map(s => { const debt = s.materials?.reduce((sum, m) => sum + m.price, 0) || 0; return (<div key={s.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 group relative shadow-sm text-right"><button onClick={() => deleteItem('suppliers', s.id)} className="absolute top-8 left-8 text-red-400 opacity-0 group-hover:opacity-100">🗑️</button><div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-3xl mb-6 shadow-inner">🤝</div><h4 className="text-2xl font-black text-slate-800 mb-2 truncate px-2">{s.name}</h4><p className="text-slate-400 font-bold italic mb-6 text-sm">📞 {s.phone || 'بدون هاتف'}</p><div className="pt-6 border-t border-slate-50"><p className="text-[10px] text-red-400 font-black uppercase">إجمالي المديونية</p><p className="text-2xl lg:text-3xl font-black text-red-600">$ {debt.toLocaleString()}</p></div></div>)})}</div></div>
            )}
        </div>
        {tab === 'finances' && user?.role === 'admin' && (
    <div className="space-y-10 animate-in fade-in duration-700 text-right">
        {/* ملخص الأرقام الكبرى */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-emerald-600 p-10 rounded-[3rem] text-white shadow-2xl">
                <p className="text-xs font-black opacity-80 uppercase">صافي أرباح المشاريع</p>
                <h3 className="text-4xl font-black">
                    $ {projects.reduce((acc, p) => {
                        const rec = p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0;
                        const spent = (p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0);
                        return acc + (rec - spent);
                    }, 0).toLocaleString()}
                </h3>
            </div>
            <div className="bg-red-600 p-10 rounded-[3rem] text-white shadow-2xl">
                <p className="text-xs font-black opacity-80 uppercase">إجمالي الرواتب المدفوعة</p>
                <h3 className="text-4xl font-black">
                    $ {employees.reduce((acc, emp) => acc + (emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0), 0).toLocaleString()}
                </h3>
            </div>
            <div className="bg-[#111C44] p-10 rounded-[3rem] text-white shadow-2xl border-4 border-amber-400">
                <p className="text-xs font-black opacity-80 uppercase text-amber-400">الربح النهائي للشركة</p>
                <h3 className="text-5xl font-black">
                    $ {(
                        projects.reduce((acc, p) => acc + ((p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0) - ((p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0))), 0) -
                        employees.reduce((acc, emp) => acc + (emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0), 0) -
                        officeExpenses.reduce((acc, oe) => acc + oe.amount, 0)
                    ).toLocaleString()}
                </h3>
            </div>
        </div>

        {/* نموذج إضافة مصاريف المقر */}
       <section className="bg-white p-8 rounded-[3rem] border">
    <h2 className="text-xl font-black mb-6 border-r-8 border-red-500 pr-4 italic">🏢 تسجيل مصاريف المقر الرئيسي (إيجار، كهرباء، إلخ)</h2>
    <form onSubmit={async (e) => { 
        e.preventDefault(); 
        // التعديل: استخدمنا API_BASE وحذفنا الخطأ الإملائي
        await fetch(`${API_BASE}/api/office-expenses`, {
            method:'POST', 
            headers:{'Content-Type':'application/json'}, 
            body:JSON.stringify(offExpForm)
        }); 
        setOffExpForm({description:'', amount:''}); 
        fetchData(); 
        alert("✅ تم تسجيل مصروف المقر وخصمه من الأرباح");
    }} className="flex gap-4">
        <input type="text" placeholder="وصف المصروف..." value={offExpForm.description} onChange={e=>setOffExpForm({...offExpForm, description: e.target.value})} className="flex-1 p-5 rounded-2xl bg-slate-50 font-bold text-right" required />
        <input type="number" placeholder="المبلغ" value={offExpForm.amount} onChange={e=>setOffExpForm({...offExpForm, amount: e.target.value})} className="w-48 p-5 rounded-2xl bg-slate-50 font-bold text-right" required />
        <button className="bg-red-500 text-white font-black px-10 py-5 rounded-2xl shadow-xl active:scale-95 transition-all">خصم من الأرباح</button>
    </form>
</section>
    </div>
)}
      </main>

      {/* --- MODAL المطور بالمهام الجديدة --- */}
      {selectedProject && (
        
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-2 sm:p-6 z-50 overflow-y-auto">
            <div className="bg-white w-full max-w-7xl rounded-[3rem] lg:rounded-[4rem] shadow-2xl overflow-hidden my-auto animate-in zoom-in duration-300 border border-white/20">
                <header className="bg-[#111C44] p-8 lg:p-12 text-white flex justify-between items-center shrink-0 relative overflow-hidden text-right">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 opacity-10 rounded-full -mr-32 -mt-32"></div>
                    <div className="min-w-0 flex-1 z-10 text-right"><div className="flex flex-wrap items-center gap-4 mb-4"><span className={`text-sm font-black px-6 py-2 rounded-xl border-2 uppercase tracking-widest transition-all ${getStatusStyle(selectedProject.status)}`}>{selectedProject.status}</span> <button onClick={exportProjectReportPDF} className="bg-white/10 hover:bg-indigo-600 px-6 py-3 rounded-2xl text-xs font-black shadow-lg flex items-center gap-3 border border-white/20 transition-all active:scale-95">📄 كشف حساب PDF</button></div><h2 className="text-4xl lg:text-5xl font-black leading-tight block w-full">{selectedProject.name}</h2><p className="text-indigo-100 text-2xl font-bold mt-2 opacity-90 italic underline decoration-indigo-400 underline-offset-8 block w-full">العميل: {selectedProject.client}</p></div>
                    <button onClick={() => setSelectedProject(null)} className="w-16 h-16 bg-white/10 hover:bg-red-500 rounded-full flex items-center justify-center text-3xl transition-all mr-8 z-10 shadow-lg">✕</button>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-4 h-full text-right">
                    <div className="bg-slate-50 p-8 lg:p-10 border-l border-slate-200 space-y-8 lg:h-[650px] overflow-y-auto shadow-inner text-right">
                        {(() => { const received = selectedProject.payments?.reduce((s, p) => s + p.amount, 0) || 0; const spent = (selectedProject.expenses?.reduce((s, p) => s + p.amount, 0) || 0) + (selectedProject.materials?.reduce((s, p) => s + p.price, 0) || 0); const currentLiquidity = received - spent; return (<div className={`p-8 rounded-[3rem] border-4 text-center shadow-2xl transition-all ${currentLiquidity <= 0 ? 'bg-red-50 border-red-500 animate-pulse' : 'bg-emerald-50 border-emerald-500'}`}><p className="text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">السيولة المتاحة للعمل الآن</p><h3 className={`text-4xl font-black ${currentLiquidity <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{currentLiquidity.toLocaleString()} $</h3><p className="text-xs mt-3 font-black italic">{currentLiquidity <= 0 ? '⚠️ توقف! أنت تصرف من جيبك' : '✅ العمل مستمر ضمن السيولة'}</p></div>); })()}<div className="space-y-4 text-right"><div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-full block">ميزانية العقد الكلية</p><p className="text-2xl font-black text-slate-800">{selectedProject.budget.toLocaleString()} $</p></div><div className="bg-white p-6 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-full block">المتبقي بذمة العميل</p><p className="text-2xl font-black text-amber-600">{(selectedProject.budget - (selectedProject.payments?.reduce((s,p)=>s+p.amount,0)||0)).toLocaleString()} $</p></div></div><div className="space-y-3 pt-4 border-t text-right"><p className="text-xs font-black text-slate-500 px-4 uppercase tracking-widest text-center">تحديث حالة المشروع</p>{['قيد التنفيذ', 'مكتمل', 'متوقف', 'ملغي'].map(st => (<button key={st} onClick={()=>updateProjectStatus(st)} className={`w-full p-5 rounded-2xl text-sm font-black transition-all border-2 flex items-center justify-between ${selectedProject.status===st ? 'bg-[#111C44] text-white border-[#111C44] shadow-xl scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200'}`}><span>{st}</span><span>{st === 'قيد التنفيذ' ? '🔵' : st === 'مكتمل' ? '🟢' : st === 'متوقف' ? '🟡' : '🔴'}</span></button>))}</div>
                        {/* زر الأرشفة للمدير فقط */}
{user?.role === 'admin' && (
   <button 
    onClick={async() => { 
    if(window.confirm('هل تريد نقل هذا المشروع إلى الأرشيف؟')){
        try {
            const res = await fetch(`${API_BASE}/api/project/${selectedProject.id}/archive`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                }
            });

            if (res.ok) {
                alert("✅ تمت الأرشفة بنجاح");
                setSelectedProject(null); // غلق نافذة المشروع
                fetchData(); // تحديث القائمة فوراً
            } else {
                alert("❌ فشل الأرشفة من السيرفر");
            }
        } catch (err) {
            alert("❌ خطأ اتصال بالإنترنت");
        }
    } 
}}
    className="w-full p-4 rounded-2xl bg-slate-200 text-slate-700 font-black text-xs mt-4 hover:bg-slate-300 transition-all"
>
    📁 نقل المشروع إلى الأرشيف
</button>
)}</div>
                        
                        
                    <div className="lg:col-span-3 p-6 lg:p-12 lg:h-[650px] overflow-y-auto min-w-0 text-right"><div className="flex flex-wrap gap-4 mb-10 bg-slate-100/50 p-3 rounded-3xl w-full sm:w-fit border border-slate-200 text-right">
                        {[{id:'payments',l:'💰 سجل الأقساط'}, {id:'expenses',l:'💸 المصاريف'}, {id:'materials',l:'🧱 المواد'}, {id:'attachments',l:'📁 المرفقات'}, {id:'tasks',l:'📝 مراحل الإنجاز'}].map(t=>(<button key={t.id} onClick={()=>setModalTab(t.id)} className={`py-4 px-10 rounded-2xl font-black text-sm transition-all shadow-sm ${modalTab===t.id ? 'bg-[#111C44] text-white scale-105 shadow-xl' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}>{t.l}</button>))}</div>
                        
                        {/* [جديد] تبويب المهام ومراحل الإنجاز */}
                        {modalTab === 'tasks' && (
                            <div className="space-y-8 animate-in fade-in duration-500 text-right">
                                <form onSubmit={(e)=>{ e.preventDefault(); handleAddOrUpdateSubItem('tasks', taskForm, ()=>setTaskForm({description:'', percentage:''})); }} className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-8 rounded-[3rem] border border-slate-200">
                                    <input type="text" placeholder="اسم المرحلة (مثلاً: صب الأعمدة)" value={taskForm.description} onChange={e=>setTaskForm({...taskForm, description:e.target.value})} className="md:col-span-1 p-5 rounded-[2rem] bg-white border-none outline-none font-bold text-right" required />
                                    <input type="number" placeholder="وزن المرحلة % (مثلاً 20)" value={taskForm.percentage} onChange={e=>setTaskForm({...taskForm, percentage:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-bold text-right" required />
                                    <button className="bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-700">إضافة مرحلة عمل +</button>
                                </form>
                                <div className="border-2 rounded-[3rem] overflow-hidden bg-white shadow-sm">
                                    <table className="w-full text-right"><thead className="bg-slate-50 text-xs font-black border-b-2"><tr><th className="p-6">المرحلة</th><th className="p-6">النسبة</th><th className="p-6">الحالة</th><th className="p-6">خيارات</th></tr></thead>
                                    <tbody className="font-bold text-lg">
                                        {selectedProject.tasks?.map(task => (
                                            <tr key={task.id} className="border-b hover:bg-indigo-50/20">
                                                <td className="p-6">{task.description}</td><td className="p-6">{task.percentage} %</td>
                                                <td className="p-6"><button onClick={()=>toggleTask(task.id)} className={`px-4 py-2 rounded-xl text-xs ${task.isCompleted?'bg-emerald-100 text-emerald-600':'bg-red-100 text-red-600'}`}>{task.isCompleted?'مكتملة':'قيد العمل'}</button></td>
                                                <td className="p-6 text-center"><button onClick={()=>deleteItem('tasks', task.id)} className="text-red-500">🗑️</button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* بقية التبويبات (الأقساط، المصاريف، المواد، المرفقات) كما هي... */}
                        {modalTab === 'payments' && ( <div className="space-y-8 animate-in fade-in duration-300 text-right"><form onSubmit={(e)=>{e.preventDefault(); handleAddOrUpdateSubItem('payment', {amount: payAmount}, ()=>setPayAmount(''))}} className="flex flex-col sm:flex-row gap-4 bg-emerald-50 p-6 rounded-[3rem] border border-emerald-100 shadow-sm text-right"><input type="number" placeholder="أدخل مبلغ القسط..." value={payAmount} onChange={e=>setPayAmount(e.target.value)} className="flex-1 p-5 rounded-[2rem] bg-white border-none outline-none font-black text-2xl text-emerald-700 text-right shadow-inner" required /><button className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-emerald-700">تثبيت القسط +</button></form><div className="border-2 border-slate-50 rounded-[3rem] overflow-hidden bg-white shadow-sm text-right"><table className="w-full text-right"><thead className="bg-slate-50 text-sm font-black text-slate-500 uppercase tracking-widest border-b-2 text-right"><tr><th className="p-6">المبلغ المستلم</th><th className="p-6 text-center">التاريخ والوقت</th></tr></thead><tbody className="font-black text-xl text-right text-right">{selectedProject.payments?.map(p => (<tr key={p.id} className="border-b border-slate-50 hover:bg-emerald-50/20 transition-all italic"><td className="p-6 text-emerald-600 text-right">+{p.amount.toLocaleString()} $</td><td className="p-6 text-center text-slate-400 font-bold text-sm text-right">{new Date(p.date).toLocaleString('ar-EG')}</td></tr>))}</tbody></table></div></div> )}
                        {/* (بقية كود المصاريف والمواد والمرفقات مستمرة هنا بنفس الترتيب)... */}
{/* --- محتوى تبويب المصاريف --- */}
                       {modalTab === 'expenses' && (
    <div className="space-y-8 animate-in fade-in duration-300 text-right">
        {/* 1. نموذج تسجيل مصروف جديد */}
        <form onSubmit={(e)=>{e.preventDefault(); handleAddOrUpdateSubItem('expense', expForm, ()=>setExpForm({description:'', amount:''}))}} 
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-red-50 p-6 rounded-[3rem] border border-red-100 shadow-sm">
            
            <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] font-black text-red-400 pr-4 uppercase">بيان الصرف (أجور، نقل، إلخ)</label>
                <input type="text" placeholder="اكتب وصف المصروف هنا..." value={expForm.description} onChange={e=>setExpForm({...expForm, description:e.target.value})} className="w-full p-5 rounded-[2rem] bg-white border-none outline-none font-bold text-lg text-right shadow-sm focus:ring-2 focus:ring-red-500 transition-all" required />
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-black text-red-400 pr-4 uppercase">المبلغ النقدى</label>
                <input type="number" placeholder="0.00" value={expForm.amount} onChange={e=>setExpForm({...expForm, amount:e.target.value})} className="w-full p-5 rounded-[2rem] bg-white border-none outline-none font-black text-2xl text-red-700 text-right shadow-inner focus:ring-2 focus:ring-red-500 transition-all" required />
            </div>

            <button className="sm:col-span-3 bg-red-500 text-white font-black py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-red-600 transition-all active:scale-95 flex items-center justify-center gap-3">
                تثبيت المصروف النقدي 💸
            </button>
        </form>

        {/* 2. جدول المصاريف الاحترافي */}
        <div className="border-2 border-slate-50 rounded-[3rem] overflow-hidden bg-white shadow-sm">
            <table className="w-full text-right min-w-[500px]">
                <thead className="bg-slate-50 text-sm font-black text-slate-500 uppercase border-b-2">
                    <tr>
                        <th className="p-6">ت</th>
                        <th className="p-6">بيان الصرف (الخدمة)</th>
                        <th className="p-6 text-left">المبلغ المخصوم</th>
                        <th className="p-6 text-center">التاريخ</th>
                        <th className="p-6 text-center">خيارات</th>
                    </tr>
                </thead>
                <tbody className="font-black text-xl">
                    {selectedProject.expenses?.map((ex, index) => (
                        <tr key={ex.id} className="border-b border-slate-50 hover:bg-red-50/20 transition-all italic">
                            <td className="p-6 text-slate-300 text-sm">{index + 1}</td>
                            <td className="p-6 text-slate-700">{ex.description}</td>
                            <td className="p-6 text-left text-red-500">-{ex.amount.toLocaleString()} $</td>
                            <td className="p-6 text-center text-slate-400 font-bold text-xs">
                                {new Date(ex.date).toLocaleDateString('ar-EG')}
                            </td>
                            <td className="p-6 text-center">
                                <button onClick={()=>deleteItem('expense', ex.id)} className="p-3 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm">
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    ))}
                    
                    {/* رسالة في حال عدم وجود بيانات */}
                    {(!selectedProject.expenses || selectedProject.expenses.length === 0) && (
                        <tr>
                            <td colSpan="5" className="p-16 text-center text-slate-300 font-bold italic text-xl">
                                📝 لا توجد مصاريف نقدية مسجلة لهذا المشروع
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}

                        {/* --- محتوى تبويب المواد --- */}
                       {modalTab === 'materials' && (
    <div className="space-y-8 animate-in fade-in duration-300 text-right">
        {/* 1. فورم الإضافة (يبقى كما هو فوق الجدول) */}
        <form onSubmit={(e)=>{ e.preventDefault(); handleAddOrUpdateSubItem('material', matForm, ()=>setMatForm({name:'', quantity:'', unit:'كيس', price:'', supplierId:''}), !!editingMaterialId, editingMaterialId) }} 
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 bg-amber-50 p-8 rounded-[3rem] border border-amber-200 shadow-lg">
            <input type="text" placeholder="اسم المادة" value={matForm.name} onChange={e=>setMatForm({...matForm, name:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-bold" required />
            <input type="number" placeholder="الكمية" value={matForm.quantity} onChange={e=>setMatForm({...matForm, quantity:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-bold" required />
            <select value={matForm.unit} onChange={e=>setMatForm({...matForm, unit:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none font-black text-amber-600 shadow-sm"><option>كيس</option><option>طن</option><option>متر مكعب</option><option>لوري</option><option>قطعة</option></select>
            <input type="number" placeholder="التكلفة" value={matForm.price} onChange={e=>setMatForm({...matForm, price:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-black text-2xl text-amber-800 shadow-sm" required />
            <select value={matForm.supplierId} onChange={e=>setMatForm({...matForm, supplierId: e.target.value})} className="sm:col-span-2 xl:col-span-4 p-5 rounded-[2rem] bg-white font-black border-2 border-amber-300 text-[#111C44]">
                <option value="">-- اختر المورد (اختياري) --</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className={`sm:col-span-2 xl:col-span-4 py-5 rounded-[2rem] font-black text-lg shadow-xl text-white ${editingMaterialId ? 'bg-indigo-600' : 'bg-amber-600 hover:bg-amber-700'}`}>
                {editingMaterialId ? 'تحديث بيانات المادة 🔄' : 'إضافة مواد للموقع 🧱'}
            </button>
        </form>

        {/* 2. الجدول الاحترافي (هذا هو اللي يخليها داخل جدول) */}
        <div className="border-2 border-slate-50 rounded-[3rem] overflow-hidden bg-white shadow-sm">
            <table className="w-full text-right min-w-[700px]">
                <thead className="bg-slate-50 text-sm font-black text-slate-500 uppercase border-b-2">
                    <tr>
                        <th className="p-6">المادة</th>
                        <th className="p-6">المورد (الدائن)</th>
                        <th className="p-6">الكمية</th>
                        <th className="p-6 text-left">التكلفة</th>
                        <th className="p-6 text-center">خيارات</th>
                    </tr>
                </thead>
                <tbody className="font-black text-xl">
                    {selectedProject.materials?.map(m => (
                        <tr key={m.id} className="border-b border-slate-50 hover:bg-amber-50/20 transition-all italic">
                            <td className="p-6 text-slate-800">{m.name}</td>
                            <td className="p-6 text-indigo-600 text-sm italic">{m.supplier?.name || 'شراء مباشر'}</td>
                            <td className="p-6 text-slate-400 text-sm">{m.quantity} {m.unit}</td>
                            <td className="p-6 text-left text-amber-700">-{m.price.toLocaleString()} $</td>
                            <td className="p-6">
                                <div className="flex justify-center gap-3">
                                    <button onClick={()=>startEditMaterial(m)} className="p-2 text-indigo-600 hover:scale-125 transition-transform">✏️</button>
                                    <button onClick={()=>deleteItem('material', m.id)} className="p-2 text-red-500 hover:scale-125 transition-transform">🗑️</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {(!selectedProject.materials || selectedProject.materials.length === 0) && (
                        <tr><td colSpan="5" className="p-16 text-center text-slate-300 font-bold italic text-xl">🧱 لا توجد مواد مسجلة لهذا المشروع</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
)}


                        {/* --- محتوى تبويب المرفقات --- */}
                        {modalTab === 'attachments' && (
                            <div className="space-y-8 animate-in fade-in duration-300 text-right">
                                <form onSubmit={handleFileUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-indigo-50 p-8 rounded-[3rem] border border-indigo-100 shadow-inner">
                                    <input type="text" placeholder="اسم المرفق" value={attachmentName} onChange={e=>setAttachmentName(e.target.value)} className="p-5 rounded-2xl bg-white outline-none font-bold text-right" required />
                                    <input id="fileInput" type="file" onChange={e=>setSelectedFile(e.target.files[0])} className="p-4 rounded-2xl bg-white text-xs font-black" required />
                                    <button disabled={uploading} className="sm:col-span-2 bg-[#111C44] text-white py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-indigo-200">{uploading ? 'جاري الرفع...' : 'رفع المرفق 📁'}</button>
                                </form>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {selectedProject.attachments?.map(file => (
                                        <div key={file.id} className="bg-white p-6 rounded-[2.5rem] border-2 shadow-sm relative group overflow-hidden transition-all hover:shadow-xl text-right">
                                            <div className="w-full h-32 bg-slate-100 rounded-2xl mb-4 flex items-center justify-center overflow-hidden">
                                                {file.fileType?.includes('image') ? <img src={file.url} className="w-full h-full object-cover" /> : '📄'}
                                            </div>
                                            <h5 className="font-black text-slate-800 text-sm truncate text-right">{file.name}</h5>
                                            <div className="flex gap-2 mt-4"><a href={file.url} target="_blank" className="flex-1 bg-indigo-50 text-indigo-600 py-3 rounded-xl text-center text-xs font-black">عرض</a><button onClick={()=>deleteItem('attachment', file.id)} className="w-12 h-12 bg-red-50 text-red-500 rounded-xl">🗑️</button></div>
                                        </div>
                                    ))}
                                    
                                </div>
                            </div>
                        )}
                                          
                    </div>
                </div>
            </div>
        </div>

      )}
       {/* نافذة القفل الاحترافية للموبايل واللابتوب */}

{showPinModal && (
    <div className="fixed inset-0 bg-[#111C44]/95 backdrop-blur-xl z-[9999] flex items-center justify-center p-6 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-md p-10 rounded-[3rem] shadow-2xl text-center">
            <div className="text-5xl mb-6">🔒</div>
            <h3 className="text-2xl font-black text-slate-800 mb-2">قسم المدير فقط</h3>
            <p className="text-slate-400 font-bold mb-8 text-sm">يرجى إدخال رمز الأمان للوصول</p>
            
            <form onSubmit={handlePinSubmit} className="space-y-6">
                  {/* هنا يوضع الكود الذي سألت عنه بالضبط 👇 */}
                <input 
                    type="password" 
                    pattern="[0-9]*" 
                    inputMode="numeric" 
                    placeholder="****" 
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)} 
                    className="w-full text-center text-4xl tracking-[1rem] p-5 rounded-3xl bg-slate-50 border-2 border-slate-100 outline-none focus:border-indigo-600 font-black transition-all"
                    autoFocus
                />
                <div className="flex gap-4">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95">فتح القفل</button>
                    <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 bg-slate-100 text-slate-400 py-5 rounded-2xl font-black text-lg active:scale-95">إلغاء</button>
                </div>
            </form>
        </div>
    </div>
)}     
      
    </div>
    
  );
  
}


export default App;