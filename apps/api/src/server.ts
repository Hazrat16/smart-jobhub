import dotenv from "dotenv";
import mongoose from "mongoose";
import app from "./app.js";

dotenv.config();

const startServer = async () => {
  try {
    console.log("Server starting...");
    const PORT = process.env["PORT"] || 5001;
    const MONGO_URI = process.env["MONGO_URI"];

    if (!MONGO_URI) throw new Error("❌ MONGO_URI is missing from .env");

    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Top-level startup error:", err);
    process.exit(1); // Exit with failure
  }
};

startServer();
