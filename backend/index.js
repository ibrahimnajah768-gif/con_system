const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // مكتبة تشفير الباسورد
const jwt = require('jsonwebtoken'); // مكتبة التوكن
const authenticateToken = require('./middleware/auth');

const prisma = new PrismaClient();
const app = express();

// 1. تحديث الـ CORS للسماح للموبايل
// السماح الشامل لكل المصادر لضمان عمل تطبيق الموبايل
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
// أضف هذا السطر تحت app.use(cors()) مباشرة
app.use((req, res, next) => {
    console.log(`🚀 طلب واصل من جهاز: ${req.ip} للمسار: ${req.url}`);
    next();
});

// 2. أضف هذا الكود (المراقب) تحت سطر الـ CORS مباشرة
// وظيفته: يطبع لك في الشاشة السوداء أي جهاز يحاول الاتصال بك هسة
app.use((req, res, next) => {
    console.log(`📡 طلب جديد من: ${req.ip} - المسار: ${req.url}`);
    next();
});
app.use(express.json());

// --- إعداد مجلد المرفقات ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ==========================================
// --- نظام تسجيل الدخول (AUTHENTICATION) ---
// ==========================================
// ملاحظتين مهمتين لتعدد الشركات (multi-tenant):
// ١. كل تسجيل حساب جديد ينشئ شركة (tenant) جديدة تماماً + فرع افتراضي +
//    مستخدم مدير لها، فيصير كل زبون معزول تلقائياً من أول لحظة.
// ٢. التوكن (JWT) يحمل companyId، وهذا هو الأساس اللي كل مسار بالأسفل
//    يعتمد عليه لفلترة البيانات - أبداً ما نثق بـ companyId لو انبعث من المتصفح.

const signToken = (user) => jwt.sign(
    { userId: user.id, role: user.role, companyId: user.companyId },
    process.env.JWT_SECRET || 'secret_key',
    { expiresIn: '24h' }
);

// قوة كلمة السر عند إنشاء حساب جديد (تأسيس شركة أو إضافة مستخدم داخل
// شركة): 8 أحرف على الأقل، وتحتوي حرف ورقم ورمز - نفس الشرط يتحقق منه
// الفرونت إند حياً، بس هذا هو التحقق الحقيقي اللي ما يُتجاوز.
const isStrongPassword = (pw) => {
    if (!pw || pw.length < 8) return false;
    if (!/[a-zA-Z]/.test(pw)) return false;
    if (!/[0-9]/.test(pw)) return false;
    if (!/[^a-zA-Z0-9]/.test(pw)) return false;
    return true;
};
const WEAK_PASSWORD_ERROR = "كلمة السر يجب أن تتكون من 8 أحرف على الأقل وتحتوي على أرقام وحروف ورموز";

// ==========================================
// --- حماية من محاولات الدخول المتكررة (Rate Limiting) ---
// ==========================================
// بعد 3 محاولات فاشلة (دخول أو تأسيس شركة) من نفس الجهاز، يُقفل لمدة 30
// ثانية قبل ما يقدر يحاول مرة ثانية. محفوظة بالذاكرة (كافية لحجم النظام
// الحالي)، مع تنظيف دوري للسجلات القديمة حتى ما تتراكم بلا حدود.
const authAttempts = new Map(); // key -> { count, lockedUntil, lastAttempt }
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_LOCK_MS = 30 * 1000;

const checkRateLimit = (key) => {
    const entry = authAttempts.get(key);
    if (entry && entry.lockedUntil > Date.now()) {
        return { locked: true, retryAfter: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
    }
    return { locked: false };
};
// يرجع true لو هذي المحاولة بالذات هي اللي سبّبت القفل (المحاولة الثالثة)،
// حتى يقدر المسار يرجّع 429 فوراً بنفس الرد بدل ما ينتظر محاولة رابعة.
const recordAuthFailure = (key) => {
    const entry = authAttempts.get(key) || { count: 0, lockedUntil: 0 };
    entry.count += 1;
    entry.lastAttempt = Date.now();
    let justLocked = false;
    if (entry.count >= RATE_LIMIT_MAX) {
        entry.lockedUntil = Date.now() + RATE_LIMIT_LOCK_MS;
        entry.count = 0; // يصفّر العداد حتى يحتاج 3 محاولات جديدة بعد فك القفل
        justLocked = true;
    }
    authAttempts.set(key, entry);
    return justLocked;
};
const clearAuthAttempts = (key) => authAttempts.delete(key);
// رد موحّد لأي فشل بمسارات الدخول/التسجيل: يسجّل المحاولة، ولو هذي هي
// المحاولة الثالثة يرجّع 429 بالحال بدل رسالة الخطأ العادية.
const failAuth = (res, key, message, status = 401) => {
    const justLocked = recordAuthFailure(key);
    if (justLocked) {
        const seconds = RATE_LIMIT_LOCK_MS / 1000;
        return res.status(429).json({ error: `محاولات كثيرة، حاول مرة أخرى خلال ${seconds} ثانية`, retryAfter: seconds });
    }
    return res.status(status).json({ error: message });
};

setInterval(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, entry] of authAttempts) {
        if (entry.lastAttempt < oneHourAgo) authAttempts.delete(key);
    }
}, 60 * 60 * 1000);

