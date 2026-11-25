const express = require('express');
const router = express.Router();
const LogisticsController = require('../controllers/logisticsController');

// Middlewares kiểm tra quyền
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
    if (req.session.user.roleId !== 1 && req.session.user.roleName !== 'ADMIN') {
        return res.status(403).send('Truy cập bị từ chối: Quyền Quản trị viên (Admin) được yêu cầu!');
    }
    next();
};

const requireShopkeeper = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
    if (req.session.user.roleId !== 3 && req.session.user.roleName !== 'SHOPKEEPER' && req.session.user.roleId !== 1) {
        return res.status(403).send('Truy cập bị từ chối: Dành cho Chủ gian hàng (Shopkeeper)!');
    }
    next();
};

// ==========================================
// 1. TRANG CHỦ & KHÁCH HÀNG
// ==========================================
router.get('/lang/:lang', (req, res) => {
    const lang = req.params.lang === 'en' ? 'en' : 'vi';
    req.session.lang = lang;
    res.cookie('shopee_lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000 });
    const backUrl = req.headers.referer || '/';
    res.redirect(backUrl);
});
router.get('/', LogisticsController.getHome);
router.get('/product/:id', LogisticsController.getProductDetail);
router.post('/product/review', requireAuth, LogisticsController.postProductReview);

// Giỏ hàng & Thanh toán
router.get('/cart', LogisticsController.getCart);
router.post('/cart/add', LogisticsController.addToCart);
router.get('/cart/remove/:sku', LogisticsController.removeFromCart);
router.get('/checkout', LogisticsController.getCheckout);
router.post('/checkout', LogisticsController.postCheckout);
router.get('/tracking/:orderId', LogisticsController.getTracking);
router.get('/my-orders', requireAuth, LogisticsController.getMyOrders);
router.post('/my-orders/cancel', requireAuth, LogisticsController.postCustomerCancelOrder);
router.get('/favorites', requireAuth, LogisticsController.getFavoritesPage);
router.post('/api/favorite/toggle', requireAuth, LogisticsController.toggleFavoriteApi);
router.get('/api/search/live', LogisticsController.getLiveSearchApi);

// Hồ sơ cá nhân (Yêu cầu 6)
router.get('/profile', requireAuth, LogisticsController.getProfile);
router.post('/profile/update', requireAuth, LogisticsController.postUpdateProfile);
router.post('/profile/delete-account', requireAuth, LogisticsController.postDeleteAccount);

// Đăng nhập / Đăng ký bằng Email & Quên Mật Khẩu
router.get('/login', LogisticsController.getLogin);
router.post('/login', LogisticsController.postLogin);
router.get('/register', LogisticsController.getRegister);
router.post('/register', LogisticsController.postRegister);
router.get('/logout', LogisticsController.logout);

// Quên Mật Khẩu & Gửi OTP 20 giây
router.get('/forgot-password', LogisticsController.getForgotPassword);
router.post('/forgot-password/send-code', LogisticsController.postSendResetCode);
router.post('/forgot-password/reset', LogisticsController.postVerifyAndResetPassword);

// Lịch sử tìm kiếm API (Xóa từng từ khóa hoặc xóa hết)
router.post('/api/search-history/delete', LogisticsController.deleteSearchHistory);
router.post('/api/search-history/clear-all', LogisticsController.clearAllSearchHistory);

// Chat API (Yêu cầu 8)
router.get('/api/chat', LogisticsController.getChatMessagesApi);
router.post('/api/chat/send', LogisticsController.postSendChatMessage);

// ==========================================
// 2. ADMIN ROLE ROUTES (ĐẦY ĐỦ THÊM / SỬA / XÓA)
// ==========================================
router.get('/admin', requireAdmin, (req, res) => res.redirect('/admin/dashboard'));
router.get('/admin/dashboard', requireAdmin, LogisticsController.getAdminDashboard);

// User: Thêm / Sửa / Xóa
router.get('/admin/users', requireAdmin, LogisticsController.getAdminUsers);
router.post('/admin/users/create', requireAdmin, LogisticsController.postAdminCreateUser);
router.post('/admin/users/update-role', requireAdmin, LogisticsController.postAdminUpdateRole);
router.post('/admin/users/delete', requireAdmin, LogisticsController.postAdminDeleteUser);

// Shop: Thêm / Sửa / Xóa
router.get('/admin/shops', requireAdmin, LogisticsController.getAdminShops);
router.post('/admin/shops/create', requireAdmin, LogisticsController.postAdminCreateShop);
router.post('/admin/shops/update', requireAdmin, LogisticsController.postAdminUpdateShop);
router.post('/admin/shops/delete', requireAdmin, LogisticsController.postAdminDeleteShop);

// Categories: Thêm / Sửa / Xóa
router.get('/admin/categories', requireAdmin, LogisticsController.getAdminCategories);
router.post('/admin/categories/create', requireAdmin, LogisticsController.postAdminCreateCategory);
router.post('/admin/categories/update', requireAdmin, LogisticsController.postAdminUpdateCategory);
router.post('/admin/categories/delete', requireAdmin, LogisticsController.postAdminDeleteCategory);

// Products & Biến thể SKU: Thêm / Sửa / Xóa
router.get('/admin/products', requireAdmin, LogisticsController.getAdminProducts);
router.post('/admin/products/create', requireAdmin, LogisticsController.postAdminCreateProduct);
router.post('/admin/products/create-variant', requireAdmin, LogisticsController.postAdminCreateVariant);
router.post('/admin/products/update', requireAdmin, LogisticsController.postAdminUpdateProduct);
router.post('/admin/products/delete', requireAdmin, LogisticsController.postAdminDeleteProduct);

// Mục riêng: Biến thể sản phẩm (Admin)
router.get('/admin/variants', requireAdmin, LogisticsController.getAdminVariants);
router.post('/admin/variants/update', requireAdmin, LogisticsController.postAdminUpdateVariant);
router.post('/admin/variants/delete', requireAdmin, LogisticsController.postAdminDeleteVariant);

router.get('/admin/logistics', requireAdmin, LogisticsController.getAdminLogistics);
router.post('/admin/logistics/inbound', requireAdmin, LogisticsController.postProcessInbound);
router.post('/admin/logistics/inbound/update', requireAdmin, LogisticsController.postAdminUpdateInbound);
router.post('/admin/logistics/inbound/delete', requireAdmin, LogisticsController.postAdminDeleteInbound);
router.post('/admin/logistics/outbound-fefo', requireAdmin, LogisticsController.postProcessOutboundFEFO);

// Quản lý Kho Hàng & Vị Trí Kệ & Hàng Tồn (Admin)
router.get('/admin/warehouses', requireAdmin, LogisticsController.getAdminWarehouses);
router.post('/admin/warehouses/create', requireAdmin, LogisticsController.postAdminCreateWarehouse);
router.post('/admin/warehouses/update', requireAdmin, LogisticsController.postAdminUpdateWarehouse);
router.post('/admin/warehouses/delete', requireAdmin, LogisticsController.postAdminDeleteWarehouse);

router.get('/admin/locations', requireAdmin, LogisticsController.getAdminLocations);
router.post('/admin/locations/create', requireAdmin, LogisticsController.postAdminCreateLocation);
router.post('/admin/locations/update', requireAdmin, LogisticsController.postAdminUpdateLocation);
router.post('/admin/locations/delete', requireAdmin, LogisticsController.postAdminDeleteLocation);

router.post('/admin/inventory/move', requireAdmin, LogisticsController.postAdminMoveInventory);
router.post('/admin/inventory/update', requireAdmin, LogisticsController.postAdminUpdateInventory);
router.post('/admin/inventory/delete', requireAdmin, LogisticsController.postAdminDeleteInventory);
router.get('/admin/orders', requireAdmin, LogisticsController.getAdminOrders);
router.post('/admin/orders/update-status', requireAdmin, LogisticsController.postUpdateOrderStatus);
router.post('/admin/orders/update-info', requireAdmin, LogisticsController.postAdminUpdateOrderInfo);
router.post('/admin/orders/delete', requireAdmin, LogisticsController.postAdminDeleteOrder);
router.get('/admin/banners', requireAdmin, LogisticsController.getAdminBanners);

// ==========================================
// 3. SHOPKEEPER ROLE ROUTES
// ==========================================
router.get('/shop', requireShopkeeper, (req, res) => res.redirect('/shop/dashboard'));
router.get('/shop/dashboard', requireShopkeeper, LogisticsController.getShopDashboard);
router.get('/shop/products', requireShopkeeper, LogisticsController.getShopProducts);
router.post('/shop/products/create', requireShopkeeper, LogisticsController.postShopCreateProduct);
router.post('/shop/products/create-variant', requireShopkeeper, LogisticsController.postShopCreateVariant);
router.post('/shop/products/update', requireShopkeeper, LogisticsController.postAdminUpdateProduct);
router.post('/shop/products/delete', requireShopkeeper, LogisticsController.postAdminDeleteProduct);

// Mục riêng: Biến thể sản phẩm (Shopkeeper)
router.get('/shop/variants', requireShopkeeper, LogisticsController.getShopVariants);
router.post('/shop/variants/update', requireShopkeeper, LogisticsController.postShopUpdateVariant);
router.post('/shop/variants/delete', requireShopkeeper, LogisticsController.postShopDeleteVariant);
router.get('/shop/inbound', requireShopkeeper, LogisticsController.getShopInbound);
router.post('/shop/inbound/create', requireShopkeeper, LogisticsController.postShopCreateInbound);
router.post('/shop/inbound/update', requireShopkeeper, LogisticsController.postShopUpdateInbound);
router.post('/shop/inbound/delete', requireShopkeeper, LogisticsController.postShopDeleteInbound);

// Quản lý Đơn Hàng & Chuyển trạng thái đơn hàng (Shopkeeper)
router.get('/shop/orders', requireShopkeeper, LogisticsController.getShopOrders);
router.post('/shop/orders/update-status', requireShopkeeper, LogisticsController.postShopUpdateOrderStatus);
router.post('/shop/orders/update-info', requireShopkeeper, LogisticsController.postShopUpdateOrderInfo);
router.post('/shop/orders/delete', requireShopkeeper, LogisticsController.postShopDeleteOrder);

module.exports = router;
