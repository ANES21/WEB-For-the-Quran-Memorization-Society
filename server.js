require('dotenv').config(); // 👈 1. تفعيل حزمة dotenv لقراءة الإعدادات الحساسة فوراً
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 8080; // يمكن تعديل المنفذ ديناميكياً من ملف .env

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 👈 2. الربط بـ Supabase باستخدام المسميات القياسية الكبيرة (UPPERCASE)
const supabaseUrl = process.env.SUPABASE_URL; 
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ خطأ حرج: متغيرات البيئة SUPABASE_URL أو SUPABASE_KEY مفقودة في ملف .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
console.log('✓ تم إعداد حزمة Supabase من ملف البيئة الآمن بنجاح.');

// ==========================================
// و. جدار حماية للتحقق من التوكن وصلاحية الدخول (Auth Middleware)
// ==========================================
const requireAuth = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'غير مصرح لك بالدخول، التوكن مفقود!' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'جلسة الدخول منتهية أو غير صالحة' });
        }

        req.user = user;
        next();
    } catch (err) {
        return res.status(501).json({ error: 'فشل التحقق الآمن في الخادم' });
    }
};

// ==========================================
// أ. مسار تسجيل الدخول (Login)
// ==========================================
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    try {
        // 1. التحقق من الهوية عبر نظام حماية Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (authError) {
            return res.status(401).json({ error: 'فشل التحقق: ' + authError.message });
        } // 👈 تم حذف الكلمة الزائدة التي كانت تسبب خطأً هنا

        // 2. جلب بيانات ملف التعريف الخاص بالمستخدم من جدول SQL (users)
        const { data: userProfile, error: profileError } = await supabase
            .from('users')
            .select('name, role, age')
            .eq('email', email)
            .single();

        if (profileError || !userProfile) {
            return res.status(404).json({ error: 'تم التحقق، ولكن لم يتم العثور على ملف المستخدم في جدول SQL' });
        }

        return res.status(200).json({
            message: 'تم تسجيل الدخول بنجاح عبر خادم مكتب ملاكو',
            token: authData.session.access_token,
            user: userProfile
        });

    } catch (err) {
        return res.status(500).json({ error: 'حدث خطأ غير متوقع في الخادم' });
    }
});

// ==========================================
// ب. مسار ترقية الطالب في الحفظ (Teacher - Progress)
// ==========================================
app.post('/api/teacher/promote', requireAuth, async (req, res) => {
    const { student_id, previous_level, new_level } = req.body;

    if (!student_id || !new_level) {
        return res.status(400).json({ error: 'البيانات المرسلة غير مكتملة' });
    }

    try {
        const { error: progressError } = await supabase
            .from('progress')
            .insert([
                { 
                    student_id: student_id, 
                    previous_level: previous_level, 
                    new_level: new_level, 
                    promotion_date: new Date() 
                }
            ]);

        if (progressError) throw progressError;

        const { error: studentError } = await supabase
            .from('students')
            .update({ current_level: new_level })
            .eq('student_id', student_id);

        if (studentError) throw studentError;

        return res.status(200).json({ message: 'مبارك! تم ترقية الطالب في الحفظ بنجاح وتحديث البيانات حياً' });

    } catch (err) {
        return res.status(500).json({ error: 'فشل الترقية: ' + err.message });
    }
});

// ==========================================
// ج. مسار الحركات المالية (Cashier - Transactions)
// ==========================================
app.post('/api/cashier/transaction', requireAuth, async (req, res) => {
    const { amount, type, cashier_id } = req.body;

    if (!amount || !type || !cashier_id) {
        return res.status(400).json({ error: 'بيانات الحركة المالية ناقصة أو غير صحيحة' });
    }

    try {
        const { error } = await supabase
            .from('transactions')
            .insert([
                { 
                    amount: parseFloat(amount), 
                    type: type, 
                    cashier_id: cashier_id 
                }
            ]);

        if (error) throw error;

        return res.status(200).json({ message: 'تم ترحيل السند المالي بنجاح إلى خزينة Supabase SQL' });

    } catch (err) {
        return res.status(500).json({ error: 'فشل معالجة السند: ' + err.message });
    }
});

