import { parentPort, workerData } from "worker_threads";

parentPort.postMessage(
  `Validator thread khởi chạy cho node ${workerData.nodeId}`
);

setInterval(() => {
  const txId = Math.random().toString(36).slice(2);
  parentPort.postMessage(`Đang xác thực transaction ${txId}...`);
}, 5000);
