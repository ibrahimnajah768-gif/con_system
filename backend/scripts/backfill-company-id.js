// سكربت ترحيل لمرة واحدة: ينسب كل الصفوف الموجودة (من قبل نظام تعدد
// الشركات) لأول شركة موجودة بقاعدة البيانات، حتى تصير الأعمدة الجديدة
// (companyId) جاهزة نحوّلها إلى NOT NULL بأمان.
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

(async () => {
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } });
  if (!company) {
    console.log('لا توجد أي شركة بقاعدة البيانات — لا حاجة للترحيل.');
    process.exit(0);
  }
  console.log(`الشركة الافتراضية للترحيل: #${company.id} - ${company.name}`);

  const models = ['user', 'employee', 'project', 'supplier', 'officeExpense', 'notification'];
  for (const model of models) {
    const before = await prisma[model].count({ where: { companyId: null } });
    const result = await prisma[model].updateMany({
      where: { companyId: null },
      data: { companyId: company.id },
    });
    const after = await prisma[model].count({ where: { companyId: null } });
    console.log(`${model}: كان بدون شركة = ${before}, تم تحديثه = ${result.count}, متبقي بدون شركة = ${after}`);
  }

  await prisma.$disconnect();
  console.log('✅ اكتمل الترحيل.');
})().catch(async (err) => {
  console.error('❌ فشل الترحيل:', err);
  await prisma.$disconnect();
  process.exit(1);
});
