import express from "express";
import { pendingRequests } from "../../meta_server.js";
import crypto from "crypto";

const genId = (root = "") => {
  const randomDigits = Math.floor(
    100000000 + Math.random() * 900000000,
  ).toString();

  return `${root}${randomDigits}`;
};

const validCheckID = (id, model, option_column) => {
  return model.findOne({ where: { [option_column]: id } });
};

const waitRpc = async (requestId, timeoutMs = 10000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      resolve({ timeout: true });
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, timer });
  });

export const RouteGroup = (parent, middlewares = [], callback) => {
  const router = express.Router();

  if (middlewares.length > 0) {
    router.use(...middlewares);
  }

  callback(router);

  parent.use(router);
};

function publicKeyFromDb(pemString) {
  if (typeof pemString !== "string") {
    throw new Error("PUBLIC_KEY_NOT_STRING");
  }

  const normalized = pemString.replace(/\\n/g, "\n").trim();

  return crypto.createPublicKey({
    key: normalized,
    format: "pem",
    type: "spki",
  });
}

function canonicalizeVotePayload(votePayload) {
  return {
    votes: [...votePayload.votes]
      .sort((a, b) => a.product_id.localeCompare(b.product_id))
      .map((v) => ({
        product_id: v.product_id,
        approve: v.approve,
        reason: v.reason,
      })),
  };
}

const signVotePayload = async (votePayload) => {
  const canonicalPayload = canonicalizeVotePayload(votePayload);

  const payloadJson = JSON.stringify(canonicalPayload);

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(payloadJson, "utf8");
  signer.end();

  return signer.sign(KeyStore.getPrivateKey(), "base64");
};

function verifyVotePayload(canonicalPayload, signature, publicKeyPem) {
  const payloadJson = JSON.stringify(canonicalPayload);
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(payloadJson, "utf8");
  verifier.end();
  const publicKey = publicKeyFromDb(publicKeyPem);
  return verifier.verify(publicKey, signature, "base64");
}

export default {
  genId,
  validCheckID,
  RouteGroup,
  waitRpc,
  publicKeyFromDb,
  canonicalizeVotePayload,
  signVotePayload,
  verifyVotePayload,
};
