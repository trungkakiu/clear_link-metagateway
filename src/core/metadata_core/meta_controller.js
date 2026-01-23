import axios from "axios";
import bcrypt from "bcrypt";
import db from "../../models/metadatabase/index.js";
import JwtAction from "../../utils/JwtAction.js";
import crypto from "crypto";
import Helper__funtion from "../../utils/Helper__funtion.js";
import pkg from "elliptic";
import pair_validate from "../../core_API/pair_validate.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { Op, where } from "sequelize";
import { pendingRequests } from "../../../meta_server.js";
import { raw } from "express";

dotenv.config();
const { ec } = pkg;
const EC = new ec("secp256k1");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, "../../utils/node_private.pem"),
  "utf8",
);

const PUBLIC_KEY = fs.readFileSync(
  path.resolve(__dirname, "../../utils/node_public.pem"),
  "utf8",
);

const HashPassWordUser = (PassWord) => {
  return new Promise((resolve, reject) => {
    bcrypt.genSalt(10, (err, salt) => {
      if (err) reject(err);
      bcrypt.hash(PassWord, salt, (err, hash) => {
        if (err) reject(err);
        resolve(hash);
      });
    });
  });
};

function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

const RegisterActive = async (req, res) => {
  try {
    const { phonenumber, fullname, email, password } = req?.body;
    if (!email) {
      return res.status(200).json({
        RM: "Oops, missing email parameters!",
        RC: -203,
      });
    }

    if (!isValidEmail(email)) {
      return res.status(200).json({
        RM: "Oops, email is not valid!",
        RC: -205,
      });
    }

    if (!password) {
      return res.status(200).json({
        RM: "Oops, missing password parameters!",
        RC: -203,
      });
    }
    if (!phonenumber) {
      return res.status(200).json({
        RM: "Oops, missing phone number parameters!",
        RC: -203,
      });
    }

    const user = await db.Actor_model.findOne({
      where: { email: email },
    });

    if (user) {
      return res.status(200).json({
        RM: "Oops, email already exists!",
        RC: -204,
      });
    } else {
      const hashPassword = await HashPassWordUser(password);
      let userId = null;
      do {
        userId = Helper__funtion.genId("USER_");
      } while (
        await Helper__funtion.validCheckID(userId, db.Actor_model, "id")
      );

      await db.Actor_model.create({
        id: userId,
        email: email,
        name: fullname,
        password: hashPassword,
        phone_number: phonenumber,
        public_key: "null",
        avatar: "null",
        role: "user",
      });
      return res.status(200).json({
        RM: "Register successfuly!",
        RC: 200,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Oops, server error!",
      RC: -500,
    });
  }
};

const AdminLoginActive = async (req, res) => {
  try {
    if (!req?.body || Object.keys(req.body).length === 0) {
      return res.status(200).json({
        RM: "Oops, missing login parameters!",
        RC: -203,
      });
    }

    const { email, password } = req?.body;

    if (!email) {
      return res.status(200).json({
        RM: "Oops, missing login parameters!",
        RC: -203,
      });
    }
    if (!password) {
      return res.status(200).json({
        RM: "Oops, missing password parameters!",
        RC: -203,
      });
    }

    let user = null;

    if (!isValidEmail(email)) {
      user = await db.Actor_model.findOne({
        where: { phone_number: email },
      });
    } else {
      user = await db.Actor_model.findOne({
        where: { email: email },
      });
    }

    if (!user) {
      return res.status(200).json({
        RM: "Oops, wrong login parameter!",
        RC: -204,
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        RM: "Oops, you are not admin!",
        RC: -205,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(200).json({
        RM: "Oops, password wrong!",
        RC: -203,
      });
    }

    const token = await JwtAction.JwtSign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    delete user.password;
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone_number: user.phone_number,
      avatar: user.avatar,
      role: user.role,
    };

    return res.status(200).json({
      RM: "Login successfully!",
      RC: 200,
      RD: {
        User: userData,
        Token: token,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RM: "Oops, server error!",
      RC: -500,
    });
  }
};

const genPublickey = (db, nodes) => async (req, res) => {
  try {
    const { otp } = req.body || {};
    const Actor_id = req.user.id;
    if (!otp || !Actor_id) {
      return res.status(400).json({
        RM: "Missing required parameters (OTP or Actor_id)",
        RC: -203,
      });
    }

    if (otp.length < 6) {
      return res.status(400).json({
        RM: "OTP must be at least 6 characters long",
        RC: -206,
      });
    }

    const privateKey = crypto.createHash("sha256").update(otp).digest("hex");
    const keyPair = EC.keyFromPrivate(privateKey);
    const publicKey = keyPair.getPublic("hex");

    const user = await db.Actor_model.findByPk(Actor_id);
    if (!user) {
      return res.status(404).json({
        RM: "Actor not found",
        RC: -204,
      });
    }

    if (
      user.public_key &&
      user.public_key !== "null" &&
      user.public_key.length < 1
    ) {
      return res.status(409).json({
        RM: "Public key already exists. OTP cannot be changed.",
        RC: -207,
      });
    }

    await user.update({ public_key: publicKey });

    const auto_approve = await db.System_Settings.findOne({
      where: { key: "auto_approve_user" },
    });

    if (auto_approve && auto_approve.value === "true") {
      const result = await pair_validate.process_user_block(
        db,
        nodes,
        pendingRequests,
      )(user.id);

      if (result.ok) {
        await user.update({ status: "active" });
      } else {
        return res.status(200).json({
          RM: "OTP đã được tạo nhưng người dùng pair thất bại",
          RC: 201,
          RD: otp,
        });
      }
    }

    return res.status(200).json({
      RM: "OTP successfully registered",
      RC: 200,
      RD: otp,
    });
  } catch (error) {
    console.error("[genPublickey ERROR]", error);
    return res.status(500).json({
      RM: "Internal Server Error",
      RC: -500,
      RD: error.message,
    });
  }
};

const checkUserOTP = () => async (req, res) => {
  try {
    const { otp } = req.body || {};
    const UserID = req.user.id;

    if (!otp || !UserID) {
      return res.status(400).json({
        RM: "Missing parameters (OTP or UserID)",
        RC: -203,
      });
    }

    if (otp.length < 6) {
      return res.status(400).json({
        RM: "OTP must be at least 6 characters long",
        RC: -206,
      });
    }
    const user = await db.Actor_model.findByPk(UserID);
    if (!user) {
      return res.status(400).json({
        RM: "User not found",
        RC: -204,
      });
    }

    const privateKey = crypto.createHash("sha256").update(otp).digest("hex");
    const keyPair = EC.keyFromPrivate(privateKey);
    const generatedPublicKey = keyPair.getPublic("hex");

    if (user.public_key !== generatedPublicKey) {
      return res.status(401).json({
        RM: "Invalid OTP — does not match user's registered public key",
        RC: -401,
      });
    }

    let otpSessionID = null;
    do {
      otpSessionID = Helper__funtion.genId("OTP_SESSION_");
    } while (
      await Helper__funtion.validCheckID(
        otpSessionID,
        db.Admin_active_history,
        "challenge_code",
      )
    );

    const session = await db.Admin_active_history.create({
      Admin_id: null,
      User_id: req.user.id,
      Mail: req.user.email,
      OTP: "",
      Message: "user checking otp",
      status: "pending",
      node_target_address: "",
      type: "otp-check",
      challenge_code: otpSessionID,
    });

    if (!session) {
      return res.status(500).json({
        RM: "server error",
        RC: -500,
      });
    }

    return res.status(200).json({
      RM: "OTP verified successfully",
      RC: 200,
      RD: otpSessionID,
    });
  } catch (error) {
    console.error("[checkOTP ERROR]", error);
    return res.status(500).json({
      RM: "Internal Server Error",
      RC: -500,
      RD: error.message,
    });
  }
};

const sendMail = async (to, subject, html) => {
  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.MAIL_VALIDATOR,
        pass: process.env.MAIL_VALIDATOR_PASS,
      },
    });

    await transporter.sendMail({
      from: `"ClearLink System" <${process.env.MAIL_VALIDATOR}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("Mail error:", error);
    return false;
  }
};

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

const createAdminOTP = async (req, res) => {
  try {
    const otp = generateOTP();
    const otpHash = hashOTP(otp);
    const { node_target_address, type } = req.body || {};

    const Action_history = await db.Admin_active_history.create({
      Admin_id: req.user.id,
      Mail: req.user.email,
      OTP: otpHash,
      Message: "Xác minh hành động quản trị",
      status: "pending",
      type: type,
      node_target_address: node_target_address,
    });

    const Admin_mail = await db.Actor_model.findOne({
      where: { role: "admin" },
    });

    const html = `
      <div style="
        width: 100%; 
        background: #f5f7fa; 
        padding: 40px 0;
        font-family: 'Segoe UI', Tahoma, sans-serif;
      ">
        <div style="
          max-width: 480px; 
          margin: auto; 
          background: #ffffff; 
          border-radius: 12px;
          padding: 30px 35px; 
          box-shadow: 0 6px 20px rgba(0,0,0,0.08);
          border: 1px solid #e5e7eb;
        ">
          
          <h2 style="
            margin: 0; 
            font-size: 22px; 
            color: #111827; 
            text-align: center;
            font-weight: 600;
          ">
            Xác minh hành động quản trị
          </h2>
          
          <p style="
            margin-top: 12px; 
            font-size: 15px; 
            color: #4b5563; 
            text-align: center;
          ">
            Bạn vừa yêu cầu xác thực thao tác quản trị trên hệ thống  Suply Chain ClearLink
          </p>

          <div style="
            margin: 25px auto 20px; 
            text-align: center;
          ">
            <span style="
              display: inline-block;
              background: #f0f7ff;
              padding: 16px 28px;
              border-radius: 10px;
              font-size: 32px;
              letter-spacing: 10px;
              font-weight: 700;
              color: #2563eb;
              border: 1px solid #bfdbfe;
            ">
              ${otp}
            </span>
          </div>

          <p style="
            font-size: 14px; 
            color: #374151; 
            text-align: center;
          ">
            OTP có hiệu lực trong <b>2 phút</b>
            <br/>Không chia sẻ mã này với bất kỳ ai
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

          <p style="
            font-size: 12px; 
            color: #6b7280; 
            text-align: center;
            line-height: 1.5;
          ">
            Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.<br/>
            ClearLink Security System © ${new Date().getFullYear()}
          </p>
        </div>
      </div>
    `;

    const mail = await sendMail(
      Admin_mail.email,
      "OTP Xác minh quản trị",
      html,
    );
    if (!mail) {
      return res.status(500).json({
        RM: "Lỗi gửi mail, vui lòng kiểm tra lại cấu hình email",
        RC: -500,
      });
    } else {
      return res.json({
        RM: "OTP đã được gửi đến email của bạn",
        RC: 200,
        RD: {
          Mail: req.user.email,
          HistoryID: Action_history.id,
        },
      });
    }
  } catch (error) {
    console.log("[createAdminOTP ERROR]", error);
    return res.status(500).json({
      RM: "Lỗi máy chủ, không thể tạo OTP",
      RC: -500,
      RD: error.message,
    });
  }
};

const verifyAdminOTP = async (req, res) => {
  try {
    const { otp, historyId } = req.body;
    if (!otp || !historyId) {
      return res.status(400).json({
        RM: "Missing parameters (otp or historyId)",
        RC: -203,
      });
    }

    const history = await db.Admin_active_history.findOne({
      where: { id: historyId },
    });

    if (!history)
      return res.status(404).json({
        RM: "History not found",
        RC: -204,
      });

    const otpHash = hashOTP(otp.trim());

    if (history.OTP !== otpHash) {
      history.status = "invalid";
      await history.save();
      return res.status(200).json({
        RM: "Invalid OTP",
        RC: -401,
      });
    }

    const now = Date.now();
    const created = new Date(history.createdAt).getTime();

    if (now - created > 2 * 60 * 1000) {
      history.status = "expired";
      await history.save();
      return res.status(200).json({
        RM: "OTP has expired",
        RC: -403,
      });
    }
    let oneTimeOTP = null;
    do {
      oneTimeOTP = Helper__funtion.genId("ONETIME_OTP_");
    } while (
      await Helper__funtion.validCheckID(
        oneTimeOTP,
        db.Admin_active_history,
        "challenge_code",
      )
    );

    history.status = "valid";
    history.challenge_code = oneTimeOTP;
    await history.save();
    return res.json({
      RM: "OTP verified successfully",
      RC: 200,
      RD: oneTimeOTP,
    });
  } catch (error) {
    console.log("[verifyAdminOTP ERROR]", error);
    return res.status(500).json({
      RM: "Internal Server Error",
      RC: -500,
      RD: error.message,
    });
  }
};

const userLogin = async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res
        .status(200)
        .json({ RM: "Missing login parameters!", RC: -203 });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(200)
        .json({ RM: "Missing login parameters!", RC: -203 });
    }

    let user = null;

    try {
      if (!isValidEmail(email)) {
        user = await db.Actor_model.findOne({
          where: {
            phone_number: email,
            role: { [Op.ne]: "admin" },
          },
        });
      } else {
        user = await db.Actor_model.findOne({
          where: {
            email,
            role: { [Op.ne]: "admin" },
          },
        });
      }
    } catch (err) {
      console.log("Lỗi truy vấn DB:", err);
      return res.status(500).json({ RM: "DB error", RC: 500 });
    }

    if (!user) {
      return res.status(200).json({ RM: "Wrong login parameter!", RC: -204 });
    }

    if (!user.password) {
      return res.status(500).json({
        RM: "Password invalid in DB",
        RC: 500,
      });
    }
    if (typeof user.password !== "string" || user.password.length < 20) {
      return res.status(500).json({
        RM: "Password hash error",
        RC: 500,
      });
    }
    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (err) {
      console.log("bcrypt.compare lỗi:", err);
      return res.status(500).json({
        RM: "Password compare error",
        RC: 500,
      });
    }

    if (!isMatch) {
      return res.status(200).json({ RM: "Password wrong!", RC: -203 });
    }
    const company = await db.Company_account_level.findOne({
      where: {
        Actor_id: user.id,
      },
    });
    let token = null;
    try {
      token = await JwtAction.JwtSign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone_number: user.phone_number,
        company_id: company?.Company_id || "null",
      });
    } catch (err) {
      console.log("Lỗi tạo JWT:", err);
      return res.status(500).json({
        RM: "Token creation error",
        RC: 500,
      });
    }

    const userData = user.toJSON ? user.toJSON() : user;

    delete userData.password;

    return res.status(200).json({
      RM: "Login successfully!",
      RC: 200,
      RD: {
        Otp: Boolean(user.public_key !== "null"),
        User: userData,
        Token: token,
      },
    });
  } catch (error) {
    console.error("Lỗi ngoài dự tính:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const pendingFields = {
  Transporter: [
    "company_name",
    "license_number",
    "fleet_size",
    "service_area",
    "contact_person",
    "contact_phone",
  ],

  Retailer: [
    "store_name",
    "store_address",
    "branch_count",
    "product_lines",
    "contact_person",
    "contact_phone",
  ],

  Distributor: [
    "company_name",
    "license_number",
    "warehouse_location",
    "delivery_capacity",
    "contact_person",
    "contact_number",
  ],

  Manufacturer: [
    "factory_name",
    "license_number",
    "tax_code",
    "location",
    "production_capacity",
    "certifications",
    "contact_person",
    "contact_phone",
  ],
};
const validateRolePayload = (role, data, requiredFields) => {
  const fields = requiredFields[role];
  if (!fields) return { ok: false, msg: "Invalid role" };

  const missing = fields.filter((f) => !data[f]);

  if (missing.length > 0) {
    return {
      ok: false,
      msg: `Missing parameters: ${missing.join(", ")}`,
    };
  }

  return { ok: true, data };
};

const validator_user_request = async (db, user_id) => {
  if (!user_id) return false;

  const [m, d, r, t] = await Promise.all([
    db.Manufacturer.findOne({ where: { actor_id: user_id } }),
    db.Distributor.findOne({ where: { actor_id: user_id } }),
    db.Retailer.findOne({ where: { actor_id: user_id } }),
    db.Transporter.findOne({ where: { actor_id: user_id } }),
  ]);

  return !(m || d || r || t);
};

const create_pending_profile = async (req, res) => {
  try {
    const { role, data } = req.body;

    if (!role || !data || !req.user) {
      return res.status(400).json({
        RM: "Missing role or data in request body",
        RC: 400,
      });
    }

    if (validator_user_request(db, req.user.id)) {
      const generateUniqueCode = async (
        db,
        modelName,
        field = "id",
        length = 7,
      ) => {
        try {
          const Model = db[modelName];
          if (!Model) {
            throw new Error(`Model '${modelName}' not found in DB`);
          }

          let retries = 10;

          while (retries > 0) {
            const prefix = modelName.toUpperCase();
            const randomNumber = Math.floor(
              Math.random() * Math.pow(10, length),
            )
              .toString()
              .padStart(length, "0");

            const generated = `${prefix}_${randomNumber}`;

            const exists = await Model.findOne({
              where: { [field]: generated },
            });

            if (!exists) return generated;

            retries--;
          }

          throw new Error("Không thể tạo ID duy nhất sau nhiều lần thử!");
        } catch (err) {
          console.error("generateUniqueCode ERROR:", err);
          return null;
        }
      };

      const result = validateRolePayload(role, data, pendingFields);
      if (!result.ok) {
        return res.status(400).json({
          RM: result.msg,
          RC: 400,
        });
      }
      try {
        let company;
        const user = await db.Actor_model.findByPk(req.user.id);
        if (role === "Manufacturer") {
          const newId = await generateUniqueCode(db, "Manufacturer", "id");
          company = await db.Manufacturer.create({
            id: newId,
            actor_id: req.user.id,
            factory_name: data.factory_name,
            license_number: data.license_number,
            tax_code: data.tax_code,
            location: data.location,
            production_capacity: data.production_capacity,
            certifications: data.certifications,
            contact_person: data.contact_person,
            contact_phone: data.contact_phone,
            status: "pending",
          });
          user.role = "manufacturer";
        }

        if (role === "Retailer") {
          const newId = await generateUniqueCode(db, "Retailer", "id");
          company = await db.Retailer.create({
            id: newId,
            actor_id: req.user.id,
            store_name: data.store_name,
            store_address: data.store_address,
            branch_count: data.branch_count,
            product_lines: data.product_lines,
            contact_person: data.contact_person,
            contact_phone: data.contact_phone,
            status: "pending",
          });
          user.role = "retailer";
        }

        if (role === "Transporter") {
          const newId = await generateUniqueCode(db, "Transporter", "id");
          company = await db.Transporter.create({
            id: newId,
            actor_id: req.user.id,
            company_name: data.company_name,
            license_number: data.license_number,
            fleet_count: data.fleet_size,
            operation_area: data.service_area,
            contact_manager: data.contact_person,
            contact_phone: data.contact_phone,
            status: "pending",
          });
          user.role = "transporter";
        }

        if (role === "Distributor") {
          const newId = await generateUniqueCode(db, "Distributor", "id");
          company = await db.Distributor.create({
            id: newId,
            actor_id: req.user.id,
            company_name: data.company_name,
            license_number: data.license_number,
            warehouse_location: data.warehouse_location,
            delivery_capacity: data.delivery_capacity,
            contact_person: data.contact_person,
            contact_number: data.contact_number,
            status: "pending",
          });
          user.role = "distributor";
        }

        ((user.role = role), (user.role_active = "pending"));
        await user.save();
        const newId = await generateUniqueCode(
          db,
          "Company_account_level",
          "id",
        );
        await db.Company_account_level.create({
          id: newId,
          Actor_id: user.id,
          Company_id: company.id,
          role_level: "level_5",
          status: "active",
          isExcute: true,
          isRead: true,
        });
      } catch (error) {
        console.log("Create pending error:", error);
        return res.status(500).json({
          RM: "Internal data server error!",
          RC: 500,
        });
      }

      return res.status(200).json({
        RM: "Pending profile created",
        RC: 200,
        RD: result.data,
      });
    } else {
      return res.status(200).json({
        RM: "Bạn không thể tạo thêm yêu cầu nữa!",
        RC: -201,
      });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const userLogout = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user?.id;

    if (!token || !userId) {
      return res.status(400).json({
        RM: "Missing token or userId",
        RC: 400,
      });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.TokenBlacklist.create({
      token,
      Actor_id: userId,
      expired_at: expiresAt,
    });

    return res.status(200).json({
      RM: "Logout successfully",
      RC: 200,
    });
  } catch (error) {
    console.log("Logout error:", error);
    return res.status(500).json({
      RM: "Internal logout error",
      RC: 500,
    });
  }
};

const mailResendPendingUser = (db) => async (req, res) => {
  try {
    const { email, title, payload } = req.body;
    if (!email || !title || !payload) {
      return res.status(200).json({
        RM: "Missing data when send support email",
        RC: -203,
      });
    }

    const payloadToUser =
      process.env.MAIL_PAYLOAD_TO_USER_SUPPORT ||
      `Yêu cầu hỗ trợ của bạn đã được hệ thống tiếp nhận thành công. Bộ phận quản trị ClearLink sẽ tiến hành kiểm tra và xử lý trong vòng 24 giờ làm việc. Mọi cập nhật sẽ được gửi trực tiếp qua email của bạn.`;

    const Admin_mail = await db.Actor_model.findOne({
      where: { role: "admin" },
    });

    if (!Admin_mail) {
      return res.status(200).json({
        RM: "Không tìm thấy admin để gửi mail!",
        RC: -204,
      });
    }

    const Action_history = await db.Admin_active_history.create({
      Admin_id: req.user.id,
      Mail: req.user.email,
      OTP: "",
      Message: `User ${req.user.id} gửi mail yêu cầu hỗ trợ`,
      status: "done",
      type: "user_action",
      node_target_address: "",
    });

    if (!Action_history) {
      return res.status(200).json({
        RM: "Không thể tạo lịch sử hành động!",
        RC: -501,
      });
    }

    const htmltoAdmin = `
      <div style="
        width: 100%;
        background: #f5f7fa;
        padding: 40px 0;
        font-family: 'Segoe UI', Tahoma, sans-serif;
      ">
        <div style="
          max-width: 560px;
          margin: auto;
          background: #ffffff;
          border-radius: 12px;
          padding: 32px 38px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.07);
          border: 1px solid #e5e7eb;
        ">
          
          <h2 style="
            margin: 0;
            font-size: 22px;
            color: #111827;
            text-align: center;
            font-weight: 600;
          ">
            Yêu cầu hỗ trợ từ người dùng
          </h2>

          <p style="
            margin-top: 12px;
            font-size: 15px;
            color: #4b5563;
            text-align: center;
          ">
            Một người dùng vừa gửi yêu cầu hỗ trợ trên hệ thống
            <b>Supply Chain ClearLink</b>.
          </p>

          <div style="
            margin: 25px 0 20px;
            background: #f9fafb;
            border-left: 4px solid #3b82f6;
            padding: 18px 20px;
            border-radius: 6px;
            font-size: 15px;
            color: #1f2937;
            line-height: 1.6;
            white-space: pre-line;
          ">
            ${payload}
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

          <p style="
            font-size: 12px;
            color: #6b7280;
            text-align: center;
            line-height: 1.5;
          ">
            ClearLink Support System © ${new Date().getFullYear()}<br/>
            Đây là email thông báo tự động, vui lòng không phản hồi.
          </p>
        </div>
      </div>
    `;

    const htmlToUser = `
      <div style="
        width: 100%;
        background: #f5f7fa;
        padding: 40px 0;
        font-family: 'Segoe UI', Tahoma, sans-serif;
      ">
        <div style="
          max-width: 560px;
          margin: auto;
          background: #ffffff;
          border-radius: 12px;
          padding: 32px 38px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.07);
          border: 1px solid #e5e7eb;
        ">
          
          <h2 style="
            margin: 0;
            font-size: 22px;
            color: #111827;
            text-align: center;
            font-weight: 600;
          ">
            Thông báo từ hệ thống ClearLink
          </h2>

          <p style="
            margin-top: 12px;
            font-size: 15px;
            color: #4b5563;
            text-align: center;
          ">
            Đây là thông báo liên quan đến tài khoản của bạn trên nền tảng
            <b>Supply Chain ClearLink</b>.
          </p>

          <div style="
            margin: 25px 0 22px;
            background: #f9fafb;
            border-left: 4px solid #3b82f6;
            padding: 18px 20px;
            border-radius: 6px;
            font-size: 15px;
            color: #1f2937;
            line-height: 1.6;
            white-space: pre-line;
          ">
            ${payloadToUser}
          </div>

          <p style="
            margin-top: 10px;
            font-size: 14px;
            color: #374151;
            text-align: center;
            line-height: 1.6;
          ">
            Nếu bạn có bất kỳ câu hỏi hoặc cần hỗ trợ thêm,<br/>
            hãy liên hệ lại bộ phận hỗ trợ ClearLink qua email trungkakiu@gmail.com.
          </p>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 25px 0;">

          <p style="
            font-size: 12px;
            color: #6b7280;
            text-align: center;
            line-height: 1.5;
          ">
            ClearLink Notification System © ${new Date().getFullYear()}<br/>
            Đây là email tự động, vui lòng không phản hồi.
          </p>
        </div>
      </div>
    `;

    const results = await Promise.allSettled([
      sendMail(email, `ClearLink phản hồi: ${title}`, htmlToUser),
      sendMail(Admin_mail.email, `SUPPORT REQUEST: ${title}`, htmltoAdmin),
    ]);

    const userMailStatus = results[0].status === "fulfilled";
    const adminMailStatus = results[1].status === "fulfilled";

    if (userMailStatus || adminMailStatus) {
      return res.status(200).json({
        RM: "Đã gửi mail yêu cầu hỗ trợ thành công!",
        RC: 200,
      });
    }

    return res.status(200).json({
      RM: "Đã ghi nhận yêu cầu vào hệ thống!",
      RC: 201,
    });
  } catch (error) {
    console.log("Mail resend error:", error);
    return res.status(500).json({
      RM: "Internal error",
      RC: 500,
    });
  }
};

const getMe = (db) => async (req, res) => {
  try {
    const user = await db.Actor_model.findByPk(req?.user?.id);
    const company = await db.Company_account_level.findOne({
      where: {
        Actor_id: user.id,
      },
    });
    if (user) {
      const token = await JwtAction.JwtSign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone_number: user.phone_number,
        company_id: company?.Company_id,
      });

      const userData = user.toJSON ? user.toJSON() : user;
      delete userData.password;

      return res.status(200).json({
        RM: "fetch info successfully!",
        RC: 200,
        RD: {
          Otp: Boolean(user.public_key !== "null"),
          User: userData,
          Token: token,
        },
      });
    } else {
      return res.status(400).json({
        RM: "Không tìm thấy người dùng",
        RC: -400,
      });
    }
  } catch (error) {
    console.log("server error:", error);
    return res.status(500).json({
      RM: "Internal error",
      RC: 500,
    });
  }
};

const user_setup_login = (db) => async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(200).json({
        RM: "Thiếu thông tin đăng nhập!",
        RC: -2031,
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(200).json({
        RM: "Thiếu thông tin đăng nhập!",
        RC: -203,
      });
    }

    let user = null;

    try {
      if (!isValidEmail(email)) {
        user = await db.Actor_model.findOne({
          where: {
            phone_number: email,
            role: { [Op.ne]: "admin" },
          },
        });
      } else {
        user = await db.Actor_model.findOne({
          where: {
            email,
            role: { [Op.ne]: "admin" },
          },
        });
      }
    } catch (err) {
      console.log("Lỗi truy vấn DB:", err);
      return res.status(500).json({ RM: "DB error", RC: 500 });
    }

    if (!user) {
      return res.status(200).json({
        RM: "Sai tên đăng nhập hoặc mật khẩu!",
        RC: -204,
      });
    }

    if (!user.password || typeof user.password !== "string") {
      return res.status(200).json({
        RM: "Mật khẩu không hợp lệ!",
        RC: -205,
      });
    }

    let isMatch = false;
    try {
      isMatch = await bcrypt.compare(password, user.password);
    } catch (err) {
      console.log("bcrypt error:", err);
      return res.status(500).json({ RM: "bcrypt error", RC: 500 });
    }

    if (!isMatch) {
      return res.status(200).json({
        RM: "Mật khẩu không chính xác!",
        RC: -206,
      });
    }

    if (user.role_active !== "active") {
      return res.status(200).json({
        RM: "Tài khoản chưa được kích hoạt!",
        RC: -207,
      });
    }

    if (user.setup_status === "pending") {
      return res.status(200).json({
        RM: "Tài khoản của bạn đang chờ duyệt node!",
        RC: -208,
        allow_setup: false,
      });
    }

    if (user.setup_status === "setup") {
      return res.status(200).json({
        RM: "Bạn đã có node được cài đặt!",
        RC: -209,
        allow_setup: false,
      });
    }

    if (user.setup_status === "ban") {
      return res.status(200).json({
        RM: "Bạn không có quyền cài đặt node!",
        RC: -210,
        allow_setup: false,
      });
    }

    let token = null;
    try {
      token = await JwtAction.JwtSign({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone_number: user.phone_number,
      });
    } catch (err) {
      console.log("JWT error:", err);
      return res.status(500).json({ RM: "JWT error", RC: 500 });
    }

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      setup_status: user.setup_status,
    };
    delete userData.password;

    return res.status(200).json({
      RM: "Đăng nhập thành công!",
      RC: 200,
      RD: {
        Otp: Boolean(user.public_key?.length),
        allow_setup: true,
        Token: token,
        User: userData,
      },
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const get_user_actor = (db) => async (req, res) => {
  try {
    const user_list = await db.Actor_model.findAll();
    if (!user_list) {
      return res.status(200).json({
        RM: "Danh sách người dùng trống",
        RC: 204,
      });
    }

    return res.status(200).json({
      RM: "Lấy thành công danh sách người dùng",
      RC: 200,
      RD: user_list,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getCategories = (db) => async (req, res) => {
  try {
    const target_id = req?.user?.id;
    if (!target_id) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu đầu vào",
        RC: -203,
      });
    }
    const manu_id = await db.Manufacturer.findOne({
      where: {
        actor_id: target_id,
      },
    });
    const categories = await db.Product_category.findAll({
      where: { author: manu_id.id },
    });

    return res.status(200).json({
      RM: "Lấy thành công danh sách",
      RC: 200,
      RD: categories,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const createCategories = (db) => async (req, res) => {
  try {
    const target_id = req?.user?.id;
    const { name, description, status } = req?.body;
    if (!target_id || !name || !status) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu đầu vào",
        RC: -203,
      });
    }

    const is_exists = await db.Product_category.findOne({
      where: {
        cate_name: name,
        author: target_id,
      },
    });

    if (is_exists) {
      return res.status(200).json({
        RM: "Danh mục đã tồn tại!",
        RC: -201,
      });
    }
    let CateID;
    const manu_id = await db.Manufacturer.findOne({
      where: {
        actor_id: target_id,
      },
    });
    do {
      CateID = Helper__funtion.genId("CATEGORY_");
    } while (
      await Helper__funtion.validCheckID(CateID, db.Product_category, "id")
    );
    const cate = await db.Product_category.create({
      id: CateID,
      cate_name: name,
      author: manu_id.id,
      status: status,
      description: description || "",
    });

    return res.status(200).json({
      RM: "Thêm danh mục thành công!",
      RC: 200,
      RD: cate,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

function parseValue(type, raw) {
  if (raw == null) return null;
  switch (type) {
    case "boolean":
      return raw === "true";
    case "number":
      return Number(raw);
    case "json":
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    default:
      return raw;
  }
}

function serializeValue(type, value) {
  if (value == null) return "";
  switch (type) {
    case "boolean":
      return value ? "true" : "false";
    case "json":
      return typeof value === "string" ? value : JSON.stringify(value);
    default:
      return String(value);
  }
}

const getAllSettings = async (req, res) => {
  try {
    const rows = await db.System_Settings.findAll({
      order: [["key", "ASC"]],
    });

    return res.status(200).json({
      RC: 200,
      RD: rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
    });
  }
};

const updateSetting = async (req, res) => {
  try {
    const { key, enabled } = req.body;

    if (!key) {
      return res.status(400).json({ RC: 400, RM: "Missing key" });
    }

    const setting = await db.System_Settings.findOne({ where: { key: key } });
    if (!setting) {
      return res.status(404).json({ RC: 404, RM: "Setting not found" });
    }

    await setting.update({
      enabled: enabled,
    });

    return res.status(200).json({
      RC: 200,
      RM: "Updated",
      RD: {
        id: setting.id,
        key: setting.key,
        title: setting.title,
        danger: setting.danger,
        description: setting.description,
        enabled: setting.enabled,
        impact: setting.impact,
        updatedAt: setting.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
    });
  }
};

export const createSetting = async (req, res) => {
  try {
    const { key, type, value, description } = req.body.key;

    if (!key || !type) {
      return res.status(400).json({ RC: 400, RM: "Missing key or type" });
    }

    const exists = await db.System_Settings.findOne({ where: { key } });
    if (exists) {
      return res.status(409).json({ RC: 409, RM: "Key already exists" });
    }

    const serialized = serializeValue(type, value);
    const created = await db.System_Settings.create({
      key,
      type,
      value: serialized,
      description: description || null,
    });

    return res.status(201).json({
      RC: 201,
      RM: "Created",
      RD: {
        id: created.id,
        key: created.key,
        type: created.type,
        description: created.description,
        rawValue: created.value,
        value: parseValue(created.type, created.value),
        updatedAt: created.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      RC: 500,
      RM: "Internal server error",
    });
  }
};

const auto_approve_product = async (db, product_id) => {
  try {
    const setting = await db.System_Settings.findOne({
      where: { key: "ATOAPP" },
    });
    if (!setting || setting.value !== "true") {
      return;
    }

    const product = await db.Product_model.findAll({
      where: {
        chain_status: "pending",
      },
      limit: 5,
      order: [["createdAt", "ASC"]],
    });

    if (!product) {
      console.log("Product not found for auto-approval:", product_id);
      return;
    }
    product.approval_status = "approved";
    await product.save();
    console.log("Product auto-approved:", product_id);
  } catch (error) {
    console.error("Error in auto-approving product:", error);
  }
};

const createRawProduct = (db) => async (req, res) => {
  try {
    const { id, author, responsible_person, category_id } = req.body;
    if (!id || !author || !responsible_person || !category_id) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu đầu vào",
        RC: -203,
      });
    }
    const raw_product = {
      id: "",
      author: "",
      responsible_person: "",
      category_id: "",
    };
    raw_product.responsible_person = await db.Actor_model.findOne({
      where: { id: responsible_person },
      attributes: ["id", "name", "role", "email", "phone_number"],
    });
    if (!raw_product.responsible_person) {
      return res.status(200).json({
        RM: "Người phụ trách không tồn tại!",
        RC: -204,
      });
    }

    switch (raw_product.responsible_person.role) {
      case "manufacturer":
        raw_product.author = await db.Manufacturer.findOne({
          where: { id: author },
        });
        break;
      case "distributor":
        raw_product.author = await db.Distributor.findOne({
          where: { id: author },
        });
        break;
      case "retailer":
        raw_product.author = await db.Retailer.findOne({
          where: { id: author },
        });
        break;
      default:
        return res.status(200).json({
          RM: "Vai trò người dùng không hợp lệ !",
          RC: -205,
        });
    }

    if (!raw_product.author) {
      return res.status(200).json({
        RM: "Tác giả không tồn tại!",
        RC: -206,
      });
    }

    raw_product.id = await db.Product.findOne({ where: { id: id } });
    if (!raw_product.id) {
      return res.status(200).json({
        RM: "Sản phẩm không tồn tại!",
        RC: -207,
      });
    }

    raw_product.category_id = await db.Product_category.findOne({
      where: { id: category_id },
    });
    if (!raw_product.category_id) {
      return res.status(200).json({
        RM: "Danh mục không tồn tại!",
        RC: -208,
      });
    }

    return res.status(200).json({
      RM: "Lấy thông tin sản phẩm thô thành công!",
      RC: 200,
      RD: raw_product,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const dropProductBlock = async (db, block_id, type) => {
  try {
    const blockRecord = await db.Product.findOne({
      where: { id: block_id },
    });

    if (!blockRecord) {
      return res.status(404).json({
        RM: "Block record not found",
        RC: -204,
      });
    }
    await blockRecord.update({ chain_status: "wait-droped" });
    return true;
  } catch (error) {
    console.error("Error dropping product block:", error);
    return false;
  }
};

const dropUserBlock = (db) => async (req, res) => {
  try {
    const { block_id, type } = req.params;
    if (!block_id) {
      return res.status(400).json({
        RM: "Missing block_id parameter",
        RC: -203,
      });
    }

    switch (type) {
      case "product":
        const dropResult = await dropProductBlock(db, block_id, type);
        if (!dropResult) {
          return res.status(500).json({
            RM: "Failed to drop product block",
            RC: -205,
          });
        }
        return res.status(200).json({
          RM: "Product block drop initiated successfully",
          RC: 200,
        });
        break;
      default:
        return res.status(400).json({
          RM: "Invalid block type",
          RC: -202,
        });
    }
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

export default {
  dropUserBlock,
  createRawProduct,
  getMe,
  user_setup_login,
  RegisterActive,
  genPublickey,
  checkUserOTP,
  createCategories,
  getCategories,
  get_user_actor,
  AdminLoginActive,
  createAdminOTP,
  verifyAdminOTP,
  create_pending_profile,
  userLogin,
  userLogout,
  mailResendPendingUser,
  getAllSettings,
  updateSetting,
  createSetting,
};
