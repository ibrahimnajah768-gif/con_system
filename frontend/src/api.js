export const API_BASE = 'http://192.168.10.9:3000';

// دالة موحّدة لكل نداءات الـ API: تضيف رابط السيرفر ورمز الدخول
// (Authorization) تلقائياً، وتتعامل مع انتهاء الجلسة (401) بتسجيل خروج
// تلقائي بدل ما تضل الشاشة فاضية بصمت. تُقرأ قيمة التوكن من localStorage
// بكل نداء (مو قيمة محفوظة سابقاً)، حتى تنعكس أي تغييرات فورية (دخول/خروج).
export async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('token');
    const isFormData = options.body instanceof FormData;

    const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
    };

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
        localStorage.clear();
        window.location.reload();
        throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مجدداً');
    }

    return res;
}