// 1. رابط إنشاء حساب جديد (Register) — ينشئ شركة جديدة كاملة
// محمي بـ "مفتاح إعداد" (SETUP_KEY) حتى يبقى إنشاء شركات جديدة بيد
// المبرمج/مالك النظام فقط، مو متاح لأي زائر يوصل لرابط النظام.
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, companyName, setupKey, recoveryKey } = req.body;
    const rateLimitKey = `register:${req.ip}`;
    const limit = checkRateLimit(rateLimitKey);
    if (limit.locked) {
        return res.status(429).json({ error: `محاولات كثيرة، حاول مرة أخرى خلال ${limit.retryAfter} ثانية`, retryAfter: limit.retryAfter });
    }
    if (!process.env.SETUP_KEY || setupKey !== process.env.SETUP_KEY) {
        return failAuth(res, rateLimitKey, "مفتاح الإعداد غير صحيح", 403);
    }
    if (!companyName || !companyName.trim()) {
        return res.status(400).json({ error: "يرجى إدخال اسم الشركة/المنشأة" });
    }
    if (!recoveryKey || recoveryKey.trim().length < 4) {
        return res.status(400).json({ error: "يرجى إدخال مفتاح استرجاع لا يقل عن 4 أحرف" });
    }
    if (!isStrongPassword(password)) {
        return res.status(400).json({ error: WEAK_PASSWORD_ERROR });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const recoveryKeyHash = await bcrypt.hash(recoveryKey.trim(), 10);
        const user = await prisma.$transaction(async (tx) => {
            const company = await tx.company.create({ data: { name: companyName.trim(), recoveryKeyHash } });
            const branch = await tx.branch.create({
                data: { name: 'الفرع الرئيسي', companyId: company.id }
            });
            // أول مستخدم بالشركة = المالك، له كل الصلاحيات ولا أحد يقدر يقيّده
            return tx.user.create({
                data: { name, email, password: hashedPassword, role: 'admin', companyId: company.id, branchId: branch.id, isOwner: true }
            });
        });
        clearAuthAttempts(rateLimitKey);
        const token = signToken(user);
        res.json({
            message: "تم إنشاء الحساب بنجاح",
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role, isOwner: user.isOwner }
        });
    } catch (error) {
        res.status(500).json({ error: "البريد الإلكتروني مستخدم بالفعل أو حدث خطأ" });
    }
});

