import jwt, { decode } from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const JwtSign = async (data) => {
  const key = process.env.JWT_SECRET || "supersecretkey12doto3";
  const expires = process.env.JWT_EXPIRE || "3h";

  if (!data || typeof data !== "object") {
    console.error("[JwtSign] Invalid payload");
    return null;
  }

  const { Password, password, __v, createdAt, updatedAt, ...rest } = data;

  const safeData = {
    ...rest,
    token_created_at: Math.floor(Date.now() / 1000),
  };

  try {
    const token = jwt.sign(safeData, key, {
      expiresIn: expires,
    });
    return token;
  } catch (error) {
    console.error("[JwtSign] Error signing token:", error.message);
    return null;
  }
};

const decoded = (token) => {
  const key = process.env.JWT_SECRET || "supersecretkey12doto3";
  try {
    if (token) {
      const decoded = jwt.verify(token, key);
      if (!decoded) {
        console.error("Token verification failed");
        return null;
      }
      return decoded;
    }
  } catch (error) {
    console.error("Error verifying token:", error);
    return null;
  }
};
export default { JwtSign, decode, decoded };
