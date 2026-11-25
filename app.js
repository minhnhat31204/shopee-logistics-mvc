require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const compression = require('compression');
const db = require('./config/db');
const { translateText, i18nClientScript } = require('./config/i18n');
const logisticsRoutes = require('./routes/logisticsRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Nén dữ liệu Gzip / Deflate giúp giảm 70-80% dung lượng HTML/JSON truyền tải qua mạng
app.use(compression());

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'shopee_secret_key_2024',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 ngày
}));

// Static files (phục vụ CSS, JS client nếu có)
app.use(express.static(path.join(__dirname, 'public')));

// Global template variables
app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.cartCount = req.session.cart ? req.session.cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0) : 0;
    res.locals.__ = (key) => translateText(key, req.session.lang || 'vi');
    res.locals.currentLang = req.session.lang || 'vi';
    res.locals.i18nClientScript = i18nClientScript;
    next();
});

// Routes
app.use('/', logisticsRoutes);

// Khởi chạy server và kết nối CSDL
app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🚀 Shopee Logistics MVC Server đang chạy tại: http://localhost:${PORT}`);
    console.log(`====================================================`);
    try {
        await db.initDb();
    } catch (e) {
        console.error('Không thể kết nối Oracle ngay lúc này:', e.message);
    }
});
