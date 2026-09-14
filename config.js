// API base URL. Points at a local backend during development, and the
// deployed Render service in production. Update PROD_API_BASE once the
// backend is deployed on Render.
(function () {
  const isLocal = ["localhost", "127.0.0.1"].includes(location.hostname);
  const PROD_API_BASE = "https://business-assistant-api.onrender.com/api";
  const LOCAL_API_BASE = "http://localhost:4000/api";
  window.API_BASE = isLocal ? LOCAL_API_BASE : PROD_API_BASE;
})();
