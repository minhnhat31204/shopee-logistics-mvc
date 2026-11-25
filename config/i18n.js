// Bộ từ điển song ngữ hoàn chỉnh Việt - Anh cho toàn bộ hệ thống Shopee Logistics
// Hỗ trợ tự động dịch mọi văn bản, nhãn, nút bấm, bảng biểu trên toàn bộ trang web

const translations = {
    vi: {
        // Trạng thái đơn hàng & giao vận
        "READY_TO_SHIP": "Sẵn sàng giao",
        "IN_TRANSIT": "Đang vận chuyển",
        "DELIVERED": "Đã giao hàng",
        "CANCELLED": "Đã hủy",
        "PENDING": "Chờ xử lý",
        "SHIPPED": "Đã xuất kho",
        "PAID": "Đã thanh toán",
        "UNPAID": "Chưa thanh toán",
        "Sẵn sàng giao": "Sẵn sàng giao",
        "Đang vận chuyển": "Đang vận chuyển",
        "Đã giao hàng": "Đã giao hàng",
        "ĐÃ GIAO THÀNH CÔNG": "ĐÃ GIAO THÀNH CÔNG",
        "Đang giao hàng": "Đang giao hàng",
        "ĐÃ HỦY ĐƠN": "ĐÃ HỦY ĐƠN",
        "ĐÃ HỦY GIAO HÀNG": "ĐÃ HỦY GIAO HÀNG",
        "CHỜ XỬ LÝ": "CHỜ XỬ LÝ",
        "HOÀN THÀNH": "HOÀN THÀNH",
        "Chờ xử lý": "Chờ xử lý",
        "Hoàn thành": "Hoàn thành",
        "BÌNH THƯỜNG": "BÌNH THƯỜNG",
        "SẮP CẬN HẠN": "SẮP CẬN HẠN",
        "CẬN HẠN NGUY HIỂM": "CẬN HẠN NGUY HIỂM",
        "HẾT HẠN": "HẾT HẠN",

        // Header & Menu chung
        "Kênh Người Bán": "Kênh Người Bán",
        "Tải ứng dụng": "Tải ứng dụng",
        "Kết nối": "Kết nối",
        "Thông Báo": "Thông Báo",
        "Hỗ Trợ": "Hỗ Trợ",
        "Tiếng Việt": "Tiếng Việt",
        "English": "English",
        "Thông Tin Của Tôi": "Thông Tin Của Tôi",
        "Đơn Hàng Của Tôi": "Đơn Hàng Của Tôi",
        "Sản Phẩm Yêu Thích": "Sản Phẩm Yêu Thích",
        "Trang Quản Trị": "Trang Quản Trị",
        "Đăng Xuất": "Đăng Xuất",
        "Đăng Ký": "Đăng Ký",
        "Đăng Nhập": "Đăng Nhập",
        "Giao diện Khách": "Giao diện Khách",
        "Bảng Điều Khiển": "Bảng Điều Khiển",
        "Thoát": "Thoát",
        "Xem Web Shop": "Xem Web Shop",

        // Admin & Shop Sidebar
        "HỆ THỐNG LOGISTICS (CHỦ ĐỀ 7)": "HỆ THỐNG LOGISTICS (CHỦ ĐỀ 7)",
        "Quản Lý Hàng Tồn Kho": "Quản Lý Hàng Tồn Kho",
        "Quản Lý Kho Hàng": "Quản Lý Kho Hàng",
        "Vị Trí Kệ Hàng (A-R-S-B)": "Vị Trí Kệ Hàng (A-R-S-B)",
        "Đơn Hàng & Vận Chuyển": "Đơn Hàng & Vận Chuyển",
        "QUẢN TRỊ NGƯỜI DÙNG & SHOP": "QUẢN TRỊ NGƯỜI DÙNG & SHOP",
        "Users & Phân Quyền": "Users & Phân Quyền",
        "Quản Lý Cửa Hàng": "Quản Lý Cửa Hàng",
        "DANH MỤC & HÀNG HÓA": "DANH MỤC & HÀNG HÓA",
        "Danh Mục Phân Cấp": "Danh Mục Phân Cấp",
        "Quản Lý Sản Phẩm": "Quản Lý Sản Phẩm",
        "Biến Thể Sản Phẩm (SKU)": "Biến Thể Sản Phẩm (SKU)",
        "Quản Lý Banner": "Quản Lý Banner",
        "Nhập Kho & Lô Hạn Dùng": "Nhập Kho & Lô Hạn Dùng",
        "Quản Lý Đơn Hàng": "Quản Lý Đơn Hàng",

        // Bảng & Cột dữ liệu
        "MÃ ĐƠN": "MÃ ĐƠN",
        "Mã Đơn": "Mã Đơn",
        "KHÁCH HÀNG & SĐT": "KHÁCH HÀNG & SĐT",
        "Khách Hàng & SĐT": "Khách Hàng & SĐT",
        "TỔNG TIỀN": "TỔNG TIỀN",
        "Tổng Tiền": "Tổng Tiền",
        "ĐỊA CHỈ GIAO": "ĐỊA CHỈ GIAO",
        "Địa Chỉ Giao": "Địa Chỉ Giao",
        "TRẠNG THÁI ĐƠN": "TRẠNG THÁI ĐƠN",
        "Trạng Thái Đơn": "Trạng Thái Đơn",
        "THANH TOÁN": "THANH TOÁN",
        "Thanh Toán": "Thanh Toán",
        "ĐƠN VỊ VẬN CHUYỂN / VẬN ĐƠN": "ĐƠN VỊ VẬN CHUYỂN / VẬN ĐƠN",
        "Đơn Vị Vận Chuyển / Vận Đơn": "Đơn Vị Vận Chuyển / Vận Đơn",
        "TRẠNG THÁI GIAO": "TRẠNG THÁI GIAO",
        "Trạng Thái Giao": "Trạng Thái Giao",
        "HÀNH ĐỘNG": "HÀNH ĐỘNG",
        "Hành Động": "Hành Động",
        "THAO TÁC HÀNG TỒN": "THAO TÁC HÀNG TỒN",
        "KHO & VỊ TRÍ KỆ": "KHO & VỊ TRÍ KỆ",
        "SẢN PHẨM": "SẢN PHẨM",
        "MÃ SKU": "MÃ SKU",
        "MÃ LÔ (BATCH)": "MÃ LÔ (BATCH)",
        "SỐ LƯỢNG TỒN": "SỐ LƯỢNG TỒN",
        "TỒN TỐI THIỂU": "TỒN TỐI THIỂU",
        "HẠN SỬ DỤNG": "HẠN SỬ DỤNG",
        "TRẠNG THÁI TỒN": "TRẠNG THÁI TỒN",

        // Nút bấm & Hành động
        "Xuất Kho FEFO": "Xuất Kho FEFO",
        "Chi Tiết": "Chi Tiết",
        "Xem Chi Tiết": "Xem Chi Tiết",
        "Đổi Trạng Thái": "Đổi Trạng Thái",
        "Chuyển Trạng Thái": "Chuyển Trạng Thái",
        "Hủy Đơn Hàng": "Hủy Đơn Hàng",
        "Đánh Giá Sản Phẩm": "Đánh Giá Sản Phẩm",
        "Xem Đánh Giá": "Xem Đánh Giá",
        "Chưa thể đánh giá": "Chưa thể đánh giá",
        "Đang vận chuyển (Không thể hủy)": "Đang vận chuyển (Không thể hủy)",
        "Đã hủy đơn": "Đã hủy đơn",
        "Lưu Cập Nhật": "Lưu Cập Nhật",
        "Hủy Bỏ": "Hủy Bỏ",
        "Thêm Mới": "Thêm Mới",
        "Chỉnh Sửa Thông Tin": "Chỉnh Sửa Thông Tin",
        "Lưu Thay Đổi": "Lưu Thay Đổi",
        "Hủy Thay Đổi": "Hủy Thay Đổi",
        "Xác Nhận & Đặt Hàng Ngay": "Xác Nhận & Đặt Hàng Ngay",
        "Đặt Hàng": "Đặt Hàng",
        "Thực Thi Cất Kho (PL/SQL)": "Thực Thi Cất Kho (PL/SQL)",
        "Làm mới": "Làm mới",
        "Đổi Vị Trí": "Đổi Vị Trí",
        "Xóa Tồn": "Xóa Tồn",
        "Sửa": "Sửa",
        "Xóa": "Xóa",
        "Hoàn Thành": "Hoàn Thành",
        "Hủy": "Hủy",
        "Tìm kiếm": "Tìm kiếm",

        // Trang Đơn Hàng & Vận Chuyển
        "Theo dõi vận chuyển, kiểm tra tình trạng hàng và viết đánh giá sản phẩm": "Theo dõi vận chuyển, kiểm tra tình trạng hàng và viết đánh giá sản phẩm",
        "Chưa có đơn hàng nào.": "Chưa có đơn hàng nào.",
        "Địa chỉ nhận:": "Địa chỉ nhận:",
        "Thành tiền:": "Thành tiền:",
        "Đánh Giá Sản Phẩm": "Đánh Giá Sản Phẩm",
        "Chất lượng sản phẩm:": "Chất lượng sản phẩm:",
        "Để lại bình luận của bạn:": "Để lại bình luận của bạn:",
        "Tuyệt vời (5 sao)": "Tuyệt vời (5 sao)",
        "Tốt (4 sao)": "Tốt (4 sao)",
        "Bình thường (3 sao)": "Bình thường (3 sao)",
        "Tệ (2 sao)": "Tệ (2 sao)",
        "Rất tệ (1 sao)": "Rất tệ (1 sao)",

        // Footer
        "CHĂM SÓC KHÁCH HÀNG": "CHĂM SÓC KHÁCH HÀNG",
        "Trung Tâm Trợ Giúp": "Trung Tâm Trợ Giúp",
        "Shopee Blog": "Shopee Blog",
        "Shopee Mall": "Shopee Mall",
        "Hướng Dẫn Mua Hàng": "Hướng Dẫn Mua Hàng",
        "Shopee Xu": "Shopee Xu",
        "Vận Chuyển SPX Express": "Vận Chuyển SPX Express",
        "Trả Hàng & Hoàn Tiền": "Trả Hàng & Hoàn Tiền",
        "VỀ SHOPEE": "VỀ SHOPEE",
        "Giới Thiệu Về Shopee Việt Nam": "Giới Thiệu Về Shopee Việt Nam",
        "Tuyển Dụng": "Tuyển Dụng",
        "Điều Khoản Shopee": "Điều Khoản Shopee",
        "Chính Sách Bảo Mật": "Chính Sách Bảo Mật",
        "Chính Hãng": "Chính Hãng",
        "Flash Deals": "Flash Deals",
        "THANH TOÁN & VẬN CHUYỂN": "THANH TOÁN & VẬN CHUYỂN",
        "THEO DÕI CHÚNG TÔI": "THEO DÕI CHÚNG TÔI",
        "TẢI ỨNG DỤNG SHOPEE": "TẢI ỨNG DỤNG SHOPEE",
        "© 2026 Shopee. Tất cả các quyền được bảo lưu.": "© 2026 Shopee. Tất cả các quyền được bảo lưu."
    },
    en: {
        // Statuses
        "READY_TO_SHIP": "Ready to Ship",
        "IN_TRANSIT": "In Transit",
        "DELIVERED": "Delivered",
        "CANCELLED": "Cancelled",
        "PENDING": "Pending",
        "SHIPPED": "Shipped",
        "PAID": "Paid",
        "UNPAID": "Unpaid",
        "Sẵn sàng giao": "Ready to Ship",
        "Đang vận chuyển": "In Transit",
        "Đã giao hàng": "Delivered",
        "ĐÃ GIAO THÀNH CÔNG": "DELIVERED SUCCESSFULLY",
        "Đang giao hàng": "In Transit",
        "ĐÃ HỦY ĐƠN": "CANCELLED",
        "ĐÃ HỦY GIAO HÀNG": "DELIVERY CANCELLED",
        "CHỜ XỬ LÝ": "PENDING",
        "HOÀN THÀNH": "COMPLETED",
        "Chờ xử lý": "Pending",
        "Hoàn thành": "Completed",
        "BÌNH THƯỜNG": "NORMAL",
        "SẮP CẬN HẠN": "NEAR EXPIRY",
        "CẬN HẠN NGUY HIỂM": "EXPIRING SOON",
        "HẾT HẠN": "EXPIRED",

        // Header & Nav
        "Kênh Người Bán": "Seller Centre",
        "Tải ứng dụng": "Download App",
        "Kết nối": "Connect",
        "Thông Báo": "Notifications",
        "Hỗ Trợ": "Help",
        "Tiếng Việt": "Tiếng Việt",
        "English": "English",
        "Thông Tin Của Tôi": "My Profile",
        "Đơn Hàng Của Tôi": "My Orders",
        "Sản Phẩm Yêu Thích": "My Favorites",
        "Trang Quản Trị": "Admin Portal",
        "Đăng Xuất": "Logout",
        "Đăng Ký": "Register",
        "Đăng Nhập": "Login",
        "Giao diện Khách": "Storefront",
        "Bảng Điều Khiển": "Dashboard",
        "Thoát": "Exit",
        "Xem Web Shop": "View Web Shop",

        // Admin & Shop Sidebar
        "HỆ THỐNG LOGISTICS (CHỦ ĐỀ 7)": "LOGISTICS SYSTEM (TOPIC 7)",
        "Quản Lý Hàng Tồn Kho": "Inventory Management",
        "Quản Lý Kho Hàng": "Warehouse Management",
        "Vị Trí Kệ Hàng (A-R-S-B)": "Shelf Locations (A-R-S-B)",
        "Đơn Hàng & Vận Chuyển": "Orders & Shipping",
        "QUẢN TRỊ NGƯỜI DÙNG & SHOP": "USERS & SHOPS MANAGEMENT",
        "Users & Phân Quyền": "Users & Permissions",
        "Quản Lý Cửa Hàng": "Shop Management",
        "DANH MỤC & HÀNG HÓA": "CATEGORIES & PRODUCTS",
        "Danh Mục Phân Cấp": "Hierarchy Categories",
        "Quản Lý Sản Phẩm": "Product Management",
        "Biến Thể Sản Phẩm (SKU)": "Product Variants (SKU)",
        "Quản Lý Banner": "Banner Management",
        "Nhập Kho & Lô Hạn Dùng": "Inbound & Expiry Batches",
        "Quản Lý Đơn Hàng": "Order Management",

        // Tables & Columns
        "MÃ ĐƠN": "ORDER ID",
        "Mã Đơn": "Order ID",
        "KHÁCH HÀNG & SĐT": "CUSTOMER & PHONE",
        "Khách Hàng & SĐT": "Customer & Phone",
        "TỔNG TIỀN": "TOTAL AMOUNT",
        "Tổng Tiền": "Total Amount",
        "ĐỊA CHỈ GIAO": "SHIPPING ADDRESS",
        "Địa Chỉ Giao": "Shipping Address",
        "TRẠNG THÁI ĐƠN": "ORDER STATUS",
        "Trạng Thái Đơn": "Order Status",
        "THANH TOÁN": "PAYMENT",
        "Thanh Toán": "Payment",
        "ĐƠN VỊ VẬN CHUYỂN / VẬN ĐƠN": "CARRIER / WAYBILL",
        "Đơn Vị Vận Chuyển / Vận Đơn": "Carrier / Waybill",
        "TRẠNG THÁI GIAO": "SHIPMENT STATUS",
        "Trạng Thái Giao": "Shipment Status",
        "HÀNH ĐỘNG": "ACTIONS",
        "Hành Động": "Actions",
        "THAO TÁC HÀNG TỒN": "INVENTORY ACTIONS",
        "KHO & VỊ TRÍ KỆ": "WAREHOUSE & SHELF",
        "SẢN PHẨM": "PRODUCT",
        "MÃ SKU": "SKU CODE",
        "MÃ LÔ (BATCH)": "BATCH NO.",
        "SỐ LƯỢNG TỒN": "STOCK QTY",
        "TỒN TỐI THIỂU": "MIN STOCK",
        "HẠN SỬ DỤNG": "EXPIRY DATE",
        "TRẠNG THÁI TỒN": "STOCK STATUS",

        // Buttons & Actions
        "Xuất Kho FEFO": "Outbound FEFO",
        "Chi Tiết": "Details",
        "Xem Chi Tiết": "View Details",
        "Đổi Trạng Thái": "Change Status",
        "Chuyển Trạng Thái": "Update Status",
        "Hủy Đơn Hàng": "Cancel Order",
        "Đánh Giá Sản Phẩm": "Review Product",
        "Xem Đánh Giá": "View Review",
        "Chưa thể đánh giá": "Review Not Available Yet",
        "Đang vận chuyển (Không thể hủy)": "In Transit (Cannot Cancel)",
        "Đã hủy đơn": "Cancelled",
        "Lưu Cập Nhật": "Save Changes",
        "Hủy Bỏ": "Cancel",
        "Thêm Mới": "Create New",
        "Chỉnh Sửa Thông Tin": "Edit Profile",
        "Lưu Thay Đổi": "Save Changes",
        "Hủy Thay Đổi": "Cancel Changes",
        "Xác Nhận & Đặt Hàng Ngay": "Confirm & Place Order",
        "Đặt Hàng": "Place Order",
        "Thực Thi Cất Kho (PL/SQL)": "Put Away (PL/SQL)",
        "Làm mới": "Refresh",
        "Đổi Vị Trí": "Move Location",
        "Xóa Tồn": "Delete Stock",
        "Sửa": "Edit",
        "Xóa": "Delete",
        "Hoàn Thành": "Submit",
        "Hủy": "Cancel",
        "Tìm kiếm": "Search",

        // Order Page
        "Theo dõi vận chuyển, kiểm tra tình trạng hàng và viết đánh giá sản phẩm": "Track delivery, check package status and write product reviews",
        "Chưa có đơn hàng nào.": "No orders found.",
        "Địa chỉ nhận:": "Shipping address:",
        "Thành tiền:": "Total payment:",
        "Đánh Giá Sản Phẩm": "Review Product",
        "Chất lượng sản phẩm:": "Product quality:",
        "Để lại bình luận của bạn:": "Write your review:",
        "Tuyệt vời (5 sao)": "Excellent (5 stars)",
        "Tốt (4 sao)": "Good (4 stars)",
        "Bình thường (3 sao)": "Average (3 stars)",
        "Tệ (2 sao)": "Poor (2 stars)",
        "Rất tệ (1 sao)": "Very poor (1 star)",

        // Footer
        "CHĂM SÓC KHÁCH HÀNG": "CUSTOMER CARE",
        "Trung Tâm Trợ Giúp": "Help Centre",
        "Shopee Blog": "Shopee Blog",
        "Shopee Mall": "Shopee Mall",
        "Hướng Dẫn Mua Hàng": "How to Buy",
        "Shopee Xu": "Shopee Coins",
        "Vận Chuyển SPX Express": "SPX Express Shipping",
        "Trả Hàng & Hoàn Tiền": "Return & Refund",
        "VỀ SHOPEE": "ABOUT SHOPEE",
        "Giới Thiệu Về Shopee Việt Nam": "About Shopee Vietnam",
        "Tuyển Dụng": "Shopee Careers",
        "Điều Khoản Shopee": "Shopee Terms",
        "Chính Sách Bảo Mật": "Privacy Policy",
        "Chính Hãng": "Shopee Authentic",
        "Flash Deals": "Flash Deals",
        "THANH TOÁN & VẬN CHUYỂN": "PAYMENT & LOGISTICS",
        "THEO DÕI CHÚNG TÔI": "FOLLOW US",
        "TẢI ỨNG DỤNG SHOPEE": "DOWNLOAD SHOPEE APP",
        "© 2026 Shopee. Tất cả các quyền được bảo lưu.": "© 2026 Shopee. All rights reserved."
    }
};

