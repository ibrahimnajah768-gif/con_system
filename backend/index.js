const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // مكتبة تشفير الباسورد
const jwt = require('jsonwebtoken'); // مكتبة التوكن

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
const upload = multer({ storage: multer.memoryStorage() });

// ==========================================
// --- نظام تسجيل الدخول (AUTHENTICATION) ---
// ==========================================

// 1. رابط إنشاء حساب جديد (Register)
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        // تشفير كلمة السر قبل الحفظ
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, email, password: hashedPassword }
        });
        res.json({ message: "تم إنشاء الحساب بنجاح", userId: user.id });
    } catch (error) {
        res.status(500).json({ error: "البريد الإلكتروني مستخدم بالفعل أو حدث خطأ" });
    }
});
app.get('/api/officeexpenses', async (req, res) => {
  try {
    const officeExpenses = await prisma.officeExpense.findMany();

    res.json(officeExpenses);
  } catch (error) {
    console.error('Office expense error:', error);

    res.status(500).json({
      error: 'Failed to fetch office expenses'
    });
  }
});

// 2. رابط تسجيل الدخول (Login)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // البحث عن المستخدم
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return res.status(401).json({ error: "البريد الإلكتروني غير مسجل" });

        // مقارنة كلمة السر المشفرة
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "كلمة السر غير صحيحة" });

        // إنشاء التوكن (JWT)
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET || 'secret_key',
            { expiresIn: '24h' } // تنتهي الصلاحية بعد يوم كامل
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// --- باقي المسارات البرمجية للنظام ---
// ==========================================

// --- الشركات ---
app.get('/api/company', async (req, res) => {
    const companies = await prisma.company.findMany();
    res.json(companies);
});

app.post('/api/company', async (req, res) => {
    const { name, address } = req.body;
    const company = await prisma.company.create({ data: { name, address } });
    res.json(company);
});

// --- الفروع ---
app.get('/api/branches', async (req, res) => {
    const branches = await prisma.branch.findMany({ include: { company: true } });
    res.json(branches);
});

app.post('/api/branch', async (req, res) => {
    const { name, location } = req.body;
    try {
        // 1. البحث عن أول شركة موجودة
        let company = await prisma.company.findFirst();
        
        // 2. إذا كانت قاعدة البيانات صفر (بعد الـ Reset)، ننشئ شركة فوراً
        if (!company) {
            company = await prisma.company.create({
                data: { name: "شركة المِعمار للمقاولات", address: "المقر الرئيسي" }
            });
        }

        // 3. إنشاء الفرع وربطه بالشركة
        const branch = await prisma.branch.create({ 
            data: { 
                name, 
                location, 
                companyId: company.id // نستخدم ID الشركة التي وجدناها أو أنشأناها
            } 
        });
        res.json(branch);
    } catch (error) {
        console.error("خطأ:", error);
        res.status(500).json({ error: "حدث خطأ في السيرفر" });
    }
});

app.delete('/api/branch/:id', async (req, res) => {
    await prisma.branch.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
});

