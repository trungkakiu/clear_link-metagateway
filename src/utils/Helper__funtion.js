import express from "express";

const genId = (root = "") => {
  const randomDigits = Math.floor(
    100000000 + Math.random() * 900000000
  ).toString();

  return `${root}${randomDigits}`;
};

const validCheckID = (id, model, option_column) => {
  return model.findOne({ where: { [option_column]: id } });
};

const waitRpc = (pendingRequests, requestId, timeoutMs = 3000) =>
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

export default { genId, validCheckID, RouteGroup, waitRpc };
