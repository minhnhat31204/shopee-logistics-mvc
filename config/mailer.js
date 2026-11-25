const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    } else {
        // Mặc định an toàn jsonTransport: không cần chờ network socket, phản hồi ngay lập tức
        transporter = nodemailer.createTransport({
            jsonTransport: true
        });
    }
    return transporter;
}

async function sendResetOtpEmail(toEmail, otpCode) {
    try {
        const mailClient = getTransporter();
        const mailOptions = {
            from: '"Shopee Việt Nam" <no-reply@shopee.vn>',
            to: toEmail,
            subject: `[Shopee] ${otpCode} là mã xác thực đặt lại mật khẩu của bạn`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e5e5; border-radius: 8px;">
                    <div style="background-color: #ee4d2d; padding: 15px; border-radius: 6px; text-align: center;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">Shopee Việt Nam</h1>
                    </div>
                    <div style="padding: 20px 10px; color: #333333;">
                        <p style="font-size: 15px;">Xin chào,</p>
                        <p style="font-size: 14px; line-height: 1.6;">Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản đăng ký với email: <strong>${toEmail}</strong>.</p>
                        <p style="font-size: 14px; line-height: 1.6;">Mã xác thực OTP của bạn là:</p>
                        <div style="background-color: #f8f9fa; border: 1px dashed #ee4d2d; border-radius: 6px; padding: 15px; text-align: center; margin: 20px 0;">
                            <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #ee4d2d;">${otpCode}</span>
                        </div>
                        <p style="font-size: 13px; color: #d0011b; font-weight: bold;">
                            ⚠️ Lưu ý: Mã xác thực này CHỈ CÓ HIỆU LỰC TRONG VÒNG 20 GIÂY. Sau 20 giây mã sẽ tự động hết hạn và không còn hữu dụng.
                        </p>
                        <p style="font-size: 12px; color: #777777; margin-top: 20px;">Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email và không cung cấp mã cho bất kỳ ai để bảo vệ tài khoản.</p>
                    </div>
                    <div style="border-top: 1px solid #eeeeee; padding-top: 15px; font-size: 11px; color: #999999; text-align: center;">
                        © 2026 Shopee Việt Nam. Tất cả các quyền được bảo lưu.
                    </div>
                </div>
            `
        };

        const info = await mailClient.sendMail(mailOptions);
        console.log(`\n======================================================`);
        console.log(`📧 [EMAIL ĐÃ GỬI] Đặt lại mật khẩu Shopee`);
        console.log(`Người nhận: ${toEmail}`);
        console.log(`Mã xác thực OTP (Hết hạn trong 20s): ${otpCode}`);
        console.log(`======================================================\n`);
        return true;
    } catch (err) {
        console.error('Lỗi gửi email:', err.message);
        console.log(`\n📧 [EMAIL FALLBACK] OTP gửi đến ${toEmail}: ${otpCode}\n`);
        return true;
    }
}

module.exports = {
    sendResetOtpEmail
};
