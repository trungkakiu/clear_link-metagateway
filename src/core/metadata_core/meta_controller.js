import axios from "axios";
import bcrypt from "bcrypt";
import db from "../../models/metadatabase/index.js";
import JwtAction from "../../utils/JwtAction.js";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import Helper__funtion from "../../utils/Helper__funtion.js";
import pkg from "elliptic";
import pair_validate from "../../core_API/pair_validate.js";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import fs from "fs";
import { fileURLToPath } from "url";
import path, { join } from "path";
import { Op, where } from "sequelize";
import { pendingRequests } from "../../../meta_server.js";
import { raw } from "express";
import meta_core_controller from "./meta_core_controller.js";
import NotificationService from "./NotificationService.js";

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

    const user_agent = req.headers["user-agent"] || "Unknown-Browser";
    const newSessionId = uuidv4();

    await user.update({
      User_agent: user_agent,
      Session_id: newSessionId,
    });

    const token = await JwtAction.JwtSign({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      User_agent: user_agent,
      session_id: newSessionId,
    });

    delete user.password;
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone_number: user.phone_number,
      avatar: user.avatar,
      role: user.role,
      session_id: newSessionId,
    };

    return res.status(200).json({
      RM: "Login successfully!",
      RC: 200,
      RD: {
        Admin: userData,
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

    console.log(session.challenge_code, " and ", session.status);

    return res.status(200).json({
      RM: "PIN verified successfully",
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
    console.log;
    if (!email || !password) {
      return res
        .status(200)
        .json({ RM: "Missing login parameters!", RC: -203 });
    }

    let user = null;
    const user_agent = req.headers["user-agent"] || "Unknown-Browser";

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

    const newSessionId = uuidv4();

    await db.Actor_model.update(
      { Session_id: newSessionId, User_agent: user_agent },
      { where: { id: user.id } },
    );
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
        fcm_token: user.fcm_token,
        prime: user.is_prime,
        phone_number: user.phone_number,
        company_id: company?.Company_id || "null",
        level: company?.role_level || "null",
        session_id: newSessionId,
        User_agent: user_agent,
      });
    } catch (err) {
      console.log("Lỗi tạo JWT:", err);
      return res.status(500).json({
        RM: "Token creation error",
        RC: 500,
      });
    }

    const userData = {
      ...(user.toJSON ? user.toJSON() : user),
      level: company?.role_level || "null",
      company_id: company?.Company_id,
    };

    delete userData.password;

    return res.status(200).json({
      RM: "Login successfully!",
      RC: 200,
      RD: {
        Otp: Boolean(user.public_key !== "null"),
        User: userData,
        Token: token,
        Session_id: newSessionId,
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
    "location",
    "address_detail",
    "lat",
    "lng",
    "contact_person",
    "contact_phone",
  ],

  Distributor: [
    "company_name",
    "license_number",
    "location",
    "address_detail",
    "lat",
    "lng",
    "delivery_capacity",
    "contact_person",
    "contact_number",
  ],

  Manufacturer: [
    "factory_name",
    "license_number",
    "location",
    "address_detail",
    "lat",
    "lng",
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
            company_name: data.factory_name,
            license_number: data.license_number,
            tax_code: data.tax_code,
            location: data.location,
            production_capacity: data.production_capacity,
            certifications: data.certifications,
            contact_person: data.contact_person,
            contact_phone: data.contact_phone,
            location: data.location,
            address_detail: data.address_detail,
            longitude: data.lng,
            latitude: data.lat,
            status: "pending",
          });
          user.role = "manufacturer";
        }

        if (role === "Retailer") {
          const newId = await generateUniqueCode(db, "Retailer", "id");
          company = await db.Retailer.create({
            id: newId,
            actor_id: req.user.id,
            company_name: data.store_name,
            store_address: data.store_address,
            branch_count: data.branch_count,
            product_lines: data.product_lines,
            contact_person: data.contact_person,
            contact_phone: data.contact_phone,
            location: data.location,
            address_detail: data.address_detail,
            longitude: data.lng,
            latitude: data.lat,
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
            location: data.location,
            address_detail: data.address_detail,
            longitude: data.lng,
            latitude: data.lat,
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
            delivery_capacity: data.delivery_capacity,
            contact_person: data.contact_person,
            contact_number: data.contact_number,
            location: data.location,
            address_detail: data.address_detail,
            longitude: data.lng,
            latitude: data.lat,
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
        session_id: user.Session_id,
        User_agent: user.User_agent,
        role: user.role,
        phone_number: user.phone_number,
        fcm_token: user.fcm_token,
        company_id: company?.Company_id,
        level: company?.role_level || "null",
      });

      const userData = {
        ...(user.toJSON ? user.toJSON() : user),
        level: company?.role_level || "null",
        company_id: company?.Company_id,
      };
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
    const { company_id } = req?.user;

    if (!company_id) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu đầu vào",
        RC: -203,
      });
    }

    const categories = await db.Product_category.findAll({
      where: { author: company_id },
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
    const { company_id } = req?.user;
    const { name, description, status } = req?.body;
    if (!company_id || !name || !status) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu đầu vào",
        RC: -203,
      });
    }

    const is_exists = await db.Product_category.findOne({
      where: {
        cate_name: name,
        author: company_id,
      },
    });

    if (is_exists) {
      return res.status(200).json({
        RM: "Danh mục đã tồn tại!",
        RC: -201,
      });
    }
    let CateID;
    do {
      CateID = Helper__funtion.genId("CATEGORY_");
    } while (
      await Helper__funtion.validCheckID(CateID, db.Product_category, "id")
    );
    const cate = await db.Product_category.create({
      id: CateID,
      cate_name: name,
      author: company_id,
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
    console.log("call====");
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

const changeActiveCate = (db) => async (req, res) => {
  try {
    const { cate_id } = req.params;
    if (!cate_id) {
      return res.status(200).json({
        RM: "Thiếu dữ liệu!",
        RC: 203,
      });
    }

    const cate = await db.Product_category.findByPk(cate_id);
    if (!cate) {
      return res.status(400).json({
        RM: "Danh mục không tồn tại!",
        RC: 400,
      });
    }

    await cate.update({
      active: !cate.active,
    });

    return res.status(200).json({
      RM: "Done!",
      RC: 200,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};
const getDepartment = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    const department_list = await db.Department.findAll({
      where: {
        company_id: company_id,
      },
      include: [
        {
          model: db.ProductionStaff,
          as: "leader",
          include: [
            {
              model: db.Actor_model,
              as: "actor_info",
              attributes: [
                "id",
                "name",
                "email",
                "phone_number",
                "role",
                "address_1",
                "avatar",
                "status",
              ],
            },
          ],
        },
      ],
    });

    if (!department_list) {
      return res.status(200).json({
        RM: "Part null",
        RC: 200,
      });
    }
    const staff_list = await db.ProductionStaff.findAll({
      where: {
        Company_id: company_id,
        status: {
          [Op.ne]: "quit_job",
        },
      },
      include: [
        {
          model: db.Actor_model,
          as: "actor_info",
          attributes: [
            "id",
            "name",
            "email",
            "phone_number",
            "role",
            "address_1",
            "avatar",
            "status",
          ],
        },
      ],
    });

    return res.status(200).json({
      RM: "Done",
      RC: 200,
      RD: { department_list, staff_list },
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const createDepartment = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    const { role_level, partname, isExcute, isRead, part } = req.body;

    if (
      !company_id ||
      !role_level ||
      !partname ||
      isExcute == null ||
      isRead === null ||
      !part
    ) {
      return res.status(200).json({
        RM: "missing paramater!",
        RC: 203,
      });
    }

    let depart_id;
    do {
      depart_id = Helper__funtion.genId("DEPARTMENT_");
    } while (
      await Helper__funtion.validCheckID(depart_id, db.Department, "id")
    );

    await db.Department.create({
      id: depart_id,
      role_level,
      partname,
      isExcute,
      isRead,
      part,
      Company_id: company_id,
    });

    return res.status(200).json({
      RM: "Tạo bộ phận thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const editDepartment = (db) => async (req, res) => {
  try {
    const { part_id } = req.params;
    const { isExcute, isRead, partname, role_level, active } = req.body.form;

    if (!part_id) {
      return res.status(400).json({
        RM: "Thiếu dữ liệu!",
        RC: 203,
      });
    }

    const Part = await db.Department.findByPk(part_id);
    if (!Part) {
      return res.status(404).json({
        RM: "Không tìm thấy bộ phận này!",
        RC: 404,
      });
    }

    await Part.update({
      isExcute: typeof isExcute === "boolean" ? isExcute : Part.isExcute,
      active: typeof active === "boolean" ? active : Part.active,
      isRead: typeof isRead === "boolean" ? isRead : Part.isRead,

      partname:
        typeof partname === "string" && partname.trim()
          ? partname.trim()
          : Part.partname,

      role_level: typeof role_level === "string" ? role_level : Part.role_level,
    });

    return res.status(200).json({
      RM: "Thay đổi thông tin thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getTechnicaltaff = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res.status(200).json({
        RM: "Thiếu thông tin công ty!",
        RC: 203,
      });
    }
    const department_list = await db.Department.findAll({
      where: {
        Company_id: company_id,
        active: true,
        part: "technical",
      },
    });
    const stafflist = await db.ProductionStaff.findAll({
      where: {
        role: "technical",
        Company_id: company_id,
      },
      include: [
        {
          model: db.Department,
          as: "department",
        },
        {
          model: db.Actor_model,
          as: "actor_info",
          required: false,
          attributes: [
            "id",
            "name",
            "email",
            "phone_number",
            "role",
            "address_1",
            "avatar",
            "status",
          ],
        },
      ],
    });

    return res.status(200).json({
      RM: "Thông tin bộ phận!",
      RC: 200,
      RD: { stafflist, department_list },
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const QR_batchverify = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { company_id, id } = req?.user;

    const { QR_code, secure_token, latitude, longitude } = req?.body;

    if (!QR_code || !secure_token) {
      return res
        .status(400)
        .json({ RM: "Thiếu mã định danh hoặc mã bảo mật!", RC: -203 });
    }

    if (!latitude || !longitude) {
      return res.status(400).json({
        RM: "Thiếu tọa độ!",
        RC: -203,
      });
    }

    const QR = await db.QrRegistry.findOne({
      where: {
        id: QR_code,
        secure_token: secure_token,
      },
      transaction,
    });

    if (!QR) {
      await transaction.rollback();
      return res.status(200).json({
        RM: "Mã QR không hợp lệ, sai mã bảo mật hoặc đã được kích hoạt trước đó!",
        RC: -204,
      });
    }

    if (QR.status === "verified") {
      await transaction.rollback();
      return res.status(200).json({
        RM: "Mã QR đã được xác thực trước đó!",
        RC: -205,
      });
    }

    if (QR.print_status !== "printed") {
      await transaction.rollback();
      return res.status(200).json({
        RM: "Mã QR chưa được in ấn, không thể xác thực!",
        RC: -206,
      });
    }

    const batch = await db.product_batch.findOne({
      where: { id: QR.target_id },
      include: [
        {
          model: db.shipping_order,
          as: "Order_batches",
        },
      ],
      transaction,
    });

    const allbatch = await db.product_batch.findAll({
      where: { shipping_order_id: batch.shipping_order_id },
      transaction,
    });

    const allBox = allbatch.reduce((sum, item) => sum + item.total_box, 0);

    if (!batch) {
      await transaction.rollback();
      return res
        .status(200)
        .json({ RM: "Dữ liệu lô hàng liên kết không tồn tại!", RC: -205 });
    }

    await QR.update(
      {
        status: "verified",
        Actor_scaned: id,
        blockchain_proof:
          latitude && longitude
            ? `LAT:${latitude}|LONG:${longitude}`
            : QR.blockchain_proof,
      },
      { transaction },
    );

    const total_verify = await db.QrRegistry.findOne({
      where: {
        target_id: batch?.id,
      },
      transaction,
    });

    if (total_verify?.length === allBox) {
      batch.update({
        Shiping_status: "ready",
      });

      const isReady = await meta_core_controller.updateShipingStatus(db)(
        batch.shipping_order_id,
      );

      if (isReady) {
        await db.Notification.create({
          Owner_id: batch.Order_batches.shipping_partner,
          isSystemNotification: false,
          noitfi_level: 4,
          status: "seen",
          message: `Đơn vận chuyển ${batch.shipping_order_id} đã sẵn sàng để vận chuyển!`,
        });
      }

      await NotificationService.sendSmartNotification(
        batch.Order_batches.shipping_partner,
        "transporter",
        `Đơn vận chuyển ${batch.shipping_order_id} đã sẵn sàng để vận chuyển!`,
        [],
        "order_ready",
        "level_4",
      );
    }

    await transaction.commit();

    return res.status(200).json({
      RM: "Xác thực định danh thành công!",
      RC: 200,
      RD: {
        batch_id: batch.id,
        qr_id: QR.id,
        status: "verified",
        timestamp: new Date(),
      },
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error(">>> QR Verify Error:", error);
    return res
      .status(500)
      .json({ RM: "Lỗi máy chủ khi xử lý mã QR!", RC: 500 });
  }
};

const getProductionstaff = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res.status(200).json({
        RM: "missing paramater!",
        RC: 203,
      });
    }
    const department_list = await db.Department.findAll({
      where: {
        Company_id: company_id,
        active: true,
        part: "production",
      },
    });
    const stafflist = await db.ProductionStaff.findAll({
      where: {
        role: "production",
        Company_id: company_id,
      },
      include: [
        {
          model: db.Department,
          as: "department",
        },
        {
          model: db.Actor_model,
          as: "actor_info",
          required: false,
          attributes: [
            "id",
            "name",
            "email",
            "phone_number",
            "role",
            "address_1",
            "avatar",
            "status",
          ],
        },
      ],
    });

    return res.status(200).json({
      RM: "Thông tin bộ phận!",
      RC: 200,
      RD: { stafflist, department_list },
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const getstaff = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;

    if (!company_id) {
      return res.status(200).json({
        RM: "missing paramater!",
        RC: 203,
      });
    }
    const department_list = await db.Department.findAll({
      where: {
        Company_id: company_id,
        active: true,
      },
    });
    const stafflist = await db.ProductionStaff.findAll({
      where: {
        Company_id: company_id,
      },
      include: [
        {
          model: db.Department,
          as: "department",
        },
        {
          model: db.Actor_model,
          as: "actor_info",
          required: false,
          attributes: [
            "id",
            "name",
            "email",
            "phone_number",
            "role",
            "address_1",
            "avatar",
            "status",
          ],
        },
      ],
    });

    return res.status(200).json({
      RM: "Thông tin bộ phận!",
      RC: 200,
      RD: { stafflist, department_list },
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const createProductionStaff = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { company_id, role } = req.user;

    const {
      name,
      email,
      phone_number,
      CCCD,
      banking_code,
      staff_role,
      banking_brand,
      status,
      hasAccount,
      level,
      ltpCode,
      password,
      address_1,
    } = req.body.form;

    const missingFields = [];
    if (!company_id) missingFields.push("ID Công ty");
    if (!name) missingFields.push("Họ tên");
    if (!email) missingFields.push("Email");
    if (!phone_number) missingFields.push("Số điện thoại");
    if (!address_1) missingFields.push("Địa chỉ");
    if (!CCCD) missingFields.push("CCCD");

    if (missingFields.length > 0) {
      await t.rollback();
      return res.status(200).json({
        RM: `Thiếu thông tin bắt buộc: ${missingFields.join(", ")}`,
        RC: 2203,
      });
    }

    let staffId;
    do {
      staffId = Helper__funtion.genId("PRODUCTION_");
    } while (
      await Helper__funtion.validCheckID(staffId, db.ProductionStaff, "id")
    );

    if (hasAccount) {
      if (!ltpCode || !password || !role) {
        await t.rollback();
        return res
          .status(200)
          .json({ RM: "Thiếu thông tin tài khoản!", RC: 203 });
      }

      const existingUser = await db.Actor_model.findOne({
        where: { [Op.or]: [{ email }, { phone_number: phone_number }] },
        transaction: t,
      });

      if (existingUser) {
        await t.rollback();
        return res
          .status(200)
          .json({ RM: "Email hoặc số điện thoại đã tồn tại!", RC: 204 });
      }

      const privateKey = crypto
        .createHash("sha256")
        .update(ltpCode)
        .digest("hex");
      const keyPair = EC.keyFromPrivate(privateKey);
      const publicKey = keyPair.getPublic("hex");

      const newUser = await db.Actor_model.create(
        {
          id: staffId,
          name,
          email,
          address_1,
          public_key: publicKey,
          personal_tax_code: CCCD,
          role: role,
          role_active: "active",
          phone_number: phone_number,
          password: await bcrypt.hash(password, 10),
          status: "pending",
        },
        { transaction: t },
      );

      let CALevel;
      do {
        CALevel = Helper__funtion.genId("PRODUCTION_");
      } while (
        await Helper__funtion.validCheckID(
          CALevel,
          db.Company_account_level,
          "id",
        )
      );
      await db.Company_account_level.create(
        {
          id: CALevel,
          Actor_id: newUser.id,
          Company_id: company_id,
          level: level,
        },
        { transaction: t },
      );

      await db.ProductionStaff.create(
        {
          id: staffId,
          name,
          email,
          Company_id: company_id,
          role: staff_role,
          phonenumber: phone_number,
          address: address_1,
          CCCD,
          banking_code,
          banking_brand,
          status: "pending",
        },
        { transaction: t },
      );

      const auto_approve = await db.System_Settings.findOne({
        where: { key: "auto_approve_user" },
        transaction: t,
      });

      if (auto_approve && auto_approve.value === "true") {
        const result = await pair_validate.process_user_block(
          db,
          nodes,
          pendingRequests,
        )(newUser.id);
        if (result.ok) {
          await newUser.update({ status: "active" }, { transaction: t });
        }
      }
    }

    await t.commit();
    return res.status(200).json({ RM: "Thêm nhân viên thành công!", RC: 200 });
  } catch (error) {
    await t.rollback();
    console.error(error);
    return res.status(500).json({ RM: "Internal server error!", RC: 500 });
  }
};

const createTechnicaltaff = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const {
      name,
      email,
      phonenumber,
      address,
      CCCD,
      banking_code,
      banking_brand,
      status,
    } = req.body.form;

    if (
      !company_id ||
      !name ||
      !email ||
      !phonenumber ||
      !address ||
      !CCCD ||
      !banking_brand ||
      !banking_code
    ) {
      return res.status(200).json({
        RM: "missing paramater!",
        RC: 203,
      });
    }

    let staffId;
    do {
      staffId = Helper__funtion.genId("TECHNICAL_");
    } while (
      await Helper__funtion.validCheckID(staffId, db.ProductionStaff, "id")
    );
    await db.ProductionStaff.create({
      id: staffId,
      name,
      email,
      role: "technical",
      phonenumber,
      Company_id: company_id,
      address,
      CCCD,
      banking_code,
      banking_brand,
      status,
    });

    return res.status(200).json({
      RM: "Thêm nhân viên thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};
const changestaffpartment = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const { staff_id } = req.params;
    const { partmentid } = req.body;

    if (!company_id || !staff_id || !partmentid) {
      return res.status(200).json({
        RM: "missing paramater!",
        RC: 203,
      });
    }
    const staff = await db.ProductionStaff.findByPk(staff_id);
    const leaderDepartment = await db.Department.findOne({
      where: {
        leader_id: staff.id,
        Company_id: company_id,
      },
    });

    if (leaderDepartment) {
      return res.status(400).json({
        RM: "Không thể thay đổi bộ phận vì nhân viên đang là leader!",
        RC: 205,
      });
    }

    const partment = await db.Department.findByPk(partmentid);

    if (!partment) {
      return res.status(400).json({
        RM: "không tìm thấy bộ phận mục tiêu!",
        RC: 404,
      });
    }

    if (!staff) {
      return res.status(400).json({
        RM: "không tìm thấy bộ phận!",
        RC: 404,
      });
    }

    if (!staff) {
      return res.status(400).json({
        RM: "không tìm thấy nhân viên!",
        RC: 203,
      });
    }

    await staff.update({
      department_id: partmentid,
    });

    return res.status(200).json({
      RM: "Thay đổi bộ phận thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const uploadstaffcard = (db) => async (req, res) => {
  try {
    const STAFF_CARD_DIR = path.join(process.cwd(), process.env.STAFF_CARD_URL);
    const { staff_id } = req?.params;

    if (!staff_id) {
      meta_core_controller.cleanupUploadedFiles(filecard);
      return res.status(400).json({
        RM: "Lỗi thêm ảnh, thiếu dữ liệu!",
        RC: 203,
      });
    }
    const filecard = req.files?.staff_card;

    if (!filecard || filecard.length === 0) {
      meta_core_controller.cleanupUploadedFiles(filecard);
      return res.status(400).json({
        RM: "Lỗi thêm ảnh, thiếu file!",
        RC: 203,
      });
    }

    const file = filecard[0];
    const staff = await db.ProductionStaff.findByPk(staff_id);

    if (!staff) {
      meta_core_controller.cleanupUploadedFiles(filecard);
      return res.status(400).json({
        RM: "Lỗi thêm ảnh, không tìm thấy người dùng!",
        RC: 203,
      });
    }

    if (staff.actor_id) {
      const actor = await db.Actor_model.findByPk(staff.actor_id);
      if (!actor) {
        meta_core_controller.cleanupUploadedFiles(filecard);
        return res.status(400).json({
          RM: "Lỗi thêm ảnh, không tìm thấy người dùng!",
          RC: 203,
        });
      }

      actor.avatar = file.filename;
      await actor.save();

      return res.status(200).json({
        RC: 200,
        RM: "Upload thành công",
        RD: {
          filename: file.filename,
          path: file.path,
        },
      });
    }
    if (staff.avatar) {
      Helper__funtion.removeOldAvatar(staff.avatar, STAFF_CARD_DIR);
    }

    await staff.update({
      avatar: file.filename,
    });

    return res.status(200).json({
      RC: 200,
      RM: "Upload thành công",
      RD: {
        filename: file.filename,
        path: file.path,
      },
    });
  } catch (error) {
    console.error(error);
    const filecard = req.files?.staff_card;
    meta_core_controller.cleanupUploadedFiles(filecard);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};

const newLeaderDepartment = (db) => async (req, res) => {
  try {
    const { company_id } = req.user;
    const { department_id } = req.params;
    const { staff_id } = req.body;

    if (!company_id || !staff_id || !department_id) {
      return res.status(200).json({
        RM: "missing paramater!",
        RC: 203,
      });
    }

    const staff = await db.ProductionStaff.findByPk(staff_id);

    if (!staff) {
      return res.status(400).json({
        RM: "không tìm thấy nhân viên!",
        RC: 203,
      });
    }

    const department = await db.Department.findByPk(department_id);
    if (!department) {
      return res.status(400).json({
        RM: "không tìm thấy bộ phận!",
        RC: 203,
      });
    }

    if (!staff.department_id) {
      await staff.update({
        department_id,
      });
      await department.update({
        leader_id: staff.id,
      });
    } else {
      if (staff.department_id !== department_id) {
        return res.status(400).json({
          RM: "Nhân viên không thuộc bộ phận này!",
          RC: 205,
        });
      }

      await department.update({
        leader_id: staff.id,
      });
    }

    return res.status(200).json({
      RM: "Thay đổi leader thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return res.status(500).json({
      RM: "Internal server error!",
      RC: 500,
    });
  }
};
const user_edit_profile = (db) => async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { id } = req.user;
    const { name, phone_number, personal_tax_code, address_1, address_2 } =
      req.body.formData;

    const user = await db.Actor_model.findByPk(id, { transaction: t });
    if (!user) {
      await t.rollback();
      return res.status(404).json({ RC: 404, RM: "Người dùng không tồn tại!" });
    }
    const updatedData = {
      name: name || user.name,
      phone_number: phone_number || user.phone_number,
      personal_tax_code:
        personal_tax_code !== undefined
          ? personal_tax_code
          : user.personal_tax_code,
      address_1: address_1 !== undefined ? address_1 : user.address_1,
      address_2: address_2 !== undefined ? address_2 : user.address_2,
    };

    console.log(updatedData);

    await user.update(updatedData, { transaction: t });

    await t.commit();
    return res.status(200).json({
      RC: 200,
      RM: "Cập nhật thông tin thành công!",
      RD: updatedData,
    });
  } catch (error) {
    if (t) await t.rollback();
    console.error("Update Profile Error:", error);
    return res.status(500).json({
      RC: 500,
      RM: "Lỗi hệ thống khi cập nhật hồ sơ!",
    });
  }
};

const CompanyProfile = (db) => async (req, res) => {
  try {
    const { company_id, id, role } = req?.user || {};

    if (!company_id || !id || !role) {
      return res.status(400).json({
        RM: "Thiếu thông tin định danh hoặc vai trò người dùng!",
        RC: -203,
      });
    }
    const ROLE_MAP = {
      manufacturer: "Manufacturer",
      distributor: "Distributor",
      retailer: "Retailer",
      transporter: "Transporter",
    };

    const modelName = ROLE_MAP[role.toLowerCase()];

    if (!modelName || !db[modelName]) {
      return res.status(404).json({
        RM: "Loại hình doanh nghiệp không hợp lệ!",
        RC: -404,
      });
    }

    const company_info = await db[modelName].findByPk(company_id);

    if (!company_info) {
      return res.status(404).json({
        RM: "Không tìm thấy thông tin doanh nghiệp!",
        RC: -404,
      });
    }

    return res.status(200).json({
      RM: "Lấy thông tin doanh nghiệp thành công!",
      RC: 200,
      RD: company_info,
    });
  } catch (error) {
    console.error("Fetch Company Profile Error:", error);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi tải hồ sơ doanh nghiệp!",
      RC: 500,
    });
  }
};

const editCompany = (db) => async (req, res) => {
  try {
    const { company_id, role } = req?.user || {};

    const LOGO_DIR = path.join(
      process.cwd(),
      process.env.COMPANY_LOGO_URL || "public/images/company",
    );

    if (!company_id || !role) {
      if (req.files?.logo)
        meta_core_controller.cleanupUploadedFiles(req.files.logo);
      return res.status(400).json({
        RM: "Thiếu thông tin định danh người dùng!",
        RC: -203,
      });
    }

    const ROLE_MAP = {
      manufacturer: "Manufacturer",
      distributor: "Distributor",
      retailer: "Retailer",
      transporter: "Transporter",
    };

    const modelName = ROLE_MAP[role.toLowerCase()];
    if (!modelName || !db[modelName]) {
      if (req.files?.logo)
        meta_core_controller.cleanupUploadedFiles(req.files.logo);
      return res
        .status(404)
        .json({ RM: "Loại hình doanh nghiệp không hợp lệ!", RC: -404 });
    }

    const updateData = { ...req.body };
    const logoFile = req.file ? req.file : null;

    const company = await db[modelName].findByPk(company_id);
    if (!company) {
      if (logoFile) meta_core_controller.cleanupUploadedFiles(req.files.logo);
      return res
        .status(404)
        .json({ RM: "Không tìm thấy doanh nghiệp!", RC: -404 });
    }
    if (logoFile) {
      if (company.logo) {
        Helper__funtion.removeOldAvatar(company.logo, LOGO_DIR);
      }
      updateData.logo = logoFile.filename;
    }

    await company.update(updateData);

    return res.status(200).json({
      RC: 200,
      RM: "Cập nhật thông tin doanh nghiệp thành công!",
      RD: company,
    });
  } catch (error) {
    console.error("Edit Company Error:", error);
    if (req.files?.logo)
      meta_core_controller.cleanupUploadedFiles(req.files.logo);
    return res.status(500).json({
      RM: "Lỗi hệ thống khi cập nhật hồ sơ!",
      RC: 500,
    });
  }
};

const get_batch_detail = (db) => async (req, res) => {
  try {
    const { batch_id } = req.params;
    const { company_id } = req.user;

    if (!batch_id || !company_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh!", RC: -203 });
    }

    const batch = await db.product_batch.findOne({
      where: { id: batch_id },
      include: [
        {
          model: db.Product,
          as: "product",
          attributes: ["name", "main_cardimage"],
        },
        { model: db.Department, as: "Department", attributes: ["partname"] },
      ],
    });

    if (!batch) {
      return res.status(404).json({ RM: "Không tìm thấy lô hàng!", RC: 404 });
    }

    if (batch.author !== company_id) {
      const isPartner = await db.Company_Collaboration.findOne({
        where: {
          status: "official",
          [Op.or]: [
            {
              [Op.and]: [
                { sender_id: company_id },
                { receiver_id: batch.author },
              ],
            },
            {
              [Op.and]: [
                { sender_id: batch.author },
                { receiver_id: company_id },
              ],
            },
          ],
        },
      });

      if (!isPartner) {
        return res.status(403).json({
          RM: "Bạn không có quyền xem thông tin lô hàng này!",
          RC: 403,
        });
      }
    }

    return res.status(200).json({
      RC: 200,
      RM: "Lấy thông tin lô hàng thành công",
      RD: batch,
    });
  } catch (error) {
    console.error("Get Batch Detail Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const getValidVehicle = (db) => async (req, res) => {
  try {
    const { company_id } = req?.user;
    if (!company_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh!", RC: -203 });
    }

    const vehicles = await db.Vehicle.findAll({
      where: {
        owner_id: company_id,
        order_now: "none",
        driver_id: {
          [Op.ne]: null,
        },
      },
    });

    return res.status(200).json({
      RC: 200,
      RM: "Lấy thông tin xe thành công",
      RD: vehicles,
    });
  } catch (error) {
    console.error("Get Batch Detail Error:", error);
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const createQRBatch = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();
  try {
    const { company_id, id } = req?.user;
    const { target_id } = req?.body;
    if (!company_id || !target_id) {
      return res
        .status(400)
        .json({ RM: "Thiếu thông tin định danh!", RC: -203 });
    }

    const batch = await db.product_batch.findByPk(target_id);

    if (!batch) {
      return res.status(404).json({ RM: "Không tìm thấy lô hàng!", RC: 404 });
    }

    if (batch.author !== company_id) {
      return res.status(403).json({
        RM: "Bạn không có quyền tạo QR cho lô hàng này!",
        RC: 403,
      });
    }

    if (batch.total_box <= 0) {
      return res.status(400).json({
        RM: "Lô hàng không có số lượng thùng hợp lệ để tạo QR!",
        RC: 400,
      });
    }
    const qrEntries = [];
    for (let i = 0; i < (batch.total_box || 1); i++) {
      const secure_token = crypto.randomBytes(16).toString("hex");

      qrEntries.push({
        id: `QR_${Date.now()}_${i}`,
        Author: company_id,
        Actor_created: id,
        target_id: batch.id,
        target_type: "BATCH",
        secure_token: secure_token,
        print_status: "pending",
        status: "pending",
        blockchain_proof: `BOX_INDEX_${i + 1}`,
      });
    }

    await db.QrRegistry.bulkCreate(qrEntries, { transaction });
    await transaction.commit();
    return res.status(200).json({
      RM: "Tạo mã QR cho lô hàng thành công!",
      RC: 200,
    });
  } catch (error) {
    console.error("Create QR Batch Error:", error);
    if (transaction) await transaction.rollback();
    return res.status(500).json({ RM: "Lỗi hệ thống!", RC: 500 });
  }
};

const printedQRBatch = (db) => async (req, res) => {
  const transaction = await db.sequelize.transaction();

  try {
    const { company_id, id: user_id } = req?.user;
    const { Qrids } = req?.body;

    if (!company_id || !Qrids || !Array.isArray(Qrids) || Qrids.length === 0) {
      return res
        .status(400)
        .json({ RM: "Dữ liệu đầu vào không hợp lệ!", RC: -203 });
    }

    const qrs = await db.QrRegistry.findAll({
      where: {
        id: { [Op.in]: Qrids },
        Author: company_id,
      },
      transaction,
    });

    if (qrs.length !== Qrids.length) {
      await transaction.rollback();
      return res.status(404).json({
        RM: "Phát hiện mã QR không hợp lệ hoặc không thuộc quyền quản lý của bạn!",
        RC: 404,
      });
    }

    await db.QrRegistry.update(
      {
        print_status: "printed",
        print_count: db.sequelize.literal("print_count + 1"),
      },
      {
        where: { id: { [Op.in]: Qrids } },
        transaction,
      },
    );

    await transaction.commit();

    return res.status(200).json({
      RM: `Đã xác nhận in thành công ${Qrids.length} nhãn định danh!`,
      RC: 200,
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error("Print QR Batch Professional Error:", error);
    return res
      .status(500)
      .json({ RM: "Lỗi hệ thống khi chốt lệnh in!", RC: 500 });
  }
};

export default {
  getValidVehicle,
  printedQRBatch,
  createQRBatch,
  user_edit_profile,
  editCompany,
  get_batch_detail,
  CompanyProfile,
  newLeaderDepartment,
  getProductionstaff,
  uploadstaffcard,
  changestaffpartment,
  createTechnicaltaff,
  getTechnicaltaff,
  createProductionStaff,
  editDepartment,
  createDepartment,
  dropUserBlock,
  getDepartment,
  changeActiveCate,
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
  getstaff,
  userLogout,
  mailResendPendingUser,
  getAllSettings,
  updateSetting,
  QR_batchverify,
  createSetting,
};