// --- المشاريع والدفعات ---
app.get('/api/projects', async (req, res) => {
    const projects = await prisma.project.findMany({ 
        include: { 
            branch: true, 
            payments: true, 
            expenses: true, 
            materials: { include: { supplier: true } }, 
            attachments: true,
            tasks: true // [إضافة] جلب المهام مع المشروع
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(projects);
});
// كود الأرشفة في السيرفر (Node.js + Express)
// كود الأرشفة المصحح (يجب استبدال القديم بهذا)
// --- كود الأرشفة المصلح في السيرفر ---
// --- كود الأرشفة المصلح 100% لـ Prisma ---
app.patch('/api/project/:id/archive', async (req, res) => {
    const { id } = req.params;
    try {
        const project = await prisma.project.findUnique({ where: { id: parseInt(id) } });
        if (!project) return res.status(404).json({ error: "المشروع غير موجود" });

        const updated = await prisma.project.update({
            where: { id: parseInt(id) },
            data: { isArchived: !project.isArchived }
        });
        res.json(updated);
    } catch (err) { res.status(500).json({ error: "خطأ في السيرفر" }); }
});
app.post('/api/project', async (req, res) => {
    const { name, client, budget, branchId } = req.body;
    const project = await prisma.project.create({
        data: { name, client, budget: parseFloat(budget), branchId: parseInt(branchId) }
    });
    res.json(project);
});

app.patch('/api/project/:id/status', async (req, res) => {
    const { status } = req.body;
    const project = await prisma.project.update({
        where: { id: parseInt(req.params.id) },
        data: { status }
    });
    res.json(project);
});

app.delete('/api/project/:id', async (req, res) => {
    try {
        await prisma.project.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/payment', async (req, res) => {
    const { amount, projectId } = req.body;
    try {
        const payment = await prisma.payment.create({
            data: { amount: parseFloat(amount), projectId: parseInt(projectId) }
        });
        res.json(payment);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- تعديل مسار المصاريف لإضافة إشعار ذكي في حال تجاوز الميزانية ---
app.post('/api/expense', async (req, res) => {
    const { description, amount, projectId } = req.body;
    try {
        const expense = await prisma.expense.create({
            data: { description, amount: parseFloat(amount), projectId: parseInt(projectId) }
        });

        // [ذكاء النظام] فحص الميزانية
        const project = await prisma.project.findUnique({
            where: { id: parseInt(projectId) },
            include: { expenses: true, materials: true }
        });
        const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0) + project.materials.reduce((s, m) => s + m.price, 0);
        if (totalSpent > project.budget) {
            await prisma.notification.create({
                data: { message: `⚠️ المشروع (${project.name}) تجاوز الميزانية المحددة!`, type: 'danger' }
            });
        }

        res.json(expense);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- المواد (مع فحص الميزانية أيضاً) ---
app.post('/api/material', async (req, res) => {
    const { name, quantity, unit, price, projectId, supplierId } = req.body;
    try {
        const material = await prisma.material.create({
            data: { 
                name, 
                quantity: parseFloat(quantity), 
                unit, 
                price: parseFloat(price), 
                projectId: parseInt(projectId),
                supplierId: supplierId ? parseInt(supplierId) : null 
            }
        });

        // [ذكاء النظام] فحص الميزانية
        const project = await prisma.project.findUnique({
            where: { id: parseInt(projectId) },
            include: { expenses: true, materials: true }
        });
        const totalSpent = project.expenses.reduce((s, e) => s + e.amount, 0) + project.materials.reduce((s, m) => s + m.price, 0);
        if (totalSpent > project.budget) {
            await prisma.notification.create({
                data: { message: `⚠️ تم شراء مواد جعلت المشروع (${project.name}) يتجاوز ميزانيته!`, type: 'danger' }
            });
        }

        res.json(material);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/material/:id', async (req, res) => {
    const { name, quantity, unit, price, supplierId } = req.body;
    const material = await prisma.material.update({
        where: { id: parseInt(req.params.id) },
        data: { 
            name, 
            quantity: parseFloat(quantity), 
            unit, 
            price: parseFloat(price),
            supplierId: supplierId ? parseInt(supplierId) : null
        }
    });
    res.json(material);
});

app.delete('/api/material/:id', async (req, res) => {
    await prisma.material.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
});

// --- الموردين ---
app.get('/api/suppliers', async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
        include: { materials: true } 
    });
    res.json(suppliers);
});

app.post('/api/suppliers', async (req, res) => {
    const { name, phone, address } = req.body;
    try {
        const supplier = await prisma.supplier.create({
            data: { name, phone, address }
        });
        res.json(supplier);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        await prisma.supplier.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- المرفقات ---
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).send('لم يتم اختيار ملف');

        // رفع الملف على Supabase
        const fileName = `${Date.now()}_${req.file.originalname}`;
        const { data, error } = await supabase.storage
            .from('uploads')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype
            });

        if (error) throw error;

        // الحصول على الرابط العام
        const { data: urlData } = supabase.storage
            .from('uploads')
            .getPublicUrl(fileName);

        const attachment = await prisma.attachment.create({
            data: {
                name: req.body.name || req.file.originalname,
                url: urlData.publicUrl,
                fileType: req.file.mimetype,
                projectId: parseInt(req.body.projectId)
            }
        });
        res.json(attachment);
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

app.delete('/api/attachment/:id', async (req, res) => {
    try {
        const attachment = await prisma.attachment.findUnique({ where: { id: parseInt(req.params.id) } });
        if (attachment) {
            const fileName = attachment.url.split('/').pop();
            const filePath = path.join(uploadDir, fileName);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await prisma.attachment.delete({ where: { id: parseInt(req.params.id) } });
        }
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- نظام الحضور والرواتب ---
app.get('/api/employees', async (req, res) => {
    const employees = await prisma.employee.findMany({ 
        include: { branch: true, attendances: true, salaryPayments: true },
        orderBy: { createdAt: 'desc' }
    });
    res.json(employees);
});

app.post('/api/attendance', async (req, res) => {
    const { employeeId, status, date } = req.body; // أضفنا التاريخ هنا
    try {
        // تحويل التاريخ لبداية اليوم لضمان عدم التكرار في نفس اليوم
        const attendanceDate = date ? new Date(date) : new Date();
        attendanceDate.setHours(0,0,0,0);

        // تحديث إذا كان موجوداً أو إنشاء سجل جديد
        const attendance = await prisma.attendance.upsert({
            where: {
                employeeId_date: { // تأكد من وجود هذا الـ unique constraint في schema.prisma
                    employeeId: parseInt(employeeId),
                    date: attendanceDate
                }
            },
            update: { status },
            create: { employeeId: parseInt(employeeId), status, date: attendanceDate }
        });
        res.json(attendance);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/salary-payment', async (req, res) => {
    const { employeeId, amount, type } = req.body;
    try {
        const payment = await prisma.salaryPayment.create({
            data: { employeeId: parseInt(employeeId), amount: parseFloat(amount), type: type || "أسبوعي" }
        });
        res.json(payment);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/employee/:id', async (req, res) => {
    try {
        const data = await prisma.employee.update({
            where: { id: parseInt(req.params.id) },
            data: { name: req.body.name, position: req.body.position, salary: parseFloat(req.body.salary), branchId: parseInt(req.body.branchId) }
        });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/employee', async (req, res) => {
    const employee = await prisma.employee.create({
        data: { name: req.body.name, position: req.body.position, salary: parseFloat(req.body.salary), branchId: parseInt(req.body.branchId) }
    });
    res.json(employee);
});

app.delete('/api/employee/:id', async (req, res) => {
    await prisma.employee.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
});

// ==========================================
// --- [جديد] مسارات المهام والإشعارات ---
// ==========================================

// إضافة مهمة جديدة لمشروع
app.post('/api/tasks', async (req, res) => {
    const { description, percentage, projectId } = req.body;
    try {
        const task = await prisma.task.create({
            data: { description, percentage: parseInt(percentage), projectId: parseInt(projectId) }
        });
        res.json(task);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// تحديث حالة المهمة (تم/لم يتم)
app.patch('/api/tasks/:id', async (req, res) => {
    const task = await prisma.task.findUnique({ where: { id: parseInt(req.params.id) } });
    const updatedTask = await prisma.task.update({
        where: { id: parseInt(req.params.id) },
        data: { isCompleted: !task.isCompleted }
    });
    res.json(updatedTask);
});

// حذف مهمة
app.delete('/api/tasks/:id', async (req, res) => {
    await prisma.task.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ ok: true });
});

// جلب الإشعارات غير المقروءة
app.get('/api/notifications', async (req, res) => {
    const notifs = await prisma.notification.findMany({
        where: { isRead: false },
        orderBy: { createdAt: 'desc' }
    });
    res.json(notifs);
});

// تحديد الإشعار كمقروء
app.patch('/api/notifications/:id', async (req, res) => {
    await prisma.notification.update({
        where: { id: parseInt(req.params.id) },
        data: { isRead: true }
    });
    res.json({ ok: true });
});

const PORT = 3000;
app.listen(PORT,"0.0.0.0", () => {
    console.log(`🚀 النظام الذكي محمي وجاهز على http://localhost:${PORT}`);
});