function translateText(key, lang = 'vi') {
    if (!key) return '';
    const currentLang = (lang === 'en') ? 'en' : 'vi';
    return (translations[currentLang] && translations[currentLang][key]) || (translations['vi'] && translations['vi'][key]) || key;
}

// Script Client-Side chuyển đổi ngôn ngữ toàn diện
const i18nClientScript = `
<script>
(function() {
    window.I18N_DICTIONARY = ${JSON.stringify(translations)};
    
    window.getCurrentLang = function() {
        // Ưu tiên cookie do server set hoặc localStorage
        const m = document.cookie.match(/shopee_lang=([^;]+)/);
        if (m && m[1]) return m[1];
        return localStorage.getItem('shopee_lang') || 'vi';
    };

    window.setLanguage = function(lang) {
        localStorage.setItem('shopee_lang', lang);
        document.cookie = "shopee_lang=" + lang + "; path=/; max-age=31536000";
        applyTranslations(lang);
    };

    window.applyTranslations = function(lang) {
        lang = lang || getCurrentLang();
        const dict = (window.I18N_DICTIONARY && window.I18N_DICTIONARY[lang]) ? window.I18N_DICTIONARY[lang] : window.I18N_DICTIONARY['vi'];

        // Cập nhật nhãn bộ chọn ngôn ngữ hiển thị
        document.querySelectorAll('.current-lang-text').forEach(el => {
            el.textContent = lang === 'en' ? 'English' : 'Tiếng Việt';
        });

        // 1. Dịch các phần tử có data-i18n hoặc data-status-code
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) el.textContent = dict[key];
        });

        document.querySelectorAll('[data-status-code]').forEach(el => {
            const code = el.getAttribute('data-status-code');
            if (code && dict[code]) el.textContent = dict[code];
        });

        // 2. Dịch tự động đệ quy toàn bộ văn bản trong DOM (text nodes)
        if (lang === 'en') {
            const walkTextNodes = function(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    const rawText = node.nodeValue.trim();
                    if (rawText && dict[rawText]) {
                        node.nodeValue = node.nodeValue.replace(rawText, dict[rawText]);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    // Không dịch thẻ script và style
                    const tag = node.tagName.toLowerCase();
                    if (tag !== 'script' && tag !== 'style' && tag !== 'textarea') {
                        // Dịch title và placeholder nếu có
                        if (node.placeholder && dict[node.placeholder.trim()]) {
                            node.placeholder = dict[node.placeholder.trim()];
                        }
                        if (node.title && dict[node.title.trim()]) {
                            node.title = dict[node.title.trim()];
                        }
                        node.childNodes.forEach(walkTextNodes);
                    }
                }
            };
            walkTextNodes(document.body);
        }
    };

    document.addEventListener('DOMContentLoaded', function() {
        const lang = getCurrentLang();
        applyTranslations(lang);
    });
})();
</script>
`;

module.exports = {
    translations,
    translateText,
    i18nClientScript
};
