import express from "express";
import meta_controller from "../core/metadata_core/meta_controller.js";
import JwtVetify from "../utils/JwtVetify.js";
import db from "../models/metadatabase/index.js";
import meta_core_controller from "../core/metadata_core/meta_core_controller.js";
import productUpload from "../core/meta_image_controller.js/productUpload.js";
import Helper__funtion from "../utils/Helper__funtion.js";
import passport from "passport";
import meta_ws_controller from "../core/metadata_core/meta_ws_controller.js";
import JwtAction from "../utils/JwtAction.js";
import staff_manufacture_upload from "../core/meta_image_controller.js/staff_manufacture_upload.js";
import Company_infoPR_upload from "../core/meta_image_controller.js/Company_infoPR_upload.js";
import policy_fileupload from "../core/meta_image_controller.js/policy_fileupload.js";
import certificates_competence_upload from "../core/meta_image_controller.js/certificates_competence_upload.js";
import Contract_upload from "../core/meta_image_controller.js/Contract_upload.js";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import User_avatar_upload from "../core/meta_image_controller.js/User_avatar_upload.js";
import OEMtoturial_upload from "../core/meta_image_controller.js/OEMtoturial_upload.js";
import Company_logo_upload from "../core/meta_image_controller.js/Company_logo_upload.js";
import upload_vehicle_image from "../core/meta_image_controller.js/upload_vehicle_image.js";
import meta_bank_controller from "../core/metadata_core/meta_bank_controller.js";
import meta_user_controller from "../core/metadata_core/meta_user_controller.js";
import meta_storage_controller from "../core/metadata_core/meta_storage_controller.js";
import box_upload from "../core/meta_image_controller.js/box_upload.js";
import compnay_kyc_upload from "../core/meta_image_controller.js/compnay_kyc_upload.js";
import company_qr_upload from "../core/meta_image_controller.js/company_qr_upload.js";

