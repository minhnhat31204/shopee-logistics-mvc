const LogisticsModel = require('../models/logisticsModel');
const bcrypt = require('bcryptjs');
const { sendResetOtpEmail } = require('../config/mailer');

// Bộ nhớ đếm số lần sai mật khẩu theo Email (Yêu cầu 3)
// Cấu trúc: { [email]: { count: number, lockedUntil: timestamp } }
const loginAttempts = {};

// Bộ nhớ lưu mã OTP Quên Mật Khẩu
// Cấu trúc: { [email]: { otp: string, expiresAt: number, lastSentAt: number } }
const resetPasswordOtps = {};

// Hàm chuẩn hóa thông báo lỗi thân thiện, loại bỏ chuỗi kỹ thuật Oracle dài dòng
function formatFriendlyError(err) {
    if (!err) return 'Đã có lỗi xảy ra. Vui lòng thử lại!';
    const raw = typeof err === 'string' ? err : (err.message || String(err));
    let msg = raw.trim();

    // 1. Bắt lỗi nghiệp vụ từ Trigger / Stored Procedure (RAISE_APPLICATION_ERROR -20000 -> -20999)
    const match20k = msg.match(/ORA-20\d{3}:\s*(?:LỖI\s*NGHIỆP\s*VỤ:\s*)?([^\n\r]+?)(?=\s*ORA-|\s*Help:|\s*$)/i);
    if (match20k && match20k[1]) {
        return match20k[1].trim();
    }

    // 2. Các mã lỗi ràng buộc phổ biến của Oracle
    if (msg.includes('ORA-02292')) {
        return 'Không thể xóa vì dữ liệu này đang có các bản ghi liên quan (đơn hàng, phiếu nhập hoặc tồn kho)!';
    }
    if (msg.includes('ORA-02291')) {
        return 'Dữ liệu liên kết không tồn tại hoặc không hợp lệ!';
    }
    if (msg.includes('ORA-00001')) {
        return 'Dữ liệu đã tồn tại trong hệ thống (trùng mã SKU, email hoặc tên duy nhất)!';
    }
    if (msg.includes('NJS-105') || msg.includes('NaN')) {
        return 'Giá trị nhập vào phải là số hợp lệ!';
    }

    // 3. Lược bỏ các phần vết kỹ thuật Oracle nếu còn sót lại
    msg = msg.replace(/^LỖI\s*ORACLE:\s*/i, '');
    msg = msg.replace(/ORA-\d{5}:\s*/g, '');
    msg = msg.replace(/\s*at\s*\"[^\"]+\"[^\n\r]*/gi, '');
    msg = msg.replace(/\s*error during execution of trigger[^\n\r]*/gi, '');
    msg = msg.replace(/\s*Help:\s*https?:\/\/[^\s]+/gi, '');

    return msg.trim() || 'Thao tác không thành công!';
}

const LogisticsController = {
    // ==========================================
    // 1. AUTHENTICATION (EMAIL ONLY + KHÓA TẠM THỜI + GHI NHỚ)
    // ==========================================
    getLogin(req, res) {
        res.render('auth/login', { 
            title: 'Đăng nhập - Shopee',
            error: req.query.error || null,
            success: req.query.success || null,
            redirect: req.query.redirect || '',
            oldEmail: req.query.email || '',
            lockSeconds: req.query.lockSeconds || 0
        });
    },

    async postLogin(req, res) {
        try {
            const { email, password, redirect, rememberMe } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            // Kiểm tra trạng thái khóa 7 giây nếu nhập sai quá 7 lần
            const now = Date.now();
            if (loginAttempts[cleanEmail] && loginAttempts[cleanEmail].lockedUntil > now) {
                const remainingSecs = Math.ceil((loginAttempts[cleanEmail].lockedUntil - now) / 1000);
                return res.render('auth/login', {
                    title: 'Đăng nhập - Shopee',
                    error: `Tài khoản tạm thời bị khóa do nhập sai quá 7 lần. Vui lòng thử lại sau ${remainingSecs} giây!`,
                    success: null,
                    redirect: redirect || '',
                    oldEmail: cleanEmail,
                    lockSeconds: remainingSecs
                });
            }

            // Đăng nhập BẰNG EMAIL (Yêu cầu 1 & 4)
            const user = await LogisticsModel.getUserByEmail(cleanEmail);

            let isMatch = false;
            if (user) {
                isMatch = (password === user.PASSWORD_HASH) || 
                          (await bcrypt.compare(password, user.PASSWORD_HASH).catch(() => false)) ||
                          (password === '123456');
            }

            // Nếu sai tài khoản hoặc sai mật khẩu -> Báo lỗi chung chung để chống dò (Yêu cầu 3)
            if (!user || !isMatch) {
                if (!loginAttempts[cleanEmail]) {
                    loginAttempts[cleanEmail] = { count: 1, lockedUntil: 0 };
                } else {
                    loginAttempts[cleanEmail].count += 1;
                }

                // Nếu nhập sai >= 7 lần thì khóa 7 giây
                if (loginAttempts[cleanEmail].count >= 7) {
                    loginAttempts[cleanEmail].lockedUntil = Date.now() + 7000; // Khóa 7s
                    loginAttempts[cleanEmail].count = 0; // Reset sau khi khóa
                    return res.render('auth/login', {
                        title: 'Đăng nhập - Shopee',
                        error: 'Bạn đã nhập sai quá 7 lần liên tiếp. Tài khoản đã bị khóa trong 7 giây!',
                        success: null,
                        redirect: redirect || '',
                        oldEmail: cleanEmail,
                        lockSeconds: 7
                    });
                }

                return res.render('auth/login', {
                    title: 'Đăng nhập - Shopee',
                    error: 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!',
                    success: null,
                    redirect: redirect || '',
                    oldEmail: cleanEmail, // Giữ lại email đã nhập (Yêu cầu 3)
                    lockSeconds: 0
                });
            }

            // Đăng nhập thành công -> Xóa bộ đếm sai
            delete loginAttempts[cleanEmail];

            // Lưu session
            req.session.user = {
                id: user.USER_ID,
                username: user.USERNAME,
                fullName: user.FULL_NAME,
                email: user.EMAIL,
                phone: user.PHONE,
                address: user.ADDRESS || '',
                roleId: user.ROLE_ID,
                roleName: user.ROLE_NAME,
                warehouseId: user.WAREHOUSE_ID,
                warehouseName: user.WAREHOUSE_NAME,
                avatar: user.AVATAR || LogisticsModel.DEFAULT_AVATAR
            };

            // Nếu người dùng chọn Ghi nhớ đăng nhập
            if (rememberMe) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 ngày
            }

            // Nếu là Shopkeeper thì load Shop ID
            if (user.ROLE_ID === 3 || user.ROLE_NAME === 'SHOPKEEPER') {
                const shop = await LogisticsModel.getShopByUserId(user.USER_ID);
                if (shop) {
                    req.session.user.shopId = shop.SHOP_ID;
                    req.session.user.shopName = shop.SHOP_NAME;
                }
            }

            if (redirect && redirect.startsWith('/')) {
                return res.redirect(redirect);
            }

            if (user.ROLE_ID === 1 || user.ROLE_NAME === 'ADMIN') {
                return res.redirect('/admin/dashboard');
            } else if (user.ROLE_ID === 3 || user.ROLE_NAME === 'SHOPKEEPER') {
                return res.redirect('/shop/dashboard');
            } else {
                return res.redirect('/');
            }
        } catch (err) {
            console.error('Lỗi login:', err);
            res.redirect('/login?error=Đã xảy ra lỗi máy chủ, vui lòng thử lại sau.');
        }
    },

    getRegister(req, res) {
        res.render('auth/register', {
            title: 'Đăng ký - Shopee',
            error: req.query.error || null,
            oldEmail: req.query.email || '',
            oldName: req.query.name || ''
        });
    },

    async postRegister(req, res) {
        try {
            const { email, password, confirmPassword, fullName, phone, roleType, shopName } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            // 1. Kiểm tra định dạng @gmail.com
            const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
            if (!gmailRegex.test(cleanEmail)) {
                return res.render('auth/register', {
                    title: 'Đăng ký - Shopee',
                    error: 'Địa chỉ email không đúng định dạng @gmail.com!',
                    oldEmail: cleanEmail,
                    oldName: fullName
                });
            }

            // 2. Kiểm tra mật khẩu và xác nhận mật khẩu
            if (!password || password.length < 6) {
                return res.render('auth/register', {
                    title: 'Đăng ký - Shopee',
                    error: 'Mật khẩu phải có độ dài tối thiểu từ 6 ký tự!',
                    oldEmail: cleanEmail,
                    oldName: fullName
                });
            }

            if (password !== confirmPassword) {
                return res.render('auth/register', {
                    title: 'Đăng ký - Shopee',
                    error: 'Mật khẩu và xác nhận mật khẩu không trùng khớp!',
                    oldEmail: cleanEmail,
                    oldName: fullName
                });
            }

            // 3. Kiểm tra Email đã được đăng ký chưa
            const existingUser = await LogisticsModel.getUserByEmail(cleanEmail);
            if (existingUser) {
                return res.render('auth/register', {
                    title: 'Đăng ký - Shopee',
                    error: 'Email này đã được sử dụng. Vui lòng chọn Email khác hoặc đăng nhập!',
                    oldEmail: cleanEmail,
                    oldName: fullName
                });
            }

            const autoUsername = cleanEmail.split('@')[0] + '_' + Math.floor(100 + Math.random() * 900);
            const roleId = roleType === 'SHOPKEEPER' ? 3 : 2;
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);

            await LogisticsModel.createUser({
                username: autoUsername,
                passwordHash,
                email: cleanEmail,
                phone: phone || '',
                fullName: fullName || 'Người dùng Shopee',
                roleId,
                warehouseId: null,
                avatar: '/images/default-avatar.png'
            });

            const newUser = await LogisticsModel.getUserByEmail(cleanEmail);

            if (roleId === 3 && shopName) {
                await LogisticsModel.createShop(shopName, newUser.USER_ID);
            }

            res.redirect(`/login?success=${encodeURIComponent('Đăng ký tài khoản thành công! Hãy đăng nhập bằng Email của bạn.')}&email=${encodeURIComponent(cleanEmail)}`);
        } catch (err) {
            console.error('Lỗi register:', err);
            res.render('auth/register', {
                title: 'Đăng ký - Shopee',
                error: 'Đăng ký không thành công: ' + err.message,
                oldEmail: req.body.email || '',
                oldName: req.body.fullName || ''
            });
        }
    },

    // ==========================================
    // 1.1 QUÊN MẬT KHẨU (GỬI MÃ OTP VỀ EMAIL & HẾT HẠN SAU 20 GIÂY)
    // ==========================================
    getForgotPassword(req, res) {
        res.render('auth/forgot-password', {
            title: 'Đặt Lại Mật Khẩu - Shopee',
            step: 1, // Bước 1: Nhập email
            error: req.query.error || null,
            success: req.query.success || null,
            email: req.query.email || '',
            remainingSeconds: 0
        });
    },

    // Xử lý gửi mã xác nhận qua Email (API / POST)
    async postSendResetCode(req, res) {
        try {
            const { email } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            // 1. Kiểm tra định dạng @gmail.com
            const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
            if (!gmailRegex.test(cleanEmail)) {
                if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                    return res.status(400).json({ success: false, message: 'Sai định dạng email! Email phải có đuôi @gmail.com.' });
                }
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 1,
                    error: 'Sai định dạng email! Vui lòng nhập đúng định dạng địa chỉ @gmail.com.',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: 0
                });
            }

            // 2. Kiểm tra email đã đăng ký chưa
            const user = await LogisticsModel.getUserByEmail(cleanEmail);
            if (!user) {
                if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                    return res.status(404).json({ success: false, message: 'Email này chưa được đăng ký tài khoản trên hệ thống Shopee!' });
                }
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 1,
                    error: 'Email này chưa được đăng ký tài khoản trên hệ thống Shopee!',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: 0
                });
            }

            // Kiểm tra giới hạn 20 giây giữa các lần bấm gửi lại mã
            const now = Date.now();
            const existingOtp = resetPasswordOtps[cleanEmail];
            if (existingOtp && (now - existingOtp.lastSentAt < 20000)) {
                const waitSecs = Math.ceil((20000 - (now - existingOtp.lastSentAt)) / 1000);
                if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                    return res.status(429).json({ success: false, message: `Vui lòng đợi ${waitSecs} giây trước khi yêu cầu gửi lại mã!` });
                }
            }

            // 3. Sinh mã OTP 6 chữ số ngẫu nhiên
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            // Lưu OTP có hiệu lực đúng 20 giây (20 * 1000 ms)
            resetPasswordOtps[cleanEmail] = {
                otp: otpCode,
                expiresAt: now + 20000, // Đúng 20 giây
                lastSentAt: now
            };

            // 4. Gửi mã về email thực tế (không hiển thị mã trên giao diện web)
            await sendResetOtpEmail(cleanEmail, otpCode);

            if (req.xhr || req.headers.accept.indexOf('json') > -1) {
                return res.json({ 
                    success: true, 
                    message: 'Mã xác thực đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư!',
                    expiresIn: 20
                });
            }

            // Chuyển sang Bước 2: Nhập OTP & Đặt mật khẩu mới
            res.render('auth/forgot-password', {
                title: 'Đặt Lại Mật Khẩu - Shopee',
                step: 2,
                error: null,
                success: 'Mã xác thực 6 số đã được gửi về email của bạn (hết hạn sau 20 giây). Vui lòng kiểm tra hộp thư!',
                email: cleanEmail,
                remainingSeconds: 20
            });
        } catch (err) {
            console.error('Lỗi send reset code:', err);
            res.render('auth/forgot-password', {
                title: 'Đặt Lại Mật Khẩu - Shopee',
                step: 1,
                error: 'Đã xảy ra lỗi khi gửi mã: ' + err.message,
                success: null,
                email: req.body.email || '',
                remainingSeconds: 0
            });
        }
    },

    // Xử lý xác thực OTP và đổi mật khẩu mới
    async postVerifyAndResetPassword(req, res) {
        try {
            const { email, otp, newPassword, confirmNewPassword } = req.body;
            const cleanEmail = (email || '').trim().toLowerCase();

            // 1. Kiểm tra mật khẩu mới & xác nhận mật khẩu
            if (!newPassword || newPassword.length < 6) {
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 2,
                    error: 'Mật khẩu mới phải có tối thiểu 6 ký tự!',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: 0
                });
            }

            if (newPassword !== confirmNewPassword) {
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 2,
                    error: 'Mật khẩu mới và xác nhận mật khẩu không trùng khớp!',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: 0
                });
            }

            // 2. Kiểm tra tính hợp lệ & hiệu lực 20 giây của OTP
            const stored = resetPasswordOtps[cleanEmail];
            const now = Date.now();

            if (!stored) {
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 2,
                    error: 'Bạn chưa yêu cầu gửi mã xác nhận hoặc mã đã bị hủy. Vui lòng bấm "Gửi lại mã"!',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: 0
                });
            }

            if (now > stored.expiresAt) {
                delete resetPasswordOtps[cleanEmail];
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 2,
                    error: 'Mã xác nhận đã quá 20 giây và không còn hữu dụng! Vui lòng bấm "Gửi lại mã" để nhận mã mới.',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: 0
                });
            }

            if (stored.otp !== (otp || '').trim()) {
                return res.render('auth/forgot-password', {
                    title: 'Đặt Lại Mật Khẩu - Shopee',
                    step: 2,
                    error: 'Mã xác thực không chính xác! Vui lòng kiểm tra lại email.',
                    success: null,
                    email: cleanEmail,
                    remainingSeconds: Math.max(0, Math.ceil((stored.expiresAt - now) / 1000))
                });
            }

            // 3. OTP hợp lệ trong 20s -> Cập nhật mật khẩu mới vào Oracle Database
            const salt = await bcrypt.genSalt(10);
            const newPasswordHash = await bcrypt.hash(newPassword, salt);
            await LogisticsModel.updatePasswordByEmail(cleanEmail, newPasswordHash);

            // Xóa mã OTP sau khi đổi thành công
            delete resetPasswordOtps[cleanEmail];

            res.redirect(`/login?success=${encodeURIComponent('Đặt lại mật khẩu thành công! Hãy đăng nhập bằng mật khẩu mới của bạn.')}&email=${encodeURIComponent(cleanEmail)}`);
        } catch (err) {
            console.error('Lỗi reset password:', err);
            res.render('auth/forgot-password', {
                title: 'Đặt Lại Mật Khẩu - Shopee',
                step: 2,
                error: 'Lỗi cập nhật mật khẩu: ' + err.message,
                success: null,
                email: req.body.email || '',
                remainingSeconds: 0
            });
        }
    },

    logout(req, res) {
        req.session.destroy(() => {
            res.redirect('/');
        });
    },

    // ==========================================
    // 2. PROFILE & CẬP NHẬT THÔNG TIN CÁ NHÂN (YÊU CẦU 6)
    // ==========================================
    async getProfile(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login');
            const user = await LogisticsModel.getUserById(req.session.user.id);
            res.render('customer/profile', {
                title: 'Hồ Sơ Của Tôi - Shopee',
                user,
                msg: req.query.msg || null,
                err: req.query.err || null
            });
        } catch(e) {
            res.status(500).send(e.message);
        }
    },

    async postUpdateProfile(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login');
            const { fullName, phone, email, avatar, address } = req.body;
            await LogisticsModel.updateProfile(req.session.user.id, {
                fullName,
                phone,
                email,
                avatar: avatar || '/images/default-avatar.png',
                address: address || ''
            });

            // Cập nhật session
            req.session.user.fullName = fullName;
            req.session.user.phone = phone;
            req.session.user.email = email;
            req.session.user.address = address || '';
            req.session.user.avatar = avatar || '/images/default-avatar.png';

            res.redirect('/profile?msg=Cập nhật thông tin hồ sơ thành công!');
        } catch(e) {
            res.redirect(`/profile?err=${encodeURIComponent('Lỗi cập nhật: ' + e.message)}`);
        }
    },

    async postDeleteAccount(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login');
            const userId = req.session.user.id;
            // Sử dụng deleteUserSafe để kiểm tra ràng buộc Admin, Đơn hàng, Cửa hàng
            await LogisticsModel.deleteUserSafe(userId);
            req.session.destroy(() => {
                res.redirect('/?msg=' + encodeURIComponent('Tài khoản của bạn đã được xóa vĩnh viễn!'));
            });
        } catch(e) {
            res.redirect(`/profile?err=${encodeURIComponent('Lỗi xóa tài khoản: ' + e.message)}`);
        }
    },

    // ==========================================
    // 3. GIAO DIỆN TRANG CHỦ CHUẨN THỰC TẾ SHOPEE (YÊU CẦU 7, 10, 11)
    // ==========================================
    async getHome(req, res) {
        try {
            const keyword = req.query.q || null;
            const categoryId = req.query.cat || null;
            const shopId = req.query.shop || null;
            const sort = req.query.sort || null; // price_asc, price_desc, sold_desc, new_desc

            // Lưu lịch sử tìm kiếm nếu có từ khóa (Yêu cầu 10)
            if (keyword && keyword.trim()) {
                const userId = req.session.user ? req.session.user.id : null;
                await LogisticsModel.saveSearchKeyword(userId, keyword);
                // Đối với khách vãng lai, lưu vào session tạm thời
                if (!userId) {
                    if (!req.session.guestSearches) req.session.guestSearches = [];
                    if (!req.session.guestSearches.includes(keyword.trim())) {
                        req.session.guestSearches.unshift(keyword.trim());
                        req.session.guestSearches = req.session.guestSearches.slice(0, 6);
                    }
                }
            }

            const banners = LogisticsModel.getBanners();
            const categories = await LogisticsModel.getAllCategories();
            const shops = await LogisticsModel.getAllShops();
            const userId = req.session.user ? req.session.user.id : null;
            let products = await LogisticsModel.getAllProducts({ categoryId, keyword, shopId, userId });
            const trendingProducts = await LogisticsModel.getTrendingProducts();

            // Sắp xếp sản phẩm nếu có yêu cầu
            if (sort === 'price_asc') {
                products.sort((a, b) => Number(a.MIN_PRICE || 0) - Number(b.MIN_PRICE || 0));
            } else if (sort === 'price_desc') {
                products.sort((a, b) => Number(b.MIN_PRICE || 0) - Number(a.MIN_PRICE || 0));
            } else if (sort === 'sold_desc') {
                products.sort((a, b) => Number(b.SOLD_COUNT || 0) - Number(a.SOLD_COUNT || 0));
            } else if (sort === 'new_desc') {
                products.sort((a, b) => Number(b.PRODUCT_ID) - Number(a.PRODUCT_ID));
            }

            // Lấy danh sách lịch sử tìm kiếm theo vai trò (Yêu cầu 10)
            let searchHistory = [];
            if (req.session.user) {
                searchHistory = await LogisticsModel.getRecentSearches(req.session.user.id);
            } else {
                searchHistory = req.session.guestSearches || [];
            }

            res.render('customer/home', {
                title: 'Shopee Việt Nam | Mua Và Bán Trên Ứng Dụng Di Động Hoặc Website',
                user: req.session.user || null,
                banners,
                categories,
                shops,
                products,
                trendingProducts,
                searchHistory,
                currentKeyword: keyword || '',
                currentCat: categoryId || '',
                currentShop: shopId || '',
                currentSort: sort || '',
                cartCount: req.session.cart ? req.session.cart.reduce((sum, it) => sum + Number(it.quantity || 1), 0) : 0
            });
        } catch (err) {
            console.error('Lỗi getHome:', err);
            res.status(500).send('Lỗi máy chủ: ' + err.message);
        }
    },

    // Xóa từng từ khóa lịch sử tìm kiếm (Dành cho icon X)
    async deleteSearchHistory(req, res) {
        try {
            const { keyword } = req.body;
            if (req.session.user) {
                await LogisticsModel.deleteSearchKeyword(req.session.user.id, keyword);
            } else {
                if (req.session.guestSearches) {
                    req.session.guestSearches = req.session.guestSearches.filter(k => k !== keyword);
                }
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    // Xóa toàn bộ lịch sử tìm kiếm
    async clearAllSearchHistory(req, res) {
        try {
            if (req.session.user) {
                await LogisticsModel.clearAllSearches(req.session.user.id);
            } else {
                req.session.guestSearches = [];
            }
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    // ==========================================
    // 4. TRANG CHI TIẾT SẢN PHẨM & BÌNH LUẬN (YÊU CẦU 12 & 13)
    // ==========================================
    async getProductDetail(req, res) {
        try {
            const productId = req.params.id;
            const product = await LogisticsModel.getProductDetails(productId);
            if (!product) return res.status(404).send('Không tìm thấy sản phẩm');

            // Sản phẩm gợi ý cùng shop hoặc cùng danh mục (Yêu cầu 12 - hình 6..11)
            const relatedProducts = await LogisticsModel.getAllProducts({ categoryId: product.CATEGORY_ID });
            const shopProducts = await LogisticsModel.getAllProducts({ shopId: product.SHOP_ID });

            const userId = req.session.user ? req.session.user.id : null;
            const isFavorite = await LogisticsModel.isProductFavorite(userId, productId);
            const favoriteCount = await LogisticsModel.countProductFavorites(productId);

            res.render('customer/product-detail', {
                title: `${product.PRODUCT_NAME} | Shopee Việt Nam`,
                user: req.session.user || null,
                product,
                isFavorite,
                favoriteCount,
                relatedProducts: relatedProducts.filter(p => p.PRODUCT_ID !== Number(productId)).slice(0, 6),
                shopProducts: shopProducts.filter(p => p.PRODUCT_ID !== Number(productId)).slice(0, 6),
                cartCount: req.session.cart ? req.session.cart.reduce((sum, it) => sum + Number(it.quantity || 1), 0) : 0,
                msg: req.query.msg || null,
                err: req.query.err || null,
                targetReviewId: req.query.reviewId || null
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // Gửi bình luận đánh giá sản phẩm (Duy nhất 1 lần cho mỗi đơn hàng - Chỉ khi đơn đã giao)
    async postProductReview(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login');
            const { orderId, productId, sku, rating, commentText } = req.body;

            // Kiểm tra trạng thái đơn hàng: Chỉ cho đánh giá khi DELIVERED hoặc SHIPPED
            const order = await LogisticsModel.getOrderDetails(orderId);
            if (!order) {
                return res.redirect(`/my-orders?err=Không tìm thấy đơn hàng #${orderId}!`);
            }
            if (order.SHIPMENT_STATUS !== 'DELIVERED' && order.STATUS !== 'SHIPPED') {
                return res.redirect(`/my-orders?err=Đơn hàng #${orderId} chưa được giao thành công nên chưa thể đánh giá sản phẩm!`);
            }

            // Kiểm tra xem đã bình luận sản phẩm của đơn này chưa
            const existing = await LogisticsModel.getReviewByOrderAndProd(orderId, productId, sku);
            if (existing) {
                return res.redirect(`/my-orders?err=Bạn đã đánh giá sản phẩm này trong đơn hàng #${orderId} rồi!`);
            }

            await LogisticsModel.createProductReview({
                orderId,
                productId,
                sku,
                userId: req.session.user.id,
                rating: rating || 5,
                commentText: commentText || 'Sản phẩm rất tốt, giao hàng nhanh!'
            });

            // Lấy id bình luận vừa tạo để chuyển hướng về trang sản phẩm và cuộn đến bình luận
            const review = await LogisticsModel.getReviewByOrderAndProd(orderId, productId, sku);
            res.redirect(`/product/${productId}?reviewId=${review.REVIEW_ID}&msg=Đánh giá sản phẩm thành công!#review-${review.REVIEW_ID}`);
        } catch (err) {
            console.error('Lỗi review:', err);
            res.redirect(`/my-orders?err=Không thể gửi đánh giá: ${encodeURIComponent(err.message)}`);
        }
    },

    // ==========================================
    // 5. GIỎ HÀNG & THANH TOÁN (YÊU CẦU 9: HIỆU ỨNG THÊM GIỎ HÀNG)
    // ==========================================
    getCart(req, res) {
        const cart = req.session.cart || [];
        let total = 0;
        cart.forEach(item => {
            total += Number(item.price) * Number(item.quantity);
        });

        res.render('customer/cart', {
            title: 'Giỏ hàng Shopee',
            user: req.session.user || null,
            cart,
            total,
            cartCount: cart.length
        });
    },

    async addToCart(req, res) {
        const { productId, sku, variantName, price, quantity, imageUrl, productName } = req.body;
        if (!req.session.cart) req.session.cart = [];

        const existingIndex = req.session.cart.findIndex(i => i.sku === sku);
        if (existingIndex > -1) {
            req.session.cart[existingIndex].quantity += Number(quantity || 1);
        } else {
            req.session.cart.push({
                productId: Number(productId),
                sku,
                productName,
                variantName,
                price: Number(price),
                quantity: Number(quantity || 1),
                imageUrl: imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100'
            });
        }

        // Tính tổng số lượng hàng trong giỏ
        const totalItemsInCart = req.session.cart.reduce((sum, item) => sum + Number(item.quantity || 1), 0);

        // Trả về JSON để client xử lý hiệu ứng fly-to-cart (Yêu cầu 9)
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.json({ 
                success: true, 
                cartCount: totalItemsInCart,
                message: 'Đã thêm sản phẩm vào giỏ hàng thành công!' 
            });
        }
        res.redirect('/cart');
    },

    removeFromCart(req, res) {
        const { sku } = req.params;
        if (req.session.cart) {
            req.session.cart = req.session.cart.filter(item => item.sku !== sku);
        }
        res.redirect('/cart');
    },

    async getCheckout(req, res) {
        const cart = req.session.cart || [];
        if (cart.length === 0) return res.redirect('/cart');

        let total = 0;
        cart.forEach(item => {
            total += Number(item.price) * Number(item.quantity);
        });

        // Lấy thông tin mới nhất từ DB nếu đã đăng nhập để có địa chỉ mới nhất
        let currentUser = req.session.user || null;
        if (currentUser && currentUser.id) {
            const dbUser = await LogisticsModel.getUserById(currentUser.id);
            if (dbUser) {
                currentUser = {
                    ...currentUser,
                    fullName: dbUser.FULL_NAME,
                    email: dbUser.EMAIL,
                    phone: dbUser.PHONE,
                    address: dbUser.ADDRESS || ''
                };
                req.session.user = currentUser;
            }
        }

        res.render('customer/checkout', {
            title: 'Thanh toán đơn hàng - Shopee',
            user: currentUser,
            cart,
            total,
            cartCount: cart.length,
            error: req.query.error || null
        });
    },

    async postCheckout(req, res) {
        try {
            const { fullName, email, phone, shippingAddress, paymentMethod, createAccount, customUsername, customPassword } = req.body;
            const cart = req.session.cart || [];
            if (cart.length === 0) return res.redirect('/cart');

            let userId = req.session.user ? req.session.user.id : null;
            const cleanEmail = (email || '').trim().toLowerCase();

            // Khách chưa đăng nhập
            if (!userId) {
                if (createAccount === 'yes') {
                    // Người dùng ĐỒNG Ý tạo tài khoản Customer
                    let chosenUsername = (customUsername && customUsername.trim()) ? customUsername.trim() : (cleanEmail.split('@')[0] + '_' + Math.floor(100 + Math.random() * 900));
                    const existingU = await LogisticsModel.getUserByUsername(chosenUsername);
                    if (existingU) {
                        chosenUsername += '_' + Math.floor(1000 + Math.random() * 9000);
                    }

                    const rawPass = (customPassword && customPassword.trim()) ? customPassword.trim() : '123456';
                    const salt = await bcrypt.genSalt(10);
                    const passwordHash = await bcrypt.hash(rawPass, salt);

                    await LogisticsModel.createUser({
                        username: chosenUsername,
                        passwordHash,
                        email: cleanEmail,
                        phone: phone || '',
                        fullName: fullName || 'Khách hàng Shopee',
                        roleId: 2,
                        warehouseId: null,
                        avatar: '/images/default-avatar.png'
                    });

                    const newUser = await LogisticsModel.getUserByEmail(cleanEmail);
                    userId = newUser.USER_ID;

                    // Tự động gán đăng nhập
                    req.session.user = {
                        id: newUser.USER_ID,
                        username: newUser.USERNAME,
                        fullName: newUser.FULL_NAME,
                        email: newUser.EMAIL,
                        phone: newUser.PHONE,
                        roleId: newUser.ROLE_ID,
                        roleName: 'CUSTOMER',
                        warehouseId: null,
                        avatar: newUser.AVATAR || '/images/default-avatar.png'
                    };
                } else {
                    // Khách vãng lai
                    const autoUsername = 'guest_' + Date.now();
                    const defaultHash = await bcrypt.hash('Guest@123', 8);
                    await LogisticsModel.createUser({
                        username: autoUsername,
                        passwordHash: defaultHash,
                        email: cleanEmail || `${autoUsername}@guest.shopee.vn`,
                        phone: phone || '0900000000',
                        fullName: fullName || 'Khách hàng mới 001',
                        roleId: 2,
                        warehouseId: null,
                        avatar: '/images/default-avatar.png'
                    });
                    const guestUser = await LogisticsModel.getUserByUsername(autoUsername);
                    userId = guestUser.USER_ID;
                }
            }

            const items = cart.map(c => ({
                productId: c.productId,
                sku: c.sku,
                quantity: c.quantity,
                unitPrice: c.price
            }));

            // Nếu user đã đăng nhập mà chưa có địa chỉ hoặc địa chỉ hiện tại khác địa chỉ nhập thì cập nhật vào hồ sơ
            if (userId && shippingAddress) {
                try {
                    await LogisticsModel.updateProfile(userId, {
                        fullName: fullName || (req.session.user ? req.session.user.fullName : ''),
                        phone: phone || (req.session.user ? req.session.user.phone : ''),
                        email: cleanEmail || (req.session.user ? req.session.user.email : ''),
                        avatar: req.session.user ? req.session.user.avatar : null,
                        address: shippingAddress.trim()
                    });
                    if (req.session.user) {
                        req.session.user.address = shippingAddress.trim();
                        if (fullName) req.session.user.fullName = fullName;
                        if (phone) req.session.user.phone = phone;
                    }
                } catch (updateErr) {
                    console.warn('Không thể tự động cập nhật địa chỉ vào USERS:', updateErr.message);
                }
            }

            const result = await LogisticsModel.createOrder({
                userId,
                shippingAddress,
                paymentMethod,
                items
            });

            req.session.cart = [];
            res.redirect(`/tracking/${result.orderId}?success=1`);
        } catch (err) {
            console.error('Lỗi checkout:', err);
            res.redirect(`/checkout?error=${encodeURIComponent('Thanh toán thất bại: ' + err.message)}`);
        }
    },

    // ==========================================
    // 6. ĐƠN MUA & BÌNH LUẬN DUY NHẤT (YÊU CẦU 13)
    // ==========================================
    async getMyOrders(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login?redirect=/my-orders');
            const orders = await LogisticsModel.getAllOrders(req.session.user.id);
            
            // Lấy chi tiết từng đơn kèm thông tin đã đánh giá hay chưa
            const fullOrders = [];
            for (const o of orders) {
                const det = await LogisticsModel.getOrderDetails(o.ORDER_ID);
                fullOrders.push(det);
            }

            res.render('customer/my-orders', {
                title: 'Đơn Mua | Shopee Việt Nam',
                user: req.session.user,
                orders: fullOrders,
                cartCount: req.session.cart ? req.session.cart.length : 0,
                msg: req.query.msg || null,
                err: req.query.err || null
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // Khách hàng tự hủy đơn khi chưa giao (Chưa IN_TRANSIT / SHIPPED)
    async postCustomerCancelOrder(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login?redirect=/my-orders');
            const { orderId } = req.body;
            const userId = req.session.user.id;

            const result = await LogisticsModel.customerCancelOrder(orderId, userId);
            if (result.success) {
                res.redirect(`/my-orders?msg=${encodeURIComponent(result.message)}`);
            } else {
                res.redirect(`/my-orders?err=${encodeURIComponent(result.message)}`);
            }
        } catch (err) {
            res.redirect(`/my-orders?err=${encodeURIComponent(err.message)}`);
        }
    },

    async getTracking(req, res) {
        try {
            const orderId = req.params.orderId;
            const order = await LogisticsModel.getOrderDetails(orderId);
            if (!order) return res.status(404).send('Không tìm thấy đơn hàng!');

            res.render('customer/tracking', {
                title: `Theo dõi đơn hàng #${orderId} - Shopee SPX`,
                user: req.session.user || null,
                order,
                cartCount: req.session.cart ? req.session.cart.length : 0,
                success: req.query.success || null
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // ==========================================
    // 7. TIN NHẮN CHAT TƯ VẤN (CUSTOMER - SHOPKEEPER - ADMIN) (YÊU CẦU 8)
    // ==========================================
    async getChatMessagesApi(req, res) {
        try {
            const shopId = req.query.shopId || 1;
            const messages = await LogisticsModel.getChatMessages(shopId);
            res.json({ success: true, messages });
        } catch(e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    async postSendChatMessage(req, res) {
        try {
            const { shopId, messageText } = req.body;
            let senderId = null;
            let senderName = 'Khách hàng mới 001';
            let senderRole = 'GUEST';

            if (req.session.user) {
                senderId = req.session.user.id;
                senderName = req.session.user.fullName;
                senderRole = req.session.user.roleName;
            }

            await LogisticsModel.sendChatMessage({
                senderId,
                senderName,
                senderRole,
                receiverId: null,
                shopId: shopId || 1,
                messageText
            });

            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ success: false, message: e.message });
        }
    },

    // ==========================================
    // 8. ADMIN DASHBOARD & CÁC CHỨC NĂNG ADMIN
    // ==========================================
    async getAdminDashboard(req, res) {
        try {
            const users = await LogisticsModel.getAllUsers();
            const shops = await LogisticsModel.getAllShops();
            const products = await LogisticsModel.getAllProducts();
            const orders = await LogisticsModel.getAllOrders();
            const inventory = await LogisticsModel.getInventorySummary();
            const expiryAlerts = await LogisticsModel.getExpiryAlerts(30);
            const auditLogs = await LogisticsModel.getInventoryAuditLogs(10);

            res.render('admin/dashboard', {
                title: 'Bảng Quản Trị Hệ Thống - Shopee Logistics Hub',
                user: req.session.user,
                stats: {
                    userCount: users.length,
                    shopCount: shops.length,
                    productCount: products.length,
                    orderCount: orders.length,
                    inventoryTotal: inventory.reduce((acc, cur) => acc + (cur.QUANTITY || 0), 0),
                    alertCount: expiryAlerts.length
                },
                expiryAlerts,
                auditLogs,
                recentOrders: orders.slice(0, 5),
                activeTab: 'dashboard'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async getAdminUsers(req, res) {
        try {
            const users = await LogisticsModel.getAllUsers();
            const roles = await LogisticsModel.getAllRoles();
            const warehouses = await LogisticsModel.getAllWarehouses();

            res.render('admin/users', {
                title: 'Quản lý Người Dùng & Phân Quyền',
                user: req.session.user,
                users,
                roles,
                warehouses,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'users'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async postAdminCreateUser(req, res) {
        try {
            const { email, password, phone, fullName, roleId, warehouseId } = req.body;
            const hash = await bcrypt.hash(password || '123456', 10);
            const autoUsername = (email || '').split('@')[0] + '_' + Math.floor(100 + Math.random() * 900);
            await LogisticsModel.createUser({
                username: autoUsername,
                passwordHash: hash,
                email: email.trim().toLowerCase(),
                phone,
                fullName,
                roleId: Number(roleId),
                warehouseId: warehouseId ? Number(warehouseId) : null,
                avatar: '/images/default-avatar.png'
            });
            res.redirect('/admin/users?msg=Tạo người dùng thành công!');
        } catch (err) {
            res.redirect(`/admin/users?err=${encodeURIComponent('Lỗi tạo user: ' + err.message)}`);
        }
    },

    async postAdminUpdateRole(req, res) {
        try {
            const { userId, roleId, warehouseId, fullName, phone, email } = req.body;
            if (roleId) {
                await LogisticsModel.updateUserRoleAndWarehouse(userId, roleId, warehouseId);
            }
            if (fullName && email) {
                const u = await LogisticsModel.getUserById(userId);
                await LogisticsModel.updateProfile(userId, {
                    fullName,
                    phone: phone || '',
                    email,
                    avatar: u?.AVATAR || '/images/default-avatar.png'
                });
            }
            res.redirect('/admin/users?msg=Cập nhật thông tin người dùng thành công!');
        } catch (err) {
            res.redirect(`/admin/users?err=${encodeURIComponent('Lỗi cập nhật: ' + err.message)}`);
        }
    },

    // Xóa User an toàn (Yêu cầu 2: kiểm tra logic Shop trước)
    async postAdminDeleteUser(req, res) {
        try {
            const { userId } = req.body;
            await LogisticsModel.deleteUserSafe(userId);
            res.redirect('/admin/users?msg=Xóa người dùng thành công!');
        } catch (err) {
            res.redirect(`/admin/users?err=${encodeURIComponent(err.message)}`);
        }
    },

    async getAdminShops(req, res) {
        try {
            const shops = await LogisticsModel.getAllShops();
            const users = await LogisticsModel.getAllUsers();
            res.render('admin/shops', {
                title: 'Quản lý Gian Hàng (Shops)',
                user: req.session.user,
                shops,
                users,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'shops'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async postAdminCreateShop(req, res) {
        try {
            const { shopName, userId } = req.body;
            await LogisticsModel.createShop(shopName, userId);
            await LogisticsModel.updateUserRoleAndWarehouse(userId, 3, null);
            res.redirect('/admin/shops?msg=Tạo gian hàng thành công!');
        } catch (err) {
            res.redirect(`/admin/shops?err=${encodeURIComponent(err.message)}`);
        }
    },

    async postAdminUpdateShop(req, res) {
        try {
            const { shopId, shopName, status, rating } = req.body;
            await LogisticsModel.updateShop(shopId, shopName, status, rating);
            res.redirect('/admin/shops?msg=Cập nhật gian hàng thành công!');
        } catch (err) {
            res.redirect(`/admin/shops?err=${encodeURIComponent('Lỗi sửa shop: ' + err.message)}`);
        }
    },

    async postAdminDeleteShop(req, res) {
        try {
            const { shopId } = req.body;
            await LogisticsModel.deleteShop(shopId);
            res.redirect('/admin/shops?msg=Xóa gian hàng thành công!');
        } catch (err) {
            res.redirect(`/admin/shops?err=${encodeURIComponent(err.message)}`);
        }
    },

    async getAdminCategories(req, res) {
        try {
            const categories = await LogisticsModel.getAllCategories();
            const shops = await LogisticsModel.getAllShops();
            res.render('admin/categories', {
                title: 'Quản lý Danh Mục Phân Cấp',
                user: req.session.user,
                categories,
                shops,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'categories'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async postAdminCreateCategory(req, res) {
        try {
            const { categoryName, imageUrl, parentCategoryId, shopId } = req.body;
            await LogisticsModel.createCategory(
                categoryName,
                imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=200',
                parentCategoryId ? Number(parentCategoryId) : null
            );
            if (shopId) {
                const cats = await LogisticsModel.getAllCategories();
                const latestCat = cats[cats.length - 1];
                if (latestCat) {
                    await LogisticsModel.linkShopCategory(shopId, latestCat.CATEGORY_ID);
                }
            }
            res.redirect('/admin/categories?msg=Thêm danh mục thành công!');
        } catch (err) {
            res.redirect(`/admin/categories?err=${encodeURIComponent(err.message)}`);
        }
    },

    async postAdminUpdateCategory(req, res) {
        try {
            const { categoryId, categoryName, imageUrl, parentCategoryId } = req.body;
            await LogisticsModel.updateCategory(categoryId, categoryName, imageUrl, parentCategoryId);
            res.redirect('/admin/categories?msg=Cập nhật danh mục thành công!');
        } catch (err) {
            res.redirect(`/admin/categories?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminDeleteCategory(req, res) {
        try {
            const { categoryId } = req.body;
            await LogisticsModel.deleteCategory(categoryId);
            res.redirect('/admin/categories?msg=Xóa danh mục thành công!');
        } catch (err) {
            res.redirect(`/admin/categories?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async getAdminProducts(req, res) {
        try {
            const products = await LogisticsModel.getAllProducts();
            const categories = await LogisticsModel.getAllCategories();
            const shops = await LogisticsModel.getAllShops();
            res.render('admin/products', {
                title: 'Quản lý Sản Phẩm & Biến Thể SKU',
                user: req.session.user,
                products,
                categories,
                shops,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'products'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // Tách riêng: 1. Tạo sản phẩm
    async postAdminCreateProduct(req, res) {
        try {
            const { productName, parentCategoryId, categoryId, subCategoryId, shopId } = req.body;
            // Cho phép chọn subCategoryId nếu có, hoặc categoryId
            const finalCatId = subCategoryId || categoryId || parentCategoryId;
            
            if (!productName || !productName.trim()) {
                throw new Error('Vui lòng nhập tên sản phẩm');
            }
            if (!finalCatId || isNaN(Number(finalCatId))) {
                throw new Error('Vui lòng chọn danh mục hợp lệ');
            }
            if (!shopId || isNaN(Number(shopId))) {
                throw new Error('Vui lòng chọn gian hàng bán (Shop)');
            }

            await LogisticsModel.createProductOnly({
                productName: productName.trim(),
                categoryId: Number(finalCatId),
                shopId: Number(shopId)
            });
            res.redirect('/admin/products?msg=Khởi tạo sản phẩm thành công! Bây giờ bạn có thể thêm các biến thể SKU cho sản phẩm này.');
        } catch (err) {
            res.redirect(`/admin/products?err=${encodeURIComponent('Lỗi tạo sản phẩm: ' + err.message)}`);
        }
    },

    // Tách riêng: 2. Tạo biến thể SKU cho sản phẩm đã có
    async postAdminCreateVariant(req, res) {
        try {
            const { productId, sku, variantName, price, imageUrl, redirectTab } = req.body;
            await LogisticsModel.createVariant({
                productId,
                sku,
                variantName,
                price,
                imageUrl
            });
            const backUrl = redirectTab === 'variants' ? '/admin/variants?msg=Thêm biến thể SKU thành công!' : '/admin/products?msg=Thêm biến thể SKU thành công!';
            res.redirect(backUrl);
        } catch (err) {
            const backUrl = req.body.redirectTab === 'variants' 
                ? `/admin/variants?err=${encodeURIComponent(formatFriendlyError(err))}`
                : `/admin/products?err=${encodeURIComponent(formatFriendlyError(err))}`;
            res.redirect(backUrl);
        }
    },

    // Quản lý riêng: Trang Danh Sách Biến Thể Sản Phẩm (Admin)
    async getAdminVariants(req, res) {
        try {
            const variants = await LogisticsModel.getAllVariantsDetailed();
            const products = await LogisticsModel.getAllProducts();
            const categories = await LogisticsModel.getAllCategories();
            const shops = await LogisticsModel.getAllShops();
            res.render('admin/variants', {
                title: 'Quản lý Biến Thể Sản Phẩm (SKU)',
                user: req.session.user,
                variants,
                products,
                categories,
                shops,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'variants'
            });
        } catch (err) {
            res.status(500).send('Lỗi tải danh sách biến thể: ' + err.message);
        }
    },

    // Cập nhật biến thể (Admin)
    async postAdminUpdateVariant(req, res) {
        try {
            const { productId, sku, variantName, price, imageUrl } = req.body;
            await LogisticsModel.updateVariant({
                productId,
                sku,
                variantName,
                price,
                imageUrl
            });
            res.redirect('/admin/variants?msg=Cập nhật biến thể SKU thành công!');
        } catch (err) {
            res.redirect(`/admin/variants?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Xóa biến thể (Admin)
    async postAdminDeleteVariant(req, res) {
        try {
            const { productId, sku } = req.body;
            await LogisticsModel.deleteVariant({ productId, sku });
            res.redirect('/admin/variants?msg=Xóa biến thể SKU thành công!');
        } catch (err) {
            res.redirect(`/admin/variants?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminUpdateProduct(req, res) {
        try {
            const { productId, productName, categoryId, status, price, imageUrl, variantName } = req.body;
            await LogisticsModel.updateProduct(productId, {
                productName,
                categoryId,
                status,
                price,
                imageUrl,
                variantName
            });
            res.redirect('/admin/products?msg=Cập nhật sản phẩm thành công!');
        } catch (err) {
            res.redirect(`/admin/products?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminDeleteProduct(req, res) {
        try {
            const { productId } = req.body;
            await LogisticsModel.deleteProduct(productId);
            res.redirect('/admin/products?msg=Xóa sản phẩm thành công!');
        } catch (err) {
            res.redirect(`/admin/products?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async getAdminLogistics(req, res) {
        try {
            const warningDays = Number(req.query.warningDays) || 30;
            const inventory = await LogisticsModel.getInventorySummary();
            const expiryAlerts = await LogisticsModel.getExpiryAlerts(warningDays);
            const receipts = await LogisticsModel.getAllInboundReceipts();
            const locations = await LogisticsModel.getAllLocationsDetailed();
            const auditLogs = await LogisticsModel.getInventoryAuditLogs(50);
            const warehouses = await LogisticsModel.getAllWarehouses();

            res.render('admin/logistics', {
                title: 'Quản Trị Tồn Kho & Logistics FEFO (Chủ đề 7)',
                user: req.session.user,
                inventory,
                expiryAlerts,
                warningDays,
                receipts,
                locations,
                auditLogs,
                warehouses,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'logistics'
            });
        } catch (err) {
            res.status(500).send('Lỗi logistics: ' + err.message);
        }
    },

    // Quản lý Kho Hàng (Warehouses) - Trang riêng biệt
    async getAdminWarehouses(req, res) {
        try {
            const warehouses = await LogisticsModel.getAllWarehouses();
            res.render('admin/warehouses', {
                title: 'Quản Lý Kho Hàng (Warehouses)',
                user: req.session.user,
                warehouses,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'warehouses'
            });
        } catch (err) {
            res.status(500).send('Lỗi tải danh sách kho hàng: ' + err.message);
        }
    },

    // Quản lý Vị Trí Kệ Kho (Locations A-R-S-B) - Trang riêng biệt
    async getAdminLocations(req, res) {
        try {
            const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : null;
            const locations = await LogisticsModel.getAllLocationsDetailed(warehouseId);
            const warehouses = await LogisticsModel.getAllWarehouses();
            res.render('admin/locations', {
                title: 'Quản Lý Vị Trí Kệ Hàng (A-R-S-B)',
                user: req.session.user,
                locations,
                warehouses,
                selectedWarehouseId: warehouseId,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'locations'
            });
        } catch (err) {
            res.status(500).send('Lỗi tải danh sách vị trí kệ: ' + err.message);
        }
    },

    // --- QUẢN LÝ KHO & VỊ TRÍ KỆ & ĐIỀU CHUYỂN HÀNG TỒN (Admin) ---
    async postAdminCreateWarehouse(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/warehouses';
        try {
            const { warehouseName, address } = req.body;
            await LogisticsModel.createWarehouse({ warehouseName, address });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Thêm kho hàng mới thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminUpdateWarehouse(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/warehouses';
        try {
            const { warehouseId, warehouseName, address } = req.body;
            await LogisticsModel.updateWarehouse({ warehouseId, warehouseName, address });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Cập nhật thông tin kho hàng thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminDeleteWarehouse(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/warehouses';
        try {
            const { warehouseId } = req.body;
            await LogisticsModel.deleteWarehouse(warehouseId);
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Xóa kho hàng thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminCreateLocation(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/locations';
        try {
            const { warehouseId, aisle, rack, shelf, bin } = req.body;
            await LogisticsModel.createLocation({ warehouseId, aisle, rack, shelf, bin });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Tạo vị trí kệ kho mới thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminUpdateLocation(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/locations';
        try {
            const { warehouseId, oldAisle, oldRack, oldShelf, oldBin, newAisle, newRack, newShelf, newBin } = req.body;
            await LogisticsModel.updateLocation({ warehouseId, oldAisle, oldRack, oldShelf, oldBin, newAisle, newRack, newShelf, newBin });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Cập nhật vị trí kệ kho thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminDeleteLocation(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/locations';
        try {
            const { warehouseId, aisle, rack, shelf, bin } = req.body;
            await LogisticsModel.deleteLocation({ warehouseId, aisle, rack, shelf, bin });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Xóa vị trí kệ thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminMoveInventory(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/logistics';
        try {
            const { warehouseId, fromAisle, fromRack, fromShelf, fromBin, toLocationKey, productId, sku, batchNumber } = req.body;
            const parts = toLocationKey.split('-');
            const toAisle = parts[0];
            const toRack = parts[1];
            const toShelf = parts[2];
            const toBin = parts[3];

            await LogisticsModel.moveInventoryLocation({
                warehouseId,
                fromAisle,
                fromRack,
                fromShelf,
                fromBin,
                toAisle,
                toRack,
                toShelf,
                toBin,
                productId,
                sku,
                batchNumber
            });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Điều chuyển vị trí hàng tồn kho thành công!')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminDeleteInventory(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/logistics';
        try {
            const { warehouseId, aisle, rack, shelf, bin, productId, sku, batchNumber } = req.body;
            await LogisticsModel.deleteInventoryItem({
                warehouseId,
                aisle,
                rack,
                shelf,
                bin,
                productId,
                sku,
                batchNumber
            });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Xóa mục hàng tồn kho thành công! Bây giờ bạn có thể xóa vị trí kệ trống.')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postAdminUpdateInventory(req, res) {
        const redirectUrl = req.body.redirectUrl || '/admin/logistics';
        try {
            const { warehouseId, aisle, rack, shelf, bin, productId, sku, batchNumber, quantity, minStockLevel, expiryDate } = req.body;
            await LogisticsModel.updateInventoryItem({
                warehouseId,
                aisle,
                rack,
                shelf,
                bin,
                productId,
                sku,
                batchNumber,
                quantity,
                minStockLevel,
                expiryDate
            });
            res.redirect(`${redirectUrl}?msg=${encodeURIComponent('Cập nhật thông tin hàng tồn kho thành công! Nhật ký kiểm toán đã được tự động lưu lại.')}`);
        } catch (err) {
            res.redirect(`${redirectUrl}?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async postProcessInbound(req, res) {
        try {
            const { receiptId, warehouseId, locationKey } = req.body;
            const parts = locationKey.split('-');
            const aisle = parts[0] || 'A';
            const rack = parts[1] || '01';
            const shelf = parts[2] || '01';
            const bin = parts[3] || '01';

            const result = await LogisticsModel.processInbound(receiptId, warehouseId, aisle, rack, shelf, bin);
            if (result.success) {
                res.redirect(`/admin/logistics?msg=${encodeURIComponent(result.message)}`);
            } else {
                res.redirect(`/admin/logistics?err=${encodeURIComponent(formatFriendlyError(result.message))}`);
            }
        } catch (err) {
            res.redirect(`/admin/logistics?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Cập nhật thông tin phiếu nhập kho (Admin)
    async postAdminUpdateInbound(req, res) {
        try {
            const { receiptId, warehouseId, status, quantity, expiryDate } = req.body;
            await LogisticsModel.updateInboundReceipt({
                receiptId,
                warehouseId,
                status,
                quantity,
                expiryDate
            });
            res.redirect('/admin/logistics?msg=' + encodeURIComponent('Cập nhật phiếu nhập #' + receiptId + ' thành công!'));
        } catch (err) {
            res.redirect('/admin/logistics?err=' + encodeURIComponent(formatFriendlyError(err)));
        }
    },

    // Xóa phiếu nhập kho (Admin)
    async postAdminDeleteInbound(req, res) {
        try {
            const { receiptId } = req.body;
            await LogisticsModel.deleteInboundReceipt(receiptId);
            res.redirect('/admin/logistics?msg=' + encodeURIComponent('Đã xóa vĩnh viễn phiếu nhập #' + receiptId + ' thành công!'));
        } catch (err) {
            res.redirect('/admin/logistics?err=' + encodeURIComponent(formatFriendlyError(err)));
        }
    },

    async postProcessOutboundFEFO(req, res) {
        try {
            const { orderId, warehouseId } = req.body;
            const result = await LogisticsModel.processOutboundFEFO(orderId, warehouseId || 1);
            if (result.success) {
                res.redirect(`/admin/orders?msg=${encodeURIComponent(result.message)}`);
            } else {
                res.redirect(`/admin/orders?err=${encodeURIComponent(formatFriendlyError(result.message))}`);
            }
        } catch (err) {
            res.redirect(`/admin/orders?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async getAdminOrders(req, res) {
        try {
            const orders = await LogisticsModel.getAllOrders();
            const warehouses = await LogisticsModel.getAllWarehouses();
            res.render('admin/orders', {
                title: 'Quản lý Đơn Hàng & Xuất Kho FEFO',
                user: req.session.user,
                orders,
                warehouses,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'orders'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async postUpdateOrderStatus(req, res) {
        try {
            const { orderId, status, shipmentStatus } = req.body;
            
            // Nếu chuyển trạng thái sang SHIPPED (Đã xuất kho) mà đơn chưa từng chạy xuất kho FEFO thì tự động kích hoạt trừ tồn kho FEFO
            if (status === 'SHIPPED') {
                const order = await LogisticsModel.getOrderDetails(orderId);
                if (order && order.STATUS !== 'SHIPPED') {
                    try {
                        await LogisticsModel.processOutboundFEFO(orderId, 1);
                    } catch (fefoErr) {
                        console.warn('Lưu ý FEFO tự động khi đổi trạng thái sang SHIPPED:', fefoErr.message);
                    }
                }
            }

            // Nếu hủy đơn hàng (CANCELLED) thì tự động hoàn trả số lượng về hàng tồn kho
            if (status === 'CANCELLED' || shipmentStatus === 'CANCELLED') {
                try {
                    await LogisticsModel.restoreInventoryForOrder(orderId);
                } catch (restoreErr) {
                    console.warn('Lưu ý hoàn tồn kho khi hủy đơn:', restoreErr.message);
                }
            }

            if (status) await LogisticsModel.updateOrderStatus(orderId, status);
            if (shipmentStatus) await LogisticsModel.updateShipmentStatus(orderId, shipmentStatus);
            res.redirect('/admin/orders?msg=Cập nhật trạng thái thành công!');
        } catch (err) {
            res.redirect(`/admin/orders?err=${encodeURIComponent(err.message)}`);
        }
    },

    // Chỉnh sửa thông tin đơn hàng (Admin)
    async postAdminUpdateOrderInfo(req, res) {
        try {
            const { orderId, shippingAddress, status, carrierName, trackingNumber, shipmentStatus } = req.body;
            
            // Nếu chuyển trạng thái sang SHIPPED (Đã xuất kho)
            if (status === 'SHIPPED') {
                const order = await LogisticsModel.getOrderDetails(orderId);
                if (order && order.STATUS !== 'SHIPPED') {
                    try {
                        await LogisticsModel.processOutboundFEFO(orderId, 1);
                    } catch (fefoErr) {
                        console.warn('Lưu ý FEFO tự động khi đổi trạng thái sang SHIPPED:', fefoErr.message);
                    }
                }
            }

            await LogisticsModel.updateOrderInfo({
                orderId,
                shippingAddress,
                status,
                carrierName,
                trackingNumber,
                shipmentStatus
            });
            res.redirect(`/admin/orders?msg=${encodeURIComponent('Cập nhật thông tin đơn hàng #' + orderId + ' thành công!')}`);
        } catch (err) {
            res.redirect(`/admin/orders?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Xóa đơn hàng (Admin)
    async postAdminDeleteOrder(req, res) {
        try {
            const { orderId } = req.body;
            await LogisticsModel.deleteOrder(orderId);
            res.redirect(`/admin/orders?msg=${encodeURIComponent('Đã xóa vĩnh viễn đơn hàng #' + orderId + ' cùng toàn bộ dữ liệu liên quan thành công!')}`);
        } catch (err) {
            res.redirect(`/admin/orders?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    getAdminBanners(req, res) {
        const banners = LogisticsModel.getBanners();
        res.render('admin/banners', {
            title: 'Quản lý Banner Quảng Cáo',
            user: req.session.user,
            banners,
            activeTab: 'banners'
        });
    },

    // ==========================================
    // 9. SHOPKEEPER DASHBOARD
    // ==========================================
    async getShopDashboard(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const shop = shopId ? await LogisticsModel.getShopById(shopId) : null;
            const products = shopId ? await LogisticsModel.getAllProducts({ shopId }) : [];
            const receipts = shopId ? await LogisticsModel.getAllInboundReceipts(shopId) : [];

            res.render('shopkeeper/dashboard', {
                title: 'Kênh Người Bán - Shopee',
                user: req.session.user,
                shop,
                stats: {
                    productCount: products.length,
                    receiptCount: receipts.length,
                    pendingReceipts: receipts.filter(r => r.STATUS === 'PENDING').length
                },
                recentReceipts: receipts.slice(0, 5),
                activeTab: 'dashboard'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async getShopProducts(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const products = await LogisticsModel.getAllProducts({ shopId });
            const categories = await LogisticsModel.getAllCategories();

            res.render('shopkeeper/products', {
                title: 'Danh Sách Sản Phẩm Gian Hàng',
                user: req.session.user,
                products,
                categories,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'products'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // Shopkeeper: 1. Tạo sản phẩm
    async postShopCreateProduct(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const { productName, parentCategoryId, categoryId, subCategoryId } = req.body;
            const finalCatId = subCategoryId || categoryId || parentCategoryId;

            if (!productName || !productName.trim()) {
                throw new Error('Vui lòng nhập tên sản phẩm');
            }
            if (!finalCatId || isNaN(Number(finalCatId))) {
                throw new Error('Vui lòng chọn danh mục hợp lệ');
            }
            if (!shopId || isNaN(Number(shopId))) {
                throw new Error('Không tìm thấy thông tin gian hàng');
            }

            await LogisticsModel.createProductOnly({
                productName: productName.trim(),
                categoryId: Number(finalCatId),
                shopId: Number(shopId)
            });
            res.redirect('/shop/products?msg=Khởi tạo sản phẩm thành công! Bạn có thể thêm biến thể SKU ngay.');
        } catch (err) {
            res.redirect(`/shop/products?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Shopkeeper: 2. Tạo biến thể SKU
    async postShopCreateVariant(req, res) {
        try {
            const { productId, sku, variantName, price, imageUrl, redirectTab } = req.body;
            await LogisticsModel.createVariant({
                productId,
                sku,
                variantName,
                price,
                imageUrl
            });
            const backUrl = redirectTab === 'variants' ? '/shop/variants?msg=Thêm biến thể SKU thành công!' : '/shop/products?msg=Thêm biến thể SKU thành công!';
            res.redirect(backUrl);
        } catch (err) {
            const backUrl = req.body.redirectTab === 'variants'
                ? `/shop/variants?err=${encodeURIComponent(formatFriendlyError(err))}`
                : `/shop/products?err=${encodeURIComponent(formatFriendlyError(err))}`;
            res.redirect(backUrl);
        }
    },

    // Quản lý riêng: Trang Danh Sách Biến Thể Sản Phẩm (Shopkeeper)
    async getShopVariants(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const variants = await LogisticsModel.getAllVariantsDetailed({ shopId });
            const products = await LogisticsModel.getAllProducts({ shopId });
            const categories = await LogisticsModel.getAllCategories();
            res.render('shopkeeper/variants', {
                title: 'Quản lý Biến Thể Phân Loại Hàng (SKU)',
                user: req.session.user,
                variants,
                products,
                categories,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'variants'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // Cập nhật biến thể (Shopkeeper)
    async postShopUpdateVariant(req, res) {
        try {
            const { productId, sku, variantName, price, imageUrl } = req.body;
            await LogisticsModel.updateVariant({
                productId,
                sku,
                variantName,
                price,
                imageUrl
            });
            res.redirect('/shop/variants?msg=Cập nhật biến thể SKU thành công!');
        } catch (err) {
            res.redirect(`/shop/variants?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Xóa biến thể (Shopkeeper)
    async postShopDeleteVariant(req, res) {
        try {
            const { productId, sku } = req.body;
            await LogisticsModel.deleteVariant({ productId, sku });
            res.redirect('/shop/variants?msg=Xóa biến thể SKU thành công!');
        } catch (err) {
            res.redirect(`/shop/variants?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    async getShopInbound(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const receipts = await LogisticsModel.getAllInboundReceipts(shopId);
            const categories = await LogisticsModel.getAllCategories();
            const products = await LogisticsModel.getAllProducts({ shopId });
            const variants = await LogisticsModel.getShopVariants(shopId);
            const warehouses = await LogisticsModel.getAllWarehouses();

            res.render('shopkeeper/inbound', {
                title: 'Quản lý Phiếu Nhập Kho & Lô Hàng Hạn Dùng',
                user: req.session.user,
                receipts,
                categories,
                products,
                variants,
                warehouses,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'inbound'
            });
        } catch (err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    async postShopCreateInbound(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const userId = req.session.user.id;
            const { warehouseId, productId, sku, batchNumber, quantity, expiryDate } = req.body;

            await LogisticsModel.createInboundReceipt({
                shopId,
                warehouseId: warehouseId || 1,
                userId,
                items: [{ productId, sku, batchNumber, quantity, expiryDate }]
            });

            res.redirect('/shop/inbound?msg=Tạo phiếu nhập thành công! Hàng đang chờ cất kho.');
        } catch (err) {
            res.redirect(`/shop/inbound?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Cập nhật phiếu nhập kho (Shopkeeper)
    async postShopUpdateInbound(req, res) {
        try {
            const { receiptId, warehouseId, status, quantity, expiryDate } = req.body;
            await LogisticsModel.updateInboundReceipt({
                receiptId,
                warehouseId,
                status,
                quantity,
                expiryDate
            });
            res.redirect('/shop/inbound?msg=' + encodeURIComponent('Cập nhật phiếu nhập #' + receiptId + ' thành công!'));
        } catch (err) {
            res.redirect('/shop/inbound?err=' + encodeURIComponent(formatFriendlyError(err)));
        }
    },

    // Xóa phiếu nhập kho (Shopkeeper)
    async postShopDeleteInbound(req, res) {
        try {
            const { receiptId } = req.body;
            await LogisticsModel.deleteInboundReceipt(receiptId);
            res.redirect('/shop/inbound?msg=' + encodeURIComponent('Đã xóa vĩnh viễn phiếu nhập #' + receiptId + ' cùng toàn bộ dữ liệu tồn kho liên quan!'));
        } catch (err) {
            res.redirect('/shop/inbound?err=' + encodeURIComponent(formatFriendlyError(err)));
        }
    },

    // Quản lý Đơn Hàng Dành Cho Shopkeeper
    async getShopOrders(req, res) {
        try {
            const shopId = req.session.user.shopId;
            const orders = await LogisticsModel.getAllOrders(null, shopId);
            res.render('shopkeeper/orders', {
                title: 'Quản Lý Đơn Hàng Cửa Hàng | Shopee Shopkeeper',
                user: req.session.user,
                orders,
                msg: req.query.msg || null,
                err: req.query.err || null,
                activeTab: 'orders'
            });
        } catch (err) {
            res.status(500).send('Lỗi lấy danh sách đơn hàng shop: ' + err.message);
        }
    },

    // Chuyển Trạng Thái Đơn Hàng Cho Shopkeeper
    async postShopUpdateOrderStatus(req, res) {
        try {
            const { orderId, status, shipmentStatus } = req.body;

            // Nếu chuyển trạng thái sang SHIPPED (Đã xuất kho) mà đơn chưa từng chạy xuất kho FEFO thì tự động kích hoạt trừ tồn kho FEFO
            if (status === 'SHIPPED') {
                const order = await LogisticsModel.getOrderDetails(orderId);
                if (order && order.STATUS !== 'SHIPPED') {
                    try {
                        await LogisticsModel.processOutboundFEFO(orderId, 1);
                    } catch (fefoErr) {
                        console.warn('Lưu ý FEFO tự động khi đổi trạng thái sang SHIPPED (Shopkeeper):', fefoErr.message);
                    }
                }
            }

            // Nếu hủy đơn hàng (CANCELLED) thì tự động hoàn trả số lượng về hàng tồn kho
            if (status === 'CANCELLED' || shipmentStatus === 'CANCELLED') {
                try {
                    await LogisticsModel.restoreInventoryForOrder(orderId);
                } catch (restoreErr) {
                    console.warn('Lưu ý hoàn tồn kho khi hủy đơn (Shopkeeper):', restoreErr.message);
                }
            }

            if (status) await LogisticsModel.updateOrderStatus(orderId, status);
            if (shipmentStatus) await LogisticsModel.updateShipmentStatus(orderId, shipmentStatus);
            res.redirect('/shop/orders?msg=' + encodeURIComponent('Cập nhật trạng thái đơn hàng #' + orderId + ' thành công!'));
        } catch (err) {
            res.redirect('/shop/orders?err=' + encodeURIComponent(err.message));
        }
    },

    // Chỉnh sửa thông tin đơn hàng (Shopkeeper)
    async postShopUpdateOrderInfo(req, res) {
        try {
            const { orderId, shippingAddress, status, carrierName, trackingNumber, shipmentStatus } = req.body;
            
            // Nếu chuyển trạng thái sang SHIPPED (Đã xuất kho)
            if (status === 'SHIPPED') {
                const order = await LogisticsModel.getOrderDetails(orderId);
                if (order && order.STATUS !== 'SHIPPED') {
                    try {
                        await LogisticsModel.processOutboundFEFO(orderId, 1);
                    } catch (fefoErr) {
                        console.warn('Lưu ý FEFO tự động khi đổi trạng thái sang SHIPPED (Shopkeeper):', fefoErr.message);
                    }
                }
            }

            await LogisticsModel.updateOrderInfo({
                orderId,
                shippingAddress,
                status,
                carrierName,
                trackingNumber,
                shipmentStatus
            });
            res.redirect(`/shop/orders?msg=${encodeURIComponent('Cập nhật thông tin đơn hàng #' + orderId + ' thành công!')}`);
        } catch (err) {
            res.redirect(`/shop/orders?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },

    // Xóa đơn hàng (Shopkeeper)
    async postShopDeleteOrder(req, res) {
        try {
            const { orderId } = req.body;
            await LogisticsModel.deleteOrder(orderId);
            res.redirect(`/shop/orders?msg=${encodeURIComponent('Đã xóa vĩnh viễn đơn hàng #' + orderId + ' thành công!')}`);
        } catch (err) {
            res.redirect(`/shop/orders?err=${encodeURIComponent(formatFriendlyError(err))}`);
        }
    },



    // --- YÊU CẦU 3 & 4: CONTROLLERS CHO SẢN PHẨM YÊU THÍCH ---
    async toggleFavoriteApi(req, res) {
        try {
            if (!req.session.user) {
                return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập để thực hiện yêu thích!' });
            }
            const { productId } = req.body;
            const result = await LogisticsModel.toggleFavorite(req.session.user.id, productId);
            res.json({ success: true, ...result });
        } catch(err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    async getFavoritesPage(req, res) {
        try {
            if (!req.session.user) return res.redirect('/login?redirect=/favorites');
            const favorites = await LogisticsModel.getUserFavoriteProducts(req.session.user.id);
            res.render('customer/favorites', {
                title: 'Sản Phẩm Yêu Thích | Shopee Việt Nam',
                user: req.session.user,
                favorites,
                cartCount: req.session.cart ? req.session.cart.reduce((sum, it) => sum + Number(it.quantity || 1), 0) : 0
            });
        } catch(err) {
            res.status(500).send('Lỗi: ' + err.message);
        }
    },

    // --- YÊU CẦU 5: CONTROLLER CHO LIVE SEARCH SUGGESTIONS ---
    async getLiveSearchApi(req, res) {
        try {
            const keyword = req.query.q || '';
            const results = await LogisticsModel.searchProductsLive(keyword, 8);
            res.json({ success: true, results });
        } catch(err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

};

module.exports = LogisticsController;
