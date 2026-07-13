const jwt = require('jsonwebtoken');

// يتحقق من التوكن (JWT) المُرسَل بترويسة Authorization: Bearer <token>،
// ويحط هوية المستخدم (وأهم شي companyId، أساس عزل بيانات كل شركة عن
// الثانية) على req.user. أي مسار بعد هذا الميدل وير يعتمد فقط على
// req.user.companyId، وما يثق أبداً بأي companyId قادم من المتصفح.
module.exports = function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'يجب تسجيل الدخول للوصول لهذا المسار' });
    }

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
        req.user = { userId: payload.userId, role: payload.role, companyId: payload.companyId };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'جلسة الدخول منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً' });
    }
};
