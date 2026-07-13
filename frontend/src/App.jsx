import { useState, useEffect } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, KeyRound, Building2, UserRound, Sparkles, ShieldCheck, Rocket, Key, Users, RefreshCcw, Search } from 'lucide-react'
import { apiFetch, API_BASE } from './api'

// قوة كلمة السر عند إنشاء أي حساب جديد: 8 أحرف على الأقل + حرف + رقم +
// رمز. نفس الشرط يتحقق منه السيرفر أيضاً (هذا فقط للتغذية الراجعة الحية).
const checkPasswordStrength = (pw) => {
    const hasMinLen = pw.length >= 8;
    const hasLetter = /[a-zA-Z]/.test(pw);
    const hasDigit = /[0-9]/.test(pw);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pw);
    return { valid: hasMinLen && hasLetter && hasDigit && hasSymbol, hasMinLen, hasLetter, hasDigit, hasSymbol };
};

// رسالة توضيحية حية لقوة كلمة السر: رمادية قبل الكتابة، حمراء + سمايل
// حزين وقت ما تكون ناقصة الشروط، وخضراء + سمايل مبتسم لما تكتمل الشروط.
function PasswordStrengthHint({ password, dark }) {
    const s = checkPasswordStrength(password);
    const untouched = password.length === 0;
    const colorClass = untouched ? (dark ? 'text-slate-500' : 'text-slate-400') : s.valid ? 'text-emerald-500' : 'text-red-400';
    const emoji = untouched ? '🔒' : s.valid ? '😊' : '😢';
    return (
        <p className={`text-[11px] sm:text-xs font-bold flex items-center gap-1.5 leading-relaxed ${colorClass}`}>
            <span className="text-sm shrink-0">{emoji}</span>
            يجب أن تتكوّن كلمة السر من 8 أحرف على الأقل وتحتوي على أرقام وحروف ورموز
        </p>
    );
}

