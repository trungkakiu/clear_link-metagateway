import dotenv from "dotenv";
dotenv.config();

const cors_setting = () => {
  return {
    origin: ["http://localhost:3010", "http://localhost:3012"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  };
};

export default {
  cors_setting,
};
