const oracledb = require('oracledb');
require('dotenv').config();

// Oracle thin mode by default in oracledb 6+ (hỗ trợ tốt Oracle 23ai)
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = false; // Chủ động quản lý transaction

const dbConfig = {
    user: process.env.DB_USER || 'admin_shopee',
    password: process.env.DB_PASSWORD || 'oracle',
    connectString: process.env.DB_CONNECT_STRING || 'localhost:1521/shopeelogistics',
    poolMin: 5,
    poolMax: 25,
    poolIncrement: 2,
    poolTimeout: 60
};

let pool;

async function initDb() {
    try {
        pool = await oracledb.createPool(dbConfig);
        console.log('✅ Kết nối Oracle DB Pool thành công (shopeelogistics)!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo Oracle DB Pool:', err.message);
        console.log('⚠️ Đảm bảo Oracle PDB "shopeelogistics" đang chạy.');
    }
}

async function getConnection() {
    if (!pool) {
        await initDb();
    }
    return await pool.getConnection();
}

async function executeQuery(sql, params = {}, options = {}) {
    let conn;
    try {
        conn = await getConnection();
        const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: true, ...options };
        const result = await conn.execute(sql, params, opts);
        return result;
    } catch (err) {
        console.error('Lỗi truy vấn SQL:', err.message, '\nQuery:', sql);
        throw err;
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error('Lỗi đóng kết nối:', err);
            }
        }
    }
}

module.exports = {
    initDb,
    getConnection,
    executeQuery,
    oracledb
};
