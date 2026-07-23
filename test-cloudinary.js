// test-cloudinary.js
require("dotenv").config();
const cloudinary = require("cloudinary").v2;

// Check if CLOUDINARY_URL exists in .env
if (!process.env.CLOUDINARY_URL) {
  console.error("❌ CLOUDINARY_URL not found in .env file.");
  console.log("Please add it like this:");
  console.log("CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME");
  process.exit(1);
}

async function testCloudinary() {
  try {
    console.log("📤 Uploading test image to Cloudinary...");

    // Upload a public sample image (no local file needed!)
    const result = await cloudinary.uploader.upload(
      "https://res.cloudinary.com/demo/image/upload/sample.jpg",
      {
        public_id: "test_connectivity_check",
        folder: "test_folder", // Optional: test folder creation
      }
    );

    console.log("✅ Cloudinary is working!");
    console.log("📸 Image URL:", result.secure_url);
    console.log("🆔 Public ID:", result.public_id);
    console.log("📁 Folder:", result.folder || "root");

    // Optional: Delete the test image
    await cloudinary.uploader.destroy(result.public_id);
    console.log("🧹 Test image cleaned up.");

  } catch (error) {
    console.error("❌ Cloudinary test failed:");
    console.error("Error message:", error.message);

    // Common error explanations
    if (error.message.includes("Invalid signature")) {
      console.log("🔑 Fix: Your API Key or API Secret is wrong.");
      console.log("   Check your CLOUDINARY_URL in .env");
    } else if (error.message.includes("Invalid cloud name")) {
      console.log("☁️ Fix: Your cloud name is wrong.");
      console.log("   Check your CLOUDINARY_URL format: cloudinary://KEY:SECRET@CLOUD_NAME");
    } else if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
      console.log("🌐 Fix: Network issue. Check your internet connection.");
    } else if (error.message.includes("Missing required parameter")) {
      console.log("📝 Fix: Upload parameters are missing. Check the upload call.");
    }
  }
}

testCloudinary();