// ==========================================
// د. مسار إنشاء حساب جديد وتحديد الدور (Register Role)
// ==========================================
app.post('/api/register', async (req, res) => {
    const { name, email, age, role, password } = req.body;

    if (!name || !email || !age || !role || !password) {
        return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة' });
    }

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (authError) {
            return res.status(400).json({ error: 'خطأ في نظام الحماية: ' + authError.message });
        }

        const userId = authData.user.id;

        const { error: userError } = await supabase
            .from('users')
            .insert([
                {
                    user_id: userId,
                    name: name,
                    email: email,
                    age: parseInt(age),
                    role: role 
                }
            ]);

        if (userError) {
            return res.status(500).json({ error: 'فشل حفظ ملف تعريف المستخدم: ' + userError.message });
        }

        if (role.toLowerCase() === 'student') {
            const { error: studentError } = await supabase
                .from('students')
                .insert([
                    {
                        student_id: userId,
                        current_level: 'المبتدئ', 
                        is_active: true          
                    }
                ]);

            if (studentError) {
                return res.status(500).json({ error: 'تم إنشاء الحساب، ولكن فشل قيده في سجل الطلاب: ' + studentError.message });
            }
        }

        return res.status(200).json({ 
            message: `تم تسجيل حسابك كـ (${role}) بنجاح في منظومة مكتب ملاكو!` 
        });

    } catch (err) {
        return res.status(500).json({ error: 'حدث خطأ غير متوقع في خادم التسجيل الذكي' });
    }
});

// ==========================================
// هـ. مسار جلب إشعارات الطالب (Notifications)
// ==========================================
app.get('/api/notifications/:student_id', requireAuth, async (req, res) => {
    const { student_id } = req.params;

    if (!student_id) {
        return res.status(400).json({ error: 'معرف الطالب مطلوب' });
    }

    try {
        const { data: notifications, error } = await supabase
            .from('progress')
            .select('*')
            .eq('student_id', student_id)
            .order('promotion_date', { ascending: false })
            .limit(5);

        if (error) throw error;

        const formattedNotifications = notifications.map(notif => ({
            id: notif.progress_id,
            text: `تهانينا! لقد تم ترقيتك بنجاح من مستوى (${notif.previous_level || 'المبتدئ'}) إلى مستوى (${notif.new_level}).`,
            date: notif.promotion_date
        }));

        return res.status(200).json(formattedNotifications);

    } catch (err) {
        return res.status(500).json({ error: 'فشل جلب الإشعارات: ' + err.message });
    }
});

// ==========================================
// ز. مسار جلب تفاصيل حلقة ومجموعة الطالب (Groups)
// ==========================================
app.get('/api/student/group/:student_id', requireAuth, async (req, res) => {
    const { student_id } = req.params;

    try {
        const { data: studentData, error } = await supabase
            .from('students')
            .select(`
                current_level,
                groups (
                    group_name,
                    teacher_name,
                    schedule
                )
            `)
            .eq('student_id', student_id)
            .single();

        if (error || !studentData) {
            return res.status(404).json({ error: 'لم يتم العثور على سجلات الطالب أو الحلقة' });
        }

        return res.status(200).json(studentData);

    } catch (err) {
        return res.status(500).json({ error: 'حدث خطأ في خادم جلب بيانات المجموعة: ' + err.message });
    }
});

// ==========================================
// ط. مسار جلب الواجبات والأوراد اليومية (Assignments)
// ==========================================
app.get('/api/student/assignments/:student_id', requireAuth, async (req, res) => {
    const { student_id } = req.params;

    if (!student_id) {
        return res.status(400).json({ error: 'معرف الطالب مطلوب' });
    }

    try {
        const { data: assignments, error } = await supabase
            .from('assignments')
            .select('*')
            .eq('student_id', student_id)
            .order('is_completed', { ascending: true })
            .order('due_date', { ascending: false });

        if (error) throw error;

        return res.status(200).json(assignments);

    } catch (err) {
        return res.status(500).json({ error: 'فشل جلب جدول الأوراد والواجبات: ' + err.message });
    }
});

// ==========================================
// ي. جلب جميع المستخدمين (Admin)
// ==========================================
app.get('/api/admin/users', requireAuth, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('user_id, name, email, age, role')
            .order('name', { ascending: true });
        if (error) throw error;
        return res.status(200).json(users);
    } catch (err) {
        return res.status(500).json({ error: 'فشل جلب المستخدمين: ' + err.message });
    }
});

