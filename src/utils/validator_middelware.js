const checkNodeActive = (db) => async (req, res, next) => {
  try {
    const node = await db.Node_info.findOne();

    if (!node) {
      return res.status(404).json({
        RM: "Node info not found!",
        RC: -203,
      });
    }

    if (node.status !== "active") {
      return res.status(200).json({
        RM: "Node is not active",
        RC: -403,
      });
    }

    next();
  } catch (error) {
    console.error("checkNodeActive ERROR:", error);
    return res.status(500).json({
      RM: "Internal server",
      RC: 500,
    });
  }
};

export default {
  checkNodeActive,
};