// 2. رابط تسجيل الدخول (Login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const rateLimitKey = `login:${req.ip}:${(email || '').toLowerCase()}`;
    const limit = checkRateLimit(rateLimitKey);
    if (limit.locked) {
        return res.status(429).json({ error: `محاولات كثيرة، حاول مرة أخرى خلال ${limit.retryAfter} ثانية`, retryAfter: limit.retryAfter });
    }
    try {
        // البحث عن المستخدم
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return failAuth(res, rateLimitKey, "البريد الإلكتروني غير مسجل");

        // مقارنة كلمة السر المشفرة
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return failAuth(res, rateLimitKey, "كلمة السر غير صحيحة");

        clearAuthAttempts(rateLimitKey);
        res.json({
            token: signToken(user),
            user: { id: user.id, name: user.name, email: user.email, role: user.role, isOwner: user.isOwner }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. نسيت كلمة السر: يتحقق من مفتاح استرجاع الشركة (يضبطه المبرمج عند
// التأسيس، ومالك الشركة يقدر يغيّره لاحقاً)، وإذا صح يسمح بتعيين كلمة
// سر جديدة لأي مستخدم بنفس الشركة دون الحاجة لمعرفة كلمة السر القديمة.
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email, recoveryKey, newPassword } = req.body;
    const rateLimitKey = `forgot:${req.ip}:${(email || '').toLowerCase()}`;
    const limit = checkRateLimit(rateLimitKey);
    if (limit.locked) {
        return res.status(429).json({ error: `محاولات كثيرة، حاول مرة أخرى خلال ${limit.retryAfter} ثانية`, retryAfter: limit.retryAfter });
    }
    if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ error: WEAK_PASSWORD_ERROR });
    }
    try {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return failAuth(res, rateLimitKey, "البريد الإلكتروني غير مسجل");

        const company = await prisma.company.findUnique({ where: { id: user.companyId } });
        if (!company.recoveryKeyHash) {
            return res.status(400).json({ error: "شركتك ما عندها مفتاح استرجاع مسجّل بعد، تواصل مع الدعم الفني" });
        }
        const keyValid = await bcrypt.compare(recoveryKey || '', company.recoveryKeyHash);
        if (!keyValid) return failAuth(res, rateLimitKey, "مفتاح الاسترجاع غير صحيح");

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const updated = await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
        clearAuthAttempts(rateLimitKey);
        res.json({
            message: "تم تغيير كلمة السر بنجاح",
            token: signToken(updated),
            user: { id: updated.id, name: updated.name, email: updated.email, role: updated.role, isOwner: updated.isOwner }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. دليل المطوّر: عرض كل الشركات ومستخدميها (الاسم والبريد فقط - أبداً
// كلمات السر، وهذي أصلاً مشفّرة ولا يمكن استرجاعها). يحتاج مفتاح الإعداد
// نفسه المستخدم بتأسيس الشركات، حتى يضل الوصول بيد المبرمج فقط. الهدف:
// لو زبون نسى إيميله يقدر المبرمج يدورله عليه ويرسله له.
app.post('/api/dev/companies', async (req, res) => {
    const { setupKey } = req.body;
    const rateLimitKey = `dev-directory:${req.ip}`;
    const limit = checkRateLimit(rateLimitKey);
    if (limit.locked) {
        return res.status(429).json({ error: `محاولات كثيرة، حاول مرة أخرى خلال ${limit.retryAfter} ثانية`, retryAfter: limit.retryAfter });
    }
    if (!process.env.SETUP_KEY || setupKey !== process.env.SETUP_KEY) {
        return failAuth(res, rateLimitKey, "مفتاح الإعداد غير صحيح", 403);
    }
    clearAuthAttempts(rateLimitKey);
    try {
        const companies = await prisma.company.findMany({
            select: {
                id: true, name: true, createdAt: true,
                users: { select: { id: true, name: true, email: true, isOwner: true, createdAt: true }, orderBy: { createdAt: 'asc' } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(companies);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// من هنا وطالع، أي مسار يتطلب توكن دخول صالح (Authorization: Bearer <token>)
app.use(authenticateToken);

// تحقق ملكية سريع: هل هذا المشروع/الموظف يعود فعلاً لشركة المستخدم؟
// يُستخدم قبل أي إضافة/تعديل/حذف على سجلات فرعية (دفعات، مصاريف، مواد،
// مهام، مرفقات، حضور، رواتب) حتى ما يقدر مستخدم شركة يلمس بيانات شركة ثانية.
const ensureOwnedProject = async (projectId, companyId) => {
    return prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true, name: true, budget: true } });
};
const ensureOwnedEmployee = async (employeeId, companyId) => {
    return prisma.employee.findFirst({ where: { id: employeeId, companyId }, select: { id: true } });
};

// يقتصر على مالك الشركة (أول مستخدم أسّسها) - يُستخدم لحماية العمليات
// الحساسة (تغيير الرمز، إضافة/حذف مستخدمين، تعديل الصلاحيات). فحص حي من
// قاعدة البيانات (مو من التوكن) حتى ينعكس أي تغيير فوراً بدون انتظار
// انتهاء صلاحية التوكن القديم.
const requireOwner = async (req, res, next) => {
    const requester = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { isOwner: true } });
    if (!requester?.isOwner) {
        return res.status(403).json({ error: 'هذا الإجراء يقتصر على مالك الشركة فقط' });
    }
    next();
};

// تحقق صلاحيات عام لكل الطلبات غير GET: يستثني مسارات الإعدادات وإدارة
// المستخدمين (تلك عندها فحص "مالك" مخصص أدق)، ويسمح دائماً لمالك الشركة،
// وإلا يتحقق من صلاحية الإضافة/التعديل/الحذف الحية للمستخدم الحالي.
const enforcePermissions = async (req, res, next) => {
    if (req.method === 'GET') return next();
    if (req.path.startsWith('/api/settings') || req.path.startsWith('/api/company')) return next();
    try {
        const requester = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: { isOwner: true, canAdd: true, canEdit: true, canDelete: true }
        });
        if (!requester) return res.status(401).json({ error: 'المستخدم غير موجود' });
        if (requester.isOwner) return next();
        const permByMethod = { POST: 'canAdd', PATCH: 'canEdit', DELETE: 'canDelete' };
        const key = permByMethod[req.method];
        if (key && !requester[key]) {
            const labels = { canAdd: 'الإضافة', canEdit: 'التعديل', canDelete: 'الحذف' };
            return res.status(403).json({ error: `ليس لديك صلاحية ${labels[key]}` });
        }
        next();
    } catch (e) { res.status(500).json({ error: e.message }); }
};
app.use(enforcePermissions);

// ==========================================
// --- باقي المسارات البرمجية للنظام ---
// ==========================================

// --- الشركة (شركتي أنا فقط، مو كل الشركات) ---
app.get('/api/company', async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
    res.json(company);
});

// --- مستخدمو الشركة (يضيفهم مدير الشركة بنفسه، مو المبرمج) ---
// كل مستخدم يُنشأ هنا يُربط تلقائياً بشركة الشخص اللي طلب الإضافة
// (req.user.companyId)، فيقدر يدخل النظام ويشوف نفس بيانات شركته بالضبط.
app.get('/api/company/users', async (req, res) => {
    const users = await prisma.user.findMany({
        where: { companyId: req.user.companyId },
        select: { id: true, name: true, email: true, role: true, createdAt: true, isOwner: true, canAdd: true, canEdit: true, canDelete: true },
        orderBy: { createdAt: 'asc' }
    });
    res.json(users);
});

app.post('/api/company/users', requireOwner, async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'يرجى تعبئة كل الحقول' });
    }
    if (!isStrongPassword(password)) {
        return res.status(400).json({ error: WEAK_PASSWORD_ERROR });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({
            data: { name, email, password: hashedPassword, role: 'admin', companyId: req.user.companyId }
        });
        res.json({ id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, isOwner: newUser.isOwner, canAdd: newUser.canAdd, canEdit: newUser.canEdit, canDelete: newUser.canDelete });
    } catch (error) {
        res.status(500).json({ error: 'البريد الإلكتروني مستخدم بالفعل أو حدث خطأ' });
    }
});

