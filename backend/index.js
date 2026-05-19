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

app.use(cors());
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
    const { name, location, companyId } = req.body;
    const branch = await prisma.branch.create({ data: { name, location, companyId: parseInt(companyId) } });
    res.json(branch);
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
            materials: { include: { supplier: true } }, // تم التعديل لجلب المورد مع المادة
            attachments: true 
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(projects);
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

app.post('/api/expense', async (req, res) => {
    const { description, amount, projectId } = req.body;
    try {
        const expense = await prisma.expense.create({
            data: { description: req.body.description, amount: parseFloat(req.body.amount), projectId: parseInt(req.body.projectId) }
        });
        res.json(expense);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- المواد (تم التعديل لإضافة ربط المورد) ---
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
                supplierId: supplierId ? parseInt(supplierId) : null // ربط المادة بالمورد إذا وجد
            }
        });
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

// --- الموردين (جديد) ---
app.get('/api/suppliers', async (req, res) => {
    const suppliers = await prisma.supplier.findMany({
        include: { materials: true } // جلب المواد التابعة لكل مورد لحساب الديون
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
        const url = `http://localhost:3000/uploads/${req.file.filename}`;
        const attachment = await prisma.attachment.create({
            data: { name: req.body.name || req.file.originalname, url: url, fileType: req.file.mimetype, projectId: parseInt(req.body.projectId) }
        });
        res.json(attachment);
    } catch (error) { res.status(500).json({ error: error.message }); }
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

// ==========================================
// --- الجديد: نظام الحضور والرواتب (HR) ---
// ==========================================

// 1. جلب الموظفين (تعديل الجلب ليشمل الحضور والرواتب)
app.get('/api/employees', async (req, res) => {
    const employees = await prisma.employee.findMany({ 
        include: { 
            branch: true,
            attendances: true,
            salaryPayments: true
        },
        orderBy: { createdAt: 'desc' }
    });
    res.json(employees);
});

// 2. تسجيل الحضور (حاضر / غائب)
app.post('/api/attendance', async (req, res) => {
    const { employeeId, status } = req.body;
    try {
        const attendance = await prisma.attendance.create({
            data: { employeeId: parseInt(employeeId), status }
        });
        res.json(attendance);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. تسجيل دفعة راتب (أسبوعي / شهري)
app.post('/api/salary-payment', async (req, res) => {
    const { employeeId, amount, type } = req.body;
    try {
        const payment = await prisma.salaryPayment.create({
            data: { 
                employeeId: parseInt(employeeId), 
                amount: parseFloat(amount), 
                type: type || "أسبوعي" 
            }
        });
        res.json(payment);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. تعديل بيانات موظف (Patch)
app.patch('/api/employee/:id', async (req, res) => {
    try {
        const data = await prisma.employee.update({
            where: { id: parseInt(req.params.id) },
            data: { 
                name: req.body.name, 
                position: req.body.position, 
                salary: parseFloat(req.body.salary),
                branchId: parseInt(req.body.branchId)
            }
        });
        res.json(data);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- (إضافة الموظف الأصلية كما هي) ---
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

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 النظام محمي والسيرفر جاهز على http://localhost:${PORT}`);
});