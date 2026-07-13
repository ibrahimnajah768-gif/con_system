// سكربت ترحيل لمرة واحدة: يحدّد "مالك" كل شركة (أول مستخدم انسجل فيها
// حسب تاريخ الإنشاء)، ويمنحه isOwner=true + كل الصلاحيات، حتى المستخدمين
// اللي انسجلوا قبل ميزة الصلاحيات هذي يرجعون يشتغلون صح (المؤسس الحقيقي
// يرجع "مالك" تلقائياً بدل ما يكون مستخدم عادي).
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

(async () => {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const company of companies) {
    const founder = await prisma.user.findFirst({
      where: { companyId: company.id },
      orderBy: { createdAt: 'asc' },
    });
    if (!founder) {
      console.log(`الشركة #${company.id} (${company.name}): لا يوجد مستخدمين`);
      continue;
    }
    await prisma.user.update({
      where: { id: founder.id },
      data: { isOwner: true, canAdd: true, canEdit: true, canDelete: true },
    });
    console.log(`الشركة #${company.id} (${company.name}): المالك = ${founder.name} <${founder.email}>`);
  }
  await prisma.$disconnect();
  console.log('✅ اكتمل الترحيل.');
})().catch(async (err) => {
  console.error('❌ فشل الترحيل:', err);
  await prisma.$disconnect();
  process.exit(1);
});
