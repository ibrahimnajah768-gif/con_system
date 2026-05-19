import { useState, useEffect } from 'react'
import html2pdf from 'html2pdf.js' 

function App() {
  // ==========================================
  // --- حالات نظام الأمان (AUTHENTICATION) ---
  // ==========================================
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false); // حالة فتح قفل المدير
  const [isLoginView, setIsLoginView] = useState(true);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });

  // ==========================================
  // --- الحالات العامة للنظام (CORE STATES) ---
  // ==========================================
  const [tab, setTab] = useState('projects'); 
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [suppliers, setSuppliers] = useState([]); 
  
  const [selectedProject, setSelectedProject] = useState(null);
  const [modalTab, setModalTab] = useState('payments');

  // نماذج الإدخال
  const [payAmount, setPayAmount] = useState('');
  const [expForm, setExpForm] = useState({ description: '', amount: '' });
  const [matForm, setMatForm] = useState({ name: '', quantity: '', unit: 'كيس', price: '', supplierId: '' });
  const [editingMaterialId, setEditingMaterialId] = useState(null);
  const [supForm, setSupForm] = useState({ name: '', phone: '', address: '' });
  
  const [salaryPayAmount, setSalaryPayAmount] = useState('');
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);

  const [attachmentName, setAttachmentName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  
  const [projForm, setProjForm] = useState({ name: '', client: '', budget: '', branchId: '' });
  const [empForm, setEmpForm] = useState({ name: '', position: '', salary: '', phone: '', branchId: '' });
  const [branchForm, setBranchForm] = useState({ name: '', location: '' });

  // ==========================================
  // --- وظائف جلب البيانات (FETCHING) ---
  // ==========================================
  useEffect(() => {
    if (token) { fetchData(); }
  }, [token]);

  const fetchData = async () => {
    try {
        const [p, e, b, s] = await Promise.all([
            fetch('http://192.168.10.13:3000/api/projects').then(res => res.json()),
            fetch('http://192.168.10.13:3000/api/employees').then(res => res.json()),
            fetch('http://192.168.10.13:3000/api/branches').then(res => res.json()),
            fetch('http://192.168.10.13:3000/api/suppliers').then(res => res.json())
        ]);
        setProjects(p); setEmployees(e); setBranches(b); setSuppliers(s);
        if (b.length > 0 && !projForm.branchId) {
            setProjForm(prev => ({ ...prev, branchId: b[0].id }));
            setEmpForm(prev => ({ ...prev, branchId: b[0].id }));
        }
    } catch (err) { console.error("خطأ في البيانات"); }
  };

  // وظيفة التحقق من رمز المدير (PIN)
  const checkAdminPin = (targetTab) => {
    if (isAdminUnlocked) {
      setTab(targetTab);
    } else {
      const pin = window.prompt("يرجى إدخال رمز المدير السري للدخول:");
      if (pin === "1234") { // يمكنك تغيير الرمز 1234 لأي رقم تريده
        setIsAdminUnlocked(true);
        setTab(targetTab);
      } else if (pin !== null) {
        alert("❌ الرمز غير صحيح، لا تملك صلاحية الوصول.");
      }
    }
  };

  // وظائف الحماية والإدارة
  const handleAuth = async (e) => {
    e.preventDefault();
    const url = isLoginView ? 'login' : 'register';
    try {
        const res = await fetch(`http://localhost:3000/api/auth/${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authForm),
        });
        const data = await res.json();
        if (res.ok) {
            if (isLoginView) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                setToken(data.token);
                setUser(data.user);
                setIsAdminUnlocked(false); // إعادة القفل عند الدخول الجديد
            } else {
                alert("تم إنشاء الحساب بنجاح"); setIsLoginView(true);
            }
        } else { alert(data.error); }
    } catch (err) { alert("فشل الاتصال"); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); 
    localStorage.removeItem('user');
    setToken(null); setUser(null); setSelectedProject(null);
    setIsAdminUnlocked(false);
  };

  const deleteItem = async (type, id) => {
    if (!isAdminUnlocked) {
        const pin = window.prompt("للحذف، يرجى إدخال رمز المدير:");
        if (pin !== "1234") return alert("فشل التحقق");
        setIsAdminUnlocked(true);
    }
    if (!window.confirm('⚠️ حذف نهائي؟')) return;
    try {
        await fetch(`http://localhost:3000/api/${type}/${id}`, { method: 'DELETE' });
        if (selectedProject?.id === id && type === 'project') setSelectedProject(null);
        fetchData();
    } catch (err) { alert("فشل الحذف"); }
  };

  const handleAddOrUpdateSubItem = async (url, body, resetCallback, isUpdate = false, id = null) => {
    const method = isUpdate ? 'PATCH' : 'POST';
    const finalUrl = isUpdate ? `http://localhost:3000/api/${url}/${id}` : `http://localhost:3000/api/${url}`;
    await fetch(finalUrl, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, projectId: selectedProject?.id }),
    });
    resetCallback(); setEditingMaterialId(null);
    fetchData();
    const updatedRes = await fetch('http://localhost:3000/api/projects').then(res => res.json());
    if(selectedProject) setSelectedProject(updatedRes.find(p => p.id === selectedProject.id));
  };

  const handleAttendance = async (empId, status) => {
    await fetch('http://localhost:3000/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId, status }),
    });
    fetchData(); 
  };

  const handleSalaryPayment = async (empId) => {
    if (!salaryPayAmount) return alert("أدخل المبلغ");
    await fetch('http://localhost:3000/api/salary-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId: empId, amount: salaryPayAmount, type: 'أسبوعي' }),
    });
    setSalaryPayAmount('');
    fetchData();
    alert("💰 تم تسجيل الدفعة بنجاح");
  };

  const startEditEmployee = (emp) => {
    setEditingEmployeeId(emp.id);
    setEmpForm({ name: emp.name, position: emp.position, salary: emp.salary, branchId: emp.branchId });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEmployeeSubmit = async (e) => {
    e.preventDefault();
    const method = editingEmployeeId ? 'PATCH' : 'POST';
    const url = editingEmployeeId ? `http://localhost:3000/api/employee/${editingEmployeeId}` : 'http://localhost:3000/api/employee';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(empForm) });
    setEditingEmployeeId(null);
    setEmpForm({ name: '', position: '', salary: '', branchId: branches[0]?.id });
    fetchData();
    alert("✅ تم الحفظ بنجاح");
  };

  const exportPDF = () => {
    const element = document.getElementById('hr-print-area');
    if(!element) return;
    const opt = {
      margin: 0.5,
      filename: `تقرير_الرواتب_${new Date().toLocaleDateString('ar-EG')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'in', format: 'a4', orientation: 'landscape' }
    };
    html2pdf().set(opt).from(element).save();
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
            body { font-family: 'Cairo', sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 4px double #111C44; padding-bottom: 20px; margin-bottom: 30px; }
            .stats { display: flex; gap: 15px; margin-bottom: 30px; }
            .stat-box { flex: 1; padding: 20px; border-radius: 15px; text-align: center; border: 1px solid #ddd; }
            .table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .table th { background: #111C44; color: white; padding: 12px; text-align: right; }
            .table td { padding: 12px; border-bottom: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="header"><h1>كشف حساب مالي رسمي</h1><p>نظام المِعمار لإدارة المقاولات</p></div>
          <div class="stats">
            <div class="stat-box" style="background: #f0fdf4;"><h4>إجمالي الواصل</h4><p>$ ${received.toLocaleString()}</p></div>
            <div class="stat-box" style="background: #fef2f2;"><h4>إجمالي المصروفات</h4><p>$ ${spent.toLocaleString()}</p></div>
            <div class="stat-box" style="background: #eff6ff;"><h4>الربح الصافي</h4><p>$ ${profit.toLocaleString()}</p></div>
          </div>
          <h3>المشروع: ${selectedProject.name} | العميل: ${selectedProject.client}</h3>
          <table class="table"><thead><tr><th>البيان</th><th>المبلغ</th><th>التاريخ</th></tr></thead>
          <tbody>
            ${selectedProject.payments?.map(p => `<tr><td>قسط مستلم</td><td>$ ${p.amount}</td><td>${new Date(p.date).toLocaleDateString('ar-EG')}</td></tr>`).join('')}
            ${selectedProject.expenses?.map(ex => `<tr><td>${ex.description}</td><td>$ -${ex.amount}</td><td>${new Date(ex.date).toLocaleDateString('ar-EG')}</td></tr>`).join('')}
          </tbody></table>
          <script>window.onload = function() { window.print(); };</script>
        </body>
      </html>
    `;
    printWindow.document.write(reportContent);
    printWindow.document.close();
  };

  const handleFileUpload = async (e) => {
    e.preventDefault(); if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile); formData.append('projectId', selectedProject.id); formData.append('name', attachmentName);
    const res = await fetch('http://localhost:3000/api/upload', { method: 'POST', body: formData });
    if (res.ok) { setAttachmentName(''); setSelectedFile(null); fetchData(); }
    setUploading(false);
  };

  const updateProjectStatus = async (status) => {
    await fetch(`http://localhost:3000/api/project/${selectedProject.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
    });
    fetchData(); setSelectedProject({ ...selectedProject, status });
  };

  const getStatusStyle = (status) => {
    switch(status) {
        case 'مكتمل': return 'bg-emerald-600 text-white border-emerald-700';
        case 'متوقف': return 'bg-amber-500 text-white border-amber-600';
        case 'ملغي': return 'bg-red-600 text-white border-red-700';
        case 'قيد التنفيذ': return 'bg-blue-600 text-white border-blue-700';
        default: return 'bg-slate-100 text-slate-700';
    }
  }

  const startEditMaterial = (m) => {
    setEditingMaterialId(m.id);
    setMatForm({ name: m.name, quantity: m.quantity, unit: m.unit, price: m.price, supplierId: m.supplierId || '' });
  };

  // --- شاشة تسجيل الدخول ---
  if (!token) {
    return (
      <div className="min-h-screen bg-[#111C44] flex items-center justify-center p-4 font-sans text-right" dir="rtl">
        <div className="bg-white w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in fade-in duration-500 border border-white/20">
          <div className="bg-indigo-600 p-10 text-white text-center">
            <h2 className="text-3xl font-black italic">نظام المِعمار v3</h2>
            <p className="text-indigo-100 mt-2 font-bold">{isLoginView ? 'تسجيل الدخول للنظام' : 'إنشاء حساب مدير جديد'}</p>
          </div>
          <form onSubmit={handleAuth} className="p-10 space-y-6">
            {!isLoginView && ( <input type="text" placeholder="الاسم الكامل" value={authForm.name} onChange={e=>setAuthForm({...authForm, name:e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-none outline-none font-bold shadow-inner" required /> )}
            <input type="email" placeholder="البريد الإلكتروني" value={authForm.email} onChange={e=>setAuthForm({...authForm, email:e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-none outline-none font-bold shadow-inner" required />
            <input type="password" placeholder="كلمة السر" value={authForm.password} onChange={e=>setAuthForm({...authForm, password:e.target.value})} className="w-full p-5 rounded-2xl bg-slate-50 border-none outline-none font-bold shadow-inner" required />
            <button className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-indigo-700 shadow-xl shadow-indigo-200"> {isLoginView ? 'دخول للنظام' : 'تأكيد التسجيل'} </button>
            <p className="text-center text-slate-400 font-bold text-sm"> {isLoginView ? 'ليس لديك حساب؟ ' : 'لديك حساب بالفعل؟ '} <button type="button" onClick={()=>setIsLoginView(!isLoginView)} className="text-indigo-600 underline">اضغط هنا</button> </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7FE] flex font-sans text-right text-slate-800 w-full overflow-x-hidden" dir="rtl">
      
      {/* 1. Sidebar - مطور ليعمل بكلمة سر للأدمن */}
      <aside className="w-20 lg:w-72 bg-[#111C44] text-white flex flex-col transition-all duration-300 shrink-0 sticky top-0 h-screen shadow-2xl z-40">
        <div className="p-4 lg:p-8 text-center">
            <div className="w-12 h-12 lg:w-16 lg:h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center text-2xl shadow-lg shadow-indigo-500/20">🏗️</div>
            <h1 className="hidden lg:block text-2xl font-black mt-4 tracking-tighter italic text-white/90">نظام المِعمار v3</h1>
        </div>
        <nav className="flex-1 px-2 lg:px-4 space-y-4 mt-6">
          {[
            { id: 'dashboard', label: 'الرئيسية', icon: '🏠', adminOnly: true },
            { id: 'projects', label: 'المشاريع والمالية', icon: '📊', adminOnly: false },
            { id: 'employees', label: 'الكادر الوظيفي', icon: '👥', adminOnly: false },
            { id: 'branches', label: 'فروع الشركة', icon: '🏢', adminOnly: true },
            { id: 'suppliers', label: 'الموردين والديون', icon: '🤝', adminOnly: false }
          ].map(item => (
            <button key={item.id} onClick={() => item.adminOnly ? checkAdminPin(item.id) : setTab(item.id)} 
              className={`w-full flex items-center justify-center lg:justify-start gap-4 p-5 rounded-2xl transition-all duration-300 ${tab === item.id ? 'bg-indigo-600 shadow-xl scale-105 font-black' : 'text-slate-400 hover:bg-slate-800'}`}>
              <span className="text-2xl">{item.icon}</span>
              <span className="hidden lg:block font-bold text-lg">{item.label}</span>
              {item.adminOnly && !isAdminUnlocked && <span className="hidden lg:inline text-[10px] bg-red-500 px-2 py-1 rounded-lg">🔒</span>}
            </button>
          ))}
        </nav>
        <button onClick={handleLogout} className="m-4 lg:m-6 p-4 bg-red-500/10 text-red-500 rounded-2xl font-black hover:bg-red-500 hover:text-white transition-all text-center italic shadow-sm">
          <span className="lg:hidden text-xl">🚪</span><span className="hidden lg:block">تسجيل خروج</span>
        </button>
      </aside>

      {/* 2. Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-24 bg-white border-b border-slate-100 flex items-center justify-between px-4 lg:px-10 shrink-0 shadow-sm w-full">
            <h2 className="text-xl lg:text-3xl font-black text-slate-800 italic uppercase truncate">
                {tab === 'dashboard' ? 'لوحة التحكم الشاملة' : tab === 'projects' ? 'إدارة المشاريع' : tab === 'employees' ? 'الموارد البشرية' : 'إدارة الموردين'}
            </h2>
            <div className="flex items-center gap-4 bg-slate-50 px-4 py-2 lg:px-6 lg:py-3 rounded-2xl border border-slate-100 shadow-inner">
                <div className="text-left hidden sm:block">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">مرحباً بك</p>
                    <p className="text-sm font-black text-slate-700">{user?.name || 'مدير النظام'}</p>
                </div>
                <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xl font-black shadow-md">A</div>
            </div>
        </header>

        <div className="p-4 lg:p-10 flex-1 overflow-y-auto w-full">
            
            {/* العدادات العلوية */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-12">
                {[
                    { label: 'السيولة المستلمة', val: `${projects.reduce((acc, p) => acc + (p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0), 0).toLocaleString()} $`, color: 'text-emerald-600' },
                    { label: 'المصاريف والمواد', val: `${projects.reduce((acc, p) => acc + (p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0), 0).toLocaleString()} $`, color: 'text-red-500' },
                    { label: 'المشاريع النشطة', val: projects.length, color: 'text-indigo-600' },
                    { label: 'إجمالي الكادر', val: employees.length, color: 'text-slate-800' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 lg:p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all"><p className="text-slate-400 text-[10px] lg:text-xs font-black uppercase tracking-widest mb-2">{stat.label}</p><h3 className={`text-xl lg:text-3xl font-black ${stat.color}`}>{stat.val}</h3></div>
                ))}
            </div>

            {/* --- تبويب الرئيسية (Dashboard) --- */}
            {tab === 'dashboard' && (
                <div className="space-y-12 animate-in fade-in duration-700">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                        <div className="bg-[#111C44] p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden group"><p className="text-indigo-300 font-black text-xs uppercase tracking-widest mb-4">إجمالي قيمة التعاقدات</p><h3 className="text-4xl font-black text-white">$ {projects.reduce((acc, p) => acc + p.budget, 0).toLocaleString()}</h3></div>
                        <div className="bg-white p-10 rounded-[3.5rem] border"><p className="text-emerald-600 font-black text-xs uppercase tracking-widest mb-4">إجمالي ديون الموردين</p><h3 className="text-4xl font-black text-slate-800">$ {suppliers.reduce((acc, s) => acc + (s.materials?.reduce((sum, m) => sum + m.price, 0) || 0), 0).toLocaleString()}</h3></div>
                        <div className="bg-white p-10 rounded-[3.5rem] border"><p className="text-amber-500 font-black text-xs uppercase tracking-widest mb-4">إجمالي ديون العملاء</p><h3 className="text-4xl font-black text-slate-800">$ {projects.reduce((acc, p) => acc + (p.budget - (p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0)), 0).toLocaleString()}</h3></div>
                    </div>
                    <div className="bg-white p-6 lg:p-10 rounded-[3.5rem] border-r-[12px] border-red-500 shadow-xl relative">
                        <div className="absolute top-8 left-10 bg-red-100 text-red-600 px-4 py-1 rounded-full text-[10px] font-black italic shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse border border-red-200">تنبيه المدير ⚠️</div>
                        <h2 className="text-xl lg:text-2xl font-black mb-8 text-slate-800">مشاريع تحتاج متابعة فورية</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {projects.filter(p => p.status === 'متوقف' || p.status === 'ملغي').map(p => (<div key={p.id} className="bg-red-50/50 p-6 rounded-3xl border border-red-100 flex justify-between items-center group cursor-pointer hover:bg-red-50 transition-all" onClick={() => {setTab('projects'); setSelectedProject(p)}}><div><h4 className="font-black text-slate-800">{p.name}</h4><p className="text-xs text-red-500 font-bold uppercase">{p.status}</p></div><span className="text-2xl group-hover:translate-x-2 transition-transform">👈</span></div>))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-right">
                        <div className="bg-white p-8 lg:p-10 rounded-[3.5rem] border shadow-sm"><div className="flex justify-between items-center mb-8"><h3 className="text-xl font-black text-slate-800">👥 الكادر الوظيفي</h3><span className="bg-indigo-50 text-indigo-600 px-4 py-1 rounded-xl text-xs font-black italic">{employees.length} موظف</span></div><div className="space-y-4">{branches.map(b => (<div key={b.id} className="flex justify-between items-center p-5 bg-slate-50/50 rounded-2xl border border-slate-100"><span className="font-black text-slate-700">{b.name}</span><span className="text-xs font-black bg-white px-5 py-2 rounded-xl border">{employees.filter(e => e.branchId === b.id).length} موظف</span></div>))}</div></div>
                        <div className="bg-white p-8 lg:p-10 rounded-[3.5rem] border shadow-sm flex flex-col items-center justify-center text-center"><div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner animate-pulse">🏆</div><h3 className="text-2xl font-black text-slate-800">إنجازات الشركة</h3><p className="text-slate-400 mt-2 font-bold italic text-sm">لقد أتممت بنجاح <span className="text-emerald-600 text-2xl font-black">{projects.filter(p=>p.status==='مكتمل').length}</span> مشروعاً عملاقاً!</p></div>
                    </div>
                </div>
            )}

            {/* --- تبويب المشاريع --- */}
            {tab === 'projects' && (
              <div className="space-y-12 w-full animate-in fade-in duration-500">
                <section className="bg-white p-6 lg:p-10 rounded-[3rem] shadow-sm border border-slate-100 w-full"><h2 className="text-xl font-black mb-8 text-slate-800 border-r-8 border-indigo-600 pr-4 italic underline decoration-indigo-200">✨ تسجيل عقد مشروع جديد</h2><form onSubmit={async (e) => { e.preventDefault(); await fetch('http://localhost:3000/api/project', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(projForm)}); setProjForm({...projForm, name:'', client:'', budget:''}); fetchData(); }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"><input type="text" placeholder="اسم المشروع" value={projForm.name} onChange={e=>setProjForm({...projForm, name: e.target.value})} className="p-5 rounded-2xl bg-slate-50 border-none outline-none font-bold w-full shadow-inner" required /><input type="text" placeholder="اسم العميل" value={projForm.client} onChange={e=>setProjForm({...projForm, client: e.target.value})} className="p-5 rounded-2xl bg-slate-50 border-none outline-none font-bold w-full shadow-inner" required /><input type="number" placeholder="الميزانية الكلية" value={projForm.budget} onChange={e=>setProjForm({...projForm, budget: e.target.value})} className="p-5 rounded-2xl bg-slate-50 border-none outline-none font-bold w-full shadow-inner" required /><select value={projForm.branchId} onChange={e=>setProjForm({...projForm, branchId: e.target.value})} className="p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-black w-full text-indigo-600 shadow-sm">{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="sm:col-span-2 lg:col-span-4 bg-indigo-600 text-white font-black py-5 rounded-[2rem] hover:bg-indigo-700 shadow-2xl transition-all text-xl">تأكيد وبدء المشروع</button></form></section>
                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 lg:gap-8 w-full">{projects.map(p => { const paid = p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0; return (<div key={p.id} onClick={() => setSelectedProject(p)} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-2xl transition-all cursor-pointer group w-full overflow-hidden text-right relative"><div className="flex justify-between items-start mb-8"><span className={`text-[10px] font-black px-4 py-2 rounded-xl border-2 uppercase tracking-widest transition-all ${getStatusStyle(p.status)}`}>{p.status}</span><button onClick={(e) => { e.stopPropagation(); deleteItem('project', p.id); }} className="text-red-400 opacity-0 group-hover:opacity-100 p-2 hover:bg-red-50 rounded-xl transition-all">🗑️</button></div><h4 className="text-xl lg:text-2xl font-black text-slate-800 leading-tight block w-full truncate">{p.name}</h4><p className="text-slate-400 font-bold mb-8 mt-2 italic block w-full truncate text-sm">العميل: {p.client}</p><div className="flex justify-between items-end border-t border-slate-50 pt-6 w-full"><div className="flex-1"><p className="text-[10px] text-slate-300 font-black uppercase mb-1">الميزانية</p><p className="font-black text-lg lg:text-xl">{p.budget.toLocaleString()} $</p></div><div className="text-left text-emerald-600 flex-1"><p className="text-[10px] font-black uppercase mb-1">الواصل</p><p className="font-black text-lg lg:text-xl">{paid.toLocaleString()} $</p></div></div></div>) })}</section>
              </div>
            )}

            {/* --- تبويب الموظفين والرواتب (HR SYSTEM) --- */}
            {tab === 'employees' && (
                <div className="space-y-12 animate-in zoom-in duration-300 text-right">
                    <section className="bg-white p-6 lg:p-10 rounded-[3.5rem] shadow-sm border border-slate-100 w-full relative">
                        <div className="flex flex-col lg:flex-row justify-between items-center mb-10 gap-6">
                            <h2 className="text-xl lg:text-2xl font-black text-slate-800 border-r-8 border-emerald-500 pr-4 italic">👥 إدارة الموظفين والرواتب</h2>
                            <button onClick={exportPDF} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] hover:bg-indigo-700 shadow-xl flex items-center gap-3 font-black text-lg transition-all active:scale-95 shadow-indigo-100">
                                <span className="text-2xl">📄</span> سحب تقرير الرواتب PDF
                            </button>
                        </div>
                        <form onSubmit={handleEmployeeSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-6 bg-slate-50 p-6 lg:p-8 rounded-[2.5rem] border border-slate-100 shadow-inner">
                            <input type="text" placeholder="اسم الموظف" value={empForm.name} onChange={e=>setEmpForm({...empForm, name: e.target.value})} className="p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm" required />
                            <input type="text" placeholder="المنصب" value={empForm.position} onChange={e=>setEmpForm({...empForm, position: e.target.value})} className="p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm" required />
                            <input type="number" placeholder="الراتب $" value={empForm.salary} onChange={e=>setEmpForm({...empForm, salary: e.target.value})} className="p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm" required />
                            <button className={`py-5 rounded-2xl font-black text-white shadow-xl transition-all ${editingEmployeeId ? 'bg-indigo-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                {editingEmployeeId ? 'تحديث البيانات 🔄' : 'حفظ الموظف 💾'}
                            </button>
                        </form>
                    </section>
                    
                    <div id="hr-table-container" className="bg-white p-4 lg:p-10 rounded-[4rem] shadow-2xl border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right border-separate border-spacing-y-4 min-w-[1000px]">
                                <thead className="text-slate-400 text-xs font-black uppercase tracking-widest">
                                    <tr><th>ID</th><th>الاسم والمنصب</th><th className="text-center">حضور اليوم</th><th className="text-center">الراتب (الشهري/الواصل/الباقي)</th><th>صرف دفعة</th><th>خيارات</th></tr>
                                </thead>
                                <tbody className="font-bold text-sm lg:text-base">
                                    {employees.map(emp => {
                                        const paid = emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0;
                                        const rem = emp.salary - paid;
                                        const pCount = emp.attendances?.filter(a => a.status === 'حاضر').length || 0;
                                        const aCount = emp.attendances?.filter(a => a.status === 'غائب').length || 0;
                                        return (
                                            <tr key={emp.id} className="bg-slate-50/50 hover:bg-white hover:shadow-lg transition-all rounded-3xl group">
                                                <td className="p-6 text-slate-300">#{emp.id}</td>
                                                <td className="p-6">
                                                    <p className="text-lg lg:text-xl text-slate-800">{emp.name}</p>
                                                    <p className="text-[11px] text-indigo-500 font-black">{emp.position}</p>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex gap-2 justify-center">
                                                        <button onClick={()=>handleAttendance(emp.id, 'حاضر')} className="bg-emerald-500 text-white px-3 py-2 rounded-xl text-[10px] flex flex-col items-center hover:scale-105 min-w-[70px]">حاضر <span>{pCount}</span></button>
                                                        <button onClick={()=>handleAttendance(emp.id, 'غائب')} className="bg-red-500 text-white px-3 py-2 rounded-xl text-[10px] flex flex-col items-center hover:scale-105 min-w-[70px]">غائب <span>{aCount}</span></button>
                                                    </div>
                                                </td>
                                                <td className="p-6 text-center border-x-2 border-white">
                                                    <div className="flex flex-col gap-1 items-center">
                                                        <span className="text-[9px] text-slate-400">الشهري: {emp.salary}$</span>
                                                        <div className="flex gap-4">
                                                            <span className="text-emerald-600 font-black">الواصل: {paid}$</span>
                                                            <span className={`font-black ${rem <= 0 ? 'text-red-500' : 'text-blue-600'}`}>الباقي: {rem}$</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <div className="flex gap-2 bg-white p-2 rounded-2xl border shadow-inner"><input type="number" placeholder="مبلغ" className="w-20 p-2 text-xs outline-none bg-transparent" onChange={(e)=>setSalaryPayAmount(e.target.value)} /><button onClick={()=>handleSalaryPayment(emp.id)} className="bg-[#111C44] text-white px-3 py-1 rounded-lg text-[10px] font-black shadow-md">دفع</button></div>
                                                </td>
                                                <td className="p-6"><div className="flex gap-4"><button onClick={()=>startEditEmployee(emp)} className="text-indigo-600 hover:scale-125 transition-all text-xl">✏️</button><button onClick={()=>deleteItem('employee', emp.id)} className="text-red-500 hover:scale-125 transition-all text-xl">🗑️</button></div></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {/* منطقة الطباعة المخفية */}
                    <div style={{ display: 'none' }}><div id="hr-print-area" className="p-10 text-right" dir="rtl"><h1 style={{textAlign:'center'}}>تقرير الرواتب والحضور</h1><table style={{width:'100%', borderCollapse:'collapse'}} border="1"><thead><tr><th>الاسم</th><th>الراتب الكلي</th><th>الواصل</th><th>الباقي</th><th>الحضور</th></tr></thead><tbody>{employees.map(e=>(<tr key={e.id}><td>{e.name}</td><td>{e.salary}$</td><td>{e.salaryPayments?.reduce((s,p)=>s+p.amount,0)}$</td><td>{e.salary - (e.salaryPayments?.reduce((s,p)=>s+p.amount,0)||0)}$</td><td>{e.attendances?.filter(a=>a.status==='حاضر').length} يوم</td></tr>))}</tbody></table></div></div>
                </div>
            )}

            {/* --- الموردين والفروع كما هي --- */}
            {tab === 'suppliers' && (
                <div className="space-y-12 animate-in fade-in duration-500 text-right"><section className="bg-white p-8 lg:p-10 rounded-[3rem] shadow-sm border border-slate-100 w-full"><h2 className="text-xl font-black mb-8 text-slate-800 border-r-8 border-[#111C44] pr-4 italic">🤝 إضافة مورد جديد</h2><form onSubmit={async (e) => { e.preventDefault(); await fetch('http://localhost:3000/api/suppliers', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(supForm)}); setSupForm({name:'', phone:'', address:''}); fetchData(); }} className="grid grid-cols-1 md:grid-cols-3 gap-6"><input type="text" placeholder="اسم المورد" value={supForm.name} onChange={e=>setSupForm({...supForm, name: e.target.value})} className="p-5 rounded-2xl bg-slate-50 font-bold shadow-inner border-none outline-none" required /><input type="text" placeholder="رقم الهاتف" value={supForm.phone} onChange={e=>setSupForm({...supForm, phone: e.target.value})} className="p-5 rounded-2xl bg-slate-50 font-bold shadow-inner border-none outline-none" /><input type="text" placeholder="العنوان" value={supForm.address} onChange={e=>setSupForm({...supForm, address: e.target.value})} className="p-5 rounded-2xl bg-slate-50 font-bold shadow-inner border-none outline-none" /><button className="md:col-span-3 bg-[#111C44] text-white font-black py-5 rounded-2xl text-lg shadow-xl">حفظ البيانات</button></form></section><div className="grid grid-cols-1 md:grid-cols-3 gap-8">{suppliers.map(s => { const debt = s.materials?.reduce((sum, m) => sum + m.price, 0) || 0; return (<div key={s.id} className="bg-white p-10 rounded-[3rem] border border-slate-100 group relative shadow-sm text-right"><button onClick={() => deleteItem('suppliers', s.id)} className="absolute top-8 left-8 text-red-400 opacity-0 group-hover:opacity-100">🗑️</button><div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-3xl mb-6 shadow-inner">🤝</div><h4 className="text-2xl font-black text-slate-800 mb-2 truncate px-2">{s.name}</h4><p className="text-slate-400 font-bold italic mb-6 text-sm">📞 {s.phone || 'بدون هاتف'}</p><div className="pt-6 border-t border-slate-50"><p className="text-[10px] text-red-400 font-black uppercase">إجمالي الديون</p><p className="text-2xl lg:text-3xl font-black text-red-600">{debt.toLocaleString()} $</p></div></div>)})}</div></div>
            )}
            {tab === 'branches' && (
                <div className="space-y-12 animate-in fade-in duration-700 text-right"><section className="bg-white p-8 lg:p-10 rounded-[3rem] shadow-sm border border-slate-100 w-full"><h2 className="text-xl font-black mb-8 text-slate-800 border-r-8 border-slate-900 pr-4 italic">🏢 تأسيس مكتب أو فرع جديد</h2><form onSubmit={async (e) => { e.preventDefault(); await fetch('http://localhost:3000/api/branch', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...branchForm, companyId: 1})}); setBranchForm({name:'', location:''}); fetchData(); }} className="flex flex-col sm:flex-row gap-6"><input type="text" placeholder="اسم الفرع" value={branchForm.name} onChange={e=>setBranchForm({...branchForm, name: e.target.value})} className="flex-1 p-5 rounded-2xl bg-slate-50 border-none font-bold" required /><input type="text" placeholder="الموقع" value={branchForm.location} onChange={e=>setBranchForm({...branchForm, location: e.target.value})} className="flex-1 p-5 rounded-2xl bg-slate-50 border-none font-bold" /><button className="bg-slate-900 text-white font-black px-12 py-5 rounded-2xl shadow-xl">إضافة الفرع</button></form></section><div className="grid grid-cols-1 md:grid-cols-3 gap-8">{branches.map(b => (<div key={b.id} className="bg-white p-10 rounded-[3rem] border flex items-center justify-between group shadow-sm text-right"><div className="flex items-center gap-6"><div className="w-16 h-16 bg-[#111C44] text-white rounded-3xl flex items-center justify-center text-3xl shrink-0">🏢</div><div className="min-w-0"><h4 className="text-xl font-black text-slate-800 truncate">{b.name}</h4><p className="text-slate-400 font-bold mt-1 text-sm italic">{b.location}</p></div></div><button onClick={() => deleteItem('branch', b.id)} className="text-red-400 opacity-0 group-hover:opacity-100 font-black hover:text-red-600 underline">حذف</button></div>))}</div></div>
            )}
        </div>
      </main>

      {/* --- MODAL (المشاريع والمرفقات) - محسن للموبايل --- */}
      {selectedProject && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-2 sm:p-6 z-50 overflow-y-auto">
            <div className="bg-white w-full max-w-7xl rounded-[2rem] lg:rounded-[4rem] shadow-2xl overflow-hidden my-auto animate-in zoom-in duration-300 border border-white/20">
                <header className="bg-[#111C44] p-6 lg:p-12 text-white flex justify-between items-center relative overflow-hidden text-right">
                    <div className="min-w-0 flex-1 z-10"><div className="flex flex-wrap items-center gap-3 mb-4"><span className={`text-[10px] lg:text-sm font-black px-4 py-2 rounded-xl border-2 uppercase tracking-widest transition-all ${getStatusStyle(selectedProject.status)}`}>{selectedProject.status}</span> <button onClick={exportProjectReportPDF} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] lg:text-xs font-black shadow-lg flex items-center gap-2 border border-white/20 shrink-0">📄 تقرير PDF</button></div><h2 className="text-2xl lg:text-4xl font-black leading-tight block w-full">{selectedProject.name}</h2><p className="text-indigo-100 text-lg lg:text-2xl font-bold mt-2 opacity-90 italic block w-full truncate underline decoration-indigo-400 underline-offset-4">العميل: {selectedProject.client}</p></div>
                    <button onClick={() => setSelectedProject(null)} className="w-12 h-12 lg:w-16 lg:h-16 bg-white/10 hover:bg-red-500 rounded-full flex items-center justify-center text-2xl transition-all mr-6 z-10 shadow-lg shrink-0">✕</button>
                </header>
                <div className="grid grid-cols-1 lg:grid-cols-4 h-full"><div className="bg-slate-50 p-6 lg:p-10 border-l border-slate-200 space-y-8 lg:h-[650px] overflow-y-auto shadow-inner text-right">{(() => { const received = selectedProject.payments?.reduce((s, p) => s + p.amount, 0) || 0; const spent = (selectedProject.expenses?.reduce((s, p) => s + p.amount, 0) || 0) + (selectedProject.materials?.reduce((s, p) => s + p.price, 0) || 0); const currentLiquidity = received - spent; return (<div className={`p-6 lg:p-8 rounded-[3rem] border-4 text-center shadow-2xl transition-all ${currentLiquidity <= 0 ? 'bg-red-50 border-red-500 animate-pulse' : 'bg-emerald-50 border-emerald-500'}`}><p className="text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">السيولة المتاحة الآن</p><h3 className={`text-2xl lg:text-4xl font-black ${currentLiquidity <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{currentLiquidity.toLocaleString()} $</h3><p className="text-[10px] mt-3 font-black italic">{currentLiquidity <= 0 ? '⚠️ توقف! صرف من الجيب' : '✅ العمل مستمر'}</p></div>); })()}<div className="space-y-4"><div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest">ميزانية العقد الكلية</p><p className="text-xl lg:text-2xl font-black text-slate-800">{selectedProject.budget.toLocaleString()} $</p></div><div className="bg-white p-5 rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest">المتبقي بذمة العميل</p><p className="text-xl lg:text-2xl font-black text-amber-600">{(selectedProject.budget - (selectedProject.payments?.reduce((s,p)=>s+p.amount,0)||0)).toLocaleString()} $</p></div></div><div className="space-y-3"><p className="text-xs font-black text-slate-500 px-4 uppercase tracking-widest text-center border-b-2 pb-2">تحديث حالة المشروع</p>{['قيد التنفيذ', 'مكتمل', 'متوقف', 'ملغي'].map(st => (<button key={st} onClick={()=>updateProjectStatus(st)} className={`w-full p-4 lg:p-5 rounded-2xl text-xs font-black transition-all border-2 flex items-center justify-between ${selectedProject.status===st ? 'bg-[#111C44] text-white border-[#111C44] shadow-xl scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200'}`}><span>{st}</span><span>{st === 'قيد التنفيذ' ? '🔵' : st === 'مكتمل' ? '🟢' : st === 'متوقف' ? '🟡' : '🔴'}</span></button>))}</div></div>
                    <div className="lg:col-span-3 p-4 lg:p-12 lg:h-[650px] overflow-y-auto min-w-0 text-right"><div className="flex flex-wrap gap-2 lg:gap-4 mb-8 bg-slate-100/50 p-2 rounded-2xl w-full sm:w-fit border border-slate-200 shadow-inner">{[{id:'payments',l:'💰 الأقساط'}, {id:'expenses',l:'💸 المصاريف'}, {id:'materials',l:'🧱 المواد'}, {id:'attachments',l:'📁 المرفقات'}].map(t=>(<button key={t.id} onClick={()=>setModalTab(t.id)} className={`py-3 px-6 lg:py-4 lg:px-10 rounded-xl font-black text-xs lg:text-sm transition-all shadow-sm ${modalTab===t.id ? 'bg-[#111C44] text-white scale-105 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>{t.l}</button>))}</div>
                        {modalTab === 'payments' && ( <div className="space-y-8 animate-in fade-in duration-300"><form onSubmit={(e)=>{e.preventDefault(); handleAddOrUpdateSubItem('payment', {amount: payAmount}, ()=>setPayAmount(''))}} className="flex flex-col sm:flex-row gap-4 bg-emerald-50 p-4 rounded-3xl border border-emerald-100 shadow-sm"><input type="number" placeholder="مبلغ القسط..." value={payAmount} onChange={e=>setPayAmount(e.target.value)} className="flex-1 p-5 rounded-[2rem] bg-white border-none outline-none font-black text-xl text-emerald-700 shadow-inner" required /><button className="bg-emerald-600 text-white px-10 py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-emerald-700">تثبيت +</button></form><div className="border-2 border-slate-50 rounded-[3rem] overflow-hidden bg-white shadow-sm"><table className="w-full text-right"><thead className="bg-slate-50 text-xs font-black uppercase border-b-2"><tr><th className="p-5">المبلغ</th><th className="p-5 text-center">التاريخ والوقت</th></tr></thead><tbody className="font-black text-lg">{selectedProject.payments?.map(p => (<tr key={p.id} className="border-b border-slate-50 hover:bg-emerald-50/20 italic transition-all"><td className="p-5 text-emerald-600">+{p.amount.toLocaleString()} $</td><td className="p-5 text-center text-slate-400 font-bold text-xs">{new Date(p.date).toLocaleString('ar-EG')}</td></tr>))}</tbody></table></div></div> )}
                        {modalTab === 'expenses' && ( <div className="space-y-8 animate-in fade-in duration-300"><form onSubmit={(e)=>{e.preventDefault(); handleAddOrUpdateSubItem('expense', expForm, ()=>setExpForm({description:'', amount:''}))}} className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-red-50 p-4 rounded-3xl border border-red-100"><input type="text" placeholder="ماذا صرفت؟" value={expForm.description} onChange={e=>setExpForm({...expForm, description:e.target.value})} className="sm:col-span-2 p-5 rounded-[2rem] bg-white border-none outline-none font-bold text-lg" required /><input type="number" placeholder="المبلغ" value={expForm.amount} onChange={e=>setExpForm({...expForm, amount:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-black text-xl text-red-700" required /><button className="sm:col-span-3 bg-red-500 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-red-600">تثبيت 💸</button></form><div className="border-2 border-slate-50 rounded-[3rem] overflow-hidden bg-white shadow-sm"><table className="w-full text-right"><thead className="bg-slate-50 text-xs font-black uppercase border-b-2"><tr><th className="p-5">البيان</th><th className="p-5 text-left">المبلغ</th></tr></thead><tbody className="font-black text-lg">{selectedProject.expenses?.map(ex => (<tr key={ex.id} className="border-b hover:bg-red-50/20 transition-all"><td className="p-5 text-slate-700 italic">{ex.description}</td><td className="p-5 text-left text-red-500">-{ex.amount.toLocaleString()} $</td></tr>))}</tbody></table></div></div> )}
                        {modalTab === 'materials' && ( <div className="space-y-8 animate-in fade-in duration-300"><form onSubmit={(e)=>{ e.preventDefault(); handleAddOrUpdateSubItem('material', matForm, ()=>setMatForm({name:'', quantity:'', unit:'كيس', price:'', supplierId:''}), !!editingMaterialId, editingMaterialId) }} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 bg-amber-50 p-6 lg:p-8 rounded-[3rem] border border-amber-200 shadow-lg"><input type="text" placeholder="اسم المادة" value={matForm.name} onChange={e=>setMatForm({...matForm, name:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-bold shadow-sm" required /><input type="number" placeholder="الكمية" value={matForm.quantity} onChange={e=>setMatForm({...matForm, quantity:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-bold shadow-sm" required /><select value={matForm.unit} onChange={e=>setMatForm({...matForm, unit:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none font-black text-amber-600 shadow-sm"><option>كيس</option><option>طن</option><option>متر مكعب</option><option>لوري</option><option>قطعة</option></select><input type="number" placeholder="التكلفة" value={matForm.price} onChange={e=>setMatForm({...matForm, price:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-black text-2xl text-amber-800 shadow-sm" required /><select value={matForm.supplierId} onChange={e=>setMatForm({...matForm, supplierId: e.target.value})} className="sm:col-span-2 xl:col-span-4 p-5 rounded-[2rem] bg-white font-black border-2 border-amber-300 text-[#111C44] shadow-sm"><option value="">-- اختر المورد --</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><div className="sm:col-span-2 xl:col-span-4 flex gap-4"><button className={`flex-1 py-5 rounded-[2rem] font-black text-lg shadow-xl transition-all ${editingMaterialId ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>{editingMaterialId ? 'تحديث المادة' : 'إضافة مواد 🧱'}</button>{editingMaterialId && <button type="button" onClick={()=>{setEditingMaterialId(null); setMatForm({name:'', quantity:'', unit:'كيس', price:'', supplierId:''})}} className="bg-slate-400 text-white px-8 rounded-[2rem] font-black">إلغاء</button>}</div></form><div className="border-2 border-slate-50 rounded-[3rem] overflow-hidden bg-white shadow-sm"><table className="w-full text-right min-w-[700px]"><thead className="bg-slate-50 text-xs font-black uppercase border-b-2"><tr><th className="p-5">المادة</th><th className="p-5">المورد</th><th className="p-5">الكمية</th><th className="p-5 text-left">التكلفة</th><th className="p-5 text-center">خيارات</th></tr></thead><tbody className="font-black text-lg">{selectedProject.materials?.map(m => (<tr key={m.id} className="border-b hover:bg-amber-50/20 transition-all italic"><td className="p-5 text-slate-800">{m.name}</td><td className="p-5 text-indigo-600 text-sm italic">{m.supplier?.name || 'شراء مباشر'}</td><td className="p-5 text-slate-400 text-sm">{m.quantity} {m.unit}</td><td className="p-5 text-left text-amber-700">-{m.price.toLocaleString()} $</td><td className="p-5 text-center"><div className="flex justify-center gap-3"><button onClick={()=>startEditMaterial(m)} className="p-2 text-indigo-600 hover:scale-125 transition-transform">✏️</button><button onClick={()=>deleteItem('material', m.id)} className="p-2 text-red-500 hover:scale-125 transition-transform">🗑️</button></div></td></tr>))}</tbody></table></div></div> )}
                        {modalTab === 'attachments' && ( <div className="space-y-8 animate-in fade-in duration-300 text-right"><form onSubmit={handleFileUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-indigo-50 p-6 lg:p-8 rounded-[3rem] border border-indigo-100 shadow-inner"><div className="flex flex-col gap-2"><label className="text-[10px] font-black text-indigo-400 pr-2 uppercase">اسم المرفق</label><input type="text" placeholder="مثلاً: صورة الواجهة" value={attachmentName} onChange={e=>setAttachmentName(e.target.value)} className="p-5 rounded-2xl bg-white outline-none font-bold" required /></div><div className="flex flex-col gap-2"><label className="text-[10px] font-black text-indigo-400 pr-2 uppercase">اختر الملف</label><input id="fileInput" type="file" onChange={e=>setSelectedFile(e.target.files[0])} className="p-4 rounded-2xl bg-white text-xs font-black shadow-sm" required /></div><button disabled={uploading} className="sm:col-span-2 bg-[#111C44] text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 transition-all">{uploading ? 'جاري الرفع...' : 'رفع المرفق للمشروع 📁'}</button></form><div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">{selectedProject.attachments?.map(file => (<div key={file.id} className="bg-white p-5 rounded-[2.5rem] border-2 shadow-sm relative group overflow-hidden transition-all hover:shadow-xl"><div className="w-full h-32 bg-slate-100 rounded-2xl mb-4 flex items-center justify-center text-4xl overflow-hidden italic shadow-inner">{file.fileType?.includes('image') ? <img src={file.url} className="w-full h-full object-cover" alt="" /> : '📄'}</div><h5 className="font-black text-slate-800 text-sm truncate px-2">{file.name}</h5><div className="flex gap-2 mt-4 px-2"><a href={file.url} target="_blank" rel="noreferrer" className="flex-1 bg-indigo-50 text-indigo-600 py-3 rounded-xl text-center text-xs font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm">عرض</a><button onClick={()=>deleteItem('attachment', file.id)} className="w-12 h-12 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all font-black text-xs shadow-sm">🗑️</button></div></div>))}</div></div> )}
                    </div>
                </div>
                {/* منطقة التقرير المالي المخفية للطباعة */}
                <div style={{ position: 'absolute', left: '-9999px', top: 0 }}><div id="project-report-pdf" style={{ width: '800px', padding: '40px', background: 'white' }} dir="rtl"><div style={{ textAlign: 'center', borderBottom: '4px double #111C44', paddingBottom: '20px', marginBottom: '30px' }}><h1 style={{ color: '#111C44' }}>كشف حساب مالي رسمي</h1><p style={{ fontSize: '18px' }}>المشروع: <b>${selectedProject.name}</b> | العميل: <b>${selectedProject.client}</b></p></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '40px', textAlign: 'center' }}><div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '15px' }}><p style={{ fontSize: '12px', color: '#16a34a' }}>إجمالي الواصل</p><h2>${selectedProject.payments?.reduce((s,p)=>s+p.amount,0).toLocaleString()} $</h2></div><div style={{ background: '#fef2f2', padding: '20px', borderRadius: '15px' }}><p style={{ fontSize: '12px', color: '#dc2626' }}>إجمالي المصروفات</p><h2>${( (selectedProject.expenses?.reduce((s,p)=>s+p.amount,0)||0) + (selectedProject.materials?.reduce((s,p)=>s+p.price,0)||0) ).toLocaleString()} $</h2></div><div style={{ background: '#111C44', padding: '20px', borderRadius: '15px', color: 'white' }}><p style={{ fontSize: '12px' }}>صافي الربح</p><h2>${((selectedProject.payments?.reduce((s,p)=>s+p.amount,0)||0) - ((selectedProject.expenses?.reduce((s,p)=>s+p.amount,0)||0) + (selectedProject.materials?.reduce((s,p)=>s+p.price,0)||0))).toLocaleString()} $</h2></div></div><h3>سجل الأقساط</h3><table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }} border="1"><thead><tr style={{ background: '#eee' }}><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>{selectedProject.payments?.map(p => (<tr key={p.id}><td>{p.amount} $</td><td>{new Date(p.date).toLocaleDateString('ar-EG')}</td></tr>))}</tbody></table><h3>المصروفات والمواد</h3><table style={{ width: '100%', borderCollapse: 'collapse' }} border="1"><thead><tr style={{ background: '#eee' }}><th>البيان</th><th>التكلفة</th></tr></thead><tbody>{selectedProject.expenses?.map(ex => (<tr key={ex.id}><td>{ex.description}</td><td>{ex.amount} $</td></tr>))}{selectedProject.materials?.map(m => (<tr key={m.id}><td>{m.name} ({m.quantity} {m.unit})</td><td>{m.price} $</td></tr>))}</tbody></table><div style={{ marginTop: '50px', textAlign: 'left' }}><p>توقيع المدير العام: __________________</p></div></div></div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App