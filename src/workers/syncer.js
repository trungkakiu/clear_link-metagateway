import { parentPort, workerData } from "worker_threads";

parentPort.postMessage(`Sync thread khởi chạy cho node ${workerData.nodeId}`);

setInterval(() => {
  parentPort.postMessage(
    `Đồng bộ với ${workerData.peers.length} peers: ${workerData.peers.join(
      ", "
    )}`
  );
}, workerData.interval || 15000);
