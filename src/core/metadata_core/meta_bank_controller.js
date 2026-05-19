import axios from "axios";
import bcrypt from "bcrypt";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { broadcastNotification } from "../../../client_socket_server.js";
import meta_core_controller from "./meta_core_controller.js";

const handleSePayWebhookProduct = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const data = req.body;
    const paymentContent = data.content;
    const transferAmount = parseFloat(data.transferAmount);
    const sepayId = data.id;

    console.log(
      `[SePay Webhook] Nội dung: ${paymentContent} | Số tiền: ${transferAmount}`,
    );

    const match = paymentContent.match(/(ORDERPIN|SHIPPIN)\d+/);
    const targetCode = match ? match[0] : paymentContent;

    const session = await db.payment_sessions.findOne({
      where: { payment_code: targetCode },
      transaction: t,
    });

    if (!session) {
      console.warn(`Không tìm thấy giao dịch nào khớp với mã: ${targetCode}`);
      await t.rollback();
      return res.status(200).send("No matching transaction");
    }

    if (
      session.status === "paid" &&
      parseFloat(session.amount_actual || 0) >=
        parseFloat(session.amount_expected)
    ) {
      await t.rollback();
      return res.status(200).send("Transaction already processed");
    }

    const newActualAmount =
      parseFloat(session.amount_actual || 0) + transferAmount;
    const totalExpectedSession = parseFloat(session.amount_expected || 0);

    await session.update(
      {
        amount_actual: newActualAmount,
        sepay_transaction_id: sepayId,
        status:
          newActualAmount >= totalExpectedSession ? "paid" : "partially_paid",
        updated_at: new Date(),
      },
      { transaction: t },
    );

    if (session.order_id) {
      const pinnedOrder = await db.Pinned_Products.findByPk(session.order_id, {
        transaction: t,
      });

      if (pinnedOrder) {
        const newTotalReceived =
          parseFloat(pinnedOrder.amount_received || 0) + transferAmount;
        const batches = await db.product_batch.findAll({
          where: { Order_owner: session.order_id },
          order: [["createdAt", "ASC"]],
          transaction: t,
        });

        let remainingMoney = newTotalReceived;
        let paidBatchesCount = 0;
        let partiallyPaidBatchesCount = 0;
        const affectedShippingOrderIds = new Set();

        // THUẬT TOÁN THÁC NƯỚC: Rót tiền cho từng Lô hàng
        for (const batch of batches) {
          const batchPrice = parseFloat(batch.total_price || 0);
          let batchStatus = "unpaid"; // Mặc định là chưa trả

          if (remainingMoney >= batchPrice && batchPrice > 0) {
            batchStatus = "paid"; // Đủ tiền trả cho kiện này
            remainingMoney -= batchPrice;
            paidBatchesCount++;
          } else if (remainingMoney > 0) {
            batchStatus = "partially_paid"; // Trả được một nửa kiện này thì hết tiền
            remainingMoney = 0;
            partiallyPaidBatchesCount++;
          }

          if (batch.payment_status !== batchStatus) {
            await batch.update(
              { payment_status: batchStatus },
              { transaction: t },
            );
          }

          if (batch.shipping_order_id) {
            affectedShippingOrderIds.add(batch.shipping_order_id);
          }
        }

        let newPinnerPaymentStatus = "pending";
        if (batches.length > 0) {
          if (paidBatchesCount === batches.length) {
            newPinnerPaymentStatus = "complated";
          } else if (paidBatchesCount > 0 || partiallyPaidBatchesCount > 0) {
            newPinnerPaymentStatus = "partially_paid";
          }
        }

        await pinnedOrder.update(
          {
            amount_received: newTotalReceived,
            amount_remaining: Math.max(
              0,
              parseFloat(pinnedOrder.total_price) - newTotalReceived,
            ),
            debt: Math.max(
              0,
              parseFloat(pinnedOrder.total_price) - newTotalReceived,
            ),
            payment_status: newPinnerPaymentStatus,
            status:
              newPinnerPaymentStatus === "complated"
                ? "active"
                : pinnedOrder.status,
          },
          { transaction: t },
        );

        for (const shipId of affectedShippingOrderIds) {
          const shipBatches = await db.product_batch.findAll({
            where: { shipping_order_id: shipId },
            transaction: t,
          });

          if (shipBatches.length > 0) {
            // Đếm xem trên chuyến xe này có bao nhiêu kiện đã paid
            const shipPaidCount = shipBatches.filter(
              (b) => b.payment_status === "paid",
            ).length;
            const shipPartialCount = shipBatches.filter(
              (b) => b.payment_status === "partially_paid",
            ).length;

            let shipPaymentStatus = "pending";
            if (shipPaidCount === shipBatches.length) {
              shipPaymentStatus = "complated"; // Nếu 100% kiện trên xe này đã trả xong -> Xe này complated!
            } else if (shipPaidCount > 0 || shipPartialCount > 0) {
              shipPaymentStatus = "partially_paid";
            }

            await db.shipping_order.update(
              { payment_status: shipPaymentStatus },
              { where: { id: shipId }, transaction: t },
            );

            if (shipPaymentStatus === "complated") {
              const shipOrder = await db.shipping_order.findByPk(shipId, {
                transaction: t,
              });
              if (shipOrder) {
                await db.Notification.create(
                  {
                    Owner_id: shipOrder.shipping_partner,
                    message: `Đơn vận ${shipId} đã được thanh toán tiền hàng đầy đủ!`,
                    noitfi_level: "4",
                  },
                  { transaction: t },
                );
              }
            }
          }
        }
      }
    }

    await db.tb_transactions.create(data, { transaction: t });

    await t.commit();
    console.log(`[SePay Webhook] Đối soát thành công mã: ${targetCode}`);

    return res.status(200).json({ success: true, RM: "Thanh toán thành công" });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Lỗi Webhook SePay:", error);
    return res.status(500).json({ RM: "Lỗi xử lý Webhook", RC: 500 });
  }
};

