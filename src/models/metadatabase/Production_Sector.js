export default (sequelize, DataTypes) => {
  const Production_Sector = sequelize.define(
    "Production_Sector",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      key: {
        type: DataTypes.STRING,
        unique: true,
      },
      icon: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      color: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Production_Sectors",
      timestamps: false,
    },
  );

  Production_Sector.associate = (models) => {
    Production_Sector.belongsToMany(models.Manufacturer, {
      through: "Company_Sector",
      constraints: false,
      foreignKey: "sector_id",
      otherKey: "company_id",
      as: "manufacturers",
    });
    Production_Sector.belongsToMany(models.Distributor, {
      through: "Company_Sector",
      foreignKey: "sector_id",
      constraints: false,
      otherKey: "company_id",
      as: "distributors",
    });
    Production_Sector.belongsToMany(models.Retailer, {
      through: "Company_Sector",
      foreignKey: "sector_id",
      constraints: false,
      otherKey: "company_id",
      as: "retailers",
    });
    Production_Sector.belongsToMany(models.Transporter, {
      through: "Company_Sector",
      foreignKey: "sector_id",
      otherKey: "company_id",
      constraints: false,
      as: "transporters",
    });
  };

  return Production_Sector;
};