// زر تسجيل الخروج بحركة "باب يفتح": الباب يدور على مفصلته مع ومضة ضوء
// تتوسّع من خلفه، وبعدها بأقل من ثانية ينفذ الخروج الفعلي.
function LogoutDoorButton({ isLoggingOut, onClick, variant = 'icon' }) {
    const doorIcon = (
        <span className="relative inline-flex items-center justify-center w-6 h-6" style={{ perspective: 60 }}>
            {isLoggingOut && (
                <motion.span
                    initial={{ scale: 0, opacity: 1 }}
                    animate={{ scale: 6, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-amber-300"
                />
            )}
            <motion.span
                animate={isLoggingOut ? { rotateY: -110 } : { rotateY: 0 }}
                transition={{ duration: 0.45, ease: 'easeInOut' }}
                style={{ display: 'inline-block', transformStyle: 'preserve-3d' }}
                className="text-xl relative"
            >
                🚪
            </motion.span>
        </span>
    );

    if (variant === 'full') {
        return (
            <button onClick={onClick} disabled={isLoggingOut} className="w-full p-4 bg-red-500/10 text-red-500 rounded-2xl font-black hover:bg-red-500 hover:text-white transition-all text-center flex items-center justify-center gap-3 disabled:opacity-70 overflow-hidden">
                {doorIcon}
                <span>{isLoggingOut ? 'جاري الخروج...' : 'تسجيل خروج'}</span>
            </button>
        );
    }
    return (
        <button onClick={onClick} disabled={isLoggingOut} title="تسجيل خروج" className="w-10 h-10 flex items-center justify-center bg-red-500/15 text-red-400 rounded-xl active:scale-90 transition-all disabled:opacity-70 overflow-hidden">
            {doorIcon}
        </button>
    );
}

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [officeExpenses, setOfficeExpenses] = useState([]);
  const [offExpForm, setOffExpForm] = useState({ description: '', amount: '' });
  // ==========================================
  // --- حالات نظام الأمان (AUTHENTICATION) ---
  // ==========================================
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')) || null);
  const [managerName, setManagerName] = useState(localStorage.getItem('managerName') || '');
  const [isEditingManagerName, setIsEditingManagerName] = useState(false);
  const [managerNameInput, setManagerNameInput] = useState('');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', companyName: '', setupKey: '', recoveryKey: '' });
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  // عدّاد تنازلي لقفل المحاولات (٣ محاولات فاشلة = قفل ٣٠ ثانية، مفروض من
  // السيرفر) - يتحدّث هنا كل ثانية بالواجهة بس، القفل الحقيقي بالباك إند.
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const t = setInterval(() => {
        setLockoutSeconds(s => {
            if (s <= 1) { setAuthError(''); return 0; }
            return s - 1;
        });
    }, 1000);
    return () => clearInterval(t);
  }, [lockoutSeconds > 0]);
  const [showPassword, setShowPassword] = useState(false);
  // شاشة "تأسيس شركة جديدة" (بوابة المطور) معزولة تماماً عن شاشة الدخول
  // العادية - ما تظهر إلا لو الرابط فيه ?newcompany=1، وهذا رابط يعرفه
  // المبرمج بس. حتى مع معرفة الرابط، السيرفر برضو يرفض التسجيل بدون
  // مفتاح إعداد صحيح.
  const isSetupMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('newcompany');
  // الوجه التفاعلي بشاشة الدخول: يتابع محاولات المستخدم بصرياً -
  // idle (عادي) / peeking (يغطي عيونه وقت كتابة كلمة السر) / angry (خطأ) /
  // furious (بعد ٣ أخطاء + قفل مؤقت) / happy (نجح الدخول).
  const [faceState, setFaceState] = useState('idle');
  // خلفية شاشة الدخول التفاعلية: كتل ملوّنة تتحرك بنعومة وراء حركة الماوس
  // (parallax) - نفس القيم مستخدمة بس بشاشة الدخول، معلنة هنا لأن hooks
  // لازم تُستدعى بنفس الترتيب بكل مرة (مو داخل شرط if(!token)).
  const bgMouseX = useMotionValue(0);
  const bgMouseY = useMotionValue(0);
  const bgSpringX = useSpring(bgMouseX, { stiffness: 40, damping: 20 });
  const bgSpringY = useSpring(bgMouseY, { stiffness: 40, damping: 20 });
  // شاشة "نسيت كلمة السر" - تظهر بنفس بطاقة تسجيل الدخول العادية (تبديل
  // داخلي)، تتطلب مفتاح استرجاع الشركة بدل كلمة السر القديمة.
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotForm, setForgotForm] = useState({ email: '', recoveryKey: '', newPassword: '', confirmPassword: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  // وضعا بوابة المطوّر: تأسيس شركة جديدة، أو عرض دليل كل الشركات
  // والمستخدمين (حتى يقدر المبرمج يدور على إيميل نسيه أحد الزبائن).
  const [devPortalView, setDevPortalView] = useState('create');
  const [devDirectory, setDevDirectory] = useState(null);
  const [devDirectoryLoading, setDevDirectoryLoading] = useState(false);
  const [devDirectoryError, setDevDirectoryError] = useState('');

  // ==========================================
  // --- الحالات العامة للنظام (CORE DATA) ---
  // ==========================================
  const [tab, setTab] = useState('dashboard'); 
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [suppliers, setSuppliers] = useState([]); 
  const [notifications, setNotifications] = useState([]); // [جديد]
  const [showNotifs, setShowNotifs] = useState(false);

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

const [showPinModal, setShowPinModal] = useState(false);
const [pinInput, setPinInput] = useState('');
const [targetTabAfterPin, setTargetTabAfterPin] = useState(null);
const [pinChangeForm, setPinChangeForm] = useState({ current: '', next: '', confirm: '' });
const [recoveryKeyChangeForm, setRecoveryKeyChangeForm] = useState({ current: '', next: '', confirm: '' });
const [companyUsers, setCompanyUsers] = useState([]);
const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '' });
const [companyInfo, setCompanyInfo] = useState(null);
  // فحص حي: هل المستخدم الحالي هو مالك الشركة؟ نعتمد على قائمة companyUsers
  // (تُجلب من السيرفر) بدل الاعتماد فقط على بيانات user المخزّنة بالمتصفح،
  // حتى الجلسات القديمة (قبل ميزة الصلاحيات) تنعكس صح بدون تسجيل خروج.
  const isOwnerUser = companyUsers.find(u => u.id === user?.id)?.isOwner ?? user?.isOwner ?? false;
  // ==========================================
  // --- وظائف جلب البيانات (FETCHING) ---
  // ==========================================
  useEffect(() => {
    if (token) {
        fetchData();
        fetchNotifications();
    }
  }, [token]);

  // جلب قائمة مستخدمي الشركة ومعلوماتها فقط لما نفتح تبويب الإعدادات (ما نحتاجها بأي مكان ثاني)
  useEffect(() => {
    if (token && tab === 'settings') {
        fetchCompanyUsers();
        apiFetch('/api/company').then(res => res.json()).then(setCompanyInfo).catch(() => {});
    }
  }, [token, tab]);

  const fetchData = async () => {
  try {
    const results = await Promise.allSettled([
      apiFetch(`/api/projects`).then(res => res.json()),
      apiFetch(`/api/employees`).then(res => res.json()),
      apiFetch(`/api/branches`).then(res => res.json()),
      apiFetch(`/api/suppliers`).then(res => res.json()),
      apiFetch(`/api/office-expenses`).then(res => res.json())
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

    // قائمة المشاريع أصبحت "خفيفة" (مجاميع فقط)، فتفاصيل المشروع المفتوح
    // حالياً بالنافذة المنبثقة (كل سجل دفعة/مصروف/مادة/مرفق) تُحدَّث من
    // مسارها الخاص لضمان بقاء كل التفاصيل كاملة بعد أي عملية إضافة/حذف.
    if (selectedProject) {
      await openProjectDetails(selectedProject.id);
    }
  } catch (err) {
    console.error("خطأ في تحديث البيانات:", err);
  }
};

  const openProjectDetails = async (projectId) => {
    try {
        const res = await apiFetch(`/api/project/${projectId}`);
        if (!res.ok) throw new Error('project not found');
        const full = await res.json();
        setSelectedProject(full);
    } catch (err) {
        alert('❌ تعذر تحميل تفاصيل المشروع');
    }
};
  const fetchNotifications = async () => {
    try {
        const res = await apiFetch(`/api/notifications`);
        const data = await res.json();
        setNotifications(data);
    } catch (err) { console.error("Notif error"); }
};

  // ==========================================
  // --- وظائف الحماية (SECURITY) ---
  // ==========================================
  // ملاحظة مهمة: رمز المدير يُتحقق منه ويُخزَّن على السيرفر (مشفّراً
  // بـ bcrypt ضمن جدول الشركة) بدل تخزينه محلياً بالمتصفح، حتى يكون نفس
  // الرمز شغّالاً من أي جهاز (موبايل، لابتوب، تابلت) فور تغييره من أي منها،
  // بدل ما يبقى محصور بالجهاز اللي غيّرناه منه فقط.
  const checkAdminPin = (targetTab) => {
    if (isAdminUnlocked) {
        setTab(targetTab);
    } else {
        setTargetTabAfterPin(targetTab); // حفظ التبويب الذي نقرنا عليه
        setShowPinModal(true); // إظهار نافذة إدخال الرمز
    }
};
const handlePinSubmit = async (e) => {
    e.preventDefault();
    try {
        const res = await apiFetch(`/api/settings/verify-pin`, {
            method: 'POST',
            body: JSON.stringify({ pin: pinInput }),
        });
        const data = await res.json();
        if (data.valid) {
            setIsAdminUnlocked(true); // فتح القفل
            setTab(targetTabAfterPin); // الانتقال للقسم المطلوب
            setShowPinModal(false); // إغلاق نافذة الرمز
            setPinInput(''); // تصفير الحقل
        } else {
            alert("❌ الرمز الذي أدخلته خطأ!");
            setPinInput('');
        }
    } catch (err) {
        alert("❌ تعذر التحقق من الرمز، تأكد من الاتصال بالسيرفر");
    }
};
const handleChangePin = async (e) => {
    e.preventDefault();
    if (pinChangeForm.next !== pinChangeForm.confirm) {
        return alert('⚠️ الرمز الجديد وتأكيده غير متطابقين');
    }
    try {
        const res = await apiFetch(`/api/settings/change-pin`, {
            method: 'POST',
            body: JSON.stringify({ currentPin: pinChangeForm.current, newPin: pinChangeForm.next }),
        });
        const data = await res.json();
        if (res.ok) {
            setPinChangeForm({ current: '', next: '', confirm: '' });
            alert('✅ تم تغيير رمز دخول المدير بنجاح، وسيعمل فوراً من أي جهاز');
        } else {
            alert(`❌ ${data.error || 'تعذر تغيير الرمز'}`);
        }
    } catch (err) {
        alert('❌ تعذر الاتصال بالسيرفر');
    }
};
const handleChangeRecoveryKey = async (e) => {
    e.preventDefault();
    if (recoveryKeyChangeForm.next !== recoveryKeyChangeForm.confirm) {
        return alert('⚠️ المفتاح الجديد وتأكيده غير متطابقين');
    }
    try {
        const res = await apiFetch(`/api/settings/change-recovery-key`, {
            method: 'POST',
            body: JSON.stringify({ currentRecoveryKey: recoveryKeyChangeForm.current, newRecoveryKey: recoveryKeyChangeForm.next }),
        });
        const data = await res.json();
        if (res.ok) {
            setRecoveryKeyChangeForm({ current: '', next: '', confirm: '' });
            alert('✅ تم تغيير مفتاح الاسترجاع بنجاح');
        } else {
            alert(`❌ ${data.error || 'تعذر تغيير المفتاح'}`);
        }
    } catch (err) {
        alert('❌ تعذر الاتصال بالسيرفر');
    }
};

  // ==========================================
  // --- [جديد] إدارة مستخدمي الشركة (يديرها مدير الشركة نفسه) ---
  // ==========================================
  const fetchCompanyUsers = async () => {
    try {
        const res = await apiFetch('/api/company/users');
        const data = await res.json();
        setCompanyUsers(data);
    } catch (err) { /* تجاهل بصمت، القائمة تبقى فاضية */ }
};
  const handleAddCompanyUser = async (e) => {
    e.preventDefault();
    if (!checkPasswordStrength(newUserForm.password).valid) return; // الزر أصلاً معطّل بس نتأكد
    try {
        const res = await apiFetch('/api/company/users', {
            method: 'POST',
            body: JSON.stringify(newUserForm),
        });
        const data = await res.json();
        if (res.ok) {
            setNewUserForm({ name: '', email: '', password: '' });
            fetchCompanyUsers();
            alert('✅ تمت إضافة المستخدم بنجاح، يقدر يدخل النظام الآن ببريده وكلمة السر');
        } else {
            alert(`❌ ${data.error || 'تعذرت الإضافة'}`);
        }
    } catch (err) { alert('❌ تعذر الاتصال بالسيرفر'); }
};
  const handleDeleteCompanyUser = async (id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم؟ لن يقدر يدخل النظام بعدها')) return;
    try {
        const res = await apiFetch(`/api/company/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            fetchCompanyUsers();
        } else {
            alert(`❌ ${data.error || 'تعذر الحذف'}`);
        }
    } catch (err) { alert('❌ تعذر الاتصال بالسيرفر'); }
};
  const handleUpdateUserPermission = async (id, key, value) => {
    // تحديث متفائل فوري بالواجهة، ثم مزامنة مع السيرفر (ويرجع القديم لو فشل)
    setCompanyUsers(prev => prev.map(u => u.id === id ? { ...u, [key]: value } : u));
    try {
        const res = await apiFetch(`/api/company/users/${id}/permissions`, {
            method: 'PATCH',
            body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) {
            const data = await res.json();
            alert(`❌ ${data.error || 'تعذر تحديث الصلاحية'}`);
            fetchCompanyUsers();
        }
    } catch (err) {
        alert('❌ تعذر الاتصال بالسيرفر');
        fetchCompanyUsers();
    }
};

  // ==========================================
  // --- العمليات البرمجية (OPERATIONS) ---
  // ==========================================
  const handleAuth = async (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return; // قفل مؤقت بعد ٣ محاولات فاشلة، ينتظر العدّاد
    if (isSetupMode && !checkPasswordStrength(authForm.password).valid) return; // كلمة سر ضعيفة، الزر أصلاً معطّل بس نتأكد
    // بوابة المطور (?newcompany) دائماً تنشئ شركة جديدة، وشاشة الدخول
    // العادية دائماً تسجّل دخول فقط - ما أكو تبديل بينهن بعد الآن.
    const url = isSetupMode ? 'register' : 'login';
    setAuthLoading(true);
    setAuthError('');
    try {
        // ملاحظة: نستخدم fetch العادية هنا (مو apiFetch)، لأن apiFetch تسجّل
        // خروج تلقائي عند 401 - وهذا سلوك خاطئ بالضبط بحالة "كلمة سر غلط"
        // بشاشة الدخول، اللي المفروض تعرض تنبيه بس وتخلي المستخدم يعيد المحاولة.
        const res = await fetch(`${API_BASE}/api/auth/${url}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(authForm),
        });
        const data = await res.json();
        if (res.ok) {
            // كل من الدخول والتسجيل يرجعان توكن الآن (التسجيل ينشئ شركة جديدة
            // ويسجّل الدخول تلقائياً، ما يحتاج خطوة دخول منفصلة بعده)
            if (!isSetupMode) {
                setFaceState('happy');
                await new Promise(r => setTimeout(r, 650)); // نعطي فرصة يبين الوجه الضاحك قبل الانتقال للوحة التحكم
            }
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setToken(data.token); setUser(data.user); setIsAdminUnlocked(false); setIsLoggingOut(false);
        } else if (res.status === 429) {
            setLockoutSeconds(data.retryAfter || 30);
            setAuthError(data.error || 'محاولات كثيرة، حاول لاحقاً');
            if (!isSetupMode) setFaceState('furious');
        } else {
            setAuthError(data.error || 'حدث خطأ غير متوقع');
            if (!isSetupMode) setFaceState('angry');
        }
    } catch (err) {
        setAuthError('تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت');
        if (!isSetupMode) setFaceState('angry');
    }
    finally { setAuthLoading(false); }
};
const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    if (!checkPasswordStrength(forgotForm.newPassword).valid) return; // الزر أصلاً معطّل بس نتأكد
    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
        setAuthError('كلمة السر الجديدة وتأكيدها غير متطابقتين');
        return;
    }
    setAuthLoading(true);
    setAuthError('');
    try {
        const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotForm.email, recoveryKey: forgotForm.recoveryKey, newPassword: forgotForm.newPassword }),
        });
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            setToken(data.token); setUser(data.user); setIsAdminUnlocked(false); setIsLoggingOut(false);
        } else if (res.status === 429) {
            setLockoutSeconds(data.retryAfter || 30);
            setAuthError(data.error || 'محاولات كثيرة، حاول لاحقاً');
        } else { setAuthError(data.error || 'حدث خطأ غير متوقع'); }
    } catch (err) { setAuthError('تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت'); }
    finally { setAuthLoading(false); }
};
const fetchDevDirectory = async () => {
    setDevDirectoryLoading(true);
    setDevDirectoryError('');
    try {
        const res = await fetch(`${API_BASE}/api/dev/companies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setupKey: authForm.setupKey }),
        });
        const data = await res.json();
        if (res.ok) { setDevDirectory(data); }
        else { setDevDirectoryError(data.error || 'تعذر جلب البيانات'); }
    } catch (err) { setDevDirectoryError('تعذر الاتصال بالسيرفر'); }
    finally { setDevDirectoryLoading(false); }
};
const handleLogout = () => {
    localStorage.clear(); // مسح بيانات الدخول من المتصفح
    setToken(null);       // إغلاق الجلسة
    setUser(null);        // مسح بيانات المستخدم
    setSelectedProject(null);
    setIsAdminUnlocked(false); // قفل الأقسام الإدارية
  };
  // حركة "الباب يفتح" قبل الخروج الفعلي - أقل من ثانية، وبعدها ينفذ الخروج
  const triggerLogout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setTimeout(handleLogout, 650);
  };
  const saveManagerName = (e) => {
    e.preventDefault();
    const name = managerNameInput.trim();
    if (name) {
      localStorage.setItem('managerName', name);
      setManagerName(name);
    }
    setIsEditingManagerName(false);
  };
  const deleteItem = async (type, id) => {
    if (!window.confirm('⚠️ هل أنت متأكد من الحذف النهائي؟')) return;
    try {
        const res = await apiFetch(`/api/${type}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            alert(`❌ ${data.error || 'تعذر الحذف'}`);
            return;
        }
        fetchData();
    } catch (err) { alert('❌ تعذر الاتصال بالسيرفر'); }
};

 const handleAddOrUpdateSubItem = async (endpoint, body, resetCallback, isUpdate = false, id = null) => {
    const method = isUpdate ? 'PATCH' : 'POST';
    
    const url = isUpdate
        ? `/api/${endpoint}/${id}`
        : `/api/${endpoint}`;

    try {
        const res = await apiFetch(url, {
            method,
            body: JSON.stringify({ ...body, projectId: selectedProject?.id }),
        });

        if (res.ok) {
            resetCallback();
            // تحديث البيانات بعد الإضافة الناجحة (fetchData يحدّث أيضاً تفاصيل
            // المشروع المفتوح حالياً عبر مساره الخاص، فلا حاجة لإعادة الجلب هنا)
            await fetchData();

            alert("✅ تمت الإضافة بنجاح");
        } else {
            const data = await res.json().catch(() => ({}));
            alert(`❌ ${data.error || 'فشل في الحفظ: تأكد من إدخال البيانات بشكل صحيح'}`);
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
    const url = editingEmployeeId ? `/api/employee/${editingEmployeeId}` : `/api/employee`;

    try {
        const res = await apiFetch(url, {
            method,
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
        await apiFetch(`/api/attendance`, {
            method: 'POST',
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
    await apiFetch(`/api/salary-payment`, {
        method: 'POST',
        body: JSON.stringify({ employeeId: empId, amount: salaryPayAmount, type: 'أسبوعي' })
    });
    setSalaryPayAmount(''); 
    fetchData();
};

  // [جديد] وظيفة المهام
 const toggleTask = async (taskId) => {
    await apiFetch(`/api/tasks/${taskId}`, { method: 'PATCH' });
    await fetchData();
};
  // [جديد] وظيفة الإشعارات
  const markNotifRead = async (id) => {
    await apiFetch(`/api/notifications/${id}`, { method: 'PATCH' });
    fetchNotifications();
  };

  // ==========================================
  // --- توليد ملفات PDF (يعمل على الموبايل والديسكتوب) ---
  // ==========================================
  // ملاحظة: الطريقة القديمة كانت تفتح نافذة جديدة وتستدعي window.print()،
  // وهذا لا يعمل داخل تطبيق الموبايل (WebView) لعدم وجود نافذة طباعة نظام.
  // هنا نستخدم html2canvas + jsPDF مباشرة (بدل html2pdf.js) للتحكم الكامل
  // بحجم صفحة الـ PDF، لأن محاولة html2pdf.js التلقائية لملاءمة المحتوى
  // بهامش صفحة A4 كانت تقتصّ عمود الجدول الأخير (الأيمن) دائماً.
  //
  // تسليم الملف: على متصفح الموبايل (خصوصاً كروم أندرويد)، تنزيل ملف عبر
  // رابط blob: يفشل أحياناً ويحوّل المستخدم لصفحة خطأ "drive.google.com"
  // لأن أندرويد يحاول تمرير رابط blob لعارض خارجي لا يقدر يوصله (الرابط
  // صالح فقط داخل نفس الصفحة). لذلك نستخدم Web Share API أولاً على
  // الموبايل (يفتح قائمة المشاركة/الحفظ الأصلية لأندرويد وتتفادى المشكلة
  // تماماً)، ونرجع للتنزيل العادي (يعمل بشكل ممتاز على اللابتوب) كخيار بديل.
  const deliverPdf = async (pdf, filename) => {
    const blob = pdf.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch (shareErr) {
        if (shareErr && shareErr.name === 'AbortError') return; // المستخدم ألغى المشاركة بنفسه
        // فشلت المشاركة لأي سبب آخر: نكمل للتنزيل العادي كخطة بديلة
      }
    }
    pdf.save(filename);
  };

  const generatePdfFromHtml = async (contentHtml, filename) => {
    // ملاحظة مهمة: لا نستخدم position: fixed/absolute مع إحداثيات خارج الشاشة،
    // لأن html2canvas يفشل أحياناً في حساب ارتفاع هذه العناصر أثناء عملية
    // استنساخ المستند الداخلية (ينتج عنه صورة فارغة بارتفاع صفر). لذلك نضيف
    // العنصر بشكل طبيعي في نهاية الصفحة (يبقى غير مرئي دون تمرير) ثم نحذفه فوراً.
    const container = document.createElement('div');
    container.dir = 'rtl';
    container.style.width = '800px';
    container.style.background = '#ffffff';
    // مهم: يجب إلغاء letter-spacing الموروث من body (:root في index.css) صراحة،
    // لأن html2canvas يطبّقه حرفاً بحرف بدل تطبيقه بين الكلمات فقط كما يفعل
    // المتصفح، فيكسر تشكيل واتصال الحروف العربية (تظهر الكلمات مفككة ومشوهة).
    container.style.letterSpacing = 'normal';
    container.innerHTML = contentHtml;
    document.body.appendChild(container);
    // انتظار دورة رسم كاملة حتى يحسب المتصفح تخطيط العناصر قبل التصوير
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    try {
      const scale = 2;
      const canvas = await html2canvas(container, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        // يجب تحديد windowWidth صراحة بعرض المحتوى نفسه، وإلا فإن html2canvas
        // يستخدم عرض شاشة الجهاز الفعلي (ضيق جداً على الموبايل) كنافذة
        // استنساخ داخلية، فيقصّ التقرير من جهته اليمنى.
        windowWidth: container.scrollWidth,
        windowHeight: container.scrollHeight,
      });

      // نبني صفحة PDF بنفس أبعاد الصورة الملتقطة تماماً (تحويل بكسل إلى مم
      // بدقة 96 نقطة/إنش، مع قسمة العامل scale) بدل فرض مقاس A4 القياسي؛
      // هكذا تُطبع الصورة كاملة بلا أي تصغير أو اقتصاص لحوافها.
      const pxToMm = (px) => (px / scale) * (25.4 / 96);
      const pdfWidth = pxToMm(canvas.width);
      const pdfHeight = pxToMm(canvas.height);

      const pdf = new jsPDF({
        unit: 'mm',
        format: [pdfWidth, pdfHeight],
        orientation: pdfWidth >= pdfHeight ? 'landscape' : 'portrait',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      await deliverPdf(pdf, filename);
    } catch (err) {
      alert('❌ تعذر إنشاء ملف PDF، حاول مرة أخرى');
    } finally {
      document.body.removeChild(container);
    }
  };

  const sanitizeFileName = (name) => (name || '').replace(/[\\/:*?"<>|]/g, '-').trim();

  const exportPDF = () => {
    const contentHtml = `
      <style>
        .pdf-wrap { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; padding: 20px; direction: rtl; color: #111827; letter-spacing: normal; }
        .pdf-header { text-align: center; border-bottom: 4px solid #111C44; margin-bottom: 24px; padding-bottom: 14px; }
        .pdf-header h1 { color: #111C44; margin: 0 0 6px; font-size: 26px; }
        .pdf-header p { margin: 0; color: #475569; font-weight: bold; }
        .pdf-wrap table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .pdf-wrap th { background: #111C44; color: white; padding: 8px 4px; font-size: 11px; word-break: break-word; }
        .pdf-wrap td { padding: 8px 4px; border: 1px solid #eee; text-align: center; font-weight: bold; font-size: 11px; word-break: break-word; }
      </style>
      <div class="pdf-wrap">
        <div class="pdf-header"><h1>تقرير رواتب وحضور الكادر</h1><p>شركة المِعمار للمقاولات</p></div>
        <table>
          <thead><tr><th>المعرف</th><th>الاسم</th><th>المنصب</th><th>الراتب الكلي</th><th>الواصل</th><th>المتبقي</th><th>الحضور</th><th>الغياب</th></tr></thead>
          <tbody>
            ${employees.map(emp => {
              const paid = emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0;
              return `<tr>
                <td>#${emp.id}</td><td>${emp.name}</td><td>${emp.position}</td>
                <td>${emp.salary.toLocaleString()} د.ع</td><td>${paid.toLocaleString()} د.ع</td><td>${(emp.salary - paid).toLocaleString()} د.ع</td>
                <td>${emp.attendances?.filter(a => a.status === 'حاضر').length} يوم</td>
                <td>${emp.attendances?.filter(a => a.status === 'غائب').length} يوم</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    generatePdfFromHtml(contentHtml, 'تقرير-الرواتب.pdf');
  };

  const exportProjectReportPDF = () => {
    const received = selectedProject.payments?.reduce((s, p) => s + p.amount, 0) || 0;
    const spent = (selectedProject.expenses?.reduce((s, p) => s + p.amount, 0) || 0) +
                  (selectedProject.materials?.reduce((s, p) => s + p.price, 0) || 0);
    const profit = received - spent;

    const contentHtml = `
      <style>
        .pdf-wrap { font-family: system-ui, 'Segoe UI', Roboto, sans-serif; padding: 20px; direction: rtl; background: #fff; color: #111827; letter-spacing: normal; }
        .pdf-header { text-align: center; border-bottom: 5px solid #111C44; padding-bottom: 20px; margin-bottom: 30px; }
        .pdf-header h1 { color: #111C44; font-size: 30px; margin: 0; }
        .project-info { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 30px; padding: 15px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; font-size: 13px; }
        .stats { display: flex; gap: 20px; margin-bottom: 40px; }
        .stat-card { flex: 1; padding: 20px; border-radius: 20px; text-align: center; }
        .stat-card h4 { margin: 0; font-size: 13px; color: #64748b; text-transform: uppercase; }
        .stat-card p { margin: 10px 0 0 0; font-size: 22px; font-weight: 900; }
        .table-section { margin-bottom: 30px; }
        .table-section h3 { color: #111C44; border-right: 6px solid #4f46e5; padding-right: 15px; margin-bottom: 15px; font-size: 16px; }
        .pdf-wrap table { width: 100%; table-layout: fixed; border-collapse: collapse; }
        .pdf-wrap th { background: #111C44; color: white; padding: 10px 6px; text-align: right; font-size: 12px; word-break: break-word; }
        .pdf-wrap td { padding: 10px 6px; border-bottom: 1px solid #f1f5f9; font-size: 12px; font-weight: bold; word-break: break-word; }
        .footer { margin-top: 50px; display: flex; justify-content: space-between; text-align: center; font-size: 13px; }
        .stamp { width: 110px; height: 110px; border: 2px dashed #cbd5e1; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 10px; margin: 10px auto 0; }
      </style>
      <div class="pdf-wrap">
        <div class="pdf-header">
          <h1>كشف حساب مالي رسمي</h1>
          <p style="color: #64748b; font-weight: bold;">نظام المِعمار لإدارة المقاولات العامة</p>
        </div>
        <div class="project-info">
          <div><b>المشروع:</b> ${selectedProject.name}</div>
          <div><b>العميل:</b> ${selectedProject.client}</div>
          <div><b>التاريخ:</b> ${new Date().toLocaleDateString('ar-EG')}</div>
        </div>
        <div class="stats">
          <div class="stat-card" style="background: #f0fdf4;"><h4>إجمالي الواصل</h4><p style="color: #16a34a;">${received.toLocaleString()} د.ع</p></div>
          <div class="stat-card" style="background: #fef2f2;"><h4>إجمالي المصروفات</h4><p style="color: #dc2626;">${spent.toLocaleString()} د.ع</p></div>
          <div class="stat-card" style="background: #eff6ff;"><h4>الربح الصافي</h4><p style="color: #2563eb;">${profit.toLocaleString()} د.ع</p></div>
        </div>
        <div class="table-section">
          <h3>سجل الدفعات المستلمة</h3>
          <table><thead><tr><th>ت</th><th>التاريخ</th><th>المبلغ</th></tr></thead>
          <tbody>${selectedProject.payments?.map((p, i) => `<tr><td>${i+1}</td><td>${new Date(p.date).toLocaleString('ar-EG')}</td><td>${p.amount.toLocaleString()} د.ع</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="table-section">
          <h3>كشف المصاريف والمواد</h3>
          <table><thead><tr><th>ت</th><th>البيان / المادة</th><th>الكمية</th><th>التكلفة</th></tr></thead>
          <tbody>
            ${selectedProject.expenses?.map((ex, i) => `<tr><td>${i+1}</td><td>${ex.description}</td><td>-</td><td>${ex.amount.toLocaleString()} د.ع</td></tr>`).join('')}
            ${selectedProject.materials?.map((m, i) => `<tr><td>${i+1}</td><td>${m.name}</td><td>${m.quantity} ${m.unit}</td><td>${m.price.toLocaleString()} د.ع</td></tr>`).join('')}
          </tbody></table>
        </div>
        <div class="footer">
          <div><p>ختم الإدارة المالية</p><div class="stamp">الختم الرسمي</div></div>
          <div><p>توقيع المدير العام</p><br><p>_________________</p></div>
        </div>
      </div>`;
    generatePdfFromHtml(contentHtml, `كشف-حساب-${sanitizeFileName(selectedProject.name)}.pdf`);
  };

 const handleFileUpload = async (e) => {
    e.preventDefault(); if (!selectedFile) return;
    setUploading(true);
    const formData = new FormData(); 
    formData.append('file', selectedFile); 
    formData.append('projectId', selectedProject.id); 
    formData.append('name', attachmentName);
    
    const res = await apiFetch(`/api/upload`, { method: 'POST', body: formData });
    if (res.ok) { 
        setAttachmentName(''); 
        setSelectedFile(null); 
        fetchData(); 
    }
    setUploading(false);
};
  const updateProjectStatus = async (status) => {
    await apiFetch(`/api/project/${selectedProject.id}/status`, {
        method: 'PATCH',
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
  // --- شاشة تسجيل الدخول (Login) + بوابة المطوّر المعزولة (Developer Portal) ---
  // ==========================================
  if (!token) {

    // بوابة المطوّر: معزولة تماماً تصميماً ووظيفةً عن شاشة الدخول العادية،
    // ولا تظهر إلا لمن يعرف رابط ?newcompany صراحةً. تُستخدم حصراً لتأسيس
    // شركات (زبائن) جدد - المستخدم العادي لا يصل لها ولا يعرف بوجودها.
    if (isSetupMode) {
      return (
        <div className="min-h-screen relative flex items-center justify-center px-4 py-10 bg-[#07070c] overflow-hidden" dir="rtl">
          {/* خلفية متحركة: توهجات متدرجة + نقاط شبكية */}
          <div className="absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:26px_26px] opacity-40"></div>
          <div className="absolute -top-40 -right-40 w-[32rem] h-[32rem] bg-fuchsia-600/20 rounded-full blur-[120px] animate-pulse"></div>
          <div className="absolute -bottom-40 -left-40 w-[32rem] h-[32rem] bg-cyan-500/20 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] bg-violet-600/10 rounded-full blur-[140px]"></div>

          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="relative w-full max-w-lg"
          >
            <div className="relative bg-white/[0.04] backdrop-blur-2xl p-6 sm:p-12 rounded-[2rem] sm:rounded-[3rem] shadow-2xl border border-white/10 text-right">
              <div className="text-center mb-8 sm:mb-10">
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-fuchsia-500 via-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-fuchsia-900/40 mx-auto mb-5"
                >
                  <Rocket className="w-8 h-8 sm:w-9 sm:h-9 text-white" strokeWidth={2.2} />
                </motion.div>
                <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black tracking-widest text-fuchsia-300 bg-fuchsia-500/10 border border-fuchsia-400/20 px-3 py-1.5 rounded-full mb-4">
                  <ShieldCheck className="w-3.5 h-3.5" /> وصول مقيّد بمفتاح إعداد
                </span>
                <p className="text-2xl sm:text-3xl font-black text-white">{devPortalView === 'create' ? 'بوابة تأسيس الشركات' : 'دليل الشركات والمستخدمين'}</p>
                <p className="text-slate-400 mt-2 font-bold text-xs sm:text-sm">{devPortalView === 'create' ? 'مساحة المطوّر الخاصة — إنشاء حساب شركة جديدة داخل نظام المِعمار' : 'كل الشركات وحساباتها — للبحث عن إيميل ناسيه أحد الزبائن'}</p>
              </div>

              <div className="flex gap-2 bg-white/[0.04] border border-white/10 rounded-2xl p-1.5 mb-6">
                  <button type="button" onClick={() => { setDevPortalView('create'); setAuthError(''); }} className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${devPortalView === 'create' ? 'bg-gradient-to-l from-fuchsia-600 to-violet-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
                      <Rocket className="w-4 h-4" /> تأسيس شركة
                  </button>
                  <button type="button" onClick={() => { setDevPortalView('directory'); setAuthError(''); }} className={`flex-1 py-2.5 rounded-xl font-black text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${devPortalView === 'directory' ? 'bg-gradient-to-l from-fuchsia-600 to-violet-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>
                      <Users className="w-4 h-4" /> دليل الشركات
                  </button>
              </div>

              {devPortalView === 'create' ? (
              <form onSubmit={handleAuth} className="space-y-4 text-right">
                <div className="relative">
                    <KeyRound className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-fuchsia-400" />
                    <input type="text" placeholder="مفتاح الإعداد" value={authForm.setupKey} onChange={e=>setAuthForm({...authForm, setupKey:e.target.value})} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-2xl bg-fuchsia-500/[0.06] border-2 border-fuchsia-400/20 focus:border-fuchsia-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" required />
                </div>
                <div className="relative">
                    <Building2 className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input type="text" placeholder="اسم الشركة / المنشأة" value={authForm.companyName} onChange={e=>setAuthForm({...authForm, companyName:e.target.value})} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-2xl bg-white/[0.04] border-2 border-white/10 focus:border-violet-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" required />
                </div>
                <div className="relative">
                    <UserRound className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input type="text" placeholder="اسم صاحب الشركة" value={authForm.name} onChange={e=>setAuthForm({...authForm, name:e.target.value})} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-2xl bg-white/[0.04] border-2 border-white/10 focus:border-violet-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" required />
                </div>
                <div className="relative">
                    <Mail className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input type="email" autoComplete="username" placeholder="البريد الإلكتروني" value={authForm.email} onChange={e=>setAuthForm({...authForm, email:e.target.value})} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-2xl bg-white/[0.04] border-2 border-white/10 focus:border-violet-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" required />
                </div>
                <div>
                    <div className="relative">
                        <Lock className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="كلمة السر" value={authForm.password} onChange={e=>setAuthForm({...authForm, password:e.target.value})} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-12 rounded-2xl bg-white/[0.04] border-2 border-white/10 focus:border-violet-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" required />
                        <button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                    <div className="mt-2 px-1"><PasswordStrengthHint password={authForm.password} dark /></div>
                </div>
                <div className="relative">
                    <Key className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-cyan-400" />
                    <input type="text" placeholder="مفتاح استرجاع كلمة السر (يخص هذي الشركة)" value={authForm.recoveryKey} onChange={e=>setAuthForm({...authForm, recoveryKey:e.target.value})} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-2xl bg-cyan-500/[0.06] border-2 border-cyan-400/20 focus:border-cyan-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" required />
                </div>
                <p className="text-slate-500 font-bold text-[11px] sm:text-xs -mt-2 leading-relaxed">
                    🔑 احتفظ بهذا المفتاح لصاحب الشركة — يحتاجه لاسترجاع كلمة السر لو نساها، من زر "نسيت كلمة السر" بشاشة الدخول
                </p>

                <AnimatePresence>
                    {authError && (
                        <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 font-bold text-sm text-center overflow-hidden">
                            {authError}
                        </motion.p>
                    )}
                </AnimatePresence>

                <button disabled={authLoading || lockoutSeconds > 0 || !checkPasswordStrength(authForm.password).valid} type="submit" className="w-full bg-gradient-to-l from-fuchsia-600 via-violet-600 to-cyan-500 text-white py-4 sm:py-5 rounded-2xl font-black text-base sm:text-lg shadow-xl shadow-violet-900/40 hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                    {authLoading ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> : lockoutSeconds > 0 ? `⏳ حاول بعد ${lockoutSeconds} ثانية` : <><Sparkles className="w-5 h-5" /> تأسيس الشركة الآن</>}
                </button>

                <p className="text-center text-slate-500 font-bold text-[11px] sm:text-xs pt-2 leading-relaxed">
                    🛡️ كل شركة تُعزل بالكامل عن بقية الشركات داخل النظام — لا يقدر أي مستخدم يشوف بيانات غيره إطلاقاً
                </p>

                <button type="button" onClick={() => { window.location.href = window.location.pathname; }} className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-300 font-bold text-xs sm:text-sm transition-colors pt-1">
                    <ArrowLeft className="w-3.5 h-3.5" /> الرجوع لتسجيل الدخول العادي
                </button>
              </form>
              ) : (
              <div className="space-y-4 text-right">
                  <div className="relative">
                      <KeyRound className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-fuchsia-400" />
                      <input type="text" placeholder="مفتاح الإعداد" value={authForm.setupKey} onChange={e=>setAuthForm({...authForm, setupKey:e.target.value})} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), fetchDevDirectory())} className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-2xl bg-fuchsia-500/[0.06] border-2 border-fuchsia-400/20 focus:border-fuchsia-400/60 text-white placeholder:text-slate-500 font-bold text-base outline-none text-right transition-all" />
                  </div>
                  <button type="button" onClick={fetchDevDirectory} disabled={devDirectoryLoading} className="w-full bg-gradient-to-l from-fuchsia-600 via-violet-600 to-cyan-500 text-white py-4 rounded-2xl font-black text-base shadow-xl shadow-violet-900/40 hover:opacity-90 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                      {devDirectoryLoading ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> : <><Search className="w-5 h-5" /> عرض كل الشركات</>}
                  </button>

                  {devDirectoryError && (
                      <p className="text-red-300 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 font-bold text-sm text-center">{devDirectoryError}</p>
                  )}

                  {devDirectory && (
                      <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                          {devDirectory.length === 0 && <p className="text-center text-slate-500 font-bold text-sm py-4">ما أكو شركات بعد</p>}
                          {devDirectory.map(c => (
                              <div key={c.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                                  <p className="font-black text-white text-sm flex items-center gap-1.5"><Building2 className="w-4 h-4 text-violet-400" /> {c.name}</p>
                                  <div className="mt-2 space-y-1.5">
                                      {c.users.map(u => (
                                          <div key={u.id} className="flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2">
                                              <span className="text-slate-300 font-bold text-xs flex items-center gap-1.5">
                                                  {u.isOwner && <span title="مالك الشركة">⭐</span>} {u.name}
                                              </span>
                                              <span className="text-slate-400 font-bold text-xs" dir="ltr">{u.email}</span>
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}

                  <button type="button" onClick={() => { window.location.href = window.location.pathname; }} className="w-full flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-300 font-bold text-xs sm:text-sm transition-colors pt-1">
                      <ArrowLeft className="w-3.5 h-3.5" /> الرجوع لتسجيل الدخول العادي
                  </button>
              </div>
              )}
            </div>
          </motion.div>
        </div>
      );
    }

    // شاشة الدخول العادية لكل زبائن النظام - وجه تفاعلي يعبّر عن نتيجة كل محاولة
    const faceEmoji = { idle: '🙂', peeking: '🙈', angry: '😠', furious: '🤬', happy: '🤣' }[faceState];
    const faceRing = {
      idle: 'from-indigo-400 via-blue-500 to-indigo-700',
      peeking: 'from-indigo-400 via-blue-500 to-indigo-700',
      angry: 'from-red-400 via-rose-500 to-red-700',
      furious: 'from-red-500 via-rose-600 to-red-800',
      happy: 'from-emerald-400 via-teal-500 to-emerald-700',
    }[faceState];

    return (
      <div
        className="min-h-screen relative flex flex-col items-center justify-center px-4 py-10 overflow-hidden bg-gradient-to-br from-indigo-100 via-violet-50 to-cyan-100"
        dir="rtl"
        onMouseMove={(e) => {
            bgMouseX.set((e.clientX / window.innerWidth - 0.5) * 50);
            bgMouseY.set((e.clientY / window.innerHeight - 0.5) * 50);
        }}
      >
        {/* خلفية تفاعلية: كتل ملوّنة تتابع الماوس (parallax) + تطفو بحركة مستمرة */}
        <motion.div className="absolute inset-0 pointer-events-none" style={{ x: bgSpringX, y: bgSpringY }}>
            <motion.div animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} className="absolute -top-32 -right-32 w-[30rem] h-[30rem] bg-indigo-400/30 rounded-full blur-[110px]"></motion.div>
            <motion.div animate={{ x: [0, -30, 25, 0], y: [0, 25, -25, 0] }} transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }} className="absolute -bottom-32 -left-32 w-[30rem] h-[30rem] bg-fuchsia-400/25 rounded-full blur-[110px]"></motion.div>
            <motion.div animate={{ x: [0, 25, -35, 0], y: [0, -20, 30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 1 }} className="absolute top-1/3 left-1/4 w-[22rem] h-[22rem] bg-cyan-400/25 rounded-full blur-[100px]"></motion.div>
            <motion.div animate={{ x: [0, -20, 30, 0], y: [0, 30, -20, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }} className="absolute bottom-1/4 right-1/4 w-[20rem] h-[20rem] bg-amber-300/20 rounded-full blur-[100px]"></motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="relative w-full max-w-lg"
        >
            {/* توهج ملوّن خلف البطاقة */}
            <div className="absolute -inset-4 bg-gradient-to-br from-indigo-400/40 via-fuchsia-300/30 to-cyan-300/40 rounded-[2.5rem] sm:rounded-[4.5rem] blur-2xl -z-10"></div>
            <div className="relative bg-gradient-to-br from-white via-indigo-50/70 to-violet-50/80 backdrop-blur-2xl p-6 sm:p-12 rounded-[2rem] sm:rounded-[4rem] shadow-2xl border border-white/70 text-right">
                <div className="text-center mb-8 sm:mb-10">
                    {/* الوجه التفاعلي: يتابع محاولات الدخول ويعبّر عنها */}
                    <div className="relative w-28 h-28 sm:w-36 sm:h-36 mx-auto mb-5">
                        {faceState === 'furious' && (
                            <span className="absolute inset-0 rounded-full bg-red-500/40 animate-ping"></span>
                        )}
                        <div className={`relative w-full h-full rounded-full bg-gradient-to-br ${faceRing} flex items-center justify-center shadow-2xl transition-colors duration-500`}>
                            <AnimatePresence mode="wait">
                                <motion.span
                                  key={faceState}
                                  initial={{ scale: 0.4, opacity: 0 }}
                                  animate={
                                      faceState === 'angry' || faceState === 'furious'
                                      ? { scale: 1, opacity: 1, x: [0, -10, 10, -10, 10, -5, 5, 0] }
                                      : faceState === 'happy'
                                      ? { scale: [0.4, 1.2, 1], opacity: 1, rotate: [0, -10, 10, -6, 6, 0] }
                                      : { scale: 1, opacity: 1 }
                                  }
                                  transition={{ duration: faceState === 'happy' ? 0.7 : 0.5 }}
                                  className="text-6xl sm:text-7xl select-none"
                                >
                                    {faceEmoji}
                                </motion.span>
                            </AnimatePresence>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] sm:text-xs font-black tracking-widest text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-full mb-3">
                        <ShieldCheck className="w-3.5 h-3.5" /> دخول آمن ومشفّر
                    </span>
                    <p className="text-2xl sm:text-3xl font-black text-[#111C44]">نظام المِعمار</p>
                    <p className="text-slate-500 mt-2 font-bold text-sm sm:text-base">منصّة إدارة المقاولات الذكية</p>
                </div>
                <AnimatePresence mode="wait">
                {!showForgotPassword ? (
                    <motion.form key="login" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }} onSubmit={handleAuth} className="space-y-4 sm:space-y-5 text-right">
                        <div className="relative">
                            <Mail className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                              type="email" name="email" autoComplete="username" placeholder="البريد الإلكتروني" value={authForm.email}
                              onChange={e=>{ setAuthForm({...authForm, email:e.target.value}); setFaceState('idle'); }}
                              onFocus={() => setFaceState('idle')}
                              className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-4 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white font-bold text-base sm:text-lg outline-none text-right transition-all" required />
                        </div>
                        <div className="relative">
                            <Lock className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                              type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="كلمة السر" value={authForm.password}
                              onChange={e=>{ setAuthForm({...authForm, password:e.target.value}); setFaceState('peeking'); }}
                              onFocus={() => setFaceState('peeking')}
                              onBlur={() => setFaceState(f => f === 'peeking' ? 'idle' : f)}
                              className="w-full py-4 sm:py-5 pr-12 sm:pr-14 pl-12 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white font-bold text-base sm:text-lg outline-none text-right transition-all" required />
                            <button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>

                        <div className="text-left">
                            <button type="button" onClick={() => { setShowForgotPassword(true); setAuthError(''); setFaceState('idle'); setForgotForm(f => ({ ...f, email: authForm.email })); }} className="text-indigo-500 hover:text-indigo-700 font-bold text-xs sm:text-sm transition-colors">
                                نسيت كلمة السر؟
                            </button>
                        </div>

                        <AnimatePresence>
                            {authError && (
                                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-600 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 font-bold text-sm text-center overflow-hidden">
                                    {authError}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        <motion.button
                          whileHover={{ scale: 1.015 }}
                          whileTap={{ scale: 0.97 }}
                          disabled={authLoading || lockoutSeconds > 0} type="submit" className="w-full bg-[#111C44] text-white py-4 sm:py-6 rounded-[2rem] font-black text-lg sm:text-xl hover:bg-indigo-700 shadow-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                            {authLoading ? <span className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> : lockoutSeconds > 0 ? `⏳ حاول بعد ${lockoutSeconds} ثانية` : 'دخول للنظام'}
                        </motion.button>
                        <p className="text-center text-slate-400 font-bold text-[11px] sm:text-xs pt-1 flex items-center justify-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5" /> اتصال مشفّر وبياناتك معزولة بالكامل عن بقية الشركات
                        </p>
                    </motion.form>
                ) : (
                    <motion.form key="forgot" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }} onSubmit={handleForgotPassword} className="space-y-4 text-right">
                        <p className="text-slate-500 font-bold text-xs sm:text-sm -mt-2 mb-1 leading-relaxed">
                            أدخل بريدك ومفتاح استرجاع شركتك (تحصل عليه من صاحب الشركة أو من طوّر لك النظام)، ثم اختر كلمة سر جديدة.
                        </p>
                        <div className="relative">
                            <Mail className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input type="email" name="email" autoComplete="username" placeholder="البريد الإلكتروني" value={forgotForm.email} onChange={e=>setForgotForm({...forgotForm, email:e.target.value})} className="w-full py-4 pr-12 sm:pr-14 pl-4 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white font-bold text-base outline-none text-right transition-all" required />
                        </div>
                        <div className="relative">
                            <Key className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input type="text" placeholder="مفتاح استرجاع الشركة" value={forgotForm.recoveryKey} onChange={e=>setForgotForm({...forgotForm, recoveryKey:e.target.value})} className="w-full py-4 pr-12 sm:pr-14 pl-4 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white font-bold text-base outline-none text-right transition-all" required />
                        </div>
                        <div className="relative">
                            <Lock className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="كلمة السر الجديدة" value={forgotForm.newPassword} onChange={e=>setForgotForm({...forgotForm, newPassword:e.target.value})} className="w-full py-4 pr-12 sm:pr-14 pl-12 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white font-bold text-base outline-none text-right transition-all" required />
                            <button type="button" onClick={()=>setShowNewPassword(!showNewPassword)} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        <div className="relative">
                            <Lock className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="تأكيد كلمة السر الجديدة" value={forgotForm.confirmPassword} onChange={e=>setForgotForm({...forgotForm, confirmPassword:e.target.value})} className="w-full py-4 pr-12 sm:pr-14 pl-4 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-indigo-400 focus:bg-white font-bold text-base outline-none text-right transition-all" required />
                        </div>
                        <div className="px-1 -mt-2"><PasswordStrengthHint password={forgotForm.newPassword} /></div>

                        <AnimatePresence>
                            {authError && (
                                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-red-600 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 font-bold text-sm text-center overflow-hidden">
                                    {authError}
                                </motion.p>
                            )}
                        </AnimatePresence>

                        <button disabled={authLoading || lockoutSeconds > 0 || !checkPasswordStrength(forgotForm.newPassword).valid} type="submit" className="w-full bg-[#111C44] text-white py-4 sm:py-5 rounded-[2rem] font-black text-base sm:text-lg hover:bg-indigo-700 shadow-xl transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
                            {authLoading ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span> : lockoutSeconds > 0 ? `⏳ حاول بعد ${lockoutSeconds} ثانية` : <><RefreshCcw className="w-4 h-4" /> تغيير كلمة السر</>}
                        </button>

                        <button type="button" onClick={() => { setShowForgotPassword(false); setAuthError(''); setFaceState('idle'); }} className="w-full flex items-center justify-center gap-1.5 text-slate-400 hover:text-slate-600 font-bold text-xs sm:text-sm transition-colors pt-1">
                            <ArrowLeft className="w-3.5 h-3.5" /> العودة لتسجيل الدخول
                        </button>
                    </motion.form>
                )}
                </AnimatePresence>
            </div>
        </motion.div>
      </div>
    );
  }

  // ==========================================
  // --- واجهة النظام الرئيسية (Dashboard) ---
  // ==========================================
 return (
  <div className={`min-h-screen flex flex-col lg:flex-row font-sans transition-all duration-500 ${isDarkMode ? 'dark-mode bg-[#0f172a] text-white' : 'bg-[#F4F7FE] text-slate-800'}`} dir="rtl">
    
    {/* --- 1. واجهة الموبايل (AppBar علوي ثابت) --- */}
    <header className={`lg:hidden sticky top-0 z-50 shadow-2xl transition-all ${isDarkMode ? 'bg-[#1e293b] border-b border-white/5' : 'bg-[#111C44] text-white'}`}>
      <div className="p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-2xl bg-indigo-600 p-2 rounded-lg shadow-lg">🏗️</span>
          <h1 className="text-lg font-black italic tracking-tighter">نظام المِعمار v3</h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* زر التبديل بين الليلي والنهاري للموبايل */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl text-xl active:scale-90 transition-all"
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          {/* زر تسجيل الخروج للموبايل */}
          <LogoutDoorButton isLoggingOut={isLoggingOut} onClick={triggerLogout} variant="icon" />
        </div>
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
          { id: 'settings', label: 'الإعدادات', icon: '⚙️', admin: true },
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
          { id: 'settings', label: 'إعدادات النظام', icon: '⚙️', admin: true },
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
          <LogoutDoorButton isLoggingOut={isLoggingOut} onClick={triggerLogout} variant="full" />
      </div>
    </aside>

      {/* 2. Main Content */}
      <main className="flex-1 flex flex-col min-w-0 text-right">
        <header className="h-16 sm:h-20 lg:h-24 bg-white border-b border-slate-100 flex items-center justify-between px-3 sm:px-4 lg:px-10 shrink-0 shadow-sm w-full">
            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 min-w-0">
                <h2 className="text-sm sm:text-xl lg:text-3xl font-black text-slate-900 italic uppercase truncate">
                    {{
                        dashboard: 'لوحة التحكم الشاملة',
                        projects: 'إدارة المشاريع',
                        employees: 'الموارد البشرية',
                        branches: 'فروع الشركة',
                        suppliers: 'الموردين والديون',
                        finances: 'كشف الأرباح الكلي',
                        archive: 'أرشيف المشاريع',
                        settings: 'إعدادات النظام',
                    }[tab] || 'نظام المِعمار'}
                </h2>
                {/* [جديد] أيقونة الجرس للإشعارات */}
                <div className="relative cursor-pointer" onClick={() => setShowNotifs(v => !v)}>
                    <span className="text-2xl">🔔</span>
                    {notifications.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center animate-pulse">{notifications.length}</span>}
                    {showNotifs && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowNotifs(false)}></div>
                        <div className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-20 sm:top-10 w-auto sm:w-80 max-w-full bg-white shadow-2xl rounded-3xl border border-slate-100 z-50 p-4 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                            <p className="font-black text-xs border-b pb-2 mb-2 uppercase">الإشعارات الذكية</p>
                            <div className="max-h-60 overflow-y-auto space-y-2">
                                {notifications.map(n => (
                                    <div key={n.id} onClick={()=>markNotifRead(n.id)} className={`p-3 rounded-xl text-[10px] font-bold ${n.type==='danger'?'bg-red-50 text-red-600':'bg-indigo-50 text-indigo-600'} hover:opacity-80`}>{n.message}</div>
                                ))}
                                {notifications.length === 0 && <p className="text-center text-slate-400 py-4 text-xs italic">لا توجد تنبيهات جديدة</p>}
                            </div>
                        </div>
                      </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 bg-slate-50 px-3 sm:px-5 py-2 sm:py-2.5 rounded-2xl border shadow-inner">
                {isEditingManagerName ? (
                    <form onSubmit={saveManagerName} className="flex items-center gap-1.5">
                        <input
                            autoFocus
                            type="text"
                            value={managerNameInput}
                            onChange={(e) => setManagerNameInput(e.target.value)}
                            placeholder="اسم المدير"
                            className="w-24 sm:w-40 p-2 rounded-xl border-2 border-indigo-200 outline-none font-black text-xs sm:text-sm text-right bg-white"
                        />
                        <button type="submit" className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-emerald-500 text-white rounded-lg text-xs shrink-0">✓</button>
                        <button type="button" onClick={() => setIsEditingManagerName(false)} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-slate-200 text-slate-500 rounded-lg text-xs shrink-0">✕</button>
                    </form>
                ) : (
                    <>
                        <div className="text-left min-w-0">
                            <p className="text-[10px] sm:text-xs font-black text-slate-400 italic">مرحباً بك</p>
                            <p className="text-xs sm:text-sm font-black text-slate-700 truncate max-w-[90px] sm:max-w-[160px]">{managerName || user?.name || 'المدير العام'}</p>
                        </div>
                        <button
                            onClick={() => { setManagerNameInput(managerName || user?.name || ''); setIsEditingManagerName(true); }}
                            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-xs shrink-0 transition-all"
                            title="تعديل اسم المدير"
                        >
                            ✏️
                        </button>
                    </>
                )}
                <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-black shadow-md shrink-0">
                    {(managerName || user?.name || 'A').trim().charAt(0).toUpperCase()}
                </div>
            </div>
        </header>

        <div className="p-4 lg:p-10 flex-1 overflow-y-auto w-full text-right">
            {/* العدادات العلوية - تظهر فقط بتبويب الرئيسية */}
            {tab === 'dashboard' && isAdminUnlocked && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-12 text-right">
                {[
                    { label: 'السيولة المستلمة', val: `${projects.reduce((acc, p) => acc + (p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0), 0).toLocaleString()} د.ع`, color: 'text-emerald-600' },
                    { label: 'المصاريف والمواد', val: `${projects.reduce((acc, p) => acc + (p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0), 0).toLocaleString()} د.ع`, color: 'text-emerald-600' },
                    { label: 'المشاريع النشطة', val: projects.length, color: 'text-emerald-600' },
                    { label: 'إجمالي الكادر', val: employees.length, color: 'text-emerald-600' }
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-xl transition-all text-right min-w-0"><p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-widest mb-2 text-right truncate">{stat.label}</p><h3 className={`text-lg sm:text-3xl font-black ${stat.color} text-right truncate`}>{stat.val}</h3></div>
                ))}
            </div>
            )}

            {/* DASHBOARD */}
            {tab === 'dashboard' && isAdminUnlocked && (
                <div className="space-y-6 sm:space-y-12 animate-in fade-in duration-700 text-right">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
                        <div className="bg-[#111C44] p-6 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] shadow-2xl text-center"><p className="text-indigo-300 font-black text-xs uppercase tracking-widest mb-2 sm:mb-4">إجمالي قيمة التعاقدات</p><h3 className="text-2xl sm:text-4xl font-black text-white">{projects.reduce((acc, p) => acc + p.budget, 0).toLocaleString()} د.ع</h3></div>
                        <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] border text-center shadow-sm"><p className="text-emerald-600 font-black text-xs uppercase tracking-widest mb-2 sm:mb-4">إجمالي ديون الموردين</p><h3 className="text-2xl sm:text-4xl font-black text-slate-900">{suppliers.reduce((acc, s) => acc + (s.materials?.reduce((sum, m) => sum + m.price, 0) || 0), 0).toLocaleString()} د.ع</h3></div>
                        <div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] border text-center shadow-sm"><p className="text-amber-500 font-black text-xs uppercase tracking-widest mb-2 sm:mb-4">إجمالي ديون العملاء</p><h3 className="text-2xl sm:text-4xl font-black text-slate-900">{projects.reduce((acc, p) => acc + (p.budget - (p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0)), 0).toLocaleString()} د.ع</h3></div>
                    </div>
                    <div className="bg-white p-5 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] border-r-[8px] sm:border-r-[12px] border-red-500 shadow-xl relative"><div className="static sm:absolute sm:top-8 sm:left-10 inline-block bg-red-100 text-red-600 px-4 py-1 rounded-full text-[10px] font-black italic shadow-[0_0_15px_rgba(220,38,38,0.5)] animate-pulse border border-red-200 mb-4 sm:mb-0">تنبيه المدير ⚠️</div><h2 className="text-xl sm:text-2xl font-black mb-4 sm:mb-8 text-slate-800">مشاريع تحتاج متابعة فورية</h2><div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 text-right">{projects.filter(p => p.status === 'متوقف' || p.status === 'ملغي').map(p => (<div key={p.id} className="bg-red-50/50 p-4 sm:p-6 rounded-3xl border border-red-100 flex justify-between items-center group cursor-pointer hover:bg-red-50 transition-all" onClick={() => {setTab('projects'); openProjectDetails(p.id)}}><div><h4 className="font-black text-slate-800 text-lg text-right">{p.name}</h4><p className="text-xs text-red-500 font-bold uppercase text-right">{p.status}</p></div><span className="text-2xl group-hover:translate-x-2 transition-transform">👈</span></div>))}</div></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 text-right"><div className="bg-white p-5 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] border shadow-sm"><h3 className="text-lg sm:text-xl font-black text-slate-800 mb-4 sm:mb-8">👥 الكادر الوظيفي</h3>
                    <div className="space-y-3 sm:space-y-4">{branches.map(b => (<div key={b.id} className="flex justify-between items-center p-4 sm:p-5 bg-slate-50 rounded-2xl text-right"><span className="font-black text-slate-700">{b.name}</span><span className="text-xs font-black bg-white px-4 sm:px-5 py-2 rounded-xl shadow-sm border">{employees.filter(e => e.branchId === b.id).length} موظف</span></div>))}</div></div><div className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] border shadow-sm flex flex-col items-center justify-center text-center"><div className="w-20 h-20 sm:w-24 sm:h-24 bg-amber-50 rounded-full flex items-center justify-center text-4xl sm:text-5xl mb-4 sm:mb-6 shadow-inner animate-pulse">🏆</div><h3 className="text-xl sm:text-2xl font-black text-slate-800">إنجازات الشركة</h3><p className="text-slate-400 mt-2 font-bold text-sm px-4 sm:px-10">لقد أتممت بنجاح <span className="text-emerald-600 text-2xl font-black">{projects.filter(p=>p.status==='مكتمل').length}</span> مشروعاً عملاقاً!</p></div></div>
                </div>
            )}
{/* --- تبويب فروع الشركة (BRANCHES) --- */}
            {tab === 'branches' && (
                <div className="space-y-6 sm:space-y-12 animate-in fade-in duration-700 text-right">

                    {/* 1. نموذج تأسيس فرع جديد - يظهر للمدير (admin) */}
                    {user?.role === 'admin' && (
                        <section className="bg-white p-5 sm:p-8 lg:p-12 rounded-[2rem] sm:rounded-[3.5rem] shadow-sm border border-slate-100 w-full relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-2 h-full bg-slate-900"></div>
                            <h2 className="text-lg sm:text-2xl font-black mb-6 sm:mb-10 text-slate-800 border-r-8 border-slate-900 pr-4 sm:pr-6 italic uppercase tracking-tighter">
                                🏢 تأسيس مكتب أو فرع جديد للمنظومة
                            </h2>
                            <form onSubmit={async (e) => { 
    e.preventDefault(); 
    try {
        const res = await apiFetch(`/api/branch`, {
            method:'POST',
            body:JSON.stringify(branchForm)
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
}} className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-stretch lg:items-end">
    <input type="text" placeholder="اسم الفرع" value={branchForm.name} onChange={e=>setBranchForm({...branchForm, name: e.target.value})} className="flex-1 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] bg-slate-50 border outline-none font-black w-full" required />
    <input type="text" placeholder="الموقع" value={branchForm.location} onChange={e=>setBranchForm({...branchForm, location: e.target.value})} className="flex-1 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] bg-slate-50 border outline-none font-black w-full" required />
    <button className="bg-slate-900 text-white font-black px-8 sm:px-12 py-4 sm:py-6 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl active:scale-95 transition-all">تأكيد الإضافة</button>
</form>
                        </section>
                    )}

                    {/* 2. شبكة عرض الفروع الحالية */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
                        {branches.map(b => (
                            <div key={b.id} className="bg-white p-5 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] border border-slate-100 flex items-center justify-between group transition-all hover:shadow-[0_30px_60px_rgba(0,0,0,0.05)] hover:-translate-y-2 relative overflow-hidden">
                                <div className="flex items-center gap-4 sm:gap-8 min-w-0">
                                    {/* أيقونة الفرع */}
                                    <div className="w-14 h-14 sm:w-20 sm:h-20 bg-[#111C44] text-white rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center text-2xl sm:text-4xl shadow-xl shadow-indigo-900/20 shrink-0 transform group-hover:rotate-12 transition-transform">
                                        🏢
                                    </div>

                                    {/* معلومات الفرع */}
                                    <div className="min-w-0">
                                        <h4 className="text-lg sm:text-2xl font-black text-slate-800 leading-tight mb-1 sm:mb-2 truncate">
                                            {b.name}
                                        </h4>
                                        <p className="text-slate-400 font-bold mt-1 italic text-xs sm:text-sm truncate">
                                            📍 {b.location || 'لم يحدد الموقع'}
                                        </p>

                                        {/* عدادات ذكية فرعية داخل كرت الفرع */}
                                        <div className="flex flex-wrap gap-2 sm:gap-4 mt-3 sm:mt-4">
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
                                        className="text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 font-black hover:text-red-700 transition-all underline text-xs sm:text-sm shrink-0 pr-2 sm:pr-4"
                                    >
                                        حذف
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* في حال عدم وجود فروع */}
                        {branches.length === 0 && (
                            <div className="col-span-full p-10 sm:p-20 text-center bg-slate-50 rounded-[2.5rem] sm:rounded-[4rem] border-2 border-dashed border-slate-200">
                                <p className="text-lg sm:text-2xl font-black text-slate-400 italic">⚠️ لا توجد فروع مسجلة في النظام حالياً</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            {/* PROJECTS */}
            {tab === 'projects' && (
  <div className="space-y-6 sm:space-y-12 animate-in fade-in duration-500 text-right w-full">
    {/* 1. نموذج تسجيل مشروع جديد */}
    <section className="bg-white p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 w-full text-right">
      <h2 className="text-lg sm:text-xl font-black mb-6 sm:mb-8 text-slate-800 border-r-8 border-indigo-600 pr-4 italic text-right">
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

          const res = await apiFetch(`/api/project`, {
            method: 'POST',
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
      }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 text-right">

        <input type="text" placeholder="اسم المشروع" value={projForm.name}
          onChange={e=>setProjForm({...projForm, name: e.target.value})}
          className="p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all w-full shadow-inner text-right" required />

        <input type="text" placeholder="اسم العميل" value={projForm.client}
          onChange={e=>setProjForm({...projForm, client: e.target.value})}
          className="p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all w-full shadow-inner text-right" required />

        <input type="number" placeholder="الميزانية الكلية" value={projForm.budget}
          onChange={e=>setProjForm({...projForm, budget: e.target.value})}
          className="p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-bold transition-all w-full shadow-inner text-right" required />

        <select value={projForm.branchId} onChange={e=>setProjForm({...projForm, branchId: e.target.value})}
          className="p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 outline-none font-black w-full text-indigo-600 shadow-sm text-right" required>
          <option value="">-- اختر الفرع --</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>

        <button type="submit" className="sm:col-span-2 lg:col-span-4 bg-indigo-600 text-white font-black py-4 sm:py-5 rounded-[2rem] hover:bg-indigo-700 shadow-2xl transition-all text-lg sm:text-xl active:scale-95">
          تأكيد وبدء المشروع
        </button>
      </form>
    </section>

    {/* 2. عرض شبكة المشاريع الحالية */}
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-8 w-full text-right">
      {projects.filter(p => !p.isArchived).map(p => {
        const paid = p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0;
        const taskProgress = p.tasks?.reduce((sum, t) => sum + Number(t.percentage), 0) || 0;

        return (
          <div key={p.id} onClick={() => openProjectDetails(p.id)} className="bg-white p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 hover:shadow-2xl transition-all cursor-pointer group w-full overflow-hidden text-right relative">
            <div className="flex justify-between items-start mb-5 sm:mb-8">
              <span className={`text-[10px] font-black px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl border-2 uppercase tracking-widest transition-all ${getStatusStyle(p.status)}`}>
                {p.status}
              </span>
              <button onClick={(e) => { e.stopPropagation(); deleteItem('project', p.id); }} className="text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 hover:bg-red-50 rounded-xl transition-all">
                🗑️
              </button>
            </div>

            <h4 className="text-lg sm:text-2xl font-black text-slate-800 leading-tight block w-full text-right truncate">{p.name}</h4>
            <p className="text-slate-400 font-bold mb-5 sm:mb-8 mt-2 italic block w-full text-right text-sm truncate">العميل: {p.client}</p>

            {/* شريط الإنجاز الفعلي */}
            <div className="mb-4">
              <p className="text-[8px] font-black text-slate-400 mb-1">نسبة الإنجاز الفعلي للمهام: {taskProgress}%</p>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden shadow-inner">
                <div className="bg-emerald-500 h-full transition-all duration-1000" style={{width: `${taskProgress}%`}}></div>
              </div>
            </div>

            <div className="flex justify-between items-end border-t border-slate-50 pt-4 sm:pt-6 w-full text-right">
              <div className="flex-1 text-right">
                <p className="text-[10px] text-slate-500 font-black uppercase mb-1">الميزانية</p>
                <p className="font-black text-base sm:text-xl">{p.budget.toLocaleString()} د.ع</p>
              </div>
              <div className="text-left text-emerald-600 flex-1">
                <p className="text-[10px] font-black uppercase mb-1">الواصل</p>
                <p className="font-black text-base sm:text-xl">{paid.toLocaleString()} د.ع</p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-10 animate-in fade-in duration-500 text-right">
                    {projects.filter(p => p.isArchived).map(p => (
                        <div key={p.id} className="bg-white p-5 sm:p-10 rounded-[2rem] sm:rounded-[4rem] shadow-xl border-2 border-slate-100 relative overflow-hidden group transition-all hover:scale-[1.02]">

                            {/* خط جانبي رمادي يتحول لأزرق عند التمرير */}
                            <div className="absolute top-0 right-0 w-3 h-full bg-slate-200 group-hover:bg-indigo-500 transition-colors"></div>

                            <div className="flex justify-between items-start mb-4 sm:mb-6 gap-3">
                                <h4 className="text-xl sm:text-3xl font-black text-slate-800 leading-tight truncate px-2">{p.name}</h4>
                                <span className="bg-slate-100 text-slate-500 px-3 sm:px-5 py-1.5 sm:py-2 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-sm shrink-0">مؤرشف 📁</span>
                            </div>

                            <p className="text-slate-400 font-bold text-base sm:text-xl mb-6 sm:mb-10 pr-2 italic truncate">الجهة المستفيدة: {p.client}</p>

                            {/* أزرار التحكم داخل الأرشيف */}
                            <div className="flex flex-col lg:flex-row gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-slate-100">

                                {/* زر الفتح والمراجعة */}
                                <button
                                    onClick={() => openProjectDetails(p.id)}
                                    className="flex-1 bg-[#111C44] text-white py-4 sm:py-5 rounded-[1.5rem] sm:rounded-[2rem] font-black text-sm sm:text-lg shadow-2xl hover:bg-indigo-900 transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                    👁️ عرض الحسابات والمرفقات
                                </button>

                                {/* زر إعادة التنشيط */}
                                <button
                                    onClick={async() => {
    if(window.confirm('هل تريد إعادة هذا المشروع لقائمة المشاريع النشطة؟')) {
        await apiFetch(`/api/project/${p.id}/archive`, { method: 'PATCH' });
        fetchData();
        alert("✅ تمت إعادة المشروع للنشط");
    }
}}
                                    className="bg-emerald-50 text-emerald-600 px-6 sm:px-10 py-4 sm:py-5 rounded-[1.5rem] sm:rounded-[2rem] font-black text-sm sm:text-lg border-2 border-emerald-100 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                    ↩️ إعادة للنشط
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* رسالة في حال كان الأرشيف فارغاً */}
                    {projects.filter(p => p.isArchived).length === 0 && (
                        <div className="col-span-full py-16 sm:py-32 text-center bg-white rounded-[2.5rem] sm:rounded-[5rem] border-4 border-dashed border-slate-100 animate-pulse">
                            <div className="text-6xl sm:text-9xl mb-6 opacity-10">📁</div>
                            <p className="text-lg sm:text-3xl font-black text-slate-400 italic px-4">لا توجد مشاريع مؤرشفة في السجل حالياً</p>
                        </div>
                    )}
                </div>
            )}
            {/* محتوى الموظفين والموردين والفروع (نفس كودك السابق) */}
           {tab === 'employees' && (
    <div className="space-y-5 sm:space-y-8 animate-in zoom-in duration-300 text-right">

        {/* 1. نموذج الإدارة (إضافة وتعديل) */}
        <section className="bg-white p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3.5rem] shadow-sm border border-slate-100 w-full relative">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center mb-6 sm:mb-10 gap-4 sm:gap-6">
                <h2 className="text-lg sm:text-2xl font-black text-slate-800 border-r-8 border-emerald-500 pr-4 italic">
                    👥 إدارة الموظفين والرواتب
                </h2>
                <button onClick={exportPDF} className="bg-indigo-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-[1.5rem] sm:rounded-[2rem] hover:bg-indigo-700 shadow-xl flex items-center justify-center gap-3 font-black text-base sm:text-lg transition-all active:scale-95">
                    📄 سحب التقرير PDF
                </button>
            </div>

            <form onSubmit={handleEmployeeSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-slate-50 p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100">
                <input type="text" placeholder="اسم الموظف" value={empForm.name} onChange={e=>setEmpForm({...empForm, name: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm outline-none text-right" required />
                <input type="text" placeholder="المنصب" value={empForm.position} onChange={e=>setEmpForm({...empForm, position: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm outline-none text-right" required />
                <input type="number" placeholder="الراتب (د.ع)" value={empForm.salary} onChange={e=>setEmpForm({...empForm, salary: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-white border-none font-bold w-full shadow-sm outline-none text-right" required />

                <select value={empForm.branchId} onChange={e=>setEmpForm({...empForm, branchId: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-white border-2 border-indigo-100 font-black text-indigo-600 outline-none shadow-sm w-full" required>
                    <option value="">-- اختر الفرع --</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>

                <button type="submit" className={`py-4 sm:py-5 rounded-2xl font-black text-white shadow-xl transition-all text-base sm:text-lg ${editingEmployeeId ? 'bg-indigo-600 shadow-indigo-200' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                    {editingEmployeeId ? '🔄 تحديث البيانات' : 'حفظ الموظف +'}
                </button>
            </form>
        </section>

        {/* 2. مكتب صرف الرواتب (تم إصلاح اللون الأبيض) */}
        <section className="flex justify-center my-6 sm:my-10">
            <div className="bg-[#111C44] p-5 sm:p-10 rounded-[2rem] sm:rounded-[3.5rem] shadow-2xl w-full max-w-3xl border-4 border-amber-400 text-center">
                <h3 className="text-lg sm:text-2xl font-black mb-5 sm:mb-8 italic text-white">💵 مكتب صرف الرواتب المركزي</h3>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center">
                    <select
                        value={payEmpId}
                        className="p-4 sm:p-5 rounded-2xl bg-white text-[#111C44] font-black outline-none w-full sm:w-72 shadow-lg"
                        onChange={(e) => setPayEmpId(e.target.value)}
                    >
                        <option value="">-- اختر الموظف للصرف --</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                    <input
                        type="number"
                        placeholder="المبلغ (د.ع)"
                        value={salaryPayAmount}
                        onChange={(e)=>setSalaryPayAmount(e.target.value)}
                        className="p-4 sm:p-5 rounded-2xl bg-white text-[#111C44] font-black outline-none w-full sm:w-40 text-center shadow-lg"
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
                return alert(`❌ غير مقبول! المبلغ المدخل (${enteredAmount} د.ع) يتجاوز المتبقي لهذا الموظف (${remaining} د.ع)`);
            }
        }

        // 5. إذا كان المبلغ سليماً، يتم التنفيذ
        await handleSalaryPayment(payEmpId);
        setPayEmpId(''); // تصفير الاختيار
        setSalaryPayAmount(''); // تصفير المبلغ
        alert("✅ تم صرف المبلغ بنجاح ضمن حدود الراتب");
    }}
    className="bg-amber-400 text-[#111C44] px-8 sm:px-12 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl hover:bg-white transition-all active:scale-95 shadow-xl w-full sm:w-auto"
>
    تأكيد الدفع 💸
</button>
                </div>
            </div>
        </section>

        {/* 3. الجدول الرئيسي (إصلاح الـ Enter والمسافات) */}
        <div className="bg-white p-3 sm:p-4 lg:p-8 rounded-[2rem] sm:rounded-[4rem] shadow-2xl border border-slate-100 overflow-x-auto">
            <table className="w-full text-right border-separate border-spacing-y-3 sm:border-spacing-y-4 min-w-[820px]">
                <thead className="text-slate-400 text-[12px] font-black uppercase italic">
                    <tr>
                        <th className="p-4">الموظف</th>
                        {['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'].map(d => (
                            <th key={d} className="text-center">{d}</th>
                        ))}
                        <th className="text-center min-w-[280px]">جدول الحسابات المالي (د.ع)</th>
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
                                        <div className="flex-1 flex flex-col min-w-[60px]"><span className="text-[9px] text-slate-500 font-black">الشهري</span><span className="text-sm text-slate-700 font-black">{emp.salary.toLocaleString()} د.ع</span></div>
                                        <div className="w-[1px] h-8 bg-slate-200 mx-1"></div>
                                        <div className="flex-1 flex flex-col min-w-[60px]"><span className="text-[9px] text-emerald-500 font-black">الواصل</span><span className="text-sm text-emerald-600 font-black">{totalPaid.toLocaleString()} د.ع</span></div>
                                        <div className="w-[1px] h-8 bg-slate-200 mx-1"></div>
                                        <div className="flex-1 flex flex-col min-w-[60px]"><span className="text-[9px] text-red-500 font-black">المتبقي</span><span className="text-sm text-red-600 font-black">{(emp.salary - totalPaid).toLocaleString()} د.ع</span></div>
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
                <div className="space-y-8 sm:space-y-12 animate-in fade-in duration-500 text-right">
                  <section className="bg-white p-5 sm:p-8 lg:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 w-full text-right">
                    <h2 className="text-lg sm:text-xl font-black mb-6 sm:mb-8 text-slate-800 border-r-8 border-[#111C44] pr-4 italic text-right">🤝 إضافة مورد جديد</h2>
                    <form onSubmit={async (e) => { e.preventDefault(); await apiFetch(`/api/suppliers`, {method:'POST', body:JSON.stringify(supForm)}); setSupForm({name:'', phone:'', address:''}); fetchData(); }} className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-right">
                      <input type="text" placeholder="اسم المورد" value={supForm.name} onChange={e=>setSupForm({...supForm, name: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-slate-50 font-bold shadow-inner text-right outline-none w-full" required />
                      <input type="text" placeholder="رقم الهاتف" value={supForm.phone} onChange={e=>setSupForm({...supForm, phone: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-slate-50 font-bold shadow-inner text-right outline-none w-full" />
                      <input type="text" placeholder="العنوان" value={supForm.address} onChange={e=>setSupForm({...supForm, address: e.target.value})} className="p-4 sm:p-5 rounded-2xl bg-slate-50 font-bold shadow-inner text-right outline-none w-full" />
                      <button className="sm:col-span-3 bg-[#111C44] text-white font-black py-4 sm:py-5 rounded-2xl text-base sm:text-lg shadow-xl hover:bg-indigo-900 transition-all active:scale-95">حفظ البيانات</button>
                    </form>
                  </section>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8">
                    {suppliers.map(s => { const debt = s.materials?.reduce((sum, m) => sum + m.price, 0) || 0; return (
                      <div key={s.id} className="bg-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] border border-slate-100 group relative shadow-sm text-right">
                        <button onClick={() => deleteItem('suppliers', s.id)} className="absolute top-5 left-5 sm:top-8 sm:left-8 text-red-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 hover:bg-red-50 rounded-xl transition-all">🗑️</button>
                        <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100 rounded-3xl flex items-center justify-center text-2xl sm:text-3xl mb-4 sm:mb-6 shadow-inner">🤝</div>
                        <h4 className="text-xl sm:text-2xl font-black text-slate-800 mb-2 truncate pl-8">{s.name}</h4>
                        <p className="text-slate-400 font-bold italic mb-4 sm:mb-6 text-sm">📞 {s.phone || 'بدون هاتف'}</p>
                        <div className="pt-4 sm:pt-6 border-t border-slate-50">
                          <p className="text-[10px] text-red-400 font-black uppercase">إجمالي المديونية</p>
                          <p className="text-xl sm:text-2xl lg:text-3xl font-black text-red-600">{debt.toLocaleString()} د.ع</p>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
            )}
        </div>
        {tab === 'finances' && user?.role === 'admin' && (
    <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-700 text-right">
        {/* ملخص الأرقام الكبرى */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
            <div className="bg-emerald-600 p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] text-white shadow-2xl">
                <p className="text-xs font-black opacity-80 uppercase">صافي أرباح المشاريع</p>
                <h3 className="text-2xl sm:text-4xl font-black break-words">
                    {projects.reduce((acc, p) => {
                        const rec = p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0;
                        const spent = (p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0);
                        return acc + (rec - spent);
                    }, 0).toLocaleString()} د.ع
                </h3>
            </div>
            <div className="bg-red-600 p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] text-white shadow-2xl">
                <p className="text-xs font-black opacity-80 uppercase">إجمالي الرواتب المدفوعة</p>
                <h3 className="text-2xl sm:text-4xl font-black break-words">
                    {employees.reduce((acc, emp) => acc + (emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0), 0).toLocaleString()} د.ع
                </h3>
            </div>
            <div className="bg-[#111C44] p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] text-white shadow-2xl border-4 border-amber-400">
                <p className="text-xs font-black opacity-80 uppercase text-amber-400">الربح النهائي للشركة</p>
                <h3 className="text-3xl sm:text-5xl font-black break-words">
                    {(
                        projects.reduce((acc, p) => acc + ((p.payments?.reduce((s, pay) => s + pay.amount, 0) || 0) - ((p.expenses?.reduce((s, ex) => s + ex.amount, 0) || 0) + (p.materials?.reduce((s, m) => s + m.price, 0) || 0))), 0) -
                        employees.reduce((acc, emp) => acc + (emp.salaryPayments?.reduce((s, p) => s + p.amount, 0) || 0), 0) -
                        officeExpenses.reduce((acc, oe) => acc + oe.amount, 0)
                    ).toLocaleString()} د.ع
                </h3>
            </div>
        </div>

        {/* نموذج إضافة مصاريف المقر */}
       <section className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border">
    <h2 className="text-lg sm:text-xl font-black mb-4 sm:mb-6 border-r-8 border-red-500 pr-4 italic">🏢 تسجيل مصاريف المقر الرئيسي (إيجار، كهرباء، إلخ)</h2>
    <form onSubmit={async (e) => {
        e.preventDefault();
        await apiFetch(`/api/office-expenses`, {
            method:'POST',
            body:JSON.stringify(offExpForm)
        });
        setOffExpForm({description:'', amount:''});
        fetchData();
        alert("✅ تم تسجيل مصروف المقر وخصمه من الأرباح");
    }} className="flex flex-col sm:flex-row gap-3 sm:gap-4">
        <input type="text" placeholder="وصف المصروف..." value={offExpForm.description} onChange={e=>setOffExpForm({...offExpForm, description: e.target.value})} className="flex-1 p-4 sm:p-5 rounded-2xl bg-slate-50 font-bold text-right w-full" required />
        <input type="number" placeholder="المبلغ" value={offExpForm.amount} onChange={e=>setOffExpForm({...offExpForm, amount: e.target.value})} className="sm:w-48 p-4 sm:p-5 rounded-2xl bg-slate-50 font-bold text-right w-full" required />
        <button className="bg-red-500 text-white font-black px-6 sm:px-10 py-4 sm:py-5 rounded-2xl shadow-xl active:scale-95 transition-all">خصم من الأرباح</button>
    </form>
</section>
    </div>
)}
        {/* --- تبويب إعدادات النظام (SETTINGS) --- */}
        {tab === 'settings' && (
            <div className="space-y-6 sm:space-y-10 animate-in fade-in duration-700 text-right">

                {/* رأس الصفحة */}
                <div className="flex items-center gap-4 sm:gap-6">
                    <div className="w-14 h-14 sm:w-20 sm:h-20 bg-[#111C44] rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center text-3xl sm:text-4xl shadow-xl shadow-indigo-900/10 shrink-0">⚙️</div>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-3xl font-black text-slate-900 italic truncate">إعدادات النظام</h1>
                        <p className="text-slate-500 font-bold text-xs sm:text-base truncate">إدارة أمان الحساب والمستخدمين المصرّح لهم بالدخول لشركتك</p>
                    </div>
                </div>

                {/* شريط معلومات سريع */}
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                    <div className="bg-white p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 min-w-0">
                        <p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-widest mb-2 truncate">اسم الشركة</p>
                        <h3 className="text-base sm:text-2xl font-black text-slate-900 truncate">{companyInfo?.name || '...'}</h3>
                    </div>
                    <div className="bg-white p-4 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] shadow-sm border border-slate-100 min-w-0">
                        <p className="text-slate-400 text-[10px] sm:text-xs font-black uppercase tracking-widest mb-2 truncate">عدد المستخدمين</p>
                        <h3 className="text-lg sm:text-3xl font-black text-indigo-600">{companyUsers.length || '—'}</h3>
                    </div>
                </div>

                {/* الشبكة الرئيسية */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 items-start">

                    {/* --- تغيير رمز دخول المدير + مفتاح الاسترجاع --- */}
                    <div className="lg:col-span-2 space-y-6 sm:space-y-8">
                    <section className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 w-full">
                        <div className="flex items-center gap-3 sm:gap-4 mb-2">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-xl sm:text-2xl shrink-0">🔒</div>
                            <h2 className="text-base sm:text-xl font-black text-slate-900 italic">رمز دخول المدير</h2>
                        </div>
                        <p className="text-slate-500 font-bold text-xs sm:text-sm mb-6 sm:mb-8">
                            يُستخدم لفتح الأقسام الإدارية (الرئيسية، الفروع، الأرباح، الأرشيف، الإعدادات).
                        </p>
                        {!isOwnerUser ? (
                            <div className="bg-amber-50 border border-amber-100 text-amber-700 font-bold text-sm p-5 rounded-2xl text-center">
                                🔒 تغيير رمز الدخول متاح فقط لصاحب الشركة الأصلي
                            </div>
                        ) : (
                        <form onSubmit={handleChangePin} className="space-y-4">
                            <input
                                type="password"
                                pattern="[0-9]*"
                                inputMode="numeric"
                                placeholder="الرمز الحالي"
                                value={pinChangeForm.current}
                                onChange={e => setPinChangeForm({ ...pinChangeForm, current: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-black text-lg tracking-widest text-right transition-all"
                                required
                            />
                            <input
                                type="password"
                                pattern="[0-9]*"
                                inputMode="numeric"
                                placeholder="الرمز الجديد"
                                value={pinChangeForm.next}
                                onChange={e => setPinChangeForm({ ...pinChangeForm, next: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-black text-lg tracking-widest text-right transition-all"
                                required
                            />
                            <input
                                type="password"
                                pattern="[0-9]*"
                                inputMode="numeric"
                                placeholder="تأكيد الرمز الجديد"
                                value={pinChangeForm.confirm}
                                onChange={e => setPinChangeForm({ ...pinChangeForm, confirm: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white outline-none font-black text-lg tracking-widest text-right transition-all"
                                required
                            />
                            <button type="submit" className="w-full bg-indigo-600 text-white font-black py-4 sm:py-5 rounded-[1.5rem] sm:rounded-2xl hover:bg-indigo-700 shadow-xl transition-all text-base sm:text-lg active:scale-95">
                                حفظ الرمز الجديد
                            </button>
                        </form>
                        )}
                    </section>

                    {/* --- مفتاح استرجاع كلمة السر --- */}
                    <section className="bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 w-full">
                        <div className="flex items-center gap-3 sm:gap-4 mb-2">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-cyan-50 rounded-2xl flex items-center justify-center text-xl sm:text-2xl shrink-0">🔑</div>
                            <h2 className="text-base sm:text-xl font-black text-slate-900 italic">مفتاح استرجاع كلمة السر</h2>
                        </div>
                        <p className="text-slate-500 font-bold text-xs sm:text-sm mb-6 sm:mb-8">
                            يُستخدم من نافذة "نسيت كلمة السر" بشاشة الدخول لأي مستخدم بشركتك.
                        </p>
                        {!isOwnerUser ? (
                            <div className="bg-amber-50 border border-amber-100 text-amber-700 font-bold text-sm p-5 rounded-2xl text-center">
                                🔒 تغيير مفتاح الاسترجاع متاح فقط لصاحب الشركة الأصلي
                            </div>
                        ) : (
                        <form onSubmit={handleChangeRecoveryKey} className="space-y-4">
                            <input
                                type="text"
                                placeholder="المفتاح الحالي (اتركه فارغ لو أول مرة)"
                                value={recoveryKeyChangeForm.current}
                                onChange={e => setRecoveryKeyChangeForm({ ...recoveryKeyChangeForm, current: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-cyan-500 focus:bg-white outline-none font-black text-right transition-all"
                            />
                            <input
                                type="text"
                                placeholder="المفتاح الجديد"
                                value={recoveryKeyChangeForm.next}
                                onChange={e => setRecoveryKeyChangeForm({ ...recoveryKeyChangeForm, next: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-cyan-500 focus:bg-white outline-none font-black text-right transition-all"
                                required
                            />
                            <input
                                type="text"
                                placeholder="تأكيد المفتاح الجديد"
                                value={recoveryKeyChangeForm.confirm}
                                onChange={e => setRecoveryKeyChangeForm({ ...recoveryKeyChangeForm, confirm: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-transparent focus:border-cyan-500 focus:bg-white outline-none font-black text-right transition-all"
                                required
                            />
                            <button type="submit" className="w-full bg-cyan-600 text-white font-black py-4 sm:py-5 rounded-[1.5rem] sm:rounded-2xl hover:bg-cyan-700 shadow-xl transition-all text-base sm:text-lg active:scale-95">
                                حفظ المفتاح الجديد
                            </button>
                        </form>
                        )}
                    </section>
                    </div>

                    {/* --- إدارة مستخدمي الشركة --- */}
                    <section className="lg:col-span-3 bg-white p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] shadow-sm border border-slate-100 w-full">
                        <div className="flex items-center gap-3 sm:gap-4 mb-2">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-xl sm:text-2xl shrink-0">👥</div>
                            <h2 className="text-base sm:text-xl font-black text-slate-900 italic">مستخدمو الشركة</h2>
                        </div>
                        <p className="text-slate-500 font-bold text-xs sm:text-sm mb-6 sm:mb-8">
                            أضف حسابات دخول لموظفينك (كل حساب يدخل النظام ببريده وكلمة سره الخاصة، ويشوف نفس بيانات شركتك بالضبط).
                        </p>

                        {/* قائمة المستخدمين الحاليين */}
                        <div className="space-y-3 mb-6 sm:mb-8">
                            {companyUsers.map(u => (
                                <div key={u.id} className={`p-3 sm:p-4 rounded-2xl ${u.isOwner ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50'}`}>
                                    <div className="flex items-center gap-3 sm:gap-4">
                                        <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-white text-sm sm:text-base font-black shrink-0 ${u.isOwner ? 'bg-amber-500' : 'bg-indigo-600'}`}>
                                            {u.name?.trim()?.charAt(0)?.toUpperCase() || '?'}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-black text-slate-800 truncate flex items-center gap-2">
                                                {u.name}
                                                {u.isOwner && <span title="صاحب الشركة الأصلي" className="text-amber-500 shrink-0">⭐</span>}
                                                {u.id === user?.id && <span className="text-emerald-600 bg-emerald-50 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">أنت</span>}
                                            </p>
                                            <p className="text-slate-500 font-bold text-xs sm:text-sm truncate">{u.email}</p>
                                        </div>
                                        {isOwnerUser && !u.isOwner && u.id !== user?.id && (
                                            <button
                                                onClick={() => handleDeleteCompanyUser(u.id)}
                                                className="text-red-500 p-2 sm:p-2.5 hover:bg-red-50 rounded-xl transition-all shrink-0"
                                                title="حذف المستخدم"
                                            >
                                                🗑️
                                            </button>
                                        )}
                                    </div>

                                    {/* صلاحيات المستخدم - المالك فقط يقدر يعدّلها، محصّن على نفسه */}
                                    {!u.isOwner && (
                                        <div className="flex flex-wrap gap-2 mt-3 pr-0 sm:pr-14">
                                            {[
                                                { key: 'canAdd', label: 'إضافة' },
                                                { key: 'canEdit', label: 'تعديل' },
                                                { key: 'canDelete', label: 'حذف' },
                                            ].map(p => (
                                                <button
                                                    key={p.key}
                                                    type="button"
                                                    disabled={!isOwnerUser}
                                                    onClick={() => handleUpdateUserPermission(u.id, p.key, !u[p.key])}
                                                    className={`text-[11px] sm:text-xs font-black px-3 py-1.5 rounded-full transition-all shrink-0 ${
                                                        u[p.key]
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-red-100 text-red-600'
                                                    } ${isOwnerUser ? 'cursor-pointer hover:opacity-80 active:scale-95' : 'cursor-default opacity-80'}`}
                                                >
                                                    {u[p.key] ? '✓' : '✕'} {p.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {companyUsers.length === 0 && (
                                <p className="text-center text-slate-400 font-bold text-sm py-4 italic">جاري التحميل...</p>
                            )}
                        </div>

                        {/* فورم إضافة مستخدم جديد - يقتصر على مالك الشركة */}
                        {!isOwnerUser ? (
                            <div className="bg-amber-50 border border-amber-100 text-amber-700 font-bold text-sm p-5 rounded-2xl text-center">
                                🔒 إضافة مستخدمين جدد متاحة فقط لصاحب الشركة الأصلي
                            </div>
                        ) : (
                        <form onSubmit={handleAddCompanyUser} className="space-y-4 bg-slate-50 p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest">إضافة مستخدم جديد</p>
                            <input
                                type="text"
                                placeholder="الاسم الكامل"
                                value={newUserForm.name}
                                onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                className="w-full p-4 sm:p-5 rounded-2xl bg-white border-2 border-transparent focus:border-emerald-500 outline-none font-bold text-right transition-all"
                                required
                            />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <input
                                    type="email"
                                    autoComplete="off"
                                    placeholder="البريد الإلكتروني"
                                    value={newUserForm.email}
                                    onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                    className="w-full p-4 sm:p-5 rounded-2xl bg-white border-2 border-transparent focus:border-emerald-500 outline-none font-bold text-right transition-all"
                                    required
                                />
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    placeholder="كلمة السر"
                                    value={newUserForm.password}
                                    onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                    className="w-full p-4 sm:p-5 rounded-2xl bg-white border-2 border-transparent focus:border-emerald-500 outline-none font-bold text-right transition-all"
                                    required
                                />
                            </div>
                            <div className="px-1 -mt-2"><PasswordStrengthHint password={newUserForm.password} /></div>
                            <button type="submit" disabled={!checkPasswordStrength(newUserForm.password).valid} className="w-full bg-emerald-600 text-white font-black py-4 sm:py-5 rounded-[1.5rem] sm:rounded-2xl hover:bg-emerald-700 shadow-xl transition-all text-base sm:text-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                                إضافة المستخدم +
                            </button>
                        </form>
                        )}
                    </section>
                </div>
            </div>
        )}
      </main>

      {/* --- MODAL المطور بالمهام الجديدة --- */}
      {selectedProject && (
        
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-0 sm:p-6 z-50 overflow-y-auto">
            <div className="bg-white w-full max-w-7xl min-h-screen sm:min-h-0 rounded-none sm:rounded-[3rem] lg:rounded-[4rem] shadow-2xl overflow-hidden my-auto animate-in zoom-in duration-300 border border-white/20">
                <header className="bg-[#111C44] p-5 sm:p-8 lg:p-12 text-white flex justify-between items-center shrink-0 relative overflow-hidden text-right">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 opacity-10 rounded-full -mr-32 -mt-32"></div>
                    <div className="min-w-0 flex-1 z-10 text-right"><div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-3 sm:mb-4"><span className={`text-[10px] sm:text-sm font-black px-3 sm:px-6 py-1.5 sm:py-2 rounded-xl border-2 uppercase tracking-widest transition-all ${getStatusStyle(selectedProject.status)}`}>{selectedProject.status}</span> <button onClick={exportProjectReportPDF} className="bg-white/10 hover:bg-indigo-600 px-3 sm:px-6 py-2 sm:py-3 rounded-2xl text-[10px] sm:text-xs font-black shadow-lg flex items-center gap-2 sm:gap-3 border border-white/20 transition-all active:scale-95">📄 كشف حساب PDF</button></div><h2 className="text-xl sm:text-4xl lg:text-5xl font-black leading-tight block w-full truncate">{selectedProject.name}</h2><p className="text-indigo-100 text-sm sm:text-2xl font-bold mt-2 opacity-90 italic block w-full truncate">العميل: {selectedProject.client}</p></div>
                    <button onClick={() => setSelectedProject(null)} className="w-9 h-9 sm:w-16 sm:h-16 bg-white/10 hover:bg-red-500 rounded-full flex items-center justify-center text-base sm:text-3xl transition-all mr-3 sm:mr-8 z-10 shadow-lg shrink-0">✕</button>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-4 h-full text-right">
                    <div className="bg-slate-50 p-4 sm:p-8 lg:p-10 border-l border-slate-200 space-y-5 sm:space-y-8 lg:h-[650px] overflow-y-auto shadow-inner text-right">
                        {(() => { const received = selectedProject.payments?.reduce((s, p) => s + p.amount, 0) || 0; const spent = (selectedProject.expenses?.reduce((s, p) => s + p.amount, 0) || 0) + (selectedProject.materials?.reduce((s, p) => s + p.price, 0) || 0); const currentLiquidity = received - spent; return (<div className={`p-5 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border-4 text-center shadow-2xl transition-all ${currentLiquidity <= 0 ? 'bg-red-50 border-red-500 animate-pulse' : 'bg-emerald-50 border-emerald-500'}`}><p className="text-xs font-black text-slate-500 mb-2 uppercase tracking-widest">السيولة المتاحة للعمل الآن</p><h3 className={`text-2xl sm:text-4xl font-black ${currentLiquidity <= 0 ? 'text-red-600' : 'text-emerald-600'}`}>{currentLiquidity.toLocaleString()} د.ع</h3><p className="text-xs mt-3 font-black italic">{currentLiquidity <= 0 ? '⚠️ توقف! أنت تصرف من جيبك' : '✅ العمل مستمر ضمن السيولة'}</p></div>); })()}<div className="space-y-3 sm:space-y-4 text-right"><div className="bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right w-full block">ميزانية العقد الكلية</p><p className="text-lg sm:text-2xl font-black text-slate-900">{selectedProject.budget.toLocaleString()} د.ع</p></div><div className="bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 text-center shadow-sm"><p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-right w-full block">المتبقي بذمة العميل</p><p className="text-lg sm:text-2xl font-black text-amber-600">{(selectedProject.budget - (selectedProject.payments?.reduce((s,p)=>s+p.amount,0)||0)).toLocaleString()} د.ع</p></div></div><div className="space-y-3 pt-4 border-t text-right"><p className="text-xs font-black text-slate-500 px-4 uppercase tracking-widest text-center">تحديث حالة المشروع</p>{['قيد التنفيذ', 'مكتمل', 'متوقف', 'ملغي'].map(st => (<button key={st} onClick={()=>updateProjectStatus(st)} className={`w-full p-4 sm:p-5 rounded-2xl text-sm font-black transition-all border-2 flex items-center justify-between ${selectedProject.status===st ? 'bg-[#111C44] text-white border-[#111C44] shadow-xl scale-105' : 'bg-white text-slate-400 border-slate-100 hover:border-indigo-200'}`}><span>{st}</span><span>{st === 'قيد التنفيذ' ? '🔵' : st === 'مكتمل' ? '🟢' : st === 'متوقف' ? '🟡' : '🔴'}</span></button>))}</div>
                        {/* زر الأرشفة للمدير فقط */}
{user?.role === 'admin' && (
   <button
    onClick={async() => {
    if(window.confirm('هل تريد نقل هذا المشروع إلى الأرشيف؟')){
        try {
            const res = await apiFetch(`/api/project/${selectedProject.id}/archive`, {
                method: 'PATCH',
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
    className="w-full p-3 sm:p-4 rounded-2xl bg-slate-200 text-slate-700 font-black text-xs mt-4 hover:bg-slate-300 transition-all"
>
    📁 نقل المشروع إلى الأرشيف
</button>
)}</div>


                    <div className="lg:col-span-3 p-4 sm:p-6 lg:p-12 lg:h-[650px] overflow-y-auto min-w-0 text-right"><div className="flex gap-2 sm:gap-4 mb-6 sm:mb-10 bg-slate-100/50 p-2 sm:p-3 rounded-2xl sm:rounded-3xl w-full border border-slate-200 text-right overflow-x-auto no-scrollbar">
                        {[{id:'payments',l:'💰 سجل الأقساط'}, {id:'expenses',l:'💸 المصاريف'}, {id:'materials',l:'🧱 المواد'}, {id:'attachments',l:'📁 المرفقات'}, {id:'tasks',l:'📝 مراحل الإنجاز'}].map(t=>(<button key={t.id} onClick={()=>setModalTab(t.id)} className={`shrink-0 py-2.5 px-4 sm:py-4 sm:px-10 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm transition-all shadow-sm ${modalTab===t.id ? 'bg-[#111C44] text-white scale-105 shadow-xl' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}>{t.l}</button>))}</div>

                        {/* [جديد] تبويب المهام ومراحل الإنجاز */}
                        {modalTab === 'tasks' && (
                            <div className="space-y-8 animate-in fade-in duration-500 text-right">
                                <form onSubmit={(e)=>{ e.preventDefault(); handleAddOrUpdateSubItem('tasks', taskForm, ()=>setTaskForm({description:'', percentage:''})); }} className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 bg-slate-50 p-4 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border border-slate-200">
                                    <input type="text" placeholder="اسم المرحلة (مثلاً: صب الأعمدة)" value={taskForm.description} onChange={e=>setTaskForm({...taskForm, description:e.target.value})} className="md:col-span-1 p-5 rounded-[2rem] bg-white border-none outline-none font-bold text-right" required />
                                    <input type="number" placeholder="وزن المرحلة % (مثلاً 20)" value={taskForm.percentage} onChange={e=>setTaskForm({...taskForm, percentage:e.target.value})} className="p-5 rounded-[2rem] bg-white border-none outline-none font-bold text-right" required />
                                    <button className="bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl hover:bg-indigo-700">إضافة مرحلة عمل +</button>
                                </form>
                                <div className="border-2 rounded-[2rem] sm:rounded-[3rem] overflow-x-auto bg-white shadow-sm">
                                    <table className="w-full text-right min-w-[560px]"><thead className="bg-slate-50 text-xs font-black border-b-2"><tr><th className="p-6">المرحلة</th><th className="p-6">النسبة</th><th className="p-6">الحالة</th><th className="p-6">خيارات</th></tr></thead>
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
                        {modalTab === 'payments' && ( <div className="space-y-8 animate-in fade-in duration-300 text-right"><form onSubmit={(e)=>{e.preventDefault(); handleAddOrUpdateSubItem('payment', {amount: payAmount}, ()=>setPayAmount(''))}} className="flex flex-col sm:flex-row gap-4 bg-emerald-50 p-4 sm:p-6 rounded-[2rem] sm:rounded-[3rem] border border-emerald-100 shadow-sm text-right"><input type="number" placeholder="أدخل مبلغ القسط..." value={payAmount} onChange={e=>setPayAmount(e.target.value)} className="flex-1 p-4 sm:p-5 rounded-[2rem] bg-white border-none outline-none font-black text-xl sm:text-2xl text-emerald-700 text-right shadow-inner w-full" required /><button className="bg-emerald-600 text-white px-6 sm:px-10 py-4 sm:py-5 rounded-[2rem] font-black text-base sm:text-lg shadow-xl hover:bg-emerald-700 active:scale-95 transition-all">تثبيت القسط +</button></form><div className="border-2 border-slate-50 rounded-[2rem] sm:rounded-[3rem] overflow-x-auto bg-white shadow-sm text-right"><table className="w-full text-right min-w-[420px]"><thead className="bg-slate-50 text-sm font-black text-slate-500 uppercase tracking-widest border-b-2 text-right"><tr><th className="p-6">المبلغ المستلم</th><th className="p-6 text-center">التاريخ والوقت</th></tr></thead><tbody className="font-black text-xl text-right text-right">{selectedProject.payments?.map(p => (<tr key={p.id} className="border-b border-slate-50 hover:bg-emerald-50/20 transition-all italic"><td className="p-6 text-emerald-600 text-right">+{p.amount.toLocaleString()} د.ع</td><td className="p-6 text-center text-slate-400 font-bold text-sm text-right">{new Date(p.date).toLocaleString('ar-EG')}</td></tr>))}</tbody></table></div></div> )}
                        {/* (بقية كود المصاريف والمواد والمرفقات مستمرة هنا بنفس الترتيب)... */}
{/* --- محتوى تبويب المصاريف --- */}
                       {modalTab === 'expenses' && (
    <div className="space-y-8 animate-in fade-in duration-300 text-right">
        {/* 1. نموذج تسجيل مصروف جديد */}
        <form onSubmit={(e)=>{e.preventDefault(); handleAddOrUpdateSubItem('expense', expForm, ()=>setExpForm({description:'', amount:''}))}}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-red-50 p-4 sm:p-6 rounded-[2rem] sm:rounded-[3rem] border border-red-100 shadow-sm">
            
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
        <div className="border-2 border-slate-50 rounded-[2rem] sm:rounded-[3rem] overflow-x-auto bg-white shadow-sm">
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
                            <td className="p-6 text-slate-500 text-sm font-bold">{index + 1}</td>
                            <td className="p-6 text-slate-700">{ex.description}</td>
                            <td className="p-6 text-left text-red-500">-{ex.amount.toLocaleString()} د.ع</td>
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
                            <td colSpan="5" className="p-16 text-center text-slate-400 font-bold italic text-xl">
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
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 bg-amber-50 p-4 sm:p-8 rounded-[2rem] sm:rounded-[3rem] border border-amber-200 shadow-lg">
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
        <div className="border-2 border-slate-50 rounded-[2rem] sm:rounded-[3rem] overflow-x-auto bg-white shadow-sm">
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
                            <td className="p-6 text-left text-amber-700">-{m.price.toLocaleString()} د.ع</td>
                            <td className="p-6">
                                <div className="flex justify-center gap-3">
                                    <button onClick={()=>startEditMaterial(m)} className="p-2 text-indigo-600 hover:scale-125 transition-transform">✏️</button>
                                    <button onClick={()=>deleteItem('material', m.id)} className="p-2 text-red-500 hover:scale-125 transition-transform">🗑️</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    {(!selectedProject.materials || selectedProject.materials.length === 0) && (
                        <tr><td colSpan="5" className="p-16 text-center text-slate-400 font-bold italic text-xl">🧱 لا توجد مواد مسجلة لهذا المشروع</td></tr>
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
    <div className="fixed inset-0 bg-[#111C44]/95 backdrop-blur-xl z-[9999] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-md p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-2xl text-center">
            <div className="text-4xl sm:text-5xl mb-4 sm:mb-6">🔒</div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 mb-2">قسم المدير فقط</h3>
            <p className="text-slate-400 font-bold mb-6 sm:mb-8 text-sm">يرجى إدخال رمز الأمان للوصول</p>

            <form onSubmit={handlePinSubmit} className="space-y-5 sm:space-y-6">
                  {/* هنا يوضع الكود الذي سألت عنه بالضبط 👇 */}
                <input
                    type="password"
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="****"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="w-full text-center text-3xl sm:text-4xl tracking-[0.6rem] sm:tracking-[1rem] p-4 sm:p-5 rounded-3xl bg-slate-50 border-2 border-slate-100 outline-none focus:border-indigo-600 font-black transition-all"
                    autoFocus
                />
                <div className="flex gap-3 sm:gap-4">
                    <button type="submit" className="flex-1 bg-indigo-600 text-white py-4 sm:py-5 rounded-2xl font-black text-base sm:text-lg shadow-xl active:scale-95">فتح القفل</button>
                    <button type="button" onClick={() => setShowPinModal(false)} className="flex-1 bg-slate-100 text-slate-400 py-4 sm:py-5 rounded-2xl font-black text-base sm:text-lg active:scale-95">إلغاء</button>
                </div>
            </form>
        </div>
    </div>
)}
      
    </div>
    
  );
  
}


export default App;