const handleSePayWebhookShip = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const data = req.body;
    const paymentContent = data.content || "";
    const transferAmount = parseFloat(data.transferAmount || 0);
    const sepayId = data.id;

    const match = paymentContent.match(/SHIPPIN\d+/);
    const targetCode = match ? match[0] : paymentContent;

    const session = await db.payment_sessions.findOne({
      where: { payment_code: targetCode },
      include: [{ model: db.shipping_order, as: "ship_pay" }],
      transaction: t,
    });

    if (!session) {
      await t.rollback();
      console.warn(`[WEBHOOK] Không tìm thấy session cho mã: ${targetCode}`);
      return res.status(200).send("No matching transaction");
    }

    if (
      session.status === "paid" &&
      parseFloat(session.amount_actual) >= parseFloat(session.amount_expected)
    ) {
      await t.rollback();
      return res.status(200).send("Already processed");
    }

    const newActualAmount =
      parseFloat(session.amount_actual || 0) + transferAmount;

    await session.update(
      {
        amount_actual: newActualAmount,
        sepay_transaction_id: sepayId,
        status:
          newActualAmount >= parseFloat(session.amount_expected)
            ? "paid"
            : "partially_paid",
        updated_at: new Date(),
      },
      { transaction: t },
    );

    if (session.ship_pay) {
      const shipOrder = session.ship_pay;
      const method = shipOrder.payment_method;
      const totalExpected = parseFloat(session.amount_expected);
      const totalReceived = newActualAmount;

      let newPaymentStatus = "partially_paid";
      let sender_confirm = "pending";
      let debt = totalExpected - totalReceived;

      if (method === "deposit") {
        const percent = shipOrder.deposit_ship_percent || 0;
        const requiredDeposit = (totalExpected * percent) / 100;

        if (totalReceived >= totalExpected) {
          newPaymentStatus = "complated";
          sender_confirm = "confirmed";
        } else if (totalReceived >= requiredDeposit) {
          newPaymentStatus = "deposit";
          sender_confirm = "confirmed";
        }
      } else if (method === "prepaid") {
        if (totalReceived >= totalExpected) {
          newPaymentStatus = "complated";
          sender_confirm = "confirmed";
        }
      }

      await shipOrder.update(
        {
          amount_ship_received: totalReceived,
          sender_confirm: sender_confirm,
          shipping_payment_status: newPaymentStatus,
          debt: debt > 0 ? debt : 0,
        },
        { transaction: t },
      );

      if (newPaymentStatus === "complated" || newPaymentStatus === "deposit") {
        await db.Notification.create(
          {
            Owner_id: shipOrder.shipping_partner,
            message: `Đơn vận ${shipOrder.id} đã ${newPaymentStatus === "complated" ? "thanh toán đủ" : "đặt cọc"} ${transferAmount.toLocaleString()}đ!`,
            noitfi_level: "4",
            linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${shipOrder.id}&openModal=false`,
          },
          { transaction: t },
        );

        await db.Notification.create(
          {
            Owner_id: shipOrder.customer_id,
            message: `Đơn vận mới ${shipOrder.id} đã sẵn sàng xử lý.`,
            linkToAction: `/Products/order/warehouse/management/order_trackking?highline=${shipOrder.id}&openModal=false`,
            noitfi_level: "4",
          },
          { transaction: t },
        );
      }
    }

    await db.tb_transactions.create(data, { transaction: t });

    await t.commit();

    if (session.ship_pay && session.ship_pay.payment_status === "complated") {
      broadcastNotification(
        null,
        session.ship_pay.shipping_partner,
        `Đơn vận ${session.ship_pay.id} thanh toán thành công!`,
        `/Products/order/warehouse/management/order_trackking?highline=${session.ship_pay.id}`,
        "complete_payment",
        "unread",
        "level_4",
        [],
        true,
      );
    }

    return res.status(200).json({ success: true, RM: "Thanh toán thành công" });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! [WEBHOOK ERROR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống", RC: 500 });
  }
};

const handleSePayWebhookWallet = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const data = req.body;

    if (data.transferType !== "in") {
      await t.rollback();
      return res
        .status(200)
        .json({ success: true, RM: "Bỏ qua giao dịch tiền ra" });
    }

    const paymentContent = data.content || "";
    const transferAmount = parseFloat(data.transferAmount || 0);
    const sepayId = data.id;

    const SYSTEM_BANK = process.env.ADMIN_BANKPIN || "BIDV";
    const SYSTEM_ACC = process.env.ADMIN_ACCOUTSERI || "96247R3CT5";

    const receiverBank = data.gateway || "";
    const receiverAccount = data.subAccount || data.accountNumber || "";

    const isCorrectBank = receiverBank
      .toUpperCase()
      .includes(SYSTEM_BANK.toUpperCase());
    const isCorrectAccount = receiverAccount.includes(SYSTEM_ACC);

    if (!isCorrectBank || !isCorrectAccount) {
      await t.rollback();
      console.warn(
        `[WEBHOOK WARN] Tiền chạy vào sai tài khoản hệ thống (Thực nhận: ${receiverBank}-${receiverAccount} | Đích cần đến: ${SYSTEM_BANK}-${SYSTEM_ACC})`,
      );
      return res.status(200).json({
        success: true,
        RM: "Giao dịch không thuộc tài khoản Master của hệ thống",
      });
    }

    const match = paymentContent.match(/ACTWL[A-Z0-9]+/i);
    const targetCode = match
      ? match[0].toUpperCase()
      : paymentContent.toUpperCase();

    const session = await db.payment_sessions.findOne({
      where: { payment_code: targetCode, type: "verify" },
      transaction: t,
    });

    if (!session) {
      await t.rollback();
      console.warn(`[WEBHOOK] Không tìm thấy session cho mã: ${targetCode}`);
      return res.status(200).send("No matching transaction");
    }

    if (session.status === "paid") {
      await t.rollback();
      console.log(`[WEBHOOK] Giao dịch ${targetCode} đã được xử lý trước đó.`);
      return res
        .status(200)
        .json({ success: true, RM: "Giao dịch đã được xử lý" });
    }

    if (transferAmount < parseFloat(session.amount_expected)) {
      await t.rollback();
      console.warn(
        `[WEBHOOK WARN] Chuyển thiếu tiền định danh (Thực nhận: ${transferAmount} | Cần: ${session.amount_expected})`,
      );
      return res
        .status(200)
        .json({ success: true, RM: "Số tiền xác thực không đủ mức yêu cầu" });
    }

    await session.update(
      {
        status: "paid",
        amount_actual: transferAmount,
        sepay_transaction_id: sepayId,
        chain_status: "active",
        updated_at: new Date(),
      },
      { transaction: t },
    );

    let senderName = "CHƯA CẬP NHẬT";
    if (data.description) {
      const descMatch =
        data.description.match(/(.*?) chuyen tien/i) ||
        data.description.match(/(.*?) transfer/i);
      if (descMatch && descMatch[1]) {
        senderName = descMatch[1].trim().toUpperCase();
      } else {
        senderName = data.description.substring(0, 50).toUpperCase();
      }
    }

    let wallet = await db.Company_Wallets.findOne({
      where: { company_id: session.payer_id },
      transaction: t,
    });

    if (wallet) {
      await wallet.update(
        {
          balance: parseFloat(wallet.balance) + transferAmount,
          status: "active",
          is_verified: true,
          account_name: wallet.account_name || senderName,
        },
        { transaction: t },
      );
    } else {
      await db.Company_Wallets.create(
        {
          company_id: session.payer_id,
          bank_code: "CHƯA RÕ",
          account_number: data.referenceCode || `REF-${sepayId}`,
          account_name: senderName,
          balance: transferAmount,
          status: "active",
          is_verified: true,
        },
        { transaction: t },
      );
    }

    await t.commit();
    console.log(
      `[WEBHOOK SUCCESS] Đã xác thực & duyệt ví thành công cho ID Công ty: ${session.payer_id} - Số tiền: ${transferAmount}`,
    );

    return res
      .status(200)
      .json({ success: true, RM: "Xác thực ví thành công!" });
  } catch (error) {
    if (t) await t.rollback();
    console.error("!!! [WEBHOOK ERROR]:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống", RC: 500 });
  }
};

const handleSePayWebhook = (db) => async (req, res) => {
  const data = req.body;
  const paymentContent = data.content || "";

  console.log(`[SePay Webhook] Nội dung: ${paymentContent}`);

  if (paymentContent.toUpperCase().includes("SHIPPIN")) {
    return await handleSePayWebhookShip(db)(req, res);
  }

  if (paymentContent.toUpperCase().includes("ORDERPIN")) {
    return await handleSePayWebhookProduct(db)(req, res);
  }

  if (paymentContent.toUpperCase().includes("ACTWL")) {
    return await handleSePayWebhookWallet(db)(req, res);
  }

  return res.status(200).send("No matching logic found");
};

const getPeymentStatus = (db) => async (req, res) => {
  try {
    const { company_id, id } = req?.user;
    const { payment_code } = req?.params;

    if (!payment_code || !company_id || !id) {
      return res.status(400).json({ RM: "Thiếu thông tin định danh!" });
    }

    const status = await db.payment_sessions.findOne({
      where: {
        payment_code: payment_code,
        payer_id: company_id,
      },
    });

    if (!status) {
      return res.status(400).json({ RC: 400, RM: "Không tìm thấy giao dịch" });
    }

    return res
      .status(200)
      .json({ RM: "thông tin giao dịch", RC: 200, RD: status });
  } catch (error) {
    console.error("Lỗi lấy trạng thái giao dịch:", error);
    return res.status(500).json({ RM: "Lỗi xử lý Webhook" });
  }
};

const genQrforverifywallet = (db) => async (req, res) => {
  try {
    const { company_id, id } = req?.user || {};
    const { bank_bin, account_number, account_name } = req?.body || {};

    if (!company_id || !bank_bin || !account_number || !account_name) {
      return res.status(400).json({
        RC: -203,
        RM: "Thiếu thông tin cấu hình tài khoản ví doanh nghiệp!",
      });
    }

    const company_wallet = await db.Company_Wallets.findOne({
      where: { company_id },
    });

    if (company_wallet) {
      if (company_wallet.wallet_kyc) {
        try {
          const oldKycPath = path.join(
            process.cwd(),
            "src",
            "Access",
            "company_wallet_kyc",
            company_wallet.wallet_kyc,
          );
          if (fs.existsSync(oldKycPath)) {
            fs.unlinkSync(oldKycPath);
            console.log(
              `>>> [OVERWRITE CLEANUP]: Đã xóa file kyc cũ thành công: ${company_wallet.wallet_kyc}`,
            );
          }
        } catch (cleanupError) {
          console.error(
            ">>> [OVERWRITE CLEANUP WARN]: Không thể xóa file kyc cũ:",
            cleanupError.message,
          );
        }
      }

      if (company_wallet.QR_pay) {
        try {
          const qrFileName = path.basename(company_wallet.QR_pay);
          const oldQrPath = path.join(
            process.cwd(),
            "src",
            "Access",
            "company_qr_upload",
            qrFileName,
          );
          if (fs.existsSync(oldQrPath)) {
            fs.unlinkSync(oldQrPath);
            console.log(
              `>>> [OVERWRITE CLEANUP]: Đã xóa file QR cũ thành công: ${qrFileName}`,
            );
          }
        } catch (cleanupError) {
          console.error(
            ">>> [OVERWRITE CLEANUP WARN]: Không thể xóa file QR cũ:",
            cleanupError.message,
          );
        }
      }

      await company_wallet.update({
        bank_code: bank_bin,
        account_number,
        account_name,
        status: "pending",
        is_verified: false,
        wallet_kyc: null,
        QR_pay: null,
        reject_resson: null,
      });
    } else {
      await db.Company_Wallets.create({
        company_id,
        bank_code: bank_bin,
        account_number,
        account_name,
        status: "pending",
        is_verified: false,
      });
    }

    const payment_existing = await db.payment_sessions.findOne({
      where: {
        payer_id: String(company_id),
        type: "verify",
        status: "pending",
      },
    });

    let paymentCode;
    let sessionId;
    const AMOUNT_EXPECTED = 5000;

    if (payment_existing) {
      paymentCode = payment_existing.payment_code;
      sessionId = payment_existing.id;

      await payment_existing.update({ actor_pay_id: String(id) });
    } else {
      const randomSuffix = crypto.randomBytes(3).toString("hex").toUpperCase();
      paymentCode = `ACTWL${randomSuffix}`;

      const newSession = await db.payment_sessions.create({
        payer_id: String(company_id),
        actor_pay_id: String(id),
        amount_expected: AMOUNT_EXPECTED,
        amount_actual: 0,
        payment_code: paymentCode,
        status: "pending",
        type: "verify",
        payment_method: "deposit",
        chain_status: "not_ready",
      });

      sessionId = newSession.id;
    }

    const SYSTEM_BANK_BIN = process.env.ADMIN_BANKPIN || "BIDV";
    const SYSTEM_ACC_NUM = process.env.ADMIN_ACCOUTSERI || "96247R3CT5";
    const SYSTEM_ACC_NAME = process.env.ADMIN_ACCOUTNAME || "DO DANG CHUNG";

    const qrUrl = `https://img.vietqr.io/image/${SYSTEM_BANK_BIN}-${SYSTEM_ACC_NUM}-compact2.png?amount=${AMOUNT_EXPECTED}&addInfo=${encodeURIComponent(paymentCode)}&accountName=${encodeURIComponent(SYSTEM_ACC_NAME)}`;

    return res.status(200).json({
      RC: 200,
      RM: "Tạo phiên giao dịch đối soát tài khoản thành công!",
      RD: {
        session_id: sessionId,
        transfer_content: paymentCode,
        amount: AMOUNT_EXPECTED,
        bank_bin: SYSTEM_BANK_BIN,
        account_number: SYSTEM_ACC_NUM,
        account_name: SYSTEM_ACC_NAME,
        qr_url: qrUrl,
      },
    });
  } catch (error) {
    console.error(">>> [CREATE PAYMENT SESSION ERROR CRASH]:", error);
    return res.status(500).json({
      RC: -500,
      RM: "Lỗi hệ thống máy chủ khi khởi tạo mã QR đối soát. Vui lòng thử lại sau!",
    });
  }
};

const lookupBankAccount = (db) => async (req, res) => {
  try {
    const { bin, account_number } = req.body;

    if (!bin || !account_number) {
      return res.status(400).json({
        RC: -203,
        RM: "Thiếu thông tin BIN ngân hàng hoặc Số tài khoản",
      });
    }

    console.log(
      `[SEPAY API] Đang kết nối NAPAS tra cứu STK: ${account_number} tại BIN: ${bin}...`,
    );

    const sepayResponse = await axios.get(
      "https://my.sepay.vn/userapi/bank-account-info",
      {
        params: {
          bank_bin: bin,
          account_number: account_number,
        },
        headers: {
          Authorization: `Bearer ${process.env.SEA_PAY_SCRET_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      },
    );

    const responseData = sepayResponse.data;

    if (responseData && responseData.success) {
      console.log(
        `[SEPAY SUCCESS] Đã tìm thấy tên: ${responseData.account_name}`,
      );

      return res.status(200).json({
        RC: 200,
        RM: "Truy vấn thành công",
        RD: {
          account_name: responseData.account_name,
        },
      });
    } else {
      console.log(
        `[SEPAY FAILED] Không tìm thấy STK. Lý do: ${responseData.message}`,
      );

      return res.status(200).json({
        RC: 404,
        RM:
          responseData.message ||
          "Không tìm thấy thông tin tài khoản hợp lệ trên NAPAS.",
        RD: null,
      });
    }
  } catch (error) {
    console.error(
      ">>> [SEPAY AXIOS ERROR]:",
      error.response?.data || error.message,
    );

    return res.status(500).json({
      RC: -500,
      RM: "Lỗi kết nối đến cổng đối soát SePay/NAPAS. Vui lòng thử lại sau!",
    });
  }
};

const getWalletInfo = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;

    if (!company_id) {
      return res.status(400).json({ RM: "Thiếu thông tin định danh!" });
    }
    const wallet = await db.Company_Wallets.findOne({
      where: { company_id },
    });
    return res.status(200).json({ RM: "Thông tin ví", RC: 200, RD: wallet });
  } catch (error) {
    console.error("Lỗi Controller:", error.message);
    return res.status(500).json({ RC: -500, RM: "Lỗi Server" });
  }
};

const Bankinfo = [
  {
    bin: "970436",
    shortName: "Vietcombank",
    fullName: "Ngân hàng TMCP Ngoại thương Việt Nam (VCB)",
  },
  {
    bin: "970415",
    shortName: "VietinBank",
    fullName: "Ngân hàng TMCP Công thương Việt Nam (ICB)",
  },
  {
    bin: "970418",
    shortName: "BIDV",
    fullName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam (BIDV)",
  },
  {
    bin: "970405",
    shortName: "Agribank",
    fullName: "Ngân hàng NN&PT Nông thôn Việt Nam (VBA)",
  },
  {
    bin: "970422",
    shortName: "MB",
    fullName: "Ngân hàng TMCP Quân đội (MB)",
  },
  {
    bin: "970407",
    shortName: "Techcombank",
    fullName: "Ngân hàng TMCP Kỹ thương Việt Nam (TCB)",
  },
  {
    bin: "970416",
    shortName: "ACB",
    fullName: "Ngân hàng TMCP Á Châu (ACB)",
  },
  {
    bin: "970432",
    shortName: "VPBank",
    fullName: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPB)",
  },
  {
    bin: "970423",
    shortName: "TPBank",
    fullName: "Ngân hàng TMCP Tiên Phong (TPB)",
  },
  {
    bin: "970403",
    shortName: "Sacombank",
    fullName: "Ngân hàng TMCP Sài Gòn Thương Tín (STB)",
  },
  {
    bin: "970437",
    shortName: "HDBank",
    fullName: "Ngân hàng TMCP Phát triển Thành phố Hồ Chí Minh (HDB)",
  },
  {
    bin: "970441",
    shortName: "VIB",
    fullName: "Ngân hàng TMCP Quốc tế Việt Nam (VIB)",
  },
  {
    bin: "970443",
    shortName: "SHB",
    fullName: "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)",
  },
  {
    bin: "970440",
    shortName: "SeABank",
    fullName: "Ngân hàng TMCP Đông Nam Á (SEAB)",
  },
  {
    bin: "970426",
    shortName: "MSB",
    fullName: "Ngân hàng TMCP Hàng Hải Việt Nam (MSB)",
  },
  {
    bin: "970449",
    shortName: "LPBank",
    fullName: "Ngân hàng TMCP Lộc Phát Việt Nam (LPB)",
  },
  {
    bin: "970431",
    shortName: "Eximbank",
    fullName: "Ngân hàng TMCP Xuất Nhập khẩu Việt Nam (EIB)",
  },
  {
    bin: "970448",
    shortName: "OCB",
    fullName: "Ngân hàng TMCP Phương Đông (OCB)",
  },
  {
    bin: "970428",
    shortName: "NamABank",
    fullName: "Ngân hàng TMCP Nam Á (NAB)",
  },
  {
    bin: "970419",
    shortName: "NCB",
    fullName: "Ngân hàng TMCP Quốc Dân (NCB)",
  },
  {
    bin: "970427",
    shortName: "VietABank",
    fullName: "Ngân hàng TMCP Việt Á (VAB)",
  },
  {
    bin: "970409",
    shortName: "BacABank",
    fullName: "Ngân hàng TMCP Bắc Á (BAB)",
  },
  {
    bin: "970429",
    shortName: "SCB",
    fullName: "Ngân hàng TMCP Sài Gòn (SCB)",
  },
  {
    bin: "970452",
    shortName: "KienLongBank",
    fullName: "Ngân hàng TMCP Kiên Long (KLB)",
  },
  {
    bin: "970430",
    shortName: "PGBank",
    fullName: "Ngân hàng TMCP Thịnh vượng và Phát triển (PGB)",
  },
  {
    bin: "970433",
    shortName: "VietBank",
    fullName: "Ngân hàng TMCP Việt Nam Thương Tín (VBB)",
  },
  {
    bin: "970400",
    shortName: "Saigonbank",
    fullName: "Ngân hàng TMCP Sài Gòn Công Thương (SGB)",
  },
  {
    bin: "970406",
    shortName: "DongABank",
    fullName: "Ngân hàng TMCP Đông Á (DOB)",
  },
  {
    bin: "970438",
    shortName: "BaoVietBank",
    fullName: "Ngân hàng TMCP Bảo Việt (BVB)",
  },
  {
    bin: "970414",
    shortName: "OceanBank",
    fullName: "Ngân hàng Thương mại TNHH MTV Đại Dương (OCEANBANK)",
  },
  {
    bin: "970444",
    shortName: "CBBank",
    fullName: "Ngân hàng Thương mại TNHH MTV Xây dựng Việt Nam (CBB)",
  },
  {
    bin: "970408",
    shortName: "GPBank",
    fullName: "Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu (GPB)",
  },
  {
    bin: "970424",
    shortName: "ShinhanBank",
    fullName: "Ngân hàng TNHH MTV Shinhan Việt Nam (SHBVN)",
  },
  {
    bin: "970410",
    shortName: "StandardChartered",
    fullName: "Ngân hàng TNHH MTV Standard Chartered Việt Nam (SCVN)",
  },
  {
    bin: "970439",
    shortName: "PublicBank",
    fullName: "Ngân hàng TNHH MTV Public Việt Nam (PBVN)",
  },
  {
    bin: "970458",
    shortName: "UOB",
    fullName: "Ngân hàng TNHH MTV United Overseas Bank (UOB)",
  },
  {
    bin: "970421",
    shortName: "VRB",
    fullName: "Ngân hàng Liên doanh Việt - Nga (VRB)",
  },
  {
    bin: "963388",
    shortName: "Timo",
    fullName: "Ngân hàng số Timo (TIMO)",
  },
  {
    bin: "546034",
    shortName: "Cake",
    fullName: "Ngân hàng số CAKE by VPBank (CAKE)",
  },
  {
    bin: "970490",
    shortName: "ViettelMoney",
    fullName: "Tổng Công ty Dịch vụ số Viettel (VTLMONEY)",
  },
  {
    bin: "970495",
    shortName: "VNPTMoney",
    fullName: "Ví điện tử VNPT Money (VNPTMONEY)",
  },
];

const createWallet = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user || {};
    const { bin, account_number, account_name } = req.body;

    if (!company_id || !bin || !account_number || !account_name) {
      return res
        .status(400)
        .json({ RC: -203, RM: "Thiếu thông tin cấu hình ví!" });
    }

    const bankInfo = Bankinfo.find((b) => b.bin === bin);
    if (!bankInfo) {
      return res
        .status(400)
        .json({ RC: -202, RM: "Mã BIN ngân hàng không hợp lệ!" });
    }

    const calculatedBankCode = bankInfo.bin.toLowerCase().replace(/\s/g, "");

    const existingWallet = await db.Company_Wallets.findOne({
      where: { company_id: String(company_id) },
    });

    if (existingWallet) {
      if (existingWallet.wallet_kyc) {
        try {
          const oldFilePath = path.join(
            process.cwd(),
            "src",
            "Access",
            "company_wallet_kyc",
            existingWallet.wallet_kyc,
          );
          if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
            console.log(
              `>>> [OVERWRITE CLEANUP]: Đã xóa file kyc cũ do đổi số tài khoản: ${existingWallet.wallet_kyc}`,
            );
          }
        } catch (cleanupError) {
          console.error(
            ">>> [OVERWRITE CLEANUP WARN]: Không thể xóa file cũ:",
            cleanupError.message,
          );
        }
      }

      await existingWallet.update({
        bank_code: calculatedBankCode,
        account_number: account_number,
        account_name: account_name,
        is_verified: false,
        status: "pending",
        wallet_kyc: null,
      });

      return res.status(200).json({
        RC: 200,
        RM: "Thông tin tài khoản ví đã được cập nhật lại thành công!",
        RD: existingWallet,
      });
    }

    const newWallet = await db.Company_Wallets.create({
      company_id: String(company_id),
      bank_code: calculatedBankCode,
      account_number: account_number,
      account_name: account_name,
      is_verified: false,
      status: "pending",
    });

    return res.status(201).json({
      RC: 201,
      RM: "Ví ngân hàng chuyên thu đã được khởi tạo thành công!",
      RD: newWallet,
    });
  } catch (error) {
    console.error(">>> [Lỗi createWallet Controller]:", error.message);
    return res
      .status(500)
      .json({ RC: -500, RM: "Lỗi hệ thống máy chủ khi xử lý cấu hình ví" });
  }
};

const WalletkycUpload = (db) => async (req, res) => {
  const { company_id } = req?.user || {};
  const file = req.file;

  try {
    if (!company_id || !file) {
      if (file) meta_core_controller.cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: -203, RM: "Thiếu thông tin định danh hoặc file tải lên!" });
    }

    const company_wallet = await db.Company_Wallets.findOne({
      where: { company_id: String(company_id) },
    });

    if (!company_wallet) {
      meta_core_controller.cleanupSingleFile(file);
      return res.status(404).json({
        RC: 404,
        RM: "Chưa có thông tin khởi tạo ví. Vui lòng khai báo tài khoản ngân hàng trước!",
      });
    }

    if (
      company_wallet.is_verified === true ||
      company_wallet.status === "active"
    ) {
      meta_core_controller.cleanupSingleFile(file);
      return res.status(400).json({
        RC: 400,
        RM: "Tài khoản ví đã hoạt động, không thể tải lên lại KYC. Vui lòng liên hệ Quản trị viên!",
      });
    }

    if (company_wallet.wallet_kyc) {
      try {
        const oldFilePath = path.join(
          process.cwd(),
          "src",
          "Access",
          "company_wallet_kyc",
          company_wallet.wallet_kyc,
        );

        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log(
            `>>> [KYC CLEANUP SUCCESS]: Đã dọn dẹp file kyc cũ thành công: ${company_wallet.wallet_kyc}`,
          );
        }
      } catch (cleanupError) {
        console.error(
          ">>> [KYC CLEANUP WARN]: Không thể xóa file cũ:",
          cleanupError.message,
        );
      }
    }

    await company_wallet.update({
      wallet_kyc: file.filename,
      status: "pending",
    });

    return res.status(200).json({
      RC: 200,
      RM: "Tải lên thành công! Yêu cầu xác minh đang chờ Admin phê duyệt.",
    });
  } catch (error) {
    console.error(">>> [WALLET KYC UPLOAD ERROR]:", error);
    if (file) meta_core_controller.cleanupSingleFile(file);
    return res
      .status(500)
      .json({ RC: -500, RM: "Lỗi hệ thống khi tải lên KYC" });
  }
};

const QRcodeUpload = (db) => async (req, res) => {
  const { company_id } = req?.user || {};
  const file = req.file;

  try {
    if (!company_id || !file) {
      if (file) meta_core_controller.cleanupSingleFile(file);
      return res
        .status(400)
        .json({ RC: -203, RM: "Thiếu thông tin định danh hoặc file tải lên!" });
    }

    const company_wallet = await db.Company_Wallets.findOne({
      where: { company_id: String(company_id) },
    });

    if (!company_wallet) {
      meta_core_controller.cleanupSingleFile(file);
      return res.status(404).json({
        RC: 404,
        RM: "Chưa có thông tin khởi tạo ví. Vui lòng khai báo tài khoản ngân hàng trước!",
      });
    }

    if (
      company_wallet.is_verified === false ||
      company_wallet.status === "pending"
    ) {
      meta_core_controller.cleanupSingleFile(file);
      return res.status(400).json({
        RC: 400,
        RM: "Tài khoản ví chưa hoạt động, không thể tải lên QR code. Vui lòng liên hệ Quản trị viên!",
      });
    }

    if (company_wallet.QR_pay) {
      try {
        const oldFilePath = path.join(
          process.cwd(),
          "src",
          "Access",
          "company_qr_code",
          company_wallet.QR_pay,
        );

        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
          console.log(
            `>>> [KYC CLEANUP SUCCESS]: Đã dọn dẹp file QR cũ thành công: ${company_wallet.QR_pay}`,
          );
        }
      } catch (cleanupError) {
        console.error(
          ">>> [KYC CLEANUP WARN]: Không thể xóa file cũ:",
          cleanupError.message,
        );
      }
    }

    await company_wallet.update({
      QR_pay: file.filename,
    });

    return res.status(200).json({
      RC: 200,
      RM: "Tải lên QR thành công!",
    });
  } catch (error) {
    console.error(">>> [WALLET KYC UPLOAD ERROR]:", error);
    if (file) meta_core_controller.cleanupSingleFile(file);
    return res
      .status(500)
      .json({ RC: -500, RM: "Lỗi hệ thống khi tải lên QRcode" });
  }
};

export default {
  handleSePayWebhook,
  createWallet,
  QRcodeUpload,
  getPeymentStatus,
  lookupBankAccount,
  getWalletInfo,
  genQrforverifywallet,
  WalletkycUpload,
};
