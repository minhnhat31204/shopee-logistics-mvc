const db = require('../config/db');
const oracledb = require('oracledb');

const LogisticsModel = {
    DEFAULT_AVATAR: '/images/default-avatar.png',

    // ==========================================
    // 1. NHÓM TỔNG QUAN / DASHBOARD & CHỦ ĐỀ 7 LOGISTICS
    // ==========================================
    
    async processInbound(receiptId, warehouseId, aisle, rack, shelf, bin) {
        let conn;
        try {
            conn = await db.getConnection();
            const sql = `BEGIN pkg_logistics_core.process_inbound(:p_receipt_id, :p_wh_id, :p_aisle, :p_rack, :p_shelf, :p_bin); END;`;
            await conn.execute(sql, {
                p_receipt_id: Number(receiptId),
                p_wh_id: Number(warehouseId),
                p_aisle: String(aisle),
                p_rack: String(rack),
                p_shelf: String(shelf),
                p_bin: String(bin)
            }, { autoCommit: true });
            return { success: true, message: `Cất kho thành công cho phiếu nhập #${receiptId} vào kệ ${aisle}-${rack}-${shelf}-${bin}` };
        } catch (err) {
            return { success: false, message: err.message };
        } finally {
            if (conn) await conn.close();
        }
    },

    async processOutboundFEFO(orderId, warehouseId) {
        let conn;
        try {
            conn = await db.getConnection();
            const sql = `BEGIN pkg_logistics_core.process_outbound_fefo(:p_order_id, :p_wh_id); END;`;
            await conn.execute(sql, {
                p_order_id: Number(orderId),
                p_wh_id: Number(warehouseId)
            }, { autoCommit: true });
            return { success: true, message: `Xuất kho FEFO thành công cho đơn hàng #${orderId}` };
        } catch (err) {
            return { success: false, message: err.message };
        } finally {
            if (conn) await conn.close();
        }
    },

    async getExpiryAlerts(daysWarning = 30) {
        const sql = `
            SELECT i.Warehouse_ID, w.Warehouse_Name, i.Aisle, i.Rack, i.Shelf, i.Bin,
                   i.SKU, v.Variant_Name, i.Batch_Number, i.Quantity, 
                   TO_CHAR(ri.Expiry_Date, 'YYYY-MM-DD') AS Expiry_Date,
                   TRUNC(ri.Expiry_Date - SYSDATE) AS Days_Left,
                   CASE 
                       WHEN ri.Expiry_Date <= SYSDATE THEN 'DA_HET_HAN'
                       WHEN ri.Expiry_Date - SYSDATE <= 7 THEN 'RAT_NGUY_CAP'
                       ELSE 'CAN_HAN'
                   END AS Alert_Level
            FROM INVENTORY i
            JOIN WAREHOUSES w ON i.Warehouse_ID = w.Warehouse_ID
            JOIN PRODUCT_VARIANTS v ON i.Product_ID = v.Product_ID AND i.SKU = v.SKU
            JOIN INBOUND_RECEIPT_ITEMS ri ON i.Receipt_ID = ri.Receipt_ID 
                 AND i.Product_ID = ri.Product_ID AND i.SKU = ri.SKU AND i.Batch_Number = ri.Batch_Number
            WHERE i.Quantity > 0 AND ri.Expiry_Date <= SYSDATE + :p_days
            ORDER BY Days_Left ASC
        `;
        const res = await db.executeQuery(sql, { p_days: Number(daysWarning) });
        return res.rows || [];
    },

    async getInventorySummary(warehouseId = null, limit = 500) {
        let sql = `
            SELECT w.Warehouse_ID, w.Warehouse_Name,
                   l.Aisle || '-' || l.Rack || '-' || l.Shelf || '-' || l.Bin AS Vi_Tri_Ke,
                   l.Aisle, l.Rack, l.Shelf, l.Bin,
                   p.Product_ID, p.Product_Name,
                   pv.SKU, pv.Variant_Name, pv.Price,
                   i.Batch_Number,
                   i.Receipt_ID,
                   i.Quantity,
                   i.Min_Stock_Level,
                   TO_CHAR(ri.Expiry_Date, 'YYYY-MM-DD') AS Expiry_Date,
                   TRUNC(ri.Expiry_Date - SYSDATE) AS Days_Left,
                   CASE
                       WHEN i.Quantity <= i.Min_Stock_Level THEN 'CAN_NHAP_THEM'
                       ELSE 'BINH_THUONG'
                   END AS Trang_Thai_Ton
            FROM INVENTORY i
            JOIN WAREHOUSES w ON i.Warehouse_ID = w.Warehouse_ID
            JOIN LOCATIONS l
              ON i.Warehouse_ID = l.Warehouse_ID
             AND i.Aisle = l.Aisle AND i.Rack = l.Rack AND i.Shelf = l.Shelf AND i.Bin = l.Bin
            JOIN PRODUCT_VARIANTS pv ON i.Product_ID = pv.Product_ID AND i.SKU = pv.SKU
            JOIN PRODUCTS p ON pv.Product_ID = p.Product_ID
            LEFT JOIN INBOUND_RECEIPT_ITEMS ri ON i.Receipt_ID = ri.Receipt_ID 
                 AND i.Product_ID = ri.Product_ID AND i.SKU = ri.SKU AND i.Batch_Number = ri.Batch_Number
        `;
        const params = {};
        if (warehouseId) {
            sql += ` WHERE i.Warehouse_ID = :wh_id`;
            params.wh_id = warehouseId;
        }
        sql += ` ORDER BY i.Quantity ASC, Days_Left ASC`;
        if (limit) {
            sql += ` FETCH FIRST :limit ROWS ONLY`;
            params.limit = Number(limit);
        }
        const res = await db.executeQuery(sql, params);
        return res.rows || [];
    },

    async getInventoryAuditLogs(limit = 100) {
        const sql = `
            SELECT Log_ID, SKU, Batch_Number, Old_Quantity, New_Quantity,
                   TO_CHAR(Action_Time, 'YYYY-MM-DD HH24:MI:SS') AS Action_Time,
                   Action_By
            FROM INVENTORY_AUDIT_LOG
            ORDER BY Log_ID DESC
            FETCH FIRST :limit ROWS ONLY
        `;
        const res = await db.executeQuery(sql, { limit: Number(limit) });
        return res.rows || [];
    },

    // ==========================================
    // 2. NHÓM QUẢN TRỊ USER & PROFILE (ĐĂNG KÝ/ĐĂNG NHẬP BẰNG EMAIL)
    // ==========================================

    async getAllRoles() {
        const res = await db.executeQuery(`SELECT * FROM ROLES ORDER BY Role_ID ASC`);
        return res.rows || [];
    },

    async getAllWarehouses() {
        const sql = `
            SELECT w.Warehouse_ID, w.Warehouse_Name, w.Address,
                   NVL(loc.Total_Locations, 0) AS Total_Locations,
                   NVL(inv.Total_Stock, 0) AS Total_Stock
            FROM WAREHOUSES w
            LEFT JOIN (
                SELECT Warehouse_ID, COUNT(*) AS Total_Locations 
                FROM LOCATIONS 
                GROUP BY Warehouse_ID
            ) loc ON w.Warehouse_ID = loc.Warehouse_ID
            LEFT JOIN (
                SELECT Warehouse_ID, SUM(Quantity) AS Total_Stock 
                FROM INVENTORY 
                GROUP BY Warehouse_ID
            ) inv ON w.Warehouse_ID = inv.Warehouse_ID
            ORDER BY w.Warehouse_ID ASC
        `;
        const res = await db.executeQuery(sql);
        return res.rows || [];
    },

    // 1. Quản lý Kho Hàng (Warehouses)
    async createWarehouse({ warehouseName, address }) {
        const sql = `INSERT INTO WAREHOUSES (Warehouse_Name, Address) VALUES (:warehouseName, :address)`;
        return await db.executeQuery(sql, {
            warehouseName: warehouseName.trim(),
            address: address.trim()
        });
    },

    async updateWarehouse({ warehouseId, warehouseName, address }) {
        const sql = `UPDATE WAREHOUSES SET Warehouse_Name = :warehouseName, Address = :address WHERE Warehouse_ID = :warehouseId`;
        return await db.executeQuery(sql, {
            warehouseId: Number(warehouseId),
            warehouseName: warehouseName.trim(),
            address: address.trim()
        });
    },

    async deleteWarehouse(warehouseId) {
        // Kiểm tra xem kho có hàng tồn kho hay không
        const checkStockSql = `
            SELECT NVL(SUM(Quantity), 0) AS TOTAL_STOCK
            FROM INVENTORY
            WHERE Warehouse_ID = :warehouseId
        `;
        const stockRes = await db.executeQuery(checkStockSql, { warehouseId: Number(warehouseId) });
        if (stockRes.rows && stockRes.rows[0].TOTAL_STOCK > 0) {
            throw new Error(`Không thể xóa kho #${warehouseId} vì đang có ${stockRes.rows[0].TOTAL_STOCK} sản phẩm tồn kho! Hãy xuất kho hoặc chuyển vị trí trước.`);
        }

        // Kiểm tra xem kho có phiếu nhập kho liên kết hay không
        const checkReceipts = `
            SELECT COUNT(*) AS CNT FROM INBOUND_RECEIPTS WHERE Warehouse_ID = :warehouseId
        `;
        const recRes = await db.executeQuery(checkReceipts, { warehouseId: Number(warehouseId) });
        if (recRes.rows && recRes.rows[0].CNT > 0) {
            throw new Error(`Không thể xóa kho #${warehouseId} vì đang lưu vết ${recRes.rows[0].CNT} phiếu nhập kho!`);
        }

        // Được phép xóa kệ (khi không có hàng tồn kho) trước khi xóa kho
        await db.executeQuery(`DELETE FROM LOCATIONS WHERE Warehouse_ID = :warehouseId`, { warehouseId: Number(warehouseId) });

        // Xóa kho
        return await db.executeQuery(`DELETE FROM WAREHOUSES WHERE Warehouse_ID = :warehouseId`, { warehouseId: Number(warehouseId) });
    },

    // 2. Quản lý Vị Trí Kệ Kho (Locations: Aisle - Rack - Shelf - Bin)
    async getAllLocationsDetailed(warehouseId = null) {
        let sql = `
            SELECT l.Warehouse_ID, w.Warehouse_Name, l.Aisle, l.Rack, l.Shelf, l.Bin,
                   l.Aisle || '-' || l.Rack || '-' || l.Shelf || '-' || l.Bin AS Location_Code,
                   NVL(SUM(i.Quantity), 0) AS Total_Stock,
                   COUNT(i.SKU) AS Batch_Count
            FROM LOCATIONS l
            JOIN WAREHOUSES w ON l.Warehouse_ID = w.Warehouse_ID
            LEFT JOIN INVENTORY i ON l.Warehouse_ID = i.Warehouse_ID AND l.Aisle = i.Aisle AND l.Rack = i.Rack AND l.Shelf = i.Shelf AND l.Bin = i.Bin
            WHERE 1=1
        `;
        const params = {};
        if (warehouseId) {
            sql += ` AND l.Warehouse_ID = :warehouseId`;
            params.warehouseId = Number(warehouseId);
        }
        sql += `
            GROUP BY l.Warehouse_ID, w.Warehouse_Name, l.Aisle, l.Rack, l.Shelf, l.Bin
            ORDER BY l.Warehouse_ID ASC, l.Aisle ASC, l.Rack ASC, l.Shelf ASC, l.Bin ASC
        `;
        const res = await db.executeQuery(sql, params);
        return res.rows || [];
    },

    async createLocation({ warehouseId, aisle, rack, shelf, bin }) {
        const sql = `
            INSERT INTO LOCATIONS (Warehouse_ID, Aisle, Rack, Shelf, Bin)
            VALUES (:warehouseId, :aisle, :rack, :shelf, :bin)
        `;
        return await db.executeQuery(sql, {
            warehouseId: Number(warehouseId),
            aisle: aisle.trim().toUpperCase(),
            rack: rack.trim().toUpperCase(),
            shelf: shelf.trim().toUpperCase(),
            bin: bin.trim().toUpperCase()
        });
    },

    async updateLocation({ warehouseId, oldAisle, oldRack, oldShelf, oldBin, newAisle, newRack, newShelf, newBin }) {
        let conn;
        try {
            conn = await db.getConnection();
            const wId = Number(warehouseId);
            const oA = oldAisle.trim().toUpperCase();
            const oR = oldRack.trim().toUpperCase();
            const oS = oldShelf.trim().toUpperCase();
            const oB = oldBin.trim().toUpperCase();
            const nA = newAisle.trim().toUpperCase();
            const nR = newRack.trim().toUpperCase();
            const nS = newShelf.trim().toUpperCase();
            const nB = newBin.trim().toUpperCase();

            // Nếu vị trí không đổi, return
            if (oA === nA && oR === nR && oS === nS && oB === nB) {
                return { success: true };
            }

            // 1. Tạo vị trí mới trước
            await conn.execute(`
                INSERT INTO LOCATIONS (Warehouse_ID, Aisle, Rack, Shelf, Bin)
                VALUES (:warehouseId, :nA, :nR, :nS, :nB)
            `, { warehouseId: wId, nA, nR, nS, nB });

            // 2. Di chuyển toàn bộ hàng tồn kho từ vị trí cũ sang vị trí mới
            await conn.execute(`
                UPDATE INVENTORY
                SET Aisle = :nA, Rack = :nR, Shelf = :nS, Bin = :nB, Last_Updated = SYSTIMESTAMP
                WHERE Warehouse_ID = :warehouseId AND Aisle = :oA AND Rack = :oR AND Shelf = :oS AND Bin = :oB
            `, { warehouseId: wId, nA, nR, nS, nB, oA, oR, oS, oB });

            // 3. Xóa vị trí cũ
            await conn.execute(`
                DELETE FROM LOCATIONS
                WHERE Warehouse_ID = :warehouseId AND Aisle = :oA AND Rack = :oR AND Shelf = :oS AND Bin = :oB
            `, { warehouseId: wId, oA, oR, oS, oB });

            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    async deleteLocation({ warehouseId, aisle, rack, shelf, bin }) {
        const wId = Number(warehouseId);
        const a = aisle.trim().toUpperCase();
        const r = rack.trim().toUpperCase();
        const s = shelf.trim().toUpperCase();
        const b = bin.trim().toUpperCase();

        // Không cho xóa vị trí đang có hàng tồn kho, phải xóa hàng tồn kho trước
        const checkStock = `
            SELECT NVL(SUM(Quantity), 0) AS TOTAL_STOCK
            FROM INVENTORY
            WHERE Warehouse_ID = :warehouseId AND Aisle = :a AND Rack = :r AND Shelf = :s AND Bin = :b
        `;
        const stockRes = await db.executeQuery(checkStock, { warehouseId: wId, a, r, s, b });
        if (stockRes.rows && stockRes.rows[0].TOTAL_STOCK > 0) {
            throw new Error(`Không thể xóa vị trí [${a}-${r}-${s}-${b}] vì đang có ${stockRes.rows[0].TOTAL_STOCK} sản phẩm tồn kho! Bạn phải xóa hoặc chuyển hàng tồn kho trước khi xóa vị trí kệ.`);
        }

        const sql = `
            DELETE FROM LOCATIONS
            WHERE Warehouse_ID = :warehouseId AND Aisle = :a AND Rack = :r AND Shelf = :s AND Bin = :b
        `;
        return await db.executeQuery(sql, { warehouseId: wId, a, r, s, b });
    },

    // 3. Điều chuyển Vị Trí Hàng Tồn Kho (Chuyển lô hàng sang vị trí kệ khác)
    async moveInventoryLocation({ warehouseId, fromAisle, fromRack, fromShelf, fromBin, toAisle, toRack, toShelf, toBin, productId, sku, batchNumber }) {
        let conn;
        try {
            conn = await db.getConnection();
            const wId = Number(warehouseId);
            const pId = Number(productId);
            const sSku = sku.trim().toUpperCase();
            const bNum = batchNumber.trim().toUpperCase();

            const fA = fromAisle.trim().toUpperCase();
            const fR = fromRack.trim().toUpperCase();
            const fS = fromShelf.trim().toUpperCase();
            const fB = fromBin.trim().toUpperCase();

            const tA = toAisle.trim().toUpperCase();
            const tR = toRack.trim().toUpperCase();
            const tS = toShelf.trim().toUpperCase();
            const tB = toBin.trim().toUpperCase();

            // Kiểm tra xem vị trí đích có tồn tại trong LOCATIONS chưa
            const checkLoc = await conn.execute(`
                SELECT 1 FROM LOCATIONS 
                WHERE Warehouse_ID = :warehouseId AND Aisle = :tA AND Rack = :tR AND Shelf = :tS AND Bin = :tB
            `, { warehouseId: wId, tA, tR, tS, tB });

            if (!checkLoc.rows || checkLoc.rows.length === 0) {
                // Tự động tạo vị trí đích nếu chưa có
                await conn.execute(`
                    INSERT INTO LOCATIONS (Warehouse_ID, Aisle, Rack, Shelf, Bin)
                    VALUES (:warehouseId, :tA, :tR, :tS, :tB)
                `, { warehouseId: wId, tA, tR, tS, tB });
            }

            // Kiểm tra xem tại vị trí đích đã có bản ghi tồn kho của lô này chưa
            const checkTargetInv = await conn.execute(`
                SELECT Quantity FROM INVENTORY
                WHERE Warehouse_ID = :warehouseId AND Aisle = :tA AND Rack = :tR AND Shelf = :tS AND Bin = :tB
                  AND Product_ID = :pId AND SKU = :sSku AND Batch_Number = :bNum
            `, { warehouseId: wId, tA, tR, tS, tB, pId, sSku, bNum });

            // Lấy thông tin bản ghi nguồn
            const srcInv = await conn.execute(`
                SELECT Quantity, Receipt_ID, Min_Stock_Level FROM INVENTORY
                WHERE Warehouse_ID = :warehouseId AND Aisle = :fA AND Rack = :fR AND Shelf = :fS AND Bin = :fB
                  AND Product_ID = :pId AND SKU = :sSku AND Batch_Number = :bNum
            `, { warehouseId: wId, fA, fR, fS, fB, pId, sSku, bNum });

            if (!srcInv.rows || srcInv.rows.length === 0) {
                throw new Error(`Không tìm thấy hàng tồn của lô ${bNum} tại vị trí nguồn!`);
            }

            const movingQty = srcInv.rows[0].QUANTITY;
            const receiptId = srcInv.rows[0].RECEIPT_ID;
            const minStock = srcInv.rows[0].MIN_STOCK_LEVEL || 10;

            if (checkTargetInv.rows && checkTargetInv.rows.length > 0) {
                // Cộng dồn vào vị trí đích
                await conn.execute(`
                    UPDATE INVENTORY
                    SET Quantity = Quantity + :movingQty, Last_Updated = SYSTIMESTAMP
                    WHERE Warehouse_ID = :warehouseId AND Aisle = :tA AND Rack = :tR AND Shelf = :tS AND Bin = :tB
                      AND Product_ID = :pId AND SKU = :sSku AND Batch_Number = :bNum
                `, { movingQty, warehouseId: wId, tA, tR, tS, tB, pId, sSku, bNum });
            } else {
                // Tạo mới bản ghi tại vị trí đích
                await conn.execute(`
                    INSERT INTO INVENTORY (Warehouse_ID, Aisle, Rack, Shelf, Bin, Product_ID, SKU, Batch_Number, Receipt_ID, Quantity, Min_Stock_Level, Last_Updated)
                    VALUES (:warehouseId, :tA, :tR, :tS, :tB, :pId, :sSku, :bNum, :receiptId, :movingQty, :minStock, SYSTIMESTAMP)
                `, { warehouseId: wId, tA, tR, tS, tB, pId, sSku, bNum, receiptId, movingQty, minStock });
            }

            // Xóa bản ghi tại vị trí nguồn
            await conn.execute(`
                DELETE FROM INVENTORY
                WHERE Warehouse_ID = :warehouseId AND Aisle = :fA AND Rack = :fR AND Shelf = :fS AND Bin = :fB
                  AND Product_ID = :pId AND SKU = :sSku AND Batch_Number = :bNum
            `, { warehouseId: wId, fA, fR, fS, fB, pId, sSku, bNum });

            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    // 4. Xóa Hàng Tồn Kho (khi cần dọn kho để xóa kệ)
    async deleteInventoryItem({ warehouseId, aisle, rack, shelf, bin, productId, sku, batchNumber }) {
        const wId = Number(warehouseId);
        const a = aisle.trim().toUpperCase();
        const r = rack.trim().toUpperCase();
        const s = shelf.trim().toUpperCase();
        const b = bin.trim().toUpperCase();
        const pId = Number(productId);
        const sSku = sku.trim().toUpperCase();
        const bNum = batchNumber.trim().toUpperCase();

        let conn;
        try {
            conn = await db.getConnection();

            // 1. Lấy thông tin Receipt_ID trước khi xóa
            const recRes = await conn.execute(
                `SELECT Receipt_ID FROM INVENTORY
                 WHERE Warehouse_ID = :wId AND Aisle = :a AND Rack = :r AND Shelf = :s AND Bin = :b
                   AND Product_ID = :pId AND SKU = :sSku AND Batch_Number = :bNum`,
                { wId, a, r, s, b, pId, sSku, bNum }
            );
            const receiptId = (recRes.rows && recRes.rows[0]) ? recRes.rows[0].RECEIPT_ID : null;

            // 2. Thực hiện xóa bản ghi tồn kho
            await conn.execute(
                `DELETE FROM INVENTORY
                 WHERE Warehouse_ID = :wId AND Aisle = :a AND Rack = :r AND Shelf = :s AND Bin = :b
                   AND Product_ID = :pId AND SKU = :sSku AND Batch_Number = :bNum`,
                { wId, a, r, s, b, pId, sSku, bNum }
            );

            // 3. Nếu phiếu nhập kho tương ứng không còn bất kỳ hàng nào trên kệ (đã xóa sạch hoặc xuất sạch)
            // thì cập nhật trạng thái phiếu nhập kho sang 'STOCK_REMOVED' (Đã xóa / hủy khỏi kho)
            if (receiptId) {
                const checkRemain = await conn.execute(
                    `SELECT COUNT(*) AS CNT FROM INVENTORY WHERE Receipt_ID = :receiptId`,
                    { receiptId }
                );
                if (checkRemain.rows && checkRemain.rows[0].CNT === 0) {
                    await conn.execute(
                        `UPDATE INBOUND_RECEIPTS SET Status = 'STOCK_REMOVED' WHERE Receipt_ID = :receiptId`,
                        { receiptId }
                    );
                }
            }

            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    async getAllUsers() {
        const sql = `
            SELECT u.User_ID, u.Username, u.Email, u.Phone, u.Full_Name, u.Avatar,
                   TO_CHAR(u.Created_At, 'YYYY-MM-DD HH24:MI') AS Created_At,
                   u.Role_ID, r.Role_Name, r.Description AS Role_Desc,
                   u.Warehouse_ID, w.Warehouse_Name
            FROM USERS u
            JOIN ROLES r ON u.Role_ID = r.Role_ID
            LEFT JOIN WAREHOUSES w ON u.Warehouse_ID = w.Warehouse_ID
            ORDER BY u.User_ID DESC
        `;
        const res = await db.executeQuery(sql);
        return res.rows || [];
    },

    async getUserById(userId) {
        const sql = `
            SELECT u.*, r.Role_Name, w.Warehouse_Name
            FROM USERS u
            JOIN ROLES r ON u.Role_ID = r.Role_ID
            LEFT JOIN WAREHOUSES w ON u.Warehouse_ID = w.Warehouse_ID
            WHERE u.User_ID = :user_id
        `;
        const res = await db.executeQuery(sql, { user_id: userId });
        return res.rows[0] || null;
    },

    // Tìm kiếm theo EMAIL (Yêu cầu 1)
    async getUserByEmail(email) {
        const sql = `
            SELECT u.*, r.Role_Name, w.Warehouse_Name
            FROM USERS u
            JOIN ROLES r ON u.Role_ID = r.Role_ID
            LEFT JOIN WAREHOUSES w ON u.Warehouse_ID = w.Warehouse_ID
            WHERE LOWER(TRIM(u.Email)) = LOWER(TRIM(:email))
        `;
        const res = await db.executeQuery(sql, { email });
        return res.rows[0] || null;
    },

    async getUserByUsername(username) {
        const sql = `
            SELECT u.*, r.Role_Name, w.Warehouse_Name
            FROM USERS u
            JOIN ROLES r ON u.Role_ID = r.Role_ID
            LEFT JOIN WAREHOUSES w ON u.Warehouse_ID = w.Warehouse_ID
            WHERE u.Username = :username
        `;
        const res = await db.executeQuery(sql, { username });
        return res.rows[0] || null;
    },

    async createUser({ username, passwordHash, email, phone, fullName, roleId, warehouseId = null, avatar = null }) {
        const sql = `
            INSERT INTO USERS (Username, Password_Hash, Email, Phone, Full_Name, Role_ID, Warehouse_ID, Avatar)
            VALUES (:username, :passwordHash, :email, :phone, :fullName, :roleId, :warehouseId, :avatar)
        `;
        return await db.executeQuery(sql, { 
            username, 
            passwordHash, 
            email: email.trim().toLowerCase(), 
            phone, 
            fullName, 
            roleId, 
            warehouseId, 
            avatar: avatar || '/images/default-avatar.png' 
        });
    },

    async updateProfile(userId, { fullName, phone, email, avatar, address }) {
        const sql = `
            UPDATE USERS
            SET Full_Name = :fullName, Phone = :phone, Email = :email, Avatar = :avatar, Address = :address
            WHERE User_ID = :userId
        `;
        return await db.executeQuery(sql, {
            fullName,
            phone,
            email: email.trim().toLowerCase(),
            avatar: avatar || '/images/default-avatar.png',
            address: address ? address.trim() : null,
            userId
        });
    },

    async countOrdersByUser(userId) {
        const sql = `SELECT COUNT(*) AS CNT FROM ORDERS WHERE User_ID = :userId`;
        const res = await db.executeQuery(sql, { userId });
        return res.rows[0]?.CNT || 0;
    },

    async deleteUser(userId) {
        let conn;
        try {
            conn = await db.getConnection();
            await conn.execute(`DELETE FROM SEARCH_HISTORY WHERE User_ID = :userId`, { userId });
            await conn.execute(`DELETE FROM CHAT_MESSAGES WHERE Sender_ID = :userId OR Receiver_ID = :userId`, { userId });
            await conn.execute(`DELETE FROM USERS WHERE User_ID = :userId`, { userId });
            await conn.commit();
            return true;
        } catch(e) {
            if (conn) await conn.rollback();
            throw e;
        } finally {
            if (conn) await conn.close();
        }
    },

    async updateUserRoleAndWarehouse(userId, roleId, warehouseId) {
        const sql = `
            UPDATE USERS
            SET Role_ID = :roleId, Warehouse_ID = :warehouseId
            WHERE User_ID = :userId
        `;
        return await db.executeQuery(sql, { userId, roleId, warehouseId: warehouseId || null });
    },

    // ==========================================
    // 3. SHOPS, CATEGORIES & PRODUCTS
    // ==========================================

    async getAllShops() {
        const sql = `
            SELECT s.Shop_ID, s.Shop_Name, s.Rating, s.Status,
                   TO_CHAR(s.Created_At, 'YYYY-MM-DD') AS Created_At,
                   s.User_ID, u.Full_Name AS Owner_Name, u.Email AS Owner_Email
            FROM SHOPS s
            JOIN USERS u ON s.User_ID = u.User_ID
            ORDER BY s.Shop_ID DESC
        `;
        const res = await db.executeQuery(sql);
        return res.rows || [];
    },

    async getShopByUserId(userId) {
        const sql = `SELECT * FROM SHOPS WHERE User_ID = :userId`;
        const res = await db.executeQuery(sql, { userId });
        return res.rows[0] || null;
    },

    async getShopById(shopId) {
        const sql = `
            SELECT s.*, u.Full_Name AS Owner_Name, u.Email AS Owner_Email, u.Avatar AS Owner_Avatar
            FROM SHOPS s
            JOIN USERS u ON s.User_ID = u.User_ID
            WHERE s.Shop_ID = :shopId
        `;
        const res = await db.executeQuery(sql, { shopId });
        return res.rows[0] || null;
    },

    async createShop(shopName, userId) {
        const sql = `INSERT INTO SHOPS (Shop_Name, User_ID) VALUES (:shopName, :userId)`;
        return await db.executeQuery(sql, { shopName, userId });
    },

    async getAllCategories() {
        const sql = `
            SELECT c1.Category_ID, c1.Category_Name, c1.Image_URL, c1.Parent_Category_ID,
                   c2.Category_Name AS Parent_Name
            FROM CATEGORIES c1
            LEFT JOIN CATEGORIES c2 ON c1.Parent_Category_ID = c2.Category_ID
            ORDER BY c1.Category_ID ASC
        `;
        const res = await db.executeQuery(sql);
        return res.rows || [];
    },

    async createCategory(categoryName, imageUrl, parentCategoryId = null) {
        const sql = `
            INSERT INTO CATEGORIES (Category_Name, Image_URL, Parent_Category_ID)
            VALUES (:categoryName, :imageUrl, :parentCategoryId)
        `;
        return await db.executeQuery(sql, { 
            categoryName: categoryName.trim(), 
            imageUrl: imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=120', 
            parentCategoryId: parentCategoryId ? Number(parentCategoryId) : null 
        });
    },

    async updateCategory(categoryId, categoryName, imageUrl, parentCategoryId = null) {
        const sql = `
            UPDATE CATEGORIES
            SET Category_Name = :categoryName,
                Image_URL = :imageUrl,
                Parent_Category_ID = :parentCategoryId
            WHERE Category_ID = :categoryId
        `;
        return await db.executeQuery(sql, {
            categoryId: Number(categoryId),
            categoryName: categoryName.trim(),
            imageUrl: imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=120',
            parentCategoryId: parentCategoryId ? Number(parentCategoryId) : null
        });
    },

    async deleteCategory(categoryId) {
        const catId = Number(categoryId);

        // 1. Kiểm tra xem danh mục này có danh mục con trực thuộc hay không
        const checkChildrenSql = `
            SELECT COUNT(*) AS CNT, LISTAGG(Category_Name, ', ') WITHIN GROUP (ORDER BY Category_ID) AS CHILD_NAMES
            FROM CATEGORIES
            WHERE Parent_Category_ID = :catId
        `;
        const childRes = await db.executeQuery(checkChildrenSql, { catId });
        if (childRes.rows && childRes.rows[0].CNT > 0) {
            throw new Error(`Không thể xóa danh mục này vì đang có ${childRes.rows[0].CNT} danh mục con trực thuộc: [${childRes.rows[0].CHILD_NAMES}]. Bạn cần xóa hoặc chuyển các danh mục con trước!`);
        }

        // 2. Kiểm tra xem danh mục này có sản phẩm đang thuộc về hay không
        const checkProdSql = `
            SELECT COUNT(*) AS CNT, LISTAGG(Product_Name, ', ') WITHIN GROUP (ORDER BY Product_ID) AS PROD_NAMES
            FROM PRODUCTS
            WHERE Category_ID = :catId
        `;
        const prodRes = await db.executeQuery(checkProdSql, { catId });
        if (prodRes.rows && prodRes.rows[0].CNT > 0) {
            throw new Error(`Không thể xóa danh mục này vì đang chứa ${prodRes.rows[0].CNT} sản phẩm: [${prodRes.rows[0].PROD_NAMES}]. Bạn cần xóa hoặc chuyển danh mục cho các sản phẩm này trước khi xóa!`);
        }

        // 3. Xóa liên kết trong bảng SELLS_CATEGORIES (nếu có)
        await db.executeQuery(`DELETE FROM SELLS_CATEGORIES WHERE Category_ID = :catId`, { catId });

        // 4. Xóa danh mục
        const deleteSql = `DELETE FROM CATEGORIES WHERE Category_ID = :catId`;
        return await db.executeQuery(deleteSql, { catId });
    },

    async linkShopCategory(shopId, categoryId) {
        const sql = `INSERT INTO SELLS_CATEGORIES (Shop_ID, Category_ID) VALUES (:shopId, :categoryId)`;
        return await db.executeQuery(sql, { shopId, categoryId });
    },

    async getAllProducts({ shopId = null, categoryId = null, keyword = null, userId = null } = {}) {
        let sql = `
            SELECT p.Product_ID, p.Product_Name, p.Status, 
                   TO_CHAR(p.Created_At, 'YYYY-MM-DD') AS Created_At,
                   p.Category_ID, c.Category_Name, c.Parent_Category_ID,
                   s.Shop_ID, s.Shop_Name,
                   COUNT(DISTINCT pv.SKU) AS Total_Variants,
                   NVL(MIN(pv.Price), 0) AS Min_Price,
                   NVL(MAX(pv.Price), 0) AS Max_Price,
                   NVL(MAX(pv.Image_URL), 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500') AS Main_Image,
                   NVL((SELECT SUM(oi.Quantity) FROM ORDER_ITEMS oi WHERE oi.Product_ID = p.Product_ID), 0) AS Sold_Count,
                   NVL((SELECT SUM(i.Quantity) FROM INVENTORY i WHERE i.Product_ID = p.Product_ID), 0) AS Total_Stock,
                   NVL((SELECT ROUND(AVG(Rating), 1) FROM PRODUCT_REVIEWS pr WHERE pr.Product_ID = p.Product_ID), 5.0) AS Avg_Rating,
                   NVL((SELECT COUNT(*) FROM PRODUCT_REVIEWS pr WHERE pr.Product_ID = p.Product_ID), 0) AS Review_Count,
                   CASE WHEN :userId IS NOT NULL AND (SELECT COUNT(*) FROM PRODUCT_FAVORITES pf WHERE pf.User_ID = :userId AND pf.Product_ID = p.Product_ID) > 0 THEN 1 ELSE 0 END AS Is_Favorite
            FROM PRODUCTS p
            JOIN CATEGORIES c ON p.Category_ID = c.Category_ID
            JOIN SELLS_PRODUCT sp ON p.Product_ID = sp.Product_ID
            JOIN SHOPS s ON sp.Shop_ID = s.Shop_ID
            LEFT JOIN PRODUCT_VARIANTS pv ON p.Product_ID = pv.Product_ID
            WHERE 1=1
        `;
        const params = { userId: userId ? Number(userId) : null };
        if (shopId) {
            sql += ` AND s.Shop_ID = :shopId`;
            params.shopId = Number(shopId);
        }
        if (categoryId) {
            // Hỗ trợ chọn danh mục cha thì hiển thị cả sản phẩm thuộc danh mục con
            sql += ` AND (p.Category_ID = :categoryId OR c.Parent_Category_ID = :categoryId)`;
            params.categoryId = Number(categoryId);
        }
        if (keyword) {
            sql += ` AND LOWER(p.Product_Name) LIKE LOWER(:keyword)`;
            params.keyword = `%${keyword}%`;
        }
        sql += ` GROUP BY p.Product_ID, p.Product_Name, p.Status, p.Created_At, p.Category_ID, c.Category_Name, c.Parent_Category_ID, s.Shop_ID, s.Shop_Name ORDER BY Sold_Count DESC, p.Product_ID DESC`;
        const res = await db.executeQuery(sql, params);
        return res.rows || [];
    },

    async getProductDetails(productId) {
        const prodSql = `
            SELECT p.*, c.Category_Name, s.Shop_ID, s.Shop_Name, s.Rating AS Shop_Rating,
                   NVL((SELECT SUM(oi.Quantity) FROM ORDER_ITEMS oi WHERE oi.Product_ID = p.Product_ID), 0) AS Sold_Count,
                   NVL((SELECT SUM(i.Quantity) FROM INVENTORY i WHERE i.Product_ID = p.Product_ID), 0) AS Total_Stock,
                   NVL((SELECT ROUND(AVG(Rating), 1) FROM PRODUCT_REVIEWS pr WHERE pr.Product_ID = p.Product_ID), 5.0) AS Avg_Rating,
                   NVL((SELECT COUNT(*) FROM PRODUCT_REVIEWS pr WHERE pr.Product_ID = p.Product_ID), 0) AS Review_Count
            FROM PRODUCTS p
            JOIN CATEGORIES c ON p.Category_ID = c.Category_ID
            JOIN SELLS_PRODUCT sp ON p.Product_ID = sp.Product_ID
            JOIN SHOPS s ON sp.Shop_ID = s.Shop_ID
            WHERE p.Product_ID = :productId
        `;
        const prodRes = await db.executeQuery(prodSql, { productId });
        if (!prodRes.rows || prodRes.rows.length === 0) return null;

        const variantsSql = `
            SELECT pv.*, NVL(SUM(i.Quantity), 0) AS Stock_Quantity
            FROM PRODUCT_VARIANTS pv
            LEFT JOIN INVENTORY i ON pv.Product_ID = i.Product_ID AND pv.SKU = i.SKU
            WHERE pv.Product_ID = :productId
            GROUP BY pv.Product_ID, pv.SKU, pv.Variant_Name, pv.Price, pv.Image_URL
            ORDER BY pv.Price ASC
        `;
        const varRes = await db.executeQuery(variantsSql, { productId });

        // Bình luận
        const revSql = `
            SELECT pr.*, u.Full_Name, u.Username, NVL(u.Avatar, '/images/default-avatar.png') AS Avatar,
                   TO_CHAR(pr.Created_At, 'YYYY-MM-DD HH24:MI') AS Review_Date,
                   pv.Variant_Name
            FROM PRODUCT_REVIEWS pr
            JOIN USERS u ON pr.User_ID = u.User_ID
            LEFT JOIN PRODUCT_VARIANTS pv ON pr.Product_ID = pv.Product_ID AND pr.SKU = pv.SKU
            WHERE pr.Product_ID = :productId
            ORDER BY pr.Review_ID DESC
        `;
        const revRes = await db.executeQuery(revSql, { productId });

        return {
            ...prodRes.rows[0],
            variants: varRes.rows || [],
            reviews: revRes.rows || []
        };
    },

    async createProductWithVariant({ productName, categoryId, shopId, sku, variantName, price, imageUrl }) {
        let conn;
        try {
            conn = await db.getConnection();
            const pSql = `
                INSERT INTO PRODUCTS (Product_Name, Category_ID) 
                VALUES (:productName, :categoryId)
                RETURNING Product_ID INTO :newProdId
            `;
            const pResult = await conn.execute(pSql, {
                productName,
                categoryId: Number(categoryId),
                newProdId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            });
            const newProdId = pResult.outBinds.newProdId[0];

            await conn.execute(`INSERT INTO SELLS_PRODUCT (Shop_ID, Product_ID) VALUES (:shopId, :productId)`, {
                shopId: Number(shopId),
                productId: newProdId
            });

            await conn.execute(`
                INSERT INTO PRODUCT_VARIANTS (Product_ID, SKU, Variant_Name, Price, Image_URL)
                VALUES (:productId, :sku, :variantName, :price, :imageUrl)
            `, {
                productId: newProdId,
                sku,
                variantName,
                price: Number(price),
                imageUrl: imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'
            });

            await conn.commit();
            return { success: true, productId: newProdId };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    // ==========================================
    // 4. BÌNH LUẬN & ĐÁNH GIÁ SẢN PHẨM (YÊU CẦU 13)
    // ==========================================
    async createProductReview({ orderId, productId, sku, userId, rating, commentText }) {
        const sql = `
            INSERT INTO PRODUCT_REVIEWS (Order_ID, Product_ID, SKU, User_ID, Rating, Comment_Text)
            VALUES (:orderId, :productId, :sku, :userId, :rating, :commentText)
        `;
        return await db.executeQuery(sql, {
            orderId: Number(orderId),
            productId: Number(productId),
            sku,
            userId: Number(userId),
            rating: Number(rating || 5),
            commentText
        });
    },

    async getReviewByOrderAndProd(orderId, productId, sku) {
        const sql = `
            SELECT * FROM PRODUCT_REVIEWS 
            WHERE Order_ID = :orderId AND Product_ID = :productId AND SKU = :sku
        `;
        const res = await db.executeQuery(sql, { orderId: Number(orderId), productId: Number(productId), sku });
        return res.rows[0] || null;
    },

    // ==========================================
    // 5. TÌM KIẾM & LỊCH SỬ TÌM KIẾM (YÊU CẦU 10 & 11)
    // ==========================================
    async saveSearchKeyword(userId, keyword) {
        if (!keyword || !keyword.trim()) return;
        if (userId) {
            const sql = `INSERT INTO SEARCH_HISTORY (User_ID, Keyword) VALUES (:userId, :keyword)`;
            await db.executeQuery(sql, { userId: Number(userId), keyword: keyword.trim() });
        }
    },

    async getRecentSearches(userId) {
        if (!userId) return [];
        const sql = `
            SELECT DISTINCT Keyword
            FROM SEARCH_HISTORY
            WHERE User_ID = :userId
            ORDER BY Keyword ASC
            FETCH FIRST 6 ROWS ONLY
        `;
        const res = await db.executeQuery(sql, { userId: Number(userId) });
        return (res.rows || []).map(r => r.KEYWORD);
    },

    async getTrendingProducts() {
        const sql = `
            SELECT p.Product_ID, p.Product_Name, MIN(pv.Price) AS Price, MAX(pv.Image_URL) AS Image_URL
            FROM PRODUCTS p
            JOIN PRODUCT_VARIANTS pv ON p.Product_ID = pv.Product_ID
            GROUP BY p.Product_ID, p.Product_Name
            FETCH FIRST 5 ROWS ONLY
        `;
        const res = await db.executeQuery(sql);
        return res.rows || [];
    },

    // ==========================================
    // 6. TIN NHẮN CHAT TƯ VẤN (CUSTOMER - SHOPKEEPER - ADMIN) (YÊU CẦU 8)
    // ==========================================
    async getChatMessages(shopId = 1, limit = 50) {
        const sql = `
            SELECT cm.Message_ID, cm.Sender_ID, cm.Sender_Name, cm.Sender_Role,
                   cm.Receiver_ID, cm.Shop_ID, cm.Message_Text, cm.Is_Auto_Reply,
                   TO_CHAR(cm.Created_At, 'HH24:MI DD/MM') AS Msg_Time
            FROM CHAT_MESSAGES cm
            WHERE cm.Shop_ID = :shopId
            ORDER BY cm.Message_ID ASC
            FETCH FIRST :limit ROWS ONLY
        `;
        const res = await db.executeQuery(sql, { shopId: Number(shopId), limit: Number(limit) });
        return res.rows || [];
    },

    async sendChatMessage({ senderId, senderName, senderRole, receiverId, shopId, messageText }) {
        let conn;
        try {
            conn = await db.getConnection();
            const sql = `
                INSERT INTO CHAT_MESSAGES (Sender_ID, Sender_Name, Sender_Role, Receiver_ID, Shop_ID, Message_Text, Is_Auto_Reply)
                VALUES (:senderId, :senderName, :senderRole, :receiverId, :shopId, :messageText, 0)
            `;
            await conn.execute(sql, {
                senderId: senderId ? Number(senderId) : null,
                senderName: senderName || 'Khách hàng mới 001',
                senderRole: senderRole || 'GUEST',
                receiverId: receiverId ? Number(receiverId) : null,
                shopId: Number(shopId || 1),
                messageText
            });

            // Nếu người gửi là CUSTOMER hoặc GUEST -> Tự động phản hồi tin nhắn bot
            if (senderRole === 'CUSTOMER' || senderRole === 'GUEST') {
                const autoText = 'Chào bạn! Cảm ơn bạn đã ghé thăm gian hàng. Chúng tôi đã nhận được câu hỏi và sẽ phản hồi sớm nhất có thể nhé!';
                await conn.execute(`
                    INSERT INTO CHAT_MESSAGES (Sender_ID, Sender_Name, Sender_Role, Receiver_ID, Shop_ID, Message_Text, Is_Auto_Reply)
                    VALUES (NULL, 'Shopee Bot Tự Động', 'BOT', :receiverId, :shopId, :autoText, 1)
                `, {
                    receiverId: senderId ? Number(senderId) : null,
                    shopId: Number(shopId || 1),
                    autoText
                });
            }

            await conn.commit();
            return true;
        } catch(e) {
            if (conn) await conn.rollback();
            throw e;
        } finally {
            if (conn) await conn.close();
        }
    },

    // ==========================================
    // 7. INBOUND RECEIPTS, ORDERS & TRACKING
    // ==========================================

    async getAllLocations(warehouseId = 1) {
        const sql = `SELECT * FROM LOCATIONS WHERE Warehouse_ID = :warehouseId ORDER BY Aisle, Rack, Shelf, Bin`;
        const res = await db.executeQuery(sql, { warehouseId });
        return res.rows || [];
    },

    async getAllInboundReceipts(shopId = null) {
        let sql = `
            SELECT ir.Receipt_ID, ir.Status, 
                   TO_CHAR(ir.Created_At, 'YYYY-MM-DD HH24:MI') AS Created_At,
                   ir.Shop_ID, s.Shop_Name,
                   ir.Warehouse_ID, w.Warehouse_Name,
                   ir.User_ID, u.Full_Name AS Creator_Name,
                   COUNT(iri.Batch_Number) AS Total_Batches,
                   SUM(iri.Quantity) AS Total_Quantity,
                   NVL(SUM(i.Quantity), 0) AS Current_Inventory_Stock,
                   COUNT(i.Batch_Number) AS Batches_In_Inventory
            FROM INBOUND_RECEIPTS ir
            JOIN SHOPS s ON ir.Shop_ID = s.Shop_ID
            JOIN WAREHOUSES w ON ir.Warehouse_ID = w.Warehouse_ID
            JOIN USERS u ON ir.User_ID = u.User_ID
            LEFT JOIN INBOUND_RECEIPT_ITEMS iri ON ir.Receipt_ID = iri.Receipt_ID
            LEFT JOIN INVENTORY i ON ir.Receipt_ID = i.Receipt_ID
        `;
        const params = {};
        if (shopId) {
            sql += ` WHERE ir.Shop_ID = :shopId`;
            params.shopId = shopId;
        }
        sql += ` GROUP BY ir.Receipt_ID, ir.Status, ir.Created_At, ir.Shop_ID, s.Shop_Name, ir.Warehouse_ID, w.Warehouse_Name, ir.User_ID, u.Full_Name ORDER BY ir.Receipt_ID DESC`;
        const res = await db.executeQuery(sql, params);
        return res.rows || [];
    },

    async createInboundReceipt({ shopId, warehouseId, userId, items }) {
        let conn;
        try {
            conn = await db.getConnection();
            const rSql = `
                INSERT INTO INBOUND_RECEIPTS (Shop_ID, Warehouse_ID, User_ID, Status)
                VALUES (:shopId, :warehouseId, :userId, 'PENDING')
                RETURNING Receipt_ID INTO :newReceiptId
            `;
            const rRes = await conn.execute(rSql, {
                shopId: Number(shopId),
                warehouseId: Number(warehouseId),
                userId: Number(userId),
                newReceiptId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            });
            const receiptId = rRes.outBinds.newReceiptId[0];

            for (const it of items) {
                await conn.execute(`
                    INSERT INTO INBOUND_RECEIPT_ITEMS (Receipt_ID, Product_ID, SKU, Batch_Number, Quantity, Expiry_Date)
                    VALUES (:receiptId, :productId, :sku, :batchNumber, :quantity, TO_DATE(:expiryDate, 'YYYY-MM-DD'))
                `, {
                    receiptId,
                    productId: Number(it.productId),
                    sku: it.sku,
                    batchNumber: it.batchNumber,
                    quantity: Number(it.quantity),
                    expiryDate: it.expiryDate
                });
            }

            await conn.commit();
            return { success: true, receiptId };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    // Lấy chi tiết một phiếu nhập kho kèm các lô hàng trong phiếu
    async getInboundReceiptById(receiptId) {
        const rSql = `
            SELECT ir.Receipt_ID, ir.Status,
                   TO_CHAR(ir.Created_At, 'YYYY-MM-DD HH24:MI') AS Created_At,
                   ir.Shop_ID, s.Shop_Name,
                   ir.Warehouse_ID, w.Warehouse_Name,
                   ir.User_ID, u.Full_Name AS Creator_Name
            FROM INBOUND_RECEIPTS ir
            JOIN SHOPS s ON ir.Shop_ID = s.Shop_ID
            JOIN WAREHOUSES w ON ir.Warehouse_ID = w.Warehouse_ID
            JOIN USERS u ON ir.User_ID = u.User_ID
            WHERE ir.Receipt_ID = :receiptId
        `;
        const rRes = await db.executeQuery(rSql, { receiptId: Number(receiptId) });
        if (!rRes.rows || rRes.rows.length === 0) return null;

        const receipt = rRes.rows[0];
        const itemsSql = `
            SELECT iri.Receipt_ID, iri.Product_ID, iri.SKU, iri.Batch_Number, iri.Quantity,
                   TO_CHAR(iri.Expiry_Date, 'YYYY-MM-DD') AS Expiry_Date,
                   p.Product_Name, pv.Variant_Name
            FROM INBOUND_RECEIPT_ITEMS iri
            JOIN PRODUCTS p ON iri.Product_ID = p.Product_ID
            JOIN PRODUCT_VARIANTS pv ON iri.Product_ID = pv.Product_ID AND iri.SKU = pv.SKU
            WHERE iri.Receipt_ID = :receiptId
        `;
        const itemsRes = await db.executeQuery(itemsSql, { receiptId: Number(receiptId) });
        receipt.items = itemsRes.rows || [];
        return receipt;
    },

    // Cập nhật thông tin phiếu nhập kho (Kho tiếp nhận, Trạng thái, và Lô hàng: Số lượng, Hạn dùng)
    async updateInboundReceipt({ receiptId, warehouseId, status, quantity, expiryDate }) {
        const rId = Number(receiptId);
        let conn;
        try {
            conn = await db.getConnection();

            // 1. Cập nhật thông tin phiếu chính
            let updateReceiptSql = `UPDATE INBOUND_RECEIPTS SET Status = :status`;
            const params = { status: status || 'PENDING', rId };
            if (warehouseId) {
                updateReceiptSql += `, Warehouse_ID = :warehouseId`;
                params.warehouseId = Number(warehouseId);
            }
            updateReceiptSql += ` WHERE Receipt_ID = :rId`;
            await conn.execute(updateReceiptSql, params);

            // 2. Cập nhật số lượng và hạn dùng của lô hàng trong INBOUND_RECEIPT_ITEMS nếu có truyền
            if (quantity || expiryDate) {
                let updateItemSql = `UPDATE INBOUND_RECEIPT_ITEMS SET `;
                const itemParams = { rId };
                const setClauses = [];
                if (quantity) {
                    setClauses.push(`Quantity = :quantity`);
                    itemParams.quantity = Number(quantity);
                }
                if (expiryDate) {
                    setClauses.push(`Expiry_Date = TO_DATE(:expiryDate, 'YYYY-MM-DD')`);
                    itemParams.expiryDate = expiryDate.trim();
                }
                updateItemSql += setClauses.join(', ') + ` WHERE Receipt_ID = :rId`;
                await conn.execute(updateItemSql, itemParams);

                // Đồng bộ cập nhật vào INVENTORY nếu phiếu này đang có hàng trên kệ
                if (quantity) {
                    await conn.execute(
                        `UPDATE INVENTORY SET Quantity = :quantity, Last_Updated = SYSTIMESTAMP WHERE Receipt_ID = :rId`,
                        { quantity: Number(quantity), rId }
                    );
                }
            }

            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    // Xóa phiếu nhập kho an toàn (đồng bộ xóa INVENTORY và INBOUND_RECEIPT_ITEMS)
    async deleteInboundReceipt(receiptId) {
        const rId = Number(receiptId);
        let conn;
        try {
            conn = await db.getConnection();

            // 1. Xóa hàng tồn kho liên quan trong INVENTORY trước
            await conn.execute(`DELETE FROM INVENTORY WHERE Receipt_ID = :rId`, { rId });

            // 2. Xóa các lô hàng trong INBOUND_RECEIPT_ITEMS
            await conn.execute(`DELETE FROM INBOUND_RECEIPT_ITEMS WHERE Receipt_ID = :rId`, { rId });

            // 3. Xóa phiếu nhập kho trong INBOUND_RECEIPTS
            await conn.execute(`DELETE FROM INBOUND_RECEIPTS WHERE Receipt_ID = :rId`, { rId });

            await conn.commit();
            return { success: true };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    async getAllOrders(userId = null, shopId = null, limit = 500) {
        let sql = `
            SELECT o.Order_ID,
                   u.Full_Name AS Khach_Hang,
                   u.Phone AS Sdt_Khach,
                   o.Total_Amount,
                   o.Status AS Trang_Thai_Don,
                   o.Shipping_Address,
                   TO_CHAR(o.Created_At, 'YYYY-MM-DD HH24:MI') AS Ngay_Dat,
                   NVL(pm.Payment_Method, 'CHUA_THANH_TOAN') AS Phuong_Thuc_TT,
                   NVL(pm.Status, 'UNPAID') AS Trang_Thai_TT,
                   NVL(s.Carrier_Name, 'CHUA_GAN_DVVC') AS Don_Vi_Van_Chuyen,
                   NVL(s.Tracking_Number, '-') AS Ma_Van_Don,
                   NVL(s.Status, 'PENDING') AS Trang_Thai_Giao,
                   TO_CHAR(s.Shipped_At, 'YYYY-MM-DD HH24:MI') AS Ngay_Giao
            FROM ORDERS o
            JOIN USERS u ON o.User_ID = u.User_ID
            LEFT JOIN PAYMENTS pm ON o.Order_ID = pm.Order_ID
            LEFT JOIN SHIPMENTS s ON o.Order_ID = s.Order_ID
            WHERE 1=1
        `;
        const params = {};
        if (userId) {
            sql += ` AND o.User_ID = :userId`;
            params.userId = userId;
        }
        if (shopId) {
            sql += ` AND o.Order_ID IN (
                SELECT oi.Order_ID FROM ORDER_ITEMS oi
                JOIN SELLS_PRODUCT sp ON oi.Product_ID = sp.Product_ID
                WHERE sp.Shop_ID = :shopId
            )`;
            params.shopId = Number(shopId);
        }
        sql += ` ORDER BY o.Order_ID DESC`;
        if (limit) {
            sql += ` FETCH FIRST :limit ROWS ONLY`;
            params.limit = Number(limit);
        }
        const res = await db.executeQuery(sql, params);
        return res.rows || [];
    },

    async getOrderDetails(orderId) {
        const orderSql = `
            SELECT o.*, u.Full_Name AS Customer_Name, u.Email AS Customer_Email, u.Phone AS Customer_Phone,
                   pm.Payment_Method, pm.Status AS Payment_Status,
                   s.Carrier_Name, s.Tracking_Number, s.Status AS Shipment_Status,
                   TO_CHAR(s.Shipped_At, 'YYYY-MM-DD HH24:MI') AS Shipped_At
            FROM ORDERS o
            JOIN USERS u ON o.User_ID = u.User_ID
            LEFT JOIN PAYMENTS pm ON o.Order_ID = pm.Order_ID
            LEFT JOIN SHIPMENTS s ON o.Order_ID = s.Order_ID
            WHERE o.Order_ID = :orderId
        `;
        const oRes = await db.executeQuery(orderSql, { orderId });
        if (!oRes.rows.length) return null;

        const itemsSql = `
            SELECT oi.*, p.Product_Name, pv.Variant_Name, pv.Image_URL,
                   pr.Review_ID, pr.Rating AS Reviewed_Rating
            FROM ORDER_ITEMS oi
            JOIN PRODUCTS p ON oi.Product_ID = p.Product_ID
            JOIN PRODUCT_VARIANTS pv ON oi.Product_ID = pv.Product_ID AND oi.SKU = pv.SKU
            LEFT JOIN PRODUCT_REVIEWS pr ON oi.Order_ID = pr.Order_ID AND oi.Product_ID = pr.Product_ID AND oi.SKU = pr.SKU
            WHERE oi.Order_ID = :orderId
        `;
        const itemsRes = await db.executeQuery(itemsSql, { orderId });

        return {
            ...oRes.rows[0],
            items: itemsRes.rows || []
        };
    },

    async createOrder({ userId, shippingAddress, paymentMethod, items }) {
        let conn;
        try {
            conn = await db.getConnection();
            let totalAmount = 0;
            items.forEach(it => {
                totalAmount += Number(it.unitPrice) * Number(it.quantity);
            });

            const oSql = `
                INSERT INTO ORDERS (Total_Amount, Status, Shipping_Address, User_ID)
                VALUES (:totalAmount, 'PENDING', :shippingAddress, :userId)
                RETURNING Order_ID INTO :newOrderId
            `;
            const oRes = await conn.execute(oSql, {
                totalAmount,
                shippingAddress,
                userId: Number(userId),
                newOrderId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            });
            const orderId = oRes.outBinds.newOrderId[0];

            for (const it of items) {
                await conn.execute(`
                    INSERT INTO ORDER_ITEMS (Order_ID, Product_ID, SKU, Quantity, Unit_Price)
                    VALUES (:orderId, :productId, :sku, :quantity, :unitPrice)
                `, {
                    orderId,
                    productId: Number(it.productId),
                    sku: it.sku,
                    quantity: Number(it.quantity),
                    unitPrice: Number(it.unitPrice)
                });
            }

            await conn.execute(`
                INSERT INTO PAYMENTS (Payment_Method, Amount, Status, Order_ID)
                VALUES (:paymentMethod, :amount, 'PAID', :orderId)
            `, {
                paymentMethod: paymentMethod || 'SHOPEEPAY',
                amount: totalAmount,
                orderId
            });

            const trackingNum = 'SPXVN' + Math.floor(1000000000 + Math.random() * 9000000000);
            await conn.execute(`
                INSERT INTO SHIPMENTS (Carrier_Name, Tracking_Number, Status, Order_ID)
                VALUES ('SPX Express', :trackingNum, 'READY_TO_SHIP', :orderId)
            `, {
                trackingNum,
                orderId
            });

            await conn.commit();
            return { success: true, orderId, trackingNum };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    async updateOrderStatus(orderId, status) {
        const sql = `UPDATE ORDERS SET Status = :status WHERE Order_ID = :orderId`;
        return await db.executeQuery(sql, { status, orderId });
    },

    async updateShipmentStatus(orderId, status) {
        const sql = `
            UPDATE SHIPMENTS 
            SET Status = :status, 
                Shipped_At = CASE WHEN :status = 'IN_TRANSIT' THEN SYSTIMESTAMP ELSE Shipped_At END
            WHERE Order_ID = :orderId
        `;
        return await db.executeQuery(sql, { status, orderId });
    },

    // Khách hàng hủy đơn hàng (Quy tắc: Chỉ được hủy khi chưa chuyển sang trạng thái Đang giao hàng / IN_TRANSIT)
    async customerCancelOrder(orderId, userId) {
        const checkSql = `
            SELECT o.Status AS Order_Status, s.Status AS Shipment_Status
            FROM ORDERS o
            LEFT JOIN SHIPMENTS s ON o.Order_ID = s.Order_ID
            WHERE o.Order_ID = :orderId AND o.User_ID = :userId
        `;
        const res = await db.executeQuery(checkSql, { orderId: Number(orderId), userId: Number(userId) });
        if (!res.rows || res.rows.length === 0) {
            throw new Error('Đơn hàng không tồn tại hoặc bạn không có quyền thao tác trên đơn hàng này!');
        }

        const { ORDER_STATUS, SHIPMENT_STATUS } = res.rows[0];

        if (ORDER_STATUS === 'CANCELLED') {
            throw new Error('Đơn hàng này đã được hủy trước đó!');
        }
        if (ORDER_STATUS === 'SHIPPED' || SHIPMENT_STATUS === 'IN_TRANSIT' || SHIPMENT_STATUS === 'DELIVERED') {
            throw new Error('Không thể hủy đơn hàng vì đơn đã được xuất kho hoặc đang trên đường giao hàng!');
        }

        // Cập nhật trạng thái đơn sang CANCELLED và trạng thái giao hàng sang CANCELLED
        await db.executeQuery(`UPDATE ORDERS SET Status = 'CANCELLED' WHERE Order_ID = :orderId`, { orderId: Number(orderId) });
        await db.executeQuery(`UPDATE SHIPMENTS SET Status = 'CANCELLED' WHERE Order_ID = :orderId`, { orderId: Number(orderId) });

        // Hoàn trả số lượng sản phẩm về lại kho hàng tồn kho
        await this.restoreInventoryForOrder(orderId);
        return true;
    },

    getBanners() {
        return [
            { id: 1, title: 'Siêu Sale Kho Shopee Logistics', subtitle: 'Giao nhanh 2h - Hàng chính hãng 100%', image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200', link: '/#productList' },
            { id: 2, title: 'Shopee Mall - Đảm Bảo Chất Lượng', subtitle: 'Miễn phí vận chuyển toàn quốc cho đơn từ 0Đ', image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200', link: '/#productList' },
            { id: 3, title: 'Black Friday Sale - Săn Deal Siêu Hot', subtitle: 'Giảm đến 50% hàng ngàn sản phẩm tiêu dùng', image: 'https://images.unsplash.com/photo-1553413077-190dd305871c?w=1200', link: '/#productList' }
        ];
    },

    // --- YÊU CẦU 3 & 4: YÊU THÍCH SẢN PHẨM ---
    async isProductFavorite(userId, productId) {
        if (!userId) return false;
        const sql = `SELECT 1 FROM PRODUCT_FAVORITES WHERE User_ID = :userId AND Product_ID = :productId`;
        const res = await db.executeQuery(sql, { userId, productId: Number(productId) });
        return (res.rows && res.rows.length > 0);
    },

    async countProductFavorites(productId) {
        const sql = `SELECT COUNT(*) AS CNT FROM PRODUCT_FAVORITES WHERE Product_ID = :productId`;
        const res = await db.executeQuery(sql, { productId: Number(productId) });
        return res.rows[0]?.CNT || 0;
    },

    async toggleFavorite(userId, productId) {
        if (!userId) throw new Error('Vui lòng đăng nhập để yêu thích sản phẩm');
        const isFav = await this.isProductFavorite(userId, productId);
        if (isFav) {
            await db.executeQuery(`DELETE FROM PRODUCT_FAVORITES WHERE User_ID = :userId AND Product_ID = :productId`, { userId, productId: Number(productId) });
            return { isFavorite: false, count: await this.countProductFavorites(productId) };
        } else {
            await db.executeQuery(`INSERT INTO PRODUCT_FAVORITES (User_ID, Product_ID) VALUES (:userId, :productId)`, { userId, productId: Number(productId) });
            return { isFavorite: true, count: await this.countProductFavorites(productId) };
        }
    },

    async getUserFavoriteProducts(userId) {
        if (!userId) return [];
        const sql = `
            SELECT p.Product_ID, p.Product_Name, c.Category_Name, s.Shop_Name,
                   NVL(MIN(pv.Price), 0) AS Min_Price,
                   NVL(MAX(pv.Image_URL), 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500') AS Main_Image,
                   NVL((SELECT SUM(Quantity) FROM INVENTORY WHERE Product_ID = p.Product_ID), 0) AS Total_Stock,
                   NVL((SELECT SUM(Quantity) FROM ORDER_ITEMS oi WHERE oi.Product_ID = p.Product_ID), 0) AS Sold_Count,
                   TO_CHAR(pf.Created_At, 'YYYY-MM-DD HH24:MI') AS Favorited_At
            FROM PRODUCT_FAVORITES pf
            JOIN PRODUCTS p ON pf.Product_ID = p.Product_ID
            JOIN CATEGORIES c ON p.Category_ID = c.Category_ID
            JOIN SELLS_PRODUCT sp ON p.Product_ID = sp.Product_ID
            JOIN SHOPS s ON sp.Shop_ID = s.Shop_ID
            LEFT JOIN PRODUCT_VARIANTS pv ON p.Product_ID = pv.Product_ID
            WHERE pf.User_ID = :userId
            GROUP BY p.Product_ID, p.Product_Name, c.Category_Name, s.Shop_Name, pf.Created_At
            ORDER BY pf.Created_At DESC
        `;
        const res = await db.executeQuery(sql, { userId });
        return res.rows || [];
    },

    // --- YÊU CẦU 5: TÌM KIẾM GỢI Ý THÔNG MINH LIVE SEARCH ---
    async searchProductsLive(keyword, limit = 8) {
        if (!keyword || !keyword.trim()) return [];
        const sql = `
            SELECT p.Product_ID, p.Product_Name, c.Category_Name, s.Shop_Name,
                   NVL(MIN(pv.Price), 0) AS Min_Price,
                   NVL(MAX(pv.Image_URL), 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=100') AS Image_URL,
                   NVL((SELECT SUM(Quantity) FROM INVENTORY WHERE Product_ID = p.Product_ID), 0) AS Total_Stock,
                   NVL((SELECT SUM(Quantity) FROM ORDER_ITEMS oi WHERE oi.Product_ID = p.Product_ID), 0) AS Sold_Count
            FROM PRODUCTS p
            JOIN CATEGORIES c ON p.Category_ID = c.Category_ID
            JOIN SELLS_PRODUCT sp ON p.Product_ID = sp.Product_ID
            JOIN SHOPS s ON sp.Shop_ID = s.Shop_ID
            LEFT JOIN PRODUCT_VARIANTS pv ON p.Product_ID = pv.Product_ID
            WHERE LOWER(p.Product_Name) LIKE LOWER(:kw)
            GROUP BY p.Product_ID, p.Product_Name, c.Category_Name, s.Shop_Name
            ORDER BY Total_Stock DESC, Sold_Count DESC, p.Product_ID DESC
            FETCH FIRST :lim ROWS ONLY
        `;
        const res = await db.executeQuery(sql, { kw: `%${keyword.trim()}%`, lim: limit });
        return res.rows || [];
    },

    async getShopVariants(shopId) {
        const sql = `
            SELECT p.Product_ID, p.Product_Name, pv.SKU, pv.Variant_Name, pv.Price
            FROM PRODUCTS p
            JOIN PRODUCT_VARIANTS pv ON p.Product_ID = pv.Product_ID
            JOIN SELLS_PRODUCT sp ON p.Product_ID = sp.Product_ID
            WHERE sp.Shop_ID = :shopId
            ORDER BY p.Product_ID DESC, pv.SKU ASC
        `;
        const res = await db.executeQuery(sql, { shopId: Number(shopId) });
        return res.rows || [];
    }
,

    // Tách riêng: Tạo Sản Phẩm (chỉ gồm Tên, Danh Mục, Shop)
    async createProductOnly({ productName, categoryId, shopId }) {
        let conn;
        try {
            conn = await db.getConnection();
            const pSql = `
                INSERT INTO PRODUCTS (Product_Name, Category_ID) 
                VALUES (:productName, :categoryId)
                RETURNING Product_ID INTO :newProdId
            `;
            const pResult = await conn.execute(pSql, {
                productName,
                categoryId: Number(categoryId),
                newProdId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
            });
            const newProdId = pResult.outBinds.newProdId[0];

            await conn.execute(`INSERT INTO SELLS_PRODUCT (Shop_ID, Product_ID) VALUES (:shopId, :productId)`, {
                shopId: Number(shopId),
                productId: newProdId
            });

            await conn.commit();
            return { success: true, productId: newProdId };
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

    // Tách riêng: Tạo Biến Thể SKU cho Sản phẩm đã có
    async createVariant({ productId, sku, variantName, price, imageUrl }) {
        const sql = `
            INSERT INTO PRODUCT_VARIANTS (Product_ID, SKU, Variant_Name, Price, Image_URL)
            VALUES (:productId, :sku, :variantName, :price, :imageUrl)
        `;
        return await db.executeQuery(sql, {
            productId: Number(productId),
            sku: sku.trim().toUpperCase(),
            variantName,
            price: Number(price),
            imageUrl: imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'
        });
    },

    // Lấy danh sách tất cả biến thể SKU (kèm thông tin sản phẩm, danh mục, shop, tồn kho)
    async getAllVariantsDetailed({ shopId = null } = {}) {
        let sql = `
            SELECT pv.Product_ID, pv.SKU, pv.Variant_Name, pv.Price, pv.Image_URL,
                   p.Product_Name, p.Status AS Product_Status,
                   c.Category_ID, c.Category_Name, c.Parent_Category_ID,
                   s.Shop_ID, s.Shop_Name,
                   NVL(SUM(i.Quantity), 0) AS Total_Stock
            FROM PRODUCT_VARIANTS pv
            JOIN PRODUCTS p ON pv.Product_ID = p.Product_ID
            JOIN CATEGORIES c ON p.Category_ID = c.Category_ID
            LEFT JOIN SELLS_PRODUCT sp ON p.Product_ID = sp.Product_ID
            LEFT JOIN SHOPS s ON sp.Shop_ID = s.Shop_ID
            LEFT JOIN INVENTORY i ON pv.Product_ID = i.Product_ID AND pv.SKU = i.SKU
            WHERE 1=1
        `;
        const params = {};
        if (shopId) {
            sql += ` AND s.Shop_ID = :shopId`;
            params.shopId = Number(shopId);
        }
        sql += `
            GROUP BY pv.Product_ID, pv.SKU, pv.Variant_Name, pv.Price, pv.Image_URL,
                     p.Product_Name, p.Status, c.Category_ID, c.Category_Name, c.Parent_Category_ID,
                     s.Shop_ID, s.Shop_Name
            ORDER BY pv.Product_ID DESC, pv.SKU ASC
        `;
        const res = await db.executeQuery(sql, params);
        return res.rows || [];
    },

    // Cập nhật thông tin biến thể SKU
    async updateVariant({ productId, sku, variantName, price, imageUrl }) {
        const sql = `
            UPDATE PRODUCT_VARIANTS
            SET Variant_Name = :variantName,
                Price = :price,
                Image_URL = :imageUrl
            WHERE Product_ID = :productId AND SKU = :sku
        `;
        return await db.executeQuery(sql, {
            productId: Number(productId),
            sku: sku.trim().toUpperCase(),
            variantName,
            price: Number(price),
            imageUrl: imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500'
        });
    },

    // Xóa biến thể SKU (kiểm tra ràng buộc đơn hàng)
    async deleteVariant({ productId, sku }) {
        // Kiểm tra xem biến thể có trong đơn hàng nào không
        const checkSql = `
            SELECT COUNT(*) AS CNT FROM ORDER_ITEMS 
            WHERE Product_ID = :productId AND SKU = :sku
        `;
        const checkRes = await db.executeQuery(checkSql, {
            productId: Number(productId),
            sku: sku.trim().toUpperCase()
        });
        if (checkRes.rows && checkRes.rows[0].CNT > 0) {
            throw new Error(`Không thể xóa biến thể [${sku}] vì đã phát sinh trong đơn hàng của khách hàng!`);
        }

        // Kiểm tra xem biến thể có tồn kho không
        const checkInv = `
            SELECT NVL(SUM(Quantity), 0) AS TOTAL_QTY FROM INVENTORY 
            WHERE Product_ID = :productId AND SKU = :sku
        `;
        const invRes = await db.executeQuery(checkInv, {
            productId: Number(productId),
            sku: sku.trim().toUpperCase()
        });
        if (invRes.rows && invRes.rows[0].TOTAL_QTY > 0) {
            throw new Error(`Không thể xóa biến thể [${sku}] vì đang có ${invRes.rows[0].TOTAL_QTY} sản phẩm trong kho! Hãy xuất kho hoặc điều chỉnh trước.`);
        }

        const sql = `
            DELETE FROM PRODUCT_VARIANTS 
            WHERE Product_ID = :productId AND SKU = :sku
        `;
        return await db.executeQuery(sql, {
            productId: Number(productId),
            sku: sku.trim().toUpperCase()
        });
    },

    // Cập nhật thông tin sản phẩm
    async updateProduct(productId, { productName, categoryId, status }) {
        const sql = `
            UPDATE PRODUCTS
            SET Product_Name = :productName,
                Category_ID = :categoryId,
                Status = :status
            WHERE Product_ID = :productId
        `;
        return await db.executeQuery(sql, {
            productId: Number(productId),
            productName: productName.trim(),
            categoryId: Number(categoryId),
            status: status || 'ACTIVE'
        });
    },

    // Xóa sản phẩm với kiểm tra ràng buộc toàn vẹn dữ liệu
    async deleteProduct(productId) {
        const prodId = Number(productId);

        // 1. Kiểm tra đơn hàng liên quan (ORDER_ITEMS)
        const checkOrderSql = `SELECT COUNT(*) AS CNT FROM ORDER_ITEMS WHERE Product_ID = :prodId`;
        const orderRes = await db.executeQuery(checkOrderSql, { prodId });
        if (orderRes.rows && orderRes.rows[0].CNT > 0) {
            throw new Error(`Không thể xóa sản phẩm này vì đã phát sinh trong ${orderRes.rows[0].CNT} đơn hàng của khách hàng! Để ngừng bán, bạn vui lòng chuyển trạng thái sản phẩm sang INACTIVE.`);
        }

        // 2. Kiểm tra hàng tồn kho (INVENTORY)
        const checkInvSql = `SELECT NVL(SUM(Quantity), 0) AS TOTAL_QTY FROM INVENTORY WHERE Product_ID = :prodId`;
        const invRes = await db.executeQuery(checkInvSql, { prodId });
        if (invRes.rows && invRes.rows[0].TOTAL_QTY > 0) {
            throw new Error(`Không thể xóa sản phẩm này vì đang có ${invRes.rows[0].TOTAL_QTY} sản phẩm trong kho! Hãy xuất kho hoặc điều chuyển tồn kho trước.`);
        }

        // 3. Kiểm tra phiếu nhập kho (INBOUND_RECEIPT_ITEMS)
        const checkReceiptSql = `SELECT COUNT(*) AS CNT FROM INBOUND_RECEIPT_ITEMS WHERE Product_ID = :prodId`;
        const recRes = await db.executeQuery(checkReceiptSql, { prodId });
        if (recRes.rows && recRes.rows[0].CNT > 0) {
            throw new Error(`Không thể xóa sản phẩm này vì đang lưu vết trong ${recRes.rows[0].CNT} phiếu nhập kho!`);
        }

        // 4. Dọn dẹp các bảng phụ thuộc không ảnh hưởng lịch sử
        // Xóa đánh giá (PRODUCT_REVIEWS)
        await db.executeQuery(`DELETE FROM PRODUCT_REVIEWS WHERE Product_ID = :prodId`, { prodId });

        // Xóa yêu thích (PRODUCT_FAVORITES)
        await db.executeQuery(`DELETE FROM PRODUCT_FAVORITES WHERE Product_ID = :prodId`, { prodId });

        // Xóa các biến thể SKU (PRODUCT_VARIANTS)
        await db.executeQuery(`DELETE FROM PRODUCT_VARIANTS WHERE Product_ID = :prodId`, { prodId });

        // Xóa liên kết shop (SELLS_PRODUCT)
        await db.executeQuery(`DELETE FROM SELLS_PRODUCT WHERE Product_ID = :prodId`, { prodId });

        // 5. Xóa sản phẩm trong PRODUCTS
        return await db.executeQuery(`DELETE FROM PRODUCTS WHERE Product_ID = :prodId`, { prodId });
    },

    // Cập nhật thông tin hàng tồn kho (Số lượng tồn, Tồn tối thiểu, Hạn dùng)
    async updateInventoryItem({ warehouseId, aisle, rack, shelf, bin, productId, sku, batchNumber, quantity, minStockLevel, expiryDate }) {
        // 1. Cập nhật số lượng và tồn tối thiểu trên INVENTORY (sẽ kích hoạt trigger trg_audit_inventory nếu đổi Quantity)
        const updateInvSql = `
            UPDATE INVENTORY
            SET Quantity = :quantity,
                Min_Stock_Level = :minStockLevel,
                Last_Updated = SYSTIMESTAMP
            WHERE Warehouse_ID = :warehouseId
              AND Aisle = :aisle AND Rack = :rack AND Shelf = :shelf AND Bin = :bin
              AND Product_ID = :productId AND SKU = :sku AND Batch_Number = :batchNumber
        `;
        await db.executeQuery(updateInvSql, {
            warehouseId: Number(warehouseId),
            aisle: aisle.trim().toUpperCase(),
            rack: rack.trim().toUpperCase(),
            shelf: shelf.trim().toUpperCase(),
            bin: bin.trim().toUpperCase(),
            productId: Number(productId),
            sku: sku.trim().toUpperCase(),
            batchNumber: batchNumber.trim(),
            quantity: Number(quantity),
            minStockLevel: Number(minStockLevel)
        });

        // 2. Nếu có cập nhật Hạn dùng (Expiry Date) thì cập nhật bảng lô INBOUND_RECEIPT_ITEMS tương ứng
        if (expiryDate) {
            const updateBatchSql = `
                UPDATE INBOUND_RECEIPT_ITEMS
                SET Expiry_Date = TO_DATE(:expiryDate, 'YYYY-MM-DD')
                WHERE Product_ID = :productId AND SKU = :sku AND Batch_Number = :batchNumber
            `;
            await db.executeQuery(updateBatchSql, {
                expiryDate: expiryDate.trim(),
                productId: Number(productId),
                sku: sku.trim().toUpperCase(),
                batchNumber: batchNumber.trim()
            });
        }
        return true;
    },

    // ==========================================
    // QUẢN LÝ ĐƠN HÀNG: CẬP NHẬT & XÓA ĐƠN HÀNG
    // ==========================================
    // Cập nhật thông tin đơn hàng (Shipping Address, Status, Shipment Carrier, Tracking, Status)
    async updateOrderInfo({ orderId, shippingAddress, status, carrierName, trackingNumber, shipmentStatus }) {
        const oId = Number(orderId);

        // Nếu trạng thái đơn đổi sang CANCELLED thì hoàn trả tồn kho nếu đơn đã từng xuất kho hoặc giữ hàng
        if (status === 'CANCELLED') {
            await this.restoreInventoryForOrder(oId);
        }

        // 1. Cập nhật thông tin trong ORDERS
        let updateOrderSql = `
            UPDATE ORDERS
            SET Shipping_Address = :shippingAddress,
                Status = :status
            WHERE Order_ID = :orderId
        `;
        await db.executeQuery(updateOrderSql, {
            orderId: oId,
            shippingAddress: shippingAddress ? shippingAddress.trim() : '',
            status: status ? status.trim() : 'COMPLETED'
        });

        // 2. Cập nhật thông tin trong SHIPMENTS
        let updateShipmentSql = `
            UPDATE SHIPMENTS
            SET Carrier_Name = :carrierName,
                Tracking_Number = :trackingNumber,
                Status = :shipmentStatus
            WHERE Order_ID = :orderId
        `;
        await db.executeQuery(updateShipmentSql, {
            orderId: oId,
            carrierName: carrierName ? carrierName.trim() : 'SPX Express',
            trackingNumber: trackingNumber ? trackingNumber.trim() : '',
            shipmentStatus: shipmentStatus ? shipmentStatus.trim() : 'DELIVERED'
        });

        return true;
    },

    // Hàm tiện ích: Hoàn trả số lượng hàng về kho khi Đơn hàng bị HỦY hoặc XÓA
    async restoreInventoryForOrder(orderId, connection = null) {
        const oId = Number(orderId);
        const shouldClose = !connection;
        const conn = connection || await db.getConnection();

        try {
            // Lấy danh sách sản phẩm và số lượng trong đơn hàng
            const itemsRes = await conn.execute(
                `SELECT Product_ID, SKU, Quantity FROM ORDER_ITEMS WHERE Order_ID = :oId`,
                { oId }
            );
            const items = itemsRes.rows || [];

            for (const item of items) {
                const prodId = item.PRODUCT_ID;
                const sku = item.SKU;
                let qtyToReturn = Number(item.QUANTITY || 0);

                if (qtyToReturn <= 0) continue;

                // 1. Ưu tiên tìm chính xác mã lô (Batch_Number) đã bị trừ gần nhất cho SKU này trong INVENTORY_AUDIT_LOG
                // (Vì khi chạy procedure FEFO, trigger trg_audit_inventory ghi lại chính xác lô hàng nào bị giảm số lượng: Old_Quantity > New_Quantity)
                const logRes = await conn.execute(
                    `SELECT Batch_Number, (Old_Quantity - New_Quantity) AS Deducted_Qty
                     FROM INVENTORY_AUDIT_LOG
                     WHERE SKU = :sku AND Old_Quantity > New_Quantity
                     ORDER BY Log_ID DESC FETCH FIRST 5 ROWS ONLY`,
                    { sku }
                );

                let targetBatchNumber = null;
                if (logRes.rows && logRes.rows.length > 0) {
                    // Tìm lô gần nhất có lượng trừ tương ứng hoặc lô gần nhất
                    targetBatchNumber = logRes.rows[0].BATCH_NUMBER;
                }

                // 2. Tìm vị trí kệ và lô hàng trong INVENTORY để hoàn trả:
                // Nếu tìm được targetBatchNumber thì hoàn đúng vào lô đó.
                // Nếu không, hoàn theo nguyên tắc FEFO ngược (hạn dùng gần nhất trước: ORDER BY ri.Expiry_Date ASC)
                let invSql = `
                    SELECT i.Warehouse_ID, i.Aisle, i.Rack, i.Shelf, i.Bin, i.Batch_Number, i.Receipt_ID, i.Quantity
                    FROM INVENTORY i
                    LEFT JOIN INBOUND_RECEIPT_ITEMS ri 
                      ON i.Receipt_ID = ri.Receipt_ID AND i.Product_ID = ri.Product_ID 
                     AND i.SKU = ri.SKU AND i.Batch_Number = ri.Batch_Number
                    WHERE i.Product_ID = :prodId AND i.SKU = :sku
                `;
                const invParams = { prodId, sku };

                if (targetBatchNumber) {
                    invSql += ` AND i.Batch_Number = :targetBatchNumber`;
                    invParams.targetBatchNumber = targetBatchNumber;
                } else {
                    invSql += ` ORDER BY ri.Expiry_Date ASC NULLS LAST`;
                }
                invSql += ` FETCH FIRST 1 ROWS ONLY`;

                let invRes = await conn.execute(invSql, invParams);

                // Nếu không tìm thấy lô theo targetBatchNumber (ví dụ đã bị xóa), tìm theo FEFO
                if ((!invRes.rows || invRes.rows.length === 0) && targetBatchNumber) {
                    invRes = await conn.execute(
                        `SELECT i.Warehouse_ID, i.Aisle, i.Rack, i.Shelf, i.Bin, i.Batch_Number, i.Receipt_ID, i.Quantity
                         FROM INVENTORY i
                         LEFT JOIN INBOUND_RECEIPT_ITEMS ri 
                           ON i.Receipt_ID = ri.Receipt_ID AND i.Product_ID = ri.Product_ID 
                          AND i.SKU = ri.SKU AND i.Batch_Number = ri.Batch_Number
                         WHERE i.Product_ID = :prodId AND i.SKU = :sku
                         ORDER BY ri.Expiry_Date ASC NULLS LAST FETCH FIRST 1 ROWS ONLY`,
                        { prodId, sku }
                    );
                }

                if (invRes.rows && invRes.rows.length > 0) {
                    const row = invRes.rows[0];
                    // Cộng lại số lượng vào đúng lô hàng này (Trigger trg_audit_inventory sẽ ghi nhật ký cộng lại số lượng)
                    await conn.execute(
                        `UPDATE INVENTORY
                         SET Quantity = Quantity + :qtyToReturn,
                             Last_Updated = SYSTIMESTAMP
                         WHERE Warehouse_ID = :whId AND Aisle = :aisle AND Rack = :rack 
                           AND Shelf = :shelf AND Bin = :bin AND Product_ID = :prodId 
                           AND SKU = :sku AND Batch_Number = :batchNumber`,
                        {
                            qtyToReturn,
                            whId: row.WAREHOUSE_ID,
                            aisle: row.AISLE,
                            rack: row.RACK,
                            shelf: row.SHELF,
                            bin: row.BIN,
                            prodId,
                            sku,
                            batchNumber: row.BATCH_NUMBER
                        }
                    );
                } else {
                    // Nếu chưa có trong INVENTORY, tìm lô tương ứng trong INBOUND_RECEIPT_ITEMS để hoàn vào vị trí mặc định
                    const batchRes = await conn.execute(
                        `SELECT r.Receipt_ID, r.Batch_Number, ir.Warehouse_ID
                         FROM INBOUND_RECEIPT_ITEMS r
                         JOIN INBOUND_RECEIPTS ir ON r.Receipt_ID = ir.Receipt_ID
                         WHERE r.Product_ID = :prodId AND r.SKU = :sku
                         ORDER BY r.Expiry_Date ASC NULLS LAST FETCH FIRST 1 ROWS ONLY`,
                        { prodId, sku }
                    );

                    const batch = (batchRes.rows && batchRes.rows[0]) ? batchRes.rows[0] : null;
                    const whId = batch ? batch.WAREHOUSE_ID : 1;
                    const batchNum = batch ? batch.BATCH_NUMBER : 'BATCH-RESTORE';
                    const recId = batch ? batch.RECEIPT_ID : 1;

                    await conn.execute(
                        `MERGE INTO INVENTORY dest
                         USING (SELECT :whId AS Warehouse_ID, 'A' AS Aisle, '01' AS Rack, '01' AS Shelf, '01' AS Bin,
                                       :prodId AS Product_ID, :sku AS SKU, :batchNum AS Batch_Number, :recId AS Receipt_ID,
                                       :qtyToReturn AS Quantity FROM dual) src
                         ON (dest.Warehouse_ID = src.Warehouse_ID AND dest.Aisle = src.Aisle AND dest.Rack = src.Rack
                             AND dest.Shelf = src.Shelf AND dest.Bin = src.Bin AND dest.Product_ID = src.Product_ID
                             AND dest.SKU = src.SKU AND dest.Batch_Number = src.Batch_Number)
                         WHEN MATCHED THEN
                             UPDATE SET dest.Quantity = dest.Quantity + src.Quantity, dest.Last_Updated = SYSTIMESTAMP
                         WHEN NOT MATCHED THEN
                             INSERT (Warehouse_ID, Aisle, Rack, Shelf, Bin, Product_ID, SKU, Batch_Number, Receipt_ID, Quantity, Min_Stock_Level, Last_Updated)
                             VALUES (src.Warehouse_ID, src.Aisle, src.Rack, src.Shelf, src.Bin, src.Product_ID, src.SKU, src.Batch_Number, src.Receipt_ID, src.Quantity, 10, SYSTIMESTAMP)`,
                        { whId, prodId, sku, batchNum, recId, qtyToReturn }
                    );
                }
            }

            if (shouldClose) {
                await conn.commit();
            }
            return true;
        } catch (err) {
            if (shouldClose && conn) await conn.rollback();
            throw err;
        } finally {
            if (shouldClose && conn) await conn.close();
        }
    },

    async deleteOrder(orderId) {
        const oId = Number(orderId);
        let conn;
        try {
            conn = await db.getConnection();
            
            // 0. HOÀN TRẢ HÀNG TỒN KHO TRƯỚC KHI XÓA ĐƠN HÀNG
            await this.restoreInventoryForOrder(oId, conn);

            // Xóa theo đúng thứ tự ràng buộc khóa ngoại (Foreign Key)
            // 1. Xóa đánh giá liên quan
            await conn.execute(`DELETE FROM PRODUCT_REVIEWS WHERE Order_ID = :oId`, { oId });

            // 2. Xóa thanh toán liên quan
            await conn.execute(`DELETE FROM PAYMENTS WHERE Order_ID = :oId`, { oId });

            // 3. Xóa vận chuyển liên quan
            await conn.execute(`DELETE FROM SHIPMENTS WHERE Order_ID = :oId`, { oId });

            // 4. Xóa chi tiết đơn hàng
            await conn.execute(`DELETE FROM ORDER_ITEMS WHERE Order_ID = :oId`, { oId });

            // 5. Xóa đơn hàng chính
            await conn.execute(`DELETE FROM ORDERS WHERE Order_ID = :oId`, { oId });

            await conn.commit();
            return true;
        } catch (err) {
            if (conn) await conn.rollback();
            throw err;
        } finally {
            if (conn) await conn.close();
        }
    },

};

module.exports = LogisticsModel;
