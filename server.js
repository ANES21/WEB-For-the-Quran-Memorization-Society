require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// الاتصال التلقائي بقاعدة بيانات MySQL المرفقة في Railway عبر الرابط الموحد
const pool = mysql.createPool({
    uri: process.env.MYSQL_URL || process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// اختبار الاتصال بالقاعدة عند بدء التشغيل
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ خطأ في الاتصال بقاعدة بيانات MySQL:', err.message);
    } else {
        console.log('✓ تم الاتصال بقاعدة بيانات MySQL بنجاح على Railway.');
        connection.release();
    }
});

// ==========================================
// أ. مسار تسجيل الدخول (Login)
// ==========================================
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' });
    }

    pool.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ error: 'حدث خطأ في السيرفر' });
        if (results.length === 0) return res.status(401).json({ error: 'بيانات الاعتماد غير صحيحة' });

        const user = results[0];
        
        // تحقق مبسط من كلمة المرور
        if (user.password !== password) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }

        return res.status(200).json({
            message: 'تم تسجيل الدخول بنجاح عبر خادم MySQL الموحد',
            user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role }
        });
    });
});

// ==========================================
// ب. مسار إنشاء حساب جديد (Register)
// ==========================================
app.post('/api/register', (req, res) => {
    const { name, email, age, role, password } = req.body;

    if (!name || !email || !age || !role || !password) {
        return res.status(400).json({ error: 'يرجى ملء جميع الحقول المطلوبة' });
    }

    const query = 'INSERT INTO users (name, email, age, role, password) VALUES (?, ?, ?, ?, ?)';
    pool.query(query, [name, email, parseInt(age), role, password], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'فشل إنشاء الحساب، قد يكون البريد مستخدماً بالفعل' });
        }
        
        const userId = result.insertId;

        if (role === 'Student') {
            pool.query('INSERT INTO students (student_id) VALUES (?)', [userId], (studentErr) => {
                if (studentErr) console.error('خطأ في إدراج الطالب:', studentErr.message);
            });
        }

        return res.status(200).json({ message: 'تم تسجيل حسابك بنجاح في منظومة المعالي!' });
    });
});

// ==========================================
// ج. عرض الملفات الثابتة (Frontend Static)
// ==========================================
app.use(express.static(path.join(__dirname, './')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.listen(port, () => {
    console.log(`🚀 السيرفر الموحد يعمل بكفاءة على المنفذ: ${port}`);
});
