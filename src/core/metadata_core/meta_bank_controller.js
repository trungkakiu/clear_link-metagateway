import { broadcastNotification } from "../../../client_socket_server.js";

const handleSePayWebhook = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const data = req.body;
    console.log(req.body);
    const paymentContent = data.content;
    const transferAmount = parseFloat(data.transferAmount);
    const sepayId = data.id;

    console.log(
      `[SePay Webhook] Nội dung: ${paymentContent} | Số tiền: ${transferAmount}`,
    );

    const match = paymentContent.match(/ORDERPIN\d+/);
    const targetCode = match ? match[0] : paymentContent;

    const session = await db.payment_sessions.findOne({
      where: { payment_code: targetCode },
      include: [{ model: db.Pinned_Products, as: "order" }],
      transaction: t,
    });

    if (!session) {
      console.warn(`Không tìm thấy giao dịch nào khớp với mã: ${targetCode}`);
      await t.rollback();
      return res.status(200).send("No matching transaction");
    }

    if (
      session.status === "paid" &&
      session.amount_actual >= session.amount_expected
    ) {
      await t.rollback();
      return res.status(200).send("Transaction already processed");
    }

    const newActualAmount =
      parseFloat(session.amount_actual || 0) + transferAmount;

    await session.update(
      {
        amount_actual: newActualAmount,
        sepay_transaction_id: sepayId,
        status:
          newActualAmount >= session.amount_expected
            ? "paid"
            : "partially_paid",
        updated_at: new Date(),
      },
      { transaction: t },
    );

    if (session.order) {
      const method = session.order.payment_method;
      const totalExpected = parseFloat(session.amount_expected);
      const totalReceived = newActualAmount;

      let newPaymentStatus = "BANK_awaiting_payment";
      let newOrderStatus = "pending";
      let debt = 0;
      if (method.startsWith("DEPOSIT_")) {
        const percent = parseInt(method.split("_")[1]);
        const requiredAmount = (totalExpected * percent) / 100;
        debt = totalExpected - totalReceived;
        if (totalReceived >= totalExpected) {
          newPaymentStatus = "complated";
          newOrderStatus = "active";

          await db.Notification.create({
            Owner_id: session.order.shipping_partner,
            target_actor: allDriver.map((v) => v.Driver),
            receiver_id: session.order.shipping_partner,
            message: `Đơn vận ${session.order.id} đã được thanh toán thành công!`,
            noitfi_level: "4",
          });

          broadcastNotification(
            session.order.shipping_partner,
            `Đơn vận ${session.order.id} đã được thanh toán thành công!`,
            "/",
            "complete_payment",
            "unread",
            `level_4`,
          );
        } else if (totalReceived >= requiredAmount) {
          newPaymentStatus = "deposit";
          newOrderStatus = "active";
        } else {
          newPaymentStatus = "partially_paid";
          newOrderStatus = "pending";
        }
      } else if (method === "BANK") {
        if (totalReceived >= totalExpected) {
          newPaymentStatus = "complated";
          newOrderStatus = "active";
        } else {
          newPaymentStatus = "BANK_partially_payment";
          newOrderStatus = "pending";
        }
      }

      const minRequired = Number(session.order?.minimum_paymen_to_start || 0);

      const remainingToStart = Math.max(0, minRequired - totalReceived);
      await session.order.update(
        {
          amount_received: totalReceived,
          minimum_payment_to_start: remainingToStart,
          amount_remaining: totalExpected - totalReceived,
          status: newOrderStatus,
          payment_status: newPaymentStatus,
          debt,
        },
        { transaction: t },
      );
    }

    await db.tb_transactions.create(data);

    await t.commit();
    console.log(`Đơn hàng ID: ${session.order_id} đã cập nhật!.`);

    return res.status(200).json({ success: true, RM: "Thanh toán thành công" });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Lỗi Webhook SePay:", error);
    return res.status(500).json({ RM: "Lỗi xử lý Webhook", RC: 500 });
  }
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
        actor_pay_id: id,
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

export default { handleSePayWebhook, getPeymentStatus };