// ==========================================
// ك. تفعيل / إيقاف حساب (Admin)
// ==========================================
app.patch('/api/admin/users/:user_id/toggle', requireAuth, async (req, res) => {
    const { user_id } = req.params;
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') {
        return res.status(400).json({ error: 'قيمة is_active يجب أن تكون true أو false' });
    }
    try {
        const { error } = await supabase.from('users').update({ is_active }).eq('user_id', user_id);
        if (error) throw error;
        await supabase.from('students').update({ is_active }).eq('student_id', user_id);
        return res.status(200).json({ message: `تم ${is_active ? 'تفعيل' : 'إيقاف'} الحساب بنجاح` });
    } catch (err) {
        return res.status(500).json({ error: 'فشل تعديل الحساب: ' + err.message });
    }
});

// ==========================================
// ل. إدارة الحلقات والمجموعات (Admin - Groups API)
// ==========================================
app.get('/api/admin/groups', requireAuth, async (req, res) => {
    try {
        const { data: groups, error } = await supabase
            .from('groups')
            .select('*')
            .order('group_name', { ascending: true });
        if (error) throw error;
        return res.status(200).json(groups);
    } catch (err) {
        return res.status(500).json({ error: 'فشل جلب الحلقات: ' + err.message });
    }
});

app.post('/api/admin/groups', requireAuth, async (req, res) => {
    const { group_name, teacher_name, schedule } = req.body;
    if (!group_name || !teacher_name || !schedule) {
        return res.status(400).json({ error: 'جميع حقول الحلقة مطلوبة' });
    }
    try {
        const { error } = await supabase.from('groups').insert([{ group_name, teacher_name, schedule }]);
        if (error) throw error;
        return res.status(200).json({ message: 'تم إنشاء الحلقة بنجاح' });
    } catch (err) {
        return res.status(500).json({ error: 'فشل إنشاء الحلقة: ' + err.message });
    }
});

// ==========================================
// م. سجل الترقيات الكامل (Admin)
// ==========================================
app.get('/api/admin/progress', requireAuth, async (req, res) => {
    try {
        const { data: records, error } = await supabase
            .from('progress')
            .select('*')
            .order('promotion_date', { ascending: false });
        if (error) throw error;
        return res.status(200).json(records);
    } catch (err) {
        return res.status(500).json({ error: 'فشل جلب الترقيات: ' + err.message });
    }
});

// ==========================================
// ن. المدفوعات (Admin - Payments)
// ==========================================
app.get('/api/admin/payments', requireAuth, async (req, res) => {
    try {
        const { data: payments, error } = await supabase
            .from('payments')
            .select('*')
            .order('payment_date', { ascending: false });
        if (error) throw error;
        return res.status(200).json(payments);
    } catch (err) {
        return res.status(500).json({ error: 'فشل جلب المدفوعات: ' + err.message });
    }
});

app.post('/api/admin/payments', requireAuth, async (req, res) => {
    const { student_id, amount, payment_type, payment_status } = req.body;
    if (!student_id || !amount || !payment_type) {
        return res.status(400).json({ error: 'بيانات الدفعة ناقصة' });
    }
    try {
        const { error } = await supabase
            .from('payments')
            .insert([{
                student_id,
                amount: parseFloat(amount),
                payment_type,
                payment_status: payment_status || 'مكتملة',
                payment_date: new Date()
            }]);
        if (error) throw error;
        return res.status(200).json({ message: 'تم ترحيل السند المالي بنجاح' });
    } catch (err) {
        return res.status(500).json({ error: 'فشل ترحيل السند: ' + err.message });
    }
});

// ==========================================
// س. مسار تعيين أو نقل طالب إلى مجموعة معينة
// ==========================================
app.put('/api/admin/assign-student-group', requireAuth, async (req, res) => {
    const { student_id, group_id } = req.body;
    if (!student_id) return res.status(400).json({ error: 'معرف الطالب مطلوب' });

    try {
        const { data, error } = await supabase
            .from('users')
            .update({ group_id: group_id || null })
            .eq('user_id', student_id)
            .select();

        if (error) throw error;
        return res.status(200).json({ message: '✓ تم تحديث فوج وحلقة الطالب بنجاح', data });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// تشغيل السيرفر والإنصات للطلبات
app.listen(port, () => {
    console.log(`🚀 خادم جمعية المعالي نشط ويعمل على الرابط: http://localhost:${port}`);
});