// utils/imageUrl.js
// pdfkit can only draw JPEG and PNG, but schools upload photos in any format (WebP, GIF, SVG, ...).
// Cloudinary can convert on the fly by adding a transformation to the image URL, so for the report
// card we ask for a JPEG (photos) or PNG (logos and signatures, which can be transparent).
//
//   https://res.cloudinary.com/demo/image/upload/v123/students/abc.webp
//   -> https://res.cloudinary.com/demo/image/upload/f_jpg,q_auto,c_fill,g_face,w_300,h_360/v123/students/abc.webp
//
// Any other URL (not Cloudinary) is returned unchanged.

const TRANSFORMS = {
  // passport-style portrait, centred on the face, small enough to keep a class PDF light
  photo: "f_jpg,q_auto,c_fill,g_face,w_300,h_360",
  // logos / signatures keep their transparency and are never cropped
  logo: "f_png,c_limit,w_500",
};

const isCloudinaryImage = (url) =>
  typeof url === "string" && /^https?:\/\/res\.cloudinary\.com\//i.test(url) && url.includes("/image/upload/");

const pdfImageUrl = (url, kind = "photo") => {
  if (!isCloudinaryImage(url)) return url;
  const transform = TRANSFORMS[kind] || TRANSFORMS.photo;
  if (url.includes(`/upload/${transform}/`)) return url;   // already converted
  return url.replace("/image/upload/", `/image/upload/${transform}/`);
};

module.exports = { pdfImageUrl, isCloudinaryImage, TRANSFORMS };