app.delete('/api/company/users/:id', requireOwner, async (req, res) => {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.userId) {
        return res.status(400).json({ error: 'لا يمكنك حذف حسابك الخاص من هنا' });
    }
    const target = await prisma.user.findFirst({ where: { id: targetId, companyId: req.user.companyId } });
    if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const remaining = await prisma.user.count({ where: { companyId: req.user.companyId } });
    if (remaining <= 1) {
        return res.status(400).json({ error: 'لا يمكن حذف آخر مستخدم بالشركة' });
    }

    await prisma.user.delete({ where: { id: target.id } });
    res.json({ ok: true });
});

// تعديل صلاحيات مستخدم غير-مالك (إضافة/تعديل/حذف) - يقتصر على مالك الشركة.
// المالك نفسه لا يمكن استهدافه هنا (محصّن دائماً بالتصميم).
app.patch('/api/company/users/:id/permissions', requireOwner, async (req, res) => {
    const targetId = parseInt(req.params.id);
    const { canAdd, canEdit, canDelete } = req.body;
    try {
        const target = await prisma.user.findFirst({ where: { id: targetId, companyId: req.user.companyId } });
        if (!target) return res.status(404).json({ error: 'المستخدم غير موجود' });
        if (target.isOwner) {
            return res.status(400).json({ error: 'لا يمكن تقييد صلاحيات مالك الشركة' });
        }
        const data = {};
        if (typeof canAdd === 'boolean') data.canAdd = canAdd;
        if (typeof canEdit === 'boolean') data.canEdit = canEdit;
        if (typeof canDelete === 'boolean') data.canDelete = canDelete;
        const updated = await prisma.user.update({ where: { id: target.id }, data });
        res.json({ id: updated.id, canAdd: updated.canAdd, canEdit: updated.canEdit, canDelete: updated.canDelete });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- الفروع ---
app.get('/api/branches', async (req, res) => {
    const branches = await prisma.branch.findMany({
        where: { companyId: req.user.companyId },
        include: { company: true }
    });
    res.json(branches);
});

app.post('/api/branch', async (req, res) => {
    const { name, location } = req.body;
    try {
        const branch = await prisma.branch.create({
            data: { name, location, companyId: req.user.companyId }
        });
        res.json(branch);
    } catch (error) {
        console.error("خطأ:", error);
        res.status(500).json({ error: "حدث خطأ في السيرفر" });
    }
});

app.delete('/api/branch/:id', async (req, res) => {
    const branch = await prisma.branch.findFirst({ where: { id: parseInt(req.params.id), companyId: req.user.companyId } });
    if (!branch) return res.status(404).json({ error: 'الفرع غير موجود' });
    await prisma.branch.delete({ where: { id: branch.id } });
    res.json({ ok: true });
});

// --- المشاريع والدفعات ---
// ملاحظة أداء: مسار القائمة هذا يُستخدم للوحة التحكم وقائمة المشاريع
// والأرشيف وشاشة الأرباح، وكلها تحتاج فقط "مجاميع" (الأرقام)، مو كل سجل
// بتفاصيله الكاملة. لذلك نجيب فقط الحقول اللازمة لحساب المجاميع (بدل كل
// الأعمدة + بدل جلب المورد الكامل مع كل مادة)، وتفاصيل المشروع الكاملة
// (لكل سجل دفعة/مصروف/مادة/مرفق) تُجلب فقط عند فتح مشروع محدد عبر
// GET /api/project/:id بالأسفل.
app.get('/api/projects', async (req, res) => {
    const projects = await prisma.project.findMany({
        where: { companyId: req.user.companyId },
        include: {
            branch: true,
            payments: { select: { amount: true } },
            expenses: { select: { amount: true } },
            materials: { select: { price: true } },
            tasks: { select: { percentage: true, isCompleted: true } },
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(projects);
});

// تفاصيل مشروع واحد كاملة (كل الدفعات/المصاريف/المواد بموردها/المرفقات/المهام)
// تُستدعى فقط عند فتح نافذة مشروع محدد
app.get('/api/project/:id', async (req, res) => {
    try {
        const project = await prisma.project.findFirst({
            where: { id: parseInt(req.params.id), companyId: req.user.companyId },
            include: {
                branch: true,
                payments: true,
                expenses: true,
                materials: { include: { supplier: true } },
                attachments: true,
                tasks: true,
            }
        });
        if (!project) return res.status(404).json({ error: 'المشروع غير موجود' });
        res.json(project);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/project/:id/archive', async (req, res) => {
    try {
        const project = await ensureOwnedProject(parseInt(req.params.id), req.user.companyId);
        if (!project) return res.status(404).json({ error: "المشروع غير موجود" });
        const full = await prisma.project.findUnique({ where: { id: project.id }, select: { isArchived: true } });
        const updated = await prisma.project.update({
            where: { id: project.id },
            data: { isArchived: !full.isArchived }
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: "خطأ في قاعدة البيانات" }); }
});

app.post('/api/project', async (req, res) => {
    const { name, client, budget, branchId } = req.body;
    try {
        const branch = await prisma.branch.findFirst({ where: { id: parseInt(branchId), companyId: req.user.companyId } });
        if (!branch) return res.status(400).json({ error: "الفرع المحدد غير موجود" });
        const project = await prisma.project.create({
            data: { name, client, budget: parseFloat(budget), branchId: branch.id, companyId: req.user.companyId }
        });
        res.json(project);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/project/:id/status', async (req, res) => {
    const { status } = req.body;
    const project = await ensureOwnedProject(parseInt(req.params.id), req.user.companyId);
    if (!project) return res.status(404).json({ error: "المشروع غير موجود" });
    const updated = await prisma.project.update({
        where: { id: project.id },
        data: { status }
    });
    res.json(updated);
});

app.delete('/api/project/:id', async (req, res) => {
    try {
        const project = await ensureOwnedProject(parseInt(req.params.id), req.user.companyId);
        if (!project) return res.status(404).json({ error: "المشروع غير موجود" });
        await prisma.project.delete({ where: { id: project.id } });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payment', async (req, res) => {
    const { amount, projectId } = req.body;
    try {
        const project = await ensureOwnedProject(parseInt(projectId), req.user.companyId);
        if (!project) return res.status(404).json({ error: "المشروع غير موجود" });
        const payment = await prisma.payment.create({
            data: { amount: parseFloat(amount), projectId: project.id }
        });
        res.json(payment);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- تعديل مسار المصاريف لإضافة إشعار ذكي في حال تجاوز الميزانية ---
app.post('/api/expense', async (req, res) => {
    const { description, amount, projectId } = req.body;
    try {
        const projectOwned = await ensureOwnedProject(parseInt(projectId), req.user.companyId);
        if (!projectOwned) return res.status(404).json({ error: "المشروع غير موجود" });

        const expense = await prisma.expense.create({
            data: { description, amount: parseFloat(amount), projectId: projectOwned.id }
        });

        // [ذكاء النظام] فحص الميزانية
        const project = await prisma.project.findUnique({
            where: { id: projectOwned.id },
            include: { expenses: true, materials: true }
        });
        const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0) + project.materials.reduce((s, m) => s + m.price, 0);
        if (totalSpent > project.budget) {
            await prisma.notification.create({
                data: { message: `⚠️ المشروع (${project.name}) تجاوز الميزانية المحددة!`, type: 'danger', companyId: req.user.companyId }
            });
        }

        res.json(expense);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- المواد (مع فحص الميزانية أيضاً) ---
app.post('/api/material', async (req, res) => {
    const { name, quantity, unit, price, projectId, supplierId } = req.body;
    try {
        const projectOwned = await ensureOwnedProject(parseInt(projectId), req.user.companyId);
        if (!projectOwned) return res.status(404).json({ error: "المشروع غير موجود" });

        let ownedSupplierId = null;
        if (supplierId) {
            const supplier = await prisma.supplier.findFirst({ where: { id: parseInt(supplierId), companyId: req.user.companyId } });
            if (!supplier) return res.status(400).json({ error: "المورد المحدد غير موجود" });
            ownedSupplierId = supplier.id;
        }

        const material = await prisma.material.create({
            data: {
                name,
                quantity: parseFloat(quantity),
                unit,
                price: parseFloat(price),
                projectId: projectOwned.id,
                supplierId: ownedSupplierId
            }
        });

        // [ذكاء النظام] فحص الميزانية
        const project = await prisma.project.findUnique({
            where: { id: projectOwned.id },
            include: { expenses: true, materials: true }
        });
        const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0) + project.materials.reduce((s, m) => s + m.price, 0);
        if (totalSpent > project.budget) {
            await prisma.notification.create({
                data: { message: `⚠️ تم شراء مواد جعلت المشروع (${project.name}) يتجاوز ميزانيته!`, type: 'danger', companyId: req.user.companyId }
            });
        }

        res.json(material);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/material/:id', async (req, res) => {
    const { name, quantity, unit, price, supplierId } = req.body;
    try {
        const material = await prisma.material.findFirst({
            where: { id: parseInt(req.params.id), project: { companyId: req.user.companyId } }
        });
        if (!material) return res.status(404).json({ error: "المادة غير موجودة" });

        let ownedSupplierId = null;
        if (supplierId) {
            const supplier = await prisma.supplier.findFirst({ where: { id: parseInt(supplierId), companyId: req.user.companyId } });
            if (!supplier) return res.status(400).json({ error: "المورد المحدد غير موجود" });
            ownedSupplierId = supplier.id;
        }

        const updated = await prisma.material.update({
            where: { id: material.id },
            data: {
                name,
                quantity: parseFloat(quantity),
                unit,
                price: parseFloat(price),
                supplierId: ownedSupplierId
            }
        });
        res.json(updated);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/material/:id', async (req, res) => {
    const material = await prisma.material.findFirst({
        where: { id: parseInt(req.params.id), project: { companyId: req.user.companyId } }
    });
    if (!material) return res.status(404).json({ error: "المادة غير موجودة" });
    await prisma.material.delete({ where: { id: material.id } });
    res.json({ ok: true });
});

// --- الموردين ---
app.get('/api/suppliers', async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
        where: { companyId: req.user.companyId },
        include: { materials: true }
    });
    res.json(suppliers);
});

app.post('/api/suppliers', async (req, res) => {
    const { name, phone, address } = req.body;
    try {
        const supplier = await prisma.supplier.create({
            data: { name, phone, address, companyId: req.user.companyId }
        });
        res.json(supplier);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const supplier = await prisma.supplier.findFirst({ where: { id: parseInt(req.params.id), companyId: req.user.companyId } });
        if (!supplier) return res.status(404).json({ error: "المورد غير موجود" });
        await prisma.supplier.delete({ where: { id: supplier.id } });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- المرفقات ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('لم يتم اختيار ملف');
        const projectOwned = await ensureOwnedProject(parseInt(req.body.projectId), req.user.companyId);
        if (!projectOwned) return res.status(404).json({ error: "المشروع غير موجود" });

        // التعديل: جعل الرابط ديناميكي بناءً على السيرفر المرفوع عليه
        const host = req.get('host');
        const protocol = req.protocol;
        const url = `${protocol}://${host}/uploads/${req.file.filename}`;

        const attachment = await prisma.attachment.create({
            data: {
                name: req.body.name || req.file.originalname,
                url: url,
                fileType: req.file.mimetype,
                projectId: projectOwned.id
            }
        });
        res.json(attachment);
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/attachment/:id', async (req, res) => {
    try {
        const attachment = await prisma.attachment.findFirst({
            where: { id: parseInt(req.params.id), project: { companyId: req.user.companyId } }
        });
        if (attachment) {
            const fileName = attachment.url.split('/').pop();
            const filePath = path.join(uploadDir, fileName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await prisma.attachment.delete({ where: { id: attachment.id } });
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- نظام الحضور والرواتب ---
app.get('/api/employees', async (req, res) => {
    const employees = await prisma.employee.findMany({
        where: { companyId: req.user.companyId },
        include: { branch: true, attendances: true, salaryPayments: true },
        orderBy: { createdAt: 'desc' }
    });
    res.json(employees);
});

app.post('/api/attendance', async (req, res) => {
    const { employeeId, status, date } = req.body; // أضفنا التاريخ هنا
    try {
        const employee = await ensureOwnedEmployee(parseInt(employeeId), req.user.companyId);
        if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });

        // تحويل التاريخ لبداية اليوم لضمان عدم التكرار في نفس اليوم
        const attendanceDate = date ? new Date(date) : new Date();
        attendanceDate.setHours(0,0,0,0);

        // تحديث إذا كان موجوداً أو إنشاء سجل جديد
        const attendance = await prisma.attendance.upsert({
            where: {
                employeeId_date: { // تأكد من وجود هذا الـ unique constraint في schema.prisma
                    employeeId: employee.id,
                    date: attendanceDate
                }
            },
            update: { status },
            create: { employeeId: employee.id, status, date: attendanceDate }
        });
        res.json(attendance);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/salary-payment', async (req, res) => {
    const { employeeId, amount, type } = req.body;
    try {
        const employee = await ensureOwnedEmployee(parseInt(employeeId), req.user.companyId);
        if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });
        const payment = await prisma.salaryPayment.create({
            data: { employeeId: employee.id, amount: parseFloat(amount), type: type || "أسبوعي" }
        });
        res.json(payment);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/employee/:id', async (req, res) => {
    try {
        const employee = await ensureOwnedEmployee(parseInt(req.params.id), req.user.companyId);
        if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });
        const branch = await prisma.branch.findFirst({ where: { id: parseInt(req.body.branchId), companyId: req.user.companyId } });
        if (!branch) return res.status(400).json({ error: "الفرع المحدد غير موجود" });
        const data = await prisma.employee.update({
            where: { id: employee.id },
            data: { name: req.body.name, position: req.body.position, salary: parseFloat(req.body.salary), branchId: branch.id }
        });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employee', async (req, res) => {
    try {
        const branch = await prisma.branch.findFirst({ where: { id: parseInt(req.body.branchId), companyId: req.user.companyId } });
        if (!branch) return res.status(400).json({ error: "الفرع المحدد غير موجود" });
        const employee = await prisma.employee.create({
            data: { name: req.body.name, position: req.body.position, salary: parseFloat(req.body.salary), branchId: branch.id, companyId: req.user.companyId }
        });
        res.json(employee);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/employee/:id', async (req, res) => {
    const employee = await ensureOwnedEmployee(parseInt(req.params.id), req.user.companyId);
    if (!employee) return res.status(404).json({ error: "الموظف غير موجود" });
    await prisma.employee.delete({ where: { id: employee.id } });
    res.json({ ok: true });
});

// ==========================================
// --- [جديد] مسارات المهام والإشعارات ---
// ==========================================

// إضافة مهمة جديدة لمشروع
app.post('/api/tasks', async (req, res) => {
    const { description, percentage, projectId } = req.body;
    try {
        const project = await ensureOwnedProject(parseInt(projectId), req.user.companyId);
        if (!project) return res.status(404).json({ error: "المشروع غير موجود" });
        const task = await prisma.task.create({
            data: { description, percentage: parseInt(percentage), projectId: project.id }
        });
        res.json(task);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// تحديث حالة المهمة (تم/لم يتم)
app.patch('/api/tasks/:id', async (req, res) => {
    const task = await prisma.task.findFirst({
        where: { id: parseInt(req.params.id), project: { companyId: req.user.companyId } }
    });
    if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
    const updatedTask = await prisma.task.update({
        where: { id: task.id },
        data: { isCompleted: !task.isCompleted }
    });
    res.json(updatedTask);
});

// حذف مهمة
app.delete('/api/tasks/:id', async (req, res) => {
    const task = await prisma.task.findFirst({
        where: { id: parseInt(req.params.id), project: { companyId: req.user.companyId } }
    });
    if (!task) return res.status(404).json({ error: "المهمة غير موجودة" });
    await prisma.task.delete({ where: { id: task.id } });
    res.json({ ok: true });
});

// جلب الإشعارات غير المقروءة
app.get('/api/notifications', async (req, res) => {
    const notifs = await prisma.notification.findMany({
        where: { isRead: false, companyId: req.user.companyId },
        orderBy: { createdAt: 'desc' }
    });
    res.json(notifs);
});

// تحديد الإشعار كمقروء
app.patch('/api/notifications/:id', async (req, res) => {
    const notif = await prisma.notification.findFirst({ where: { id: parseInt(req.params.id), companyId: req.user.companyId } });
    if (!notif) return res.status(404).json({ error: "الإشعار غير موجود" });
    await prisma.notification.update({
        where: { id: notif.id },
        data: { isRead: true }
    });
    res.json({ ok: true });
});

// ==========================================
// --- [جديد] رمز دخول المدير (ADMIN PIN) ---
// ==========================================
// الرمز مخزّن مشفّراً (bcrypt) على مستوى شركة المستخدم المسجّل دخوله
// تحديداً (req.user.companyId)، فيصير لكل شركة رمز مدير خاص فيها تماماً.
const DEFAULT_ADMIN_PIN = '1234';

app.post('/api/settings/verify-pin', async (req, res) => {
    const { pin } = req.body;
    try {
        const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
        const valid = company.adminPinHash
            ? await bcrypt.compare(pin || '', company.adminPinHash)
            : pin === DEFAULT_ADMIN_PIN;
        res.json({ valid });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/settings/change-pin', requireOwner, async (req, res) => {
    const { currentPin, newPin } = req.body;
    try {
        if (!newPin || newPin.length < 4) {
            return res.status(400).json({ error: 'يجب أن يتكون الرمز الجديد من 4 أرقام على الأقل' });
        }
        const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
        const currentValid = company.adminPinHash
            ? await bcrypt.compare(currentPin || '', company.adminPinHash)
            : currentPin === DEFAULT_ADMIN_PIN;
        if (!currentValid) {
            return res.status(401).json({ error: 'الرمز الحالي غير صحيح' });
        }
        const newHash = await bcrypt.hash(newPin, 10);
        await prisma.company.update({ where: { id: company.id }, data: { adminPinHash: newHash } });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// تغيير مفتاح استرجاع كلمة السر - يقتصر على مالك الشركة. لو الشركة ما
// عندها مفتاح مسجّل بعد (شركات قديمة قبل هذي الميزة)، يسمح بضبط أول
// مفتاح مباشرة بدون طلب المفتاح الحالي.
app.post('/api/settings/change-recovery-key', requireOwner, async (req, res) => {
    const { currentRecoveryKey, newRecoveryKey } = req.body;
    try {
        if (!newRecoveryKey || newRecoveryKey.trim().length < 4) {
            return res.status(400).json({ error: 'يجب أن يتكون المفتاح الجديد من 4 أحرف على الأقل' });
        }
        const company = await prisma.company.findUnique({ where: { id: req.user.companyId } });
        if (company.recoveryKeyHash) {
            const currentValid = await bcrypt.compare(currentRecoveryKey || '', company.recoveryKeyHash);
            if (!currentValid) {
                return res.status(401).json({ error: 'المفتاح الحالي غير صحيح' });
            }
        }
        const newHash = await bcrypt.hash(newRecoveryKey.trim(), 10);
        await prisma.company.update({ where: { id: company.id }, data: { recoveryKeyHash: newHash } });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- مصاريف المقر الرئيسي ---
app.get('/api/office-expenses', async (req, res) => {
    try {
        const officeExpenses = await prisma.officeExpense.findMany({ where: { companyId: req.user.companyId } });
        res.json(officeExpenses);
    } catch (error) {
        console.error('Office expense error:', error);
        res.status(500).json({ error: 'Failed to fetch office expenses' });
    }
});

app.post('/api/office-expenses', async (req, res) => {
    const { description, amount } = req.body;
    try {
        const expense = await prisma.officeExpense.create({
            data: { description, amount: parseFloat(amount), companyId: req.user.companyId }
        });
        res.json(expense);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Railway (وأغلب منصات الاستضافة) تعطي رقم المنفذ عبر متغير PORT ديناميكياً
// - لازم نستمع عليه، والقيمة 3000 تبقى بس احتياط للتشغيل المحلي.
const PORT = process.env.PORT || 3000;
app.listen(PORT,"0.0.0.0", () => {
    console.log(`🚀 النظام الذكي محمي وجاهز على http://localhost:${PORT}`);
});
