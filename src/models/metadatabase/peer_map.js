export default (sequelize, DataTypes) => {
  const peer_map = sequelize.define(
    "peer_map",
    {
      id: { type: DataTypes.STRING, primaryKey: true },
      full_address: { type: DataTypes.STRING },
      address_ip: { type: DataTypes.STRING },
      port: { type: DataTypes.STRING },
      public_key: { type: DataTypes.TEXT, allowNull: false },
      initial_signature: { type: DataTypes.TEXT },
      node_version: { type: DataTypes.STRING, defaultValue: "1.0.0" },
      agent: { type: DataTypes.STRING },
      is_prime: { type: DataTypes.BOOLEAN, defaultValue: false },
      node_type: { type: DataTypes.STRING },
      role: {
        type: DataTypes.ENUM("validator", "observer"),
        defaultValue: "validator",
      },
      status: {
        type: DataTypes.ENUM("active", "block", "ban", "pending"),
        defaultValue: "pending",
      },
      last_seen: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      health: {
        type: DataTypes.ENUM("ok", "syncing", "fork", "down", "maintenance"),
        defaultValue: "ok",
      },
      Owner_actor: {
        type: DataTypes.STRING,
      },
      current_height: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    {
      tableName: "peer_map",
      timestamps: true,
    }
  );

  return peer_map;
};