const DefaultGateway = (app, nodes) => {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const POLICY_DIR = path.resolve(__dirname, "../../Access/Temp");

    if (!fs.existsSync(POLICY_DIR)) {
      fs.mkdirSync(POLICY_DIR, { recursive: true });
    }

    const mainRouter = express.Router();
    const adminRouter = express.Router();

    const storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, POLICY_DIR);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(
          null,
          file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
        );
      },
    });

    const upload = multer({ storage: storage });

    Helper__funtion.RouteGroup(mainRouter, [], (r) => {
      r.get(
        "/clearlink/traceability/:batch_id",
        meta_core_controller.ProductionTraceLine(db, nodes),
      );
      r.get(
        "/auth/google",
        passport.authenticate("google", {
          scope: ["profile", "email"],
          session: false,
        }),
      );
      r.post(
        "/seapay/payment/order",
        Helper__funtion.seapayHeaderCode(),
        meta_bank_controller.handleSePayWebhook(db),
      );
      r.get(
        "/auth/google/callback",
        passport.authenticate("google", {
          session: false,
          failureRedirect: "/auth/google/fail",
        }),
        (req, res) => {
          const token = JwtAction.JwtSign({
            id: req.user.id,
            email: req.user.email,
            name: req.user.name,
            role: req.user.role,
          });
          res.redirect(`${process.env.FRONTEND_URL}/oauth?token=${token}`);
        },
      );
      r.get("/auth/google/fail", (req, res) =>
        res.status(401).send("GOOGLE AUTH FAILED"),
      );
      r.get("/status", (req, res) =>
        res.status(200).json({ message: "API is running" }),
      );
      r.post("/user/authen/register", meta_controller.RegisterActive);
      r.post("/user_authen/authen/login", meta_controller.userLogin);

      r.post(
        "/user-authen/auth/node-setup-login",
        meta_controller.user_setup_login(db),
      );
    });

    Helper__funtion.RouteGroup(adminRouter, [], (r) => {
      r.get(
        "/public/node-infomation/detail/:node_id",
        meta_core_controller.getNodeInfomation(nodes, db),
      );
      r.post(
        "/company/kyc-verify",
        meta_core_controller.verify_company_wallet(db),
      );
      r.get(
        "/public/base-node-infomation/detail/:node_id",
        meta_ws_controller.getNodeBaseInfomation(nodes, db),
      );
      r.get(
        "/authen/company-control/:type/:page/:limit/:status",
        meta_core_controller.getAdminCompanyInfo(db),
      );
      r.get(
        "/company/kyc-pending/:page/:limit",
        meta_core_controller.getekycWallet(db),
      );
      r.post(
        "/company/change-status",
        meta_core_controller.changeStatusCompany(db),
      );
      r.post("/authen/login", meta_controller.AdminLoginActive);
    });

    Helper__funtion.RouteGroup(mainRouter, [JwtVetify.verifyToken(db)], (r) => {
      r.post(
        "/user/avatar-upload",
        User_avatar_upload.single("avatar_file"),
        meta_core_controller.user_uploadavatar(db),
      );

      r.post(
        "/user/company-control/notification/:notification_id/mark-as-read",
        meta_core_controller.markNotificationAsRead(db),
      );

      // PUT - Cần modelName "Actor_model"
      r.put(
        "/user/infomation_update/:User_id",
        Helper__funtion.AIdataCollection(db, "Actor_model"),
        meta_controller.user_edit_profile(db),
      );

      // GET - Bắt hành vi dò tìm bộ lọc nâng cao
      r.get(
        "/user/get-shiping-order/filter",
        Helper__funtion.AIdataCollection(db),
        meta_controller.get_shiping_oder_filer(db),
      );

      r.get("/user/me", meta_controller.getMe(db));

      r.get(
        "/user/get-dashboard/:user_id",
        meta_core_controller.get_dashboard(db),
      );
      r.post(
        "/user/scanpdf",
        upload.single("pdf_file"),
        Helper__funtion.scanPdfToHtmlApi(db),
      );

      r.get(
        "/user/manufacturer-control/product/list",
        meta_core_controller.getUserProductList(db),
      );

      r.get(
        "/user/manufacturer-control/valid/product/list",
        meta_core_controller.getValidProduct(db),
      );
      r.get(
        "/user/manufacturer-control/get-departments",
        meta_core_controller.getDepartmentsBatch(db),
      );
      r.get(
        "/user/manufacturer-control/valid/department/production/list",
        meta_core_controller.getValidDepartment(db),
      );
      r.get(
        "/user/manufacturer-control/valid/OEM-department/production/list",
        meta_core_controller.getValidOEMDepartment(db),
      );

      r.get(
        "/user/company-control/notification/all",
        meta_core_controller.getNotification(db),
      );
      r.post(
        "/user/company-control/notification/mark-all-as-read",
        meta_core_controller.markAllNotificationsAsRead(db),
      );

      r.post("/user/authen/verify-user-otp", meta_controller.checkUserOTP());
      r.post("/authen/create-otp-admin", meta_controller.createAdminOTP);
      r.post("/user_authen/authen/logout", meta_controller.userLogout);
      r.post("/user/regis/role", meta_controller.create_pending_profile);
      r.post(
        "/user_requset/support/mail",
        meta_controller.mailResendPendingUser(db),
      );
      r.post(
        "/user/authen/create-otp",
        meta_controller.genPublickey(db, nodes),
      );

      // POST - Cảnh báo tạo Node
      r.post(
        "/node/create-info/infomation",
        Helper__funtion.AIdataCollection(db),
        meta_core_controller.create_nodeinfo(db),
      );

      // POST - Cảnh báo đổi trạng thái hàng loạt
      r.post(
        "/user/manufacturer-control/update/batch/state",
        Helper__funtion.AIdataCollection(db),
        meta_core_controller.updateBatchState(db),
      );
      r.post(
        "/user/authen/drop-block/:cate_id",
        meta_controller.changeActiveCate(db),
      );

      // GET - Theo dõi nhân viên cào dữ liệu lô hàng chi tiết
      r.get(
        "/user/distributor/order/batch/:batch_id",
        Helper__funtion.userligit(db),
        Helper__funtion.AIdataCollection(db),
        meta_controller.get_batch_detail(db),
      );
    });

    Helper__funtion.RouteGroup(
      mainRouter,
      [
        JwtVetify.verifyToken(db),
        Helper__funtion.userligit(db),
        Helper__funtion.levellimit(1),
      ],
      (r) => {
        r.post(
          "/user/shipper/order/start",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.StartShip(db),
        );

        r.post(
          "/user/shipper/order/arrvied",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.ArrivedShip(db),
        );
        r.post(
          "/user/auth/fcm_token",
          meta_user_controller.userUpdatefcm_token(db),
        );
        r.get(
          "/user/shipper/location/:order_id",
          meta_core_controller.getShipperLocation(db),
        );
        r.post(
          "/user/shipper/update/postition/update",
          meta_user_controller.updatePos(db),
        );
        r.get(
          "/user/order/shipping/dashboard/get",
          meta_user_controller.getUserDashbroad(db),
        );
      },
    );

    Helper__funtion.RouteGroup(
      mainRouter,
      [
        JwtVetify.verifyToken(db),
        Helper__funtion.userligit(db),
        Helper__funtion.levellimit(3),
      ],
      (r) => {
        r.get(
          "/user/distributor/storage/version/get",
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.getPhysicalInventory(db),
        );
        r.post(
          "/user/warehouse/putaway_task/:ship_id",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db, "Putaway_Tasks"),
          meta_storage_controller.putawaytask(db),
        );
        r.get(
          "/user/control/get-daily-log",
          meta_user_controller.getRecentLogs(db),
        );
        // POST - Chất hàng
        r.post(
          "/user/sender/shipping/:shipping_id/intruck",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.truckInBatch(db),
        );
        // GET - Theo dõi soi dữ liệu Kho
        r.get(
          "/user/company/warehouse/get-infomation",
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.getFullWarehouse(db),
        );
        // POST - Tạo kho bãi
        r.post(
          "/user/company/warehouse/create-warehouse",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.createWarehouse(db),
        );
        r.post(
          "/user/company/warehouse/create-warezone",
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.addZone(db),
        );
        r.post(
          "/user/company/warehouse/create-racks",
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.addRack(db),
        );
        r.post(
          "/user/company/warehouse/confirm-putaway/:ship_id",
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.confirmPutaway(db),
        );
        // POST - Nhận hàng / Trả hàng
        r.post(
          "/user/transporter/shipping/:shipping_id/received-confirm",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.truckInConfirm(db),
        );
        r.post(
          "/user/reciver/shipping/:shipping_id/reciver-confirm",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.receiverConfirm(db),
        );
        r.post(
          "/user/shipping/out/:shipping_id/shiping-confirm",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.shipingComplete(db),
        );
        // POST - Xác thực QR
        r.post(
          "/user/qr/batch/:User_id/verify",
          Helper__funtion.AIdataCollection(db),
          meta_controller.QR_batchverify(db),
        );
        // POST - Nhập kiểm định QC
        r.post(
          "/user/product-batch/QC-checking/result",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.Qcresult(db),
        );
        // POST - Ghi raw data
        r.post(
          "/user/product/raw-data",
          Helper__funtion.AIdataCollection(db),
          meta_controller.createRawProduct(db),
        );

        r.put(
          "/user/company/product-batches/update/:batch_id/:quantity",
          Helper__funtion.AIdataCollection(db, "product_batch"),
          meta_core_controller.updateBatchQuantityApi(db),
        );
        r.get(
          "/user/pinner_production/get",
          meta_core_controller.fecthOEMproduction(db),
        );
        r.get(
          "/user/manufacturer-control/qc-ready/batches",
          meta_core_controller.getQCReadyBatches(db),
        );
      },
    );

    Helper__funtion.RouteGroup(
      mainRouter,
      [
        JwtVetify.verifyToken(db),
        Helper__funtion.userligit(db),
        Helper__funtion.levellimit(4),
      ],
      (r) => {
        // POST - Ký hợp đồng
        r.post(
          "/user/order/:order_id/accept-and-sign",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.AcceptAndSignOrder(db),
        );

        r.post(
          "/user/wallet/create-bank-verify",
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.genQrforverifywallet(db),
        );

        r.post(
          "/user/wallet/upload-kyc-proof",
          compnay_kyc_upload.single("kyc_image"),
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.WalletkycUpload(db),
        );

        r.post(
          "/user/wallet/upload-QRcode",
          company_qr_upload.single("QR_file"),
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.QRcodeUpload(db),
        );

        r.post(
          "/user/company/bank-account/verify",
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.lookupBankAccount(db),
        );
        r.get(
          "/user/company/wallet/info",
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.getWalletInfo(db),
        );
        r.put(
          "/user/distributor/production/newprice",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db, "Company_Price_Catalog"),
          meta_storage_controller.updatePriceCatalog(db),
        );

        r.post(
          "/user/company/wallet/create",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.createWallet(db),
        );

        r.put(
          "/user/distributor/production/newStatus",
          Helper__funtion.AIdataCollection(db, "Company_Price_Catalog"),
          meta_storage_controller.updateStatusCatalog(db),
        );

        r.get(
          "/User/shiping/proccess/pushtask/:ship_id",
          Helper__funtion.AIdataCollection(db),
          meta_storage_controller.getPutawayPlan(db),
        );
        // POST - QR
        r.post(
          "/user/qr/batch/:User_id/create",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_controller.createQRBatch(db),
        );
        r.post(
          "/user/qr/batch/:User_id/printed",
          Helper__funtion.AIdataCollection(db),
          meta_controller.printedQRBatch(db),
        );
        // GET - Soi thanh toán
        r.get(
          "/user/payment/code/:payment_code/status",
          Helper__funtion.AIdataCollection(db),
          meta_bank_controller.getPeymentStatus(db),
        );

        r.get(
          "/user/manufacturer/fleet/vehicle/list/:type_delivery",
          meta_core_controller.fetchFleetValidApi(db),
        );
        // POST - Đổi xe/Tài xế
        r.post(
          "/user/transporter/vehicle/pin-driver",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.PindDriver(db),
        );
        r.post(
          "/user/categories/create-categories",
          Helper__funtion.AIdataCollection(db),
          meta_controller.createCategories(db),
        );
        r.get(
          "/user/categories/get-categories",
          meta_controller.getCategories(db),
        );
        r.get(
          "/User/shiping/proccess",
          meta_core_controller.getShipingProccess(db),
        );
        r.get(
          "/user/transporter/vehicle/valid/get",
          meta_controller.getValidVehicle(db),
        );
        // POST - Phê duyệt lệnh Ship
        r.post(
          "/user/distributor/shipping/:shipping_id/accept",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.disAcceptShippingOrderApi(db),
        );
        r.post(
          "/user/transporter/shipping/:shipping_id/accept",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.TransAcceptShip(db),
        );
        r.post(
          "/user/sender/shipping/:shipping_id/ready-to-pick",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.senderReadyTopick(db),
        );
        r.post(
          "/User/shiping-order/request",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.sendRequestShiping(db),
        );
        r.get("/user/shiping/info", meta_core_controller.getShipingInfo(db));
        r.get(
          "/user/manufacturer-control/completed/batches",
          meta_core_controller.getCompletedBatches(db),
        );
        r.post(
          "/user/product-batch/complate/bacthed/:batch_id",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.complateBatched(db),
        );
        r.get(
          "/user/transporter/vehicle/fleet",
          meta_core_controller.fetchFleet(db),
        );
        r.post(
          "/user/transporter/vehicle/fleet/new",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.handleCreateFleetAPI(db),
        );
        r.get(
          `/user/transporter/vehicle/getOrphanVehicles`,
          meta_core_controller.getOrphanVehicles(db),
        );
        r.post(
          "/user/transporter/vehicle/upload",
          upload_vehicle_image.fields([
            { name: "vehicle_main_avatar", maxCount: 1 },
            { name: "description_img", maxCount: 15 },
          ]),
          meta_core_controller.upload_vehicle(db),
        );
        r.get(
          `/user/transporter/vehicle/get`,
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.getAllvehicle(db),
        );
        r.post(
          "/user/production/OEM/new",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.newOEMrequest(db),
        );
        r.post(
          "/user/production/order/new",
          Helper__funtion.userligit(db),
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.newOrderrequest(db),
        );
        // GET - Soi thông tin công ty
        r.get(
          "/user/company/profile",
          Helper__funtion.AIdataCollection(db),
          meta_controller.CompanyProfile(db),
        );
        r.post(
          "/user/product-batch/OEM-accepting",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.AcceptingOrder(db),
        );
        r.put(
          "/user/company-profile/edit",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db, "company"),
          Company_logo_upload.single("logo_file"),
          meta_controller.editCompany(db),
        );

        r.put(
          "/user/production/:product_id/edit",
          Helper__funtion.AIdataCollection(db, "Product"),
          OEMtoturial_upload.single("OEM_file"),
          meta_core_controller.editProduct(db),
        );
        r.post(
          "/user/create-department",
          Helper__funtion.AIdataCollection(db),
          meta_controller.createDepartment(db),
        );
        // Mặc dù là POST nhưng logic là Edit nên truyền "Department"
        r.post(
          "/user/Edit-department/:part_id",
          Helper__funtion.AIdataCollection(db, "Department"),
          meta_controller.editDepartment(db),
        );
        r.post(
          "/user/company-control/contract/contract-preview/:proposal_id/send",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.sendContract(db),
        );
        r.post(
          "/user/company-control/contract/accept-contract-preview/:proposal_id/send",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.AcceptsendContract(db),
        );
        r.post(
          "/user/company-control/contract/sign-contract/:proposal_id/send",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.signContract(db),
        );
        r.post(
          "/user/company-control/contract/reject-contract-preview/:proposal_id/send",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.RejectsendContract(db),
        );
        // PUT - CẦN MODEL "ProductionStaff"
        r.put(
          "/user/change-staffdepartment/:staff_id",
          Helper__funtion.AIdataCollection(db, "ProductionStaff"),
          meta_controller.changestaffpartment(db),
        );
        r.post(
          "/user/create-productionstaff",
          Helper__funtion.AIdataCollection(db),
          meta_controller.createProductionStaff(db),
        );
        r.post(
          "/user/create-technicalstaff",
          Helper__funtion.AIdataCollection(db),
          meta_controller.createTechnicaltaff(db),
        );
        r.post(
          "/user/company-control/Contract-management/new-Contract",
          Contract_upload.single("pdf_file"),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.createContractTemplate(db),
        );
        // PUT - CẦN MODEL "Department"
        r.put(
          "/user/leader-post-new/:department_id",
          Helper__funtion.AIdataCollection(db, "Department"),
          meta_controller.newLeaderDepartment(db),
        );
        r.get("/user/get_department_list", meta_controller.getDepartment(db));
        // GET - Theo dõi nhân sự tải hợp đồng mẫu
        r.get(
          "/user/company-control/Contract-management/Contract",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.getContract(db),
        );
        r.get(
          "/user/get-productionstaff",
          meta_controller.getProductionstaff(db),
        );
        r.get("/user/get-staff", meta_controller.getstaff(db));

        r.get("/user/get-technicalstaff", meta_controller.getTechnicaltaff(db));

        r.post(
          "/user/manufacturer-control/create/batch",
          Helper__funtion.AIdataCollection(db, "product_batch"),
          meta_core_controller.createBatch(db),
        );
        r.get("/user/company/batch/getbox", meta_core_controller.getBox(db));
        r.post(
          "/user/company/batch/create-box",
          Helper__funtion.checkuserchallengecode(db),
          box_upload.fields([
            { name: "image_printer", maxCount: 1 },
            {
              name: "decription_image",
              maxCount: 1,
            },
          ]),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.createBox(db),
        );
        r.get(
          "/user/company/ProposalProduct",
          Helper__funtion.userligit(db),
          meta_core_controller.getProposalProduct(db),
        );
        r.post(
          "/user/post-main-card/:staff_id",
          staff_manufacture_upload.fields([
            { name: "staff_card", maxCount: 1 },
          ]),
          Helper__funtion.AIdataCollection(db, "ProductionStaff"),
          meta_controller.uploadstaffcard(db),
        );
        r.post(
          "/user/manufacturer-control/addnew/product",
          productUpload.fields([
            { name: "main_cardimage", maxCount: 1 },
            { name: "sub_images", maxCount: 20 },
          ]),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.product_upload(db),
        );

        r.put(
          "/user/manufacturer/batch/reupdate/:batchId",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db, "product_batch"),
          meta_core_controller.reupdateBatch(db),
        );
        r.get(
          "/user/company-control/contact/requests",
          meta_core_controller.fetchCollaborationProposals(db),
        );
      },
    );

    Helper__funtion.RouteGroup(
      mainRouter,
      [
        JwtVetify.verifyToken(db),
        Helper__funtion.userligit(db),
        Helper__funtion.levellimit(5),
      ],
      (r) => {
        r.post(
          "/user/transporter/set-price",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.set_new_shipping(db),
        );

        r.get(
          "/User/transporter/price-config/get",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.getTransporterPrice(db),
        );

        r.put(
          "/user/company-control/contact/cancal_proposal/:proposal_id/request",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db, "Company_Collaboration"),
          meta_core_controller.cancelProposal(db),
        );
        r.post(
          "/user/company-control/contract/accept_proposal/:proposal_id/request",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.acceptProposal(db),
        );
        // PUT - CẦN MODEL "Company_Collaboration"
        r.put(
          "/user/company-control/contact/reject_proposal/:proposal_id/request",
          Helper__funtion.checkuserchallengecode(db),
          Helper__funtion.AIdataCollection(db, "Company_Collaboration"),
          meta_core_controller.RejectProposal(db),
        );
        r.get(
          "/user/company-control/internal-marketplace/info",
          meta_core_controller.getInternalMarketInfo(db),
        );
        r.get(
          "/user/company-control/policay-management/policy",
          meta_core_controller.getCompanyPolicy(db),
        );

        r.post(
          "/user/company-control/policay-management/new-policy",
          policy_fileupload.single("pdf_file"),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.newPolicy(db),
        );

        r.post(
          "/user/authen/drop-block/:type/:block_id",
          JwtVetify.RequireOTP(db),
          Helper__funtion.AIdataCollection(db),
          meta_controller.dropUserBlock(db),
        );

        r.post(
          "/user/company-control/contact-management/new-proposal",
          certificates_competence_upload.single("attached_file"),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.new_proposal(db),
        );
        r.post(
          "/user/company-control/internal-marketplace/newinfo",
          Company_infoPR_upload.fields([
            { name: "logo", maxCount: 1 },
            { name: "banner", maxCount: 1 },
          ]),
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.newInternalMarketinfo(db),
        );
      },
    );

    Helper__funtion.RouteGroup(
      adminRouter,
      [JwtVetify.verifyToken(db), JwtVetify.isAdmin()],
      (r) => {
        r.post("/authen/send-admin-otp", meta_controller.createAdminOTP);
        r.post(
          "/authen/maintenance-node",
          meta_ws_controller.MaintenanceNode(db, nodes),
        );
        r.post(
          "/node-control/create-admin-node",
          meta_core_controller.create_Admin_node(db),
        );
        r.post("/authen/verify-admin-otp", meta_controller.verifyAdminOTP);
        // Đổi quyền user là hành vi cực kỳ nhạy cảm -> Gắn AI
        r.post(
          "/role/change-stage/:UserStage/:role/:RoleStage",
          Helper__funtion.AIdataCollection(db),
          meta_core_controller.changeStatus_user(db),
        );
        r.post(
          "/settings/update",
          Helper__funtion.AIdataCollection(db, "Setting"), // Update setting cần kiểm tra sai lệch
          meta_controller.updateSetting,
        );
        r.post(
          "/settings/create",
          Helper__funtion.AIdataCollection(db),
          meta_controller.createSetting,
        );

        r.get("/user/get-all", meta_controller.get_user_actor(db));
        r.get(
          "/node-infomation/list",
          meta_core_controller.getAllNodeInfo(nodes, db),
        );
        r.get(
          "/data/get-pending-request",
          meta_core_controller.getPendingRequest(db),
        );
        r.get("/settings/get-all", meta_controller.getAllSettings);
      },
    );

    app.use("/api", mainRouter);
    app.use("/admin", adminRouter);
  } catch (error) {
    console.log("Default Gateway error: ", error);
  }
};

export default DefaultGateway;
