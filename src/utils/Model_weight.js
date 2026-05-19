export const SENSITIVE_WEIGHTS = {
  // 1. Giao dịch & Thanh toán (Cực kỳ nhạy cảm)
  payment_sessions: {
    amount_expected: 1.0,
    amount_actual: 1.0,
    payment_code: 1.0,
    status: 0.7,
    chain_status: 0.7,
    receiver_id: 0.7,
  },

  product_batch: {
    quantity: 1.0,
    total_price: 1.0,
    total_weight: 1.0,
    expiry_date: 1.0,
    QC_Pass: 1.0,
    QC_Failed: 1.0,
    status: 0.8,
    Shiping_status: 0.8,
    payment_status: 0.8,
    manufacture_date: 0.7,
    qc_staff_id: 0.7,
    total_pallet: 0.7,
  },

  shipping_order: {
    total_ship_price: 1.0,
    product_total_price: 1.0,
    debt: 1.0,
    blockchain_tx: 1.0,
    digital_signatures: 1.0,
    total_weight: 1.0,
    status: 0.8,
    onchain_status: 0.8,
    sender_confirm: 0.7,
    receiver_confirm: 0.7,
    transporter_confirm: 0.7,
    target_lat: 0.7,
    target_lng: 0.7,
  },

  Company_Collaboration: {
    nda_hash: 1.0,
    digital_signatures: 1.0,
    blockchain_tx: 1.0,
    status: 0.8,
    onchain_status: 0.8,
    sender_id: 0.7,
    receiver_id: 0.7,
  },

  Actor_model: {
    password: 1.0,
    public_key: 1.0,
    personal_tax_code: 1.0,
    email: 0.9,
    phone_number: 0.8,
    role: 0.8,
    status: 0.8,
  },

  // 6. Sản phẩm gốc
  Product: {
    price: 1.0,
    weight: 1.0,
    stock_quantity: 1.0,
    status: 0.7,
    author: 0.7,
    chain_status: 0.7,
  },

  Vehicle: {
    plate_number: 0.8,
    capacity: 0.8,
    vin_number: 0.8,
    status: 0.7,
    driver_id: 0.7,
    order_now: 0.7,
  },

  shipping_price_config: {
    container_base_price: 1.0,
    tanker_base_price: 1.0,
    tax_percent: 1.0,
    fuel_surcharge_percent: 0.9,
    active: 0.7,
  },

  Global_Node: {
    global_height: 1.0,
    canonical_block_hash: 1.0,
    previous_block_hash: 1.0,
    network_status: 1.0,
  },
  peer_map: {
    public_key: 1.0,
    initial_signature: 1.0,
    address_ip: 0.9,
    port: 0.9,
    role: 0.8,
    status: 0.8,
  },

  // 2. Pháp lý & Kiểm định (Chứng cứ On-chain)
  ContractTemplate: {
    content_html: 1.0,
    content_hash: 1.0,
    is_active: 0.8,
    version: 0.5,
  },
  InspectionReports: {
    inspection_status: 1.0,
    blockchain_hash: 1.0,
    report_file_url: 0.9,
    inspector_id: 0.8,
  },
  QrRegistry: {
    secure_token: 1.0,
    blockchain_proof: 1.0,
    status: 0.8,
    print_status: 0.7,
    print_count: 0.6,
  },

  // 3. Thông tin thực thể Doanh nghiệp (Địa định & Pháp lý)
  // Áp dụng chung cho Manufacturer, Retailer, Transporter
  Company_Entities: {
    tax_code: 1.0,
    license_number: 1.0,
    latitude: 0.9,
    longitude: 0.9, // Cốt lõi của Geofence
    status: 0.8,
    chain_status: 0.8,
    production_capacity: 0.7,
  },

  // 4. Quản lý nội bộ & Đội xe
  Department: {
    role_level: 0.8,
    isExcute: 0.7,
    isRead: 0.7,
    active: 0.7,
    leader_id: 0.7,
  },
  Fleet_Vehicle: {
    vehicle_id: 0.7,
    fleet_id: 0.7,
    status: 0.7,
  },

  Admin_active_history: {
    OTP: 1.0,
    challenge_code: 1.0,
    status: 0.9,
    type: 0.8,
    node_target_address: 0.8,
  },
  Company_account_level: {
    role_level: 1.0,
    isExcute: 0.9,
    status: 0.8,
    isRead: 0.7,
    Department: 0.7,
  },
  CompanyMailConfig: {
    smtp_password_encrypted: 1.0,
    smtp_host: 0.9,
    smtp_username: 0.8,
    is_active: 0.7,
  },

  // 2. Hợp tác & Hợp đồng (Pháp lý Blockchain)
  Company_Collaboration: {
    nda_hash: 1.0,
    digital_signatures: 1.0,
    blockchain_tx: 1.0,
    status: 0.9,
    contract_id: 0.8,
    onchain_status: 0.8,
  },
  Distributor_Transporter: {
    contract_code: 0.9,
    status: 0.9,
    contract_start: 0.7,
    contract_end: 0.7,
  },

  // 3. Vận hành & Tài chính đội xe
  Fleet: {
    monthly_budget: 1.0,
    manager_id: 0.8,
    status: 0.7,
    fuel_norm_average: 0.6,
  },

  // 4. Chính sách & Thị trường
  Company_Policy: {
    content: 0.9,
    pdf_file_url: 0.8,
    is_active: 0.7,
  },

  ProductionStaff: {
    status: 1.0,
    role: 1.0,
    actor_id: 1.0,
    banking_code: 1.0,
    Company_id: 1.0,
    CCCD: 0.9,
    contract_file: 0.9,

    email: 0.8,
    department_id: 0.8,
    banking_brand: 0.7,
    phonenumber: 0.6,
    profile_file: 0.6,

    name: 0.4,
    address: 0.3,
    avatar: 0.2,
  },

  Company_market_info: {
    is_active_market: 0.7,
    is_oem_ready: 0.7,
    rating_avg: 0.5,
  },
};
