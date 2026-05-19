import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import xss from "xss";

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: {
    RM: "Quá nhiều yêu cầu từ địa chỉ IP này, vui lòng thử lại sau 10 phút.",
    RC: -429,
    RD: null,
  },
});

const scriptProtect = (req, res, next) => {
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === "string") {
        req.body[key] = xss(req.body[key]);
      }
    }
  }
  next();
};

const verifyToken = (db) => async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      return res.status(401).json({
        RM: "Vui lòng cung cấp token trong tiêu đề xác thực.",
        RC: -401,
        RD: null,
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        RM: "Token không được cung cấp.",
        RC: -401,
        RD: null,
      });
    }

    const isDead = await db.TokenBlacklist.findOne({
      where: { token: token },
    });

    if (isDead != null) {
      return res.status(403).json({
        RM: "Token đã bị thu hồi (logout)",
        RC: -403,
        RD: null,
      });
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "supersecretkey12doto3",
      );
      const User = await db.Actor_model.findByPk(decoded.id);
      if (!User) {
        return res.status(403).json({
          RM: "Người dùng không hợp lệ!",
          RC: -403,
          RD: null,
        });
      }
      if (decoded.session_id !== User.Session_id) {
        return res.status(403).json({
          RM: "Tài khoản đang được đăng nhập trên thiết bị khác!",
          RC: -403,
          RD: null,
        });
      }

      req.user = decoded;
      return next();
    } catch (err) {
      console.error("Token verification error:", err);
      return res.status(403).json({
        RM: "Token không hợp lệ hoặc đã hết hạn.",
        RC: -403,
        RD: null,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Lỗi khi xác thực token",
      RC: -500,
      RD: null,
    });
  }
};

const isPrime = () => (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        RM: "Chưa xác thực",
        RC: -401,
        RD: null,
      });
    }

    const prime = req.user.prime === true;

    if (!prime) {
      console.warn(`USER [${req.user.id}] TRYING CONTROL ADMIN DASHBOARD`);
      return res.status(403).json({
        RM: "Không đủ thẩm quyền",
        RC: -403,
        RD: null,
      });
    }

    next();
  } catch (error) {
    console.error("isPrime error:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống",
      RC: -500,
      RD: null,
    });
  }
};

const isAdmin = () => (req, res, next) => {
  try {
    const user = req?.user;
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        RM: "Bạn không có quyền truy cập vào tài nguyên này.",
        RC: -403,
        RD: null,
      });
    }

    next();
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Lỗi hệ thống.",
      RC: 500,
      RD: null,
    });
  }
};

const RequireOTP = (db) => async (req, res, next) => {
  try {
    const { otpSessionID } = req.body;
    const now = new Date();
    if (!otpSessionID) {
      return res.status(401).json({
        RM: "Yêu cầu xác thực OTP.",
        RC: -401,
        RD: null,
      });
    }
    const otpSession = await db.Admin_active_history.findOne({
      where: {
        User_id: req.user.id,
        challenge_code: otpSessionID,
        type: "otp-check",
        status: "pending",
      },
    });

    if (!otpSession) {
      return res.status(401).json({
        RM: "OTP không hợp lệ hoặc đã hết hạn.",
        RC: -401,
        RD: null,
      });
    }

    const expiredAt = otpSession.createdAt.getTime() + 5 * 60 * 1000;
    if (expiredAt < Date.now()) {
      await otpSession.update({
        status: "expired",
      });
      return res.status(401).json({
        RM: "OTP đã hết hạn.",
        RC: -401,
        RD: null,
      });
    }

    await otpSession.update({
      status: "done",
    });

    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      RM: "Lỗi khi xác thực OTP",
      RC: -500,
      RD: null,
    });
  }
};

export default {
  verifyToken,
  isAdmin,
  scriptProtect,
  limiter,
  RequireOTP,
  isPrime,
};
