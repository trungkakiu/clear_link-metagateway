import { generateKeyPairSync } from "crypto";
import { writeFileSync } from "fs";

// Tạo cặp khóa RSA 2048-bit
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

// Xuất PEM
const privatePem = privateKey.export({ type: "pkcs1", format: "pem" });
const publicPem = publicKey.export({ type: "spki", format: "pem" });

// Ghi ra file
writeFileSync("node_private.pem", privatePem);
writeFileSync("node_public.pem", publicPem);

console.log("Đã tạo key thành công:");
console.log(" - node_private.pem");
console.log(" - node_public.pem");
